/**
 * 等级系统初始化脚本
 * 基于版本A设计：独立初始化，不影响现有系统
 */

class LevelSystemInitializer {
    constructor() {
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
    }
    
    async initialize() {
        if (!this.enabled) {
            console.log('🏆 等级系统未启用，跳过初始化');
            return;
        }
        
        console.log('🏆 初始化等级系统...');
        
        try {
            const levelDbManager = require('../config/levelDatabase');
            const levelDb = levelDbManager.getInstance();
            
            if (!levelDb.enabled) {
                console.log('❌ 等级系统数据库未启用');
                return;
            }
            
            // 检查是否有群组配置，如果没有则创建默认配置
            await this.ensureGroupConfig(levelDb);
            
            // 初始化默认勋章
            await this.initializeDefaultBadges(levelDb);
            
            // 插入系统元信息
            await this.insertSystemMeta(levelDb);
            
            console.log('✅ 等级系统初始化完成');
        } catch (error) {
            console.error('❌ 等级系统初始化失败:', error);
            // 不影响主系统启动（版本A要求）
        }
    }
    
    async ensureGroupConfig(levelDb) {
        const db = levelDb.getDatabase();
        if (!db) return;
        
        // 检查是否已有群组配置
        const existingConfigs = db.prepare(`
            SELECT COUNT(*) as count FROM group_configs 
            WHERE status = 'active'
        `).get();
        
        if (existingConfigs.count > 0) {
            console.log(`✅ 已有 ${existingConfigs.count} 个群组配置，跳过默认配置创建`);
            return;
        }
        
        console.log('🏆 没有找到群组配置，创建默认配置以确保系统正常工作');
        
        // 只有在没有任何群组配置时才创建默认配置
        const defaultConfig = {
            group_id: 'default',
            group_name: '默认配置',
            level_config: JSON.stringify({
                levels: [
                    { level: 1, name: "新手勇士 🟢", required_evals: 0, required_exp: 0 },
                    { level: 2, name: "初级勇士 🔵", required_evals: 3, required_exp: 50 },
                    { level: 3, name: "中级勇士 🟣", required_evals: 8, required_exp: 150 },
                    { level: 4, name: "高级勇士 🟠", required_evals: 15, required_exp: 300 },
                    { level: 5, name: "专家勇士 🔴", required_evals: 25, required_exp: 500 },
                    { level: 6, name: "大师勇士 🟡", required_evals: 40, required_exp: 750 },
                    { level: 7, name: "传说勇士 ⚪", required_evals: 60, required_exp: 1050 },
                    { level: 8, name: "史诗勇士 🟤", required_evals: 85, required_exp: 1400 },
                    { level: 9, name: "神话勇士 ⚫", required_evals: 120, required_exp: 1800 },
                    { level: 10, name: "至尊勇士 🌟", required_evals: 160, required_exp: 2250 }
                ],
                max_level: 10,
                customizable: true,
                version: "1.0"
            }),
            points_config: JSON.stringify({
                base_rewards: {
                    attack: { exp: 20, points: 10, desc: "完成出击" },
                    user_eval_12: { exp: 30, points: 25, desc: "完成12项按钮评价" },
                    merchant_eval: { exp: 25, points: 20, desc: "商家评价用户" },
                    text_eval: { exp: 15, points: 15, desc: "文字详细评价" },
                    level_up_bonus: { exp: 0, points: 50, desc: "升级奖励" },
                    evaluate_merchant: { exp: 30, points: 25, desc: "评价商家" },
                    evaluate_user: { exp: 25, points: 20, desc: "评价用户" },
                    be_evaluated: { exp: 15, points: 10, desc: "被评价" },
                    manual_grant: { exp: 0, points: 0, desc: "手动奖励" }
                },
                special_rewards: {
                    perfect_score: { exp: 50, points: 100, desc: "获得满分评价" },
                    first_evaluation: { exp: 10, points: 20, desc: "首次评价" },
                    daily_active: { exp: 5, points: 5, desc: "每日活跃" }
                },
                milestones: [100, 500, 1000, 2000, 5000, 10000]
            }),
            broadcast_config: JSON.stringify({
                enabled: true,
                level_up: true,
                badge_unlock: true,
                points_milestone: false,
                auto_pin: true,
                auto_delete_time: 0
            }),
            broadcast_enabled: 1,
            status: 'active'
        };
        
        try {
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO group_configs 
                (group_id, group_name, level_config, points_config, broadcast_config, broadcast_enabled, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run(
                defaultConfig.group_id, 
                defaultConfig.group_name, 
                defaultConfig.level_config, 
                defaultConfig.points_config,
                defaultConfig.broadcast_config,
                defaultConfig.broadcast_enabled,
                defaultConfig.status
            );
            
            console.log('✅ 默认群组配置创建成功');
        } catch (err) {
            console.error('创建默认群组配置失败:', err);
            throw err;
        }
    }
    
    async initializeDefaultBadges(levelDb) {
        const db = levelDb.getDatabase();
        if (!db) return;
        
        const defaultBadges = [
            {
                badge_id: "first_blood",
                badge_name: "首次出击",
                badge_emoji: "🥇",
                badge_desc: "完成第一次出击",
                badge_type: "auto",
                rarity: "common",
                unlock_conditions: JSON.stringify({
                    type: "stat_based",
                    field: "attack_count",
                    operator: ">=",
                    target: 1
                })
            },
            {
                badge_id: "evaluation_novice",
                badge_name: "评价新手",
                badge_emoji: "📝",
                badge_desc: "完成10次用户评价",
                badge_type: "auto",
                rarity: "common",
                unlock_conditions: JSON.stringify({
                    type: "stat_based",
                    field: "user_eval_count",
                    operator: ">=",
                    target: 10
                })
            },
            {
                badge_id: "experience_hunter",
                badge_name: "经验猎手",
                badge_emoji: "⭐",
                badge_desc: "累计经验值达到1000",
                badge_type: "auto",
                rarity: "rare",
                unlock_conditions: JSON.stringify({
                    type: "stat_based",
                    field: "total_exp",
                    operator: ">=",
                    target: 1000
                })
            },
            {
                badge_id: "points_collector",
                badge_name: "积分收集家",
                badge_emoji: "💰",
                badge_desc: "累计获得积分1000",
                badge_type: "auto",
                rarity: "rare",
                unlock_conditions: JSON.stringify({
                    type: "stat_based",
                    field: "total_points_earned",
                    operator: ">=",
                    target: 1000
                })
            },
            {
                badge_id: "level_master",
                badge_name: "等级大师",
                badge_emoji: "🌟",
                badge_desc: "达到5级",
                badge_type: "auto",
                rarity: "epic",
                unlock_conditions: JSON.stringify({
                    type: "stat_based",
                    field: "level",
                    operator: ">=",
                    target: 5
                })
            },
            {
                badge_id: "perfect_score",
                badge_name: "完美评价",
                badge_emoji: "💯",
                badge_desc: "获得满分评价",
                badge_type: "auto",
                rarity: "epic",
                unlock_conditions: JSON.stringify({
                    type: "evaluation_streak",
                    evaluation_type: "merchant_eval",
                    score: 10,
                    count: 1,
                    consecutive: false
                })
            },
            {
                badge_id: "admin_choice",
                badge_name: "管理员之选",
                badge_emoji: "🎖️",
                badge_desc: "管理员特别授予的荣誉勋章",
                badge_type: "manual",
                rarity: "legendary",
                unlock_conditions: JSON.stringify({
                    type: "admin_only",
                    desc: "仅管理员可授予"
                })
            }
        ];
        
        // 不再依赖环境变量，勋章将通过管理员面板手动创建
        console.log('🏆 勋章系统初始化完成，请通过管理员面板手动添加勋章配置');
        return;
        
        // 批量插入勋章（使用better-sqlite3的事务）
        const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO badge_definitions 
            (group_id, badge_id, badge_name, badge_emoji, badge_desc, 
             badge_type, rarity, unlock_conditions, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `);
        
        const insertMany = db.transaction((badges) => {
            for (const badge of badges) {
                insertStmt.run(
                    groupId, badge.badge_id, badge.badge_name, badge.badge_emoji,
                    badge.badge_desc, badge.badge_type, badge.rarity, badge.unlock_conditions
                );
            }
        });
        
        try {
            insertMany(defaultBadges);
            console.log('✅ 默认勋章初始化完成');
        } catch (error) {
            console.error('❌ 勋章初始化失败:', error);
        }
    }
    
    async insertSystemMeta(levelDb) {
        const db = levelDb.getDatabase();
        if (!db) return;
        
        const metaData = [
            { key: 'system_version', value: '1.0.0', description: '等级系统版本' },
            { key: 'initialized_at', value: new Date().toISOString(), description: '初始化时间' },
            { key: 'database_version', value: '1', description: '数据库架构版本' }
        ];
        
        const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO level_meta (key, value, description)
            VALUES (?, ?, ?)
        `);
        
        const insertMany = db.transaction((metas) => {
            for (const meta of metas) {
                insertStmt.run(meta.key, meta.value, meta.description);
            }
        });
        
        try {
            insertMany(metaData);
            console.log('✅ 系统元信息插入完成');
        } catch (error) {
            console.error('❌ 元信息插入失败:', error);
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const initializer = new LevelSystemInitializer();
    initializer.initialize().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('初始化失败:', error);
        process.exit(1);
    });
}

module.exports = LevelSystemInitializer; 