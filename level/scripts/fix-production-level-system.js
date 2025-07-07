#!/usr/bin/env node

/**
 * 修复生产环境等级系统
 * 确保数据库正确初始化并创建必要的配置
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class ProductionLevelSystemFix {
    constructor() {
        // 确定数据库路径
        const nodeEnv = process.env.NODE_ENV || process.env.RAILWAY_ENVIRONMENT_NAME || 'development';
        const isProduction = nodeEnv === 'production';
        const isStaging = nodeEnv === 'staging';
        
        let dataDir;
        if (isProduction || isStaging) {
            const volumeDataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/app/data';
            const localDataDir = path.join(__dirname, '..', '..', 'data');
            
            try {
                if (fs.existsSync(volumeDataDir)) {
                    fs.accessSync(volumeDataDir, fs.constants.W_OK);
                    dataDir = volumeDataDir;
                    console.log(`🔧 使用Railway Volume路径: ${dataDir}`);
                } else {
                    throw new Error('Volume目录不存在');
                }
            } catch (error) {
                dataDir = localDataDir;
                console.log(`🔧 使用本地数据路径: ${dataDir}`);
            }
        } else {
            dataDir = path.join(__dirname, '..', '..', 'data');
        }
        
        // 确保数据目录存在
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log(`📁 创建数据目录: ${dataDir}`);
        }
        
        // 等级系统数据库文件
        const dbFileName = isProduction ? 'level_system.db' : 'level_system_dev.db';
        this.dbPath = path.join(dataDir, dbFileName);
        
        console.log(`🎯 等级系统数据库路径: ${this.dbPath}`);
        console.log(`🏆 等级系统启用状态: ${process.env.LEVEL_SYSTEM_ENABLED}`);
    }
    
    async fix() {
        console.log('🔧 开始修复生产环境等级系统...');
        
        try {
            // 1. 创建或连接数据库
            const db = await this.createDatabase();
            
            // 2. 创建表结构
            await this.createTables(db);
            
            // 3. 初始化配置数据
            await this.initializeConfigs(db);
            
            // 4. 验证数据库
            await this.verifyDatabase(db);
            
            db.close();
            console.log('✅ 等级系统修复完成！');
            
        } catch (error) {
            console.error('❌ 修复失败:', error);
            throw error;
        }
    }
    
    async createDatabase() {
        console.log('📊 创建/连接等级系统数据库...');
        
        const db = new Database(this.dbPath);
        
        // 启用外键约束和WAL模式
        db.pragma('foreign_keys = ON');
        db.pragma('journal_mode = WAL');
        
        console.log('✅ 数据库连接成功');
        return db;
    }
    
    async createTables(db) {
        console.log('🏗️  创建数据库表结构...');
        
        // 删除旧表（如果存在）
        const oldTables = ['user_levels', 'points_log', 'group_configs', 'badge_definitions', 'user_badges', 'level_meta'];
        for (const table of oldTables) {
            try {
                db.exec(`DROP TABLE IF EXISTS ${table}`);
            } catch (err) {
                // 忽略删除错误
            }
        }
        
        // 创建新的表结构
        const tables = [
            // 1. 等级系统元信息表
            `CREATE TABLE level_meta (
                key TEXT PRIMARY KEY,
                value TEXT,
                description TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )`,
            
            // 2. 用户等级数据表（简化：以用户ID为主键）
            `CREATE TABLE user_levels (
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
            )`,
            
            // 3. 积分变更日志表
            `CREATE TABLE points_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                source_group_id TEXT,
                action_type TEXT NOT NULL,
                exp_change INTEGER DEFAULT 0,
                points_change INTEGER DEFAULT 0,
                exp_after INTEGER NOT NULL,
                points_after INTEGER NOT NULL,
                description TEXT,
                related_eval_id INTEGER,
                admin_id INTEGER,
                timestamp INTEGER DEFAULT (strftime('%s', 'now'))
            )`,
            
            // 4. 群组配置表
            `CREATE TABLE group_configs (
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
            )`,
            
            // 5. 勋章定义表
            `CREATE TABLE badge_definitions (
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
            )`,
            
            // 6. 勋章获得记录表
            `CREATE TABLE user_badges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                badge_id TEXT NOT NULL,
                source_group_id TEXT,
                awarded_by TEXT DEFAULT 'system',
                awarded_reason TEXT,
                awarded_at INTEGER DEFAULT (strftime('%s', 'now')),
                UNIQUE(user_id, badge_id)
            )`
        ];
        
        // 执行创建表
        for (const sql of tables) {
            try {
                db.exec(sql);
                console.log(`✅ 创建表: ${sql.match(/CREATE TABLE (\w+)/)[1]}`);
            } catch (err) {
                console.error(`❌ 创建表失败: ${err.message}`);
                throw err;
            }
        }
        
        // 创建索引
        const indexes = [
            'CREATE INDEX idx_user_levels_level ON user_levels(level DESC)',
            'CREATE INDEX idx_user_levels_points ON user_levels(available_points DESC)',
            'CREATE INDEX idx_points_log_user_time ON points_log(user_id, timestamp DESC)',
            'CREATE INDEX idx_user_badges_user ON user_badges(user_id)',
            'CREATE INDEX idx_group_configs_group_id ON group_configs(group_id)',
            'CREATE INDEX idx_badge_definitions_group ON badge_definitions(group_id, status)'
        ];
        
        for (const sql of indexes) {
            try {
                db.exec(sql);
            } catch (err) {
                console.error(`⚠️  创建索引失败: ${err.message}`);
            }
        }
        
        console.log('✅ 表结构创建完成');
    }
    
    async initializeConfigs(db) {
        console.log('⚙️  初始化配置数据...');
        
        // 1. 创建全局等级配置
        const levelConfig = {
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
        };
        
        // 2. 创建积分奖励配置
        const pointsConfig = {
            base_rewards: {
                attack: { exp: 20, points: 10, desc: "完成出击" },
                user_eval: { exp: 30, points: 25, desc: "完成用户评价" },
                merchant_eval: { exp: 25, points: 20, desc: "商家评价用户" },
                text_eval: { exp: 15, points: 15, desc: "文字详细评价" },
                level_up_bonus: { exp: 0, points: 50, desc: "升级奖励" }
            }
        };
        
        // 3. 创建播报配置
        const broadcastConfig = {
            level_up: true,
            badge_unlock: true,
            points_milestone: false
        };
        
        // 插入全局配置
        const configStmt = db.prepare(`
            INSERT OR REPLACE INTO group_configs 
            (group_id, group_name, level_config, points_config, broadcast_config, broadcast_enabled, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        configStmt.run(
            'global',
            '全局配置',
            JSON.stringify(levelConfig),
            JSON.stringify(pointsConfig),
            JSON.stringify(broadcastConfig),
            0, // 全局配置不播报
            'active'
        );
        
        // 如果有环境变量指定的群组，也创建配置
        const envGroupId = process.env.GROUP_CHAT_ID;
        if (envGroupId && envGroupId !== 'global') {
            configStmt.run(
                envGroupId,
                '主群组',
                JSON.stringify(levelConfig),
                JSON.stringify(pointsConfig),
                JSON.stringify(broadcastConfig),
                1, // 主群组启用播报
                'active'
            );
            console.log(`✅ 创建主群组配置: ${envGroupId}`);
        }
        
        // 4. 创建默认勋章
        const badges = [
            {
                badge_id: "first_attack",
                badge_name: "初次出击",
                badge_emoji: "⚡",
                badge_desc: "完成第一次出击",
                unlock_conditions: JSON.stringify({ type: "stat_based", field: "attack_count", target: 1 }),
                rarity: "common"
            },
            {
                badge_id: "evaluation_novice",
                badge_name: "评价新手",
                badge_emoji: "📝",
                badge_desc: "完成10次用户评价",
                unlock_conditions: JSON.stringify({ type: "stat_based", field: "user_eval_count", target: 10 }),
                rarity: "common"
            },
            {
                badge_id: "points_collector",
                badge_name: "积分收集家",
                badge_emoji: "💰",
                badge_desc: "累计获得1000积分",
                unlock_conditions: JSON.stringify({ type: "stat_based", field: "total_points_earned", target: 1000 }),
                rarity: "rare"
            }
        ];
        
        const badgeStmt = db.prepare(`
            INSERT OR IGNORE INTO badge_definitions 
            (badge_id, group_id, badge_name, badge_emoji, badge_desc, unlock_conditions, rarity, status)
            VALUES (?, 'global', ?, ?, ?, ?, ?, 'active')
        `);
        
        for (const badge of badges) {
            badgeStmt.run(
                badge.badge_id,
                badge.badge_name,
                badge.badge_emoji,
                badge.badge_desc,
                badge.unlock_conditions,
                badge.rarity
            );
        }
        
        console.log('✅ 配置数据初始化完成');
    }
    
    async verifyDatabase(db) {
        console.log('🔍 验证数据库...');
        
        // 检查表是否存在
        const tables = ['user_levels', 'group_configs', 'badge_definitions'];
        for (const table of tables) {
            const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
            if (result) {
                console.log(`✅ 表 ${table} 存在`);
            } else {
                throw new Error(`表 ${table} 不存在`);
            }
        }
        
        // 检查配置数据
        const configCount = db.prepare('SELECT COUNT(*) as count FROM group_configs').get();
        console.log(`✅ 群组配置数量: ${configCount.count}`);
        
        const badgeCount = db.prepare('SELECT COUNT(*) as count FROM badge_definitions').get();
        console.log(`✅ 勋章定义数量: ${badgeCount.count}`);
        
        console.log('✅ 数据库验证通过');
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    // 设置环境变量
    process.env.LEVEL_SYSTEM_ENABLED = 'true';
    
    const fixer = new ProductionLevelSystemFix();
    fixer.fix().then(() => {
        console.log('🎉 修复脚本执行完成');
        process.exit(0);
    }).catch(error => {
        console.error('💥 修复脚本执行失败:', error);
        process.exit(1);
    });
}

module.exports = ProductionLevelSystemFix; 