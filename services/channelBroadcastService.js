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
            prefixes: ['小鸡报告：', '小鸡报告:', '小鸡报告'],
            fields: {
                warrior: '战士留名：',
                teacher: '老师艺名：',
                cost: '出击费用：',
                location: '战场位置：',
                situation: '交战情况：'
            }
        };
        
        // 播报模板
        this.broadcastTemplate = '🎉 恭喜小鸡的勇士：{warrior}用户 出击了 {teacher}！\n🐤 小鸡出征！咯咯哒咯咯哒～';
        
        // 🔥 修复: 初始化默认播报配置
        this.initializeDefaultBroadcastConfigs();
        
        // 初始化监听器
        this.initializeMessageListeners();
    }

    /**
     * 初始化默认播报配置
     */
    async initializeDefaultBroadcastConfigs() {
        try {
            // 从环境变量获取配置
            const sourceChannelId = process.env.BROADCAST_SOURCE_CHANNEL_ID || '-1002828316920';
            const targetGroupId = process.env.GROUP_CHAT_ID;
            
            if (!targetGroupId) {
                console.log('⚠️ [播报服务] 未设置GROUP_CHAT_ID，跳过默认播报配置');
                return;
            }
            
            console.log(`📢 [播报服务] 初始化默认播报配置: ${sourceChannelId} -> ${targetGroupId}`);
            
            // 检查是否已有配置
            const existingConfig = await this.getBroadcastConfig(sourceChannelId);
            if (existingConfig) {
                console.log(`📢 [播报服务] 频道 ${sourceChannelId} 已有播报配置`);
                return;
            }
            
            // 创建默认播报配置
            const result = await this.addBroadcastConfig(sourceChannelId, [targetGroupId]);
            if (result.success) {
                console.log(`✅ [播报服务] 默认播报配置创建成功`);
            } else {
                console.log(`❌ [播报服务] 默认播报配置创建失败:`, result.error);
            }
            
        } catch (error) {
            console.error('❌ [播报服务] 初始化默认播报配置失败:', error);
        }
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
            // 只在调试模式下输出详细日志，减少生产环境的日志噪音
            if (process.env.NODE_ENV === 'development') {
                console.warn(`⚠️ [播报服务] [${this.instanceId}] 检测到其他活跃的播报监听器: ${global.channelBroadcastListenerActive}`);
            }
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
            
            console.log(`📢 [播报服务] [${this.instanceId}] 收到频道消息: ${chatId} - ${message.message_id}`);
            
            // 检查是否已处理过
            if (this.processedMessages.has(messageKey)) {
                console.log(`📢 [播报服务] [${this.instanceId}] 消息已处理过，跳过: ${messageKey}`);
                return;
            }
            
            // 标记为已处理
            this.processedMessages.add(messageKey);
            
            // 检查是否为文字消息
            if (!message.text) {
                console.log(`📢 [播报服务] [${this.instanceId}] 非文字消息，跳过处理`);
                return; // 只处理文字消息
            }
            
            console.log(`📢 [播报服务] [${this.instanceId}] 消息内容: ${message.text.substring(0, 100)}...`);
            
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
            
            // 解析小鸡报告
            const reportData = this.parseChickenReport(message.text);
            if (!reportData) {
                console.log(`📢 [播报服务] [${this.instanceId}] 不是小鸡报告格式，跳过播报`);
                return;
            }
            
            console.log(`📢 [播报服务] [${this.instanceId}] 解析到小鸡报告:`, reportData);
            
            // 生成播报消息
            const broadcastMessage = await this.generateBroadcastMessage(reportData, message);
            if (!broadcastMessage) {
                console.log(`📢 [播报服务] [${this.instanceId}] 生成播报消息失败，跳过播报`);
                return;
            }
            
            console.log(`📢 [播报服务] [${this.instanceId}] 生成播报消息:`, broadcastMessage);
            
            // 发送播报到目标群组
            await this.sendBroadcastToGroups(broadcastConfig, broadcastMessage);
            
            this.broadcastStats.totalBroadcasts++;
            this.broadcastStats.lastBroadcastTime = new Date();
            
            console.log(`✅ [播报服务] [${this.instanceId}] 播报发送成功`);
            
        } catch (error) {
            console.error(`❌ [播报服务] [${this.instanceId}] 处理频道播报消息失败:`, error);
            this.broadcastStats.totalErrors++;
        }
    }

    /**
     * 解析小鸡报告
     */
    parseChickenReport(text) {
        try {
            // 🔥 修复: 检查是否包含任何一种小鸡报告前缀
            let hasValidPrefix = false;
            for (const prefix of this.reportTemplate.prefixes) {
                if (text.includes(prefix)) {
                    hasValidPrefix = true;
                    break;
                }
            }
            
            if (!hasValidPrefix) {
                console.log(`📢 [播报服务] 未找到小鸡报告前缀，跳过播报`);
                return null;
            }
            
            console.log(`📢 [播报服务] 发现小鸡报告前缀，开始解析`);
            
            const lines = text.split('\n');
            const reportData = {};
            
            // 解析各个字段 - 支持多种冒号格式
            for (const line of lines) {
                const trimmedLine = line.trim();
                
                // 🔥 修复: 支持中文冒号和英文冒号
                if (trimmedLine.includes('战士留名')) {
                    const match = trimmedLine.match(/战士留名[：:]\s*(.+)/);
                    if (match) reportData.warrior = match[1].trim();
                } else if (trimmedLine.includes('老师艺名')) {
                    const match = trimmedLine.match(/老师艺名[：:]\s*(.+)/);
                    if (match) reportData.teacher = match[1].trim();
                } else if (trimmedLine.includes('出击费用')) {
                    const match = trimmedLine.match(/出击费用[：:]\s*(.+)/);
                    if (match) reportData.cost = match[1].trim();
                } else if (trimmedLine.includes('战场位置')) {
                    const match = trimmedLine.match(/战场位置[：:]\s*(.+)/);
                    if (match) reportData.location = match[1].trim();
                } else if (trimmedLine.includes('交战情况')) {
                    const match = trimmedLine.match(/交战情况[：:]\s*(.+)/);
                    if (match) reportData.situation = match[1].trim();
                }
            }
            
            console.log(`📢 [播报服务] 解析结果:`, reportData);
            
            // 检查必要字段
            if (!reportData.teacher) {
                console.log(`📢 [播报服务] 缺少老师艺名，跳过播报`);
                return null;
            }
            
            // 处理空的战士留名
            if (!reportData.warrior || reportData.warrior === '') {
                reportData.warrior = '匿名';
            }
            
            console.log(`📢 [播报服务] 小鸡报告解析成功:`, reportData);
            return reportData;
            
        } catch (error) {
            console.error('解析小鸡报告失败:', error);
            return null;
        }
    }

    /**
     * 生成播报消息
     */
    async generateBroadcastMessage(reportData, originalMessage) {
        try {
            // 处理战士名称
            const warriorName = reportData.warrior === '匿名' ? '匿名' : reportData.warrior;
            
            // 匹配活跃商家并处理老师名称格式
            const teacherName = await this.matchAndFormatTeacherName(reportData.teacher);
            
            // 生成播报内容
            let broadcastText = this.broadcastTemplate
                .replace('{warrior}', warriorName)
                .replace('{teacher}', teacherName);
            
            // 生成消息链接
            const messageLink = this.generateMessageLink(originalMessage);
            
            // 添加消息链接
            if (messageLink) {
                broadcastText += `\n\n📎 查看报告：${messageLink}`;
            }
            
            return broadcastText;
            
        } catch (error) {
            console.error('生成播报消息失败:', error);
            return null;
        }
    }

    /**
     * 匹配活跃商家并格式化老师名称
     */
    async matchAndFormatTeacherName(inputTeacherName) {
        try {
            // 获取活跃商家列表
            const dbOperations = require('../models/dbOperations');
            const activeMerchants = dbOperations.getActiveMerchants();
            
            console.log(`📢 [播报服务] 匹配老师名称: ${inputTeacherName}`);
            console.log(`📢 [播报服务] 活跃商家数量: ${activeMerchants.length}`);
            
            // 清理输入的老师名称（移除可能的#号和空格）
            const cleanInputName = inputTeacherName.replace(/^#+\s*/, '').trim();
            
            // 尝试匹配商家
            let matchedMerchant = null;
            
            // 1. 精确匹配 teacher_name
            matchedMerchant = activeMerchants.find(merchant => 
                merchant.teacher_name && merchant.teacher_name.replace(/^#+\s*/, '').trim() === cleanInputName
            );
            
            // 2. 如果没有精确匹配，尝试模糊匹配
            if (!matchedMerchant) {
                matchedMerchant = activeMerchants.find(merchant => 
                    merchant.teacher_name && 
                    (merchant.teacher_name.replace(/^#+\s*/, '').trim().includes(cleanInputName) ||
                     cleanInputName.includes(merchant.teacher_name.replace(/^#+\s*/, '').trim()))
                );
            }
            
            // 3. 尝试匹配用户名
            if (!matchedMerchant) {
                matchedMerchant = activeMerchants.find(merchant => 
                    merchant.username && merchant.username === cleanInputName
                );
            }
            
            if (matchedMerchant) {
                console.log(`📢 [播报服务] 匹配到商家: ${matchedMerchant.teacher_name}`);
                
                // 使用匹配到的商家名称，确保格式正确
                let teacherName = matchedMerchant.teacher_name.trim();
                
                // 如果商家名称不以#开头，添加#
                if (!teacherName.startsWith('#')) {
                    teacherName = '#' + teacherName;
                }
                
                return teacherName;
            } else {
                console.log(`📢 [播报服务] 未匹配到商家，使用原始名称: ${inputTeacherName}`);
                
                // 如果没有匹配到商家，格式化原始名称
                let formattedName = cleanInputName;
                if (!formattedName.startsWith('#')) {
                    formattedName = '#' + formattedName;
                }
                
                return formattedName;
            }
            
        } catch (error) {
            console.error('匹配商家名称失败:', error);
            
            // 出错时返回格式化的原始名称
            let fallbackName = inputTeacherName.replace(/^#+\s*/, '').trim();
            if (!fallbackName.startsWith('#')) {
                fallbackName = '#' + fallbackName;
            }
            return fallbackName;
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
                    const sentMessage = await this.bot.sendMessage(groupId, broadcastMessage, {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true
                    });
                    
                    console.log(`📢 播报已发送到群组: ${groupId}, message_id: ${sentMessage.message_id}`);
                    
                    // 🔥 修复Bug1: 自动置顶播报消息
                    try {
                        console.log(`📌 正在置顶播报消息...`);
                        await this.bot.pinChatMessage(groupId, sentMessage.message_id);
                        console.log(`📌 播报消息已置顶: ${sentMessage.message_id}`);
                    } catch (pinError) {
                        console.log(`⚠️ 置顶消息失败: ${pinError.message}`);
                        // 置顶失败不影响播报成功
                    }
                    
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
                
                const result = await this.configService.saveConfig(configData);
                if (result.success) {
                    console.log(`✅ 创建播报配置成功`);
                } else {
                    throw new Error(result.errors?.join(', ') || '创建配置失败');
                }
            } else {
                // 更新现有配置
                config.settings.broadcastEnabled = true;
                config.settings.broadcastTargetGroups = targetGroups;
                
                const result = await this.configService.saveConfig(config);
                if (result.success) {
                    console.log(`✅ 更新播报配置成功`);
                } else {
                    throw new Error(result.errors?.join(', ') || '更新配置失败');
                }
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