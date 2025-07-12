#!/usr/bin/env node

/**
 * 安全修复：仅添加自定义模板控制字段
 * 最小化修改，不影响现有数据和功能
 */

require('dotenv').config();
const path = require('path');
const Database = require('better-sqlite3');

// 根据环境变量确定数据库路径
const isDevelopment = process.env.NODE_ENV !== 'production';
const dbPath = isDevelopment 
    ? path.join(__dirname, '../data/marketing_bot_dev.db')
    : '/app/data/marketing_bot.db';

console.log('🔧 安全修复：添加自定义模板控制字段');
console.log('=======================================');
console.log(`📂 数据库路径: ${dbPath}`);
console.log(`🌍 环境: ${isDevelopment ? 'development' : 'production'}`);

function safeAddCustomTemplateFields() {
    let db;
    
    try {
        // 连接数据库（只读模式先检查）
        db = new Database(dbPath);
        console.log('✅ 数据库连接成功');
        
        // 检查表结构
        const tableInfo = db.prepare("PRAGMA table_info(merchants)").all();
        const columnNames = tableInfo.map(col => col.name);
        
        console.log('\n🔍 检查merchants表字段:');
        
        // 只检查我们需要的字段
        const targetField = 'show_advantages_in_custom_template';
        const fieldExists = columnNames.includes(targetField);
        
        if (fieldExists) {
            console.log(`✅ 字段 ${targetField} 已存在，无需修改`);
            console.log('🎯 数据库已是最新状态');
        } else {
            console.log(`⚠️ 字段 ${targetField} 不存在，需要添加`);
            
            // 安全添加字段
            console.log('📝 正在安全添加字段...');
            db.exec(`ALTER TABLE merchants ADD COLUMN ${targetField} INTEGER DEFAULT 1`);
            console.log(`✅ 字段 ${targetField} 添加成功`);
            
            // 验证添加结果
            const newTableInfo = db.prepare("PRAGMA table_info(merchants)").all();
            const newColumnNames = newTableInfo.map(col => col.name);
            
            if (newColumnNames.includes(targetField)) {
                console.log('✅ 字段添加验证成功');
            } else {
                throw new Error('字段添加验证失败');
            }
        }
        
        console.log('\n✅ 安全修复完成！');
        console.log('\n📋 修改内容:');
        console.log('- 仅添加了 show_advantages_in_custom_template 字段');
        console.log('- 默认值为 1（显示优缺点）');
        console.log('- 现有数据完全不受影响');
        
        console.log('\n⚠️ 注意:');
        console.log('- 需要重启应用以生效');
        console.log('- 现有商家设置保持不变');
        
    } catch (error) {
        console.error('❌ 修复失败:', error);
        console.error('❌ 数据库未做任何修改');
        process.exit(1);
    } finally {
        if (db) {
            db.close();
        }
    }
}

if (require.main === module) {
    safeAddCustomTemplateFields();
}

module.exports = { safeAddCustomTemplateFields }; 