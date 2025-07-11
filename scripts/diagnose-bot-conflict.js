#!/usr/bin/env node

/**
 * Bot冲突诊断工具
 * 用于检查Bot状态、webhook设置和实例冲突
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

async function diagnoseBotConflict() {
    console.log('🔍 开始Bot冲突诊断...');
    
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
        console.error('❌ 找不到BOT_TOKEN环境变量');
        process.exit(1);
    }
    
    try {
        // 创建临时Bot实例（不启用polling）
        const tempBot = new TelegramBot(BOT_TOKEN, { polling: false });
        
        console.log('🤖 检查Bot基本信息...');
        const botInfo = await tempBot.getMe();
        console.log(`✅ Bot信息:`, {
            id: botInfo.id,
            username: botInfo.username,
            first_name: botInfo.first_name,
            can_join_groups: botInfo.can_join_groups,
            can_read_all_group_messages: botInfo.can_read_all_group_messages,
            supports_inline_queries: botInfo.supports_inline_queries
        });
        
        console.log('🔗 检查Webhook状态...');
        const webhookInfo = await tempBot.getWebHookInfo();
        console.log(`📋 Webhook信息:`, {
            url: webhookInfo.url || '未设置',
            has_custom_certificate: webhookInfo.has_custom_certificate,
            pending_update_count: webhookInfo.pending_update_count,
            last_error_date: webhookInfo.last_error_date || '无错误',
            last_error_message: webhookInfo.last_error_message || '无错误',
            max_connections: webhookInfo.max_connections,
            allowed_updates: webhookInfo.allowed_updates
        });
        
        if (webhookInfo.url) {
            console.log('🔗 当前使用Webhook模式');
            console.log(`📍 Webhook URL: ${webhookInfo.url}`);
            
            if (webhookInfo.pending_update_count > 0) {
                console.log(`⚠️ 有 ${webhookInfo.pending_update_count} 个待处理的更新`);
            }
            
            if (webhookInfo.last_error_message) {
                console.log(`❌ 最后一次错误: ${webhookInfo.last_error_message}`);
            }
        } else {
            console.log('📡 当前使用Polling模式');
        }
        
        console.log('🧪 测试Bot响应...');
        try {
            // 测试一个简单的API调用
            const updates = await tempBot.getUpdates({ limit: 1 });
            console.log(`✅ Bot响应正常，最近更新数量: ${updates.length}`);
        } catch (testError) {
            if (testError.response && testError.response.statusCode === 409) {
                console.log('🚨 检测到409冲突！这表明有其他Bot实例正在运行');
                console.log('💡 建议解决方案：');
                console.log('   1. 检查Railway是否有多个活跃部署');
                console.log('   2. 检查本地是否有运行的Bot实例');
                console.log('   3. 如果使用webhook，确保只有一个webhook端点');
                console.log('   4. 考虑重启Railway应用以清理所有实例');
            } else {
                console.log(`⚠️ Bot测试失败: ${testError.message}`);
            }
        }
        
        console.log('🔧 系统环境信息:');
        console.log(`   - Node.js版本: ${process.version}`);
        console.log(`   - 平台: ${process.platform}`);
        console.log(`   - 环境: ${process.env.NODE_ENV || 'development'}`);
        console.log(`   - Railway环境: ${process.env.RAILWAY_ENVIRONMENT_NAME || '未设置'}`);
        console.log(`   - 进程ID: ${process.pid}`);
        
        console.log('✅ 诊断完成');
        
    } catch (error) {
        console.error('❌ 诊断过程中发生错误:', error);
        
        if (error.response && error.response.statusCode === 409) {
            console.log('🚨 即使在诊断模式下也检测到409冲突！');
            console.log('这强烈表明有多个Bot实例在运行');
        }
        
        process.exit(1);
    }
}

// 运行诊断
diagnoseBotConflict().catch(console.error); 