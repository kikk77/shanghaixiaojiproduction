const http = require('http');
const fs = require('fs');
const url = require('url');
const path = require('path');
const crypto = require('crypto');
const dbOperations = require('../models/dbOperations');
// 延迟加载botService避免循环依赖
let botService = null;
function getBotService() {
    if (!botService) {
        try {
            botService = require('./botService');
        } catch (error) {
            console.warn('BotService暂不可用:', error.message);
            return null;
        }
    }
    return botService;
}

// 安全的缓存重载函数
async function safeLoadCacheData() {
    try {
        const bs = getBotService();
        if (bs && bs.loadCacheData) {
            await bs.loadCacheData();
        } else {
            console.log('跳过缓存重载 - BotService未就绪');
        }
    } catch (error) {
        console.warn('缓存重载失败:', error.message);
    }
}
const zlib = require('zlib'); // 添加压缩支持

const PORT = process.env.PORT || 3000;

// 响应压缩配置
const COMPRESSION_THRESHOLD = 1024; // 1KB以上才压缩
const CACHE_MAX_AGE = 300; // 5分钟缓存

// HTTP请求处理函数
function handleHttpRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // 处理具体的路由
    handleRoutes(req, res, pathname, method);
}

// 路由处理函数
function handleRoutes(req, res, pathname, method) {
    // favicon.ico 请求处理
    if (pathname === '/favicon.ico') {
        // 返回一个简单的透明1x1像素图标或404
        res.writeHead(204); // No Content
        res.end();
        return;
    }

    // 静态文件服务
    if (pathname === '/' || pathname === '/admin') {
        const path = require('path');
        const adminPath = path.join(__dirname, '..', 'admin', 'admin-legacy.html');
        fs.readFile(adminPath, 'utf8', (err, data) => {
            if (err) {
                console.error('读取管理后台文件失败:', err);
                res.writeHead(404);
                res.end('Admin file not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
        return;
    }
    
    // 等级系统管理界面
    if (pathname === '/admin/level-system') {
        const path = require('path');
        const levelAdminPath = path.join(__dirname, '..', 'level', 'admin', 'level-system.html');
        fs.readFile(levelAdminPath, 'utf8', (err, data) => {
            if (err) {
                console.error('读取等级系统管理界面失败:', err);
                res.writeHead(404);
                res.end('Level system admin file not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
        return;
    }
    
    // 等级系统测试页面
    if (pathname === '/admin/level-test') {
        const path = require('path');
        const testPath = path.join(__dirname, '..', 'level', 'admin', 'test-buttons.html');
        fs.readFile(testPath, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Test page not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
        return;
    }

    // 静态资源服务（CSS, JS文件）
    if (pathname.startsWith('/admin/')) {
        const path = require('path');
        const filePath = path.join(__dirname, '..', pathname);
        const ext = path.extname(filePath);
        
        let contentType = 'text/plain';
        if (ext === '.css') contentType = 'text/css';
        else if (ext === '.js') contentType = 'application/javascript';
        else if (ext === '.html') contentType = 'text/html';
        
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
            res.end(data);
        });
        return;
    }
    
    // 等级系统静态资源服务
    if (pathname.startsWith('/level/admin/')) {
        const path = require('path');
        const filePath = path.join(__dirname, '..', pathname);
        const ext = path.extname(filePath);
        
        let contentType = 'text/plain';
        if (ext === '.css') contentType = 'text/css';
        else if (ext === '.js') contentType = 'application/javascript';
        else if (ext === '.html') contentType = 'text/html';
        
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
            res.end(data);
        });
        return;
    }

    // 上传的图片静态服务
    if (pathname.startsWith('/uploads/')) {
        const path = require('path');
        const filePath = path.join(__dirname, '..', pathname);
        const ext = path.extname(filePath).toLowerCase();
        
        let contentType = 'application/octet-stream';
        if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.gif') contentType = 'image/gif';
        else if (ext === '.webp') contentType = 'image/webp';
        else if (ext === '.bmp') contentType = 'image/bmp';
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Image not found');
                return;
            }
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000' // 1年缓存
            });
            res.end(data);
        });
        return;
    }

    // Webhook路由 - Telegram Bot更新
    if (pathname === '/webhook' && method === 'POST') {
        handleWebhookRequest(req, res);
        return;
    }

    // 健康检查端点
    if (pathname === '/health' && method === 'GET') {
        console.log(`🩺 健康检查请求 - ${new Date().toISOString()}`);
        
        // 检查关键服务状态
        const dbStatus = checkDatabaseConnection();
        const botStatus = checkBotStatus();
        
        const healthStatus = {
            success: dbStatus.connected && botStatus.connected,
            status: dbStatus.connected && botStatus.connected ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            services: {
                database: dbStatus,
                telegram_bot: botStatus
            },
            environment: process.env.NODE_ENV || 'development'
        };
        
        const statusCode = healthStatus.success ? 200 : 503;
        console.log(`🩺 健康检查响应 - 状态: ${healthStatus.status} (${statusCode})`);
        
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(healthStatus));
        return;
    }

    // 文件下载路由
    if (pathname.startsWith('/api/export/download/') && method === 'GET') {
        handleFileDownload(req, res, pathname);
        return;
    }

    // API路由
    if (pathname.startsWith('/api/')) {
        handleApiRequest(req, res, pathname, method);
        return;
    }

    // 404 - 返回JSON格式响应
    console.log(`❌ 404 - 路径不存在: ${pathname}`);
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ 
        error: 'Not Found',
        availableEndpoints: ['/health', '/admin', '/api/*', '/webhook']
    }));
}

// HTTP服务器和管理后台API
function createHttpServer() {
    const server = http.createServer(handleHttpRequest);
    return server;
}

// Webhook请求处理 - 处理Telegram更新
function handleWebhookRequest(req, res) {
    let body = '';
    
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        try {
            const update = JSON.parse(body);
            
            // 立即响应Telegram服务器
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('OK');
            
            // 处理更新（事件驱动，不阻塞响应）
            processWebhookUpdate(update);
            
        } catch (error) {
            console.error('Webhook处理错误:', error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('OK'); // 总是返回200给Telegram
        }
    });
}

// 频道管理API处理函数
async function handleChannelApiRequest(pathname, method, data) {
    console.log(`📺 [API] 频道API请求: ${method} ${pathname}`);
    console.log(`📺 [API] 请求数据:`, data);
    
    try {
        // 获取频道服务实例
        const bs = getBotService();
        if (!bs) {
            console.error('❌ [API] Bot服务未初始化');
            return { success: false, error: 'Bot服务未初始化' };
        }
        console.log('✅ [API] Bot服务已获取');

        const channelServices = bs.getChannelServices();
        if (!channelServices) {
            console.error('❌ [API] 频道服务未初始化');
            return { success: false, error: '频道服务未初始化' };
        }
        
        if (!channelServices.configService) {
            console.error('❌ [API] 频道配置服务未初始化');
            return { success: false, error: '频道克隆服务未初始化' };
        }
        
        console.log('✅ [API] 频道服务状态:', {
            configService: !!channelServices.configService,
            cloneService: !!channelServices.cloneService,
            queueService: !!channelServices.queueService,
            filterService: !!channelServices.filterService,
            broadcastService: !!channelServices.broadcastService
        });

        const { configService, cloneService, queueService, filterService, broadcastService } = channelServices;

        // 路由匹配
        const pathParts = pathname.split('/');
        const endpoint = pathParts[3]; // /api/channel/{endpoint}
        const id = pathParts[4]; // /api/channel/{endpoint}/{id}

        // 播报配置专用路由处理
        if (endpoint === 'broadcast' && pathParts[4] === 'configs') {
            const configId = pathParts[5]; // /api/channel/broadcast/configs/{id}
            const action = pathParts[6]; // /api/channel/broadcast/configs/{id}/{action}

            if (method === 'POST' && !configId) {
                // 创建播报配置: POST /api/channel/broadcast/configs
                console.log('📢 处理播报配置创建请求:', data);
                
                // 验证必需字段
                if (!data.name || !data.sourceChannelId || !data.broadcastTargetGroups) {
                    return {
                        success: false,
                        error: '缺少必需字段：配置名称、源频道ID或播报目标群组'
                    };
                }

                // 构造播报配置数据
                const broadcastConfigData = {
                    ...data,
                    broadcastEnabled: true,
                    targetChannelId: data.sourceChannelId, // 播报模式下目标频道ID等于源频道ID
                    syncEdits: false,
                    filterEnabled: false,
                    sequentialMode: false
                };

                const result = await configService.saveConfig(broadcastConfigData);
                
                if (result.success) {
                    console.log('✅ 播报配置创建成功:', result.config?.name);
                    return {
                        success: true,
                        message: '播报配置创建成功',
                        config: result.config
                    };
                } else {
                    return {
                        success: false,
                        error: result.error || '播报配置保存失败'
                    };
                }
            }

            if (method === 'DELETE' && configId && !action) {
                // 删除播报配置: DELETE /api/channel/broadcast/configs/{id}
                const decodedConfigId = decodeURIComponent(configId);
                console.log('📢 处理播报配置删除请求:', decodedConfigId);
                
                const result = await configService.deleteConfig(decodedConfigId);
                
                if (result.success) {
                    console.log('✅ 播报配置删除成功:', configId);
                    return {
                        success: true,
                        message: '播报配置删除成功'
                    };
                } else {
                    return {
                        success: false,
                        error: result.error || '播报配置删除失败'
                    };
                }
            }

            if (method === 'POST' && configId && action === 'test') {
                // 测试播报配置: POST /api/channel/broadcast/configs/{id}/test
                const decodedConfigId = decodeURIComponent(configId);
                console.log('📢 [API] 处理播报配置测试请求:', decodedConfigId);
                
                const config = await configService.getConfig(decodedConfigId);
                console.log('📢 [API] 获取到的配置:', config);

                if (!config || !config.settings.broadcastEnabled) {
                    console.error('❌ [API] 播报配置不存在或未启用播报功能');
                    return {
                        success: false,
                        error: '播报配置不存在或未启用播报功能'
                    };
                }

                const targetGroups = config.settings.broadcastTargetGroups || [];
                console.log('📢 [API] 目标群组列表:', targetGroups);
                
                let groupsAccessible = 0;
                let testResults = {
                    targetGroupsCount: targetGroups.length,
                    groupsAccessible: 0,
                    permissions: { valid: false },
                    templateParser: { working: true },
                    botInstance: false,
                    groupDetails: []
                };

                // 测试Bot实例
                const bot = bs.getBotInstance();
                testResults.botInstance = !!bot;
                console.log('📢 [API] Bot实例状态:', !!bot);

                // 测试每个群组的访问权限
                for (const groupId of targetGroups) {
                    console.log(`📢 [API] 测试群组访问: ${groupId}`);
                    try {
                        if (bot) {
                            const chat = await bot.getChat(groupId);
                            if (chat) {
                                groupsAccessible++;
                                testResults.groupDetails.push({
                                    groupId,
                                    accessible: true,
                                    title: chat.title,
                                    type: chat.type
                                });
                                console.log(`✅ [API] 群组 ${groupId} 可访问: ${chat.title}`);
                            }
                        } else {
                            console.error(`❌ [API] Bot实例不存在，无法测试群组 ${groupId}`);
                        }
                    } catch (error) {
                        console.error(`❌ [API] 群组 ${groupId} 访问测试失败:`, error.message);
                        testResults.groupDetails.push({
                            groupId,
                            accessible: false,
                            error: error.message
                        });
                    }
                }

                testResults.groupsAccessible = groupsAccessible;
                testResults.permissions.valid = groupsAccessible > 0;
                
                console.log('📢 [API] 播报测试结果:', testResults);

                return {
                    success: true,
                    message: '播报配置测试完成',
                    results: testResults
                };
            }
        }

        // 配置操作API - 必须先匹配更具体的路径
        if (endpoint === 'configs' && pathParts[5]) {
            const action = pathParts[5]; // /api/channel/configs/{id}/{action}

            if (action === 'toggle' && method === 'POST') {
                // 启用/禁用配置
                const { enabled } = data;
                const result = await configService.toggleConfig(id, enabled);
                return result;
            }

            if (action === 'test' && method === 'POST') {
                // 测试配置
                console.log(`📺 [API] 测试配置请求: ${id}`);
                const bot = bs.getBotInstance();
                console.log('📺 [API] Bot实例状态:', !!bot);
                
                const result = await configService.testConfig(id, bot);
                console.log('📺 [API] 配置测试结果:', result);
                return result;
            }

            if (action === 'status' && method === 'GET') {
                // 获取配置状态
                const status = await configService.getConfigStatus(id);
                return { success: true, data: status };
            }

            // 历史消息功能已移除 - 由于Telegram Bot API限制

            if (action === 'clone-message' && method === 'POST') {
                // 克隆单条消息
                const { messageId } = data;
                const result = await configService.cloneMessage(id, messageId, bs.getBotInstance());
                return result;
            }
        }

        // 配置管理API
        if (endpoint === 'configs') {
            if (method === 'GET' && !id) {
                // 获取所有配置
                const configs = await configService.getAllConfigs();
                return { success: true, data: configs };
            }

            if (method === 'GET' && id) {
                // 获取单个配置
                const config = await configService.getConfig(id);
                if (!config) {
                    return { success: false, error: '配置不存在' };
                }
                return { success: true, data: config };
            }

            if (method === 'POST' && !pathParts[5]) {
                // 创建或更新配置 - 只有在没有action的情况下才执行
                const result = await configService.saveConfig(data);
                return result;
            }

            if (method === 'PUT' && id && !pathParts[5]) {
                // 更新配置 - 只有在没有action的情况下才执行
                const result = await configService.updateConfig(id, data);
                return result;
            }

            if (method === 'DELETE' && id && !pathParts[5]) {
                // 删除配置 - 只有在没有action的情况下才执行
                const result = await configService.deleteConfig(id);
                return result;
            }
        }

        // 统计信息API
        if (endpoint === 'stats' && method === 'GET') {
            // 从查询参数获取统计类型
            const statsType = data.id || id;
            
            if (statsType === 'configs') {
                // 配置统计
                const stats = await configService.getConfigStats();
                return { success: true, data: stats };
            }

            if (statsType === 'clone') {
                // 克隆统计
                const stats = cloneService ? cloneService.getCloneStats() : null;
                return { success: true, data: stats || {} };
            }

            if (statsType === 'queue') {
                // 队列统计
                const stats = queueService ? await queueService.getQueueStats() : null;
                return { success: true, data: stats || {} };
            }

            if (statsType === 'system') {
                // 系统统计
                const channelDataMapper = require('../models/channelDataMapper');
                const mapper = new channelDataMapper();
                const stats = await mapper.getSystemStats();
                return { success: true, data: stats };
            }

            if (id === 'summary') {
                // 汇总统计 - 用于admin主界面显示
                try {
                    const configStats = await configService.getConfigStats();
                    const cloneStats = cloneService ? cloneService.getCloneStats() : {};
                    const queueStats = queueService ? await queueService.getQueueStats() : {};
                    
                    return { 
                        success: true, 
                        data: {
                            totalConfigs: configStats.total || 0,
                            enabledConfigs: configStats.enabled || 0,
                            totalClonedMessages: cloneStats.totalCloned || 0,
                            queuedMessages: queueStats.pendingTasks || 0
                        }
                    };
                } catch (error) {
                    console.error('获取频道管理汇总统计失败:', error);
                    return { 
                        success: true, 
                        data: {
                            totalConfigs: 0,
                            enabledConfigs: 0,
                            totalClonedMessages: 0,
                            queuedMessages: 0
                        }
                    };
                }
            }
        }

        // 日志API
        if (endpoint === 'logs' && method === 'GET') {
            const channelDataMapper = require('../models/channelDataMapper');
            const mapper = new channelDataMapper();
            
            const configId = data.configId || null;
            const limit = parseInt(data.limit) || 50;
            
            const logs = await mapper.getLogs(configId, limit);
            return { success: true, data: logs };
        }

        // 队列管理API
        if (endpoint === 'queue') {
            if (method === 'GET') {
                // 获取队列任务
                const stats = queueService ? await queueService.getQueueStats() : null;
                return { success: true, data: stats || {} };
            }

            if (method === 'POST' && id === 'clear') {
                // 清空队列
                const { taskType } = data;
                const result = queueService ? await queueService.clearQueue(taskType) : null;
                return result || { success: false, error: '队列服务未初始化' };
            }

            if (method === 'POST' && id === 'add') {
                // 添加任务到队列
                const { configId, taskType, taskData, priority, delay } = data;
                
                if (!queueService) {
                    return { success: false, error: '队列服务未初始化' };
                }

                let success = false;
                switch (taskType) {
                    case 'clone_message':
                        success = await queueService.addCloneTask(
                            configId, 
                            taskData.sourceChannelId, 
                            taskData.sourceMessageId, 
                            priority, 
                            delay
                        );
                        break;
                    case 'sync_edit':
                        success = await queueService.addEditSyncTask(
                            configId,
                            taskData.sourceChannelId,
                            taskData.sourceMessageId,
                            taskData.targetChannelId,
                            taskData.targetMessageId,
                            taskData.newContent,
                            priority
                        );
                        break;
                    case 'batch_clone':
                        success = await queueService.addBatchCloneTask(
                            configId,
                            taskData.configName,
                            taskData.messageIds,
                            priority
                        );
                        break;
                    default:
                        return { success: false, error: '未知的任务类型' };
                }

                return { success, message: success ? '任务添加成功' : '任务添加失败' };
            }
        }

        // 服务管理API
        if (endpoint === 'service') {
            if (method === 'POST' && id === 'start') {
                // 启动服务
                await bs.startChannelServices();
                return { success: true, message: '频道克隆服务已启动' };
            }

            if (method === 'POST' && id === 'stop') {
                // 停止服务
                await bs.stopChannelServices();
                return { success: true, message: '频道克隆服务已停止' };
            }

            if (method === 'POST' && id === 'reload') {
                // 重新加载配置
                const result = await bs.reloadChannelConfigs();
                return result;
            }

            if (method === 'GET' && id === 'status') {
                // 获取服务状态
                console.log('📺 [API] 获取服务状态请求');
                
                const channelCloneEnabled = process.env.CHANNEL_CLONE_ENABLED === 'true';
                console.log('📺 [API] 频道克隆功能启用状态:', channelCloneEnabled);
                
                if (!channelCloneEnabled) {
                    return { 
                        success: true, 
                        enabled: false,
                        message: '频道克隆功能未启用，请设置 CHANNEL_CLONE_ENABLED=true'
                    };
                }
                
                const bot = bs.getBotInstance();
                const queueStats = queueService ? await queueService.getQueueStats() : { isRunning: false };
                const cloneStats = cloneService ? cloneService.getCloneStats() : {};
                const broadcastStats = broadcastService ? broadcastService.getBroadcastStats() : {};
                
                console.log('📺 [API] 服务状态详情:', {
                    bot: !!bot,
                    configService: !!configService,
                    cloneService: !!cloneService,
                    queueService: !!queueService,
                    broadcastService: !!broadcastService,
                    queueRunning: queueStats.isRunning
                });
                
                return { 
                    success: true, 
                    enabled: true,
                    data: {
                        botInstance: !!bot,
                        services: {
                            configService: !!configService,
                            cloneService: !!cloneService,
                            queueService: !!queueService,
                            filterService: !!filterService,
                            broadcastService: !!broadcastService
                        },
                        queueService: {
                            running: queueStats.isRunning,
                            pendingTasks: queueStats.pendingTasks || 0
                        },
                        cloneService: {
                            totalCloned: cloneStats.totalCloned || 0,
                            totalErrors: cloneStats.totalErrors || 0,
                            activeConfigs: cloneStats.activeConfigs || 0,
                            instanceId: cloneStats.instanceId || null
                        },
                        broadcastService: {
                            totalBroadcasts: broadcastStats.totalBroadcasts || 0,
                            totalErrors: broadcastStats.totalErrors || 0,
                            lastBroadcastTime: broadcastStats.lastBroadcastTime || null,
                            instanceId: broadcastStats.instanceId || null
                        }
                    }
                };
            }
        }

        // 批量操作API
        if (endpoint === 'batch' && method === 'POST') {
            if (id === 'configs') {
                // 批量操作配置
                const { operation, configNames } = data;
                const result = await configService.batchOperation(operation, configNames);
                return { success: true, data: result };
            }
        }

        // 导入导出API
        if (endpoint === 'export' && method === 'POST') {
            // 导出配置
            const { configNames } = data;
            const exportData = await configService.exportConfigs(configNames);
            return { success: true, data: exportData };
        }

        if (endpoint === 'import' && method === 'POST') {
            // 导入配置
            const { importData, options } = data;
            const result = await configService.importConfigs(importData, options);
            return result;
        }

        // 频道信息API
        if (endpoint === 'info' && method === 'GET') {
            if (id) {
                // 获取频道信息
                const channelInfo = await configService.getChannelInfo(id, bs.getBotInstance());
                return { success: true, data: channelInfo };
            }
        }

        // 过滤器API
        if (endpoint === 'filters') {
            if (method === 'GET' && !id) {
                // 获取过滤器类型列表
                const filterTypes = filterService ? filterService.getFilterTypes() : [];
                return { success: true, data: filterTypes };
            }

            if (method === 'POST' && id === 'test') {
                // 测试过滤规则
                const { ruleData, testMessage } = data;
                const result = filterService ? await filterService.testFilterRule(ruleData, testMessage) : null;
                return result || { success: false, error: '过滤服务未初始化' };
            }
        }

        // 404 - 未找到对应的API端点
        return { success: false, error: '未找到对应的API端点', endpoint, method };

    } catch (error) {
        console.error('频道API处理错误:', error);
        return { success: false, error: error.message };
    }
}

