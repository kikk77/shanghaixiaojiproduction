const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 获取数据库路径
const dbPath = process.env.NODE_ENV === 'production' 
    ? '/app/data/marketing_bot.db'
    : path.join(__dirname, '../data/marketing_bot.db');

console.log('🔧 开始修复EAV Schema...');
console.log('数据库路径:', dbPath);

const db = new Database(dbPath);

// 初始化EAV表结构
function initializeEAVTables() {
    console.log('\n🔨 初始化EAV表结构...');
    
    try {
        // 创建EAV Schema定义表
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
        
        // 创建EAV字段定义表
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
        
        // 创建EAV数据值表
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
        
        // 创建索引
        db.exec(`CREATE INDEX IF NOT EXISTS idx_eav_entity_key ON eav_data_values(entity_key)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_eav_schema_id ON eav_data_values(schema_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_eav_field_id ON eav_data_values(field_id)`);
        
        console.log('✅ EAV表结构初始化成功');
        
    } catch (error) {
        console.error('❌ EAV表结构初始化失败:', error);
        throw error;
    }
}

// 检查当前Schema状态
function checkCurrentSchemas() {
    console.log('\n📊 检查当前EAV Schema状态...');
    
    const schemas = db.prepare(`SELECT * FROM eav_schema_definitions`).all();
    console.log('当前Schema数量:', schemas.length);
    
    for (const schema of schemas) {
        console.log(`- ${schema.schema_name} (ID: ${schema.schema_id})`);
    }
    
    // 检查merchant_skills
    const merchantSkillsSchema = db.prepare(`
        SELECT * FROM eav_schema_definitions WHERE schema_name = 'merchant_skills'
    `).get();
    
    if (merchantSkillsSchema) {
        console.log('✅ merchant_skills Schema存在');
        
        // 检查字段定义
        const fields = db.prepare(`
            SELECT * FROM eav_field_definitions WHERE schema_id = ?
        `).all(merchantSkillsSchema.schema_id);
        
        console.log(`字段数量: ${fields.length}`);
        for (const field of fields) {
            console.log(`  - ${field.field_name} (${field.field_type})`);
        }
    } else {
        console.log('❌ merchant_skills Schema不存在');
    }
}

// 创建merchant_skills Schema
function createMerchantSkillsSchema() {
    console.log('\n🔨 创建merchant_skills Schema...');
    
    try {
        // 插入Schema定义
        const insertSchema = db.prepare(`
            INSERT OR REPLACE INTO eav_schema_definitions 
            (schema_name, description, version, created_at) 
            VALUES (?, ?, ?, strftime('%s', 'now'))
        `);
        
        const schemaResult = insertSchema.run(
            'merchant_skills',
            '商家技能配置',
            '1.0.0'
        );
        
        const schemaId = schemaResult.lastInsertRowid;
        console.log(`✅ Schema创建成功，ID: ${schemaId}`);
        
        // 创建字段定义
        const fields = [
            { name: 'wash', type: 'string', description: '洗的技能', required: 0 },
            { name: 'blow', type: 'string', description: '吹的技能', required: 0 },
            { name: 'do', type: 'string', description: '做的技能', required: 0 },
            { name: 'kiss', type: 'string', description: '吻的技能', required: 0 }
        ];
        
        const insertField = db.prepare(`
            INSERT OR REPLACE INTO eav_field_definitions 
            (schema_id, field_name, field_type, description, required, created_at) 
            VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
        `);
        
        for (const field of fields) {
            insertField.run(schemaId, field.name, field.type, field.description, field.required);
            console.log(`  ✅ 字段创建成功: ${field.name}`);
        }
        
        return schemaId;
        
    } catch (error) {
        console.error('❌ 创建Schema失败:', error);
        return null;
    }
}

