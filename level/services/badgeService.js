/**
 * 勋章系统服务 - 简化版本：以用户为核心
 * 
 * 设计原则：
 * 1. 用户勋章不依赖群组，以用户ID为核心
 * 2. 勋章定义可以有群组范围，但用户获得勋章时不强制群组
 * 3. 简化勋章检查和解锁逻辑
 */

class BadgeService {
    constructor() {
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
        this.levelDb = null;
        this.initializationError = null;
        
        if (!this.enabled) {
            console.log('🏆 勋章系统已禁用');
            return;
        }
        
        try {
            const levelDbManager = require('../config/levelDatabase');
            this.levelDb = levelDbManager.getInstance();
            
            if (!this.levelDb || !this.levelDb.enabled) {
                throw new Error('等级系统数据库不可用');
            }
        } catch (error) {
            this.initializationError = error;
            this.enabled = false;
            console.error('❌ 勋章系统初始化失败:', error.message);
        }
    }
    
    /**
     * 检查服务是否可用
     */
    isAvailable() {
        return this.enabled && !this.initializationError && this.levelDb && this.levelDb.getDatabase();
    }
    
    /**
     * 安全执行勋章操作
     */
    async safeExecute(operation, ...args) {
        if (!this.isAvailable()) {
            return null;
        }
        
        try {
            return await operation.apply(this, args);
        } catch (error) {
            console.error('勋章系统操作失败:', error);
            // 记录错误但不抛出，确保不影响主系统
            return null;
        }
    }
    
    /**
     * 检查并解锁勋章 - 简化版本：不需要群组ID
     */
    async checkAndUnlockBadges(userId, userProfile) {
        return await this.safeExecute(this._checkAndUnlockBadgesInternal, userId, userProfile);
    }
    
    /**
     * 内部检查并解锁勋章方法
     */
    async _checkAndUnlockBadgesInternal(userId, userProfile) {
        const db = this.levelDb.getDatabase();
        if (!db) return;
        
        // 获取所有可用的勋章定义（包括全局和群组勋章）
        const badgeDefinitions = db.prepare(`
            SELECT * FROM badge_definitions 
            WHERE status = 'active' 
            AND badge_type = 'auto'
            ORDER BY group_id, rarity DESC
        `).all();
        
        if (badgeDefinitions.length === 0) {
            console.log('没有找到可用的勋章定义');
            return;
        }
        
        // 获取用户已有的勋章
        const userBadges = db.prepare(`
            SELECT badge_id FROM user_badges 
            WHERE user_id = ?
        `).all(userId);
        
        const existingBadgeIds = new Set(userBadges.map(b => b.badge_id));
        
        // 检查每个勋章是否满足解锁条件
        for (const badgeDef of badgeDefinitions) {
            // 跳过已解锁的勋章
            if (existingBadgeIds.has(badgeDef.badge_id)) {
                continue;
            }
            
            // 检查解锁条件
            const shouldUnlock = await this.checkUnlockCondition(badgeDef, userProfile);
            
            if (shouldUnlock) {
                await this.unlockBadge(userId, badgeDef.badge_id, 'system', '自动解锁');
                console.log(`🏅 用户 ${userId} 解锁勋章: ${badgeDef.badge_name}`);
            }
        }
    }
    
    /**
     * 检查勋章解锁条件
     */
    async checkUnlockCondition(badgeDef, userProfile) {
        try {
            const conditions = JSON.parse(badgeDef.unlock_conditions);
            
            switch (conditions.type) {
                case 'stat_based':
                    return this.checkStatCondition(conditions, userProfile);
                case 'evaluation_streak':
                    return this.checkEvaluationStreak(conditions, userProfile);
                case 'admin_only':
                    return false; // 管理员专用勋章不能自动解锁
                default:
                    console.log(`未知的勋章条件类型: ${conditions.type}`);
                    return false;
            }
        } catch (error) {
            console.error('检查勋章条件失败:', error);
            return false;
        }
    }
    
    /**
     * 检查统计数据条件
     */
    checkStatCondition(conditions, userProfile) {
        const field = conditions.field;
        const target = conditions.target;
        
        if (!userProfile.hasOwnProperty(field)) {
            console.log(`用户档案中没有字段: ${field}`);
            return false;
        }
        
        const currentValue = userProfile[field];
        return currentValue >= target;
    }
    
    /**
     * 检查评价连击条件（暂时简化实现）
     */
    checkEvaluationStreak(conditions, userProfile) {
        // 简化实现：基于总评价次数
        const evaluationType = conditions.evaluation_type;
        const requiredCount = conditions.count;
        
        let currentCount = 0;
        if (evaluationType === 'merchant_eval') {
            currentCount = userProfile.merchant_eval_count || 0;
        } else if (evaluationType === 'user_eval') {
            currentCount = userProfile.user_eval_count || 0;
        }
        
        return currentCount >= requiredCount;
    }
    
