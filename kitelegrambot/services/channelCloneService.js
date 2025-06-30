const ChannelDataMapper = require('../models/channelDataMapper');
const ChannelConfigService = require('./channelConfigService');

/**
 * 频道克隆核心服务
 * 负责实际的消息克隆操作，包括实时克隆和编辑同步
 */
class ChannelCloneService {
    constructor(bot) {
        this.bot = bot;
        this.dataMapper = new ChannelDataMapper();
        this.configService = new ChannelConfigService();
        
        // 速率限制管理器
        this.rateLimiters = new Map(); // configId -> { tokens, lastRefill }
        
        // 克隆状态追踪
        this.cloneStats = {
            totalCloned: 0,
            totalErrors: 0,
            lastCloneTime: null
        };
        
        // 初始化消息监听器
        this.initializeMessageListeners();
    }

    /**
     * 初始化消息监听器
     */
    initializeMessageListeners() {
        if (!this.bot) {
            console.error('❌ Bot未初始化，无法设置消息监听器');
            return;
        }

        // 监听新消息
        this.bot.on('message', (msg) => {
            this.handleNewMessage(msg);
        });

        // 监听消息编辑
        this.bot.on('edited_message', (msg) => {
            this.handleEditedMessage(msg);
        });

        console.log('📺 频道克隆消息监听器已初始化');
    }

    /**
     * 处理新消息
     */
    async handleNewMessage(message) {
        try {
            const chatId = message.chat.id.toString();
            
            // 查找对应的配置
            const config = await this.configService.getConfigBySourceChannel(chatId);
            if (!config || !config.settings.enabled) {
                return; // 没有配置或配置已禁用
            }

            console.log(`📺 收到源频道 ${chatId} 的新消息 ${message.message_id}`);

            // 检查速率限制
            const rateLimitCheck = await this.checkRateLimit(config);
            if (!rateLimitCheck.allowed) {
                console.log(`📺 速率限制：跳过消息 ${message.message_id}`);
                await this.dataMapper.logAction(
                    config.id,
                    'clone_rate_limited',
                    'warning',
                    '超过速率限制',
                    0,
                    { message_id: message.message_id, source_channel: chatId }
                );
                return;
            }

            // 执行克隆
            const cloneResult = await this.cloneMessage(config, message);
            
            if (cloneResult.success) {
                // 创建消息映射
                await this.dataMapper.createMessageMapping(
                    config.id,
                    message.message_id,
                    cloneResult.targetMessageId,
                    this.getMessageType(message)
                );

                this.cloneStats.totalCloned++;
                this.cloneStats.lastCloneTime = new Date();

                console.log(`✅ 消息克隆成功: ${message.message_id} -> ${cloneResult.targetMessageId}`);
                
                // 记录成功日志
                await this.dataMapper.logAction(
                    config.id,
                    'message_clone',
                    'success',
                    null,
                    cloneResult.processingTime,
                    {
                        source_message_id: message.message_id,
                        target_message_id: cloneResult.targetMessageId,
                        message_type: this.getMessageType(message)
                    }
                );
            } else {
                this.cloneStats.totalErrors++;
                console.error(`❌ 消息克隆失败: ${cloneResult.error}`);
                
                // 记录错误日志
                await this.dataMapper.logAction(
                    config.id,
                    'message_clone',
                    'error',
                    cloneResult.error,
                    cloneResult.processingTime || 0,
                    {
                        source_message_id: message.message_id,
                        message_type: this.getMessageType(message)
                    }
                );
            }
        } catch (error) {
            console.error('处理新消息失败:', error);
        }
    }

