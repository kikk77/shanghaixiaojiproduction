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
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
        this.levelDb = null;
        this.botService = null;
        this.dbOperations = null;
        this.initializationError = null;
        
        // 添加缓存机制
        this.cache = {
            userProfiles: new Map(),
            levelConfig: null,
            rewardConfig: new Map(),
            lastCacheClean: Date.now()
        };
        
        // 缓存配置
        this.cacheConfig = {
            userProfileTTL: 5 * 60 * 1000, // 5分钟
            levelConfigTTL: 30 * 60 * 1000, // 30分钟
            rewardConfigTTL: 30 * 60 * 1000, // 30分钟
            maxCacheSize: 1000 // 最大缓存用户数
        };
        
        if (!this.enabled) {
            console.log('🏆 等级系统已禁用');
            return;
        }
        
        try {
            // 安全地初始化数据库管理器
            const levelDbManager = require('../config/levelDatabase');
            this.levelDb = levelDbManager.getInstance();
            
            if (!this.levelDb || !this.levelDb.enabled) {
                throw new Error('等级系统数据库未启用或初始化失败');
            }
            
            // 安全地获取主系统服务
            try {
                this.botService = require('../../services/botService');
            } catch (error) {
                console.warn('⚠️ 无法加载botService，等级系统播报功能将受限:', error.message);
            }
            
            try {
                this.dbOperations = require('../../models/dbOperations');
            } catch (error) {
                console.warn('⚠️ 无法加载dbOperations，等级系统用户信息获取将受限:', error.message);
            }
            
            // 启动缓存清理定时器
            this.startCacheCleanup();
            
            console.log('✅ 等级系统初始化成功');
        } catch (error) {
            this.initializationError = error;
            this.enabled = false;
            console.error('❌ 等级系统初始化失败，将禁用等级系统功能:', error.message);
        }
    }
    
    /**
     * 优雅禁用等级系统
     */
    async gracefulDisable() {
        console.log('🏆 开始优雅禁用等级系统...');
        
        try {
            // 停止缓存清理定时器
            if (this.cacheCleanupTimer) {
                clearInterval(this.cacheCleanupTimer);
                this.cacheCleanupTimer = null;
                console.log('✅ 缓存清理定时器已停止');
            }
            
            // 清理所有缓存
            this.cache.userProfiles.clear();
            this.cache.levelConfig = null;
            this.cache.rewardConfig.clear();
            console.log('✅ 缓存已清理');
            
            // 关闭数据库连接
            if (this.levelDb) {
                try {
                    this.levelDb.close();
                    console.log('✅ 等级系统数据库连接已关闭');
                } catch (error) {
                    console.warn('⚠️ 关闭数据库连接时出错:', error.message);
                }
            }
            
            // 标记为禁用
            this.enabled = false;
            
            console.log('✅ 等级系统已优雅禁用');
            
        } catch (error) {
            console.error('❌ 优雅禁用等级系统时出错:', error);
        }
    }
    
    /**
     * 检查系统健康状态
     */
    getHealthStatus() {
        return {
            enabled: this.enabled,
            hasInitializationError: !!this.initializationError,
            initializationError: this.initializationError?.message || null,
            databaseAvailable: !!(this.levelDb && this.levelDb.getDatabase()),
            botServiceAvailable: !!this.botService,
            dbOperationsAvailable: !!this.dbOperations,
            cacheStats: {
                userProfiles: this.cache.userProfiles.size,
                levelConfig: !!this.cache.levelConfig,
                rewardConfig: this.cache.rewardConfig.size,
                lastCacheClean: this.cache.lastCacheClean
            }
        };
    }
    
    /**
     * 启动缓存清理定时器（修改为保存定时器引用）
     */
    startCacheCleanup() {
        // 每5分钟清理一次过期缓存
        this.cacheCleanupTimer = setInterval(() => {
            this.cleanExpiredCache();
        }, 5 * 60 * 1000);
    }
    
    /**
     * 清理过期缓存
     */
    cleanExpiredCache() {
        const now = Date.now();
        
        // 清理用户档案缓存
        for (const [userId, cacheItem] of this.cache.userProfiles.entries()) {
            if (now - cacheItem.timestamp > this.cacheConfig.userProfileTTL) {
                this.cache.userProfiles.delete(userId);
            }
        }
        
        // 清理等级配置缓存
        if (this.cache.levelConfig && now - this.cache.levelConfig.timestamp > this.cacheConfig.levelConfigTTL) {
            this.cache.levelConfig = null;
        }
        
        // 清理奖励配置缓存
        for (const [groupId, cacheItem] of this.cache.rewardConfig.entries()) {
            if (now - cacheItem.timestamp > this.cacheConfig.rewardConfigTTL) {
                this.cache.rewardConfig.delete(groupId);
            }
        }
        
        // 如果缓存过大，清理最旧的条目
        if (this.cache.userProfiles.size > this.cacheConfig.maxCacheSize) {
            const entries = Array.from(this.cache.userProfiles.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            const toDelete = entries.slice(0, entries.length - this.cacheConfig.maxCacheSize);
            toDelete.forEach(([userId]) => {
                this.cache.userProfiles.delete(userId);
            });
        }
        
        this.cache.lastCacheClean = now;
    }
    
    /**
     * 获取缓存的用户档案
     */
    getCachedUserProfile(userId) {
        const cacheItem = this.cache.userProfiles.get(userId);
        if (!cacheItem) return null;
        
        const now = Date.now();
        if (now - cacheItem.timestamp > this.cacheConfig.userProfileTTL) {
            this.cache.userProfiles.delete(userId);
            return null;
        }
        
        return cacheItem.data;
    }
    
    /**
     * 缓存用户档案
     */
    setCachedUserProfile(userId, profile) {
        this.cache.userProfiles.set(userId, {
            data: profile,
            timestamp: Date.now()
        });
    }
    
    /**
     * 获取缓存的等级配置
     */
    getCachedLevelConfig() {
        if (!this.cache.levelConfig) return null;
        
        const now = Date.now();
        if (now - this.cache.levelConfig.timestamp > this.cacheConfig.levelConfigTTL) {
            this.cache.levelConfig = null;
            return null;
        }
        
        return this.cache.levelConfig.data;
    }
    
    /**
     * 缓存等级配置
     */
    setCachedLevelConfig(config) {
        this.cache.levelConfig = {
            data: config,
            timestamp: Date.now()
        };
    }
    
    /**
     * 检查服务是否可用
     */
    isAvailable() {
        return this.enabled && !this.initializationError && this.levelDb && this.levelDb.getDatabase();
    }
    
    /**
     * 安全执行等级系统操作
     */
    async safeExecute(operation, ...args) {
        if (!this.isAvailable()) {
            return null;
        }
        
        try {
            return await operation.apply(this, args);
        } catch (error) {
            console.error('等级系统操作失败:', error);
            // 记录错误但不抛出，确保不影响主系统
            return null;
        }
    }
    
    /**
     * 处理评价奖励 - 核心方法
     */
    async processEvaluationReward(userId, sourceGroupId, evaluationId, actionType) {
        return await this.safeExecute(this._processEvaluationRewardInternal, userId, sourceGroupId, evaluationId, actionType);
    }
        
    /**
     * 内部处理评价奖励方法
     */
    async _processEvaluationRewardInternal(userId, sourceGroupId, evaluationId, actionType) {
        const db = this.levelDb.getDatabase();
        if (!db) return;
        
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
            
        // 异步检查勋章解锁（使用安全执行）
        setImmediate(async () => {
            await this.safeExecute(this.checkBadgeUnlock, userId, updatedProfile);
            });
            
        // 异步检查里程碑达成（使用安全执行）
        setImmediate(async () => {
            await this.safeExecute(this.checkMilestoneAchievement, userId, sourceGroupId, updatedProfile);
            });
    }
    
    /**
     * 获取用户档案 - 简化版本：不需要群组ID，支持缓存
     */
    async getUserProfile(userId) {
        // 先尝试从缓存获取
        const cachedProfile = this.getCachedUserProfile(userId);
        if (cachedProfile) {
            return cachedProfile;
        }
        
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            const stmt = db.prepare('SELECT * FROM user_levels WHERE user_id = ?');
            const result = stmt.get(userId);
            
            // 缓存结果
            if (result) {
                this.setCachedUserProfile(userId, result);
            }
            
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
                (user_id, display_name, username)
                VALUES (?, ?, ?)
            `);
            
            stmt.run(userId, userInfo.displayName, userInfo.username);
            
            console.log(`✅ 创建用户档案: ${userId} (${userInfo.displayName}, @${userInfo.username || '无'})`);
            return await this.getUserProfile(userId);
        } catch (error) {
            console.error('创建用户档案失败:', error);
            return null;
        }
    }
    
    /**
     * 获取用户显示信息（复用现有接口）
     * 注意：这是只读操作，不会修改主数据库
     */
    async getUserDisplayInfo(userId) {
        try {
            // 安全检查：确保dbOperations可用
            if (!this.dbOperations) {
                console.warn('⚠️ 主数据库操作不可用，使用默认用户信息');
                return { 
                    userId, 
                    username: null, 
                    firstName: null, 
                    lastName: null,
                    displayName: `用户${userId}`
                };
            }
            
            // 复用现有的数据库操作获取用户信息（只读，不修改）
            let userRecord = null;
            try {
                userRecord = this.dbOperations.getUserRecord ? 
                this.dbOperations.getUserRecord(userId) : null;
            } catch (error) {
                console.warn('⚠️ 获取用户记录失败，使用默认信息:', error.message);
            }
            
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
            const result = transaction();
            
            // 清除用户档案缓存，确保下次获取最新数据
            this.cache.userProfiles.delete(userId);
            
            return result;
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
     * 获取等级配置 - 使用全局配置，支持缓存
     */
    async getLevelConfig() {
        // 先尝试从缓存获取
        const cachedConfig = this.getCachedLevelConfig();
        if (cachedConfig) {
            return cachedConfig;
        }
        
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            const stmt = db.prepare(`
                SELECT level_config FROM group_configs 
                WHERE group_id = 'global' AND status = 'active'
            `);
            const result = stmt.get();
            
            let config = null;
            if (result) {
                config = JSON.parse(result.level_config);
                // 缓存结果
                this.setCachedLevelConfig(config);
            }
            
            return config;
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
     * 播报升级消息（使用专门的播报服务）
     */
    async broadcastLevelUp(userId, sourceGroupId, levelUpResult) {
        if (!this.enabled) return;
        
        try {
            const broadcastService = require('./broadcastService').getInstance();
            const result = await broadcastService.broadcastLevelUp(userId, sourceGroupId, levelUpResult);
            
            if (!result.success) {
                console.log(`升级播报未发送: ${result.error}`);
            } else {
                console.log(`升级播报完成，成功发送到 ${result.results.filter(r => r.success).length} 个群组`);
            }
        } catch (error) {
            console.error('调用播报服务失败:', error);
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
     * 检查里程碑达成
     */
    async checkMilestoneAchievement(userId, groupId, userProfile) {
        try {
            const milestoneService = require('./milestoneService').getInstance();
            await milestoneService.handlePointsChange(userId, groupId, userProfile.total_points_earned);
        } catch (error) {
            console.error('检查里程碑达成失败:', error);
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
    async getRankings(type = 'level', limit = 10, includeInactive = false) {
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
            
            // 根据 includeInactive 参数决定是否过滤无评价的用户
            const whereClause = includeInactive ? 
                'WHERE user_id >= 1000000' : // 只过滤真实用户ID
                'WHERE user_id >= 1000000 AND user_eval_count > 0'; // 过滤有评价记录的真实用户
            
            const stmt = db.prepare(`
                SELECT user_id, level, total_exp, available_points, total_points_earned, 
                       display_name, user_eval_count, username
                FROM user_levels 
                ${whereClause}
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