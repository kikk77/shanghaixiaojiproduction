/**
 * 等级系统播报服务
 * 负责等级提升、勋章解锁等事件的群组播报
 */

class BroadcastService {
    constructor() {
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
        this.levelDb = null;
        this.initializationError = null;
        
        if (!this.enabled) {
            console.log('🏆 等级系统播报服务已禁用');
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
            console.error('❌ 等级系统播报服务初始化失败:', error.message);
        }
        
        // 获取Bot服务
        this.getBotService = () => {
            try {
                const botService = require('../../services/botService');
                return botService.bot ? botService : null;
            } catch (error) {
                console.error('获取Bot服务失败:', error);
                return null;
            }
        };
        
        // 默认播报模板
        this.defaultTemplates = {
            level_up: {
                template: `🎉 恭喜升级！🎉

🧑‍🚀 {{user_name}}
⭐ Lv.{{old_level}} → Lv.{{new_level}} {{level_name}}
💎 升级奖励：{{level_up_points}}积分

继续努力，成为传说勇士！💪`,
                enablePin: true,
                pinDuration: 5000 // 5秒后取消置顶
            },
            badge_unlock: {
                template: `🏆 {{user_name}} 解锁了新勋章！
{{badge_emoji}} {{badge_name}}
{{badge_desc}}`,
                enablePin: false
            },
            milestone: {
                template: `🎯 里程碑达成！

🧑‍🚀 {{user_name}}
{{milestone_icon}} {{milestone_name}}
📝 {{milestone_description}}
🎁 奖励：{{reward_description}}

恭喜达成新里程碑！🎉`,
                enablePin: false
            },
            perfect_score: {
                template: `⭐️ 完美评价！

{{user_name}} 获得了满分评价！
额外奖励：{{bonus_exp}} 经验值 + {{bonus_points}} 积分`,
                enablePin: false
            }
        };
    }
    
    /**
     * 检查服务是否可用
     */
    isAvailable() {
        return this.enabled && !this.initializationError && this.levelDb && this.levelDb.getDatabase();
    }
    
