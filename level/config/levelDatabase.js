const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * 等级系统独立数据库管理器
 * 基于版本A设计：完全独立的数据库文件，与现有系统隔离
 */
class LevelDatabaseManager {
    constructor() {
        // 使用与现有系统相同的路径逻辑，但独立的数据库文件
        const nodeEnv = process.env.NODE_ENV || process.env.RAILWAY_ENVIRONMENT_NAME || 'development';
        const isProduction = nodeEnv === 'production';
        const isStaging = nodeEnv === 'staging';
        
        // 数据目录路径（与现有系统一致）
        let dataDir;
        if (isProduction || isStaging) {
            const volumeDataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/app/data';
            const localDataDir = path.join(__dirname, '..', '..', 'data');
            
            try {
                if (fs.existsSync(volumeDataDir)) {
                    fs.accessSync(volumeDataDir, fs.constants.W_OK);
                    dataDir = volumeDataDir;
                    console.log(`🏆 使用Railway Volume路径: ${dataDir}`);
                } else {
                    throw new Error('Volume目录不存在');
                }
            } catch (error) {
                dataDir = localDataDir;
                console.log(`🏆 使用本地数据路径: ${dataDir}`);
            }
        } else {
            dataDir = path.join(__dirname, '..', '..', 'data');
        }
        
        // 确保数据目录存在
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // 独立的等级系统数据库文件
        const dbFileName = isProduction ? 'level_system.db' : 'level_system_dev.db';
        this.dbPath = path.join(dataDir, dbFileName);
        
        console.log(`🏆 等级系统数据库路径: ${this.dbPath}`);
        
        // 检查是否启用等级系统
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
        if (!this.enabled) {
            console.log('🏆 等级系统已禁用，设置 LEVEL_SYSTEM_ENABLED=true 启用');
            return;
        }
        
        this.initializeDatabase();
    }
    
    initializeDatabase() {
        try {
            // 创建数据库连接（使用better-sqlite3，与现有项目保持一致）
            this.db = new Database(this.dbPath);
            console.log('✅ 等级系统数据库连接成功');
            
            // 启用外键约束和WAL模式（与现有项目保持一致）
            this.db.pragma('foreign_keys = ON');
            this.db.pragma('journal_mode = WAL');
            
            // 创建表结构
            this.createTables();
            
        } catch (error) {
            console.error('❌ 等级系统数据库初始化失败:', error);
            this.enabled = false;
        }
    }
    
    createTables() {
        // 基于版本A的6表设计
        const tables = [
            // 1. 等级系统元信息表
            `CREATE TABLE IF NOT EXISTS level_meta (
                key TEXT PRIMARY KEY,
                value TEXT,
                description TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )`,
            
            // 2. 用户等级数据表（核心表）
            `CREATE TABLE IF NOT EXISTS user_levels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                group_id TEXT NOT NULL DEFAULT 'default',
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
                updated_at INTEGER DEFAULT (strftime('%s', 'now')),
                UNIQUE(user_id, group_id)
            )`,
            
            // 3. 积分变更日志表
            `CREATE TABLE IF NOT EXISTS points_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                group_id TEXT NOT NULL DEFAULT 'default',
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
            `CREATE TABLE IF NOT EXISTS group_configs (
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
            `CREATE TABLE IF NOT EXISTS badge_definitions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                badge_id TEXT NOT NULL,
                group_id TEXT NOT NULL DEFAULT 'default',
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
            `CREATE TABLE IF NOT EXISTS user_badges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                group_id TEXT NOT NULL DEFAULT 'default',
                badge_id TEXT NOT NULL,
                awarded_by TEXT DEFAULT 'system',
                awarded_reason TEXT,
                awarded_at INTEGER DEFAULT (strftime('%s', 'now'))
            )`
        ];
        
        // 创建索引
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_user_levels_user_group ON user_levels(user_id, group_id)',
            'CREATE INDEX IF NOT EXISTS idx_user_levels_level ON user_levels(level DESC)',
            'CREATE INDEX IF NOT EXISTS idx_user_levels_points ON user_levels(available_points DESC)',
            'CREATE INDEX IF NOT EXISTS idx_points_log_user_time ON points_log(user_id, timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_user_badges_user_group ON user_badges(user_id, group_id)',
            'CREATE INDEX IF NOT EXISTS idx_group_configs_group_id ON group_configs(group_id)',
            'CREATE INDEX IF NOT EXISTS idx_badge_definitions_group ON badge_definitions(group_id, status)'
        ];
        
        // 执行创建表和索引（使用better-sqlite3的同步方式）
        tables.forEach(sql => {
            try {
                this.db.exec(sql);
            } catch (err) {
                console.error('创建表失败:', err);
            }
        });
        
        indexes.forEach(sql => {
            try {
                this.db.exec(sql);
            } catch (err) {
                console.error('创建索引失败:', err);
            }
        });
        
        console.log('✅ 等级系统数据库表结构创建完成');
    }
    
    // 获取数据库实例
    getDatabase() {
        if (!this.enabled || !this.db) {
            return null;
        }
        return this.db;
    }
    
    // 关闭数据库连接
    close() {
        if (this.db) {
            try {
                this.db.close();
                console.log('等级系统数据库已关闭');
            } catch (err) {
                console.error('关闭等级系统数据库失败:', err);
            }
        }
    }
}

// 导出单例
let instance = null;
module.exports = {
    getInstance: () => {
        if (!instance) {
            instance = new LevelDatabaseManager();
        }
        return instance;
    },
    
    // 便捷方法
    getDb: () => {
        const manager = module.exports.getInstance();
        return manager.getDatabase();
    }
}; 