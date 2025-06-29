const Database = require('better-sqlite3');
const fs = require('fs');

const dbPath = '/app/data/marketing_bot.db';
const flagPath = '/app/data/.eav-complete-fix';

console.log('🔧 开始完整EAV修复...');

// 检查是否已经修复过
if (fs.existsSync(flagPath)) {
    console.log('✅ EAV已经完整修复过，跳过');
    return;
}

try {
    const db = new Database(dbPath);
    
    console.log('🔍 检查EAV表结构...');
    
    // 检查表是否存在
    const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name LIKE 'eav_%'
    `).all();
    
    console.log('现有EAV表:', tables.map(t => t.name));
    
    // 修复或创建eav_schema_definitions表
    console.log('\n🔨 修复eav_schema_definitions表...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS eav_schema_definitions (
            schema_id INTEGER PRIMARY KEY AUTOINCREMENT,
            schema_name TEXT UNIQUE NOT NULL,
            description TEXT,
            version TEXT DEFAULT '1.0.0',
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);
    
    // 检查并添加缺失的字段
    const schemaColumns = db.prepare(`PRAGMA table_info(eav_schema_definitions)`).all();
    const schemaColumnNames = schemaColumns.map(c => c.name);
    
    if (!schemaColumnNames.includes('updated_at')) {
        console.log('  添加updated_at字段到eav_schema_definitions');
        db.exec(`ALTER TABLE eav_schema_definitions ADD COLUMN updated_at INTEGER DEFAULT (strftime('%s', 'now'))`);
    }
    
    // 修复或创建eav_field_definitions表
    console.log('\n🔨 修复eav_field_definitions表...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS eav_field_definitions (
            field_id INTEGER PRIMARY KEY AUTOINCREMENT,
            schema_id INTEGER NOT NULL,
            field_name TEXT NOT NULL,
            field_type TEXT NOT NULL DEFAULT 'string',
            description TEXT,
            required INTEGER DEFAULT 0,
            default_value TEXT,
            validation_rules TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (schema_id) REFERENCES eav_schema_definitions(schema_id),
            UNIQUE(schema_id, field_name)
        )
    `);
    
    // 检查并添加缺失的字段
    const fieldColumns = db.prepare(`PRAGMA table_info(eav_field_definitions)`).all();
    const fieldColumnNames = fieldColumns.map(c => c.name);
    
    if (!fieldColumnNames.includes('updated_at')) {
        console.log('  添加updated_at字段到eav_field_definitions');
        db.exec(`ALTER TABLE eav_field_definitions ADD COLUMN updated_at INTEGER DEFAULT (strftime('%s', 'now'))`);
    }
    
    if (!fieldColumnNames.includes('default_value')) {
        console.log('  添加default_value字段到eav_field_definitions');
        db.exec(`ALTER TABLE eav_field_definitions ADD COLUMN default_value TEXT`);
    }
    
    if (!fieldColumnNames.includes('validation_rules')) {
        console.log('  添加validation_rules字段到eav_field_definitions');
        db.exec(`ALTER TABLE eav_field_definitions ADD COLUMN validation_rules TEXT`);
    }
    
    // 修复或创建eav_data_values表
    console.log('\n🔨 修复eav_data_values表...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS eav_data_values (
            value_id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_id INTEGER NOT NULL,
            schema_id INTEGER NOT NULL,
            entity_key TEXT NOT NULL,
            field_id INTEGER NOT NULL,
            value TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (schema_id) REFERENCES eav_schema_definitions(schema_id),
            FOREIGN KEY (field_id) REFERENCES eav_field_definitions(field_id)
        )
    `);
    
    // 检查并添加缺失的字段
    const valueColumns = db.prepare(`PRAGMA table_info(eav_data_values)`).all();
    const valueColumnNames = valueColumns.map(c => c.name);
    
    if (!valueColumnNames.includes('updated_at')) {
        console.log('  添加updated_at字段到eav_data_values');
        db.exec(`ALTER TABLE eav_data_values ADD COLUMN updated_at INTEGER DEFAULT (strftime('%s', 'now'))`);
    }
    
    // 创建索引
    console.log('\n🔨 创建索引...');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_eav_entity_key ON eav_data_values(entity_key)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_eav_schema_id ON eav_data_values(schema_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_eav_field_id ON eav_data_values(field_id)`);
    
    // 检查merchant_skills Schema
    console.log('\n🔍 检查merchant_skills Schema...');
    const existingSchema = db.prepare(`
        SELECT * FROM eav_schema_definitions WHERE schema_name = 'merchant_skills'
    `).get();
    
    if (existingSchema) {
        console.log('✅ merchant_skills Schema已存在');
    } else {
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
        
        console.log(`✅ 字段验证: ${verifyFields.length} 个字段`);
    }
    
    // 最终验证
    console.log('\n🔍 最终验证...');
    
    // 验证表结构
    const finalTables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name LIKE 'eav_%'
    `).all();
    console.log('EAV表:', finalTables.map(t => t.name));
    
    // 验证Schema
    const schemas = db.prepare(`SELECT * FROM eav_schema_definitions`).all();
    console.log('Schemas:', schemas.map(s => s.schema_name));
    
    // 验证merchant_skills字段
    const merchantSchema = db.prepare(`
        SELECT * FROM eav_schema_definitions WHERE schema_name = 'merchant_skills'
    `).get();
    
    if (merchantSchema) {
        const fields = db.prepare(`
            SELECT * FROM eav_field_definitions WHERE schema_id = ?
        `).all(merchantSchema.schema_id);
        console.log('merchant_skills字段:', fields.map(f => f.field_name));
    }
    
    // 创建完成标记
    fs.writeFileSync(flagPath, `EAV完整修复完成: ${new Date().toISOString()}`);
    
    console.log('\n🎉 EAV完整修复成功！');
    console.log('📝 已创建修复标记文件');
    console.log('🎊 商家技能数据现在应该可以正常工作了！');
    
    db.close();
    
} catch (error) {
    console.error('❌ EAV修复失败:', error);
    // 不抛出错误，避免影响应用启动
} 