    /**
     * 安全执行播报操作
     */
    async safeBroadcast(broadcastType, operation, ...args) {
        if (!this.isAvailable()) {
            return { success: false, error: '播报服务不可用' };
        }
        
        try {
            return await operation.apply(this, args);
        } catch (error) {
            console.error(`等级系统播报 ${broadcastType} 失败:`, error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 播报等级提升
     */
    async broadcastLevelUp(userId, sourceGroupId, levelUpResult) {
        return await this.safeBroadcast('levelUp', this._broadcastLevelUpInternal, userId, sourceGroupId, levelUpResult);
    }
    
    /**
     * 内部播报等级提升方法
     */
    async _broadcastLevelUpInternal(userId, sourceGroupId, levelUpResult) {
        // 获取用户信息
        const levelService = require('./levelService').getInstance();
        const userInfo = await levelService.getUserDisplayInfo(userId);
        
        // 获取播报配置
        const broadcastConfig = await this.getBroadcastConfig();
        if (!broadcastConfig || !broadcastConfig.level_up) {
            console.log('等级提升播报未启用');
            return { success: false, error: '播报未启用' };
        }
        
        // 获取播报模板
        const template = await this.getBroadcastTemplate('level_up');
        
        // 准备模板数据
        const templateData = {
            user_name: userInfo.displayName,
            old_level: levelUpResult.oldLevel,
            new_level: levelUpResult.newLevel,
            level_name: levelUpResult.newLevelInfo.name,
            level_up_points: 50 // TODO: 从配置中获取
        };
        
        // 渲染消息
        const message = this.renderTemplate(template.template, templateData);
        
        // 获取播报目标群组
        const targetGroups = await this.getBroadcastTargetGroups();
        
        if (targetGroups.length === 0) {
            console.log('没有配置播报群组');
            return { success: false, error: '无播报群组' };
        }
        
        // 播报到所有群组
        const results = await this.sendToGroups(targetGroups, message, template.enablePin, template.pinDuration);
        
        // 记录播报日志
        await this.logBroadcast('level_up', userId, sourceGroupId, results);
        
        return {
            success: true,
            results: results
        };
    }
    
    /**
     * 播报勋章解锁
     */
    async broadcastBadgeUnlock(userId, badgeInfo) {
        return await this.safeBroadcast('badgeUnlock', this._broadcastBadgeUnlockInternal, userId, badgeInfo);
    }
    
    /**
     * 内部播报勋章解锁方法
     */
    async _broadcastBadgeUnlockInternal(userId, badgeInfo) {
        // 获取用户信息
        const levelService = require('./levelService').getInstance();
        const userInfo = await levelService.getUserDisplayInfo(userId);
        
        // 获取播报配置
        const broadcastConfig = await this.getBroadcastConfig();
        if (!broadcastConfig || !broadcastConfig.badge_unlock) {
            console.log('勋章解锁播报未启用');
            return { success: false, error: '播报未启用' };
        }
        
        // 获取播报模板
        const template = await this.getBroadcastTemplate('badge_unlock');
        
        // 准备模板数据
        const templateData = {
            user_name: userInfo.displayName,
            badge_emoji: badgeInfo.badge_emoji,
            badge_name: badgeInfo.badge_name,
            badge_desc: badgeInfo.badge_desc
        };
        
        // 渲染消息
        const message = this.renderTemplate(template.template, templateData);
        
        // 获取播报目标群组
        const targetGroups = await this.getBroadcastTargetGroups();
        
        if (targetGroups.length === 0) {
            return { success: false, error: '无播报群组' };
        }
        
        // 播报到所有群组
        const results = await this.sendToGroups(targetGroups, message, template.enablePin, template.pinDuration);
        
        // 记录播报日志
        await this.logBroadcast('badge_unlock', userId, null, results);
        
        return {
            success: true,
            results: results
        };
    }
    
    /**
     * 播报里程碑达成
     */
    async broadcastMilestone(userId, groupId, milestoneData) {
        return await this.safeBroadcast('milestone', this._broadcastMilestoneInternal, userId, groupId, milestoneData);
    }
    
    /**
     * 内部播报里程碑方法
     */
    async _broadcastMilestoneInternal(userId, groupId, milestoneData) {
        // 获取用户信息
        const levelService = require('./levelService').getInstance();
        const userInfo = await levelService.getUserDisplayInfo(userId);
        
        // 获取播报配置
        const broadcastConfig = await this.getBroadcastConfig();
        if (!broadcastConfig || !broadcastConfig.milestone) {
            console.log('里程碑播报未启用');
            return { success: false, error: '播报未启用' };
        }
        
        // 获取播报模板
        const template = await this.getBroadcastTemplate('milestone');
        
        // 准备模板数据
        const milestone = milestoneData.milestone;
        const templateData = {
            user_name: milestoneData.user_name || userInfo.displayName,
            milestone_icon: milestone.icon,
            milestone_name: milestone.name,
            milestone_description: milestone.description,
            reward_description: milestone.reward_description,
            required_points: milestone.required_points
        };
        
        // 渲染消息
        const message = this.renderTemplate(template.template, templateData);
        
        // 获取播报目标群组
        const targetGroups = await this.getBroadcastTargetGroups();
        
        if (targetGroups.length === 0) {
            return { success: false, error: '无播报群组' };
        }
        
        // 播报到所有群组
        const results = await this.sendToGroups(targetGroups, message, template.enablePin, template.pinDuration);
        
        // 记录播报日志
        await this.logBroadcast('milestone', userId, groupId, results);
        
        return {
            success: true,
            results: results
        };
    }
    
    /**
     * 获取播报配置
     */
    async getBroadcastConfig() {
        const db = this.levelDb.getDatabase();
        if (!db) return null;
        
        try {
            // 先尝试获取环境变量指定的群组配置
            const envGroupId = process.env.GROUP_CHAT_ID;
            if (envGroupId) {
                const stmt = db.prepare(`
                    SELECT broadcast_config FROM group_configs 
                    WHERE group_id = ? AND status = 'active'
                `);
                const result = stmt.get(envGroupId);
                if (result) {
                    return JSON.parse(result.broadcast_config);
                }
            }
            
            // 回退到全局配置
            const globalStmt = db.prepare(`
                SELECT broadcast_config FROM group_configs 
                WHERE group_id = 'global' AND status = 'active'
            `);
            const globalResult = globalStmt.get();
            if (globalResult) {
                return JSON.parse(globalResult.broadcast_config);
            }
            
            return null;
        } catch (error) {
            console.error('获取播报配置失败:', error);
            return null;
        }
    }
    
    /**
     * 获取播报模板
     */
    async getBroadcastTemplate(type) {
        // TODO: 从数据库获取自定义模板
        // 目前使用默认模板
        return this.defaultTemplates[type] || this.defaultTemplates.level_up;
    }
    
    /**
     * 渲染模板
     */
    renderTemplate(template, data) {
        let message = template;
        
        // 替换所有变量
        for (const [key, value] of Object.entries(data)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            message = message.replace(regex, value);
        }
        
        return message;
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
            const groupIds = groups.map(g => g.group_id);
            
            // 如果没有配置任何群组，使用环境变量中的群组
            if (groupIds.length === 0 && process.env.GROUP_CHAT_ID) {
                return [process.env.GROUP_CHAT_ID];
            }
            
            return groupIds;
        } catch (error) {
            console.error('获取播报目标群组失败:', error);
            // 错误时返回环境变量配置的群组
            return process.env.GROUP_CHAT_ID ? [process.env.GROUP_CHAT_ID] : [];
        }
    }
    
    /**
     * 发送消息到群组
     */
    async sendToGroups(groupIds, message, enablePin = false, pinDuration = 5000) {
        const results = [];
        const botService = this.getBotService();
        
        if (!botService || !botService.bot) {
            console.error('Bot服务不可用');
            return [{
                groupId: 'all',
                success: false,
                error: 'Bot服务不可用'
            }];
        }
        
        // 限制并发发送，避免触发Telegram限制
        const maxConcurrent = 3;
        const chunks = [];
        for (let i = 0; i < groupIds.length; i += maxConcurrent) {
            chunks.push(groupIds.slice(i, i + maxConcurrent));
        }
        
        for (const chunk of chunks) {
            const promises = chunk.map(groupId => this.sendToSingleGroup(botService.bot, groupId, message, enablePin, pinDuration));
            const chunkResults = await Promise.allSettled(promises);
            
            chunkResults.forEach((result, index) => {
                const groupId = chunk[index];
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    results.push({
                        groupId: groupId,
                        success: false,
                        error: result.reason?.message || '未知错误'
                    });
                }
            });
            
            // 在批次之间添加短暂延迟
            if (chunks.indexOf(chunk) < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        return results;
    }
    
    /**
     * 发送消息到单个群组
     */
    async sendToSingleGroup(bot, groupId, message, enablePin = false, pinDuration = 5000) {
        try {
            // 设置发送超时
            const sendPromise = bot.sendMessage(groupId, message, {
                parse_mode: 'HTML'
            });
            
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('发送超时')), 10000);
            });
            
            const sentMessage = await Promise.race([sendPromise, timeoutPromise]);
            
            // 置顶消息
            if (enablePin) {
                try {
                    await bot.pinChatMessage(groupId, sentMessage.message_id);
                    
                    // 设置定时取消置顶
                    if (pinDuration > 0) {
                        setTimeout(async () => {
                            try {
                                await bot.unpinChatMessage(groupId, sentMessage.message_id);
                            } catch (err) {
                                // 忽略取消置顶的错误
                            }
                        }, pinDuration);
                    }
                } catch (pinError) {
                    console.log(`群组 ${groupId} 置顶消息失败:`, pinError.message);
                }
            }
            
            console.log(`✅ 播报成功发送到群组: ${groupId}`);
            
            return {
                groupId: groupId,
                success: true,
                messageId: sentMessage.message_id
            };
            
        } catch (error) {
            console.error(`❌ 向群组 ${groupId} 播报失败:`, error);
            return {
                groupId: groupId,
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * 记录播报日志
     */
    async logBroadcast(type, userId, sourceGroupId, results) {
        // TODO: 实现播报日志记录
        console.log(`播报日志 - 类型: ${type}, 用户: ${userId}, 结果:`, results);
    }
    
    /**
     * 测试播报功能
     */
    async testBroadcast(type = 'level_up', testData = {}) {
        const defaultTestData = {
            level_up: {
                user_name: '测试用户',
                old_level: 1,
                new_level: 2,
                level_name: '初级勇士 🔵',
                level_up_points: 50
            },
            badge_unlock: {
                user_name: '测试用户',
                badge_emoji: '🏆',
                badge_name: '测试勋章',
                badge_desc: '这是一个测试勋章'
            },
            milestone: {
                user_name: '测试用户',
                milestone_icon: '🎯',
                milestone_name: '积分新手',
                milestone_description: '累计获得100积分',
                reward_description: '奖励20积分',
                required_points: 100
            }
        };
        
        const template = await this.getBroadcastTemplate(type);
        const data = { ...defaultTestData[type], ...testData };
        const message = this.renderTemplate(template.template, data);
        
        console.log('测试播报消息:', message);
        
        const targetGroups = await this.getBroadcastTargetGroups();
        if (targetGroups.length === 0) {
            return { success: false, error: '没有配置播报群组' };
        }
        
        const results = await this.sendToGroups(targetGroups, message, false);
        
        return {
            success: true,
            message: message,
            results: results
        };
    }
}

// 导出单例
let instance = null;
module.exports = {
    getInstance: () => {
        if (!instance) {
            instance = new BroadcastService();
        }
        return instance;
    }
}; 