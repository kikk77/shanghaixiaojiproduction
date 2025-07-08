/**
 * 积分里程碑奖励服务
 * 
 * 功能：
 * 1. 管理积分里程碑配置（可自定义）
 * 2. 检查用户是否达到里程碑
 * 3. 发放里程碑奖励
 * 4. 记录里程碑达成历史
 */

class MilestoneService {
    constructor() {
        const levelDbManager = require('../config/levelDatabase');
        this.levelDb = levelDbManager.getInstance();
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
        
        if (!this.enabled) {
            console.log('🏆 等级系统已禁用，里程碑服务不可用');
        }
    }
    
    /**
     * 获取群组的里程碑配置
     */
    async getMilestoneConfig(groupId = 'global') {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            const stmt = db.prepare(`
                SELECT milestone_config FROM group_configs 
                WHERE group_id = ? AND status = 'active'
            `);
            const result = stmt.get(groupId);
            
            if (result && result.milestone_config) {
                return JSON.parse(result.milestone_config);
            }
            
            // 返回默认配置
            return this.getDefaultMilestoneConfig();
        } catch (error) {
            console.error('获取里程碑配置失败:', error);
            return this.getDefaultMilestoneConfig();
        }
    }
    
    /**
     * 保存群组的里程碑配置
     */
    async saveMilestoneConfig(groupId, config) {
        const db = this.levelDb.getDatabase();
        if (!db) return false;
        
        try {
            // 验证配置格式
            if (!this.validateMilestoneConfig(config)) {
                throw new Error('里程碑配置格式无效');
            }
            
            // 检查群组配置是否存在
            const existsStmt = db.prepare(`
                SELECT 1 FROM group_configs WHERE group_id = ?
            `);
            const exists = existsStmt.get(groupId);
            
            if (exists) {
                // 更新现有配置
                const updateStmt = db.prepare(`
                    UPDATE group_configs 
                    SET milestone_config = ?, updated_at = ?
                    WHERE group_id = ?
                `);
                updateStmt.run(JSON.stringify(config), Date.now() / 1000, groupId);
            } else {
                // 创建新配置
                const insertStmt = db.prepare(`
                    INSERT INTO group_configs 
                    (group_id, group_name, milestone_config, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `);
                const now = Date.now() / 1000;
                insertStmt.run(groupId, groupId, JSON.stringify(config), now, now);
            }
            
            console.log(`✅ 里程碑配置保存成功: ${groupId}`);
            return true;
        } catch (error) {
            console.error('保存里程碑配置失败:', error);
            return false;
        }
    }
    
    /**
     * 获取默认里程碑配置
     */
    getDefaultMilestoneConfig() {
        return {
            enabled: true,
            milestones: [
                {
                    id: 'milestone_100',
                    name: '积分新手 🟢',
                    description: '累计获得100积分',
                    required_points: 100,
                    reward_type: 'points',
                    reward_amount: 20,
                    reward_description: '奖励20积分',
                    icon: '🎯',
                    enabled: true
                },
                {
                    id: 'milestone_500',
                    name: '积分达人 🔵',
                    description: '累计获得500积分',
                    required_points: 500,
                    reward_type: 'points',
                    reward_amount: 100,
                    reward_description: '奖励100积分',
                    icon: '🏆',
                    enabled: true
                },
                {
                    id: 'milestone_1000',
                    name: '积分专家 🟣',
                    description: '累计获得1000积分',
                    required_points: 1000,
                    reward_type: 'points',
                    reward_amount: 200,
                    reward_description: '奖励200积分',
                    icon: '💎',
                    enabled: true
                },
                {
                    id: 'milestone_2000',
                    name: '积分大师 🟠',
                    description: '累计获得2000积分',
                    required_points: 2000,
                    reward_type: 'mixed',
                    reward_amount: 300,
                    reward_description: '奖励300积分+50经验',
                    extra_exp: 50,
                    icon: '⭐',
                    enabled: true
                },
                {
                    id: 'milestone_5000',
                    name: '积分传说 🔴',
                    description: '累计获得5000积分',
                    required_points: 5000,
                    reward_type: 'mixed',
                    reward_amount: 500,
                    reward_description: '奖励500积分+100经验+专属勋章',
                    extra_exp: 100,
                    badge_reward: 'legend_milestone',
                    icon: '👑',
                    enabled: true
                }
            ],
            settings: {
                auto_claim: true,
                broadcast_achievement: true,
                allow_repeat: false,
                check_interval: 'immediate'
            }
        };
    }
    
    /**
     * 验证里程碑配置格式
     */
    validateMilestoneConfig(config) {
        if (!config || typeof config !== 'object') {
            return false;
        }
        
        if (!Array.isArray(config.milestones)) {
            return false;
        }
        
        // 验证每个里程碑
        for (const milestone of config.milestones) {
            if (!milestone.id || !milestone.name || !milestone.required_points) {
                return false;
            }
            
            if (typeof milestone.required_points !== 'number' || milestone.required_points <= 0) {
                return false;
            }
            
            if (!['points', 'exp', 'mixed', 'badge'].includes(milestone.reward_type)) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * 检查用户是否达到新的里程碑
     */
    async checkUserMilestones(userId, groupId = 'global') {
        if (!this.enabled) return [];
        
        const db = this.levelDb.getDatabase();
        if (!db) return [];
        
        try {
            // 获取用户当前积分信息
            const userStmt = db.prepare(`
                SELECT total_points_earned, available_points FROM user_levels 
                WHERE user_id = ?
            `);
            const user = userStmt.get(userId);
            
            if (!user) {
                return [];
            }
            
            // 获取里程碑配置
            const config = await this.getMilestoneConfig(groupId);
            if (!config || !config.enabled) {
                return [];
            }
            
            // 获取用户已达成的里程碑
            const achievedStmt = db.prepare(`
                SELECT milestone_id FROM user_milestones 
                WHERE user_id = ? AND group_id = ?
            `);
            const achieved = achievedStmt.all(userId, groupId);
            const achievedIds = achieved.map(a => a.milestone_id);
            
            // 检查哪些里程碑刚刚达成
            const newMilestones = [];
            const totalPoints = user.total_points_earned;
            
            for (const milestone of config.milestones) {
                if (!milestone.enabled) continue;
                
                // 检查是否已达成
                if (achievedIds.includes(milestone.id)) {
                    if (!config.settings.allow_repeat) {
                        continue;
                    }
                }
                
                // 检查是否达到要求
                if (totalPoints >= milestone.required_points) {
                    newMilestones.push(milestone);
                }
            }
            
            return newMilestones;
            
        } catch (error) {
            console.error('检查用户里程碑失败:', error);
            return [];
        }
    }
    
    /**
     * 发放里程碑奖励
     */
    async grantMilestoneReward(userId, groupId, milestone) {
        if (!this.enabled) return false;
        
        const db = this.levelDb.getDatabase();
        if (!db) return false;
        
        const transaction = db.transaction(() => {
            try {
                // 记录里程碑达成
                const milestoneStmt = db.prepare(`
                    INSERT INTO user_milestones 
                    (user_id, group_id, milestone_id, milestone_name, reward_type, 
                     reward_amount, extra_exp, achieved_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                milestoneStmt.run(
                    userId, groupId, milestone.id, milestone.name, 
                    milestone.reward_type, milestone.reward_amount || 0,
                    milestone.extra_exp || 0, Date.now() / 1000
                );
                
                // 发放奖励
                let pointsReward = 0;
                let expReward = 0;
                
                switch (milestone.reward_type) {
                    case 'points':
                        pointsReward = milestone.reward_amount || 0;
                        break;
                    case 'exp':
                        expReward = milestone.reward_amount || 0;
                        break;
                    case 'mixed':
                        pointsReward = milestone.reward_amount || 0;
                        expReward = milestone.extra_exp || 0;
                        break;
                }
                
                // 更新用户积分和经验
                if (pointsReward > 0 || expReward > 0) {
                    const updateStmt = db.prepare(`
                        UPDATE user_levels 
                        SET available_points = available_points + ?,
                            total_points_earned = total_points_earned + ?,
                            total_exp = total_exp + ?,
                            updated_at = ?
                        WHERE user_id = ?
                    `);
                    
                    updateStmt.run(
                        pointsReward, pointsReward, expReward, 
                        Date.now() / 1000, userId
                    );
                }
                
                // 记录积分历史
                if (pointsReward > 0 || expReward > 0) {
                    const logStmt = db.prepare(`
                        INSERT INTO points_log 
                        (user_id, source_group_id, action_type, exp_change, points_change, 
                         exp_after, points_after, description)
                        SELECT ?, ?, 'milestone_reward', ?, ?, 
                               total_exp, available_points, ?
                        FROM user_levels WHERE user_id = ?
                    `);
                    
                    logStmt.run(
                        userId, groupId, expReward, pointsReward,
                        `里程碑奖励：${milestone.name}`, userId
                    );
                }
                
                // 如果有勋章奖励，记录勋章授予
                if (milestone.badge_reward) {
                    try {
                        const badgeStmt = db.prepare(`
                            INSERT INTO user_badges 
                            (user_id, source_group_id, badge_id, awarded_by, 
                             awarded_reason, awarded_at)
                            VALUES (?, ?, ?, 'system', ?, ?)
                        `);
                        
                        badgeStmt.run(
                            userId, groupId, milestone.badge_reward,
                            `里程碑达成：${milestone.name}`, Date.now() / 1000
                        );
                    } catch (badgeError) {
                        console.warn('勋章奖励发放失败:', badgeError.message);
                    }
                }
                
                console.log(`🎯 里程碑奖励发放成功: 用户${userId} 达成 ${milestone.name}`);
                return true;
                
            } catch (error) {
                console.error('发放里程碑奖励失败:', error);
                throw error;
            }
        });
        
        try {
            return transaction();
        } catch (error) {
            console.error('里程碑奖励事务失败:', error);
            return false;
        }
    }
    
    /**
     * 获取用户已达成的里程碑
     */
    async getUserMilestones(userId, groupId = 'global') {
        const db = this.levelDb.getDatabase();
        if (!db) return [];
        
        try {
            const stmt = db.prepare(`
                SELECT * FROM user_milestones 
                WHERE user_id = ? AND group_id = ?
                ORDER BY achieved_at DESC
            `);
            return stmt.all(userId, groupId);
        } catch (error) {
            console.error('获取用户里程碑失败:', error);
            return [];
        }
    }
    
    /**
     * 获取里程碑统计信息
     */
    async getMilestoneStats(groupId = 'global') {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            // 获取配置
            const config = await this.getMilestoneConfig(groupId);
            if (!config) return null;
            
            const stats = {
                total_milestones: config.milestones.length,
                enabled_milestones: config.milestones.filter(m => m.enabled).length,
                milestone_achievements: {},
                recent_achievements: []
            };
            
            // 统计每个里程碑的达成情况
            for (const milestone of config.milestones) {
                const countStmt = db.prepare(`
                    SELECT COUNT(*) as count FROM user_milestones 
                    WHERE milestone_id = ? AND group_id = ?
                `);
                const result = countStmt.get(milestone.id, groupId);
                
                stats.milestone_achievements[milestone.id] = {
                    name: milestone.name,
                    required_points: milestone.required_points,
                    achievement_count: result.count,
                    reward_description: milestone.reward_description
                };
            }
            
            // 获取最近的达成记录
            const recentStmt = db.prepare(`
                SELECT um.*, ul.display_name 
                FROM user_milestones um
                LEFT JOIN user_levels ul ON um.user_id = ul.user_id
                WHERE um.group_id = ?
                ORDER BY um.achieved_at DESC
                LIMIT 10
            `);
            stats.recent_achievements = recentStmt.all(groupId);
            
            return stats;
            
        } catch (error) {
            console.error('获取里程碑统计失败:', error);
            return null;
        }
    }
    
    /**
     * 处理用户积分变化时的里程碑检查
     */
    async handlePointsChange(userId, groupId = 'global', newTotalPoints) {
        if (!this.enabled) return;
        
        try {
            // 检查新达成的里程碑
            const newMilestones = await this.checkUserMilestones(userId, groupId);
            
            if (newMilestones.length === 0) {
                return;
            }
            
            console.log(`🎯 用户${userId}达成${newMilestones.length}个新里程碑`);
            
            // 发放奖励
            for (const milestone of newMilestones) {
                const success = await this.grantMilestoneReward(userId, groupId, milestone);
                
                if (success) {
                    // 发送里程碑达成通知
                    await this.broadcastMilestoneAchievement(userId, groupId, milestone);
                }
            }
            
        } catch (error) {
            console.error('处理积分变化里程碑检查失败:', error);
        }
    }
    
    /**
     * 广播里程碑达成消息
     */
    async broadcastMilestoneAchievement(userId, groupId, milestone) {
        try {
            // 获取里程碑配置
            const config = await this.getMilestoneConfig(groupId);
            if (!config || !config.settings.broadcast_achievement) {
                return;
            }
            
            // 获取用户信息
            const db = this.levelDb.getDatabase();
            const userStmt = db.prepare(`
                SELECT display_name, username FROM user_levels WHERE user_id = ?
            `);
            const user = userStmt.get(userId);
            
            const userName = user?.display_name || `用户${userId}`;
            
            // 构建广播消息
            const message = `🎉 恭喜 ${userName} 达成里程碑！\n\n` +
                          `${milestone.icon} ${milestone.name}\n` +
                          `📝 ${milestone.description}\n` +
                          `🎁 奖励：${milestone.reward_description}`;
            
            // 使用播报服务发送消息
            const broadcastService = require('./broadcastService');
            if (broadcastService && broadcastService.getInstance) {
                const broadcaster = broadcastService.getInstance();
                await broadcaster.broadcastMilestone(userId, groupId, {
                    milestone,
                    user_name: userName,
                    message
                });
            }
            
        } catch (error) {
            console.error('广播里程碑达成失败:', error);
        }
    }
}

// 导出单例
let instance = null;
module.exports = {
    getInstance: () => {
        if (!instance) {
            instance = new MilestoneService();
        }
        return instance;
    }
}; 