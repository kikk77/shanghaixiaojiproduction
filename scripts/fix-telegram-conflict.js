#!/usr/bin/env node

/**
 * 修复Telegram Bot的polling和webhook冲突
 * 
 * 问题原因：
 * 1. botService.js 启用了 polling: true
 * 2. httpService.js 同时处理 webhook 请求
 * 3. Telegram 不允许同一个Bot同时使用两种模式
 * 
 * 解决方案：
 * 1. 在云端部署时禁用polling，只使用webhook
 * 2. 在本地开发时禁用webhook，只使用polling
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

async function fixTelegramConflict() {
    console.log('🔧 开始修复Telegram Bot冲突...');
    
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
        console.error('❌ 找不到BOT_TOKEN环境变量');
        process.exit(1);
    }
    
    const isProduction = process.env.NODE_ENV === 'production';
    const WEBHOOK_URL = process.env.WEBHOOK_URL;
    
    console.log(`🌍 环境: ${isProduction ? '生产环境' : '开发环境'}`);
    console.log(`🔗 Webhook URL: ${WEBHOOK_URL || '未设置'}`);
    
    try {
        // 创建临时Bot实例（不启用polling）
        const tempBot = new TelegramBot(BOT_TOKEN, { polling: false });
        
        // 1. 首先删除现有的webhook（如果有）
        console.log('🔄 清理现有的webhook...');
        try {
            await tempBot.deleteWebHook();
            console.log('✅ Webhook已清理');
        } catch (error) {
            console.log('⚠️ Webhook清理失败（可能不存在）:', error.message);
        }
        
        // 2. 根据环境设置合适的模式
        if (isProduction && WEBHOOK_URL) {
            // 生产环境：设置webhook
            console.log('🔄 设置webhook模式...');
            await tempBot.setWebHook(`${WEBHOOK_URL}/webhook`);
            console.log('✅ Webhook模式已设置');
            
            // 验证webhook设置
            const webhookInfo = await tempBot.getWebHookInfo();
            console.log('📋 Webhook信息:', {
                url: webhookInfo.url,
                has_custom_certificate: webhookInfo.has_custom_certificate,
                pending_update_count: webhookInfo.pending_update_count
            });
            
        } else {
            // 开发环境：确保webhook已删除（为polling做准备）
            console.log('🔄 确保webhook已删除（polling模式）...');
            await tempBot.deleteWebHook();
            console.log('✅ Polling模式已准备就绪');
        }
        
        // 3. 获取Bot信息
        console.log('🔄 获取Bot信息...');
        const botInfo = await tempBot.getMe();
        console.log('🤖 Bot信息:', {
            id: botInfo.id,
            username: botInfo.username,
            first_name: botInfo.first_name
        });
        
        // 4. 检查更新队列
        console.log('🔄 检查更新队列...');
        const webhookInfo = await tempBot.getWebHookInfo();
        if (webhookInfo.pending_update_count > 0) {
            console.log(`⚠️ 有 ${webhookInfo.pending_update_count} 个待处理的更新`);
        } else {
            console.log('✅ 没有待处理的更新');
        }
        
        console.log('✅ Telegram Bot冲突修复完成');
        console.log('');
        console.log('📝 修复结果:');
        console.log(`   - 环境: ${isProduction ? '生产环境' : '开发环境'}`);
        console.log(`   - 模式: ${isProduction && WEBHOOK_URL ? 'Webhook' : 'Polling'}`);
        console.log(`   - Bot ID: ${botInfo.id}`);
        console.log(`   - Bot用户名: @${botInfo.username}`);
        console.log('');
        console.log('🔧 接下来的步骤:');
        if (isProduction && WEBHOOK_URL) {
            console.log('   1. 确保应用重启后不会启用polling');
            console.log('   2. 检查webhook端点是否正常工作');
        } else {
            console.log('   1. 重启应用以启用polling模式');
            console.log('   2. 确保不会处理webhook请求');
        }
        
    } catch (error) {
        console.error('❌ 修复过程中发生错误:', error);
        process.exit(1);
    }
}

// 运行修复
fixTelegramConflict().catch(console.error); 