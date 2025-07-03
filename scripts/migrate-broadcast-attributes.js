const { getChannelDatabase } = require('../config/channelDatabase');

/**
 * 数据库迁移脚本：添加播报功能属性
 * 为现有的频道配置数据库添加 broadcast_enabled 和 broadcast_target_groups 属性
 */
async function migrateBroadcastAttributes() {
    console.log('🔧 开始迁移：添加播报功能属性...');
    
    try {
        const db = getChannelDatabase();
        
        // 检查是否已经存在这些属性
        const existingAttributes = db.prepare(`
            SELECT attribute_name FROM channel_attributes 
            WHERE attribute_name IN ('broadcast_enabled', 'broadcast_target_groups')
        `).all();
        
        const existingNames = existingAttributes.map(attr => attr.attribute_name);
        console.log('📋 已存在的播报属性:', existingNames);
        
        // 准备要添加的新属性
        const newAttributes = [
            {
                name: 'broadcast_enabled',
                type: 'boolean',
                category: 'channel_config',
                description: '是否启用播报功能',
                default: 'false'
            },
            {
                name: 'broadcast_target_groups',
                type: 'json',
                category: 'channel_config',
                description: '播报目标群组列表',
                default: '[]'
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
                    console.log(`✅ 添加播报属性: ${attr.name} (${attr.type})`);
                }
            } else {
                console.log(`⚠️ 播报属性 ${attr.name} 已存在，跳过`);
            }
        }
        
        // 为现有的频道配置实体设置默认值
        console.log('🔧 为现有配置设置播报功能默认值...');
        
        // 获取所有频道配置实体
        const configEntities = db.prepare(`
            SELECT id FROM channel_entities 
            WHERE entity_type = 'channel_config' AND status = 'active'
        `).all();
        
        console.log(`📋 找到 ${configEntities.length} 个现有配置`);
        
        // 获取新属性的ID
        const broadcastEnabledAttr = db.prepare(`
            SELECT id FROM channel_attributes WHERE attribute_name = 'broadcast_enabled'
        `).get();
        
        const broadcastTargetGroupsAttr = db.prepare(`
            SELECT id FROM channel_attributes WHERE attribute_name = 'broadcast_target_groups'
        `).get();
        
        if (!broadcastEnabledAttr || !broadcastTargetGroupsAttr) {
            throw new Error('无法找到新添加的播报属性ID');
        }
        
        // 为每个配置实体添加默认值
        const insertValue = db.prepare(`
            INSERT OR IGNORE INTO channel_values 
            (entity_id, attribute_id, value_boolean, value_json, updated_at) 
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        
        let updatedCount = 0;
        for (const entity of configEntities) {
            try {
                // 设置 broadcast_enabled 为 false (0)
                const result1 = insertValue.run(
                    entity.id,
                    broadcastEnabledAttr.id,
                    0, // false
                    null
                );
                
                // 设置 broadcast_target_groups 为空数组 []
                const result2 = insertValue.run(
                    entity.id,
                    broadcastTargetGroupsAttr.id,
                    null,
                    '[]'
                );
                
                if (result1.changes > 0 || result2.changes > 0) {
                    updatedCount++;
                }
            } catch (error) {
                console.warn(`⚠️ 为实体 ${entity.id} 设置播报默认值时出错:`, error.message);
            }
        }
        
        console.log(`✅ 播报功能迁移完成！`);
        console.log(`   - 新增播报属性: ${addedCount} 个`);
        console.log(`   - 更新配置实体: ${updatedCount} 个`);
        
        // 验证迁移结果
        console.log('🔍 验证迁移结果...');
        const verificationQuery = db.prepare(`
            SELECT 
                e.id as entity_id,
                e.entity_name,
                (SELECT v1.value_boolean FROM channel_values v1 
                 WHERE v1.entity_id = e.id AND v1.attribute_id = ?) as broadcast_enabled,
                (SELECT v2.value_json FROM channel_values v2 
                 WHERE v2.entity_id = e.id AND v2.attribute_id = ?) as broadcast_target_groups
            FROM channel_entities e 
            WHERE e.entity_type = 'channel_config' AND e.status = 'active'
            LIMIT 3
        `);
        
        const verificationResults = verificationQuery.all(
            broadcastEnabledAttr.id,
            broadcastTargetGroupsAttr.id
        );
        
        console.log('📊 验证结果示例:');
        for (const result of verificationResults) {
            console.log(`   - 配置 "${result.entity_name}": 播报启用=${result.broadcast_enabled}, 目标群组=${result.broadcast_target_groups}`);
        }
        
        return {
            success: true,
            addedAttributes: addedCount,
            updatedEntities: updatedCount
        };
        
    } catch (error) {
        console.error('❌ 播报功能迁移失败:', error);
        throw error;
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    migrateBroadcastAttributes()
        .then((result) => {
            console.log('🎉 播报功能迁移脚本执行完成!', result);
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 播报功能迁移脚本执行失败:', error);
            process.exit(1);
        });
}

module.exports = { migrateBroadcastAttributes }; 