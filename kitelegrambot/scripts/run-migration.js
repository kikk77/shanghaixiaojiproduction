#!/usr/bin/env node

/**
 * 手动运行数据库迁移脚本
 * 用于在Railway控制台或命令行直接执行
 */

const { migrateProductionDelayFields } = require('./production-migrate-delay-fields');

console.log('🔧 手动执行数据库迁移...');
console.log('当前环境:', process.env.NODE_ENV || 'development');
console.log('Railway环境:', process.env.RAILWAY_ENVIRONMENT_NAME || 'none');

migrateProductionDelayFields()
    .then(success => {
        if (success) {
            console.log('🎉 数据库迁移成功完成！');
            console.log('✅ 现在延时转发功能应该可以正常工作了');
        } else {
            console.log('⚠️ 数据库迁移完成，但可能有警告');
        }
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ 数据库迁移失败:', error);
        process.exit(1);
    }); 