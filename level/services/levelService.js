/**
 * 等级系统核心服务
 * 基于版本A设计：复用现有接口，独立数据库操作
 */

class LevelService {
    constructor() {
        // 使用独立数据库管理器
        const levelDbManager = require('../config/levelDatabase');
        this.levelDb = levelDbManager.getInstance();
        
        // 复用现有的Bot服务和数据库操作（不修改）
        this.botService = require('../../services/botService');
        this.dbOperations = require('../../models/dbOperations');
        
        // 检查是否启用
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
    }
    
    /**
     * 处理评价完成后的奖励
     */
    async processEvaluationReward(userId, groupId, evaluationId, actionType) {
        if (!this.enabled || !this.levelDb.enabled) return;
        
        try {
            // 获取或创建用户档案
            let userProfile = await this.getUserProfile(userId, groupId);
            if (!userProfile) {
                userProfile = await this.createUserProfile(userId, groupId);
            }
            
            // 获取群组配置
            const groupConfig = await this.getGroupConfig(groupId);
            const rewardConfig = JSON.parse(groupConfig.points_config);
            
            // 计算奖励
            const reward = this.calculateReward(actionType, rewardConfig);
            if (!reward) return;
            
            // 更新用户数据
            const updatedProfile = await this.updateUserRewards(
                userId, 
                groupId, 
                reward.exp, 
                reward.points, 
                actionType,
                reward.desc
            );
            
            // 检查升级
            const levelUpResult = await this.checkLevelUp(userProfile, updatedProfile, groupConfig);
            if (levelUpResult.leveledUp) {
                await this.handleLevelUp(userId, groupId, levelUpResult);
            }
            
            // 检查勋章解锁
            await this.checkBadgeUnlock(userId, groupId, updatedProfile);
            
        } catch (error) {
            console.error('处理等级奖励失败:', error);
        }
    }
    
