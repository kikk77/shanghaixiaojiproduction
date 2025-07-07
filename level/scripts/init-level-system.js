/**
 * 等级系统初始化脚本
 * 基于版本A设计：独立初始化，不影响现有系统
 */

const path = require('path');
const fs = require('fs');

class LevelSystemInitializer {
    constructor() {
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
    }
    
    async initialize() {
        if (!this.enabled) {
            console.log('🏆 等级系统未启用，跳过初始化');
            return;
        }
        
        console.log('🏆 开始初始化等级系统...');
        
        try {
            const levelDbManager = require('../config/levelDatabase');
            const levelDb = levelDbManager.getInstance();
            
            if (!levelDb.enabled) {
                console.log('🏆 等级系统数据库未启用');
                return;
            }
            
            await this.createTables(levelDb);
            await this.createDefaultGroupConfig(levelDb);
            await this.initializeDefaultBadges(levelDb);
            
            console.log('✅ 等级系统初始化完成');
        } catch (error) {
            console.error('❌ 等级系统初始化失败:', error);
        }
    }
    
    async createTables(levelDb) {
        const db = levelDb.getDatabase();
        if (!db) return;
        
        // 1. 等级系统元信息表
        db.exec(`
            CREATE TABLE IF NOT EXISTS level_meta (
                key TEXT PRIMARY KEY,
                value TEXT,
                description TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        // 2. 用户等级数据表（简化：以用户ID为主键）
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_levels (
                user_id INTEGER PRIMARY KEY,
                level INTEGER DEFAULT 1,
                total_exp INTEGER DEFAULT 0,
                available_points INTEGER DEFAULT 0,
                total_points_earned INTEGER DEFAULT 0,
                total_points_spent INTEGER DEFAULT 0,
                attack_count INTEGER DEFAULT 0,
                user_eval_count INTEGER DEFAULT 0,
                merchant_eval_count INTEGER DEFAULT 0,
                text_eval_count INTEGER DEFAULT 0,
                badges TEXT DEFAULT '[]',
                display_name TEXT,
                last_milestone_points INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        // 3. 积分变更日志表（保留group_id用于记录来源）
        db.exec(`
            CREATE TABLE IF NOT EXISTS points_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                source_group_id TEXT, -- 记录积分来源群组，可为空
                action_type TEXT NOT NULL,
                exp_change INTEGER DEFAULT 0,
                points_change INTEGER DEFAULT 0,
                exp_after INTEGER NOT NULL,
                points_after INTEGER NOT NULL,
                description TEXT,
                related_eval_id INTEGER,
                admin_id INTEGER,
                timestamp INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        // 4. 群组配置表（保留，用于播报设置和奖励规则）
        db.exec(`
            CREATE TABLE IF NOT EXISTS group_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id TEXT NOT NULL UNIQUE,
                group_name TEXT,
                level_config TEXT,
                points_config TEXT,
                broadcast_config TEXT,
                broadcast_enabled INTEGER DEFAULT 1,
                status TEXT DEFAULT 'active',
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);
        
        // 5. 勋章定义表（保留group_id用于不同群组的勋章配置）
        db.exec(`
            CREATE TABLE IF NOT EXISTS badge_definitions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                badge_id TEXT NOT NULL,
                group_id TEXT NOT NULL DEFAULT 'global',
                badge_name TEXT NOT NULL,
                badge_emoji TEXT DEFAULT '🏆',
                badge_desc TEXT,
                unlock_conditions TEXT,
                badge_type TEXT DEFAULT 'auto',
                rarity TEXT DEFAULT 'common',
                status TEXT DEFAULT 'active',
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                UNIQUE(badge_id, group_id)
            )
        `);
        
        // 6. 勋章获得记录表（简化：不依赖群组）
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_badges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                badge_id TEXT NOT NULL,
                source_group_id TEXT, -- 记录勋章来源群组，可为空
                awarded_by TEXT DEFAULT 'system',
                awarded_reason TEXT,
                awarded_at INTEGER DEFAULT (strftime('%s', 'now')),
                UNIQUE(user_id, badge_id)
            )
        `);
        
        // 创建索引
        db.exec(`CREATE INDEX IF NOT EXISTS idx_user_levels_level ON user_levels(level DESC)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_user_levels_points ON user_levels(available_points DESC)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_points_log_user_time ON points_log(user_id, timestamp DESC)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_group_configs_group_id ON group_configs(group_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_badge_definitions_group ON badge_definitions(group_id, status)`);
        
        console.log('✅ 数据库表创建完成');
    }
    
