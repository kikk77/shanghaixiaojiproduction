// 加载环境变量
require('dotenv').config();

// 导入依赖
const { startApp } = require('./config/environment');

// 创建HTTP服务器 - 包含健康检查
const http = require('http');
const PORT = process.env.PORT || 3000;

console.log(`🚀 启动环境: ${process.env.NODE_ENV || 'development'}`);
console.log(`📡 服务端口: ${PORT}`);

// 创建一个简单的HTTP服务器处理健康检查
const server = http.createServer((req, res) => {
    const url = req.url;
    console.log(`📥 HTTP请求: ${req.method} ${url} - ${new Date().toISOString()}`);
    
    // CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (url === '/health' || url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            port: PORT,
            service: 'telegram-marketing-bot'
        }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found', availableEndpoints: ['/health'] }));
    }
});

// 立即启动HTTP服务器
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ HTTP服务器已启动在端口 ${PORT}`);
    console.log(`🩺 健康检查可用: http://localhost:${PORT}/health`);
    
    // 延迟启动完整应用，确保健康检查优先响应
    setTimeout(() => {
        console.log(`🔄 开始启动完整应用服务...`);
        startFullApplication();
    }, 2000);
});

// 启动完整应用服务
async function startFullApplication() {
    try {
        console.log(`🔄 开始启动完整应用服务...`);
        
        // 运行EAV完整修复脚本
        const currentEnv = process.env.NODE_ENV || process.env.RAILWAY_ENVIRONMENT_NAME || 'development';
        if (currentEnv === 'production') {
            console.log(`🔧 运行EAV完整修复脚本...`);
            try {
                require('./scripts/complete-eav-fix');
            } catch (error) {
                console.error('❌ EAV完整修复脚本运行失败:', error.message);
            }
        }
        
        // 运行播报功能迁移
        console.log(`🔧 检查播报功能迁移...`);
        try {
            const { migrateBroadcastAttributes } = require('./scripts/migrate-broadcast-attributes');
            await migrateBroadcastAttributes();
            console.log('✅ 播报功能迁移检查完成');
        } catch (error) {
            console.warn('⚠️ 播报功能迁移检查失败:', error.message);
        }
        
        // 自动修复和初始化等级系统
        if (process.env.LEVEL_SYSTEM_ENABLED === 'true') {
            console.log(`🏆 启动等级系统...`);
            try {
                // 1. 先执行自动修复检查
                const AutoFixOnStartup = require('./level/scripts/auto-fix-on-startup');
                await AutoFixOnStartup.fix();
                
                // 2. 然后初始化等级系统
                const LevelSystemInitializer = require('./level/scripts/init-level-system');
                const initializer = new LevelSystemInitializer();
                await initializer.initialize();
                
                // 3. 更新用户数据（生产环境）
                const nodeEnv = process.env.NODE_ENV || process.env.RAILWAY_ENVIRONMENT_NAME || 'development';
                if (nodeEnv === 'production' || nodeEnv === 'staging') {
                    console.log(`🔄 更新生产环境用户数据...`);
                    try {
                        require('./scripts/update-production-user-data');
                        await new Promise(resolve => setTimeout(resolve, 3000)); // 等待更新完成
                        console.log('✅ 用户数据更新完成');
                    } catch (error) {
                        console.warn('⚠️ 用户数据更新失败:', error.message);
                    }
                }
                
                console.log('✅ 等级系统启动完成');
            } catch (error) {
                console.error('❌ 等级系统启动失败:', error.message);
                // 等级系统启动失败不影响主系统运行
            }
        } else {
            console.log('🏆 等级系统未启用');
        }
        
        // 不关闭HTTP服务器，而是扩展其功能
        // 将HTTP服务器的处理函数替换为完整的API处理器
        const { handleHttpRequest } = require('./services/httpService');
        
        // 重新设置请求处理器
        server.removeAllListeners('request');
        server.on('request', handleHttpRequest);
        
        // 启动完整的应用（Bot服务、调度器等，但不包括HTTP服务器）
        await startApp();
        
    } catch (error) {
        console.error(`❌ 完整应用启动失败:`, error);
        // 即使完整应用启动失败，保持健康检查服务运行
        if (server.listening) {
            console.log(`🩺 保持健康检查服务运行...`);
        } else {
            // 重新启动简单的健康检查服务器
            const backupServer = http.createServer((req, res) => {
                if (req.url === '/health' || req.url === '/') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        status: 'partial', 
                        error: 'Full application failed to start',
                        timestamp: new Date().toISOString(),
                        service: 'telegram-marketing-bot'
                    }));
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            });
            
            backupServer.listen(PORT, '0.0.0.0', () => {
                console.log(`🆘 备用健康检查服务器已启动在端口 ${PORT}`);
            });
        }
    }
}

// 优雅关闭处理
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    process.exit(0);
});