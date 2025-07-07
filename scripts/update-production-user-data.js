#!/usr/bin/env node

// 生产环境用户数据更新脚本
console.log('🔧 开始更新生产环境用户数据...');

const Database = require('better-sqlite3');
const path = require('path');

async function updateProductionUserData() {
    try {
        // 检查环境
        const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT;
        console.log(`📊 当前环境: ${isProduction ? '生产环境' : '开发环境'}`);
        
        // 确定数据库路径
        const levelDbPath = isProduction 
            ? path.join(__dirname, '..', 'data', 'level_system.db')
            : path.join(__dirname, '..', 'data', 'level_system_dev.db');
            
        const mainDbPath = isProduction 
            ? path.join(__dirname, '..', 'data', 'marketing_bot.db')
            : path.join(__dirname, '..', 'data', 'marketing_bot_dev.db');
        
        console.log(`📂 等级数据库路径: ${levelDbPath}`);
        console.log(`📂 主数据库路径: ${mainDbPath}`);
        
        // 连接数据库
        const levelDb = new Database(levelDbPath);
        const mainDb = new Database(mainDbPath);
        
        console.log('✅ 数据库连接成功');
        
        // 1. 检查并添加username字段（如果不存在）
        try {
            const tableInfo = levelDb.prepare('PRAGMA table_info(user_levels)').all();
            const hasUsername = tableInfo.some(col => col.name === 'username');
            
            if (!hasUsername) {
                console.log('🔧 添加username字段...');
                levelDb.exec('ALTER TABLE user_levels ADD COLUMN username TEXT');
                console.log('✅ username字段添加成功');
            } else {
                console.log('✅ username字段已存在');
            }
        } catch (error) {
            console.warn('⚠️ 添加username字段时出现问题:', error.message);
        }
        
        // 2. 清理测试数据（用户ID小于1000000的）
        console.log('🧹 清理测试数据...');
        const deleteResult = levelDb.prepare('DELETE FROM user_levels WHERE user_id < 1000000').run();
        console.log(`✅ 清理了 ${deleteResult.changes} 条测试数据`);
        
        // 3. 获取真实用户数据
        console.log('📊 获取真实用户数据...');
        const realUsers = mainDb.prepare(`
            SELECT DISTINCT user_id, user_name, user_username 
            FROM orders 
            WHERE user_id >= 1000000
            ORDER BY user_id 
            LIMIT 20
        `).all();
        
        console.log(`📋 找到 ${realUsers.length} 个真实用户`);
        
        // 4. 添加或更新真实用户数据
        let addedCount = 0;
        let updatedCount = 0;
        
        for (const user of realUsers) {
            try {
                const displayName = user.user_name && user.user_name !== '未设置' && user.user_name.trim() !== '' 
                    ? user.user_name.trim() 
                    : `用户${user.user_id}`;
                    
                let username = null;
                if (user.user_username && 
                    user.user_username !== '未设置用户名' && 
                    user.user_username !== '未设置' && 
                    user.user_username.trim() !== '') {
                    username = user.user_username.replace(/^@+/, '').trim();
                }
                
                // 检查用户是否已存在
                const existingUser = levelDb.prepare('SELECT user_id FROM user_levels WHERE user_id = ?').get(user.user_id);
                
                if (existingUser) {
                    // 更新现有用户的显示名称和用户名
                    levelDb.prepare(`
                        UPDATE user_levels 
                        SET display_name = ?, username = ?, updated_at = ?
                        WHERE user_id = ?
                    `).run(displayName, username, Math.floor(Date.now() / 1000), user.user_id);
                    
                    console.log(`🔄 更新用户: ${displayName} (@${username || '未设置'})`);
                    updatedCount++;
                } else {
                    // 添加新用户
                    levelDb.prepare(`
                        INSERT INTO user_levels (
                            user_id, level, total_exp, available_points, total_points_earned, 
                            total_points_spent, attack_count, user_eval_count, merchant_eval_count, 
                            text_eval_count, badges, display_name, username, last_milestone_points, 
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        user.user_id, 1, 0, 0, 0, 0, 0, 0, 0, 0, '[]', 
                        displayName, username, 0, 
                        Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)
                    );
                    
                    console.log(`➕ 添加用户: ${displayName} (@${username || '未设置'})`);
                    addedCount++;
                }
            } catch (error) {
                console.error(`❌ 处理用户 ${user.user_id} 失败:`, error.message);
            }
        }
        
        console.log(`🎉 用户数据更新完成！`);
        console.log(`   - 新增用户: ${addedCount} 个`);
        console.log(`   - 更新用户: ${updatedCount} 个`);
        
        // 5. 显示更新后的用户统计
        const finalStats = levelDb.prepare(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN username IS NOT NULL THEN 1 END) as users_with_username,
                COUNT(CASE WHEN display_name NOT LIKE '用户%' THEN 1 END) as users_with_real_names
            FROM user_levels
        `).get();
        
        console.log(`📊 最终统计:`);
        console.log(`   - 总用户数: ${finalStats.total_users}`);
        console.log(`   - 有用户名的: ${finalStats.users_with_username}`);
        console.log(`   - 有真实姓名的: ${finalStats.users_with_real_names}`);
        
        // 6. 显示前几个用户作为示例
        const sampleUsers = levelDb.prepare(`
            SELECT user_id, display_name, username, level, total_exp, available_points
            FROM user_levels 
            ORDER BY user_id 
            LIMIT 5
        `).all();
        
        console.log(`📋 用户示例:`);
        sampleUsers.forEach(user => {
            console.log(`   ${user.user_id}: ${user.display_name} (@${user.username || '未设置'}) Lv.${user.level}`);
        });
        
        levelDb.close();
        mainDb.close();
        
        console.log('✅ 生产环境用户数据更新完成！');
        
    } catch (error) {
        console.error('❌ 更新用户数据失败:', error);
        process.exit(1);
    }
}

// 运行更新
updateProductionUserData(); 