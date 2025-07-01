#!/usr/bin/env node

// Railway部署专用启动脚本
// 简化启动流程，确保快速响应健康检查
// 完全不触碰数据库，让主应用自己处理所有初始化

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

// 确保数据目录存在并修复权限
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const dataDir = '/app/data'; // 直接使用Volume挂载路径

// 检查并修复权限
try {
    if (fs.existsSync(dataDir)) {
        console.log('📁 数据目录存在:', dataDir);
        
        // 检查权限
        try {
            fs.accessSync(dataDir, fs.constants.W_OK);
            console.log('✅ 数据目录权限正常');
        } catch (permError) {
            console.log('🔧 修复数据目录权限...');
            
            // 尝试修复权限
            try {
                exec('chmod 755 /app/data', (error, stdout, stderr) => {
                    if (!error) {
                        console.log('✅ 权限修复成功');
                    } else {
                        console.log('⚠️ 权限修复失败，但继续启动');
                    }
                });
                
                // 给一点时间让权限修复生效
                setTimeout(() => {
                    console.log('⏳ 等待权限修复生效...');
                }, 500);
            } catch (fixError) {
                console.log('⚠️ 权限修复失败，但继续启动');
            }
        }
    } else {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('📁 创建数据目录:', dataDir);
    }
} catch (error) {
    console.log('⚠️ 数据目录处理失败，但继续启动:', error.message);
}

// 启动主应用
console.log('🎯 启动主应用...');

async function startApp() {
    // 等待权限修复完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 跳过数据库修复，让应用自动处理数据库初始化
    console.log('🔧 跳过数据库修复，让应用自动初始化...');
    
    // 直接启动主应用，不做任何数据库操作
    // 让app.js自己处理数据库初始化和数据迁移
    console.log('🔄 开始启动完整应用服务...');
    
    require('../app.js');
}

startApp(); 