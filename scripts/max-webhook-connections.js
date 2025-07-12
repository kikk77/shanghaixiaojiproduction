#!/usr/bin/env node

/**
 * 设置Webhook最大连接数为100
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

async function setMaxConnections() {
    console.log('🔧 设置Webhook最大连接数为100...');
    
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
        
        // 检查当前webhook状态
        console.log('🔍 检查当前webhook状态...');
        const currentWebhook = await tempBot.getWebHookInfo();
        console.log('📋 当前状态:', {
            url: currentWebhook.url || '未设置',
            max_connections: currentWebhook.max_connections || '未设置',
            pending_updates: currentWebhook.pending_update_count
        });
        
        // 设置最大连接数为100
        const webhookUrl = `${WEBHOOK_URL}/webhook`;
        console.log(`🚀 设置最大连接数为100: ${webhookUrl}`);
        
        await tempBot.setWebHook(webhookUrl, {
            max_connections: 100, // 设置为最大值
            allowed_updates: [
                'message',
                'callback_query', 
                'channel_post',
                'edited_channel_post'
            ]
        });
        
        console.log('✅ 最大连接数设置成功！');
        
        // 验证设置
        const newWebhook = await tempBot.getWebHookInfo();
        console.log('📋 新的Webhook信息:', {
            url: newWebhook.url,
            max_connections: newWebhook.max_connections,
            pending_update_count: newWebhook.pending_update_count,
            has_custom_certificate: newWebhook.has_custom_certificate
        });
        
        console.log('🎉 设置完成！');
        console.log(`📊 最大连接数已调整为: ${newWebhook.max_connections}`);
        
    } catch (error) {
        console.error('❌ 设置过程中发生错误:', error.message);
        process.exit(1);
    }
}

// 运行设置
setMaxConnections().catch(console.error); 