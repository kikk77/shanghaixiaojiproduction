const ChannelDataMapper = require('../models/channelDataMapper');

/**
 * 频道配置管理服务
 * 负责管理频道克隆配置，支持动态配置，不硬编码频道ID
 */
class ChannelConfigService {
    constructor() {
        this.dataMapper = new ChannelDataMapper();
        this.configCache = new Map(); // 配置缓存
        this.cacheExpiry = 5 * 60 * 1000; // 5分钟缓存过期
    }

    /**
     * 获取所有频道配置
     */
    async getAllConfigs() {
        try {
            const configs = await this.dataMapper.getAllChannelConfigs();
            console.log(`📺 获取到 ${configs.length} 个频道配置`);
            return configs;
        } catch (error) {
            console.error('获取所有频道配置失败:', error);
            return [];
        }
    }

    /**
     * 获取启用的频道配置
     */
    async getEnabledConfigs() {
        try {
            const configs = await this.dataMapper.getEnabledChannelConfigs();
            console.log(`📺 获取到 ${configs.length} 个启用的频道配置`);
            return configs;
        } catch (error) {
            console.error('获取启用的频道配置失败:', error);
            return [];
        }
    }

    /**
     * 根据配置名称获取配置
     */
    async getConfig(configName) {
        try {
            // 检查缓存
            const cacheKey = `config_${configName}`;
            const cached = this.configCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.data;
            }

            const config = await this.dataMapper.getChannelConfig(configName);
            
            // 更新缓存
            if (config) {
                this.configCache.set(cacheKey, {
                    data: config,
                    timestamp: Date.now()
                });
            }

            return config;
        } catch (error) {
            console.error('获取频道配置失败:', error);
            return null;
        }
    }

    /**
     * 根据源频道ID获取配置
     */
    async getConfigBySourceChannel(sourceChannelId) {
        try {
            const config = await this.dataMapper.getConfigBySourceChannel(sourceChannelId);
            return config;
        } catch (error) {
            console.error('根据源频道ID获取配置失败:', error);
            return null;
        }
    }

    /**
     * 创建或更新频道配置
     */
    async saveConfig(configData) {
        try {
            // 验证配置数据
            const validation = this.dataMapper.validateConfigData(configData);
            if (!validation.valid) {
                return {
                    success: false,
                    errors: validation.errors
                };
            }

            // 检查源频道和目标频道是否已被其他配置使用
            const conflicts = await this.checkChannelConflicts(configData);
            if (conflicts.length > 0) {
                return {
                    success: false,
                    errors: conflicts
                };
            }

            const savedConfig = await this.dataMapper.saveChannelConfig(configData);
            
            if (savedConfig) {
                // 清除相关缓存
                this.clearConfigCache(configData.name);
                
                // 记录操作日志
                await this.dataMapper.logAction(
                    savedConfig.id,
                    'config_save',
                    'success',
                    null,
                    0,
                    { config_name: configData.name, action: 'save' }
                );

                console.log(`📺 频道配置 ${configData.name} 保存成功`);
                
                return {
                    success: true,
                    config: savedConfig
                };
            } else {
                return {
                    success: false,
                    errors: ['保存配置失败']
                };
            }
        } catch (error) {
            console.error('保存频道配置失败:', error);
            return {
                success: false,
                errors: ['系统错误，请稍后重试']
            };
        }
    }

    /**
     * 删除频道配置
     */
    async deleteConfig(configName) {
        try {
            const config = await this.getConfig(configName);
            if (!config) {
                return {
                    success: false,
                    error: '配置不存在'
                };
            }

            const success = await this.dataMapper.deleteChannelConfig(configName);
            
            if (success) {
                // 清除缓存
                this.clearConfigCache(configName);
                
                // 记录操作日志
                await this.dataMapper.logAction(
                    config.id,
                    'config_delete',
                    'success',
                    null,
                    0,
                    { config_name: configName, action: 'delete' }
                );

                console.log(`📺 频道配置 ${configName} 删除成功`);
                
                return { success: true };
            } else {
                return {
                    success: false,
                    error: '删除配置失败'
                };
            }
        } catch (error) {
            console.error('删除频道配置失败:', error);
            return {
                success: false,
                error: '系统错误，请稍后重试'
            };
        }
    }

    /**
     * 启用/禁用频道配置
     */
    async toggleConfig(configName, enabled) {
        try {
            const config = await this.getConfig(configName);
            if (!config) {
                return {
                    success: false,
                    error: '配置不存在'
                };
            }

            const success = await this.dataMapper.eavOps.updateChannelConfig(configName, {
                clone_enabled: enabled
            });

            if (success) {
                // 清除缓存
                this.clearConfigCache(configName);
                
                // 记录操作日志
                await this.dataMapper.logAction(
                    config.id,
                    enabled ? 'config_enable' : 'config_disable',
                    'success',
                    null,
                    0,
                    { config_name: configName, enabled }
                );

                console.log(`📺 频道配置 ${configName} ${enabled ? '启用' : '禁用'}成功`);
                
                return { success: true };
            } else {
                return {
                    success: false,
                    error: '更新配置失败'
                };
            }
        } catch (error) {
            console.error('切换频道配置状态失败:', error);
            return {
                success: false,
                error: '系统错误，请稍后重试'
            };
        }
    }

    /**
     * 获取配置运行状态
     */
    async getConfigStatus(configName) {
        try {
            const status = await this.dataMapper.getConfigStatus(configName);
            return status;
        } catch (error) {
            console.error('获取配置状态失败:', error);
            return { status: 'error', message: '获取状态失败' };
        }
    }

    /**
     * 检查频道冲突
     */
    async checkChannelConflicts(configData) {
        try {
            const allConfigs = await this.getAllConfigs();
            const conflicts = [];

            for (const existingConfig of allConfigs) {
                // 跳过自己
                if (existingConfig.name === configData.name) {
                    continue;
                }

                // 检查源频道冲突
                if (existingConfig.sourceChannel.id === configData.sourceChannelId) {
                    conflicts.push(`源频道 ${configData.sourceChannelId} 已被配置 "${existingConfig.name}" 使用`);
                }

                // 检查目标频道冲突
                if (existingConfig.targetChannel.id === configData.targetChannelId) {
                    conflicts.push(`目标频道 ${configData.targetChannelId} 已被配置 "${existingConfig.name}" 使用`);
                }

                // 检查是否有反向配置（A->B 和 B->A）
                if (existingConfig.sourceChannel.id === configData.targetChannelId && 
                    existingConfig.targetChannel.id === configData.sourceChannelId) {
                    conflicts.push(`存在反向配置冲突，配置 "${existingConfig.name}" 已设置反向克隆`);
                }
            }

            return conflicts;
        } catch (error) {
            console.error('检查频道冲突失败:', error);
            return [];
        }
    }

    /**
     * 获取频道信息（通过Bot API）
     */
    async getChannelInfo(channelId, bot) {
        try {
            if (!bot) {
                return {
                    id: channelId,
                    title: '未知频道',
                    username: '',
                    type: 'channel'
                };
            }

            const chat = await bot.getChat(channelId);
            return {
                id: chat.id,
                title: chat.title || chat.first_name || '未知',
                username: chat.username || '',
                type: chat.type,
                description: chat.description || ''
            };
        } catch (error) {
            console.error(`获取频道信息失败 ${channelId}:`, error.message);
            return {
                id: channelId,
                title: '频道信息获取失败',
                username: '',
                type: 'channel',
                error: error.message
            };
        }
    }

    /**
     * 验证频道权限
     */
    async validateChannelPermissions(channelId, bot) {
        try {
            if (!bot) {
                return { valid: false, error: 'Bot未初始化' };
            }

            // 获取Bot在频道中的权限
            const chatMember = await bot.getChatMember(channelId, bot.options.botId || 'self');
            
            const requiredPermissions = [
                'can_post_messages',
                'can_edit_messages',
                'can_delete_messages'
            ];

            const missingPermissions = [];
            
            if (chatMember.status === 'administrator') {
                // 检查管理员权限
                for (const permission of requiredPermissions) {
                    if (!chatMember[permission]) {
                        missingPermissions.push(permission);
                    }
                }
            } else if (chatMember.status !== 'creator') {
                return { 
                    valid: false, 
                    error: 'Bot需要是频道管理员才能进行克隆操作' 
                };
            }

            if (missingPermissions.length > 0) {
                return {
                    valid: false,
                    error: `Bot缺少以下权限: ${missingPermissions.join(', ')}`
                };
            }

            return { valid: true };
        } catch (error) {
            console.error(`验证频道权限失败 ${channelId}:`, error.message);
            return {
                valid: false,
                error: `无法验证频道权限: ${error.message}`
            };
        }
    }

    /**
     * 测试配置连通性
     */
    async testConfig(configName, bot) {
        try {
            const config = await this.getConfig(configName);
            if (!config) {
                return {
                    success: false,
                    error: '配置不存在'
                };
            }

            const results = {
                sourceChannel: null,
                targetChannel: null,
                permissions: null
            };

            // 测试源频道
            try {
                results.sourceChannel = await this.getChannelInfo(config.sourceChannel.id, bot);
                results.sourceChannel.accessible = !results.sourceChannel.error;
            } catch (error) {
                results.sourceChannel = {
                    id: config.sourceChannel.id,
                    accessible: false,
                    error: error.message
                };
            }

            // 测试目标频道
            try {
                results.targetChannel = await this.getChannelInfo(config.targetChannel.id, bot);
                results.targetChannel.accessible = !results.targetChannel.error;
                
                // 验证目标频道权限
                if (results.targetChannel.accessible) {
                    results.permissions = await this.validateChannelPermissions(config.targetChannel.id, bot);
                }
            } catch (error) {
                results.targetChannel = {
                    id: config.targetChannel.id,
                    accessible: false,
                    error: error.message
                };
            }

            const allGood = results.sourceChannel?.accessible && 
                          results.targetChannel?.accessible && 
                          results.permissions?.valid;

            return {
                success: allGood,
                results,
                message: allGood ? '配置测试通过' : '配置测试发现问题'
            };
        } catch (error) {
            console.error('测试配置失败:', error);
            return {
                success: false,
                error: '系统错误，请稍后重试'
            };
        }
    }

    /**
     * 获取历史消息
     */
    async getHistoryMessages(configName, bot, limit = 100) {
        try {
            const config = await this.getConfig(configName);
            if (!config) {
                return {
                    success: false,
                    error: '配置不存在'
                };
            }

            if (!bot) {
                return {
                    success: false,
                    error: 'Bot未初始化'
                };
            }

            // 获取源频道的历史消息
            const sourceChannelId = config.sourceChannel.id;
            
            console.log(`📜 获取频道 ${sourceChannelId} 的历史消息，限制 ${limit} 条`);
            
            // 使用getUpdates方法获取历史消息
            // 注意：这个方法可能需要根据实际的Bot API来调整
            const messages = await this.getChannelHistory(sourceChannelId, bot, limit);
            
            return {
                success: true,
                data: messages
            };
        } catch (error) {
            console.error('获取历史消息失败:', error);
            return {
                success: false,
                error: '获取历史消息失败: ' + error.message
            };
        }
    }

    /**
     * 获取频道历史消息的辅助方法
     */
    async getChannelHistory(channelId, bot, limit) {
        try {
            // 模拟获取历史消息，实际实现需要根据Telegram Bot API
            // 由于Bot API限制，我们创建一些示例数据
            const sampleMessages = [];
            const now = Math.floor(Date.now() / 1000);
            
            for (let i = 0; i < Math.min(limit, 20); i++) {
                sampleMessages.push({
                    message_id: 1000 + i,
                    date: now - (i * 3600), // 每小时一条消息
                    text: `这是示例消息 #${1000 + i}，用于演示历史消息功能。`,
                    from: {
                        id: 123456789,
                        is_bot: false,
                        first_name: "示例用户"
                    },
                    chat: {
                        id: parseInt(channelId),
                        type: "channel"
                    }
                });
            }
            
            // 实际实现中，这里应该调用Telegram Bot API
            // 例如：const messages = await bot.getUpdates({limit, allowed_updates: ['channel_post']});
            
            console.log(`📜 模拟返回 ${sampleMessages.length} 条历史消息`);
            return sampleMessages;
        } catch (error) {
            console.error('获取频道历史失败:', error);
            return [];
        }
    }

    /**
     * 克隆单条消息
     */
    async cloneMessage(configName, messageId, bot) {
        try {
            const config = await this.getConfig(configName);
            if (!config) {
                return {
                    success: false,
                    error: '配置不存在'
                };
            }

            if (!bot) {
                return {
                    success: false,
                    error: 'Bot未初始化'
                };
            }

            const sourceChannelId = config.sourceChannel.id;
            const targetChannelId = config.targetChannel.id;
            
            console.log(`🚀 克隆消息 ${messageId} 从 ${sourceChannelId} 到 ${targetChannelId}`);
            
            // 使用copyMessage API克隆消息
            const result = await bot.copyMessage(
                targetChannelId,
                sourceChannelId,
                messageId
            );
            
            if (result && result.message_id) {
                // 记录消息映射
                await this.dataMapper.createMessageMapping(
                    config.id,
                    messageId,
                    result.message_id,
                    'manual_clone'
                );
                
                // 记录操作日志
                await this.dataMapper.logAction(
                    config.id,
                    'manual_clone',
                    'success',
                    null,
                    0,
                    { 
                        source_message_id: messageId,
                        target_message_id: result.message_id,
                        config_name: configName
                    }
                );
                
                console.log(`✅ 消息克隆成功: ${messageId} -> ${result.message_id}`);
                
                return {
                    success: true,
                    data: {
                        sourceMessageId: messageId,
                        targetMessageId: result.message_id
                    }
                };
            } else {
                return {
                    success: false,
                    error: '克隆失败，未获取到目标消息ID'
                };
            }
        } catch (error) {
            console.error('克隆消息失败:', error);
            
            // 记录错误日志
            try {
                const config = await this.getConfig(configName);
                if (config) {
                    await this.dataMapper.logAction(
                        config.id,
                        'manual_clone',
                        'error',
                        error.message,
                        0,
                        { 
                            source_message_id: messageId,
                            config_name: configName
                        }
                    );
                }
            } catch (logError) {
                console.error('记录错误日志失败:', logError);
            }
            
            return {
                success: false,
                error: '克隆消息失败: ' + error.message
            };
        }
    }

    /**
     * 批量操作配置
     */
    async batchOperation(operation, configNames) {
        const results = [];
        
        for (const configName of configNames) {
            try {
                let result;
                switch (operation) {
                    case 'enable':
                        result = await this.toggleConfig(configName, true);
                        break;
                    case 'disable':
                        result = await this.toggleConfig(configName, false);
                        break;
                    case 'delete':
                        result = await this.deleteConfig(configName);
                        break;
                    default:
                        result = { success: false, error: '未知操作' };
                }
                
                results.push({
                    configName,
                    success: result.success,
                    error: result.error || null
                });
            } catch (error) {
                results.push({
                    configName,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * 获取配置统计信息
     */
    async getConfigStats() {
        try {
            const allConfigs = await this.getAllConfigs();
            
            const stats = {
                total: allConfigs.length,
                enabled: allConfigs.filter(c => c.settings.enabled).length,
                disabled: allConfigs.filter(c => !c.settings.enabled).length,
                active: allConfigs.filter(c => c.status === 'active').length,
                byStatus: {},
                recentActivity: []
            };

            // 按状态分组
            const statusGroups = {};
            for (const config of allConfigs) {
                const status = config.status || 'unknown';
                statusGroups[status] = (statusGroups[status] || 0) + 1;
            }
            stats.byStatus = statusGroups;

            // 获取最近活动
            const recentLogs = await this.dataMapper.getLogs(null, 10);
            stats.recentActivity = recentLogs.filter(log => 
                log.action.startsWith('config_')
            ).slice(0, 5);

            return stats;
        } catch (error) {
            console.error('获取配置统计失败:', error);
            return {
                total: 0,
                enabled: 0,
                disabled: 0,
                active: 0,
                byStatus: {},
                recentActivity: []
            };
        }
    }

    /**
     * 导出配置
     */
    async exportConfigs(configNames = null) {
        try {
            let configs;
            if (configNames && configNames.length > 0) {
                configs = [];
                for (const name of configNames) {
                    const config = await this.getConfig(name);
                    if (config) {
                        configs.push(config);
                    }
                }
            } else {
                configs = await this.getAllConfigs();
            }

            const exportData = {
                version: '1.0.0',
                exportTime: new Date().toISOString(),
                configCount: configs.length,
                configs: configs.map(config => ({
                    name: config.name,
                    sourceChannelId: config.sourceChannel.id,
                    targetChannelId: config.targetChannel.id,
                    settings: config.settings,
                    createdAt: config.createdAt
                }))
            };

            return exportData;
        } catch (error) {
            console.error('导出配置失败:', error);
            return null;
        }
    }

    /**
     * 导入配置
     */
    async importConfigs(importData, options = {}) {
        const { overwrite = false, skipExisting = true } = options;
        const results = [];

        try {
            if (!importData.configs || !Array.isArray(importData.configs)) {
                return {
                    success: false,
                    error: '导入数据格式错误'
                };
            }

            for (const configData of importData.configs) {
                try {
                    const existing = await this.getConfig(configData.name);
                    
                    if (existing && !overwrite && skipExisting) {
                        results.push({
                            name: configData.name,
                            success: false,
                            error: '配置已存在，跳过'
                        });
                        continue;
                    }

                    const result = await this.saveConfig({
                        name: configData.name,
                        sourceChannelId: configData.sourceChannelId,
                        targetChannelId: configData.targetChannelId,
                        enabled: configData.settings.enabled,
                        syncEdits: configData.settings.syncEdits,
                        filterEnabled: configData.settings.filterEnabled,
                        rateLimit: configData.settings.rateLimit,
                        rules: configData.settings.rules
                    });

                    results.push({
                        name: configData.name,
                        success: result.success,
                        error: result.success ? null : result.errors?.join(', ')
                    });
                } catch (error) {
                    results.push({
                        name: configData.name,
                        success: false,
                        error: error.message
                    });
                }
            }

            const successCount = results.filter(r => r.success).length;
            
            return {
                success: successCount > 0,
                total: results.length,
                successCount,
                failedCount: results.length - successCount,
                results
            };
        } catch (error) {
            console.error('导入配置失败:', error);
            return {
                success: false,
                error: '导入过程中发生错误'
            };
        }
    }

    /**
     * 清除配置缓存
     */
    clearConfigCache(configName = null) {
        if (configName) {
            this.configCache.delete(`config_${configName}`);
        } else {
            this.configCache.clear();
        }
    }

    /**
     * 获取缓存统计
     */
    getCacheStats() {
        return {
            size: this.configCache.size,
            expiry: this.cacheExpiry,
            keys: Array.from(this.configCache.keys())
        };
    }
}

module.exports = ChannelConfigService; 