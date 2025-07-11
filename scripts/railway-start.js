#!/usr/bin/env node

// Railway部署专用启动脚本
// 优先快速启动应用，确保健康检查通过
// 数据同步改为后台执行，不阻塞主应用启动

console.log('🚀 Railway部署启动脚本');
console.log('📅 启动时间:', new Date().toISOString());

// 检查关键环境变量
const requiredEnvs = ['BOT_TOKEN', 'BOT_USERNAME'];
const missingEnvs = requiredEnvs.filter(env => !process.env[env]);

if (missingEnvs.length > 0) {
    console.log('⚠️ 缺少环境变量:', missingEnvs.join(', '));
    console.log('💡 将使用默认配置启动，请在Railway Variables中设置正确的环境变量');
}

// 设置NODE_ENV
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// 确保数据目录存在
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const dataDir = '/app/data'; // 直接使用Volume挂载路径

// 检查数据目录
try {
    if (fs.existsSync(dataDir)) {
        console.log('📁 数据目录存在:', dataDir);
        
        // 检查权限
        try {
            fs.accessSync(dataDir, fs.constants.W_OK);
            console.log('✅ 数据目录权限正常');
        } catch (permError) {
            console.log('⚠️ 数据目录权限问题，但继续启动');
        }
    } else {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('📁 创建数据目录:', dataDir);
    }
} catch (error) {
    console.log('⚠️ 数据目录处理失败，但继续启动:', error.message);
}

// 启动应用的主函数
async function startApp() {
    // 在启动前运行修复脚本
    console.log('🔧 运行启动前修复...');
    try {
        const { railwayStartupFix } = require('./railway-startup-fix');
        await railwayStartupFix();
    } catch (error) {
        console.log('⚠️ 启动修复失败，但继续启动:', error.message);
    }

    // 立即启动主应用（确保健康检查通过）
    console.log('🎯 立即启动主应用...');

    // 启动主应用
    const app = spawn('node', ['app.js'], {
        stdio: 'inherit',
        env: process.env
    });

    return app;
}

// 执行启动
startApp().then(app => {
    app.on('close', (code) => {
        console.log(`应用进程退出，代码: ${code}`);
        process.exit(code);
    });

    app.on('error', (error) => {
        console.error('应用启动失败:', error);
        process.exit(1);
    });

    // 处理进程信号
    process.on('SIGTERM', () => {
        console.log('收到SIGTERM信号，正在关闭...');
        app.kill('SIGTERM');
    });

    process.on('SIGINT', () => {
        console.log('收到SIGINT信号，正在关闭...');
        app.kill('SIGINT');
    });
}).catch(error => {
    console.error('启动应用失败:', error);
    process.exit(1);
});

// 后台执行数据同步（不阻塞主应用启动）
setTimeout(() => {
    console.log('🔄 开始后台数据同步...');
    
    // 等级系统初始化（如果启用）
    if (process.env.LEVEL_SYSTEM_ENABLED === 'true') {
        console.log('🏆 后台初始化等级系统...');
        
        // 异步执行数据同步，不影响主应用
        const syncProcess = spawn('node', ['level/scripts/sync-from-main-database.js'], {
            stdio: 'pipe', // 不继承stdio，避免干扰主应用
            env: { ...process.env, LEVEL_SYSTEM_ENABLED: 'true' },
            detached: false
        });
        
        syncProcess.stdout.on('data', (data) => {
            console.log(`[同步] ${data.toString().trim()}`);
        });
        
        syncProcess.stderr.on('data', (data) => {
            console.error(`[同步错误] ${data.toString().trim()}`);
        });
        
        syncProcess.on('close', (code) => {
            if (code === 0) {
                console.log('✅ 后台数据同步完成');
            } else {
                console.log(`⚠️ 后台数据同步失败，退出代码: ${code}`);
            }
        });
        
        syncProcess.on('error', (error) => {
            console.error('⚠️ 后台数据同步进程错误:', error.message);
        });
    }
}, 5000); // 5秒后开始同步，确保主应用已经启动 