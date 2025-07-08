#!/usr/bin/env node

/**
 * Railway环境启动脚本
 * 确保生产环境正确初始化
 */

const { spawn } = require('child_process');
const path = require('path');

async function railwayStart() {
    console.log('🚀 Railway环境启动中...');
    
    try {
        // 1. 环境检查
        console.log('🔍 检查环境变量...');
        const requiredEnvs = ['RAILWAY_ENVIRONMENT_NAME'];
        const missingEnvs = requiredEnvs.filter(env => !process.env[env]);
        
        if (missingEnvs.length > 0) {
            console.warn(`⚠️ 缺少环境变量: ${missingEnvs.join(', ')}`);
        }
        
        // 2. 数据库初始化
        console.log('🗄️ 初始化数据库...');
        await runScript('scripts/init-database.js');
        
        // 3. 等级系统初始化（如果启用）
        if (process.env.LEVEL_SYSTEM_ENABLED === 'true') {
            console.log('🏆 初始化等级系统...');
            
            // 初始化等级系统表结构
            await runScript('level/scripts/init-milestone-tables.js');
            
            // 从主数据库同步用户数据
            console.log('🔄 同步用户数据到等级系统...');
            await runScript('level/scripts/sync-from-main-database.js');
        }
        
        // 4. 启动主应用
        console.log('🎯 启动主应用...');
        const app = spawn('node', ['app.js'], {
            stdio: 'inherit',
            env: process.env
        });
        
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
        
    } catch (error) {
        console.error('❌ Railway启动失败:', error);
        process.exit(1);
    }
}

// 运行脚本的辅助函数
function runScript(scriptPath) {
    return new Promise((resolve, reject) => {
        const script = spawn('node', [scriptPath], {
            stdio: 'inherit',
            env: process.env
        });
        
        script.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`脚本 ${scriptPath} 执行失败，退出代码: ${code}`));
            }
        });
        
        script.on('error', (error) => {
            reject(new Error(`脚本 ${scriptPath} 执行错误: ${error.message}`));
        });
    });
}

// 运行启动流程
if (require.main === module) {
    railwayStart();
}

module.exports = { railwayStart }; 