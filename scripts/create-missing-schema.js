const Database = require('better-sqlite3');

// 生产环境数据库路径
const dbPath = '/app/data/marketing_bot.db';

console.log('🔧 开始创建缺失的merchant_skills Schema...');
console.log('数据库路径:', dbPath);
console.log('⚠️  此脚本只会添加缺失的Schema定义，不会修改任何现有数据');

const db = new Database(dbPath);

function createMerchantSkillsSchema() {
    try {
        console.log('\n🔍 检查merchant_skills Schema是否存在...');
        
        // 首先检查Schema是否已存在
        const existingSchema = db.prepare(`
            SELECT * FROM eav_schema_definitions WHERE schema_name = 'merchant_skills'
        `).get();
        
        if (existingSchema) {
            console.log('✅ merchant_skills Schema已存在，无需创建');
            console.log(`Schema ID: ${existingSchema.schema_id}`);
            return existingSchema.schema_id;
        }
        
        console.log('❌ merchant_skills Schema不存在，开始创建...');
        
        // 开始事务
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
        
        console.log('\n🎉 merchant_skills Schema创建完成！');
        
        // 验证创建结果
        const verifySchema = db.prepare(`
            SELECT * FROM eav_schema_definitions WHERE schema_id = ?
        `).get(schemaId);
        
        const verifyFields = db.prepare(`
            SELECT * FROM eav_field_definitions WHERE schema_id = ?
        `).all(schemaId);
        
        console.log('\n✅ 验证结果:');
        console.log(`Schema: ${verifySchema.schema_name} (ID: ${verifySchema.schema_id})`);
        console.log(`字段数量: ${verifyFields.length}`);
        
        for (const field of verifyFields) {
            console.log(`  - ${field.field_name} (ID: ${field.field_id})`);
        }
        
        return schemaId;
        
    } catch (error) {
        console.error('❌ 创建Schema失败:', error);
        throw error;
    }
}

// 主执行函数
async function main() {
    try {
        console.log('🚀 开始执行Schema创建...');
        
        const schemaId = createMerchantSkillsSchema();
        
        if (schemaId) {
            console.log('\n🎉 Schema创建成功！');
            console.log('现在商家技能数据应该可以正常显示了');
            console.log('');
            console.log('📋 接下来会发生什么：');
            console.log('1. 当用户查看商家信息时，系统会自动从商家表读取技能数据');
            console.log('2. 系统会自动将技能数据迁移到EAV表中');
            console.log('3. 之后的查询将直接使用EAV表中的数据');
        } else {
            console.log('\n❌ Schema创建失败');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ 执行过程中出现错误:', error);
        process.exit(1);
    } finally {
        db.close();
        console.log('\n🏁 脚本执行完成');
    }
}

// 执行脚本
main(); 