// 迁移现有商家技能数据
function migrateMerchantSkills(schemaId) {
    console.log('\n📦 迁移现有商家技能数据...');
    
    try {
        // 获取所有商家及其技能数据
        const merchants = db.prepare(`
            SELECT id, skill_wash, skill_blow, skill_do, skill_kiss 
            FROM merchants 
            WHERE skill_wash IS NOT NULL 
               OR skill_blow IS NOT NULL 
               OR skill_do IS NOT NULL 
               OR skill_kiss IS NOT NULL
        `).all();
        
        console.log(`找到 ${merchants.length} 个商家有技能数据`);
        
        // 获取字段ID映射
        const fields = db.prepare(`
            SELECT field_id, field_name FROM eav_field_definitions WHERE schema_id = ?
        `).all(schemaId);
        
        const fieldMap = {};
        for (const field of fields) {
            fieldMap[field.field_name] = field.field_id;
        }
        
        // 准备插入语句
        const insertValue = db.prepare(`
            INSERT OR REPLACE INTO eav_data_values 
            (entity_id, schema_id, entity_key, field_id, value, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
        `);
        
        let migrated = 0;
        
        for (const merchant of merchants) {
            const entityKey = `merchant_${merchant.id}`;
            const entityId = merchant.id; // 使用商家ID作为entity_id
            
            const skills = {
                wash: merchant.skill_wash || '未填写',
                blow: merchant.skill_blow || '未填写',
                do: merchant.skill_do || '未填写',
                kiss: merchant.skill_kiss || '未填写'
            };
            
            try {
                for (const [skillName, skillValue] of Object.entries(skills)) {
                    if (fieldMap[skillName]) {
                        insertValue.run(
                            entityId,
                            schemaId,
                            entityKey,
                            fieldMap[skillName],
                            skillValue
                        );
                    }
                }
                migrated++;
                console.log(`  ✅ 商家 ${merchant.id} 技能数据迁移成功`);
            } catch (error) {
                console.error(`  ❌ 商家 ${merchant.id} 迁移失败:`, error.message);
            }
        }
        
        console.log(`✅ 成功迁移 ${migrated}/${merchants.length} 个商家的技能数据`);
        
    } catch (error) {
        console.error('❌ 迁移技能数据失败:', error);
    }
}

// 验证修复结果
function verifyFix() {
    console.log('\n🔍 验证修复结果...');
    
    try {
        // 检查Schema
        const schema = db.prepare(`
            SELECT * FROM eav_schema_definitions WHERE schema_name = 'merchant_skills'
        `).get();
        
        if (!schema) {
            console.log('❌ Schema仍然不存在');
            return false;
        }
        
        // 检查字段
        const fields = db.prepare(`
            SELECT * FROM eav_field_definitions WHERE schema_id = ?
        `).all(schema.schema_id);
        
        if (fields.length !== 4) {
            console.log(`❌ 字段数量不正确，期望4个，实际${fields.length}个`);
            return false;
        }
        
        // 检查数据
        const dataCount = db.prepare(`
            SELECT COUNT(*) as count FROM eav_data_values WHERE schema_id = ?
        `).get(schema.schema_id);
        
        console.log(`✅ Schema验证通过`);
        console.log(`✅ 字段验证通过 (${fields.length}个字段)`);
        console.log(`✅ 数据验证通过 (${dataCount.count}条记录)`);
        
        // 测试获取一个商家的技能数据
        const testMerchant = db.prepare(`SELECT id FROM merchants LIMIT 1`).get();
        if (testMerchant) {
            const testEntityKey = `merchant_${testMerchant.id}`;
            const testData = db.prepare(`
                SELECT f.field_name, v.value 
                FROM eav_data_values v 
                JOIN eav_field_definitions f ON v.field_id = f.field_id 
                WHERE v.entity_key = ? AND v.schema_id = ?
            `).all(testEntityKey, schema.schema_id);
            
            console.log(`测试商家 ${testMerchant.id} 的技能数据:`);
            for (const item of testData) {
                console.log(`  - ${item.field_name}: ${item.value}`);
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ 验证失败:', error);
        return false;
    }
}

// 主执行流程
async function main() {
    try {
        // 0. 初始化EAV表结构
        initializeEAVTables();
        
        // 1. 检查当前状态
        checkCurrentSchemas();
        
        // 2. 创建Schema
        const schemaId = createMerchantSkillsSchema();
        if (!schemaId) {
            console.log('❌ Schema创建失败，退出');
            process.exit(1);
        }
        
        // 3. 迁移数据
        migrateMerchantSkills(schemaId);
        
        // 4. 验证结果
        const success = verifyFix();
        
        if (success) {
            console.log('\n🎉 EAV Schema修复完成！');
        } else {
            console.log('\n❌ 修复验证失败');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ 修复过程中出现错误:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

// 执行修复
main(); 