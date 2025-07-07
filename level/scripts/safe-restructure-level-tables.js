#!/usr/bin/env node

/**
 * 安全重构等级系统数据库表结构
 * 只影响独立的 level_system.db 文件，不触及现有生产数据
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class SafeLevelTableRestructure {
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
                } else {
                    throw new Error('Volume目录不存在');
                }
            } catch (error) {
                dataDir = localDataDir;
            }
        } else {
            dataDir = path.join(__dirname, '..', '..', 'data');
        }
        
        // 等级系统数据库文件
        const dbFileName = isProduction ? 'level_system.db' : 'level_system_dev.db';
        this.dbPath = path.join(dataDir, dbFileName);
        this.backupPath = path.join(dataDir, `${dbFileName}.backup.${Date.now()}`);
        
        console.log(`🔧 等级系统数据库路径: ${this.dbPath}`);
        console.log(`💾 备份路径: ${this.backupPath}`);
    }
    
    async restructure() {
        try {
            // 1. 检查数据库文件是否存在
            if (!fs.existsSync(this.dbPath)) {
                console.log('✅ 数据库文件不存在，将创建新的简化结构');
                this.createNewDatabase();
                return;
            }
            
            // 2. 备份现有数据库
            console.log('📦 备份现有数据库...');
            fs.copyFileSync(this.dbPath, this.backupPath);
            console.log('✅ 备份完成');
            
            // 3. 连接数据库
            const db = new Database(this.dbPath);
            
            // 4. 导出现有数据
            console.log('📤 导出现有数据...');
            const existingData = this.exportExistingData(db);
            
            // 5. 关闭数据库连接
            db.close();
            
            // 6. 删除旧数据库文件
            console.log('🗑️  删除旧数据库文件...');
            fs.unlinkSync(this.dbPath);
            
            // 7. 创建新的数据库结构
            console.log('🆕 创建新的数据库结构...');
            this.createNewDatabase();
            
            // 8. 迁移数据
            console.log('🔄 迁移数据...');
            this.migrateData(existingData);
            
            console.log('✅ 数据库重构完成！');
            console.log(`💾 备份文件保存在: ${this.backupPath}`);
            
        } catch (error) {
            console.error('❌ 重构失败:', error);
            
            // 如果失败，尝试恢复备份
            if (fs.existsSync(this.backupPath)) {
                console.log('🔄 正在恢复备份...');
                try {
                    fs.copyFileSync(this.backupPath, this.dbPath);
                    console.log('✅ 备份恢复成功');
                } catch (restoreError) {
                    console.error('❌ 备份恢复失败:', restoreError);
                }
            }
            
            throw error;
        }
    }
    
    exportExistingData(db) {
        const data = {};
        
        try {
            // 导出用户等级数据
            const userLevels = db.prepare('SELECT * FROM user_levels').all();
            data.userLevels = userLevels;
            console.log(`📊 导出用户等级数据: ${userLevels.length} 条`);
        } catch (error) {
            console.log('⚠️  user_levels表不存在或为空');
            data.userLevels = [];
        }
        
        try {
            // 导出积分日志
            const pointsLog = db.prepare('SELECT * FROM points_log').all();
            data.pointsLog = pointsLog;
            console.log(`📊 导出积分日志: ${pointsLog.length} 条`);
        } catch (error) {
            console.log('⚠️  points_log表不存在或为空');
            data.pointsLog = [];
        }
        
        try {
            // 导出群组配置
            const groupConfigs = db.prepare('SELECT * FROM group_configs').all();
            data.groupConfigs = groupConfigs;
            console.log(`📊 导出群组配置: ${groupConfigs.length} 条`);
        } catch (error) {
            console.log('⚠️  group_configs表不存在或为空');
            data.groupConfigs = [];
        }
        
        try {
            // 导出勋章定义
            const badgeDefinitions = db.prepare('SELECT * FROM badge_definitions').all();
            data.badgeDefinitions = badgeDefinitions;
            console.log(`📊 导出勋章定义: ${badgeDefinitions.length} 条`);
        } catch (error) {
            console.log('⚠️  badge_definitions表不存在或为空');
            data.badgeDefinitions = [];
        }
        
        try {
            // 导出用户勋章
            const userBadges = db.prepare('SELECT * FROM user_badges').all();
            data.userBadges = userBadges;
            console.log(`📊 导出用户勋章: ${userBadges.length} 条`);
        } catch (error) {
            console.log('⚠️  user_badges表不存在或为空');
            data.userBadges = [];
        }
        
        return data;
    }
    
    createNewDatabase() {
        const db = new Database(this.dbPath);
        
        // 启用外键约束和WAL模式
        db.pragma('foreign_keys = ON');
        db.pragma('journal_mode = WAL');
        
        // 新的简化表结构（以用户为核心）
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
            
            // 6. 用户勋章获得记录表（简化：不依赖群组）
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
        
        // 创建索引
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_user_levels_level ON user_levels(level DESC)',
            'CREATE INDEX IF NOT EXISTS idx_user_levels_points ON user_levels(available_points DESC)',
            'CREATE INDEX IF NOT EXISTS idx_points_log_user_time ON points_log(user_id, timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_group_configs_group_id ON group_configs(group_id)',
            'CREATE INDEX IF NOT EXISTS idx_badge_definitions_group ON badge_definitions(group_id, status)'
        ];
        
        // 执行创建表和索引
        tables.forEach(sql => {
            db.exec(sql);
        });
        
        indexes.forEach(sql => {
            db.exec(sql);
        });
        
        db.close();
        console.log('✅ 新数据库结构创建完成');
    }
    
    migrateData(data) {
        if (!data || Object.keys(data).length === 0) {
            console.log('⚠️  没有数据需要迁移');
            return;
        }
        
        const db = new Database(this.dbPath);
        
        try {
            // 迁移用户等级数据（合并多群组数据）
            if (data.userLevels && data.userLevels.length > 0) {
                console.log('🔄 迁移用户等级数据...');
                
                // 按用户ID分组，合并数据
                const userDataMap = new Map();
                
                data.userLevels.forEach(record => {
                    const userId = record.user_id;
                    
                    if (!userDataMap.has(userId)) {
                        userDataMap.set(userId, {
                            user_id: userId,
                            level: record.level || 1,
                            total_exp: record.total_exp || 0,
                            available_points: record.available_points || 0,
                            total_points_earned: record.total_points_earned || 0,
                            total_points_spent: record.total_points_spent || 0,
                            attack_count: record.attack_count || 0,
                            user_eval_count: record.user_eval_count || 0,
                            merchant_eval_count: record.merchant_eval_count || 0,
                            text_eval_count: record.text_eval_count || 0,
                            badges: record.badges || '[]',
                            display_name: record.display_name,
                            last_milestone_points: record.last_milestone_points || 0,
                            created_at: record.created_at,
                            updated_at: record.updated_at
                        });
                    } else {
                        // 合并数据（取最高等级和累计数据）
                        const existing = userDataMap.get(userId);
                        existing.level = Math.max(existing.level, record.level || 1);
                        existing.total_exp = Math.max(existing.total_exp, record.total_exp || 0);
                        existing.available_points = Math.max(existing.available_points, record.available_points || 0);
                        existing.total_points_earned = Math.max(existing.total_points_earned, record.total_points_earned || 0);
                        existing.total_points_spent = Math.max(existing.total_points_spent, record.total_points_spent || 0);
                        existing.attack_count += (record.attack_count || 0);
                        existing.user_eval_count += (record.user_eval_count || 0);
                        existing.merchant_eval_count += (record.merchant_eval_count || 0);
                        existing.text_eval_count += (record.text_eval_count || 0);
                        
                        // 合并勋章（去重）
                        const existingBadges = JSON.parse(existing.badges || '[]');
                        const newBadges = JSON.parse(record.badges || '[]');
                        const mergedBadges = [...new Set([...existingBadges, ...newBadges])];
                        existing.badges = JSON.stringify(mergedBadges);
                        
                        // 更新时间
                        existing.updated_at = Math.max(existing.updated_at || 0, record.updated_at || 0);
                    }
                });
                
                // 插入合并后的数据
                const insertStmt = db.prepare(`
                    INSERT OR REPLACE INTO user_levels 
                    (user_id, level, total_exp, available_points, total_points_earned, total_points_spent, 
                     attack_count, user_eval_count, merchant_eval_count, text_eval_count, badges, 
                     display_name, last_milestone_points, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                let migratedCount = 0;
                userDataMap.forEach(userData => {
                    insertStmt.run(
                        userData.user_id,
                        userData.level,
                        userData.total_exp,
                        userData.available_points,
                        userData.total_points_earned,
                        userData.total_points_spent,
                        userData.attack_count,
                        userData.user_eval_count,
                        userData.merchant_eval_count,
                        userData.text_eval_count,
                        userData.badges,
                        userData.display_name,
                        userData.last_milestone_points,
                        userData.created_at,
                        userData.updated_at
                    );
                    migratedCount++;
                });
                
                console.log(`✅ 用户等级数据迁移完成: ${migratedCount} 个用户`);
            }
            
            // 迁移积分日志（保留source_group_id）
            if (data.pointsLog && data.pointsLog.length > 0) {
                console.log('🔄 迁移积分日志...');
                
                const insertStmt = db.prepare(`
                    INSERT INTO points_log 
                    (user_id, source_group_id, action_type, exp_change, points_change, exp_after, points_after, 
                     description, related_eval_id, admin_id, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                let migratedCount = 0;
                data.pointsLog.forEach(log => {
                    insertStmt.run(
                        log.user_id,
                        log.group_id, // 作为source_group_id
                        log.action_type,
                        log.exp_change || 0,
                        log.points_change || 0,
                        log.exp_after,
                        log.points_after,
                        log.description,
                        log.related_eval_id,
                        log.admin_id,
                        log.timestamp
                    );
                    migratedCount++;
                });
                
                console.log(`✅ 积分日志迁移完成: ${migratedCount} 条记录`);
            }
            
            // 迁移群组配置
            if (data.groupConfigs && data.groupConfigs.length > 0) {
                console.log('🔄 迁移群组配置...');
                
                const insertStmt = db.prepare(`
                    INSERT OR REPLACE INTO group_configs 
                    (group_id, group_name, level_config, points_config, broadcast_config, broadcast_enabled, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                let migratedCount = 0;
                data.groupConfigs.forEach(config => {
                    insertStmt.run(
                        config.group_id,
                        config.group_name,
                        config.level_config,
                        config.points_config,
                        config.broadcast_config,
                        config.broadcast_enabled !== undefined ? config.broadcast_enabled : 1,
                        config.status || 'active',
                        config.created_at,
                        config.updated_at
                    );
                    migratedCount++;
                });
                
                console.log(`✅ 群组配置迁移完成: ${migratedCount} 条记录`);
            }
            
            // 迁移勋章定义
            if (data.badgeDefinitions && data.badgeDefinitions.length > 0) {
                console.log('🔄 迁移勋章定义...');
                
                const insertStmt = db.prepare(`
                    INSERT OR REPLACE INTO badge_definitions 
                    (badge_id, group_id, badge_name, badge_emoji, badge_desc, unlock_conditions, badge_type, rarity, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                let migratedCount = 0;
                data.badgeDefinitions.forEach(badge => {
                    insertStmt.run(
                        badge.badge_id,
                        badge.group_id || 'global',
                        badge.badge_name,
                        badge.badge_emoji || '🏆',
                        badge.badge_desc,
                        badge.unlock_conditions,
                        badge.badge_type || 'auto',
                        badge.rarity || 'common',
                        badge.status || 'active',
                        badge.created_at
                    );
                    migratedCount++;
                });
                
                console.log(`✅ 勋章定义迁移完成: ${migratedCount} 条记录`);
            }
            
            // 迁移用户勋章（去重，保留source_group_id）
            if (data.userBadges && data.userBadges.length > 0) {
                console.log('🔄 迁移用户勋章...');
                
                const insertStmt = db.prepare(`
                    INSERT OR IGNORE INTO user_badges 
                    (user_id, badge_id, source_group_id, awarded_by, awarded_reason, awarded_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);
                
                let migratedCount = 0;
                data.userBadges.forEach(userBadge => {
                    insertStmt.run(
                        userBadge.user_id,
                        userBadge.badge_id,
                        userBadge.group_id, // 作为source_group_id
                        userBadge.awarded_by || 'system',
                        userBadge.awarded_reason,
                        userBadge.awarded_at
                    );
                    migratedCount++;
                });
                
                console.log(`✅ 用户勋章迁移完成: ${migratedCount} 条记录`);
            }
            
        } catch (error) {
            console.error('❌ 数据迁移失败:', error);
            throw error;
        } finally {
            db.close();
        }
    }
}

// 主函数
async function main() {
    console.log('🚀 开始安全重构等级系统数据库...');
    
    try {
        const restructure = new SafeLevelTableRestructure();
        await restructure.restructure();
        
        console.log('🎉 重构完成！');
        console.log('💡 新的表结构特点：');
        console.log('   - user_levels: 以用户ID为主键，一个用户一条记录');
        console.log('   - points_log: 保留source_group_id记录操作来源');
        console.log('   - group_configs: 保留群组配置，用于播报和奖励规则');
        console.log('   - badge_definitions: 支持全局和群组特定勋章');
        console.log('   - user_badges: 简化为用户维度，记录source_group_id');
        
    } catch (error) {
        console.error('❌ 重构失败:', error);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = SafeLevelTableRestructure; 