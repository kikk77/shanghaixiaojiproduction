const ChannelConfigService = require('./channelConfigService');

/**
 * 频道播报服务
 * 监听指定频道的消息，解析小鸡报告模板，并在目标群组播报
 */
class ChannelBroadcastService {
    constructor(bot) {
        this.bot = bot;
        this.configService = new ChannelConfigService();
        
        // 实例标识
        this.instanceId = Math.random().toString(36).substring(2, 8);
        console.log(`📢 [播报服务] 频道播报服务实例创建: ${this.instanceId}`);
        console.log(`📢 [播报服务] Bot实例状态:`, !!bot);
        
        // 播报配置
        this.broadcastConfigs = new Map(); // configId -> 播报配置
        
        // 消息处理去重器
        if (!global.channelBroadcastProcessedMessages) {
            global.channelBroadcastProcessedMessages = new Set();
        }
        this.processedMessages = global.channelBroadcastProcessedMessages;
        
        // 播报统计
        this.broadcastStats = {
            totalBroadcasts: 0,
            totalErrors: 0,
            lastBroadcastTime: null
        };
        
        // 小鸡报告模板定义
        this.reportTemplate = {
            prefix: '小鸡报告：',
            fields: {
                warrior: '战士留名：',
                teacher: '老师艺名：',
                cost: '出击费用：',
                location: '战场位置：',
                situation: '交战情况：'
            }
        };
        
        // 播报模板
        this.broadcastTemplate = '🎉 恭喜小鸡的勇士：{warrior}用户 出击了 #{teacher} 老师！\n🐤 小鸡出征！咯咯哒咯咯哒～';
        
        // 初始化监听器
        this.initializeMessageListeners();
    }

    /**
     * 初始化消息监听器
     */
    initializeMessageListeners() {
        if (!this.bot) {
            console.error('❌ [播报服务] Bot未初始化，无法设置播报监听器');
            return;
        }

        // 检查是否已有其他实例的监听器
        if (global.channelBroadcastListenerActive && global.channelBroadcastListenerActive !== this.instanceId) {
            console.warn(`⚠️ [播报服务] [${this.instanceId}] 检测到其他活跃的播报监听器: ${global.channelBroadcastListenerActive}`);
            return;
        }
        
        // 标记监听器为活跃状态
        global.channelBroadcastListenerActive = this.instanceId;

        // 监听频道消息
        this.bot.on('channel_post', (msg) => {
            console.log(`📢 [播报服务] [${this.instanceId}] 收到频道消息: ${msg.chat.id} - ${msg.message_id}`);
            this.handleChannelMessage(msg);
        });

        console.log(`📢 [播报服务] [${this.instanceId}] 频道播报监听器已初始化`);
    }

    /**
     * 处理频道消息
     */
    async handleChannelMessage(message) {
        try {
            const chatId = message.chat.id.toString();
            const messageKey = `${chatId}_${message.message_id}`;
            
            // 检查是否已处理过
            if (this.processedMessages.has(messageKey)) {
                return;
            }
            
            // 标记为已处理
            this.processedMessages.add(messageKey);
            
            // 获取播报配置
            const broadcastConfig = await this.getBroadcastConfig(chatId);
            if (!broadcastConfig) {
                console.log(`📢 [播报服务] [${this.instanceId}] 未找到频道 ${chatId} 的播报配置，跳过处理`);
                return; // 没有配置
            }
            
            if (!broadcastConfig.enabled) {
                console.log(`📢 [播报服务] [${this.instanceId}] 频道 ${chatId} 的播报配置已禁用，跳过处理`);
                return; // 配置已禁用
            }
            
            console.log(`📢 [播报服务] [${this.instanceId}] 找到有效播报配置:`, {
                channelId: chatId,
                targetGroups: broadcastConfig.targetGroups,
                enabled: broadcastConfig.enabled
            });
            
            // 检查是否为文字消息
            if (!message.text) {
                return; // 只处理文字消息
            }
            
            console.log(`📢 [播报服务] [${this.instanceId}] 收到频道消息: ${chatId} - ${message.message_id}`);
            console.log(`📢 [播报服务] 消息内容: ${message.text.substring(0, 100)}...`);
            
            // 解析小鸡报告
            const reportData = this.parseChickenReport(message.text);
            if (!reportData) {
                console.log(`📢 [播报服务] 不是小鸡报告格式，跳过播报`);
                return;
            }
            
            console.log(`📢 [播报服务] 解析到小鸡报告:`, reportData);
            
            // 生成播报消息
            const broadcastMessage = this.generateBroadcastMessage(reportData, message);
            
            // 发送播报到目标群组
            await this.sendBroadcastToGroups(broadcastConfig, broadcastMessage);
            
            this.broadcastStats.totalBroadcasts++;
            this.broadcastStats.lastBroadcastTime = new Date();
            
            console.log(`✅ 播报发送成功`);
            
        } catch (error) {
            console.error('处理频道播报消息失败:', error);
            this.broadcastStats.totalErrors++;
        }
    }