    /**
     * 处理编辑的消息
     */
    async handleEditedMessage(message) {
        try {
            const chatId = message.chat.id.toString();
            
            // 查找对应的配置
            const config = await this.configService.getConfigBySourceChannel(chatId);
            if (!config || !config.settings.enabled || !config.settings.syncEdits) {
                return; // 没有配置、配置已禁用或未启用编辑同步
            }

            console.log(`📺 收到源频道 ${chatId} 的消息编辑 ${message.message_id}`);

            // 查找消息映射
            const mapping = await this.dataMapper.getMessageMapping(message.message_id, config.id);
            if (!mapping) {
                console.log(`📺 未找到消息映射: ${message.message_id}`);
                return;
            }

            // 执行编辑同步
            const editResult = await this.syncMessageEdit(config, message, mapping.targetMessageId);
            
            if (editResult.success) {
                console.log(`✅ 消息编辑同步成功: ${message.message_id} -> ${mapping.targetMessageId}`);
                
                // 记录成功日志
                await this.dataMapper.logAction(
                    config.id,
                    'message_edit_sync',
                    'success',
                    null,
                    editResult.processingTime,
                    {
                        source_message_id: message.message_id,
                        target_message_id: mapping.targetMessageId,
                        edit_time: message.edit_date
                    }
                );
            } else {
                console.error(`❌ 消息编辑同步失败: ${editResult.error}`);
                
                // 记录错误日志
                await this.dataMapper.logAction(
                    config.id,
                    'message_edit_sync',
                    'error',
                    editResult.error,
                    editResult.processingTime || 0,
                    {
                        source_message_id: message.message_id,
                        target_message_id: mapping.targetMessageId
                    }
                );
            }
        } catch (error) {
            console.error('处理编辑消息失败:', error);
        }
    }

