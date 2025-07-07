/**
 * 等级系统服务 - 简化版本：以用户为核心
 * 
 * 设计原则：
 * 1. 用户档案以user_id为主键，不依赖群组
 * 2. 群组配置保留，用于播报设置和奖励规则
 * 3. 用户查询等级不需要指定群组
 */

class LevelService {
    constructor() {
        this.levelDb = require('../config/levelDatabase');
        this.botService = require('../../services/botService');
        this.dbOperations = require('../../models/dbOperations');
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
        
        if (!this.enabled) {
            console.log('🏆 等级系统已禁用');
        }
    }
    
    /**
     * 处理评价奖励 - 核心方法
     */
    async processEvaluationReward(userId, sourceGroupId, evaluationId, actionType) {
        if (!this.enabled) return;
        
        const db = this.levelDb.getDatabase();
        if (!db) return;
        
        try {
            console.log(`🏆 处理用户 ${userId} 的评价奖励，动作类型: ${actionType}`);
            
            // 获取或创建用户档案
            let userProfile = await this.getUserProfile(userId);
            if (!userProfile) {
                userProfile = await this.createUserProfile(userId);
                if (!userProfile) {
                    console.error('创建用户档案失败');
                    return;
                }
            }
            
            // 获取奖励配置（使用全局配置或指定群组配置）
            const rewardConfig = await this.getRewardConfig(sourceGroupId);
            if (!rewardConfig) {
                console.error('获取奖励配置失败');
                return;
            }
            
            // 计算奖励
            const reward = this.calculateReward(actionType, rewardConfig);
            if (!reward) {
                console.log(`未找到动作类型 ${actionType} 的奖励配置`);
                return;
            }
            
            console.log(`计算奖励: ${reward.desc}, 经验值+${reward.exp}, 积分+${reward.points}`);
            
            // 记录升级前的等级
            const oldProfile = { ...userProfile };
            
            // 更新用户奖励
            const updatedProfile = await this.updateUserRewards(
                userId, 
                sourceGroupId,
                reward.exp, 
                reward.points, 
                actionType, 
                reward.desc
            );
            
            if (!updatedProfile) {
                console.error('更新用户奖励失败');
                return;
            }
            
            // 检查升级
            const levelUpResult = await this.checkLevelUp(oldProfile, updatedProfile);
            if (levelUpResult.leveledUp) {
                await this.handleLevelUp(userId, sourceGroupId, levelUpResult);
            }
            
            // 异步检查勋章解锁
            setImmediate(() => {
                this.checkBadgeUnlock(userId, updatedProfile);
            });
            
        } catch (error) {
            console.error('处理评价奖励失败:', error);
        }
    }
    
