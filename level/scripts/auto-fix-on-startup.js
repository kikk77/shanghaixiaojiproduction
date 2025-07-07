/**
 * 应用启动时自动修复等级系统
 * 在app.js启动时调用，确保等级系统正常工作
 */

const ProductionLevelSystemFix = require('./fix-production-level-system');

class AutoFixOnStartup {
    static async fix() {
        // 只有在启用等级系统时才执行修复
        if (process.env.LEVEL_SYSTEM_ENABLED !== 'true') {
            console.log('🏆 等级系统未启用，跳过自动修复');
            return;
        }
        
        console.log('🔧 启动时检查等级系统...');
        
        try {
            // 检查等级系统是否需要修复
            const needsFix = await this.checkIfNeedsFix();
            
            if (needsFix) {
                console.log('⚠️  检测到等级系统需要修复，开始自动修复...');
                const fixer = new ProductionLevelSystemFix();
                await fixer.fix();
                console.log('✅ 等级系统自动修复完成');
            } else {
                console.log('✅ 等级系统状态正常');
            }
            
        } catch (error) {
            console.error('❌ 等级系统自动修复失败:', error);
            console.log('⚠️  等级系统将继续尝试启动，但可能存在问题');
        }
    }
    
    static async checkIfNeedsFix() {
        try {
            const levelDbManager = require('../config/levelDatabase');
            const levelDb = levelDbManager.getInstance();
            
            // 如果数据库管理器禁用了，说明需要修复
            if (!levelDb.enabled) {
                return true;
            }
            
            const db = levelDb.getDatabase();
            if (!db) {
                return true;
            }
            
            // 检查关键表是否存在
            const tables = ['user_levels', 'group_configs', 'badge_definitions'];
            for (const table of tables) {
                const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
                if (!result) {
                    console.log(`⚠️  表 ${table} 不存在`);
                    return true;
                }
            }
            
            // 检查是否有配置数据
            const configCount = db.prepare('SELECT COUNT(*) as count FROM group_configs').get();
            if (configCount.count === 0) {
                console.log('⚠️  缺少群组配置数据');
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.log('⚠️  检查等级系统时出错:', error.message);
            return true;
        }
    }
}

module.exports = AutoFixOnStartup; 