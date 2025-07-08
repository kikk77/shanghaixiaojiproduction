/**
 * 数据同步服务 - 从主数据库同步有评价记录的用户到等级系统
 * 
 * 设计原则：
 * 1. 只读取主数据库，不修改任何数据
 * 2. 同步有评价记录的用户到等级系统
 * 3. 更新用户的评价计数
 */

const path = require('path');
const Database = require('better-sqlite3');

class UserEvaluationSync {
    constructor() {
        // 主数据库（只读）
        const envHelper = require('../../utils/environmentHelper');
        const mainDbPath = envHelper.getMainDatabasePath();
        console.log(`📂 使用主数据库: ${mainDbPath}`);
        this.mainDb = new Database(mainDbPath, { readonly: true });
        
        // 等级系统数据库
        const levelDbManager = require('../config/levelDatabase');
        this.levelDb = levelDbManager.getInstance().getDatabase();
        
        if (!this.levelDb) {
            throw new Error('等级系统数据库未初始化');
        }
    }
    
    /**
     * 执行同步
     */
    async sync() {
        try {
            console.log('🔄 开始同步用户评价数据...');
            
            // 1. 从主数据库获取所有有评价记录的用户
            const usersWithEvaluations = this.getUsersWithEvaluations();
            console.log(`📊 找到 ${usersWithEvaluations.length} 个有评价记录的用户`);
            
            // 2. 同步到等级系统
            let syncCount = 0;
            for (const userData of usersWithEvaluations) {
                if (await this.syncUserToLevelSystem(userData)) {
                    syncCount++;
                }
            }
            
            console.log(`✅ 同步完成: ${syncCount}/${usersWithEvaluations.length} 个用户`);
            
            // 3. 更新同步时间
            this.updateSyncTimestamp();
            
        } catch (error) {
            console.error('❌ 同步失败:', error);
            throw error;
        }
    }
    
    /**
     * 获取有评价记录的用户
     */
    getUsersWithEvaluations() {
        try {
            // 查询所有作为评价者的用户（用户评价）
            const query = `
                SELECT DISTINCT
                    e.evaluator_id as user_id,
                    COUNT(*) as eval_count,
                    MAX(i.username) as username,
                    MAX(i.first_name) as first_name,
                    MAX(i.last_name) as last_name
                FROM evaluations e
                LEFT JOIN interactions i ON e.evaluator_id = i.user_id
                WHERE e.evaluator_type = 'user' 
                AND e.status = 'completed'
                AND e.evaluator_id >= 1000000
                GROUP BY e.evaluator_id
                
                UNION
                
                -- 旧系统中的用户评价（orders表）
                SELECT DISTINCT
                    o.user_id,
                    COUNT(*) as eval_count,
                    MAX(i.username) as username,
                    MAX(i.first_name) as first_name,
                    MAX(i.last_name) as last_name
                FROM orders o
                LEFT JOIN interactions i ON o.user_id = i.user_id
                WHERE o.user_evaluation IS NOT NULL
                AND o.user_id >= 1000000
                GROUP BY o.user_id
            `;
            
            const users = this.mainDb.prepare(query).all();
            
            // 合并重复用户的评价计数
            const userMap = new Map();
            for (const user of users) {
                if (userMap.has(user.user_id)) {
                    const existing = userMap.get(user.user_id);
                    existing.eval_count += user.eval_count;
                } else {
                    userMap.set(user.user_id, user);
                }
            }
            
            return Array.from(userMap.values());
        } catch (error) {
            console.error('获取用户评价数据失败:', error);
            return [];
        }
    }
    
    /**
     * 同步单个用户到等级系统
     */
    async syncUserToLevelSystem(userData) {
        try {
            // 构建显示名称
            let displayName = `用户${userData.user_id}`;
            if (userData.username) {
                displayName = `@${userData.username}`;
            } else if (userData.first_name || userData.last_name) {
                displayName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim();
            }
            
            // 检查用户是否已存在
            const existingUser = this.levelDb.prepare(
                'SELECT * FROM user_levels WHERE user_id = ?'
            ).get(userData.user_id);
            
            if (existingUser) {
                // 更新现有用户的评价计数
                this.levelDb.prepare(`
                    UPDATE user_levels 
                    SET user_eval_count = ?,
                        display_name = ?,
                        username = ?,
                        updated_at = ?
                    WHERE user_id = ?
                `).run(
                    userData.eval_count,
                    displayName,
                    userData.username,
                    Date.now() / 1000,
                    userData.user_id
                );
                console.log(`📝 更新用户: ${userData.user_id} (${displayName}), 评价数: ${userData.eval_count}`);
            } else {
                // 创建新用户档案
                this.levelDb.prepare(`
                    INSERT INTO user_levels 
                    (user_id, display_name, username, user_eval_count)
                    VALUES (?, ?, ?, ?)
                `).run(
                    userData.user_id,
                    displayName,
                    userData.username,
                    userData.eval_count
                );
                console.log(`✨ 创建用户: ${userData.user_id} (${displayName}), 评价数: ${userData.eval_count}`);
            }
            
            return true;
        } catch (error) {
            console.error(`同步用户 ${userData.user_id} 失败:`, error);
            return false;
        }
    }
    
    /**
     * 更新同步时间戳
     */
    updateSyncTimestamp() {
        try {
            this.levelDb.prepare(`
                INSERT OR REPLACE INTO level_meta (key, value, description)
                VALUES ('last_sync_time', ?, '最后同步时间')
            `).run(new Date().toISOString());
        } catch (error) {
            console.error('更新同步时间戳失败:', error);
        }
    }
    
    /**
     * 获取最后同步时间
     */
    getLastSyncTime() {
        try {
            const result = this.levelDb.prepare(
                'SELECT value FROM level_meta WHERE key = ?'
            ).get('last_sync_time');
            return result ? result.value : null;
        } catch (error) {
            return null;
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const sync = new UserEvaluationSync();
    sync.sync().then(() => {
        console.log('✅ 数据同步完成');
        process.exit(0);
    }).catch(error => {
        console.error('❌ 数据同步失败:', error);
        process.exit(1);
    });
}

module.exports = UserEvaluationSync; 