    async createDefaultGroupConfig(levelDb) {
        const db = levelDb.getDatabase();
        if (!db) return;
        
        try {
            // 创建全局配置
            const globalConfig = {
                group_id: 'global',
                group_name: '全局配置',
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
                    ]
                }),
                points_config: JSON.stringify({
                    base_rewards: {
                        attack: { exp: 20, points: 10, desc: "完成出击" },
                        user_eval: { exp: 30, points: 25, desc: "完成用户评价" },
                        merchant_eval: { exp: 25, points: 20, desc: "商家评价用户" },
                        text_eval: { exp: 15, points: 15, desc: "文字详细评价" },
                        level_up_bonus: { exp: 0, points: 50, desc: "升级奖励" }
                    }
                }),
                broadcast_config: JSON.stringify({
                    level_up: true,
                    badge_unlock: true,
                    points_milestone: false
                }),
                broadcast_enabled: 0, // 全局配置不播报
                status: 'active'
            };
            
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO group_configs 
                (group_id, group_name, level_config, points_config, broadcast_config, broadcast_enabled, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run(
                globalConfig.group_id,
                globalConfig.group_name,
                globalConfig.level_config,
                globalConfig.points_config,
                globalConfig.broadcast_config,
                globalConfig.broadcast_enabled,
                globalConfig.status
            );
            
            // 如果有环境变量指定的群组，也创建配置
            const envGroupId = process.env.GROUP_CHAT_ID;
            if (envGroupId && envGroupId !== 'global') {
                const envGroupConfig = {
                    ...globalConfig,
                    group_id: envGroupId,
                    group_name: '主群组',
                    broadcast_enabled: 1 // 主群组启用播报
                };
                
                stmt.run(
                    envGroupConfig.group_id,
                    envGroupConfig.group_name,
                    envGroupConfig.level_config,
                    envGroupConfig.points_config,
                    envGroupConfig.broadcast_config,
                    envGroupConfig.broadcast_enabled,
                    envGroupConfig.status
                );
            }
            
            console.log('✅ 默认群组配置创建完成');
        } catch (error) {
            console.error('创建默认群组配置失败:', error);
        }
    }
    
    async initializeDefaultBadges(levelDb) {
        const db = levelDb.getDatabase();
        if (!db) return;
        
        try {
            const defaultBadges = [
                {
                    badge_id: "first_attack",
                    group_id: "global",
                    badge_name: "初次出击",
                    badge_emoji: "⚡",
                    badge_desc: "完成第一次出击",
                    unlock_conditions: JSON.stringify({
                        type: "stat_based",
                        field: "attack_count",
                        target: 1
                    }),
                    rarity: "common"
                },
                {
                    badge_id: "evaluation_novice",
                    group_id: "global",
                    badge_name: "评价新手",
                    badge_emoji: "📝",
                    badge_desc: "完成10次用户评价",
                    unlock_conditions: JSON.stringify({
                        type: "stat_based",
                        field: "user_eval_count",
                        target: 10
                    }),
                    rarity: "common"
                },
                {
                    badge_id: "experience_hunter",
                    group_id: "global",
                    badge_name: "经验猎手",
                    badge_emoji: "⭐",
                    badge_desc: "累计经验值达到1000",
                    unlock_conditions: JSON.stringify({
                        type: "stat_based",
                        field: "total_exp",
                        target: 1000
                    }),
                    rarity: "rare"
                },
                {
                    badge_id: "points_collector",
                    group_id: "global",
                    badge_name: "积分收集家",
                    badge_emoji: "💰",
                    badge_desc: "累计获得积分1000",
                    unlock_conditions: JSON.stringify({
                        type: "stat_based",
                        field: "total_points_earned",
                        target: 1000
                    }),
                    rarity: "rare"
                },
                {
                    badge_id: "level_master",
                    group_id: "global",
                    badge_name: "等级大师",
                    badge_emoji: "🌟",
                    badge_desc: "达到5级",
                    unlock_conditions: JSON.stringify({
                        type: "stat_based",
                        field: "level",
                        target: 5
                    }),
                    rarity: "epic"
                }
            ];
            
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO badge_definitions 
                (badge_id, group_id, badge_name, badge_emoji, badge_desc, unlock_conditions, rarity, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
            `);
            
            for (const badge of defaultBadges) {
                stmt.run(
                    badge.badge_id,
                    badge.group_id,
                    badge.badge_name,
                    badge.badge_emoji,
                    badge.badge_desc,
                    badge.unlock_conditions,
                    badge.rarity
                );
            }
            
            console.log('✅ 默认勋章初始化完成');
        } catch (error) {
            console.error('初始化默认勋章失败:', error);
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const initializer = new LevelSystemInitializer();
    initializer.initialize().then(() => {
        console.log('初始化脚本执行完成');
        process.exit(0);
    }).catch(error => {
        console.error('初始化脚本执行失败:', error);
        process.exit(1);
    });
}

module.exports = LevelSystemInitializer; 