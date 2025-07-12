#!/usr/bin/env node

/**
 * 重置Webhook - 先删除再设置
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

async function resetWebhook() {
    console.log('🔄 重置Webhook...');
    
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const WEBHOOK_URL = process.env.WEBHOOK_URL;
    
    if (!BOT_TOKEN) {
        console.error('❌ 找不到BOT_TOKEN环境变量');
        process.exit(1);
    }
    
    if (!WEBHOOK_URL) {
        console.error('❌ 找不到WEBHOOK_URL环境变量');
        process.exit(1);
    }
    
    try {
        // 创建临时Bot实例（不启用polling）
        const tempBot = new TelegramBot(BOT_TOKEN, { polling: false });
        
        console.log('🤖 检查Bot信息...');
        const botInfo = await tempBot.getMe();
        console.log(`✅ Bot: @${botInfo.username} (${botInfo.id})`);
        
        // 第一步：删除现有webhook
        console.log('🗑️ 删除现有webhook...');
        await tempBot.deleteWebHook();
        console.log('✅ 现有webhook已删除');
        
        // 等待几秒钟
        console.log('⏳ 等待3秒钟...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 第二步：设置新的webhook
        const webhookUrl = `${WEBHOOK_URL}/webhook`;
        console.log(`🔗 设置新的Webhook URL: ${webhookUrl}`);
        
        await tempBot.setWebHook(webhookUrl, {
            max_connections: 40,
            allowed_updates: [
                'message',
                'callback_query', 
                'channel_post',
                'edited_channel_post'
            ]
        });
        
        console.log('✅ 新的Webhook设置成功！');
        
        // 验证设置
        const newWebhook = await tempBot.getWebHookInfo();
        console.log('📋 新的Webhook信息:', {
            url: newWebhook.url,
            has_custom_certificate: newWebhook.has_custom_certificate,
            pending_update_count: newWebhook.pending_update_count,
            max_connections: newWebhook.max_connections,
            allowed_updates: newWebhook.allowed_updates
        });
        
        console.log('🎉 Webhook重置完成！');
        
    } catch (error) {
        console.error('❌ 重置过程中发生错误:', error.message);
        process.exit(1);
    }
}

// 运行重置
resetWebhook().catch(console.error); 