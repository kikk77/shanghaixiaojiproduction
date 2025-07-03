const { getChannelDatabase } = require('../config/channelDatabase');

/**
 * 数据库迁移脚本：添加延时转发和顺序模式字段
 * 为现有的频道配置数据库添加 delay_seconds 和 sequential_mode 属性
 */
async function migrateDelayFields() {
    console.log('🔧 开始迁移：添加延时转发和顺序模式字段...');
    
    try {
        const db = getChannelDatabase();
        
        // 检查是否已经存在这些属性
        const existingAttributes = db.prepare(`
            SELECT attribute_name FROM channel_attributes 
            WHERE attribute_name IN ('delay_seconds', 'sequential_mode')
        `).all();
        
        const existingNames = existingAttributes.map(attr => attr.attribute_name);
        console.log('📋 已存在的属性:', existingNames);
        
        // 准备要添加的新属性
        const newAttributes = [
            {
                name: 'delay_seconds',
                type: 'integer',
                category: 'channel_config',
                description: '转发延时（秒）',
                default: '0'
            },
            {
                name: 'sequential_mode',
                type: 'boolean',
                category: 'channel_config',
                description: '是否启用顺序转发模式',
                default: 'false'
            }
        ];
        
        // 添加新属性到 channel_attributes 表
        const insertAttribute = db.prepare(`
            INSERT OR IGNORE INTO channel_attributes 
            (attribute_name, attribute_type, attribute_category, description, is_required, default_value) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        let addedCount = 0;
        for (const attr of newAttributes) {
            if (!existingNames.includes(attr.name)) {
                const result = insertAttribute.run(
                    attr.name,
                    attr.type,
                    attr.category,
                    attr.description,
                    0, // is_required = false
                    attr.default
                );
                
                if (result.changes > 0) {
                    addedCount++;
                    console.log(`✅ 添加属性: ${attr.name} (${attr.type})`);
                }
            } else {
                console.log(`⚠️ 属性 ${attr.name} 已存在，跳过`);
            }
        }
        
        // 为现有的频道配置实体设置默认值
        console.log('🔧 为现有配置设置默认值...');
        
        // 获取所有频道配置实体
        const configEntities = db.prepare(`
            SELECT id FROM channel_entities 
            WHERE entity_type = 'channel_config' AND status = 'active'
        `).all();
        
        console.log(`📋 找到 ${configEntities.length} 个现有配置`);
        
        // 获取新属性的ID
        const delaySecondsAttr = db.prepare(`
            SELECT id FROM channel_attributes WHERE attribute_name = 'delay_seconds'
        `).get();
        
        const sequentialModeAttr = db.prepare(`
            SELECT id FROM channel_attributes WHERE attribute_name = 'sequential_mode'
        `).get();
        
        if (!delaySecondsAttr || !sequentialModeAttr) {
            throw new Error('无法找到新添加的属性ID');
        }
        
        // 为每个配置实体添加默认值
        const insertValue = db.prepare(`
            INSERT OR IGNORE INTO channel_values 
            (entity_id, attribute_id, value_integer, value_boolean, updated_at) 
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        
        let updatedCount = 0;
        for (const entity of configEntities) {
            // 添加 delay_seconds 默认值 (0)
            const delayResult = insertValue.run(
                entity.id,
                delaySecondsAttr.id,
                0, // delay_seconds = 0
                null
            );
            
            // 添加 sequential_mode 默认值 (false)
            const sequentialResult = insertValue.run(
                entity.id,
                sequentialModeAttr.id,
                null,
                0 // sequential_mode = false (0)
            );
            
            if (delayResult.changes > 0 || sequentialResult.changes > 0) {
                updatedCount++;
            }
        }
        
        console.log(`✅ 迁移完成！`);
        console.log(`📊 统计信息:`);
        console.log(`   - 新增属性: ${addedCount} 个`);
        console.log(`   - 更新配置: ${updatedCount} 个`);
        console.log(`   - 总配置数: ${configEntities.length} 个`);
        
        // 验证迁移结果
        console.log('🔍 验证迁移结果...');
        const verifyQuery = db.prepare(`
            SELECT 
                e.id,
                e.entity_name,
                delay_val.value_integer as delay_seconds,
                seq_val.value_boolean as sequential_mode
            FROM channel_entities e
            LEFT JOIN channel_values delay_val ON e.id = delay_val.entity_id AND delay_val.attribute_id = ?
            LEFT JOIN channel_values seq_val ON e.id = seq_val.entity_id AND seq_val.attribute_id = ?
            WHERE e.entity_type = 'channel_config' AND e.status = 'active'
            LIMIT 3
        `);
        
        const sampleConfigs = verifyQuery.all(delaySecondsAttr.id, sequentialModeAttr.id);
        console.log('📋 示例配置验证:');
        for (const config of sampleConfigs) {
            console.log(`   ${config.entity_name}: delay=${config.delay_seconds}, sequential=${config.sequential_mode}`);
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ 迁移失败:', error);
        return false;
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    migrateDelayFields()
        .then(success => {
            console.log(success ? '✅ 迁移成功完成' : '❌ 迁移失败');
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ 迁移过程中发生错误:', error);
            process.exit(1);
        });
}

module.exports = { migrateDelayFields }; 