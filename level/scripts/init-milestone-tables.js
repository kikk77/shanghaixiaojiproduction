/**
 * 初始化里程碑系统数据库表
 */

const path = require('path');

// 设置项目根目录
process.chdir(path.join(__dirname, '../..'));

async function initMilestoneTables() {
    console.log('🎯 开始初始化里程碑系统数据库表...');
    
    try {
        const levelDbManager = require('../config/levelDatabase').getInstance();
        const db = levelDbManager.getDatabase();
        
        if (!db) {
            throw new Error('无法连接到等级系统数据库');
        }
        
        console.log('✅ 数据库连接成功');
        
        // 创建用户里程碑记录表
        console.log('📝 创建 user_milestones 表...');
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_milestones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                group_id TEXT NOT NULL DEFAULT 'global',
                milestone_id TEXT NOT NULL,
                milestone_name TEXT NOT NULL,
                reward_type TEXT NOT NULL,
                reward_amount INTEGER DEFAULT 0,
                extra_exp INTEGER DEFAULT 0,
                achieved_at REAL NOT NULL,
                created_at REAL DEFAULT (strftime('%s', 'now')),
                UNIQUE(user_id, group_id, milestone_id)
            )
        `);
        
        // 创建索引
        console.log('🔍 创建索引...');
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_user_milestones_user_group 
            ON user_milestones(user_id, group_id);
            
            CREATE INDEX IF NOT EXISTS idx_user_milestones_milestone 
            ON user_milestones(milestone_id);
            
            CREATE INDEX IF NOT EXISTS idx_user_milestones_achieved_at 
            ON user_milestones(achieved_at DESC);
        `);
        
        // 检查 group_configs 表是否需要添加 milestone_config 列
        console.log('🔧 检查 group_configs 表结构...');
        const columns = db.prepare("PRAGMA table_info(group_configs)").all();
        const hasMilestoneConfig = columns.some(col => col.name === 'milestone_config');
        
        if (!hasMilestoneConfig) {
            console.log('📝 添加 milestone_config 列到 group_configs 表...');
            db.exec(`
                ALTER TABLE group_configs 
                ADD COLUMN milestone_config TEXT DEFAULT NULL
            `);
        } else {
            console.log('✅ milestone_config 列已存在');
        }
        
        // 初始化默认里程碑配置
        console.log('🎯 初始化默认里程碑配置...');
        const milestoneService = require('../services/milestoneService').getInstance();
        const defaultConfig = milestoneService.getDefaultMilestoneConfig();
        
        // 检查是否已有全局配置
        const existingConfig = db.prepare(`
            SELECT milestone_config FROM group_configs 
            WHERE group_id = 'global'
        `).get();
        
        if (!existingConfig || !existingConfig.milestone_config) {
            // 保存默认配置
            const success = await milestoneService.saveMilestoneConfig('global', defaultConfig);
            if (success) {
                console.log('✅ 默认里程碑配置保存成功');
            } else {
                console.warn('⚠️ 默认里程碑配置保存失败');
            }
        } else {
            console.log('✅ 全局里程碑配置已存在');
        }
        
        // 验证表结构
        console.log('🔍 验证表结构...');
        const milestoneTableInfo = db.prepare("PRAGMA table_info(user_milestones)").all();
        console.log('user_milestones 表结构:');
        milestoneTableInfo.forEach(col => {
            console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
        });
        
        // 测试里程碑功能
        console.log('🧪 测试里程碑功能...');
        const config = await milestoneService.getMilestoneConfig('global');
        if (config && config.milestones) {
            console.log(`✅ 里程碑配置加载成功，共 ${config.milestones.length} 个里程碑`);
            config.milestones.forEach((milestone, index) => {
                console.log(`  ${index + 1}. ${milestone.name} - ${milestone.required_points}积分 - ${milestone.reward_description}`);
            });
        } else {
            console.error('❌ 里程碑配置加载失败');
        }
        
        console.log('🎉 里程碑系统数据库表初始化完成！');
        
    } catch (error) {
        console.error('❌ 初始化里程碑表失败:', error);
        console.error(error.stack);
    }
}

// 运行初始化
if (require.main === module) {
    initMilestoneTables();
}

module.exports = { initMilestoneTables }; 