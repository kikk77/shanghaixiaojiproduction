/**
 * 勋章系统服务
 * 基于版本A设计：独立管理勋章解锁和分配
 */

class BadgeService {
    constructor() {
        // 使用独立数据库管理器
        const levelDbManager = require('../config/levelDatabase');
        this.levelDb = levelDbManager.getInstance();
        
        // 获取等级服务实例
        this.levelService = null; // 延迟加载避免循环依赖
        
        // 检查是否启用
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
        
        // 缓存配置
        this.badgeCache = new Map();
        this.CACHE_TTL = 10 * 60 * 1000; // 10分钟
    }
    
    /**
     * 延迟加载等级服务
     */
    getLevelService() {
        if (!this.levelService) {
            this.levelService = require('./levelService').getInstance();
        }
        return this.levelService;
    }
    
    /**
     * 检查并解锁勋章
     */
    async checkAndUnlockBadges(userId, groupId, userProfile) {
        if (!this.enabled || !this.levelDb.enabled) return;
        
        try {
            // 获取所有可用勋章定义
            const availableBadges = await this.getAvailableBadges(groupId);
            
            // 获取用户已有勋章
            const userBadges = await this.getUserBadges(userId, groupId);
            const unlockedBadgeIds = new Set(userBadges.map(b => b.badge_id));
            
            // 检查每个勋章的解锁条件
            const newlyUnlocked = [];
            
            for (const badge of availableBadges) {
                if (unlockedBadgeIds.has(badge.badge_id)) continue;
                
                const conditions = JSON.parse(badge.unlock_conditions);
                const isUnlocked = await this.checkUnlockConditions(userProfile, conditions);
                
                if (isUnlocked) {
                    await this.unlockBadge(userId, groupId, badge);
                    newlyUnlocked.push(badge);
                }
            }
            
            // 如果有新解锁的勋章，发送通知
            if (newlyUnlocked.length > 0) {
                await this.notifyBadgeUnlock(userId, groupId, newlyUnlocked);
            }
            
            return newlyUnlocked;
            
        } catch (error) {
            console.error('检查勋章解锁失败:', error);
            return [];
        }
    }
    
    /**
     * 获取群组可用勋章
     */
    async getAvailableBadges(groupId) {
        const cacheKey = `badges_${groupId}`;
        
        // 检查缓存
        const cached = this.badgeCache.get(cacheKey);
        if (cached && cached.expiry > Date.now()) {
            return cached.data;
        }
        
        const db = this.levelDb.getDatabase();
        if (!db) return [];
        
        try {
            const stmt = db.prepare(`
                SELECT * FROM badge_definitions 
                WHERE (group_id = ? OR group_id = 'default') 
                AND status = 'active'
                ORDER BY rarity ASC, badge_id ASC
            `);
            const badges = stmt.all(groupId);
            
            // 缓存结果
            this.badgeCache.set(cacheKey, {
                data: badges,
                expiry: Date.now() + this.CACHE_TTL
            });
            
            return badges;
        } catch (error) {
            console.error('获取勋章定义失败:', error);
            return [];
        }
    }
    
    /**
     * 获取用户勋章
     */
    async getUserBadges(userId, groupId) {
        const db = this.levelDb.getDatabase();
        if (!db) return [];
        
        try {
            const stmt = db.prepare(`
                SELECT ub.*, bd.badge_name, bd.badge_emoji, bd.badge_desc, bd.rarity
                FROM user_badges ub
                JOIN badge_definitions bd ON ub.badge_id = bd.badge_id 
                    AND (bd.group_id = ub.group_id OR bd.group_id = 'default')
                WHERE ub.user_id = ? AND ub.group_id = ?
                ORDER BY ub.unlocked_at DESC
            `);
            return stmt.all(userId, groupId);
        } catch (error) {
            console.error('获取用户勋章失败:', error);
            return [];
        }
    }
    