    /**
     * 解锁勋章
     */
    async unlockBadge(userId, badgeId, awardedBy = 'system', reason = '自动解锁') {
        const db = this.levelDb.getDatabase();
        if (!db) return false;
        
        try {
            // 检查是否已经解锁
            const existing = db.prepare(`
                SELECT id FROM user_badges 
                WHERE user_id = ? AND badge_id = ?
            `).get(userId, badgeId);
            
            if (existing) {
                console.log(`用户 ${userId} 已拥有勋章 ${badgeId}`);
                return false;
            }
            
            // 获取勋章定义
            const badgeDef = db.prepare(`
                SELECT * FROM badge_definitions 
                WHERE badge_id = ? AND status = 'active'
                LIMIT 1
            `).get(badgeId);
            
            if (!badgeDef) {
                console.error(`勋章定义不存在: ${badgeId}`);
                return false;
            }
            
            // 插入用户勋章记录
            const insertStmt = db.prepare(`
                INSERT INTO user_badges 
                (user_id, badge_id, awarded_by, awarded_reason)
                VALUES (?, ?, ?, ?)
            `);
            
            insertStmt.run(userId, badgeId, awardedBy, reason);
            
            // 更新用户档案中的勋章列表
            await this.updateUserBadgeList(userId);
            
            // 播报勋章解锁
            await this.broadcastBadgeUnlock(userId, badgeDef);
            
            console.log(`✅ 用户 ${userId} 成功解锁勋章: ${badgeDef.badge_name}`);
            return true;
            
        } catch (error) {
            console.error('解锁勋章失败:', error);
            return false;
        }
    }
    
    /**
     * 更新用户档案中的勋章列表
     */
    async updateUserBadgeList(userId) {
        const db = this.levelDb.getDatabase();
        if (!db) return;
        
        try {
            // 获取用户的所有勋章
            const userBadges = db.prepare(`
                SELECT ub.badge_id, bd.badge_name, bd.badge_emoji, bd.rarity
                FROM user_badges ub
                JOIN badge_definitions bd ON ub.badge_id = bd.badge_id
                WHERE ub.user_id = ?
                ORDER BY ub.awarded_at DESC
            `).all(userId);
            
            // 更新用户档案
            const badgeList = userBadges.map(b => ({
                id: b.badge_id,
                name: b.badge_name,
                emoji: b.badge_emoji,
                rarity: b.rarity
            }));
            
            const updateStmt = db.prepare(`
                UPDATE user_levels 
                SET badges = ?, updated_at = ?
                WHERE user_id = ?
            `);
            
            updateStmt.run(
                JSON.stringify(badgeList),
                Date.now() / 1000,
                userId
            );
            
        } catch (error) {
            console.error('更新用户勋章列表失败:', error);
        }
    }
    
    /**
     * 播报勋章解锁
     */
    async broadcastBadgeUnlock(userId, badgeDef) {
        if (!this.isAvailable()) return;
        
        // 使用异步方式执行播报，确保不会阻塞主流程
        setImmediate(async () => {
            try {
                await this._broadcastBadgeUnlockInternal(userId, badgeDef);
            } catch (error) {
                console.error('勋章解锁播报失败（不影响主系统）:', error);
            }
        });
    }
    
    /**
     * 内部播报勋章解锁方法
     */
    async _broadcastBadgeUnlockInternal(userId, badgeDef) {
        const botService = require('../../services/botService');
        
        // 检查bot服务是否可用
        if (!botService || !botService.bot) {
            console.log('Bot服务不可用，跳过勋章播报');
            return;
        }
        
        // 获取用户信息
        const levelService = require('./levelService').getInstance();
        const userInfo = await levelService.getUserDisplayInfo(userId);
        
        // 构建解锁消息
        const rarityDisplay = this.getRarityDisplay(badgeDef.rarity);
        const message = `🏅 勋章解锁！\n\n` +
            `🧑‍🚀 ${userInfo.displayName}\n` +
            `${badgeDef.badge_emoji} ${badgeDef.badge_name}\n` +
            `${rarityDisplay}\n` +
            `📝 ${badgeDef.badge_desc}\n\n` +
            `恭喜解锁新成就！🎉`;
        
        // 获取播报目标群组
        const targetGroups = await this.getBroadcastTargetGroups();
        
        if (targetGroups.length === 0) {
            console.log('没有配置播报群组，跳过勋章播报');
            return;
        }
        
        // 向所有配置的群组播报
        for (const targetGroupId of targetGroups) {
            try {
                await botService.bot.telegram.sendMessage(targetGroupId, message, {
                    parse_mode: 'Markdown'
                });
                console.log(`勋章解锁播报成功发送到群组: ${targetGroupId}`);
            } catch (error) {
                console.error(`向群组 ${targetGroupId} 播报勋章解锁失败:`, error);
                // 继续尝试其他群组
            }
        }
    }
    