// 文件下载处理
function handleFileDownload(req, res, pathname) {
    try {
        const filename = pathname.split('/').pop();
        const path = require('path');
        const filePath = path.join(__dirname, '../exports', filename);
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: '文件不存在' }));
            return;
        }
        
        // 获取文件信息
        const stats = fs.statSync(filePath);
        
        // 设置下载头
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', stats.size);
        
        // 创建文件流并传输
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        fileStream.on('error', (error) => {
            console.error('文件下载错误:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: '文件下载失败' }));
            }
        });
        
        console.log(`📥 文件下载: ${filename} (${stats.size} bytes)`);
        
    } catch (error) {
        console.error('文件下载处理错误:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '下载处理失败' }));
    }
}

// API请求处理
function handleApiRequest(req, res, pathname, method) {
    // 解析查询参数
    const url = require('url');
    const parsedUrl = url.parse(req.url, true);
    const queryParams = parsedUrl.query || {};
    

    
    let body = '';
    
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        try {
            let data = {};
            
            // 对于GET请求，使用查询参数
            if (method === 'GET') {
                data = queryParams;
            } else {
                // 对于POST/PUT/DELETE请求，使用body数据
                data = body ? JSON.parse(body) : {};
            }
            
            const response = await processApiRequest(pathname, method, data);
            
            sendResponse(res, 200, response, 'application/json');
        } catch (error) {
            console.error('API请求处理错误:', error);
            sendResponse(res, 500, { success: false, error: error.message }, 'application/json');
        }
    });
}

