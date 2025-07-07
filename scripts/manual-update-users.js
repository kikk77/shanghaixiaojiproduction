#!/usr/bin/env node

// 手动更新用户数据脚本
console.log('🔧 手动更新用户数据脚本');
console.log('⚠️ 注意：此脚本会清理测试数据并更新用户信息');

// 设置环境变量
process.env.LEVEL_SYSTEM_ENABLED = 'true';

// 延迟一秒后运行更新脚本
setTimeout(() => {
    console.log('🚀 开始执行更新...');
    require('./update-production-user-data');
}, 1000); 