    /**
     * 检查解锁条件
     */
    async checkUnlockConditions(userProfile, conditions) {
        try {
            // 等级条件
            if (conditions.level && userProfile.level < conditions.level) {
                return false;
            }
            
            // 经验值条件
            if (conditions.exp && userProfile.total_exp < conditions.exp) {
                return false;
            }
            
            // 评价次数条件
            if (conditions.evaluations && userProfile.user_eval_count < conditions.evaluations) {
                return false;
            }
            
            // 被评价次数条件
            if (conditions.be_evaluated && userProfile.merchant_eval_count < conditions.be_evaluated) {
                return false;
            }
            
            // 积分条件
            if (conditions.points_earned && userProfile.total_points_earned < conditions.points_earned) {
                return false;
            }
            
            // 特定行为次数条件
            if (conditions.actions) {
                for (const [action, count] of Object.entries(conditions.actions)) {
                    const fieldName = `${action}_count`;
                    if (userProfile[fieldName] < count) {
                        return false;
                    }
                }
            }
            
            // 连续活跃天数（需要额外计算）
            if (conditions.consecutive_days) {
                const consecutiveDays = await this.calculateConsecutiveDays(
                    userProfile.user_id, 
                    userProfile.group_id
                );
                if (consecutiveDays < conditions.consecutive_days) {
                    return false;
                }
            }
            
            // 所有条件都满足
            return true;
            
        } catch (error) {
            console.error('检查解锁条件失败:', error);
            return false;
        }
    }
    
    /**
     * 计算连续活跃天数
     */
    async calculateConsecutiveDays(userId, groupId) {
        const db = this.levelDb.getDatabase();
        if (!db) return 0;
        
        try {
            // 获取最近30天的活动记录
            const stmt = db.prepare(`
                SELECT DISTINCT DATE(timestamp, 'unixepoch') as active_date
                FROM points_log
                WHERE user_id = ? AND group_id = ?
                AND timestamp > ?
                ORDER BY active_date DESC
            `);
            
            const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
            const activeDates = stmt.all(userId, groupId, thirtyDaysAgo);
            
            if (activeDates.length === 0) return 0;
            
            // 计算连续天数
            let consecutiveDays = 1;
            const today = new Date().toISOString().split('T')[0];
            
            // 如果今天没有活动，连续天数为0
            if (activeDates[0].active_date !== today) {
                return 0;
            }
            
            // 从今天开始往前检查
            for (let i = 1; i < activeDates.length; i++) {
                const currentDate = new Date(activeDates[i-1].active_date);
                const prevDate = new Date(activeDates[i].active_date);
                const diffDays = Math.floor((currentDate - prevDate) / (1000 * 60 * 60 * 24));
                
                if (diffDays === 1) {
                    consecutiveDays++;
                } else {
                    break;
                }
            }
            
            return consecutiveDays;
            
        } catch (error) {
            console.error('计算连续天数失败:', error);
            return 0;
        }
    }
    
    /**
     * 解锁勋章
     */
    async unlockBadge(userId, groupId, badge) {
        const db = this.levelDb.getDatabase();
        if (!db) return false;
        
        try {
            const stmt = db.prepare(`
                INSERT INTO user_badges 
                (user_id, group_id, badge_id, unlocked_at)
                VALUES (?, ?, ?, ?)
            `);
            
            stmt.run(userId, groupId, badge.badge_id, Date.now() / 1000);
            
            // 记录成就日志
            const logStmt = db.prepare(`
                INSERT INTO achievement_log
                (user_id, group_id, achievement_type, achievement_id, 
                 achievement_name, achievement_desc)
                VALUES (?, ?, 'badge', ?, ?, ?)
            `);
            
            logStmt.run(
                userId, groupId, badge.badge_id,
                `${badge.badge_emoji} ${badge.badge_name}`,
                badge.badge_desc
            );
            
            return true;
        } catch (error) {
            console.error('解锁勋章失败:', error);
            return false;
        }
    }
    
    /**
     * 通知勋章解锁
     */
    async notifyBadgeUnlock(userId, groupId, badges) {
        try {
            const levelService = this.getLevelService();
            const userInfo = await levelService.getUserDisplayInfo(userId);
            const botService = levelService.botService;
            
            // 构建通知消息
            let message = `🎊 恭喜解锁新勋章！🎊\n\n`;
            message += `🧑‍🚀 ${userInfo.displayName}\n\n`;
            
            for (const badge of badges) {
                message += `${badge.badge_emoji} **${badge.badge_name}**\n`;
                message += `📝 ${badge.badge_desc}\n`;
                message += `💎 稀有度：${this.getRarityDisplay(badge.rarity)}\n\n`;
            }
            
            message += `继续努力，收集更多勋章！🏅`;
            
            // 发送消息
            if (botService.bot) {
                await botService.bot.telegram.sendMessage(groupId, message, {
                    parse_mode: 'Markdown'
                });
            }
            
        } catch (error) {
            console.error('通知勋章解锁失败:', error);
        }
    }
    
