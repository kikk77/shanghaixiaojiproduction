const { getChannelDatabase } = require('../config/channelDatabase');

/**
 * 生产环境数据库迁移脚本：添加延时转发和顺序模式字段
 * 专门用于生产环境的现有配置数据迁移
 */
async function migrateProductionDelayFields() {
    console.log('🚀 开始生产环境迁移：添加延时转发和顺序模式字段...');
    
    try {
        const db = getChannelDatabase();
        
        // 1. 首先确保新属性存在于 channel_attributes 表中
        console.log('🔧 Step 1: 确保新属性定义存在...');
        
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
        
        const insertAttribute = db.prepare(`
            INSERT OR IGNORE INTO channel_attributes 
            (attribute_name, attribute_type, attribute_category, description, is_required, default_value) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        let addedAttributeCount = 0;
        for (const attr of newAttributes) {
            const result = insertAttribute.run(
                attr.name,
                attr.type,
                attr.category,
                attr.description,
                0, // is_required = false
                attr.default
            );
            
            if (result.changes > 0) {
                addedAttributeCount++;
                console.log(`✅ 添加新属性: ${attr.name}`);
            } else {
                console.log(`ℹ️ 属性 ${attr.name} 已存在`);
            }
        }
        
        // 2. 获取属性ID
        console.log('🔧 Step 2: 获取属性ID...');
        
        const delaySecondsAttr = db.prepare(`
            SELECT id FROM channel_attributes WHERE attribute_name = 'delay_seconds'
        `).get();
        
        const sequentialModeAttr = db.prepare(`
            SELECT id FROM channel_attributes WHERE attribute_name = 'sequential_mode'
        `).get();
        
        if (!delaySecondsAttr || !sequentialModeAttr) {
            throw new Error('无法找到必要的属性定义');
        }
        
        console.log(`✅ delay_seconds 属性ID: ${delaySecondsAttr.id}`);
        console.log(`✅ sequential_mode 属性ID: ${sequentialModeAttr.id}`);
        
        // 3. 查找所有现有的频道配置
        console.log('🔧 Step 3: 查找现有配置...');
        
        const configEntities = db.prepare(`
            SELECT id, entity_name, created_at FROM channel_entities 
            WHERE entity_type = 'channel_config' AND status = 'active'
            ORDER BY created_at DESC
        `).all();
        
        console.log(`📋 找到 ${configEntities.length} 个现有配置`);
        
        if (configEntities.length === 0) {
            console.log('⚠️ 没有找到需要迁移的配置');
            return true;
        }
        
        // 显示现有配置列表
        configEntities.forEach((config, index) => {
            console.log(`   ${index + 1}. ID: ${config.id}, 名称: ${config.entity_name || '未命名'}, 创建时间: ${config.created_at}`);
        });
        
        // 4. 检查每个配置是否已经有延时字段的值
        console.log('🔧 Step 4: 检查现有配置的延时字段状态...');
        
        const checkExistingValues = db.prepare(`
            SELECT entity_id, attribute_id FROM channel_values 
            WHERE entity_id = ? AND attribute_id IN (?, ?)
        `);
        
        let configsNeedUpdate = [];
        
        for (const config of configEntities) {
            const existingValues = checkExistingValues.all(
                config.id, 
                delaySecondsAttr.id, 
                sequentialModeAttr.id
            );
            
            const hasDelaySeconds = existingValues.some(v => v.attribute_id === delaySecondsAttr.id);
            const hasSequentialMode = existingValues.some(v => v.attribute_id === sequentialModeAttr.id);
            
            if (!hasDelaySeconds || !hasSequentialMode) {
                configsNeedUpdate.push({
                    ...config,
                    needsDelaySeconds: !hasDelaySeconds,
                    needsSequentialMode: !hasSequentialMode
                });
                
                console.log(`⚠️ 配置 "${config.entity_name}" (ID: ${config.id}) 缺少字段: ${
                    [
                        !hasDelaySeconds ? 'delay_seconds' : null,
                        !hasSequentialMode ? 'sequential_mode' : null
                    ].filter(Boolean).join(', ')
                }`);
            } else {
                console.log(`✅ 配置 "${config.entity_name}" (ID: ${config.id}) 已有完整字段`);
            }
        }
        
        if (configsNeedUpdate.length === 0) {
            console.log('✅ 所有配置都已包含延时字段，无需迁移');
            return true;
        }
        
        // 5. 为需要更新的配置添加缺失的字段
        console.log(`🔧 Step 5: 为 ${configsNeedUpdate.length} 个配置添加缺失字段...`);
        
        const insertValue = db.prepare(`
            INSERT OR REPLACE INTO channel_values 
            (entity_id, attribute_id, value_integer, value_boolean, created_at, updated_at) 
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        
        let successCount = 0;
        
        // 使用事务确保数据一致性
        const transaction = db.transaction(() => {
            for (const config of configsNeedUpdate) {
                let configSuccess = true;
                
                try {
                    // 添加 delay_seconds 字段
                    if (config.needsDelaySeconds) {
                        const delayResult = insertValue.run(
                            config.id,
                            delaySecondsAttr.id,
                            0, // 默认值 0 秒
                            null
                        );
                        console.log(`   ✅ 为配置 "${config.entity_name}" 添加 delay_seconds = 0`);
                    }
                    
                    // 添加 sequential_mode 字段
                    if (config.needsSequentialMode) {
                        const sequentialResult = insertValue.run(
                            config.id,
                            sequentialModeAttr.id,
                            null,
                            0 // 默认值 false (0)
                        );
                        console.log(`   ✅ 为配置 "${config.entity_name}" 添加 sequential_mode = false`);
                    }
                    
                    if (configSuccess) {
                        successCount++;
                    }
                    
                } catch (error) {
                    console.error(`   ❌ 配置 "${config.entity_name}" 迁移失败:`, error.message);
                    configSuccess = false;
                }
            }
        });
        
        transaction();
        
        // 6. 验证迁移结果
        console.log('🔧 Step 6: 验证迁移结果...');
        
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
            ORDER BY e.created_at DESC
        `);
        
        const verificationResults = verifyQuery.all(delaySecondsAttr.id, sequentialModeAttr.id);
        
        console.log('📋 迁移结果验证:');
        let verifiedCount = 0;
        for (const result of verificationResults) {
            const isComplete = result.delay_seconds !== null && result.sequential_mode !== null;
            console.log(`   ${isComplete ? '✅' : '❌'} ${result.entity_name || '未命名'} (ID: ${result.id}): delay=${result.delay_seconds}, sequential=${result.sequential_mode}`);
            if (isComplete) verifiedCount++;
        }
        
        // 7. 输出最终统计
        console.log('🎉 迁移完成！');
        console.log('📊 统计信息:');
        console.log(`   - 总配置数: ${configEntities.length}`);
        console.log(`   - 需要迁移: ${configsNeedUpdate.length}`);
        console.log(`   - 成功迁移: ${successCount}`);
        console.log(`   - 验证通过: ${verifiedCount}`);
        console.log(`   - 新增属性: ${addedAttributeCount}`);
        
        const allSuccess = verifiedCount === configEntities.length;
        console.log(`${allSuccess ? '✅' : '⚠️'} 迁移${allSuccess ? '完全成功' : '部分成功'}`);
        
        return allSuccess;
        
    } catch (error) {
        console.error('❌ 生产环境迁移失败:', error);
        console.error('错误堆栈:', error.stack);
        return false;
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    console.log('🚀 启动生产环境数据库迁移...');
    console.log('环境:', process.env.NODE_ENV || 'development');
    console.log('Railway环境:', process.env.RAILWAY_ENVIRONMENT_NAME || 'none');
    
    migrateProductionDelayFields()
        .then(success => {
            if (success) {
                console.log('🎉 生产环境迁移成功完成！');
                console.log('现在可以正常使用延时转发和顺序模式功能了。');
            } else {
                console.log('❌ 生产环境迁移失败，请检查错误信息');
            }
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ 迁移过程中发生未捕获错误:', error);
            process.exit(1);
        });
}

module.exports = { migrateProductionDelayFields }; 