const ChannelDataMapper = require('../models/channelDataMapper');

/**
 * 内容过滤和修改服务
 * 基于EAV模式存储过滤规则，支持内容过滤、修改和变换
 */
class ContentFilterService {
    constructor() {
        this.dataMapper = new ChannelDataMapper();
        
        // 预定义过滤器类型
        this.filterTypes = {
            KEYWORD_BLOCK: 'keyword_block',      // 关键词屏蔽
            KEYWORD_REPLACE: 'keyword_replace',  // 关键词替换
            URL_FILTER: 'url_filter',           // URL过滤
            CONTENT_MODIFY: 'content_modify',   // 内容修改
            USER_FILTER: 'user_filter',         // 用户过滤
            TIME_FILTER: 'time_filter',         // 时间过滤
            LENGTH_FILTER: 'length_filter',     // 长度过滤
            MEDIA_FILTER: 'media_filter'        // 媒体类型过滤
        };

        // 过滤动作
        this.filterActions = {
            ALLOW: 'allow',           // 允许通过
            BLOCK: 'block',           // 完全阻止
            MODIFY: 'modify',         // 修改内容
            DELAY: 'delay',           // 延迟发送
            TAG: 'tag'                // 添加标签
        };
    }

    /**
     * 应用过滤规则到消息
     */
    async applyFilters(message, configId) {
        try {
            // 获取该配置的所有过滤规则
            const filterRules = await this.getFilterRules(configId);
            
            if (filterRules.length === 0) {
                return {
                    action: this.filterActions.ALLOW,
                    message: message,
                    applied: []
                };
            }

            let processedMessage = { ...message };
            const appliedFilters = [];
            let finalAction = this.filterActions.ALLOW;

            // 按优先级排序过滤规则
            filterRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

            for (const rule of filterRules) {
                if (!rule.enabled) {
                    continue;
                }

                const filterResult = await this.applyFilter(processedMessage, rule);
                
                if (filterResult.matched) {
                    appliedFilters.push({
                        ruleId: rule.id,
                        ruleName: rule.name,
                        filterType: rule.filterType,
                        action: filterResult.action,
                        changes: filterResult.changes
                    });

                    // 应用修改
                    if (filterResult.modifiedMessage) {
                        processedMessage = filterResult.modifiedMessage;
                    }

                    // 如果是阻止动作，立即返回
                    if (filterResult.action === this.filterActions.BLOCK) {
                        finalAction = this.filterActions.BLOCK;
                        break;
                    }

                    // 更新最终动作
                    if (filterResult.action !== this.filterActions.ALLOW) {
                        finalAction = filterResult.action;
                    }
                }
            }

            return {
                action: finalAction,
                message: processedMessage,
                applied: appliedFilters
            };

        } catch (error) {
            console.error('应用过滤规则失败:', error);
            return {
                action: this.filterActions.ALLOW,
                message: message,
                applied: [],
                error: error.message
            };
        }
    }

    /**
     * 应用单个过滤规则
     */
    async applyFilter(message, rule) {
        try {
            const filterFunction = this.getFilterFunction(rule.filterType);
            if (!filterFunction) {
                console.warn(`未知的过滤器类型: ${rule.filterType}`);
                return { matched: false };
            }

            return await filterFunction.call(this, message, rule);
        } catch (error) {
            console.error(`应用过滤规则失败 ${rule.id}:`, error);
            return { matched: false, error: error.message };
        }
    }

    /**
     * 获取过滤器函数
     */
    getFilterFunction(filterType) {
        const functions = {
            [this.filterTypes.KEYWORD_BLOCK]: this.applyKeywordBlockFilter,
            [this.filterTypes.KEYWORD_REPLACE]: this.applyKeywordReplaceFilter,
            [this.filterTypes.URL_FILTER]: this.applyUrlFilter,
            [this.filterTypes.CONTENT_MODIFY]: this.applyContentModifyFilter,
            [this.filterTypes.USER_FILTER]: this.applyUserFilter,
            [this.filterTypes.TIME_FILTER]: this.applyTimeFilter,
            [this.filterTypes.LENGTH_FILTER]: this.applyLengthFilter,
            [this.filterTypes.MEDIA_FILTER]: this.applyMediaFilter
        };

        return functions[filterType];
    }

    /**
     * 关键词屏蔽过滤器
     */
    async applyKeywordBlockFilter(message, rule) {
        const config = rule.config || {};
        const keywords = config.keywords || [];
        const caseSensitive = config.caseSensitive || false;
        
        if (!message.text && !message.caption) {
            return { matched: false };
        }

        const content = message.text || message.caption || '';
        const checkContent = caseSensitive ? content : content.toLowerCase();

        for (const keyword of keywords) {
            const checkKeyword = caseSensitive ? keyword : keyword.toLowerCase();
            
            if (checkContent.includes(checkKeyword)) {
                return {
                    matched: true,
                    action: this.filterActions.BLOCK,
                    changes: {
                        blockedKeyword: keyword,
                        reason: '包含被屏蔽的关键词'
                    }
                };
            }
        }

        return { matched: false };
    }