    /**
     * 获取稀有度显示
     */
    getRarityDisplay(rarity) {
        const rarityMap = {
            'common': '⚪ 普通',
            'rare': '🔵 稀有',
            'epic': '🟣 史诗',
            'legendary': '🟡 传说',
            'mythic': '🔴 神话'
        };
        return rarityMap[rarity] || '⚪ 普通';
    }
    
    /**
     * 获取用户勋章墙
     */
    async getUserBadgeWall(userId, groupId) {
        try {
            // 获取用户所有勋章
            const userBadges = await this.getUserBadges(userId, groupId);
            
            // 获取所有可用勋章
            const allBadges = await this.getAvailableBadges(groupId);
            
            // 统计信息
            const stats = {
                total: allBadges.length,
                unlocked: userBadges.length,
                percentage: Math.round((userBadges.length / allBadges.length) * 100)
            };
            
            // 按稀有度分组
            const badgesByRarity = {
                mythic: [],
                legendary: [],
                epic: [],
                rare: [],
                common: []
            };
            
            // 标记已解锁的勋章
            const unlockedIds = new Set(userBadges.map(b => b.badge_id));
            
            for (const badge of allBadges) {
                const badgeInfo = {
                    ...badge,
                    unlocked: unlockedIds.has(badge.badge_id),
                    unlocked_at: userBadges.find(b => b.badge_id === badge.badge_id)?.unlocked_at
                };
                
                if (badgesByRarity[badge.rarity]) {
                    badgesByRarity[badge.rarity].push(badgeInfo);
                }
            }
            
            return {
                stats,
                badges: badgesByRarity,
                userBadges
            };
            
        } catch (error) {
            console.error('获取勋章墙失败:', error);
            return null;
        }
    }
    
    /**
     * 手动授予勋章（管理员功能）
     */
    async grantBadge(userId, groupId, badgeId, grantedBy) {
        const db = this.levelDb.getDatabase();
        if (!db) return false;
        
        try {
            // 检查勋章是否存在
            const checkStmt = db.prepare(`
                SELECT * FROM badge_definitions 
                WHERE badge_id = ? 
                AND (group_id = ? OR group_id = 'default')
                AND status = 'active'
            `);
            const badge = checkStmt.get(badgeId, groupId);
            
            if (!badge) {
                throw new Error('勋章不存在');
            }
            
            // 检查是否已拥有
            const hasStmt = db.prepare(`
                SELECT * FROM user_badges 
                WHERE user_id = ? AND group_id = ? AND badge_id = ?
            `);
            const existing = hasStmt.get(userId, groupId, badgeId);
            
            if (existing) {
                throw new Error('用户已拥有该勋章');
            }
            
            // 授予勋章
            await this.unlockBadge(userId, groupId, badge);
            
            // 记录管理员操作
            console.log(`管理员 ${grantedBy} 授予用户 ${userId} 勋章 ${badgeId}`);
            
            return true;
            
        } catch (error) {
            console.error('授予勋章失败:', error);
            return false;
        }
    }
    
    /**
     * 撤销勋章（管理员功能）
     */
    async revokeBadge(userId, groupId, badgeId, revokedBy) {
        const db = this.levelDb.getDatabase();
        if (!db) return false;
        
        try {
            const stmt = db.prepare(`
                DELETE FROM user_badges 
                WHERE user_id = ? AND group_id = ? AND badge_id = ?
            `);
            
            const result = stmt.run(userId, groupId, badgeId);
            
            if (result.changes > 0) {
                console.log(`管理员 ${revokedBy} 撤销用户 ${userId} 勋章 ${badgeId}`);
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('撤销勋章失败:', error);
            return false;
        }
    }
}

// 导出单例
let instance = null;
module.exports = {
    getInstance: () => {
        if (!instance) {
            instance = new BadgeService();
        }
        return instance;
    }
}; 