const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'marketing_bot.db');

console.log('🔍 检查EAV表结构...');

try {
    const db = new Database(dbPath, { readonly: true });
    
    // 检查所有EAV相关表
    const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name LIKE 'eav_%'
    `).all();
    
    console.log('\n📊 EAV相关表:', tables.map(t => t.name));
    
    for (const table of tables) {
        console.log(`\n🔍 检查表: ${table.name}`);
        
        // 获取表结构
        const pragma = db.prepare(`PRAGMA table_info(${table.name})`).all();
        console.log('字段结构:');
        for (const column of pragma) {
            console.log(`  - ${column.name}: ${column.type} ${column.notnull ? 'NOT NULL' : ''} ${column.dflt_value ? `DEFAULT ${column.dflt_value}` : ''}`);
        }
        
        // 获取数据统计
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        console.log(`数据条数: ${count.count}`);
    }
    
    // 检查Schema定义
    if (tables.some(t => t.name === 'eav_schema_definitions')) {
        console.log('\n📋 Schema定义:');
        const schemas = db.prepare(`SELECT * FROM eav_schema_definitions`).all();
        for (const schema of schemas) {
            console.log(`  - ${schema.schema_name} (ID: ${schema.schema_id})`);
        }
    }
    
    db.close();
    
} catch (error) {
    console.error('❌ 检查失败:', error);
} 