    /**
     * 克隆单个消息
     */
    async cloneMessage(config, message) {
        const startTime = Date.now();
        
        try {
            let clonedMessage;
            const targetChannelId = config.targetChannel.id;

            // 根据消息类型进行克隆
            if (message.photo && message.photo.length > 0) {
                // 图片消息
                const photo = message.photo[message.photo.length - 1]; // 获取最大尺寸的图片
                clonedMessage = await this.bot.copyMessage(
                    targetChannelId,
                    message.chat.id,
                    message.message_id
                );
            } else if (message.video) {
                // 视频消息
                clonedMessage = await this.bot.copyMessage(
                    targetChannelId,
                    message.chat.id,
                    message.message_id
                );
            } else if (message.document) {
                // 文档消息
                clonedMessage = await this.bot.copyMessage(
                    targetChannelId,
                    message.chat.id,
                    message.message_id
                );
            } else if (message.audio) {
                // 音频消息
                clonedMessage = await this.bot.copyMessage(
                    targetChannelId,
                    message.chat.id,
                    message.message_id
                );
            } else if (message.voice) {
                // 语音消息
                clonedMessage = await this.bot.copyMessage(
                    targetChannelId,
                    message.chat.id,
                    message.message_id
                );
            } else if (message.sticker) {
                // 贴纸消息
                clonedMessage = await this.bot.copyMessage(
                    targetChannelId,
                    message.chat.id,
                    message.message_id
                );
            } else if (message.animation) {
                // GIF动画
                clonedMessage = await this.bot.copyMessage(
                    targetChannelId,
                    message.chat.id,
                    message.message_id
                );
            } else if (message.video_note) {
                // 视频备注
                clonedMessage = await this.bot.copyMessage(
                    targetChannelId,
                    message.chat.id,
                    message.message_id
                );
            } else if (message.location) {
                // 位置消息
                clonedMessage = await this.bot.sendLocation(
                    targetChannelId,
                    message.location.latitude,
                    message.location.longitude
                );
            } else if (message.contact) {
                // 联系人消息
                clonedMessage = await this.bot.sendContact(
                    targetChannelId,
                    message.contact.phone_number,
                    message.contact.first_name,
                    {
                        last_name: message.contact.last_name,
                        vcard: message.contact.vcard
                    }
                );
            } else if (message.poll) {
                // 投票消息
                const pollOptions = message.poll.options.map(option => option.text);
                clonedMessage = await this.bot.sendPoll(
                    targetChannelId,
                    message.poll.question,
                    pollOptions,
                    {
                        is_anonymous: message.poll.is_anonymous,
                        type: message.poll.type,
                        allows_multiple_answers: message.poll.allows_multiple_answers
                    }
                );
            } else if (message.text) {
                // 纯文本消息
                clonedMessage = await this.bot.copyMessage(
                    targetChannelId,
                    message.chat.id,
                    message.message_id
                );
            } else {
                // 其他类型消息，尝试使用copyMessage
                clonedMessage = await this.bot.copyMessage(
                    targetChannelId,
                    message.chat.id,
                    message.message_id
                );
            }

            const processingTime = Date.now() - startTime;

            return {
                success: true,
                targetMessageId: clonedMessage.message_id,
                processingTime
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            console.error('克隆消息失败:', error);
            return {
                success: false,
                error: error.message,
                processingTime
            };
        }
    }

    /**
     * 同步消息编辑
     */
    async syncMessageEdit(config, editedMessage, targetMessageId) {
        const startTime = Date.now();
        
        try {
            const targetChannelId = config.targetChannel.id;

            // 根据消息类型进行编辑同步
            if (editedMessage.text) {
                // 文本消息编辑
                await this.bot.editMessageText(
                    editedMessage.text,
                    {
                        chat_id: targetChannelId,
                        message_id: targetMessageId,
                        parse_mode: editedMessage.entities ? 'HTML' : undefined,
                        disable_web_page_preview: true
                    }
                );
            } else if (editedMessage.caption !== undefined) {
                // 媒体消息标题编辑
                await this.bot.editMessageCaption(
                    editedMessage.caption || '',
                    {
                        chat_id: targetChannelId,
                        message_id: targetMessageId,
                        parse_mode: editedMessage.caption_entities ? 'HTML' : undefined
                    }
                );
            } else {
                // 其他类型的编辑，暂不支持
                throw new Error('不支持的消息编辑类型');
            }

            const processingTime = Date.now() - startTime;

            return {
                success: true,
                processingTime
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            console.error('同步消息编辑失败:', error);
            return {
                success: false,
                error: error.message,
                processingTime
            };
        }
    }

    /**
     * 检查速率限制
     */
    async checkRateLimit(config) {
        const configId = config.id;
        const rateLimit = config.settings.rateLimit || 30; // 默认每分钟30条
        const now = Date.now();

        if (!this.rateLimiters.has(configId)) {
            this.rateLimiters.set(configId, {
                tokens: rateLimit,
                lastRefill: now
            });
        }

        const limiter = this.rateLimiters.get(configId);
        
        // 计算需要补充的令牌数
        const timePassed = now - limiter.lastRefill;
        const tokensToAdd = Math.floor(timePassed / (60 * 1000)) * rateLimit; // 每分钟补充rateLimit个令牌
        
        if (tokensToAdd > 0) {
            limiter.tokens = Math.min(rateLimit, limiter.tokens + tokensToAdd);
            limiter.lastRefill = now;
        }

        // 检查是否有可用令牌
        if (limiter.tokens > 0) {
            limiter.tokens--;
            return { allowed: true, remainingTokens: limiter.tokens };
        } else {
            return { allowed: false, remainingTokens: 0 };
        }
    }

    /**
     * 获取消息类型
     */
    getMessageType(message) {
        if (message.photo) return 'photo';
        if (message.video) return 'video';
        if (message.document) return 'document';
        if (message.audio) return 'audio';
        if (message.voice) return 'voice';
        if (message.sticker) return 'sticker';
        if (message.animation) return 'animation';
        if (message.video_note) return 'video_note';
        if (message.location) return 'location';
        if (message.contact) return 'contact';
        if (message.poll) return 'poll';
        if (message.text) return 'text';
        return 'unknown';
    }

    /**
     * 批量历史消息同步
     */
    async syncHistoryMessages(configName, options = {}) {
        try {
            const {
                limit = 100,
                offsetDate = null,
                progressCallback = null
            } = options;

            const config = await this.configService.getConfig(configName);
            if (!config) {
                throw new Error('配置不存在');
            }

            console.log(`📺 开始同步历史消息: ${configName}, 限制: ${limit}`);

            const results = {
                total: 0,
                success: 0,
                failed: 0,
                errors: []
            };

            // 获取源频道的历史消息
            // 注意：这需要Bot有读取消息历史的权限
            const messages = await this.getChannelHistory(config.sourceChannel.id, limit, offsetDate);
            results.total = messages.length;

            for (let i = 0; i < messages.length; i++) {
                const message = messages[i];
                
                try {
                    // 检查是否已经克隆过
                    const existingMapping = await this.dataMapper.getMessageMapping(message.message_id, config.id);
                    if (existingMapping) {
                        console.log(`📺 消息 ${message.message_id} 已克隆过，跳过`);
                        continue;
                    }

                    // 检查速率限制
                    const rateLimitCheck = await this.checkRateLimit(config);
                    if (!rateLimitCheck.allowed) {
                        console.log(`📺 速率限制：等待60秒后继续`);
                        await this.sleep(60000); // 等待1分钟
                        continue;
                    }

                    // 克隆消息
                    const cloneResult = await this.cloneMessage(config, message);
                    
                    if (cloneResult.success) {
                        // 创建消息映射
                        await this.dataMapper.createMessageMapping(
                            config.id,
                            message.message_id,
                            cloneResult.targetMessageId,
                            this.getMessageType(message)
                        );

                        results.success++;
                        console.log(`✅ 历史消息克隆成功: ${message.message_id} -> ${cloneResult.targetMessageId}`);
                    } else {
                        results.failed++;
                        results.errors.push({
                            messageId: message.message_id,
                            error: cloneResult.error
                        });
                        console.error(`❌ 历史消息克隆失败: ${cloneResult.error}`);
                    }

                    // 调用进度回调
                    if (progressCallback) {
                        progressCallback({
                            current: i + 1,
                            total: messages.length,
                            success: results.success,
                            failed: results.failed
                        });
                    }

                    // 添加延迟避免API限制
                    await this.sleep(1000); // 1秒延迟

                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        messageId: message.message_id,
                        error: error.message
                    });
                    console.error(`❌ 处理历史消息失败: ${error.message}`);
                }
            }

            // 记录同步结果
            await this.dataMapper.logAction(
                config.id,
                'history_sync',
                results.failed === 0 ? 'success' : 'partial',
                results.failed > 0 ? `${results.failed} 条消息同步失败` : null,
                0,
                results
            );

            console.log(`📺 历史消息同步完成: 成功 ${results.success}/${results.total}`);
            return results;

        } catch (error) {
            console.error('同步历史消息失败:', error);
            throw error;
        }
    }