    /**
     * 关键词替换过滤器
     */
    async applyKeywordReplaceFilter(message, rule) {
        const config = rule.config || {};
        const replacements = config.replacements || [];
        const caseSensitive = config.caseSensitive || false;
        
        if (!message.text && !message.caption) {
            return { matched: false };
        }

        const isTextMessage = !!message.text;
        let content = message.text || message.caption || '';
        let hasChanges = false;
        const changes = [];

        for (const replacement of replacements) {
            const { from, to } = replacement;
            const flags = caseSensitive ? 'g' : 'gi';
            const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
            
            if (regex.test(content)) {
                content = content.replace(regex, to);
                hasChanges = true;
                changes.push({ from, to });
            }
        }

        if (!hasChanges) {
            return { matched: false };
        }

        const modifiedMessage = { ...message };
        if (isTextMessage) {
            modifiedMessage.text = content;
        } else {
            modifiedMessage.caption = content;
        }

        return {
            matched: true,
            action: this.filterActions.MODIFY,
            modifiedMessage,
            changes: {
                replacements: changes,
                originalLength: (message.text || message.caption || '').length,
                newLength: content.length
            }
        };
    }

    /**
     * URL过滤器
     */
    async applyUrlFilter(message, rule) {
        const config = rule.config || {};
        const action = config.action || this.filterActions.BLOCK; // 'block', 'remove', 'replace'
        const allowedDomains = config.allowedDomains || [];
        const blockedDomains = config.blockedDomains || [];
        const replacement = config.replacement || '[链接已移除]';
        
        if (!message.text && !message.caption) {
            return { matched: false };
        }

        const content = message.text || message.caption || '';
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const urls = content.match(urlRegex) || [];

        if (urls.length === 0) {
            return { matched: false };
        }

        let shouldBlock = false;
        let modifiedContent = content;
        const changes = [];

        for (const url of urls) {
            try {
                const urlObj = new URL(url);
                const domain = urlObj.hostname;

                // 检查域名白名单
                if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
                    shouldBlock = true;
                    changes.push({ url, domain, reason: '不在允许域名列表中' });
                }

                // 检查域名黑名单
                if (blockedDomains.includes(domain)) {
                    shouldBlock = true;
                    changes.push({ url, domain, reason: '在禁止域名列表中' });
                }

                // 根据动作处理
                if (shouldBlock) {
                    if (action === this.filterActions.BLOCK) {
                        return {
                            matched: true,
                            action: this.filterActions.BLOCK,
                            changes: { blockedUrls: changes }
                        };
                    } else if (action === 'remove' || action === 'replace') {
                        modifiedContent = modifiedContent.replace(url, replacement);
                    }
                }
            } catch (error) {
                // 无效URL，根据配置决定是否处理
                if (config.blockInvalidUrls) {
                    shouldBlock = true;
                    changes.push({ url, reason: '无效URL格式' });
                }
            }
        }

        if (!shouldBlock || changes.length === 0) {
            return { matched: false };
        }

        if (action === 'remove' || action === 'replace') {
            const modifiedMessage = { ...message };
            if (message.text) {
                modifiedMessage.text = modifiedContent;
            } else {
                modifiedMessage.caption = modifiedContent;
            }

            return {
                matched: true,
                action: this.filterActions.MODIFY,
                modifiedMessage,
                changes: { urlChanges: changes }
            };
        }