// API请求路由处理
async function processApiRequest(pathname, method, data) {
    // favicon处理
    if (pathname === '/favicon.ico') {
        return { 
            success: true, 
            statusCode: 204,
            headers: { 'Content-Type': 'image/x-icon' }
        };
    }

    // 手动播报API
    if (pathname === '/api/manual-broadcast' && method === 'POST') {
        try {
            const { orderId, broadcastType, customMessage } = data;
            
            if (!orderId) {
                return { success: false, error: '订单ID不能为空' };
            }

            console.log(`收到手动播报请求 - 订单ID: ${orderId}, 类型: ${broadcastType}, 自定义消息: ${customMessage}`);

            // 获取订单详情
            const order = dbOperations.getOrder(orderId);
            if (!order) {
                return { success: false, error: '订单不存在' };
            }

            // 获取商家信息
            const merchant = dbOperations.getMerchantById(order.merchant_id);
            if (!merchant) {
                return { success: false, error: '商家信息不存在' };
            }

            // 获取用户信息 - 避免重复添加@符号
            const rawUsername = order.user_username;
            const username = rawUsername ? 
                (rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`) : 
                '@未设置用户名';
            
            // 获取用户名称 - 优先使用订单中的用户名称
            const userFullName = order.user_name || '未设置用户名称';
            
            const teacherName = merchant.teacher_name || '未知老师';

            // 构建播报消息
            let broadcastMessage;
            if (customMessage) {
                // 使用自定义消息
                broadcastMessage = customMessage;
            } else {
                // 使用默认格式
                if (broadcastType === 'real') {
                    broadcastMessage = `🎉 恭喜小鸡的勇士：${userFullName}（${username}）出击了 #${teacherName} 老师！
🐤 小鸡出征！咯咯哒咯咯哒～`;
                } else {
                    broadcastMessage = `🎉 恭喜小鸡的勇士：隐藏用户 出击了 #${teacherName} 老师！
🐤 小鸡出征！咯咯哒咯咯哒～`;
                }
            }

            // 检查群组配置
            const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
            if (!GROUP_CHAT_ID) {
                return { success: false, error: '群组配置未设置，请在环境变量中设置GROUP_CHAT_ID' };
            }

            // 检查Bot配置
            const BOT_TOKEN = process.env.BOT_TOKEN;
            const BOT_USERNAME = process.env.BOT_USERNAME;
            
            if (!BOT_TOKEN || BOT_TOKEN === 'your_local_bot_token_here' || 
                !BOT_USERNAME || BOT_USERNAME === 'your_local_bot_username_here') {
                console.log('Bot配置未完成，使用测试模式');
                return { 
                    success: true, 
                    message: '播报成功！（测试模式：Bot配置未完成）',
                    messageId: 'test_' + Date.now(),
                    testMode: true,
                    broadcastContent: broadcastMessage,
                    groupId: GROUP_CHAT_ID
                };
            }

            const bs = getBotService();
            if (!bs || !bs.bot) {
                console.log('Bot服务未初始化，使用测试模式');
                return { 
                    success: true, 
                    message: '播报成功！（测试模式：Bot服务未初始化）',
                    messageId: 'test_' + Date.now(),
                    testMode: true,
                    broadcastContent: broadcastMessage,
                    groupId: GROUP_CHAT_ID
                };
            }

            // 发送消息到群组
            try {
                const sentMessage = await bs.bot.sendMessage(GROUP_CHAT_ID, broadcastMessage);
                console.log(`手动播报消息发送成功, message_id: ${sentMessage.message_id}`);

                // 尝试置顶消息
                try {
                    await bs.bot.pinChatMessage(GROUP_CHAT_ID, sentMessage.message_id);
                    console.log(`播报消息已置顶: ${sentMessage.message_id}`);
                } catch (pinError) {
                    console.log(`置顶消息失败: ${pinError.message}`);
                    // 置顶失败不影响播报成功
                }

                return { 
                    success: true, 
                    message: '播报成功！消息已发送到群组',
                    messageId: sentMessage.message_id
                };
            } catch (botError) {
                console.log('Telegram发送失败，使用测试模式:', botError.message);
                return { 
                    success: true, 
                    message: '播报成功！（测试模式：Telegram发送失败）',
                    messageId: 'test_' + Date.now(),
                    testMode: true,
                    broadcastContent: broadcastMessage
                };
            }

        } catch (error) {
            console.error('手动播报失败:', error);
            console.error('错误详情:', error.message);
            console.error('错误堆栈:', error.stack);
            
            // 检查具体错误类型
            let errorMessage = '播报失败，请联系管理员';
            if (error.message.includes('chat not found')) {
                errorMessage = '播报失败：群组未找到，请检查群组ID配置';
            } else if (error.message.includes('not enough rights')) {
                errorMessage = '播报失败：机器人没有发送消息权限，请联系群组管理员';
            } else if (error.message.includes('bot was blocked')) {
                errorMessage = '播报失败：机器人被群组封禁，请联系群组管理员';
            } else {
                errorMessage = `播报失败：${error.message}`;
            }
            
            return { success: false, error: errorMessage };
        }
    }

    // 使用ApiService处理请求
    if (pathname.startsWith('/api/')) {
        try {
            // 延迟加载ApiService，避免循环依赖问题
            let apiService;
            try {
                apiService = require('./apiService');
            } catch (requireError) {
                console.log('ApiService暂不可用，使用原有逻辑处理请求');
                // 继续使用原有的处理逻辑
            }
            
            if (apiService) {
                // 正确分离query和body参数
                const query = method === 'GET' ? data : {};
                const body = method !== 'GET' ? data : {};
                
                const result = await apiService.handleRequest(method, pathname, query, body);
                
                // 如果ApiService成功处理了请求，直接返回结果
                if (result && result.success === true) {
                    return result;
                }
                
                // 如果ApiService返回404，说明路由不存在，继续使用原有逻辑
                if (result && result.status === 404) {
                    console.log(`ApiService未处理请求: ${method} ${pathname}, 使用原有逻辑`);
                } else if (result && result.success === false) {
                    // 如果ApiService处理失败，也尝试使用原有逻辑作为备用
                    console.log(`ApiService处理请求失败: ${method} ${pathname}，尝试使用原有逻辑`, result);
                } else {
                    // 只有成功的情况才直接返回
                    console.log(`ApiService处理请求失败: ${method} ${pathname}`, result);
                    return result;
                }
            }
        } catch (error) {
            console.error('ApiService处理失败:', error);
            // 如果ApiService处理失败，继续使用原有的处理逻辑
        }
    }
    

    
    // 频道管理API路由 - 独立的API命名空间
    if (pathname.startsWith('/api/channel/')) {
        return await handleChannelApiRequest(pathname, method, data);
    }
    
    // 等级系统API路由
    if (pathname.startsWith('/api/level/')) {
        return await handleLevelApiRequest(pathname, method, data);
    }

    // 绑定码管理API
    if (pathname === '/api/bind-codes') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getAllBindCodes() };
        } else if (method === 'POST') {
            const result = dbOperations.createBindCode(data.description);
            await safeLoadCacheData();
            return { success: true, data: result };
        }
    }

    // 处理单个绑定码的删除和强制删除
    if (pathname.match(/^\/api\/bind-codes\/\d+$/)) {
        const bindCodeId = parseInt(pathname.split('/')[3]);
        
        if (method === 'DELETE') {
            try {
                // 使用统一的依赖检查方法
                const dependencies = dbOperations.checkBindCodeDependencies(bindCodeId);
                
                if (!dependencies.exists) {
                    return { success: false, error: '绑定码不存在' };
                }
                
                if (!dependencies.canDelete) {
                    return { 
                        success: false, 
                        error: dependencies.merchant 
                            ? `绑定码已被商家 ${dependencies.merchant.teacher_name} 使用，无法删除。如需强制删除，请使用强制删除功能。`
                            : '绑定码已被使用，无法删除。如需强制删除，请使用强制删除功能。',
                        code: 'BIND_CODE_IN_USE',
                        merchant: dependencies.merchant
                    };
                }
                
                // 删除未使用的绑定码
                const result = dbOperations.deleteBindCode(bindCodeId);
                await safeLoadCacheData();
                
                return { 
                    success: true, 
                    status: 200,
                    message: '绑定码删除成功',
                    data: {
                        deletedCount: result.changes
                    }
                };
            } catch (error) {
                console.error('删除绑定码失败:', error);
                return { success: false, error: error.message };
            }
        }
    }

    // 强制删除绑定码API
    if (pathname.match(/^\/api\/bind-codes\/\d+\/force$/)) {
        const bindCodeId = parseInt(pathname.split('/')[3]);
        
        if (method === 'DELETE') {
            try {
                const result = dbOperations.forceDeleteBindCode(bindCodeId);
                await safeLoadCacheData();
                
                return { 
                    success: true, 
                    status: 200,
                    message: result.deletedMerchant ? '绑定码及相关商家记录已强制删除' : '绑定码已删除',
                    data: {
                        deletedMerchant: result.deletedMerchant
                    }
                };
            } catch (error) {
                console.error('强制删除绑定码失败:', error);
                return { success: false, error: error.message };
            }
        }
    }

    // 批量删除测试绑定码API
    if (pathname === '/api/bind-codes/batch-delete-test' && method === 'DELETE') {
        try {
            // 获取所有描述包含"测试"的绑定码
            const { db } = require('../config/database');
            const testBindCodes = db.prepare(`
                SELECT * FROM bind_codes 
                WHERE description LIKE '%测试%' OR description LIKE '%test%'
            `).all();
            
            let deletedCount = 0;
            let deletedMerchants = 0;
            
            for (const bindCode of testBindCodes) {
                try {
                    // 如果绑定码已被使用，先删除相关商家
                    if (bindCode.used_by) {
                        const merchant = db.prepare('SELECT * FROM merchants WHERE bind_code = ?').get(bindCode.code);
                        if (merchant) {
                            dbOperations.deleteMerchant(merchant.id);
                            deletedMerchants++;
                        }
                    }
                    
                    // 删除绑定码
                    const result = dbOperations.deleteBindCode(bindCode.id);
                    if (result.changes > 0) {
                        deletedCount++;
                    }
                } catch (error) {
                    console.error(`删除测试绑定码 ${bindCode.code} 失败:`, error);
                }
            }
            
            await safeLoadCacheData();
            
            return { 
                success: true, 
                status: 200,
                message: `批量删除成功！删除了 ${deletedCount} 个测试绑定码${deletedMerchants > 0 ? `，${deletedMerchants} 个相关商家` : ''}`,
                data: {
                    deletedCount,
                    deletedMerchants
                }
            };
        } catch (error) {
            console.error('批量删除测试绑定码失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 地区管理API
    if (pathname === '/api/regions') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getAllRegions() };
        } else if (method === 'POST') {
            const result = dbOperations.createRegion(data.name, data.sortOrder);
            await safeLoadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'PUT') {
            dbOperations.updateRegion(data.id, data.name, data.sortOrder);
            await safeLoadCacheData();
            return { success: true };
        } else if (method === 'DELETE') {
            try {
            dbOperations.deleteRegion(data.id);
            await safeLoadCacheData();
                return { success: true, message: '地区删除成功' };
            } catch (error) {
                console.error('删除地区失败:', error);
                return { success: false, error: error.message };
        }
        }
    }

    // 检查地区依赖关系API
    if (pathname.match(/^\/api\/regions\/\d+\/dependencies$/) && method === 'GET') {
        const regionId = pathname.split('/')[3];
        const dependencies = dbOperations.checkRegionDependencies(regionId);
        return { success: true, data: dependencies };
    }

    // 商家管理API
    if (pathname === '/api/merchants') {
        if (method === 'GET') {
            // 检查是否只需要活跃商家
            const url = new URL(`http://localhost${pathname}?${req.url.split('?')[1] || ''}`);
            const activeOnly = url.searchParams.get('activeOnly') === 'true';
            
            if (activeOnly) {
                return { success: true, data: dbOperations.getActiveMerchants() };
            } else {
                return { success: true, data: dbOperations.getAllMerchants() };
            }
        } else if (method === 'POST') {
            try {
                if (!data.teacher_name || !data.username) {
                    return { success: false, error: '商家名称和用户名不能为空' };
                }
                
                let bindCode;
                let bindCodeRecord;
                
                // 如果提供了绑定码，验证其有效性
                if (data.bind_code) {
                    bindCodeRecord = dbOperations.getBindCode(data.bind_code);
                    if (!bindCodeRecord || bindCodeRecord.used) {
                        return { success: false, error: '提供的绑定码无效或已被使用' };
                    }
                    bindCode = data.bind_code;
                } else {
                    // 如果没有提供绑定码，自动创建一个
                    bindCodeRecord = dbOperations.createBindCode(`管理员创建: ${data.teacher_name} (@${data.username})`);
                    if (!bindCodeRecord) {
                        return { success: false, error: '创建绑定码失败' };
                    }
                    bindCode = bindCodeRecord.code;
                }
                
                // 尝试通过用户名自动检测Telegram ID
                let detectedUserId = null;
                const username = data.username.replace('@', '');
                
                try {
                    const botService = getBotService();
                    if (botService && botService.bot) {
                        // 尝试通过用户名获取用户信息
                        console.log(`🔍 尝试检测用户名 @${username} 的Telegram ID...`);
                        
                        // 方法1：尝试通过Chat API获取用户信息
                        try {
                            const chatInfo = await botService.bot.getChat(`@${username}`);
                            if (chatInfo && chatInfo.id) {
                                detectedUserId = chatInfo.id;
                                console.log(`✅ 成功检测到用户ID: ${detectedUserId} (通过Chat API)`);
                            }
                        } catch (chatError) {
                            console.log(`⚠️ Chat API检测失败: ${chatError.message}`);
                        }
                        
                        // 方法2：如果Chat API失败，尝试查找数据库中是否有相同用户名的记录
                        if (!detectedUserId) {
                            const { db } = require('../config/database');
                            const existingUser = db.prepare('SELECT user_id FROM merchants WHERE LOWER(username) = LOWER(?) AND user_id IS NOT NULL LIMIT 1').get(username);
                            if (existingUser && existingUser.user_id) {
                                detectedUserId = existingUser.user_id;
                                console.log(`✅ 从数据库中找到用户ID: ${detectedUserId} (通过历史记录)`);
                            }
                        }
                        
                        if (!detectedUserId) {
                            console.log(`⚠️ 无法自动检测用户名 @${username} 的Telegram ID，将等待用户主动绑定`);
                        }
                    }
                } catch (detectionError) {
                    console.log(`⚠️ 自动检测用户ID失败: ${detectionError.message}`);
                }
                
                // 创建商家记录
                const merchantData = {
                    user_id: detectedUserId, // 如果检测到了就直接设置，否则为null等待绑定
                    username: username,
                    bind_code: bindCode,
                    bind_step: 5, // 直接设置为完成状态
                    status: 'active',
                    teacher_name: data.teacher_name
                };
                
                const merchantId = dbOperations.createMerchantSimple(merchantData);
                
                if (!merchantId) {
                    return { success: false, error: '创建商家记录失败' };
                }
                
                // 如果检测到了用户ID，标记绑定码为已使用
                if (detectedUserId) {
                    dbOperations.useBindCode(bindCode, detectedUserId);
                }
                
                await safeLoadCacheData();
                
                const message = detectedUserId 
                    ? `商家创建成功，已自动检测到Telegram ID: ${detectedUserId}` 
                    : '商家创建成功，等待用户使用绑定码进行绑定';
                
                return { 
                    success: true, 
                    merchantId, 
                    bindCode: bindCode,
                    detectedUserId,
                    message
                };
            } catch (error) {
                console.error('创建商家失败:', error);
                return { success: false, error: '创建商家失败: ' + error.message };
            }
        }
    }

    // 检查商家依赖关系API
    if (pathname.match(/^\/api\/merchants\/\d+\/dependencies$/) && method === 'GET') {
        const merchantId = pathname.split('/')[3];
        const dependencies = dbOperations.checkMerchantDependencies(merchantId);
        return { success: true, data: dependencies };
    }

    // 删除商家API
    if (pathname.match(/^\/api\/merchants\/\d+$/) && method === 'DELETE') {
        const merchantId = pathname.split('/')[3];
        try {
            console.log(`🗑️ 开始删除商家 ID: ${merchantId}`);
            const result = dbOperations.deleteMerchant(merchantId);
            console.log(`✅ 商家删除成功，影响行数: ${result.changes}`);
            
            // 重新加载缓存数据
            await safeLoadCacheData();
            console.log(`🔄 缓存数据已重新加载`);
            
            return { success: true, message: '商家删除成功', deletedId: merchantId };
        } catch (error) {
            console.error('❌ 删除商家失败:', error);
            throw new Error('删除商家失败: ' + error.message);
        }
    }

    // 商家绑定状态重置API
    if (pathname.match(/^\/api\/merchants\/\d+\/reset$/) && method === 'POST') {
        const merchantId = pathname.split('/')[3];
        dbOperations.resetMerchantBind(merchantId);
        await safeLoadCacheData();
        return { success: true };
    }

    // 更新商家信息API
    if (pathname.match(/^\/api\/merchants\/\d+$/) && method === 'PUT') {
        const merchantId = pathname.split('/')[3];
        
        // 检查是否是模板更新（包含更多字段）
        if (data.advantages !== undefined || data.disadvantages !== undefined || 
            data.price1 !== undefined || data.price2 !== undefined ||
            data.skillWash !== undefined || data.skillBlow !== undefined ||
            data.skillDo !== undefined || data.skillKiss !== undefined ||
            data.channelLink !== undefined) {
            // 使用新的模板更新方法
            dbOperations.updateMerchantTemplate(merchantId, data);
        } else {
            // 使用原有的基本信息更新方法
            dbOperations.updateMerchant(merchantId, data.teacherName, data.regionId, data.contact);
        }

        // 如果包含绑定码，单独更新绑定码
        if (data.bindCode !== undefined) {
            dbOperations.updateMerchantBindCode(merchantId, data.bindCode);
        }
        
        await safeLoadCacheData();
        return { success: true };
    }

    // 暂停/恢复商家API
    if (pathname.match(/^\/api\/merchants\/\d+\/toggle-status$/) && method === 'POST') {
        const merchantId = pathname.split('/')[3];
        dbOperations.toggleMerchantStatus(merchantId);
        await safeLoadCacheData();
        return { success: true };
    }

    // 按钮管理API
    if (pathname === '/api/buttons') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getButtons() };
        } else if (method === 'POST') {
            const result = dbOperations.createButton(data.title, data.message, data.merchantId);
            await safeLoadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'DELETE') {
            dbOperations.deleteButton(data.id);
            await safeLoadCacheData();
            return { success: true };
        }
    }

    // 消息模板管理API
    if (pathname === '/api/templates') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getMessageTemplates() };
        } else if (method === 'POST') {
            const result = dbOperations.createMessageTemplate(
                data.name, data.content, data.imageUrl, data.buttonsConfig
            );
            await safeLoadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'PUT') {
            dbOperations.updateMessageTemplate(
                data.id, data.name, data.content, data.imageUrl, data.buttonsConfig
            );
            await safeLoadCacheData();
            return { success: true };
        } else if (method === 'DELETE') {
            dbOperations.deleteMessageTemplate(data.id);
            await safeLoadCacheData();
            return { success: true };
        }
    }

    // 触发词管理API
    if (pathname === '/api/triggers') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getTriggerWords() };
        } else if (method === 'POST') {
            const result = dbOperations.createTriggerWord(
                data.word, data.templateId, data.matchType, data.chatId
            );
            await safeLoadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'DELETE') {
            dbOperations.deleteTriggerWord(data.id);
            await safeLoadCacheData();
            return { success: true };
        }
    }

    // 定时任务管理API
    if (pathname === '/api/tasks') {
        if (method === 'GET') {
            return { success: true, data: dbOperations.getScheduledTasks() };
        } else if (method === 'POST') {
            const result = dbOperations.createScheduledTask(
                data.name, data.templateId, data.chatId, data.scheduleType,
                data.scheduleTime, data.sequenceOrder, data.sequenceDelay
            );
            await safeLoadCacheData();
            return { success: true, data: { id: result } };
        } else if (method === 'DELETE') {
            dbOperations.deleteScheduledTask(data.id);
            await safeLoadCacheData();
            return { success: true };
        }
    }

    // 统计数据API
    if (pathname === '/api/stats' && method === 'GET') {
        const stats = dbOperations.getInteractionStats();
        const cacheData = getCacheData();
        
        // 获取真实的点击统计 - 只统计用户点击"预约老师课程"按钮的次数
        const db = require('../config/database').getInstance().db;
        const attackClicks = db.prepare('SELECT COUNT(*) as count FROM interactions WHERE action_type = ?').get('attack_click').count;
        const totalClicks = attackClicks; // 总点击数就是预约按钮点击数
        
        // 获取实际数据库计数
        const bindCodes = dbOperations.getAllBindCodes();
        const regions = dbOperations.getAllRegions();
        
        return {
            success: true,
            data: {
                totalMerchants: cacheData.merchants.length,
                totalButtons: cacheData.buttons.length,
                totalTemplates: cacheData.messageTemplates.length,
                totalTriggers: cacheData.triggerWords.length,
                totalTasks: cacheData.scheduledTasks.length,
                totalBindCodes: bindCodes.length,
                totalRegions: regions.length,
                totalClicks: totalClicks,
                attackClicks: attackClicks,
                ...stats
            }
        };
    }

    // 管理员密码验证API
    if (pathname === '/api/admin/verify-password' && method === 'POST') {
        try {
            const { password } = data;
            if (!password) {
                return { success: false, error: '密码不能为空' };
            }
            
            const { verifyAdminPassword } = require('./merchantService');
            const isValid = verifyAdminPassword(password);
            
            return {
                success: true,
                valid: isValid
            };
        } catch (error) {
            console.error('验证管理员密码失败:', error);
            return {
                success: false,
                error: '验证失败'
            };
        }
    }

    // 测试发送API - 需要在通用API处理器之前处理
    if (pathname === '/api/test-send' && method === 'POST') {
        try {
            const bs = getBotService();
            if (!bs || !bs.bot) {
                return { success: false, error: 'Bot服务未初始化' };
            }

            const { chatId, groupId, type, merchantId, templateId, message, imageUrl, buttonsConfig } = data;
            
            // 兼容前端的参数名
            const targetChatId = chatId || groupId;
            
            // 验证必要参数
            if (!targetChatId) {
                return { success: false, error: '请输入群组ID' };
            }

            let messageContent = '';
            let sendOptions = {};

            // 根据发送类型构建消息内容
            if (type === 'merchant') {
                if (!merchantId) {
                    return { success: false, error: '请选择商家' };
                }
                
                const merchant = dbOperations.getMerchantById(merchantId);
                if (!merchant) {
                    return { success: false, error: '商家不存在' };
                }

                // 构建商家信息消息，使用正确的数据库字段名
                messageContent = `地区：#${merchant.region_name || 'xx'}              艺名：#${merchant.teacher_name || '未填写'}
优点：${merchant.advantages || '未填写'}
缺点：${merchant.disadvantages || '未填写'}
价格：${merchant.price1 || '未填写'}p              ${merchant.price2 || '未填写'}pp

老师💃自填基本功：
${dbOperations.formatMerchantSkillsDisplay(merchant.id)}`;

                // 添加跳转到私聊的按钮
                let botUsername;
                
                // 使用统一的Bot用户名获取机制
                try {
                    const bs = getBotService();
                    if (bs && bs.getBotUsername) {
                        botUsername = await bs.getBotUsername();
                    } else {
                        throw new Error('Bot服务未初始化');
                    }
                } catch (error) {
                    console.error('获取bot用户名失败:', error);
                    // 从环境变量获取bot用户名
                    botUsername = process.env.BOT_USERNAME;
                    if (!botUsername) {
                        console.error('❌ BOT_USERNAME 环境变量未设置');
                        return { success: false, error: 'Bot配置未设置，请联系管理员' };
                    }
                }
                
                // 构建按钮 - 群内发送时所有按钮都跳转到机器人
                const buttons = [
                    [{ text: '预约老师课程', url: `https://t.me/${botUsername}?start=merchant_${merchantId}` }]
                ];
                
                // 如果商家有频道链接，添加"关注老师频道"按钮
                if (merchant.channel_link && merchant.channel_link.trim()) {
                    buttons.push([{ text: '关注老师频道', url: `https://t.me/${botUsername}?start=merchant_${merchantId}` }]);
                }
                
                // 添加"返回榜单"按钮
                buttons.push([{ text: '返回榜单', url: 'https://t.me/xiaoji233' }]);
                
                sendOptions.reply_markup = {
                    inline_keyboard: buttons
                };

                // 如果商家有图片，使用商家图片；否则使用自定义图片
                if (merchant.image_url && merchant.image_url.trim()) {
                    sendOptions.caption = messageContent;
                    sendOptions.photo = merchant.image_url;
                } else if (imageUrl) {
                    sendOptions.caption = messageContent;
                    sendOptions.photo = imageUrl;
                }
            } else if (type === 'dailyHot') {
                // 当日热门老师
                const apiService = require('./apiService');
                const hotResult = await apiService.generateDailyHotMessage({ query: {} });
                
                if (!hotResult.success) {
                    return { success: false, error: hotResult.message || '获取当日热门数据失败' };
                }
                
                messageContent = hotResult.message;
                sendOptions.parse_mode = 'HTML';
                
            } else if (type === 'template') {
                if (!templateId) {
                    return { success: false, error: '请选择消息模板' };
                }
                
                const template = dbOperations.getMessageTemplateById(templateId);
                if (!template) {
                    return { success: false, error: '消息模板不存在' };
                }
                
                messageContent = template.content;
                
                // 如果模板有图片，使用模板图片
                if (template.image_url) {
                    sendOptions.caption = messageContent;
                    sendOptions.photo = template.image_url;
                }
            } else if (type === 'custom') {
                if (!message || !message.trim()) {
                    return { success: false, error: '请输入消息内容' };
                }
                messageContent = message;
                
                // 如果有图片，添加图片
                if (imageUrl) {
                    sendOptions.caption = messageContent;
                    sendOptions.photo = imageUrl;
                }
                
                // 如果有按钮配置，添加按钮
                if (buttonsConfig && buttonsConfig.length > 0) {
                    sendOptions.reply_markup = {
                        inline_keyboard: buttonsConfig
                    };
                }
            } else {
                return { success: false, error: '无效的发送类型' };
            }

            // 发送消息
            let result;
            if (sendOptions.photo) {
                // 发送图片消息
                const photoOptions = {
                    caption: sendOptions.caption,
                    parse_mode: 'HTML',
                    show_caption_above_media: true
                };
                if (sendOptions.reply_markup) {
                    photoOptions.reply_markup = sendOptions.reply_markup;
                }
                
                // 如果是base64图片数据，转换为Buffer
                let photoData = sendOptions.photo;
                if (typeof photoData === 'string' && photoData.startsWith('data:image/')) {
                    // 从base64 data URL中提取数据
                    const base64Data = photoData.split(',')[1];
                    photoData = Buffer.from(base64Data, 'base64');
                }
                
                result = await bs.bot.sendPhoto(targetChatId, photoData, photoOptions);
            } else {
                // 发送文本消息
                const textOptions = {
                    parse_mode: 'HTML'
                };
                if (sendOptions.reply_markup) {
                    textOptions.reply_markup = sendOptions.reply_markup;
                }
                result = await bs.bot.sendMessage(targetChatId, messageContent, textOptions);
            }

            console.log('✅ 测试消息发送成功:', {
                chatId: targetChatId,
                messageId: result.message_id,
                type,
                merchantId,
                templateId
            });

            return {
                success: true,
                message: '消息发送成功',
                data: {
                    messageId: result.message_id,
                    chatId: targetChatId
                }
            };

        } catch (error) {
            console.error('❌ 测试发送失败:', error);
            
            // 处理常见错误
            if (error.code === 'ETELEGRAM') {
                if (error.response && error.response.description) {
                    if (error.response.description.includes('chat not found')) {
                        return { success: false, error: '群组不存在或机器人未加入该群组' };
                    } else if (error.response.description.includes('not enough rights')) {
                        return { success: false, error: '机器人在该群组中没有发送消息的权限' };
                    } else if (error.response.description.includes('blocked')) {
                        return { success: false, error: '机器人被该群组屏蔽' };
                    }
                    return { success: false, error: `Telegram错误: ${error.response.description}` };
                }
            }
            
            return { 
                success: false, 
                error: `发送失败: ${error.message}` 
            };
        }
    }

    // 商家预约统计API
    if (pathname === '/api/merchant-bookings' && method === 'GET') {
        const bookingStats = dbOperations.getMerchantBookingStats();
        return {
            success: true,
            data: bookingStats
        };
    }

    // 消息统计API
    if (pathname === '/api/message-stats' && method === 'GET') {
        const messageStats = dbOperations.getMessageStats();
        return {
            success: true,
            data: messageStats
        };
    }

    // 最近预约记录API
    if (pathname === '/api/recent-bookings' && method === 'GET') {
        const recentBookings = dbOperations.getRecentBookings(20);
        return {
            success: true,
            data: recentBookings
        };
    }

    // 按钮点击统计API
    if (pathname === '/api/button-stats' && method === 'GET') {
        const buttonStats = dbOperations.getButtonClickStats();
        return {
            success: true,
            data: buttonStats
        };
    }

    // 评价管理API
    if (pathname === '/api/evaluations' && method === 'GET') {
        const evaluations = dbOperations.getAllEvaluations();
        return {
            success: true,
            data: evaluations
        };
    }

    // 评价详情API
    if (pathname.match(/^\/api\/evaluations\/\d+$/) && method === 'GET') {
        const evaluationId = pathname.split('/')[3];
        const evaluation = dbOperations.getEvaluationDetails(evaluationId);
        if (!evaluation) {
            return {
                success: false,
                error: '订单不存在或无评价数据'
            };
        }
        return {
            success: true,
            data: evaluation
        };
    }

    // 评价统计API
    if (pathname === '/api/evaluation-stats' && method === 'GET') {
        const stats = dbOperations.getEvaluationStats();
        return {
            success: true,
            data: stats
        };
    }

    // 订单评价API
    if (pathname === '/api/order-evaluations' && method === 'GET') {
        const orderEvaluations = dbOperations.getOrderEvaluations();
        return {
            success: true,
            data: orderEvaluations
        };
    }

    // 简单计数API
    if (pathname.startsWith('/api/simple-count/') && method === 'GET') {
        try {
            const tableName = pathname.split('/')[3];
            const apiService = require('./apiService');
            const result = await apiService.getSimpleCount({ params: { table: tableName } });
            return result;
        } catch (error) {
            console.error('获取简单计数失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 图表API路由
    if (pathname === '/api/charts/orders-trend' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getOrdersTrendChart({ query: data || {} });
            return result;
        } catch (error) {
            console.error('获取订单趋势图表失败:', error);
            return { success: false, error: error.message };
        }
    }

    if (pathname === '/api/charts/region-distribution' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getRegionDistributionChart({ query: data || {} });
            return result;
        } catch (error) {
            console.error('获取地区分布图表失败:', error);
            return { success: false, error: error.message };
        }
    }

    if (pathname === '/api/charts/price-distribution' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getPriceDistributionChart({ query: data || {} });
            return result;
        } catch (error) {
            console.error('获取价格分布图表失败:', error);
            return { success: false, error: error.message };
        }
    }

    if (pathname === '/api/charts/status-distribution' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getStatusDistributionChart({ query: data || {} });
            return result;
        } catch (error) {
            console.error('获取状态分布图表失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 频道点击相关API
    if (pathname === '/api/channel-clicks/recent' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getRecentChannelClicks({ query: data || {} });
            return result;
        } catch (error) {
            console.error('获取最新频道点击失败:', error);
            return { success: false, error: error.message };
        }
    }

    if (pathname === '/api/channel-clicks/stats' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getChannelClicksStats({ query: data || {} });
            return result;
        } catch (error) {
            console.error('获取频道点击统计失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 订单详情API
    if (pathname.match(/^\/api\/orders\/\d+$/) && method === 'GET') {
        try {
            const orderId = pathname.split('/')[3];
            const apiService = require('./apiService');
            const result = await apiService.getOrderById({ params: { id: orderId } });
            return {
                success: true,
                ...result
            };
        } catch (error) {
            console.error('获取订单详情失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 获取Bot用户名
    if (pathname === '/api/bot-username' && method === 'GET') {
        try {
            // 优先使用环境变量
            if (process.env.BOT_USERNAME) {
                console.log(`✅ 使用环境变量BOT_USERNAME: ${process.env.BOT_USERNAME}`);
                return {
                    success: true,
                    username: process.env.BOT_USERNAME
                };
            }
            
            // 尝试从Bot服务获取
            const bs = getBotService();
            if (bs && bs.getBotUsername) {
                const botUsername = await bs.getBotUsername();
                return {
                    success: true,
                    username: botUsername
                };
            }
            
            // 如果都不可用，返回默认值
            console.warn('⚠️ Bot用户名获取失败，使用默认值');
            return {
                success: true,
                username: 'xiaojisystembot' // 默认值
            };
            
        } catch (error) {
            console.error('获取Bot用户名失败:', error);
            // 即使出错也返回默认值，确保前端能正常工作
            return {
                success: true,
                username: 'xiaojisystembot'
            };
        }
    }

    // 商家排名API - 支持多种排名类型
    if (pathname === '/api/rankings/merchants' && method === 'GET') {
        try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const rankingType = url.searchParams.get('type') || 'monthlyOrders';
            const regionId = url.searchParams.get('regionId');
            const period = url.searchParams.get('period') || 'month';
            const dateFrom = url.searchParams.get('dateFrom');
            const dateTo = url.searchParams.get('dateTo');
            
            console.log('商家排名API参数:', { rankingType, regionId, period, dateFrom, dateTo });
            
            let rankings = [];
            
            // 统一使用apiService处理所有排名类型，包括频道点击排名
                const apiService = require('./apiService');
            const queryParams = {
                type: rankingType,
                regionId,
                period
            };
            
            // 添加时间参数
            if (dateFrom) queryParams.dateFrom = dateFrom;
            if (dateTo) queryParams.dateTo = dateTo;
            
                const result = await apiService.getMerchantRankings({
                query: queryParams
                });
            
                rankings = result.data || result.rankings || [];
            
            // 为每个商家添加排名序号
            rankings = rankings.map((merchant, index) => ({
                ...merchant,
                rank: index + 1
            }));
            
            console.log(`获取到 ${rankings.length} 个商家排名结果`);
            
            return {
                success: true,
                data: rankings
            };
        } catch (error) {
            console.error('获取商家排名失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 当日热门老师API
    if (pathname === '/api/daily-hot-teachers' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.getDailyHotTeachers({ query: data });
            return result;
        } catch (error) {
            console.error('获取当日热门老师失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 生成当日热门消息API
    if (pathname === '/api/daily-hot-message' && method === 'GET') {
        try {
            const apiService = require('./apiService');
            const result = await apiService.generateDailyHotMessage({ query: data });
            return result;
        } catch (error) {
            console.error('生成当日热门消息失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // API路由不存在
    console.log(`❌ API路径不存在: ${pathname} (${method})`);
    return { 
        success: false, 
        error: 'API路径不存在',
        availableEndpoints: [
            'GET /api/stats',
            'GET /api/orders', 
            'GET /api/bind-codes',
            'GET /api/regions',
            'GET /api/merchants',
            'GET /api/rankings/merchants',
            'GET /api/rankings/users',
            'GET /api/charts/*',
            'GET /api/daily-hot-teachers',
            'GET /api/daily-hot-message',
            'GET /api/bot-username'
        ]
    };
}

// Webhook更新处理 - 事件驱动机制
function processWebhookUpdate(update) {
    try {
        // 获取Bot服务实例（通过全局引用或依赖注入）
        const bs = getBotService();
        if (!bs || !bs.bot) {
            console.error('❌ Bot服务实例不存在');
            return;
        }

        // 处理文本消息
        if (update.message && update.message.text) {
            // 模拟bot.on('message')事件
            setImmediate(() => {
                bs.bot.emit('message', update.message);
            });
        }

        // 处理callback query
        if (update.callback_query) {
            // 模拟bot.on('callback_query')事件
            setImmediate(() => {
                bs.bot.emit('callback_query', update.callback_query);
            });
        }

        // 处理其他类型的更新
        if (update.inline_query) {
            setImmediate(() => {
                bs.bot.emit('inline_query', update.inline_query);
            });
        }

    } catch (error) {
        console.error('❌ 处理webhook更新失败:', error);
    }
}

// 检查数据库连接状态
function checkDatabaseConnection() {
    try {
        const { db } = require('../config/database');
        // 执行简单查询测试连接
        const result = db.prepare('SELECT 1 as test').get();
        return {
            connected: result && result.test === 1,
            error: null
        };
    } catch (error) {
        console.error('数据库连接检查失败:', error);
        return {
            connected: false,
            error: error.message
        };
    }
}

// 检查机器人状态
function checkBotStatus() {
    try {
        const bs = getBotService();
        // 检查bot实例是否存在且已初始化
        if (!bs || !bs.bot || !bs.bot.token) {
            return {
                connected: false,
                error: 'Bot未初始化'
            };
        }
        
        // 检查bot是否正在运行
        return {
            connected: true,
            token_prefix: bs.bot.token.substring(0, 5) + '...',
            webhook_info: bs.bot.hasOpenWebHook ? 'active' : 'inactive'
        };
    } catch (error) {
        console.error('Bot状态检查失败:', error);
        return {
            connected: false,
            error: error.message
        };
    }
}

// 发送消息到群组
async function sendMessageToGroup(groupId, message, options = {}) {
    try {
        const bs = getBotService();
        if (!bs || !bs.bot) {
            throw new Error('Bot实例未初始化');
        }
        
        const sendOptions = {
            parse_mode: 'HTML',
            ...options
        };
        
        const result = await bs.bot.sendMessage(groupId, message, sendOptions);
        return {
            success: true,
            messageId: result.message_id,
            chatId: result.chat.id
        };
    } catch (error) {
        console.error('发送群组消息失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// 发送消息到用户
async function sendMessageToUser(userId, message, options = {}) {
    try {
        const bs = getBotService();
        if (!bs || !bs.bot) {
            throw new Error('Bot实例未初始化');
        }
        
        const sendOptions = {
            parse_mode: 'HTML',
            ...options
        };
        
        const result = await bs.bot.sendMessage(userId, message, sendOptions);
        return {
            success: true,
            messageId: result.message_id,
            chatId: result.chat.id
        };
    } catch (error) {
        console.error('发送用户消息失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// 压缩响应数据
function compressResponse(data, acceptEncoding) {
    if (!acceptEncoding || data.length < COMPRESSION_THRESHOLD) {
        return { data, encoding: null };
    }
    
    if (acceptEncoding.includes('gzip')) {
        return { data: zlib.gzipSync(data), encoding: 'gzip' };
    } else if (acceptEncoding.includes('deflate')) {
        return { data: zlib.deflateSync(data), encoding: 'deflate' };
    }
    
    return { data, encoding: null };
}

// 设置缓存头功能已整合到sendResponse函数中

function sendResponse(res, statusCode, data, contentType = 'application/json') {
    try {
        // 检查响应是否已经发送
        if (res.headersSent) {
            console.log('响应头已发送，跳过重复发送');
            return;
        }
        
        let responseData;
        
        if (contentType === 'application/json') {
            responseData = JSON.stringify(data);
        } else {
            responseData = data;
        }
        
        // 应用压缩
        const acceptEncoding = res.req.headers['accept-encoding'] || '';
        const compressed = compressResponse(Buffer.from(responseData), acceptEncoding);
        
        // 构建响应头
        const headers = {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Content-Length': compressed.data.length
        };
        
        // 添加压缩编码头
        if (compressed.encoding) {
            headers['Content-Encoding'] = compressed.encoding;
        }
        
        // 对于GET请求的API数据，添加缓存头
        if (res.req.method === 'GET' && res.req.url.startsWith('/api/')) {
            // 对于经常变动的数据（如绑定码、商家等），禁用缓存
            if (res.req.url.includes('/bind-codes') || res.req.url.includes('/merchants') || res.req.url.includes('/orders')) {
                headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
                headers['Pragma'] = 'no-cache';
                headers['Expires'] = '0';
            } else {
                // 其他相对稳定的数据可以短期缓存
                headers['Cache-Control'] = `public, max-age=60`; // 1分钟缓存
                headers['ETag'] = `"${Date.now()}"`;
            }
        }
        
        // 设置响应头并发送数据
        res.writeHead(statusCode, headers);
        res.end(compressed.data);
        
    } catch (error) {
        console.error('发送响应失败:', error);
        // 只有在响应头未发送时才尝试发送错误响应
        if (!res.headersSent) {
            try {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '服务器内部错误' }));
            } catch (secondError) {
                console.error('发送错误响应也失败:', secondError);
            }
        }
    }
}

// 获取默认等级配置
function getDefaultLevelConfig() {
    return {
        levels: [
            { level: 1, name: "新手勇士 🟢", required_exp: 0, required_evals: 0 },
            { level: 2, name: "初级勇士 🔵", required_exp: 50, required_evals: 3 },
            { level: 3, name: "中级勇士 🟣", required_exp: 150, required_evals: 8 },
            { level: 4, name: "高级勇士 🟠", required_exp: 300, required_evals: 15 },
            { level: 5, name: "专家勇士 🔴", required_exp: 500, required_evals: 25 }
        ]
    };
}

// 获取默认积分配置
function getDefaultPointsConfig() {
    return {
        base_rewards: {
            attack: { exp: 20, points: 10, desc: "完成出击" },
            user_eval_12: { exp: 30, points: 25, desc: "完成12项按钮评价" },
            merchant_eval: { exp: 25, points: 20, desc: "商家评价用户" },
            text_eval: { exp: 15, points: 15, desc: "文字详细评价" },
            level_up_bonus: { exp: 0, points: 50, desc: "升级奖励" }
        },
        special_rewards: {
            perfect_score: { exp: 50, points: 100, desc: "满分评价奖励" },
            first_evaluation: { exp: 100, points: 200, desc: "首次评价奖励" },
            milestone_100: { exp: 200, points: 500, desc: "100次评价里程碑" }
        },
        multipliers: {
            weekend: 1.2,
            holiday: 1.5,
            special_event: 2.0
        }
    };
}

// 获取默认播报配置
function getDefaultBroadcastConfig() {
    return {
        enabled: {
            levelUp: true,
            badgeUnlock: true,
            milestone: false,
            perfectScore: false
        },
        templates: {
            levelUp: `🎉 恭喜 {{user_name}} 升级了！
⭐ Lv.{{old_level}} → Lv.{{new_level}} {{level_name}}
💎 升级奖励：{{level_up_points}}积分
继续努力，成为传说勇士！💪`,
            badgeUnlock: `🏆 {{user_name}} 解锁了新勋章！
{{badge_emoji}} {{badge_name}}
{{badge_desc}}`
        },
        cooldown: {
            levelUp: 0,
            badgeUnlock: 300,
            milestone: 600
        }
    };
}

// 等级系统API处理函数
async function handleLevelApiRequest(pathname, method, data) {
    console.log(`🏆 [API] 等级系统API请求: ${method} ${pathname}`);
    
    try {
        // 检查等级系统是否启用
        if (process.env.LEVEL_SYSTEM_ENABLED !== 'true') {
            return { success: false, error: '等级系统未启用' };
        }
        
        // 获取等级系统服务
        const levelService = require('../level/services/levelService').getInstance();
        const badgeService = require('../level/services/badgeService').getInstance();
        const levelServiceHook = require('../level/services/levelServiceHook').getInstance();
        const levelDbManager = require('../level/config/levelDatabase').getInstance();
        
        const pathParts = pathname.split('/');
        const endpoint = pathParts[3]; // /api/level/{endpoint}
        const id = pathParts[4];
        
        // 验证管理员密码的辅助函数
        function verifyAdminPassword(password) {
            if (!password) {
                return false;
            }
            try {
                const { verifyAdminPassword } = require('./merchantService');
                return verifyAdminPassword(password);
            } catch (error) {
                console.error('验证管理员密码失败:', error);
                return false;
            }
        }
        
        // 需要管理员密码验证的破坏性操作
        const destructiveOperations = [
            // 删除操作
            { endpoint: 'groups', method: 'DELETE' },
            { endpoint: 'badges', method: 'DELETE' },
            { endpoint: 'users', method: 'DELETE' },
            // 批量删除操作
            { endpoint: 'badges', method: 'POST', action: 'delete' },
            { endpoint: 'levels', method: 'DELETE' },
            // 重置操作
            { endpoint: 'config', method: 'POST', action: 'reset' },
            { endpoint: 'rewards', method: 'POST', action: 'reset' },
            // 数据清理操作
            { endpoint: 'data', method: 'POST', action: 'clear' },
            { endpoint: 'migrate', method: 'POST' }
        ];
        
        // 检查是否为破坏性操作
        const isDestructive = destructiveOperations.some(op => {
            if (op.endpoint === endpoint && op.method === method) {
                if (op.action) {
                    return data.action === op.action;
                }
                return true;
            }
            return false;
        });
        
        // 对破坏性操作进行密码验证
        if (isDestructive) {
            const adminPassword = data.adminPassword;
            if (!adminPassword) {
                return { 
                    success: false, 
                    error: '此操作需要管理员密码验证',
                    requirePassword: true 
                };
            }
            
            if (!verifyAdminPassword(adminPassword)) {
                return { 
                    success: false, 
                    error: '管理员密码错误',
                    requirePassword: true 
                };
            }
            
            console.log(`🔐 管理员密码验证通过，执行破坏性操作: ${method} ${pathname}`);
        }

        // 用户等级信息API
        if (endpoint === 'users' && method === 'GET') {
            if (id) {
                // 获取单个用户等级信息
                const groupId = data.groupId;
                if (!groupId) {
                    return { success: false, error: '请提供groupId参数' };
                }
                
                const levelInfo = await levelServiceHook.getUserLevelInfo(id, groupId);
                
                if (!levelInfo) {
                    return { success: false, error: '用户等级信息不存在' };
                }
                
                return { success: true, data: levelInfo };
            } else {
                // 获取用户列表
                const db = levelDbManager.getDatabase();
                if (!db) {
                    return { success: false, error: '数据库不可用' };
                }
                
                // 从URL查询参数中获取参数
                const groupId = data.groupId;
                const limit = parseInt(data.limit) || 50;
                const offset = parseInt(data.offset) || 0;
                const search = data.search || '';
                
                // 检查是否有有效的群组ID
                if (!groupId) {
                    return { 
                        success: false, 
                        error: '请提供groupId参数，或通过管理员面板选择群组' 
                    };
                }
                
                console.log(`🏆 [API] 查询用户列表: groupId=${groupId}, limit=${limit}, offset=${offset}, search=${search}`);
                
                let users, total;
                
                if (search) {
                    // 搜索用户
                    users = db.prepare(`
                        SELECT * FROM user_levels 
                        WHERE group_id = ? AND (
                            user_id LIKE ? OR 
                            display_name LIKE ?
                        )
                        ORDER BY level DESC, total_exp DESC
                        LIMIT ? OFFSET ?
                    `).all(groupId, `%${search}%`, `%${search}%`, limit, offset);
                    
                    const searchTotal = db.prepare(`
                        SELECT COUNT(*) as count FROM user_levels 
                        WHERE group_id = ? AND (
                            user_id LIKE ? OR 
                            display_name LIKE ?
                        )
                    `).get(groupId, `%${search}%`, `%${search}%`);
                    
                    total = searchTotal;
                } else {
                    // 如果没有指定群组ID且环境变量也没有设置，获取所有群组的用户
                    if (!data.groupId && !process.env.GROUP_CHAT_ID) {
                        users = db.prepare(`
                            SELECT * FROM user_levels 
                            ORDER BY level DESC, total_exp DESC
                            LIMIT ? OFFSET ?
                        `).all(limit, offset);
                        
                        total = db.prepare(`
                            SELECT COUNT(*) as count FROM user_levels
                        `).get();
                    } else {
                        // 获取指定群组的用户
                        users = db.prepare(`
                            SELECT * FROM user_levels 
                            WHERE group_id = ?
                            ORDER BY level DESC, total_exp DESC
                            LIMIT ? OFFSET ?
                        `).all(groupId, limit, offset);
                        
                        total = db.prepare(`
                            SELECT COUNT(*) as count FROM user_levels WHERE group_id = ?
                        `).get(groupId);
                    }
                }
                
                console.log(`🏆 [API] 查询结果: 找到 ${users.length} 个用户，总计 ${total.count} 个`);
                
                return { 
                    success: true, 
                    data: {
                        users,
                        total: total.count,
                        limit,
                        offset
                    }
                };
            }
        }
        
        // 用户等级更新API（管理员功能）
        if (endpoint === 'users' && id && method === 'PUT') {
            const { exp, points, level, displayName } = data;
            const groupId = data.groupId;
            
            if (!groupId) {
                return { success: false, error: '请提供groupId参数' };
            }
            
            // 更新经验值和积分
            if (exp !== undefined || points !== undefined) {
                await levelServiceHook.grantReward(
                    id, 
                    groupId, 
                    exp || 0, 
                    points || 0, 
                    '管理员手动调整'
                );
            }
            
            // 更新等级
            if (level !== undefined) {
                const db = levelDbManager.getDatabase();
                if (db) {
                    db.prepare(`
                        UPDATE user_levels 
                        SET level = ?, updated_at = ?
                        WHERE user_id = ? AND group_id = ?
                    `).run(level, Date.now() / 1000, id, groupId);
                }
            }
            
            // 更新显示名称
            if (displayName !== undefined) {
                await levelService.setCustomDisplayName(id, groupId, displayName);
            }
            
            return { success: true, message: '用户等级信息更新成功' };
        }
        
        // 勋章管理API
        if (endpoint === 'badges') {
            if (method === 'GET') {
                const groupId = data.groupId;
                if (!groupId) {
                    return { success: false, error: '请提供groupId参数' };
                }
                
                const badges = await badgeService.getAvailableBadges(groupId);
                return { success: true, data: badges };
            } else if (method === 'POST') {
                // 创建新勋章（管理员功能）
                const db = levelDbManager.getDatabase();
                if (!db) {
                    return { success: false, error: '数据库不可用' };
                }
                
                const { badge_id, badge_name, badge_emoji, badge_desc, badge_type, rarity, unlock_conditions } = data;
                const groupId = data.group_id;
                
                if (!groupId) {
                    return { success: false, error: '请提供group_id参数' };
                }
                
                if (!badge_id || !badge_name) {
                    return { success: false, error: '勋章ID和名称不能为空' };
                }
                
                try {
                    db.prepare(`
                        INSERT INTO badge_definitions 
                        (group_id, badge_id, badge_name, badge_emoji, badge_desc, 
                         badge_type, rarity, unlock_conditions, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
                    `).run(
                        groupId, badge_id, badge_name, badge_emoji || '🏅',
                        badge_desc || '', badge_type || 'achievement',
                        rarity || 'common', JSON.stringify(unlock_conditions || {})
                    );
                    
                    return { success: true, message: '勋章创建成功' };
                } catch (error) {
                    return { success: false, error: '勋章创建失败: ' + error.message };
                }
            }
        }
        
        // 单个勋章管理API（更新和删除）
        if (endpoint === 'badges' && id) {
            if (method === 'PUT') {
                // 更新勋章
                const db = levelDbManager.getDatabase();
                if (!db) {
                    return { success: false, error: '数据库不可用' };
                }
                
                const { badge_name, badge_emoji, badge_desc, badge_type, rarity, unlock_conditions } = data;
                
                if (!badge_name) {
                    return { success: false, error: '勋章名称不能为空' };
                }
                
                try {
                    const result = db.prepare(`
                        UPDATE badge_definitions 
                        SET badge_name = ?, badge_emoji = ?, badge_desc = ?, 
                            badge_type = ?, rarity = ?, unlock_conditions = ?
                        WHERE badge_id = ?
                    `).run(
                        badge_name,
                        badge_emoji || '🏅',
                        badge_desc || '',
                        badge_type || 'achievement',
                        rarity || 'common',
                        typeof unlock_conditions === 'string' ? unlock_conditions : JSON.stringify(unlock_conditions || {}),
                        id
                    );
                    
                    if (result.changes === 0) {
                        return { success: false, error: '勋章不存在或未更新' };
                    }
                    
                    return { success: true, message: '勋章更新成功' };
                } catch (error) {
                    console.error('更新勋章失败:', error);
                    return { success: false, error: '勋章更新失败: ' + error.message };
                }
            } else if (method === 'DELETE') {
                // 删除勋章（破坏性操作）
                const db = levelDbManager.getDatabase();
                if (!db) {
                    return { success: false, error: '数据库不可用' };
                }
                
                try {
                    // 开始事务
                    db.prepare('BEGIN TRANSACTION').run();
                    
                    try {
                        // 1. 删除勋章定义
                        const deleteBadgeResult = db.prepare('DELETE FROM badge_definitions WHERE badge_id = ?').run(id);
                        
                        // 2. 删除用户勋章记录
                        const deleteUserBadgesResult = db.prepare('DELETE FROM user_badges WHERE badge_id = ?').run(id);
                        
                        // 提交事务
                        db.prepare('COMMIT').run();
                        
                        console.log(`🗑️ 勋章删除完成: ${id}`);
                        console.log(`   - 勋章定义删除: ${deleteBadgeResult.changes} 条`);
                        console.log(`   - 用户勋章删除: ${deleteUserBadgesResult.changes} 条`);
                        
                        return { 
                            success: true, 
                            message: '勋章删除成功',
                            details: {
                                badgeDeleted: deleteBadgeResult.changes,
                                userBadgesDeleted: deleteUserBadgesResult.changes
                            }
                        };
                    } catch (error) {
                        // 回滚事务
                        db.prepare('ROLLBACK').run();
                        throw error;
                    }
                } catch (error) {
                    console.error('删除勋章失败:', error);
                    return { success: false, error: '勋章删除失败: ' + error.message };
                }
            }
        }
        
        // 勋章授予/撤销API
        if (endpoint === 'badges' && pathParts[4] === 'grant' && method === 'POST') {
            const { userId, badgeId, groupId } = data;
            const grantedBy = 'admin';
            
            const result = await badgeService.grantBadge(
                userId, 
                groupId || process.env.GROUP_CHAT_ID, 
                badgeId, 
                grantedBy
            );
            
            return result ? 
                { success: true, message: '勋章授予成功' } : 
                { success: false, error: '勋章授予失败' };
        }
        
        if (endpoint === 'badges' && pathParts[4] === 'revoke' && method === 'POST') {
            const { userId, badgeId, groupId } = data;
            const revokedBy = 'admin';
            
            const result = await badgeService.revokeBadge(
                userId, 
                groupId || process.env.GROUP_CHAT_ID, 
                badgeId, 
                revokedBy
            );
            
            return result ? 
                { success: true, message: '勋章撤销成功' } : 
                { success: false, error: '勋章撤销失败' };
        }
        
        // 群组配置API
        if (endpoint === 'groups') {
            const db = levelDbManager.getDatabase();
            if (!db) {
                return { success: false, error: '数据库不可用' };
            }
            
            if (method === 'GET') {
                if (id) {
                    // 获取单个群组配置
                    const config = db.prepare(`
                        SELECT * FROM group_configs WHERE group_id = ?
                    `).get(id);
                    
                    if (!config) {
                        // 如果不存在，创建默认配置
                        const defaultConfig = {
                            group_id: id,
                            group_name: id,
                            level_config: JSON.stringify(getDefaultLevelConfig()),
                            points_config: JSON.stringify(getDefaultPointsConfig()),
                            broadcast_config: JSON.stringify(getDefaultBroadcastConfig()),
                            created_at: Date.now() / 1000,
                            updated_at: Date.now() / 1000
                        };
                        
                        db.prepare(`
                            INSERT INTO group_configs 
                            (group_id, group_name, level_config, points_config, broadcast_config, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            defaultConfig.group_id,
                            defaultConfig.group_name,
                            defaultConfig.level_config,
                            defaultConfig.points_config,
                            defaultConfig.broadcast_config,
                            defaultConfig.created_at,
                            defaultConfig.updated_at
                        );
                        
                        return { success: true, data: defaultConfig };
                    }
                    
                    return { success: true, data: config };
                } else {
                    // 获取所有群组配置
                    const configs = db.prepare(`
                        SELECT * FROM group_configs
                        ORDER BY created_at DESC
                    `).all();
                    
                    return { success: true, data: configs };
                }
            } else if (method === 'POST' && !id) {
                // 创建新群组配置
                const { group_id, group_name } = data;
                
                if (!group_id) {
                    return { success: false, error: '群组ID不能为空' };
                }
                
                try {
                    db.prepare(`
                        INSERT INTO group_configs 
                        (group_id, group_name, level_config, points_config, broadcast_config, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        group_id,
                        group_name || group_id,
                        JSON.stringify(getDefaultLevelConfig()),
                        JSON.stringify(getDefaultPointsConfig()),
                        JSON.stringify(getDefaultBroadcastConfig()),
                        Date.now() / 1000,
                        Date.now() / 1000
                    );
                    
                    return { success: true, message: '群组配置创建成功' };
                } catch (error) {
                    return { success: false, error: '群组配置创建失败: ' + error.message };
                }
            } else if (method === 'PUT' && id) {
                // 更新群组配置
                const { level_config, points_config, broadcast_config, group_name } = data;
                
                try {
                    // 构建动态SQL
                    const updates = [];
                    const params = [];
                    
                    if (level_config !== undefined) {
                        updates.push('level_config = ?');
                        params.push(typeof level_config === 'string' ? level_config : JSON.stringify(level_config));
                    }
                    
                    if (points_config !== undefined) {
                        updates.push('points_config = ?');
                        params.push(typeof points_config === 'string' ? points_config : JSON.stringify(points_config));
                    }
                    
                    if (broadcast_config !== undefined) {
                        updates.push('broadcast_config = ?');
                        params.push(typeof broadcast_config === 'string' ? broadcast_config : JSON.stringify(broadcast_config));
                    }
                    
                    if (group_name !== undefined) {
                        updates.push('group_name = ?');
                        params.push(group_name);
                    }
                    
                    if (updates.length === 0) {
                        return { success: false, error: '没有要更新的字段' };
                    }
                    
                    updates.push('updated_at = ?');
                    params.push(Date.now() / 1000);
                    params.push(id);
                    
                    const sql = `UPDATE group_configs SET ${updates.join(', ')} WHERE group_id = ?`;
                    db.prepare(sql).run(...params);
                    
                    return { success: true, message: '群组配置更新成功' };
                } catch (error) {
                    return { success: false, error: '配置更新失败: ' + error.message };
                }
            } else if (method === 'DELETE' && id) {
                // 删除群组配置（破坏性操作）
                try {
                    const db = levelDbManager.getDatabase();
                    if (!db) {
                        return { success: false, error: '数据库不可用' };
                    }
                    
                    // 开始事务
                    db.prepare('BEGIN TRANSACTION').run();
                    
                    try {
                        // 1. 删除群组配置
                        const deleteConfigResult = db.prepare('DELETE FROM group_configs WHERE group_id = ?').run(id);
                        
                        // 2. 删除群组相关的用户等级数据
                        const deleteUsersResult = db.prepare('DELETE FROM user_levels WHERE group_id = ?').run(id);
                        
                        // 3. 删除群组相关的用户勋章数据
                        const deleteBadgesResult = db.prepare('DELETE FROM user_badges WHERE group_id = ?').run(id);
                        
                        // 4. 删除群组专属的勋章定义
                        const deleteBadgeDefsResult = db.prepare('DELETE FROM badge_definitions WHERE group_id = ?').run(id);
                        
                        // 提交事务
                        db.prepare('COMMIT').run();
                        
                        console.log(`🗑️ 群组删除完成: ${id}`);
                        console.log(`   - 配置删除: ${deleteConfigResult.changes} 条`);
                        console.log(`   - 用户数据删除: ${deleteUsersResult.changes} 条`);
                        console.log(`   - 用户勋章删除: ${deleteBadgesResult.changes} 条`);
                        console.log(`   - 勋章定义删除: ${deleteBadgeDefsResult.changes} 条`);
                        

                        
                        return { 
                            success: true, 
                            message: '群组配置删除成功',
                            details: {
                                configDeleted: deleteConfigResult.changes,
                                usersDeleted: deleteUsersResult.changes,
                                badgesDeleted: deleteBadgesResult.changes,
                                badgeDefsDeleted: deleteBadgeDefsResult.changes
                            }
                        };
                    } catch (error) {
                        // 回滚事务
                        db.prepare('ROLLBACK').run();
                        throw error;
                    }
                } catch (error) {
                    console.error('删除群组配置失败:', error);
                    return { success: false, error: '群组配置删除失败: ' + error.message };
                }
            }
        }
        
        // 群组配置子路径API
        if (endpoint === 'groups' && id && pathParts[5] === 'config') {
            const configType = pathParts[6]; // level, points, broadcast
            
            if (method === 'GET') {
                const config = db.prepare(`
                    SELECT ${configType}_config FROM group_configs WHERE group_id = ?
                `).get(id);
                
                if (!config) {
                    return { success: false, error: '群组配置不存在' };
                }
                
                return { 
                    success: true, 
                    data: JSON.parse(config[`${configType}_config`])
                };
            } else if (method === 'PUT') {
                try {
                    const sql = `UPDATE group_configs SET ${configType}_config = ?, updated_at = ? WHERE group_id = ?`;
                    db.prepare(sql).run(
                        JSON.stringify(data),
                        Date.now() / 1000,
                        id
                    );
                    
                    return { success: true, message: `${configType}配置更新成功` };
                } catch (error) {
                    return { success: false, error: `${configType}配置更新失败: ` + error.message };
                }
            }
        }
        
        // 统计数据API
        if (endpoint === 'stats' && method === 'GET') {
            const db = levelDbManager.getDatabase();
            if (!db) {
                return { success: false, error: '数据库不可用' };
            }
            
            // 从URL查询参数中获取groupId
            const groupId = data.groupId;
            
            // 检查是否有有效的群组ID
            if (!groupId) {
                return { 
                    success: false, 
                    error: '请提供groupId参数，或通过管理员面板选择群组' 
                };
            }
            
            console.log(`🏆 [API] 查询统计数据: groupId=${groupId}`);
            
            // 获取统计数据
            const stats = {
                totalUsers: db.prepare(`
                    SELECT COUNT(*) as count FROM user_levels WHERE group_id = ?
                `).get(groupId).count,
                
                activeUsers: db.prepare(`
                    SELECT COUNT(*) as count FROM user_levels 
                    WHERE group_id = ? AND updated_at > ?
                `).get(groupId, Date.now() / 1000 - 7 * 24 * 60 * 60).count, // 7天内活跃
                
                totalBadges: db.prepare(`
                    SELECT COUNT(*) as count FROM badge_definitions 
                    WHERE (group_id = ? OR group_id = 'default') AND status = 'active'
                `).get(groupId).count,
                
                totalBadgesUnlocked: db.prepare(`
                    SELECT COUNT(*) as count FROM user_badges WHERE group_id = ?
                `).get(groupId).count,
                
                avgLevel: (() => {
                    const result = db.prepare(`
                        SELECT AVG(level) as avg FROM user_levels WHERE group_id = ?
                    `).get(groupId);
                    return result.avg ? parseFloat(result.avg).toFixed(1) : 0;
                })(),
                
                levelDistribution: db.prepare(`
                    SELECT level, COUNT(*) as count 
                    FROM user_levels 
                    WHERE group_id = ?
                    GROUP BY level
                    ORDER BY level ASC
                `).all(groupId),
                
                topUsers: db.prepare(`
                    SELECT user_id, display_name, level, total_exp, user_eval_count
                    FROM user_levels
                    WHERE group_id = ?
                    ORDER BY level DESC, total_exp DESC
                    LIMIT 10
                `).all(groupId)
            };
            
            return { success: true, data: stats };
        }
        
        // 等级配置API
        if (endpoint === 'config' && method === 'GET') {
            const db = levelDbManager.getDatabase();
            if (!db) {
                return { success: false, error: '数据库不可用' };
            }
            
            const groupId = data.groupId;
            if (!groupId) {
                return { success: false, error: '群组ID不能为空，请先选择群组' };
            }
            
            const config = db.prepare(`
                SELECT level_config FROM group_configs WHERE group_id = ?
            `).get(groupId);
            
            if (!config) {
                return { success: true, data: getDefaultLevelConfig() };
            }
            
            return { success: true, data: JSON.parse(config.level_config) };
        }
        
        if (endpoint === 'config' && method === 'POST') {
            const db = levelDbManager.getDatabase();
            if (!db) {
                return { success: false, error: '数据库不可用' };
            }
            
            const { groupId, levelConfig } = data;
            if (!groupId) {
                return { success: false, error: '群组ID不能为空，请先选择群组' };
            }
            
            try {
                // 检查群组配置是否存在
                const exists = db.prepare(`
                    SELECT 1 FROM group_configs WHERE group_id = ?
                `).get(groupId);
                
                if (exists) {
                    // 更新现有配置
                    db.prepare(`
                        UPDATE group_configs 
                        SET level_config = ?, updated_at = ?
                        WHERE group_id = ?
                    `).run(
                        JSON.stringify(levelConfig),
                        Date.now() / 1000,
                        groupId
                    );
                } else {
                    // 创建新配置
                    db.prepare(`
                        INSERT INTO group_configs 
                        (group_id, group_name, level_config, points_config, broadcast_config, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        groupId,
                        groupId,
                        JSON.stringify(levelConfig),
                        JSON.stringify(getDefaultPointsConfig()),
                        JSON.stringify(getDefaultBroadcastConfig()),
                        Date.now() / 1000,
                        Date.now() / 1000
                    );
                }
                
                return { success: true, message: '等级配置保存成功' };
            } catch (error) {
                return { success: false, error: '等级配置保存失败: ' + error.message };
            }
        }
        
        // 奖励配置API
        if (endpoint === 'rewards' && method === 'GET') {
            const db = levelDbManager.getDatabase();
            if (!db) {
                return { success: false, error: '数据库不可用' };
            }
            
            const groupId = data.groupId;
            if (!groupId) {
                return { success: false, error: '群组ID不能为空，请先选择群组' };
            }
            
            const config = db.prepare(`
                SELECT points_config FROM group_configs WHERE group_id = ?
            `).get(groupId);
            
            if (!config) {
                return { success: true, data: getDefaultPointsConfig() };
            }
            
            return { success: true, data: JSON.parse(config.points_config) };
        }
        
        if (endpoint === 'rewards' && method === 'POST') {
            const db = levelDbManager.getDatabase();
            if (!db) {
                return { success: false, error: '数据库不可用' };
            }
            
            const { groupId, rewards } = data;
            if (!groupId) {
                return { success: false, error: '群组ID不能为空，请先选择群组' };
            }
            
            try {
                // 检查群组配置是否存在
                const exists = db.prepare(`
                    SELECT 1 FROM group_configs WHERE group_id = ?
                `).get(groupId);
                
                if (exists) {
                    // 更新现有配置
                    db.prepare(`
                        UPDATE group_configs 
                        SET points_config = ?, updated_at = ?
                        WHERE group_id = ?
                    `).run(
                        JSON.stringify(rewards),
                        Date.now() / 1000,
                        groupId
                    );
                } else {
                    // 创建新配置
                    db.prepare(`
                        INSERT INTO group_configs 
                        (group_id, group_name, level_config, points_config, broadcast_config, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        groupId,
                        groupId,
                        JSON.stringify(getDefaultLevelConfig()),
                        JSON.stringify(rewards),
                        JSON.stringify(getDefaultBroadcastConfig()),
                        Date.now() / 1000,
                        Date.now() / 1000
                    );
                }
                
                return { success: true, message: '奖励配置保存成功' };
            } catch (error) {
                return { success: false, error: '奖励配置保存失败: ' + error.message };
            }
        }
        
        // 播报配置API
        if (endpoint === 'broadcast' && method === 'GET') {
            const db = levelDbManager.getDatabase();
            if (!db) {
                return { success: false, error: '数据库不可用' };
            }
            
            const groupId = data.groupId;
            if (!groupId) {
                return { success: false, error: '群组ID不能为空，请先选择群组' };
            }
            
            const config = db.prepare(`
                SELECT broadcast_config FROM group_configs WHERE group_id = ?
            `).get(groupId);
            
            if (!config) {
                return { success: true, data: getDefaultBroadcastConfig() };
            }
            
            return { success: true, data: JSON.parse(config.broadcast_config) };
        }
        
        if (endpoint === 'broadcast' && method === 'POST') {
            const db = levelDbManager.getDatabase();
            if (!db) {
                return { success: false, error: '数据库不可用' };
            }
            
            const { groupId, broadcast } = data;
            if (!groupId) {
                return { success: false, error: '群组ID不能为空，请先选择群组' };
            }
            
            try {
                // 检查群组配置是否存在
                const exists = db.prepare(`
                    SELECT 1 FROM group_configs WHERE group_id = ?
                `).get(groupId);
                
                if (exists) {
                    // 更新现有配置
                    db.prepare(`
                        UPDATE group_configs 
                        SET broadcast_config = ?, updated_at = ?
                        WHERE group_id = ?
                    `).run(
                        JSON.stringify(broadcast),
                        Date.now() / 1000,
                        groupId
                    );
                } else {
                    // 创建新配置
                    db.prepare(`
                        INSERT INTO group_configs 
                        (group_id, group_name, level_config, points_config, broadcast_config, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        groupId,
                        groupId,
                        JSON.stringify(getDefaultLevelConfig()),
                        JSON.stringify(getDefaultPointsConfig()),
                        JSON.stringify(broadcast),
                        Date.now() / 1000,
                        Date.now() / 1000
                    );
                }
                
                return { success: true, message: '播报配置保存成功' };
            } catch (error) {
                return { success: false, error: '播报配置保存失败: ' + error.message };
            }
        }
        

        
        // 数据导出API
        if (endpoint === 'export' && method === 'GET') {
            const exportType = pathParts[4]; // all, users, config
            const db = levelDbManager.getDatabase();
            if (!db) {
                return { success: false, error: '数据库不可用' };
            }
            
            const groupId = data.groupId;
            if (!groupId) {
                return { success: false, error: '群组ID不能为空，请先选择群组' };
            }
            
            try {
                let exportData = {};
                
                switch (exportType) {
                    case 'all':
                        // 导出完整数据
                        exportData = {
                            version: "1.0",
                            timestamp: Date.now(),
                            data_type: "complete",
                            group_id: groupId,
                            users: db.prepare(`
                                SELECT * FROM user_levels WHERE group_id = ?
                            `).all(groupId),
                            group_config: db.prepare(`
                                SELECT * FROM group_configs WHERE group_id = ?
                            `).get(groupId),
                            badges: db.prepare(`
                                SELECT * FROM badge_definitions WHERE group_id = ? OR group_id = 'default'
                            `).all(groupId),
                            user_badges: db.prepare(`
                                SELECT * FROM user_badges WHERE group_id = ?
                            `).all(groupId),
                            points_log: db.prepare(`
                                SELECT * FROM points_log WHERE group_id = ? ORDER BY timestamp DESC LIMIT 1000
                            `).all(groupId)
                        };
                        break;
                        
                    case 'users':
                        // 仅导出用户数据
                        exportData = {
                            version: "1.0",
                            timestamp: Date.now(),
                            data_type: "users_only",
                            group_id: groupId,
                            users: db.prepare(`
                                SELECT * FROM user_levels WHERE group_id = ?
                            `).all(groupId),
                            user_badges: db.prepare(`
                                SELECT * FROM user_badges WHERE group_id = ?
                            `).all(groupId),
                            points_log: db.prepare(`
                                SELECT * FROM points_log WHERE group_id = ? ORDER BY timestamp DESC LIMIT 1000
                            `).all(groupId)
                        };
                        break;
                        
                    case 'config':
                        // 仅导出配置数据
                        exportData = {
                            version: "1.0",
                            timestamp: Date.now(),
                            data_type: "config_only",
                            group_id: groupId,
                            group_config: db.prepare(`
                                SELECT * FROM group_configs WHERE group_id = ?
                            `).get(groupId),
                            badges: db.prepare(`
                                SELECT * FROM badge_definitions WHERE group_id = ? OR group_id = 'default'
                            `).all(groupId)
                        };
                        break;
                        
                    default:
                        return { success: false, error: '不支持的导出类型' };
                }
                
                console.log(`🏆 [API] 导出数据: ${exportType}, 群组: ${groupId}`);
                return { success: true, data: exportData };
                
            } catch (error) {
                console.error('导出数据失败:', error);
                return { success: false, error: '导出数据失败: ' + error.message };
            }
        }
        
        // 数据导入API
        if (endpoint === 'import' && method === 'POST') {
            const db = levelDbManager.getDatabase();
            if (!db) {
                return { success: false, error: '数据库不可用' };
            }
            
            try {
                const importData = data.importData || data;
                
                if (!importData.version || !importData.data_type) {
                    return { success: false, error: '导入数据格式不正确' };
                }
                
                console.log(`🏆 [API] 导入数据: ${importData.data_type}, 群组: ${importData.group_id}`);
                
                // 开始事务
                db.prepare('BEGIN TRANSACTION').run();
                
                try {
                    let importedCount = 0;
                    
                    // 导入群组配置
                    if (importData.group_config) {
                        const config = importData.group_config;
                        db.prepare(`
                            INSERT OR REPLACE INTO group_configs 
                            (group_id, group_name, level_config, points_config, broadcast_config, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            config.group_id,
                            config.group_name,
                            config.level_config,
                            config.points_config,
                            config.broadcast_config,
                            config.created_at,
                            config.updated_at
                        );
                        importedCount++;
                    }
                    
                    // 导入用户数据
                    if (importData.users && Array.isArray(importData.users)) {
                        const userStmt = db.prepare(`
                            INSERT OR REPLACE INTO user_levels 
                            (user_id, group_id, level, total_exp, available_points, total_points_earned, 
                             total_points_spent, attack_count, user_eval_count, merchant_eval_count, 
                             text_eval_count, badges, display_name, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        
                        for (const user of importData.users) {
                            userStmt.run(
                                user.user_id, user.group_id, user.level, user.total_exp,
                                user.available_points, user.total_points_earned, user.total_points_spent,
                                user.attack_count, user.user_eval_count, user.merchant_eval_count,
                                user.text_eval_count, user.badges, user.display_name,
                                user.created_at, user.updated_at
                            );
                            importedCount++;
                        }
                    }
                    
                    // 导入勋章定义
                    if (importData.badges && Array.isArray(importData.badges)) {
                        const badgeStmt = db.prepare(`
                            INSERT OR REPLACE INTO badge_definitions 
                            (badge_id, group_id, badge_name, badge_emoji, badge_desc, 
                             unlock_conditions, badge_type, rarity, status, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        
                        for (const badge of importData.badges) {
                            badgeStmt.run(
                                badge.badge_id, badge.group_id, badge.badge_name,
                                badge.badge_emoji, badge.badge_desc, badge.unlock_conditions,
                                badge.badge_type, badge.rarity, badge.status, badge.created_at
                            );
                            importedCount++;
                        }
                    }
                    
                    // 导入用户勋章记录
                    if (importData.user_badges && Array.isArray(importData.user_badges)) {
                        const userBadgeStmt = db.prepare(`
                            INSERT OR REPLACE INTO user_badges 
                            (user_id, group_id, badge_id, awarded_by, awarded_reason, awarded_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `);
                        
                        for (const userBadge of importData.user_badges) {
                            userBadgeStmt.run(
                                userBadge.user_id, userBadge.group_id, userBadge.badge_id,
                                userBadge.awarded_by, userBadge.awarded_reason, userBadge.awarded_at
                            );
                            importedCount++;
                        }
                    }
                    
                    // 导入积分历史（可选）
                    if (importData.points_log && Array.isArray(importData.points_log)) {
                        const logStmt = db.prepare(`
                            INSERT OR REPLACE INTO points_log 
                            (user_id, group_id, action_type, exp_change, points_change, 
                             exp_after, points_after, description, related_eval_id, admin_id, timestamp)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        
                        for (const log of importData.points_log) {
                            logStmt.run(
                                log.user_id, log.group_id, log.action_type,
                                log.exp_change, log.points_change, log.exp_after, log.points_after,
                                log.description, log.related_eval_id, log.admin_id, log.timestamp
                            );
                            importedCount++;
                        }
                    }
                    
                    // 提交事务
                    db.prepare('COMMIT').run();
                    
                    return { 
                        success: true, 
                        message: `数据导入成功，共导入 ${importedCount} 条记录`,
                        importedCount: importedCount
                    };
                    
                } catch (error) {
                    // 回滚事务
                    db.prepare('ROLLBACK').run();
                    throw error;
                }
                
            } catch (error) {
                console.error('导入数据失败:', error);
                return { success: false, error: '导入数据失败: ' + error.message };
            }
        }
        
        // 群组迁移API
        if (endpoint === 'migrate' && method === 'POST') {
            const db = levelDbManager.getDatabase();
            if (!db) {
                return { success: false, error: '数据库不可用' };
            }
            
            const { sourceGroupId, targetGroupId, targetGroupName } = data;
            
            if (!sourceGroupId || !targetGroupId) {
                return { success: false, error: '源群组ID和目标群组ID不能为空' };
            }
            
            try {
                console.log(`🏆 [API] 群组迁移: ${sourceGroupId} -> ${targetGroupId}`);
                
                // 开始事务
                db.prepare('BEGIN TRANSACTION').run();
                
                try {
                    let migratedCount = 0;
                    
                    // 1. 复制群组配置
                    const sourceConfig = db.prepare(`
                        SELECT * FROM group_configs WHERE group_id = ?
                    `).get(sourceGroupId);
                    
                    if (sourceConfig) {
                        db.prepare(`
                            INSERT OR REPLACE INTO group_configs 
                            (group_id, group_name, level_config, points_config, broadcast_config, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            targetGroupId,
                            targetGroupName || targetGroupId,
                            sourceConfig.level_config,
                            sourceConfig.points_config,
                            sourceConfig.broadcast_config,
                            Date.now() / 1000,
                            Date.now() / 1000
                        );
                        migratedCount++;
                    }
                    
                    // 2. 复制用户数据
                    const sourceUsers = db.prepare(`
                        SELECT * FROM user_levels WHERE group_id = ?
                    `).all(sourceGroupId);
                    
                    const userStmt = db.prepare(`
                        INSERT OR REPLACE INTO user_levels 
                        (user_id, group_id, level, total_exp, available_points, total_points_earned, 
                         total_points_spent, attack_count, user_eval_count, merchant_eval_count, 
                         text_eval_count, badges, display_name, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    
                    for (const user of sourceUsers) {
                        userStmt.run(
                            user.user_id, targetGroupId, user.level, user.total_exp,
                            user.available_points, user.total_points_earned, user.total_points_spent,
                            user.attack_count, user.user_eval_count, user.merchant_eval_count,
                            user.text_eval_count, user.badges, user.display_name,
                            user.created_at, Date.now() / 1000
                        );
                        migratedCount++;
                    }
                    
                    // 3. 复制勋章定义（仅群组特定的勋章）
                    const sourceBadges = db.prepare(`
                        SELECT * FROM badge_definitions WHERE group_id = ?
                    `).all(sourceGroupId);
                    
                    const badgeStmt = db.prepare(`
                        INSERT OR REPLACE INTO badge_definitions 
                        (badge_id, group_id, badge_name, badge_emoji, badge_desc, 
                         unlock_conditions, badge_type, rarity, status, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    
                    for (const badge of sourceBadges) {
                        badgeStmt.run(
                            badge.badge_id, targetGroupId, badge.badge_name,
                            badge.badge_emoji, badge.badge_desc, badge.unlock_conditions,
                            badge.badge_type, badge.rarity, badge.status, Date.now() / 1000
                        );
                        migratedCount++;
                    }
                    
                    // 4. 复制用户勋章记录
                    const sourceUserBadges = db.prepare(`
                        SELECT * FROM user_badges WHERE group_id = ?
                    `).all(sourceGroupId);
                    
                    const userBadgeStmt = db.prepare(`
                        INSERT OR REPLACE INTO user_badges 
                        (user_id, group_id, badge_id, awarded_by, awarded_reason, awarded_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `);
                    
                    for (const userBadge of sourceUserBadges) {
                        userBadgeStmt.run(
                            userBadge.user_id, targetGroupId, userBadge.badge_id,
                            userBadge.awarded_by, userBadge.awarded_reason, userBadge.awarded_at
                        );
                        migratedCount++;
                    }
                    
                    // 提交事务
                    db.prepare('COMMIT').run();
                    
                    return { 
                        success: true, 
                        message: `群组迁移成功，共迁移 ${migratedCount} 条记录`,
                        migratedCount: migratedCount,
                        sourceGroupId: sourceGroupId,
                        targetGroupId: targetGroupId
                    };
                    
                } catch (error) {
                    // 回滚事务
                    db.prepare('ROLLBACK').run();
                    throw error;
                }
                
            } catch (error) {
                console.error('群组迁移失败:', error);
                return { success: false, error: '群组迁移失败: ' + error.message };
            }
        }
        
        // 数据库统计信息API
        if (endpoint === 'database') {
            const subEndpoint = pathParts[4]; // stats, cleanup, optimize, backup, restore
            
            if (subEndpoint === 'stats' && method === 'GET') {
                const fs = require('fs');
                const path = require('path');
                
                const dbPath = path.join(__dirname, '../level_system.db');
                let dbSize = '未知';
                let lastUpdate = '未知';
                
                if (fs.existsSync(dbPath)) {
                    const stats = fs.statSync(dbPath);
                    dbSize = (stats.size / 1024 / 1024).toFixed(2) + ' MB';
                    lastUpdate = stats.mtime.toLocaleString('zh-CN');
                }
                
                return {
                    success: true,
                    data: {
                        dbSize,
                        lastUpdate,
                        dbPath: dbPath
                    }
                };
            }
            
            if (subEndpoint === 'cleanup' && method === 'POST') {
                const db = levelDbManager.getDatabase();
                if (!db) {
                    return { success: false, error: '数据库不可用' };
                }
                
                try {
                    let cleanupCount = 0;
                    
                    // 清理无效的用户记录（没有有效数据的用户）
                    const invalidUsers = db.prepare(`
                        DELETE FROM user_levels 
                        WHERE total_exp = 0 AND available_points = 0 AND user_eval_count = 0
                    `).run();
                    cleanupCount += invalidUsers.changes;
                    
                    // 清理过期的日志记录（保留最近3个月）
                    const threeMonthsAgo = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);
                    const oldLogs = db.prepare(`
                        DELETE FROM points_log WHERE timestamp < ?
                    `).run(threeMonthsAgo);
                    cleanupCount += oldLogs.changes;
                    
                    // 清理孤立的勋章记录（用户已不存在）
                    const orphanBadges = db.prepare(`
                        DELETE FROM user_badges 
                        WHERE user_id NOT IN (SELECT user_id FROM user_levels WHERE group_id = user_badges.group_id)
                    `).run();
                    cleanupCount += orphanBadges.changes;
                    
                    return {
                        success: true,
                        message: `数据清理完成，共清理 ${cleanupCount} 条无效记录`,
                        details: {
                            invalidUsers: invalidUsers.changes,
                            oldLogs: oldLogs.changes,
                            orphanBadges: orphanBadges.changes
                        }
                    };
                } catch (error) {
                    return { success: false, error: '数据清理失败: ' + error.message };
                }
            }
            
            if (subEndpoint === 'optimize' && method === 'POST') {
                const db = levelDbManager.getDatabase();
                if (!db) {
                    return { success: false, error: '数据库不可用' };
                }
                
                try {
                    // 执行数据库优化操作
                    db.prepare('VACUUM').run();
                    db.prepare('ANALYZE').run();
                    db.prepare('REINDEX').run();
                    
                    return {
                        success: true,
                        message: '数据库优化完成，已重建索引并清理碎片',
                        details: {
                            vacuum: true,
                            analyze: true,
                            reindex: true
                        }
                    };
                } catch (error) {
                    return { success: false, error: '数据库优化失败: ' + error.message };
                }
            }
            
            if (subEndpoint === 'backup' && method === 'POST') {
                const fs = require('fs');
                const path = require('path');
                
                try {
                    const dbPath = path.join(__dirname, '../level_system.db');
                    const backupDir = path.join(__dirname, '../backups');
                    
                    // 确保备份目录存在
                    if (!fs.existsSync(backupDir)) {
                        fs.mkdirSync(backupDir, { recursive: true });
                    }
                    
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const backupFilename = `level_system_backup_${timestamp}.db`;
                    const backupPath = path.join(backupDir, backupFilename);
                    
                    // 复制数据库文件
                    fs.copyFileSync(dbPath, backupPath);
                    
                    return {
                        success: true,
                        message: '备份创建成功',
                        backupPath: backupPath,
                        filename: backupFilename
                    };
                } catch (error) {
                    return { success: false, error: '创建备份失败: ' + error.message };
                }
            }
            
            if (subEndpoint === 'restore' && method === 'POST') {
                // 数据库恢复需要文件上传处理，这里先返回不支持的消息
                return { success: false, error: '数据库恢复功能需要通过文件上传实现' };
            }
        }
        
        // 详细统计信息API
        if (endpoint === 'stats') {
            const statsType = pathParts[4]; // users, badges, config
            const db = levelDbManager.getDatabase();
            if (!db) {
                return { success: false, error: '数据库不可用' };
            }
            
            if (statsType === 'users' && method === 'GET') {
                try {
                    const userStats = db.prepare(`
                        SELECT 
                            COUNT(*) as total,
                            COUNT(CASE WHEN total_exp > 0 THEN 1 END) as active,
                            MAX(level) as maxLevel,
                            SUM(total_exp) as totalExp
                        FROM user_levels
                    `).get();
                    
                    return {
                        success: true,
                        data: userStats || { total: 0, active: 0, maxLevel: 0, totalExp: 0 }
                    };
                } catch (error) {
                    return { success: false, error: '获取用户统计失败: ' + error.message };
                }
            }
            
            if (statsType === 'badges' && method === 'GET') {
                try {
                    const badgeStats = db.prepare(`
                        SELECT 
                            COUNT(DISTINCT badge_id) as types,
                            COUNT(*) as awarded,
                            CAST(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM user_levels WHERE total_exp > 0) AS INTEGER) as awardRate
                        FROM user_badges
                    `).get();
                    
                    return {
                        success: true,
                        data: badgeStats || { types: 0, awarded: 0, awardRate: 0 }
                    };
                } catch (error) {
                    return { success: false, error: '获取勋章统计失败: ' + error.message };
                }
            }
            
            if (statsType === 'config' && method === 'GET') {
                try {
                    const configStats = db.prepare(`
                        SELECT COUNT(*) as groups FROM group_configs
                    `).get();
                    
                    const levelStats = db.prepare(`
                        SELECT COUNT(*) as levels FROM (
                            SELECT DISTINCT level FROM user_levels WHERE level > 0
                        )
                    `).get();
                    
                    return {
                        success: true,
                        data: {
                            groups: configStats.groups || 0,
                            levels: levelStats.levels || 0,
                            broadcasts: 1 // 假设每个群组有一个播报配置
                        }
                    };
                } catch (error) {
                    return { success: false, error: '获取配置统计失败: ' + error.message };
                }
            }
        }
        
        // 404 - 未找到的API端点
        return { success: false, error: 'API端点不存在', status: 404 };
        
    } catch (error) {
        console.error('❌ 等级系统API错误:', error);
        return { success: false, error: error.message };
    }
}



module.exports = {
    createHttpServer,
    handleHttpRequest,
    processApiRequest,
    sendMessageToGroup,
    sendMessageToUser,
    checkDatabaseConnection,
    checkBotStatus
}; 