    /**
     * 解析小鸡报告
     */
    parseChickenReport(text) {
        try {
            // 检查是否包含小鸡报告前缀
            if (!text.includes(this.reportTemplate.prefix)) {
                return null;
            }
            
            const lines = text.split('\n');
            const reportData = {};
            
            // 解析各个字段
            for (const line of lines) {
                const trimmedLine = line.trim();
                
                if (trimmedLine.startsWith(this.reportTemplate.fields.warrior)) {
                    reportData.warrior = trimmedLine.replace(this.reportTemplate.fields.warrior, '').trim();
                } else if (trimmedLine.startsWith(this.reportTemplate.fields.teacher)) {
                    reportData.teacher = trimmedLine.replace(this.reportTemplate.fields.teacher, '').trim();
                } else if (trimmedLine.startsWith(this.reportTemplate.fields.cost)) {
                    reportData.cost = trimmedLine.replace(this.reportTemplate.fields.cost, '').trim();
                } else if (trimmedLine.startsWith(this.reportTemplate.fields.location)) {
                    reportData.location = trimmedLine.replace(this.reportTemplate.fields.location, '').trim();
                } else if (trimmedLine.startsWith(this.reportTemplate.fields.situation)) {
                    reportData.situation = trimmedLine.replace(this.reportTemplate.fields.situation, '').trim();
                }
            }
            
            // 检查必要字段
            if (!reportData.teacher) {
                console.log(`📢 缺少老师艺名，跳过播报`);
                return null;
            }
            
            // 处理空的战士留名
            if (!reportData.warrior || reportData.warrior === '') {
                reportData.warrior = '匿名';
            }
            
            return reportData;
            
        } catch (error) {
            console.error('解析小鸡报告失败:', error);
            return null;
        }
    }

    /**
     * 生成播报消息
     */
    generateBroadcastMessage(reportData, originalMessage) {
        try {
            // 处理战士名称
            const warriorName = reportData.warrior === '匿名' ? '匿名' : reportData.warrior;
            
            // 生成播报内容
            let broadcastText = this.broadcastTemplate
                .replace('{warrior}', warriorName)
                .replace('{teacher}', reportData.teacher);
            
            // 生成消息链接
            const messageLink = this.generateMessageLink(originalMessage);
            
            // 添加消息链接
            if (messageLink) {
                broadcastText += `\n\n📎 原始消息：${messageLink}`;
            }
            
            return broadcastText;
            
        } catch (error) {
            console.error('生成播报消息失败:', error);
            return null;
        }
    }