    /**
     * 获取用户档案 - 简化版本：不需要群组ID
     */
    async getUserProfile(userId) {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            const stmt = db.prepare('SELECT * FROM user_levels WHERE user_id = ?');
            const result = stmt.get(userId);
            return result;
        } catch (error) {
            console.error('获取用户档案失败:', error);
            return null;
        }
    }
    
    /**
     * 创建新用户档案 - 简化版本：不需要群组ID
     */
    async createUserProfile(userId) {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            // 获取用户显示名称（复用现有接口）
            const userInfo = await this.getUserDisplayInfo(userId);
            
            const stmt = db.prepare(`
                INSERT INTO user_levels 
                (user_id, display_name)
                VALUES (?, ?)
            `);
            
            stmt.run(userId, userInfo.displayName);
            
            console.log(`✅ 创建用户档案: ${userId} (${userInfo.displayName})`);
            return await this.getUserProfile(userId);
        } catch (error) {
            console.error('创建用户档案失败:', error);
            return null;
        }
    }
    
    /**
     * 获取用户显示信息（复用现有接口）
     */
    async getUserDisplayInfo(userId) {
        try {
            // 复用现有的数据库操作获取用户信息（只读，不修改）
            const userRecord = this.dbOperations.getUserRecord ? 
                this.dbOperations.getUserRecord(userId) : null;
            
            let displayName = `用户${userId}`;
            if (userRecord) {
                if (userRecord.username) {
                    displayName = `@${userRecord.username}`;
                } else if (userRecord.first_name || userRecord.last_name) {
                    displayName = `${userRecord.first_name || ''} ${userRecord.last_name || ''}`.trim();
                }
            }
            
            return {
                userId: userId,
                username: userRecord?.username || null,
                firstName: userRecord?.first_name || null,
                lastName: userRecord?.last_name || null,
                displayName: displayName
            };
        } catch (error) {
            console.error('获取用户信息失败:', error);
            return { 
                userId, 
                username: null, 
                firstName: null, 
                lastName: null,
                displayName: `用户${userId}`
            };
        }
    }
    
    /**
     * 获取奖励配置 - 优先使用指定群组，回退到全局配置
     */
    async getRewardConfig(sourceGroupId = null) {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            let config = null;
            
            // 如果指定了源群组，先尝试获取该群组的配置
            if (sourceGroupId) {
                const stmt = db.prepare(`
                    SELECT points_config FROM group_configs 
                    WHERE group_id = ? AND status = 'active'
                `);
                const result = stmt.get(sourceGroupId);
                if (result) {
                    config = JSON.parse(result.points_config);
                }
            }
            
            // 如果没有找到群组配置，使用全局配置
            if (!config) {
                const globalStmt = db.prepare(`
                    SELECT points_config FROM group_configs 
                    WHERE group_id = 'global' AND status = 'active'
                `);
                const globalResult = globalStmt.get();
                if (globalResult) {
                    config = JSON.parse(globalResult.points_config);
                }
            }
            
            return config;
        } catch (error) {
            console.error('获取奖励配置失败:', error);
            return null;
        }
    }
    
    /**
     * 计算奖励
     */
    calculateReward(actionType, rewardConfig) {
        const baseRewards = rewardConfig.base_rewards || {};
        const reward = baseRewards[actionType];
        
        if (!reward) {
            console.log(`未找到奖励配置: ${actionType}`);
            return null;
        }
        
        return {
            exp: reward.exp || 0,
            points: reward.points || 0,
            desc: reward.desc || actionType
        };
    }
    
    /**
     * 更新用户奖励
     */
    async updateUserRewards(userId, sourceGroupId, expChange, pointsChange, actionType, description) {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        const transaction = db.transaction(() => {
            // 更新用户数据
            const updateStmt = db.prepare(`
                UPDATE user_levels 
                SET 
                    total_exp = total_exp + ?,
                    available_points = available_points + ?,
                    total_points_earned = total_points_earned + ?,
                    ${actionType}_count = ${actionType}_count + 1,
                    updated_at = ?
                WHERE user_id = ?
            `);
            
            updateStmt.run(
                expChange, 
                pointsChange, 
                pointsChange > 0 ? pointsChange : 0,
                Date.now() / 1000,
                userId
            );
            
            // 获取更新后的数据
            const getStmt = db.prepare('SELECT * FROM user_levels WHERE user_id = ?');
            const updatedProfile = getStmt.get(userId);
            
            // 记录积分历史
            const logStmt = db.prepare(`
                INSERT INTO points_log 
                (user_id, source_group_id, action_type, exp_change, points_change, 
                 exp_after, points_after, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            logStmt.run(
                userId, sourceGroupId, actionType, expChange, pointsChange,
                updatedProfile.total_exp, updatedProfile.available_points,
                description
            );
            
            return updatedProfile;
        });
        
        try {
            return transaction();
        } catch (error) {
            console.error('更新用户奖励失败:', error);
            return null;
        }
    }
    
    /**
     * 检查升级
     */
    async checkLevelUp(oldProfile, newProfile) {
        const levelConfig = await this.getLevelConfig();
        if (!levelConfig) return { leveledUp: false };
        
        const levels = levelConfig.levels;
        const oldLevel = oldProfile.level;
        let newLevel = oldLevel;
        
        // 查找新等级
        for (const level of levels) {
            if (newProfile.total_exp >= level.required_exp && 
                newProfile.user_eval_count >= level.required_evals) {
                newLevel = level.level;
            }
        }
        
        if (newLevel > oldLevel) {
            return {
                leveledUp: true,
                oldLevel: oldLevel,
                newLevel: newLevel,
                oldLevelInfo: levels.find(l => l.level === oldLevel),
                newLevelInfo: levels.find(l => l.level === newLevel)
            };
        }
        
        return { leveledUp: false };
    }
    
    /**
     * 获取等级配置 - 使用全局配置
     */
    async getLevelConfig() {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            const stmt = db.prepare(`
                SELECT level_config FROM group_configs 
                WHERE group_id = 'global' AND status = 'active'
            `);
            const result = stmt.get();
            
            if (result) {
                return JSON.parse(result.level_config);
            }
            
            return null;
        } catch (error) {
            console.error('获取等级配置失败:', error);
            return null;
        }
    }
    
    /**
     * 处理升级
     */
    async handleLevelUp(userId, sourceGroupId, levelUpResult) {
        const db = this.levelDb.getDatabase();
        if (!db) return;
        
        try {
            // 更新用户等级
            const updateStmt = db.prepare(`
                UPDATE user_levels 
                SET level = ?, updated_at = ?
                WHERE user_id = ?
            `);
            updateStmt.run(levelUpResult.newLevel, Date.now() / 1000, userId);
            
            // 获取升级奖励配置
            const rewardConfig = await this.getRewardConfig(sourceGroupId);
            const levelUpBonus = rewardConfig?.base_rewards?.level_up_bonus;
            
            if (levelUpBonus && levelUpBonus.points > 0) {
                // 给予升级奖励积分
                await this.updateUserRewards(
                    userId, 
                    sourceGroupId,
                    0, 
                    levelUpBonus.points, 
                    'level_up_bonus',
                    `升级到Lv.${levelUpResult.newLevel}奖励`
                );
            }
            
            // 播报升级消息
            await this.broadcastLevelUp(userId, sourceGroupId, levelUpResult);
            
        } catch (error) {
            console.error('处理升级失败:', error);
        }
    }
    
    /**
     * 播报升级消息（复用现有Bot服务）
     */
    async broadcastLevelUp(userId, sourceGroupId, levelUpResult) {
        if (!this.enabled) return;
        
        try {
            // 获取用户信息
            const userInfo = await this.getUserDisplayInfo(userId);
            
            // 构建升级消息
            const message = `🎉 恭喜升级！🎉\n\n` +
                `🧑‍🚀 ${userInfo.displayName}\n` +
                `⭐ Lv.${levelUpResult.oldLevel} → Lv.${levelUpResult.newLevel} ${levelUpResult.newLevelInfo.name}\n` +
                `💎 升级奖励：50积分\n\n` +
                `继续努力，成为传说勇士！💪`;
            
            // 获取播报目标群组
            const targetGroups = await this.getBroadcastTargetGroups();
            
            if (targetGroups.length === 0) {
                console.log('没有配置播报群组，跳过升级播报');
                return;
            }
            
            // 向所有配置的群组播报
            for (const targetGroupId of targetGroups) {
                try {
                    if (this.botService.bot) {
                        const sentMessage = await this.botService.bot.telegram.sendMessage(targetGroupId, message, {
                            parse_mode: 'Markdown'
                        });
                        
                        // 尝试置顶消息
                        try {
                            await this.botService.bot.telegram.pinChatMessage(targetGroupId, sentMessage.message_id);
                            // 5秒后取消置顶
                            setTimeout(async () => {
                                try {
                                    await this.botService.bot.telegram.unpinChatMessage(targetGroupId, sentMessage.message_id);
                                } catch (err) {
                                    // 忽略取消置顶的错误
                                }
                            }, 5000);
                        } catch (pinError) {
                            console.log(`群组 ${targetGroupId} 置顶消息失败:`, pinError.message);
                        }
                        
                        console.log(`升级播报成功发送到群组: ${targetGroupId}`);
                    }
                } catch (error) {
                    console.error(`向群组 ${targetGroupId} 播报升级失败:`, error);
                }
            }
        } catch (error) {
            console.error('等级系统播报失败:', error);
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
     * 检查勋章解锁
     */
    async checkBadgeUnlock(userId, userProfile) {
        try {
            const badgeService = require('./badgeService').getInstance();
            await badgeService.checkAndUnlockBadges(userId, userProfile);
        } catch (error) {
            console.error('检查勋章解锁失败:', error);
        }
    }
    
    /**
     * 获取用户等级信息（供Bot命令使用）- 简化版本
     */
    async getUserLevelInfo(userId) {
        const userProfile = await this.getUserProfile(userId);
        if (!userProfile) {
            return null;
        }
        
        const levelConfig = await this.getLevelConfig();
        if (!levelConfig) {
            return null;
        }
        
        const currentLevel = levelConfig.levels.find(l => l.level === userProfile.level);
        const nextLevel = levelConfig.levels.find(l => l.level === userProfile.level + 1);
        
        return {
            profile: userProfile,
            currentLevel: currentLevel,
            nextLevel: nextLevel,
            levelConfig: levelConfig
        };
    }
    
    /**
     * 获取用户积分历史 - 简化版本
     */
    async getUserPointsHistory(userId, limit = 10) {
        const db = this.levelDb.getDatabase();
        if (!db) return [];
        
        try {
            const stmt = db.prepare(`
                SELECT * FROM points_log 
                WHERE user_id = ?
                ORDER BY timestamp DESC 
                LIMIT ?
            `);
            return stmt.all(userId, limit);
        } catch (error) {
            console.error('获取积分历史失败:', error);
            return [];
        }
    }
    
    /**
     * 设置自定义显示名称
     */
    async setCustomDisplayName(userId, displayName) {
        const db = this.levelDb.getDatabase();
        if (!db) return false;
        
        try {
            const stmt = db.prepare(`
                UPDATE user_levels 
                SET display_name = ?, updated_at = ?
                WHERE user_id = ?
            `);
            stmt.run(displayName, Date.now() / 1000, userId);
            
            return true;
        } catch (error) {
            console.error('设置显示名称失败:', error);
            return false;
        }
    }
    
    /**
     * 获取排行榜 - 简化版本
     */
    async getRankings(type = 'level', limit = 10) {
        const db = this.levelDb.getDatabase();
        if (!db) return [];
        
        try {
            let orderBy = '';
            switch (type) {
                case 'level':
                    orderBy = 'level DESC, total_exp DESC';
                    break;
                case 'points':
                    orderBy = 'available_points DESC, total_points_earned DESC';
                    break;
                case 'exp':
                    orderBy = 'total_exp DESC, level DESC';
                    break;
                default:
                    orderBy = 'level DESC, total_exp DESC';
            }
            
            const stmt = db.prepare(`
                SELECT user_id, level, total_exp, available_points, total_points_earned, display_name
                FROM user_levels 
                WHERE level > 0
                ORDER BY ${orderBy}
                LIMIT ?
            `);
            
            return stmt.all(limit);
        } catch (error) {
            console.error('获取排行榜失败:', error);
            return [];
        }
    }
}

// 导出单例
let instance = null;
module.exports = {
    getInstance: () => {
        if (!instance) {
            instance = new LevelService();
        }
        return instance;
    }
}; 