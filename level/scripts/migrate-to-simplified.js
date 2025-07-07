/**
 * 等级系统简化迁移脚本
 * 将现有的多群组用户档案合并为单一用户档案
 */

const path = require('path');
const fs = require('fs');

class LevelSystemMigrator {
    constructor() {
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
    }
    
    async migrate() {
        if (!this.enabled) {
            console.log('🏆 等级系统未启用，跳过迁移');
            return;
        }
        
        console.log('🔄 开始等级系统简化迁移...');
        
        try {
            const levelDbManager = require('../config/levelDatabase');
            const levelDb = levelDbManager.getInstance();
            
            if (!levelDb.enabled) {
                console.log('🏆 等级系统数据库未启用');
                return;
            }
            
            await this.backupDatabase(levelDb);
            await this.migrateUserLevels(levelDb);
            await this.migrateUserBadges(levelDb);
            await this.migratePointsLog(levelDb);
            await this.updateGroupConfigs(levelDb);
            await this.cleanupOldStructure(levelDb);
            
            console.log('✅ 等级系统简化迁移完成');
        } catch (error) {
            console.error('❌ 等级系统迁移失败:', error);
        }
    }
    
    async backupDatabase(levelDb) {
        const db = levelDb.getDatabase();
        if (!db) return;
        
        try {
            // 创建备份目录
            const backupDir = path.join(__dirname, '..', '..', 'backups');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            
            // 备份文件名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(backupDir, `level_system_backup_${timestamp}.sql`);
            
            // 导出数据
            const tables = ['user_levels', 'points_log', 'group_configs', 'badge_definitions', 'user_badges', 'level_meta'];
            let backupSql = '';
            
            for (const table of tables) {
                try {
                    const rows = db.prepare(`SELECT * FROM ${table}`).all();
                    if (rows.length > 0) {
                        backupSql += `-- Table: ${table}\n`;
                        for (const row of rows) {
                            const columns = Object.keys(row).join(', ');
                            const values = Object.values(row).map(v => 
                                v === null ? 'NULL' : 
                                typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : 
                                v
                            ).join(', ');
                            backupSql += `INSERT INTO ${table} (${columns}) VALUES (${values});\n`;
                        }
                        backupSql += '\n';
                    }
                } catch (error) {
                    console.log(`表 ${table} 不存在，跳过备份`);
                }
            }
            
            fs.writeFileSync(backupFile, backupSql);
            console.log(`✅ 数据库备份完成: ${backupFile}`);
            
        } catch (error) {
            console.error('备份数据库失败:', error);
        }
    }
    