        return { matched: false };
    }

    /**
     * 内容修改过滤器
     */
    async applyContentModifyFilter(message, rule) {
        const config = rule.config || {};
        const modifications = config.modifications || [];
        
        if (modifications.length === 0) {
            return { matched: false };
        }

        let modifiedMessage = { ...message };
        let hasChanges = false;
        const changes = [];

        for (const modification of modifications) {
            const { type, value, position } = modification;

            switch (type) {
                case 'prefix':
                    if (modifiedMessage.text) {
                        modifiedMessage.text = value + modifiedMessage.text;
                        hasChanges = true;
                        changes.push({ type: 'prefix', value });
                    } else if (modifiedMessage.caption) {
                        modifiedMessage.caption = value + modifiedMessage.caption;
                        hasChanges = true;
                        changes.push({ type: 'prefix', value });
                    }
                    break;

                case 'suffix':
                    if (modifiedMessage.text) {
                        modifiedMessage.text = modifiedMessage.text + value;
                        hasChanges = true;
                        changes.push({ type: 'suffix', value });
                    } else if (modifiedMessage.caption) {
                        modifiedMessage.caption = modifiedMessage.caption + value;
                        hasChanges = true;
                        changes.push({ type: 'suffix', value });
                    }
                    break;

                case 'replace_all':
                    if (modifiedMessage.text) {
                        modifiedMessage.text = value;
                        hasChanges = true;
                        changes.push({ type: 'replace_all', value });
                    } else if (modifiedMessage.caption) {
                        modifiedMessage.caption = value;
                        hasChanges = true;
                        changes.push({ type: 'replace_all', value });
                    }
                    break;

                case 'insert':
                    // 在指定位置插入内容
                    const targetContent = modifiedMessage.text || modifiedMessage.caption || '';
                    const pos = Math.min(position || 0, targetContent.length);
                    const newContent = targetContent.slice(0, pos) + value + targetContent.slice(pos);
                    
                    if (modifiedMessage.text) {
                        modifiedMessage.text = newContent;
                    } else if (modifiedMessage.caption) {
                        modifiedMessage.caption = newContent;
                    }
                    hasChanges = true;
                    changes.push({ type: 'insert', value, position: pos });
                    break;
            }
        }

        if (!hasChanges) {
            return { matched: false };
        }

        return {
            matched: true,
            action: this.filterActions.MODIFY,
            modifiedMessage,
            changes: { modifications: changes }
        };
    }

    /**
     * 用户过滤器
     */
    async applyUserFilter(message, rule) {
        const config = rule.config || {};
        const allowedUsers = config.allowedUsers || [];
        const blockedUsers = config.blockedUsers || [];
        
        if (!message.from) {
            return { matched: false };
        }

        const userId = message.from.id;
        const username = message.from.username;

        // 检查黑名单
        if (blockedUsers.includes(userId) || (username && blockedUsers.includes(username))) {
            return {
                matched: true,
                action: this.filterActions.BLOCK,
                changes: {
                    blockedUser: { id: userId, username },
                    reason: '用户在黑名单中'
                }
            };
        }

        // 检查白名单（如果设置了白名单，只允许白名单用户）
        if (allowedUsers.length > 0) {
            if (!allowedUsers.includes(userId) && (!username || !allowedUsers.includes(username))) {
                return {
                    matched: true,
                    action: this.filterActions.BLOCK,
                    changes: {
                        user: { id: userId, username },
                        reason: '用户不在白名单中'
                    }
                };
            }
        }

        return { matched: false };
    }

    /**
     * 时间过滤器
     */
    async applyTimeFilter(message, rule) {
        const config = rule.config || {};
        const allowedHours = config.allowedHours || []; // [0-23]
        const allowedDays = config.allowedDays || [];   // [0-6], 0=Sunday
        const timezone = config.timezone || 'Asia/Shanghai';
        
        const messageTime = new Date(message.date * 1000);
        const localTime = new Date(messageTime.toLocaleString('en-US', { timeZone: timezone }));
        
        const hour = localTime.getHours();
        const day = localTime.getDay();

        // 检查允许的小时
        if (allowedHours.length > 0 && !allowedHours.includes(hour)) {
            return {
                matched: true,
                action: config.action || this.filterActions.DELAY,
                changes: {
                    currentHour: hour,
                    allowedHours,
                    reason: '不在允许的时间段内'
                }
            };
        }

        // 检查允许的星期
        if (allowedDays.length > 0 && !allowedDays.includes(day)) {
            return {
                matched: true,
                action: config.action || this.filterActions.DELAY,
                changes: {
                    currentDay: day,
                    allowedDays,
                    reason: '不在允许的日期内'
                }
            };
        }

        return { matched: false };
    }

    /**
     * 长度过滤器
     */
    async applyLengthFilter(message, rule) {
        const config = rule.config || {};
        const minLength = config.minLength || 0;
        const maxLength = config.maxLength || Infinity;
        const action = config.action || this.filterActions.BLOCK;
        
        const content = message.text || message.caption || '';
        const length = content.length;

        if (length < minLength) {
            return {
                matched: true,
                action: action,
                changes: {
                    currentLength: length,
                    minLength,
                    reason: '内容长度过短'
                }
            };
        }

        if (length > maxLength) {
            if (action === 'truncate') {
                const truncatedContent = content.substring(0, maxLength);
                const modifiedMessage = { ...message };
                
                if (message.text) {
                    modifiedMessage.text = truncatedContent;
                } else {
                    modifiedMessage.caption = truncatedContent;
                }

                return {
                    matched: true,
                    action: this.filterActions.MODIFY,
                    modifiedMessage,
                    changes: {
                        originalLength: length,
                        truncatedLength: maxLength,
                        reason: '内容被截断'
                    }
                };
            } else {
                return {
                    matched: true,
                    action: action,
                    changes: {
                        currentLength: length,
                        maxLength,
                        reason: '内容长度过长'
                    }
                };
            }
        }

        return { matched: false };
    }

    /**
     * 媒体类型过滤器
     */
    async applyMediaFilter(message, rule) {
        const config = rule.config || {};
        const allowedTypes = config.allowedTypes || [];
        const blockedTypes = config.blockedTypes || [];
        
        const messageType = this.getMessageType(message);
        
        // 检查黑名单
        if (blockedTypes.includes(messageType)) {
            return {
                matched: true,
                action: this.filterActions.BLOCK,
                changes: {
                    messageType,
                    reason: '媒体类型被禁止'
                }
            };
        }

        // 检查白名单
        if (allowedTypes.length > 0 && !allowedTypes.includes(messageType)) {
            return {
                matched: true,
                action: this.filterActions.BLOCK,
                changes: {
                    messageType,
                    allowedTypes,
                    reason: '媒体类型不在允许列表中'
                }
            };
        }

        return { matched: false };
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
     * 获取配置的过滤规则
     */
    async getFilterRules(configId) {
        try {
            // 这里需要从EAV数据库中获取过滤规则
            // 简化实现，返回空数组
            return [];
        } catch (error) {
            console.error('获取过滤规则失败:', error);
            return [];
        }
    }

    /**
     * 创建过滤规则
     */
    async createFilterRule(configId, ruleData) {
        try {
            const {
                name,
                filterType,
                config,
                action = this.filterActions.ALLOW,
                priority = 0,
                enabled = true
            } = ruleData;

            // 这里需要使用EAV模式创建过滤规则
            // 简化实现
            console.log(`📺 创建过滤规则: ${name} (${filterType})`);
            
            return {
                success: true,
                ruleId: Math.floor(Math.random() * 1000000)
            };
        } catch (error) {
            console.error('创建过滤规则失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 更新过滤规则
     */
    async updateFilterRule(ruleId, updateData) {
        try {
            // 这里需要使用EAV模式更新过滤规则
            console.log(`📺 更新过滤规则: ${ruleId}`);
            
            return { success: true };
        } catch (error) {
            console.error('更新过滤规则失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 删除过滤规则
     */
    async deleteFilterRule(ruleId) {
        try {
            // 这里需要使用EAV模式删除过滤规则
            console.log(`📺 删除过滤规则: ${ruleId}`);
            
            return { success: true };
        } catch (error) {
            console.error('删除过滤规则失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 测试过滤规则
     */
    async testFilterRule(ruleData, testMessage) {
        try {
            const mockRule = {
                id: 'test',
                name: ruleData.name || 'Test Rule',
                filterType: ruleData.filterType,
                config: ruleData.config,
                enabled: true,
                priority: 0
            };

            const result = await this.applyFilter(testMessage, mockRule);
            
            return {
                success: true,
                result: result
            };
        } catch (error) {
            console.error('测试过滤规则失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取过滤器类型列表
     */
    getFilterTypes() {
        return Object.values(this.filterTypes).map(type => ({
            type,
            name: this.getFilterTypeName(type),
            description: this.getFilterTypeDescription(type)
        }));
    }

    /**
     * 获取过滤器类型名称
     */
    getFilterTypeName(type) {
        const names = {
            [this.filterTypes.KEYWORD_BLOCK]: '关键词屏蔽',
            [this.filterTypes.KEYWORD_REPLACE]: '关键词替换',
            [this.filterTypes.URL_FILTER]: 'URL过滤',
            [this.filterTypes.CONTENT_MODIFY]: '内容修改',
            [this.filterTypes.USER_FILTER]: '用户过滤',
            [this.filterTypes.TIME_FILTER]: '时间过滤',
            [this.filterTypes.LENGTH_FILTER]: '长度过滤',
            [this.filterTypes.MEDIA_FILTER]: '媒体类型过滤'
        };
        return names[type] || type;
    }

    /**
     * 获取过滤器类型描述
     */
    getFilterTypeDescription(type) {
        const descriptions = {
            [this.filterTypes.KEYWORD_BLOCK]: '检测并阻止包含特定关键词的消息',
            [this.filterTypes.KEYWORD_REPLACE]: '自动替换消息中的特定关键词',
            [this.filterTypes.URL_FILTER]: '过滤或修改消息中的URL链接',
            [this.filterTypes.CONTENT_MODIFY]: '对消息内容进行各种修改操作',
            [this.filterTypes.USER_FILTER]: '基于用户ID或用户名过滤消息',
            [this.filterTypes.TIME_FILTER]: '基于时间规则控制消息处理',
            [this.filterTypes.LENGTH_FILTER]: '基于内容长度过滤或修改消息',
            [this.filterTypes.MEDIA_FILTER]: '基于媒体类型过滤消息'
        };
        return descriptions[type] || '未知过滤器类型';
    }
}

module.exports = ContentFilterService; 