    /**
     * 生成消息链接
     */
    generateMessageLink(message) {
        try {
            const chatId = message.chat.id.toString();
            const messageId = message.message_id;
            
            // 获取频道用户名（如果有）
            const channelUsername = message.chat.username;
            
            if (channelUsername) {
                return `https://t.me/${channelUsername}/${messageId}`;
            } else {
                // 使用频道ID格式（需要去掉-100前缀）
                const channelIdForLink = chatId.startsWith('-100') ? chatId.substring(4) : chatId;
                return `https://t.me/c/${channelIdForLink}/${messageId}`;
            }
            
        } catch (error) {
            console.error('生成消息链接失败:', error);
            return null;
        }
    }

    /**
     * 发送播报到目标群组
     */
    async sendBroadcastToGroups(broadcastConfig, broadcastMessage) {
        try {
            const targetGroups = broadcastConfig.targetGroups || [];
            
            if (targetGroups.length === 0) {
                console.log(`📢 没有配置目标群组，跳过播报`);
                return;
            }
            
            for (const groupId of targetGroups) {
                try {
                    await this.bot.sendMessage(groupId, broadcastMessage, {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true
                    });
                    
                    console.log(`📢 播报已发送到群组: ${groupId}`);
                    
                } catch (error) {
                    console.error(`发送播报到群组 ${groupId} 失败:`, error);
                }
            }
            
        } catch (error) {
            console.error('发送播报失败:', error);
        }
    }

    /**
     * 获取播报配置
     */
    async getBroadcastConfig(channelId) {
        try {
            // 从配置服务获取播报配置
            const configs = await this.configService.getAllConfigs();
            
            // 查找匹配的播报配置
            for (const config of configs) {
                if (config.sourceChannel && config.sourceChannel.id === channelId) {
                    // 检查是否启用播报功能
                    if (config.settings && config.settings.broadcastEnabled) {
                        return {
                            enabled: true,
                            targetGroups: config.settings.broadcastTargetGroups || [],
                            channelId: channelId
                        };
                    }
                }
            }
            
            return null;
            
        } catch (error) {
            console.error('获取播报配置失败:', error);
            return null;
        }
    }

    /**
     * 添加播报配置
     */
    async addBroadcastConfig(channelId, targetGroups) {
        try {
            console.log(`📢 添加播报配置: ${channelId} -> ${targetGroups.join(', ')}`);
            
            // 检查是否已有配置
            let config = await this.configService.getConfigBySourceChannel(channelId);
            
            if (!config) {
                // 创建新配置
                const configData = {
                    name: `播报配置_${channelId}`,
                    sourceChannel: { id: channelId },
                    targetChannel: { id: channelId }, // 播报功能不需要目标频道
                    settings: {
                        enabled: true,
                        broadcastEnabled: true,
                        broadcastTargetGroups: targetGroups,
                        syncEdits: false,
                        filterEnabled: false,
                        rateLimit: 30,
                        delaySeconds: 0,
                        sequentialMode: false
                    }
                };
                
                await this.configService.createConfig(configData);
                console.log(`✅ 创建播报配置成功`);
            } else {
                // 更新现有配置
                config.settings.broadcastEnabled = true;
                config.settings.broadcastTargetGroups = targetGroups;
                
                await this.configService.updateConfig(config.name, config);
                console.log(`✅ 更新播报配置成功`);
            }
            
            return { success: true };
            
        } catch (error) {
            console.error('添加播报配置失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取播报统计
     */
    getBroadcastStats() {
        return {
            totalBroadcasts: this.broadcastStats.totalBroadcasts,
            totalErrors: this.broadcastStats.totalErrors,
            lastBroadcastTime: this.broadcastStats.lastBroadcastTime,
            instanceId: this.instanceId
        };
    }

    /**
     * 停止播报服务
     */
    stop() {
        try {
            if (this.bot) {
                this.bot.removeAllListeners('channel_post');
            }
            
            // 清理全局标记
            if (global.channelBroadcastListenerActive === this.instanceId) {
                global.channelBroadcastListenerActive = null;
            }
            
            console.log(`📢 [${this.instanceId}] 频道播报服务已停止`);
            return { success: true };
        } catch (error) {
            console.error('停止播报服务失败:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = ChannelBroadcastService; 