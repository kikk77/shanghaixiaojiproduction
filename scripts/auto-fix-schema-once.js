const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 生产环境数据库路径
const dbPath = '/app/data/marketing_bot.db';
const flagPath = '/app/data/.schema-fixed';

console.log('🔧 检查是否需要修复merchant_skills Schema...');

// 检查是否已经修复过
if (fs.existsSync(flagPath)) {
    console.log('✅ Schema已经修复过，跳过');
    return;
}

console.log('🚀 开始自动修复merchant_skills Schema...');
console.log('数据库路径:', dbPath);

try {
    const db = new Database(dbPath);
    
    // 检查merchant_skills Schema是否存在
    const existingSchema = db.prepare(`
        SELECT * FROM eav_schema_definitions WHERE schema_name = 'merchant_skills'
    `).get();
    
    if (existingSchema) {
        console.log('✅ merchant_skills Schema已存在，无需修复');
        // 创建标记文件
        fs.writeFileSync(flagPath, new Date().toISOString());
        db.close();
        return;
    }
    
    console.log('❌ merchant_skills Schema不存在，开始创建...');
    
    // 使用事务创建Schema
    const transaction = db.transaction(() => {
        // 1. 创建Schema定义
        const insertSchema = db.prepare(`
            INSERT INTO eav_schema_definitions 
            (schema_name, description, version, created_at, updated_at) 
            VALUES (?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
        `);
        
        const schemaResult = insertSchema.run(
            'merchant_skills',
            '商家技能配置',
            '1.0.0'
        );
        
        const schemaId = schemaResult.lastInsertRowid;
        console.log(`✅ Schema创建成功，ID: ${schemaId}`);
        
        // 2. 创建字段定义
        const fields = [
            { name: 'wash', type: 'string', description: '洗的技能', required: 0 },
            { name: 'blow', type: 'string', description: '吹的技能', required: 0 },
            { name: 'do', type: 'string', description: '做的技能', required: 0 },
            { name: 'kiss', type: 'string', description: '吻的技能', required: 0 }
        ];
        
        const insertField = db.prepare(`
            INSERT INTO eav_field_definitions 
            (schema_id, field_name, field_type, description, required, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
        `);
        
        for (const field of fields) {
            insertField.run(schemaId, field.name, field.type, field.description, field.required);
            console.log(`  ✅ 字段创建成功: ${field.name}`);
        }
        
        return schemaId;
    });
    
    // 执行事务
    const schemaId = transaction();
    
    // 验证创建结果
    const verifyFields = db.prepare(`
        SELECT * FROM eav_field_definitions WHERE schema_id = ?
    `).all(schemaId);
    
    console.log('\n🎉 merchant_skills Schema修复完成！');
    console.log(`✅ Schema ID: ${schemaId}`);
    console.log(`✅ 字段数量: ${verifyFields.length}`);
    
    for (const field of verifyFields) {
        console.log(`  - ${field.field_name} (ID: ${field.field_id})`);
    }
    
    // 创建标记文件，防止重复执行
    fs.writeFileSync(flagPath, `Schema fixed at: ${new Date().toISOString()}\nSchema ID: ${schemaId}`);
    
    console.log('\n📝 已创建修复标记文件，防止重复执行');
    console.log('🎊 现在商家技能数据应该可以正常显示了！');
    
    db.close();
    
} catch (error) {
    console.error('❌ Schema修复失败:', error);
    // 不抛出错误，避免影响应用启动
} 