    /**
     * 获取播报目标群组
     */
    async getBroadcastTargetGroups() {
        const db = this.levelDb.getDatabase();
        if (!db) return [];
        
        try {
            const stmt = db.prepare(`
                SELECT group_id FROM group_configs 
                WHERE status = 'active' 
                AND broadcast_enabled = 1
                AND group_id != 'global'
            `);
            const groups = stmt.all();
            return groups.map(g => g.group_id);
        } catch (error) {
            console.error('获取播报目标群组失败:', error);
            return [];
        }
    }
    
    /**
     * 获取用户勋章墙
     */
    async getUserBadgeWall(userId) {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            // 获取用户已解锁的勋章
            const userBadges = db.prepare(`
                SELECT ub.*, bd.badge_name, bd.badge_emoji, bd.badge_desc, bd.rarity
                FROM user_badges ub
                JOIN badge_definitions bd ON ub.badge_id = bd.badge_id
                WHERE ub.user_id = ?
                ORDER BY ub.awarded_at DESC
            `).all(userId);
            
            // 获取所有可用的勋章定义
            const allBadges = db.prepare(`
                SELECT * FROM badge_definitions 
                WHERE status = 'active'
                ORDER BY rarity DESC, badge_name ASC
            `).all();
            
            // 按稀有度分组
            const badgesByRarity = {
                mythic: [],
                legendary: [],
                epic: [],
                rare: [],
                common: []
            };
            
            const unlockedBadgeIds = new Set(userBadges.map(b => b.badge_id));
            
            for (const badge of allBadges) {
                const rarity = badge.rarity || 'common';
                if (!badgesByRarity[rarity]) {
                    badgesByRarity[rarity] = [];
                }
                
                badgesByRarity[rarity].push({
                    ...badge,
                    unlocked: unlockedBadgeIds.has(badge.badge_id)
                });
            }
            
            // 计算统计信息
            const stats = {
                total: allBadges.length,
                unlocked: userBadges.length,
                percentage: allBadges.length > 0 ? Math.round((userBadges.length / allBadges.length) * 100) : 0
            };
            
            return {
                userBadges: userBadges,
                badges: badgesByRarity,
                stats: stats
            };
            
        } catch (error) {
            console.error('获取用户勋章墙失败:', error);
            return null;
        }
    }
    
    /**
     * 获取稀有度显示
     */
    getRarityDisplay(rarity) {
        const rarityMap = {
            'common': '🟢 普通',
            'rare': '🔵 稀有',
            'epic': '🟣 史诗',
            'legendary': '🟡 传说',
            'mythic': '🔴 神话'
        };
        return rarityMap[rarity] || '⚪ 未知';
    }
    
    /**
     * 管理员手动授予勋章
     */
    async adminGrantBadge(userId, badgeId, adminId, reason = '管理员授予') {
        return await this.unlockBadge(userId, badgeId, `admin:${adminId}`, reason);
    }
    
    /**
     * 获取勋章定义列表
     */
    async getBadgeDefinitions(groupId = 'global') {
        const db = this.levelDb.getDatabase();
        if (!db) return [];
        
        try {
            const stmt = db.prepare(`
                SELECT * FROM badge_definitions 
                WHERE group_id = ? AND status = 'active'
                ORDER BY rarity DESC, badge_name ASC
            `);
            return stmt.all(groupId);
        } catch (error) {
            console.error('获取勋章定义失败:', error);
            return [];
        }
    }
    
    /**
     * 创建勋章定义
     */
    async createBadgeDefinition(badgeData) {
        const db = this.levelDb.getDatabase();
        if (!db) return false;
        
        try {
            const stmt = db.prepare(`
                INSERT INTO badge_definitions 
                (badge_id, group_id, badge_name, badge_emoji, badge_desc, 
                 unlock_conditions, badge_type, rarity, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
            `);
            
            stmt.run(
                badgeData.badge_id,
                badgeData.group_id || 'global',
                badgeData.badge_name,
                badgeData.badge_emoji || '🏆',
                badgeData.badge_desc,
                JSON.stringify(badgeData.unlock_conditions),
                badgeData.badge_type || 'auto',
                badgeData.rarity || 'common'
            );
            
            console.log(`✅ 创建勋章定义成功: ${badgeData.badge_name}`);
            return true;
            
        } catch (error) {
            console.error('创建勋章定义失败:', error);
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