    /**
     * 获取频道历史消息
     */
    async getChannelHistory(channelId, limit = 100, offsetDate = null) {
        try {
            // 注意：这个方法需要Bot API支持获取频道历史
            // 如果Bot API不支持，可能需要使用其他方法
            const messages = [];
            
            // 这里简化实现，实际可能需要更复杂的逻辑
            // 由于Bot API限制，可能无法直接获取历史消息
            // 需要使用其他方法或者依赖消息转发
            
            console.log(`📺 获取频道 ${channelId} 的历史消息功能需要进一步实现`);
            return messages;
            
        } catch (error) {
            console.error('获取频道历史消息失败:', error);
            return [];
        }
    }

    /**
     * 获取克隆统计信息
     */
    getCloneStats() {
        return {
            ...this.cloneStats,
            activeConfigs: this.rateLimiters.size,
            rateLimiters: Array.from(this.rateLimiters.entries()).map(([configId, limiter]) => ({
                configId,
                remainingTokens: limiter.tokens,
                lastRefill: new Date(limiter.lastRefill)
            }))
        };
    }

    /**
     * 重置克隆统计
     */
    resetCloneStats() {
        this.cloneStats = {
            totalCloned: 0,
            totalErrors: 0,
            lastCloneTime: null
        };
        console.log('📺 克隆统计已重置');
    }

    /**
     * 重新加载配置
     */
    async reloadConfigs() {
        try {
            // 清除配置缓存
            this.configService.clearConfigCache();
            
            // 重置速率限制器
            this.rateLimiters.clear();
            
            console.log('📺 频道配置已重新加载');
            
            return { success: true };
        } catch (error) {
            console.error('重新加载配置失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 停止克隆服务
     */
    stop() {
        try {
            if (this.bot) {
                this.bot.removeAllListeners('message');
                this.bot.removeAllListeners('edited_message');
            }
            
            this.rateLimiters.clear();
            
            console.log('📺 频道克隆服务已停止');
            return { success: true };
        } catch (error) {
            console.error('停止克隆服务失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 工具方法：延迟
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ChannelCloneService; 