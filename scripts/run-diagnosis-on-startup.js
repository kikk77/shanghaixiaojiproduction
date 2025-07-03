const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 生产环境数据库路径
const dbPath = '/app/data/marketing_bot.db';
const logPath = '/app/diagnosis-result.log';

console.log('🔍 自动运行EAV诊断...');

function runDiagnosis() {
    let logContent = '';
    
    function log(message) {
        console.log(message);
        logContent += message + '\n';
    }
    
    try {
        const db = new Database(dbPath, { readonly: true });
        
        log('🔍 开始诊断生产环境EAV Schema问题...');
        log('数据库路径: ' + dbPath);
        log('⚠️  此脚本只读取数据，不会修改任何内容');
        
        // 检查EAV表结构
        try {
            const tables = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name LIKE 'eav_%'
            `).all();
            
            log('\n📊 EAV相关表: ' + tables.map(t => t.name).join(', '));
            
            if (tables.length === 0) {
                log('❌ 没有找到EAV表结构');
                return;
            }
        } catch (error) {
            log('❌ 检查EAV表失败: ' + error.message);
            return;
        }
        
        // 检查Schema定义
        try {
            const schemas = db.prepare(`SELECT * FROM eav_schema_definitions`).all();
            log(`\n📋 找到 ${schemas.length} 个Schema定义:`);
            
            for (const schema of schemas) {
                log(`- ${schema.schema_name} (ID: ${schema.schema_id})`);
            }
            
            const merchantSkillsSchema = db.prepare(`
                SELECT * FROM eav_schema_definitions WHERE schema_name = 'merchant_skills'
            `).get();
            
            if (merchantSkillsSchema) {
                log('\n✅ merchant_skills Schema存在');
                
                // 检查字段定义
                const fields = db.prepare(`
                    SELECT * FROM eav_field_definitions WHERE schema_id = ?
                `).all(merchantSkillsSchema.schema_id);
                
                log(`\n🏷️  找到 ${fields.length} 个字段定义:`);
                for (const field of fields) {
                    log(`- ${field.field_name} (${field.field_type})`);
                }
                
                // 检查数据值
                const dataCount = db.prepare(`
                    SELECT COUNT(*) as count FROM eav_data_values WHERE schema_id = ?
                `).get(merchantSkillsSchema.schema_id);
                
                log(`\n💾 EAV数据记录总数: ${dataCount.count}`);
                
                // 检查商家表数据
                const merchantsWithSkills = db.prepare(`
                    SELECT COUNT(*) as count FROM merchants 
                    WHERE skill_wash IS NOT NULL 
                       OR skill_blow IS NOT NULL 
                       OR skill_do IS NOT NULL 
                       OR skill_kiss IS NOT NULL
                `).get();
                
                log(`👥 商家表中有技能数据的商家数量: ${merchantsWithSkills.count}`);
                
                // 测试数据获取
                const testMerchant = db.prepare(`SELECT id FROM merchants LIMIT 1`).get();
                if (testMerchant) {
                    const entityKey = `merchant_${testMerchant.id}`;
                    const eavData = db.prepare(`
                        SELECT f.field_name, v.value 
                        FROM eav_data_values v 
                        JOIN eav_field_definitions f ON v.field_id = f.field_id 
                        JOIN eav_schema_definitions s ON v.schema_id = s.schema_id
                        WHERE v.entity_key = ? AND s.schema_name = 'merchant_skills'
                    `).all(entityKey);
                    
                    log(`\n🧪 测试商家 ${testMerchant.id} 的EAV数据: ${eavData.length} 条记录`);
                    
                    if (eavData.length === 0) {
                        log('❌ 问题确认: EAV表中没有商家技能数据');
                        
                        const merchantData = db.prepare(`
                            SELECT skill_wash, skill_blow, skill_do, skill_kiss 
                            FROM merchants WHERE id = ?
                        `).get(testMerchant.id);
                        
                        if (merchantData) {
                            log('✅ 但商家表中有数据:');
                            log(`  洗: ${merchantData.skill_wash || '未填写'}`);
                            log(`  吹: ${merchantData.skill_blow || '未填写'}`);
                            log(`  做: ${merchantData.skill_do || '未填写'}`);
                            log(`  吻: ${merchantData.skill_kiss || '未填写'}`);
                        }
                    }
                }
                
            } else {
                log('\n❌ merchant_skills Schema不存在');
            }
            
        } catch (error) {
            log('❌ 检查Schema失败: ' + error.message);
        }
        
        db.close();
        
    } catch (error) {
        log('❌ 诊断失败: ' + error.message);
    }
    
    // 保存诊断结果到文件
    try {
        fs.writeFileSync(logPath, logContent);
        log(`\n📝 诊断结果已保存到: ${logPath}`);
    } catch (error) {
        log('❌ 保存诊断结果失败: ' + error.message);
    }
}

// 运行诊断
runDiagnosis(); 