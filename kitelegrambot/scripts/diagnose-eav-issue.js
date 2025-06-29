const Database = require('better-sqlite3');

// 生产环境数据库路径
const dbPath = '/app/data/marketing_bot.db';

console.log('🔍 开始诊断生产环境EAV Schema问题...');
console.log('数据库路径:', dbPath);
console.log('⚠️  此脚本只读取数据，不会修改任何内容');

const db = new Database(dbPath, { readonly: true }); // 只读模式

// 检查EAV表结构
function checkEAVTables() {
    console.log('\n📊 检查EAV表结构...');
    
    try {
        // 检查表是否存在
        const tables = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name LIKE 'eav_%'
        `).all();
        
        console.log('EAV相关表:', tables.map(t => t.name));
        
        if (tables.length === 0) {
            console.log('❌ 没有找到EAV表结构');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('❌ 检查EAV表失败:', error);
        return false;
    }
}

// 检查Schema定义
function checkSchemaDefinitions() {
    console.log('\n📋 检查Schema定义...');
    
    try {
        const schemas = db.prepare(`SELECT * FROM eav_schema_definitions`).all();
        console.log(`找到 ${schemas.length} 个Schema定义:`);
        
        for (const schema of schemas) {
            console.log(`- ${schema.schema_name} (ID: ${schema.schema_id})`);
            console.log(`  描述: ${schema.description}`);
            console.log(`  版本: ${schema.version}`);
        }
        
        // 检查merchant_skills
        const merchantSkillsSchema = db.prepare(`
            SELECT * FROM eav_schema_definitions WHERE schema_name = 'merchant_skills'
        `).get();
        
        if (merchantSkillsSchema) {
            console.log('\n✅ merchant_skills Schema存在');
            return merchantSkillsSchema.schema_id;
        } else {
            console.log('\n❌ merchant_skills Schema不存在');
            return null;
        }
    } catch (error) {
        console.error('❌ 检查Schema定义失败:', error);
        return null;
    }
}

// 检查字段定义
function checkFieldDefinitions(schemaId) {
    console.log('\n🏷️  检查字段定义...');
    
    try {
        const fields = db.prepare(`
            SELECT * FROM eav_field_definitions WHERE schema_id = ?
        `).all(schemaId);
        
        console.log(`找到 ${fields.length} 个字段定义:`);
        
        const expectedFields = ['wash', 'blow', 'do', 'kiss'];
        const foundFields = fields.map(f => f.field_name);
        
        for (const field of fields) {
            console.log(`- ${field.field_name} (${field.field_type})`);
            console.log(`  描述: ${field.description}`);
            console.log(`  必填: ${field.required ? '是' : '否'}`);
        }
        
        // 检查缺失的字段
        const missingFields = expectedFields.filter(f => !foundFields.includes(f));
        if (missingFields.length > 0) {
            console.log(`\n❌ 缺失字段: ${missingFields.join(', ')}`);
        } else {
            console.log('\n✅ 所有必要字段都存在');
        }
        
        return fields.length === expectedFields.length;
    } catch (error) {
        console.error('❌ 检查字段定义失败:', error);
        return false;
    }
}

// 检查数据值
function checkDataValues(schemaId) {
    console.log('\n💾 检查EAV数据值...');
    
    try {
        const dataCount = db.prepare(`
            SELECT COUNT(*) as count FROM eav_data_values WHERE schema_id = ?
        `).get(schemaId);
        
        console.log(`EAV数据记录总数: ${dataCount.count}`);
        
        // 检查有多少个商家有EAV数据
        const entityCount = db.prepare(`
            SELECT COUNT(DISTINCT entity_key) as count 
            FROM eav_data_values WHERE schema_id = ?
        `).get(schemaId);
        
        console.log(`有EAV数据的商家数量: ${entityCount.count}`);
        
        // 检查每个字段的数据分布
        const fieldData = db.prepare(`
            SELECT f.field_name, COUNT(v.value_id) as count
            FROM eav_field_definitions f
            LEFT JOIN eav_data_values v ON f.field_id = v.field_id AND v.schema_id = ?
            WHERE f.schema_id = ?
            GROUP BY f.field_name
        `).all(schemaId, schemaId);
        
        console.log('\n字段数据分布:');
        for (const field of fieldData) {
            console.log(`- ${field.field_name}: ${field.count} 条记录`);
        }
        
        return dataCount.count > 0;
    } catch (error) {
        console.error('❌ 检查数据值失败:', error);
        return false;
    }
}

// 检查商家表中的技能数据
function checkMerchantSkills() {
    console.log('\n👥 检查商家表中的技能数据...');
    
    try {
        const merchantsWithSkills = db.prepare(`
            SELECT id, skill_wash, skill_blow, skill_do, skill_kiss 
            FROM merchants 
            WHERE skill_wash IS NOT NULL 
               OR skill_blow IS NOT NULL 
               OR skill_do IS NOT NULL 
               OR skill_kiss IS NOT NULL
        `).all();
        
        console.log(`商家表中有技能数据的商家数量: ${merchantsWithSkills.length}`);
        
        if (merchantsWithSkills.length > 0) {
            console.log('\n前3个商家的技能数据示例:');
            for (let i = 0; i < Math.min(3, merchantsWithSkills.length); i++) {
                const merchant = merchantsWithSkills[i];
                console.log(`商家 ${merchant.id}:`);
                console.log(`  洗: ${merchant.skill_wash || '未填写'}`);
                console.log(`  吹: ${merchant.skill_blow || '未填写'}`);
                console.log(`  做: ${merchant.skill_do || '未填写'}`);
                console.log(`  吻: ${merchant.skill_kiss || '未填写'}`);
            }
        }
        
        return merchantsWithSkills.length;
    } catch (error) {
        console.error('❌ 检查商家技能数据失败:', error);
        return 0;
    }
}

// 测试技能数据获取
function testSkillDataRetrieval() {
    console.log('\n🧪 测试技能数据获取...');
    
    try {
        // 获取一个商家ID
        const testMerchant = db.prepare(`SELECT id FROM merchants LIMIT 1`).get();
        if (!testMerchant) {
            console.log('❌ 没有找到商家数据');
            return false;
        }
        
        const merchantId = testMerchant.id;
        const entityKey = `merchant_${merchantId}`;
        
        console.log(`测试商家ID: ${merchantId}`);
        console.log(`实体键: ${entityKey}`);
        
        // 尝试从EAV获取数据
        const eavData = db.prepare(`
            SELECT f.field_name, v.value 
            FROM eav_data_values v 
            JOIN eav_field_definitions f ON v.field_id = f.field_id 
            JOIN eav_schema_definitions s ON v.schema_id = s.schema_id
            WHERE v.entity_key = ? AND s.schema_name = 'merchant_skills'
        `).all(entityKey);
        
        console.log(`EAV查询结果: ${eavData.length} 条记录`);
        
        if (eavData.length > 0) {
            console.log('EAV数据:');
            for (const item of eavData) {
                console.log(`  ${item.field_name}: ${item.value}`);
            }
        } else {
            console.log('❌ 没有找到EAV数据');
        }
        
        // 尝试从商家表获取数据
        const merchantData = db.prepare(`
            SELECT skill_wash, skill_blow, skill_do, skill_kiss 
            FROM merchants WHERE id = ?
        `).get(merchantId);
        
        if (merchantData) {
            console.log('商家表数据:');
            console.log(`  洗: ${merchantData.skill_wash || '未填写'}`);
            console.log(`  吹: ${merchantData.skill_blow || '未填写'}`);
            console.log(`  做: ${merchantData.skill_do || '未填写'}`);
            console.log(`  吻: ${merchantData.skill_kiss || '未填写'}`);
        }
        
        return true;
    } catch (error) {
        console.error('❌ 测试技能数据获取失败:', error);
        return false;
    }
}

// 主诊断流程
async function main() {
    try {
        console.log('🚀 开始诊断...\n');
        
        // 1. 检查EAV表结构
        const hasEAVTables = checkEAVTables();
        if (!hasEAVTables) {
            console.log('\n❌ 诊断结果: EAV表结构不存在');
            return;
        }
        
        // 2. 检查Schema定义
        const schemaId = checkSchemaDefinitions();
        if (!schemaId) {
            console.log('\n❌ 诊断结果: merchant_skills Schema不存在');
            console.log('建议: 需要创建merchant_skills Schema');
            return;
        }
        
        // 3. 检查字段定义
        const hasAllFields = checkFieldDefinitions(schemaId);
        if (!hasAllFields) {
            console.log('\n❌ 诊断结果: 字段定义不完整');
            return;
        }
        
        // 4. 检查数据值
        const hasData = checkDataValues(schemaId);
        
        // 5. 检查商家表数据
        const merchantSkillCount = checkMerchantSkills();
        
        // 6. 测试数据获取
        testSkillDataRetrieval();
        
        // 总结
        console.log('\n📋 诊断总结:');
        console.log(`✅ EAV表结构: 存在`);
        console.log(`✅ merchant_skills Schema: 存在 (ID: ${schemaId})`);
        console.log(`✅ 字段定义: 完整`);
        console.log(`${hasData ? '✅' : '❌'} EAV数据: ${hasData ? '有数据' : '无数据'}`);
        console.log(`${merchantSkillCount > 0 ? '✅' : '❌'} 商家技能数据: ${merchantSkillCount} 个商家`);
        
        if (!hasData && merchantSkillCount > 0) {
            console.log('\n🔍 问题分析:');
            console.log('- EAV Schema和字段定义都存在');
            console.log('- 商家表中有技能数据');
            console.log('- 但EAV表中没有对应数据');
            console.log('- 可能需要数据迁移（但需要谨慎操作）');
        }
        
    } catch (error) {
        console.error('❌ 诊断过程中出现错误:', error);
    } finally {
        db.close();
        console.log('\n🏁 诊断完成');
    }
}

// 执行诊断
main(); 