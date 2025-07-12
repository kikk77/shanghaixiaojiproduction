#!/usr/bin/env node

/**
 * 切换到Webhook模式脚本
 * 最小化修改，不动核心代码
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

async function switchToWebhook() {
    console.log('🔄 开始切换到Webhook模式...');
    
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const WEBHOOK_URL = process.env.WEBHOOK_URL || `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-app.railway.app'}`;
    
    if (!BOT_TOKEN) {
        console.error('❌ 找不到BOT_TOKEN环境变量');
        process.exit(1);
    }
    
    try {
        // 创建临时Bot实例（不启用polling）
        const tempBot = new TelegramBot(BOT_TOKEN, { polling: false });
        
        console.log('🤖 检查Bot信息...');
        const botInfo = await tempBot.getMe();
        console.log(`✅ Bot: @${botInfo.username} (${botInfo.id})`);
        
        console.log('🔍 检查当前webhook状态...');
        const currentWebhook = await tempBot.getWebHookInfo();
        console.log('📋 当前状态:', {
            url: currentWebhook.url || '未设置',
            pending_updates: currentWebhook.pending_update_count
        });
        
        // 设置新的webhook - 修复双斜杠问题
        const baseUrl = WEBHOOK_URL.endsWith('/') ? WEBHOOK_URL.slice(0, -1) : WEBHOOK_URL;
        const webhookUrl = `${baseUrl}/webhook`;
        console.log(`🔗 设置Webhook URL: ${webhookUrl}`);
        
        await tempBot.setWebHook(webhookUrl, {
            max_connections: 40,
            allowed_updates: [
                'message',
                'callback_query', 
                'channel_post',
                'edited_channel_post'
            ]
        });
        
        console.log('✅ Webhook设置成功！');
        
        // 验证设置
        const newWebhook = await tempBot.getWebHookInfo();
        console.log('📋 新的Webhook信息:', {
            url: newWebhook.url,
            has_custom_certificate: newWebhook.has_custom_certificate,
            pending_update_count: newWebhook.pending_update_count,
            max_connections: newWebhook.max_connections,
            allowed_updates: newWebhook.allowed_updates
        });
        
        console.log('🎉 切换完成！');
        console.log('');
        console.log('📝 接下来需要：');
        console.log('1. 重启Railway应用');
        console.log('2. 确保环境变量WEBHOOK_URL已设置');
        console.log('3. 验证/webhook端点正常工作');
        console.log('');
        console.log('⚠️ 重要提醒：');
        console.log('- 不需要修改任何核心代码');
        console.log('- Bot的所有功能保持不变');
        console.log('- Webhook会自动处理所有消息类型');
        
    } catch (error) {
        console.error('❌ 切换过程中发生错误:', error);
        process.exit(1);
    }
}

// 运行切换
switchToWebhook().catch(console.error); 