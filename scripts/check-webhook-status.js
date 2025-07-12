#!/usr/bin/env node

/**
 * 检查当前Webhook状态
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

async function checkWebhookStatus() {
    console.log('🔍 检查当前Webhook状态...');
    
    const BOT_TOKEN = process.env.BOT_TOKEN;
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
        const webhookInfo = await tempBot.getWebHookInfo();
        console.log('📋 当前Webhook状态:', {
            url: webhookInfo.url || '未设置',
            has_custom_certificate: webhookInfo.has_custom_certificate,
            pending_update_count: webhookInfo.pending_update_count,
            last_error_date: webhookInfo.last_error_date,
            last_error_message: webhookInfo.last_error_message,
            max_connections: webhookInfo.max_connections,
            allowed_updates: webhookInfo.allowed_updates
        });
        
        console.log('\n🔧 环境变量状态:');
        console.log(`   - NODE_ENV: ${process.env.NODE_ENV}`);
        console.log(`   - WEBHOOK_URL: ${process.env.WEBHOOK_URL || '未设置'}`);
        console.log(`   - RAILWAY_PUBLIC_DOMAIN: ${process.env.RAILWAY_PUBLIC_DOMAIN || '未设置'}`);
        
        // 判断当前模式
        const hasWebhook = !!webhookInfo.url;
        const shouldUseWebhook = process.env.WEBHOOK_URL && process.env.NODE_ENV === 'production';
        
        console.log('\n📊 模式分析:');
        console.log(`   - Telegram端已设置webhook: ${hasWebhook ? '是' : '否'}`);
        console.log(`   - 代码判断应使用webhook: ${shouldUseWebhook ? '是' : '否'}`);
        
        if (hasWebhook && !shouldUseWebhook) {
            console.log('🚨 检测到冲突状态！');
            console.log('   - Telegram端已设置webhook，但代码仍在polling模式');
            console.log('   - 这会导致Bot无法接收消息');
            console.log('\n💡 解决方案：');
            console.log('   1. 设置WEBHOOK_URL环境变量（推荐）');
            console.log('   2. 或者删除webhook设置，回到polling模式');
        } else if (!hasWebhook && shouldUseWebhook) {
            console.log('⚠️ 配置不一致');
            console.log('   - 代码期望使用webhook，但Telegram端未设置');
        } else if (hasWebhook && shouldUseWebhook) {
            console.log('✅ 配置一致 - Webhook模式');
        } else {
            console.log('✅ 配置一致 - Polling模式');
        }
        
    } catch (error) {
        console.error('❌ 检查失败:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    checkWebhookStatus();
}

module.exports = { checkWebhookStatus }; 