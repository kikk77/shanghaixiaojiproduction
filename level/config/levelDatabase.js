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
        
        // 使用统一的环境助手获取数据目录
        const envHelper = require('../../utils/environmentHelper');
        const dataDir = envHelper.getDataDirectory();
        
        // 数据目录由environmentHelper确保存在，这里不需要重复检查
        
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
        // 检查表结构是否已经存在并且是新版本
        const hasNewStructure = this.checkTableStructure();
        
        if (hasNewStructure) {
            console.log('✅ 数据库表结构已是简化版本，跳过创建');
            return;
        }
        
        // 简化版本的表设计（以用户为核心）
        const tables = [
            // 1. 等级系统元信息表
            `CREATE TABLE IF NOT EXISTS level_meta (
                key TEXT PRIMARY KEY,
                value TEXT,
                description TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )`,
            
            // 2. 用户等级数据表（简化：以用户ID为主键）
            `CREATE TABLE IF NOT EXISTS user_levels (
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
            
            // 3. 积分变更日志表（保留source_group_id用于记录来源）
            `CREATE TABLE IF NOT EXISTS points_log (
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
            
            // 4. 群组配置表（保留，用于播报设置和奖励规则）
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
            
            // 5. 勋章定义表（保留group_id用于不同群组的勋章配置）
            `CREATE TABLE IF NOT EXISTS badge_definitions (
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
            
            // 6. 勋章获得记录表（简化：不依赖群组）
            `CREATE TABLE IF NOT EXISTS user_badges (
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
        
        // 简化版本的索引
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_user_levels_level ON user_levels(level DESC)',
            'CREATE INDEX IF NOT EXISTS idx_user_levels_points ON user_levels(available_points DESC)',
            'CREATE INDEX IF NOT EXISTS idx_points_log_user_time ON points_log(user_id, timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id)',
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
    
    // 检查表结构是否为新版本（简化版本）
    checkTableStructure() {
        try {
            // 检查user_levels表是否存在
            const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_levels'").get();
            
            if (!tableExists) {
                console.log('⚠️  user_levels表不存在，将创建新的简化结构');
                return false;
            }
            
            // 检查user_levels表结构
            const tableInfo = this.db.prepare("PRAGMA table_info(user_levels)").all();
            
            // 检查是否有group_id列（旧结构）
            const hasGroupId = tableInfo.some(col => col.name === 'group_id');
            
            // 检查是否有复合主键（旧结构有id和user_id, group_id的UNIQUE约束）
            const hasIdPrimary = tableInfo.some(col => col.name === 'id' && col.pk === 1);
            const hasUserIdPrimary = tableInfo.some(col => col.name === 'user_id' && col.pk === 1);
            
            if (hasGroupId || hasIdPrimary) {
                console.log('⚠️  检测到旧的表结构（包含group_id或复合主键）');
                console.log('💡 需要运行重构脚本来安全迁移数据:');
                console.log('   node level/scripts/safe-restructure-level-tables.js');
                console.log('⚠️  等级系统将暂时禁用，直到完成重构');
                this.enabled = false;
                return false;
            }
            
            // 新结构应该是：user_id为主键且没有group_id列
            if (hasUserIdPrimary && !hasGroupId) {
                console.log('✅ 数据库表结构已是简化版本');
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('检查表结构失败:', error);
            return false;
        }
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