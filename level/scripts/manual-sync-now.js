#!/usr/bin/env node

/**
 * 手动同步生产数据到等级系统
 * 可以随时运行此脚本来更新等级系统数据
 */

console.log('🔄 开始手动同步数据...');

// 设置环境变量
process.env.LEVEL_SYSTEM_ENABLED = 'true';

// 运行同步脚本
require('./sync-production-data');

console.log('\n📌 同步完成后，请刷新管理员面板查看最新数据');
console.log('💡 提示：在管理员面板中，确保取消勾选"显示所有用户"，只查看有活动的用户'); 