    /**
     * 获取用户档案
     */
    async getUserProfile(userId, groupId) {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            const stmt = db.prepare(`
                SELECT * FROM user_levels 
                WHERE user_id = ? AND group_id = ?
            `);
            return stmt.get(userId, groupId);
        } catch (error) {
            console.error('获取用户档案失败:', error);
            return null;
        }
    }
    
    /**
     * 创建新用户档案
     */
    async createUserProfile(userId, groupId) {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            // 获取用户显示名称（复用现有接口）
            const userInfo = await this.getUserDisplayInfo(userId);
            
            const stmt = db.prepare(`
                INSERT INTO user_levels 
                (user_id, group_id, display_name)
                VALUES (?, ?, ?)
            `);
            
            stmt.run(userId, groupId, userInfo.displayName);
            
            return await this.getUserProfile(userId, groupId);
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
     * 获取群组配置
     */
    async getGroupConfig(groupId) {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            const stmt = db.prepare(`
                SELECT * FROM group_configs 
                WHERE group_id = ? AND status = 'active'
            `);
            return stmt.get(groupId) || await this.getDefaultGroupConfig();
        } catch (error) {
            console.error('获取群组配置失败:', error);
            return await this.getDefaultGroupConfig();
        }
    }
    
    /**
     * 获取默认群组配置
     */
    async getDefaultGroupConfig() {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        const stmt = db.prepare(`
            SELECT * FROM group_configs 
            WHERE group_id = 'default'
        `);
        return stmt.get();
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
    async updateUserRewards(userId, groupId, expChange, pointsChange, actionType, description) {
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
                WHERE user_id = ? AND group_id = ?
            `);
            
            updateStmt.run(
                expChange, 
                pointsChange, 
                pointsChange > 0 ? pointsChange : 0,
                Date.now() / 1000,
                userId, 
                groupId
            );
            
            // 获取更新后的数据
            const getStmt = db.prepare(`
                SELECT * FROM user_levels 
                WHERE user_id = ? AND group_id = ?
            `);
            const updatedProfile = getStmt.get(userId, groupId);
            
            // 记录积分历史
            const logStmt = db.prepare(`
                INSERT INTO points_log 
                (user_id, group_id, action_type, exp_change, points_change, 
                 exp_after, points_after, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            logStmt.run(
                userId, groupId, actionType, expChange, pointsChange,
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
    async checkLevelUp(oldProfile, newProfile, groupConfig) {
        const levelConfig = JSON.parse(groupConfig.level_config);
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
     * 处理升级
     */
    async handleLevelUp(userId, groupId, levelUpResult) {
        const db = this.levelDb.getDatabase();
        if (!db) return;
        
        try {
            // 更新用户等级
            const updateStmt = db.prepare(`
                UPDATE user_levels 
                SET level = ?, updated_at = ?
                WHERE user_id = ? AND group_id = ?
            `);
            updateStmt.run(levelUpResult.newLevel, Date.now() / 1000, userId, groupId);
            
            // 获取群组配置中的升级奖励
            const groupConfig = await this.getGroupConfig(groupId);
            const rewardConfig = JSON.parse(groupConfig.points_config);
            const levelUpBonus = rewardConfig.base_rewards?.level_up_bonus;
            
            if (levelUpBonus && levelUpBonus.points > 0) {
                // 给予升级奖励积分
                await this.updateUserRewards(
                    userId, 
                    groupId, 
                    0, 
                    levelUpBonus.points, 
                    'level_up_bonus',
                    `升级到Lv.${levelUpResult.newLevel}奖励`
                );
            }
            
            // 播报升级消息
            await this.broadcastLevelUp(userId, groupId, levelUpResult);
            
        } catch (error) {
            console.error('处理升级失败:', error);
        }
    }
    
    /**
     * 播报升级消息（复用现有Bot服务）
     */
    async broadcastLevelUp(userId, groupId, levelUpResult) {
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
            
            // 使用现有的bot服务发送消息
            if (this.botService.bot) {
                const sentMessage = await this.botService.bot.telegram.sendMessage(groupId, message, {
                    parse_mode: 'Markdown'
                });
                
                // 尝试置顶消息
                try {
                    await this.botService.bot.telegram.pinChatMessage(groupId, sentMessage.message_id);
                    // 5秒后取消置顶
                    setTimeout(async () => {
                        try {
                            await this.botService.bot.telegram.unpinChatMessage(groupId, sentMessage.message_id);
                        } catch (err) {
                            // 忽略取消置顶的错误
                        }
                    }, 5000);
                } catch (pinError) {
                    console.log('置顶消息失败:', pinError.message);
                }
            }
        } catch (error) {
            console.error('等级系统播报失败:', error);
        }
    }
    
    /**
     * 检查勋章解锁
     */
    async checkBadgeUnlock(userId, groupId, userProfile) {
        try {
            const badgeService = require('./badgeService').getInstance();
            await badgeService.checkAndUnlockBadges(userId, groupId, userProfile);
        } catch (error) {
            console.error('检查勋章解锁失败:', error);
        }
    }
    

    
    /**
     * 获取用户等级信息（供Bot命令使用）
     */
    async getUserLevelInfo(userId, groupId) {
        const userProfile = await this.getUserProfile(userId, groupId);
        if (!userProfile) {
            return null;
        }
        
        const groupConfig = await this.getGroupConfig(groupId);
        const levelConfig = JSON.parse(groupConfig.level_config);
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
     * 获取用户积分历史
     */
    async getUserPointsHistory(userId, groupId, limit = 10) {
        const db = this.levelDb.getDatabase();
        if (!db) return [];
        
        try {
            const stmt = db.prepare(`
                SELECT * FROM points_log 
                WHERE user_id = ? AND group_id = ?
                ORDER BY timestamp DESC 
                LIMIT ?
            `);
            return stmt.all(userId, groupId, limit);
        } catch (error) {
            console.error('获取积分历史失败:', error);
            return [];
        }
    }
    
    /**
     * 设置自定义显示名称
     */
    async setCustomDisplayName(userId, groupId, displayName) {
        const db = this.levelDb.getDatabase();
        if (!db) return false;
        
        try {
            const stmt = db.prepare(`
                UPDATE user_levels 
                SET display_name = ?, updated_at = ?
                WHERE user_id = ? AND group_id = ?
            `);
            stmt.run(displayName, Date.now() / 1000, userId, groupId);
            
            return true;
        } catch (error) {
            console.error('设置显示名称失败:', error);
            return false;
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