    async migrateUserLevels(levelDb) {
        const db = levelDb.getDatabase();
        if (!db) return;
        
        try {
            console.log('🔄 迁移用户等级数据...');
            
            // 检查是否已经是新结构
            const tableInfo = db.prepare("PRAGMA table_info(user_levels)").all();
            const hasGroupId = tableInfo.some(col => col.name === 'group_id');
            
            if (!hasGroupId) {
                console.log('✅ 用户等级表已经是新结构，跳过迁移');
                return;
            }
            
            // 获取所有用户的多群组数据
            const allUserData = db.prepare(`
                SELECT * FROM user_levels 
                ORDER BY user_id, created_at ASC
            `).all();
            
            if (allUserData.length === 0) {
                console.log('没有用户数据需要迁移');
                return;
            }
            
            // 按用户ID分组
            const userGroups = {};
            for (const userData of allUserData) {
                if (!userGroups[userData.user_id]) {
                    userGroups[userData.user_id] = [];
                }
                userGroups[userData.user_id].push(userData);
            }
            
            // 创建新的用户等级表
            db.exec(`
                CREATE TABLE IF NOT EXISTS user_levels_new (
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
            
            // 合并每个用户的数据
            const insertStmt = db.prepare(`
                INSERT OR REPLACE INTO user_levels_new 
                (user_id, level, total_exp, available_points, total_points_earned, total_points_spent,
                 attack_count, user_eval_count, merchant_eval_count, text_eval_count, badges, 
                 display_name, last_milestone_points, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            for (const [userId, userData] of Object.entries(userGroups)) {
                // 合并用户数据：取最高等级、累加数值
                const mergedData = this.mergeUserData(userData);
                
                insertStmt.run(
                    parseInt(userId),
                    mergedData.level,
                    mergedData.total_exp,
                    mergedData.available_points,
                    mergedData.total_points_earned,
                    mergedData.total_points_spent,
                    mergedData.attack_count,
                    mergedData.user_eval_count,
                    mergedData.merchant_eval_count,
                    mergedData.text_eval_count,
                    mergedData.badges,
                    mergedData.display_name,
                    mergedData.last_milestone_points,
                    mergedData.created_at,
                    mergedData.updated_at
                );
            }
            
            // 替换旧表
            db.exec('DROP TABLE user_levels');
            db.exec('ALTER TABLE user_levels_new RENAME TO user_levels');
            
            // 创建索引
            db.exec('CREATE INDEX IF NOT EXISTS idx_user_levels_level ON user_levels(level DESC)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_user_levels_points ON user_levels(available_points DESC)');
            
            console.log(`✅ 用户等级数据迁移完成，合并了 ${Object.keys(userGroups).length} 个用户的数据`);
            
        } catch (error) {
            console.error('迁移用户等级数据失败:', error);
        }
    }
    
    mergeUserData(userData) {
        // 取最新的一条记录作为基础
        const latest = userData[userData.length - 1];
        
        // 合并数值：取最大值或累加
        const merged = {
            level: Math.max(...userData.map(u => u.level || 1)),
            total_exp: Math.max(...userData.map(u => u.total_exp || 0)),
            available_points: Math.max(...userData.map(u => u.available_points || 0)),
            total_points_earned: userData.reduce((sum, u) => sum + (u.total_points_earned || 0), 0),
            total_points_spent: userData.reduce((sum, u) => sum + (u.total_points_spent || 0), 0),
            attack_count: userData.reduce((sum, u) => sum + (u.attack_count || 0), 0),
            user_eval_count: userData.reduce((sum, u) => sum + (u.user_eval_count || 0), 0),
            merchant_eval_count: userData.reduce((sum, u) => sum + (u.merchant_eval_count || 0), 0),
            text_eval_count: userData.reduce((sum, u) => sum + (u.text_eval_count || 0), 0),
            display_name: latest.display_name,
            last_milestone_points: Math.max(...userData.map(u => u.last_milestone_points || 0)),
            created_at: Math.min(...userData.map(u => u.created_at || Date.now() / 1000)),
            updated_at: Math.max(...userData.map(u => u.updated_at || Date.now() / 1000))
        };
        
        // 合并勋章列表
        const allBadges = [];
        for (const u of userData) {
            try {
                const badges = JSON.parse(u.badges || '[]');
                allBadges.push(...badges);
            } catch (error) {
                // 忽略解析错误
            }
        }
        
        // 去重勋章
        const uniqueBadges = [];
        const seenBadgeIds = new Set();
        for (const badge of allBadges) {
            if (badge.id && !seenBadgeIds.has(badge.id)) {
                seenBadgeIds.add(badge.id);
                uniqueBadges.push(badge);
            }
        }
        
        merged.badges = JSON.stringify(uniqueBadges);
        
        return merged;
    }
    
    async migrateUserBadges(levelDb) {
        const db = levelDb.getDatabase();
        if (!db) return;
        
        try {
            console.log('🔄 迁移用户勋章数据...');
            
            // 检查是否已经是新结构
            const tableInfo = db.prepare("PRAGMA table_info(user_badges)").all();
            const hasGroupId = tableInfo.some(col => col.name === 'group_id');
            
            if (!hasGroupId) {
                console.log('✅ 用户勋章表已经是新结构，跳过迁移');
                return;
            }
            
            // 获取所有勋章数据
            const allBadges = db.prepare(`
                SELECT * FROM user_badges 
                ORDER BY user_id, awarded_at ASC
            `).all();
            
            if (allBadges.length === 0) {
                console.log('没有勋章数据需要迁移');
                return;
            }
            
            // 创建新的勋章表
            db.exec(`
                CREATE TABLE IF NOT EXISTS user_badges_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    badge_id TEXT NOT NULL,
                    source_group_id TEXT,
                    awarded_by TEXT DEFAULT 'system',
                    awarded_reason TEXT,
                    awarded_at INTEGER DEFAULT (strftime('%s', 'now')),
                    UNIQUE(user_id, badge_id)
                )
            `);
            
            // 迁移勋章数据（去重）
            const insertStmt = db.prepare(`
                INSERT OR IGNORE INTO user_badges_new 
                (user_id, badge_id, source_group_id, awarded_by, awarded_reason, awarded_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            for (const badge of allBadges) {
                insertStmt.run(
                    badge.user_id,
                    badge.badge_id,
                    badge.group_id, // 保存原群组ID作为来源
                    badge.awarded_by || 'system',
                    badge.awarded_reason || '迁移数据',
                    badge.awarded_at
                );
            }
            
            // 替换旧表
            db.exec('DROP TABLE user_badges');
            db.exec('ALTER TABLE user_badges_new RENAME TO user_badges');
            
            // 创建索引
            db.exec('CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id)');
            
            console.log(`✅ 用户勋章数据迁移完成，处理了 ${allBadges.length} 条记录`);
            
        } catch (error) {
            console.error('迁移用户勋章数据失败:', error);
        }
    }
    
    async migratePointsLog(levelDb) {
        const db = levelDb.getDatabase();
        if (!db) return;
        
        try {
            console.log('🔄 迁移积分日志数据...');
            
            // 检查是否已经是新结构
            const tableInfo = db.prepare("PRAGMA table_info(points_log)").all();
            const hasGroupId = tableInfo.some(col => col.name === 'group_id');
            
            if (!hasGroupId) {
                console.log('✅ 积分日志表已经是新结构，跳过迁移');
                return;
            }
            
            // 重命名group_id为source_group_id
            db.exec(`
                CREATE TABLE IF NOT EXISTS points_log_new (
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
                )
            `);
            
            // 迁移数据
            db.exec(`
                INSERT INTO points_log_new 
                (id, user_id, source_group_id, action_type, exp_change, points_change, 
                 exp_after, points_after, description, related_eval_id, admin_id, timestamp)
                SELECT id, user_id, group_id, action_type, exp_change, points_change, 
                       exp_after, points_after, description, related_eval_id, admin_id, timestamp
                FROM points_log
            `);
            
            // 替换旧表
            db.exec('DROP TABLE points_log');
            db.exec('ALTER TABLE points_log_new RENAME TO points_log');
            
            // 创建索引
            db.exec('CREATE INDEX IF NOT EXISTS idx_points_log_user_time ON points_log(user_id, timestamp DESC)');
            
            console.log('✅ 积分日志数据迁移完成');
            
        } catch (error) {
            console.error('迁移积分日志数据失败:', error);
        }
    }
    
    async updateGroupConfigs(levelDb) {
        const db = levelDb.getDatabase();
        if (!db) return;
        
        try {
            console.log('🔄 更新群组配置...');
            
            // 将default群组改为global
            db.exec(`
                UPDATE group_configs 
                SET group_id = 'global', group_name = '全局配置'
                WHERE group_id = 'default'
            `);
            
            // 确保global配置存在
            const globalExists = db.prepare(`
                SELECT COUNT(*) as count FROM group_configs 
                WHERE group_id = 'global'
            `).get();
            
            if (globalExists.count === 0) {
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
                    broadcast_enabled: 0,
                    status: 'active'
                };
                
                const stmt = db.prepare(`
                    INSERT INTO group_configs 
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
            }
            
            console.log('✅ 群组配置更新完成');
            
        } catch (error) {
            console.error('更新群组配置失败:', error);
        }
    }
    
    async cleanupOldStructure(levelDb) {
        const db = levelDb.getDatabase();
        if (!db) return;
        
        try {
            console.log('🔄 清理旧结构...');
            
            // 更新勋章定义的group_id
            db.exec(`
                UPDATE badge_definitions 
                SET group_id = 'global'
                WHERE group_id = 'default'
            `);
            
            console.log('✅ 旧结构清理完成');
            
        } catch (error) {
            console.error('清理旧结构失败:', error);
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const migrator = new LevelSystemMigrator();
    migrator.migrate().then(() => {
        console.log('迁移脚本执行完成');
        process.exit(0);
    }).catch(error => {
        console.error('迁移脚本执行失败:', error);
        process.exit(1);
    });
}

module.exports = LevelSystemMigrator; 