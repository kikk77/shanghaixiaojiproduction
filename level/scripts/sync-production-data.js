#!/usr/bin/env node

/**
 * 同步生产数据到等级系统
 * 只包含有实际订单或评价的用户
 */

const Database = require('better-sqlite3');
const envHelper = require('../../utils/environmentHelper');

console.log('🔄 开始同步生产数据到等级系统...');

async function syncProductionData() {
    try {
        // 使用统一的环境检测
        envHelper.logEnvironmentInfo();
        
        // 获取数据库路径
        const levelDbPath = envHelper.getLevelSystemDatabasePath();
        const mainDbPath = envHelper.getMainDatabasePath();
        
        console.log(`📂 等级数据库: ${levelDbPath}`);
        console.log(`📂 主数据库: ${mainDbPath}`);
        
        // 连接数据库
        const levelDb = new Database(levelDbPath);
        const mainDb = new Database(mainDbPath);
        
        // 检查必需的表是否存在
        console.log('🔍 检查数据库表结构...');
        const requiredTables = ['evaluations', 'orders'];
        const missingTables = [];
        
        for (const table of requiredTables) {
            const tableExists = mainDb.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name=?
            `).get(table);
            
            if (!tableExists) {
                missingTables.push(table);
            }
        }
        
        if (missingTables.length > 0) {
            console.error(`❌ 缺少必需的表: ${missingTables.join(', ')}`);
            console.log('📌 请确保主数据库包含所有必需的表');
            return;
        }
        
        // 检查merchants表是否存在（可选）
        const hasMerchantsTable = mainDb.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='merchants'
        `).get();
        
        console.log(`✅ 数据库表检查完成${hasMerchantsTable ? '（包含merchants表）' : ''}`);
        
        // 1. 清理所有旧数据
        console.log('🧹 清理等级系统旧数据...');
        levelDb.exec('DELETE FROM user_levels');
        levelDb.exec('DELETE FROM points_log');
        levelDb.exec('DELETE FROM user_badges');
        console.log('✅ 旧数据清理完成');
        
        // 2. 获取有实际活动的用户（有订单或评价）
        console.log('📊 获取有活动记录的用户...');
        
        // 获取所有有评价的用户
        let evalQuery;
        if (hasMerchantsTable) {
            // 如果有merchants表，尝试获取商家名称
            evalQuery = `
                SELECT DISTINCT 
                    e.evaluator_id as user_id,
                    COALESCE(o.user_name, m.merchant_name, CAST(e.evaluator_id AS TEXT)) as user_name,
                    COALESCE(o.user_username, m.merchant_username, '') as user_username,
                    COUNT(DISTINCT e.id) as eval_count,
                    COUNT(DISTINCT CASE WHEN e.evaluator_type = 'user' THEN e.id END) as user_eval_count,
                    COUNT(DISTINCT CASE WHEN e.evaluator_type = 'merchant' THEN e.id END) as merchant_eval_count,
                    COUNT(DISTINCT CASE WHEN e.comments IS NOT NULL AND LENGTH(TRIM(e.comments)) > 10 THEN e.id END) as text_eval_count,
                    MAX(o.id) as has_order
                FROM evaluations e
                LEFT JOIN orders o ON e.evaluator_id = o.user_id
                LEFT JOIN merchants m ON e.evaluator_id = m.user_id AND e.evaluator_type = 'merchant'
                WHERE e.status = 'completed' 
                    AND e.evaluator_id >= 1000000
                GROUP BY e.evaluator_id
            `;
        } else {
            // 如果没有merchants表，只从orders表获取用户信息
            evalQuery = `
                SELECT DISTINCT 
                    e.evaluator_id as user_id,
                    COALESCE(o.user_name, CAST(e.evaluator_id AS TEXT)) as user_name,
                    COALESCE(o.user_username, '') as user_username,
                    COUNT(DISTINCT e.id) as eval_count,
                    COUNT(DISTINCT CASE WHEN e.evaluator_type = 'user' THEN e.id END) as user_eval_count,
                    COUNT(DISTINCT CASE WHEN e.evaluator_type = 'merchant' THEN e.id END) as merchant_eval_count,
                    COUNT(DISTINCT CASE WHEN e.comments IS NOT NULL AND LENGTH(TRIM(e.comments)) > 10 THEN e.id END) as text_eval_count,
                    MAX(o.id) as has_order
                FROM evaluations e
                LEFT JOIN orders o ON e.evaluator_id = o.user_id
                WHERE e.status = 'completed' 
                    AND e.evaluator_id >= 1000000
                GROUP BY e.evaluator_id
            `;
        }
        
        const usersWithEvaluations = mainDb.prepare(evalQuery).all();
        
        console.log(`✅ 找到 ${usersWithEvaluations.length} 个有评价记录的用户`);
        
        // 获取所有有订单的用户（但可能没有评价）
        const usersWithOrders = mainDb.prepare(`
            SELECT DISTINCT 
                user_id,
                user_name,
                user_username,
                COUNT(*) as order_count
            FROM orders
            WHERE user_id >= 1000000
                AND user_id NOT IN (
                    SELECT DISTINCT evaluator_id 
                    FROM evaluations 
                    WHERE status = 'completed'
                )
            GROUP BY user_id
        `).all();
        
        console.log(`✅ 找到 ${usersWithOrders.length} 个只有订单没有评价的用户`);
        
        // 3. 插入有评价的用户数据
        console.log('📝 插入用户等级数据...');
        const insertStmt = levelDb.prepare(`
            INSERT INTO user_levels (
                user_id, level, total_exp, available_points, total_points_earned,
                total_points_spent, attack_count, user_eval_count, merchant_eval_count,
                text_eval_count, badges, display_name, username, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        let insertedCount = 0;
        
        // 插入有评价的用户
        for (const user of usersWithEvaluations) {
            try {
                // 计算等级数据
                const baseExp = user.user_eval_count * 30 + user.merchant_eval_count * 25 + user.text_eval_count * 15;
                const basePoints = user.user_eval_count * 25 + user.merchant_eval_count * 20 + user.text_eval_count * 15;
                
                // 根据经验值计算等级
                let level = 1;
                if (baseExp >= 2250) level = 10;
                else if (baseExp >= 1800) level = 9;
                else if (baseExp >= 1400) level = 8;
                else if (baseExp >= 1050) level = 7;
                else if (baseExp >= 750) level = 6;
                else if (baseExp >= 500) level = 5;
                else if (baseExp >= 300) level = 4;
                else if (baseExp >= 150) level = 3;
                else if (baseExp >= 50) level = 2;
                
                const displayName = user.user_name && user.user_name !== '未设置' 
                    ? user.user_name.trim() 
                    : `用户${user.user_id}`;
                    
                const username = user.user_username && user.user_username !== '未设置用户名' 
                    ? user.user_username.replace(/^@+/, '').trim()
                    : null;
                
                insertStmt.run(
                    user.user_id, level, baseExp, basePoints, basePoints,
                    0, user.order_count || 0, user.user_eval_count, user.merchant_eval_count,
                    user.text_eval_count, '[]', displayName, username,
                    Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)
                );
                
                insertedCount++;
            } catch (error) {
                console.error(`❌ 插入用户 ${user.user_id} 失败:`, error.message);
            }
        }
        
        console.log(`✅ 插入了 ${insertedCount} 个有评价的用户`);
        
        // 不插入只有订单没有评价的用户到等级系统
        console.log(`ℹ️  跳过 ${usersWithOrders.length} 个只有订单没有评价的用户`);
        
        // 4. 生成积分变更日志
        console.log('📝 生成积分变更日志...');
        const logStmt = levelDb.prepare(`
            INSERT INTO points_log (
                user_id, source_group_id, action_type, exp_change, points_change,
                exp_after, points_after, description, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const user of usersWithEvaluations) {
            const exp = user.user_eval_count * 30 + user.merchant_eval_count * 25 + user.text_eval_count * 15;
            const points = user.user_eval_count * 25 + user.merchant_eval_count * 20 + user.text_eval_count * 15;
            
            if (user.user_eval_count > 0) {
                logStmt.run(
                    user.user_id, 'default', 'user_eval', 
                    user.user_eval_count * 30, user.user_eval_count * 25,
                    exp, points, `完成${user.user_eval_count}次用户评价`, 
                    Math.floor(Date.now() / 1000)
                );
            }
            
            if (user.merchant_eval_count > 0) {
                logStmt.run(
                    user.user_id, 'default', 'merchant_eval',
                    user.merchant_eval_count * 25, user.merchant_eval_count * 20,
                    exp, points, `完成${user.merchant_eval_count}次商家评价`,
                    Math.floor(Date.now() / 1000)
                );
            }
        }
        
        // 5. 显示统计信息
        const stats = levelDb.prepare(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN level > 1 THEN 1 END) as users_above_lv1,
                MAX(level) as max_level,
                AVG(level) as avg_level,
                SUM(total_exp) as total_exp,
                SUM(available_points) as total_points
            FROM user_levels
        `).get();
        
        console.log('\n📊 同步后的统计:');
        console.log(`- 总用户数: ${stats.total_users}`);
        console.log(`- 高于Lv.1的用户: ${stats.users_above_lv1}`);
        console.log(`- 最高等级: Lv.${stats.max_level}`);
        console.log(`- 平均等级: ${stats.avg_level ? stats.avg_level.toFixed(2) : '0'}`);
        console.log(`- 总经验值: ${stats.total_exp || 0}`);
        console.log(`- 总积分: ${stats.total_points || 0}`);
        
        // 显示等级分布
        const levelDistribution = levelDb.prepare(`
            SELECT level, COUNT(*) as count
            FROM user_levels
            GROUP BY level
            ORDER BY level
        `).all();
        
        console.log('\n📈 等级分布:');
        levelDistribution.forEach(item => {
            console.log(`- Lv.${item.level}: ${item.count} 人`);
        });
        
        levelDb.close();
        mainDb.close();
        
        console.log('\n✅ 生产数据同步完成！');
        
    } catch (error) {
        console.error('❌ 同步失败:', error);
        process.exit(1);
    }
}

// 执行同步
syncProductionData(); 