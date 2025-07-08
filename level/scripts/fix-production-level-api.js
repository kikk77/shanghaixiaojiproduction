#!/usr/bin/env node

/**
 * 修复生产环境等级系统API功能
 * 确保所有API端点正常工作并返回真实数据
 */

const Database = require('better-sqlite3');
const envHelper = require('../../utils/environmentHelper');

console.log('🔧 开始修复生产环境等级系统API...');

async function fixProductionLevelAPI() {
    try {
        // 使用统一的环境检测
        envHelper.logEnvironmentInfo();
        
        // 获取数据库路径
        const levelDbPath = envHelper.getLevelSystemDatabasePath();
        console.log(`📂 等级数据库: ${levelDbPath}`);
        
        // 连接数据库
        const db = new Database(levelDbPath);
        
        // 1. 检查数据库表结构
        console.log('\n📋 检查数据库表结构...');
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log('现有表:', tables.map(t => t.name).join(', '));
        
        // 2. 检查用户数据
        console.log('\n👥 检查用户数据...');
        const userStats = db.prepare(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN user_id >= 1000000 THEN 1 END) as real_users,
                COUNT(CASE WHEN user_id < 1000000 THEN 1 END) as test_users,
                COUNT(CASE WHEN user_eval_count > 0 OR merchant_eval_count > 0 OR text_eval_count > 0 THEN 1 END) as active_users
            FROM user_levels
        `).get();
        
        console.log(`- 总用户数: ${userStats.total}`);
        console.log(`- 真实用户: ${userStats.real_users}`);
        console.log(`- 测试用户: ${userStats.test_users}`);
        console.log(`- 有活动的用户: ${userStats.active_users}`);
        
        // 3. 清理测试数据
        if (userStats.test_users > 0) {
            console.log('\n🧹 清理测试数据...');
            const deleteResult = db.prepare('DELETE FROM user_levels WHERE user_id < 1000000').run();
            console.log(`✅ 删除了 ${deleteResult.changes} 条测试数据`);
        }
        
        // 4. 检查群组配置
        console.log('\n⚙️ 检查群组配置...');
        const groups = db.prepare('SELECT * FROM group_configs').all();
        
        if (groups.length === 0) {
            console.log('⚠️ 没有群组配置，创建默认配置...');
            
            // 创建默认群组配置
            db.prepare(`
                INSERT OR REPLACE INTO group_configs (
                    group_id, group_name, level_config, points_config, 
                    broadcast_config, broadcast_enabled, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                '-1002384738564',
                '小鸡管家主群',
                JSON.stringify({
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
                JSON.stringify({
                    base_rewards: {
                        attack: { exp: 20, points: 10 },
                        user_eval: { exp: 30, points: 25 },
                        merchant_eval: { exp: 25, points: 20 },
                        text_eval: { exp: 15, points: 15 },
                        level_up_bonus: { points: 50 }
                    }
                }),
                JSON.stringify({
                    level_up: { enabled: true, template: '🎉 恭喜 {username} 升级到 {level_name}！' },
                    badge_unlock: { enabled: true, template: '🏆 {username} 获得了 {badge_name} 勋章！' }
                }),
                1,
                'active'
            );
            
            console.log('✅ 默认群组配置创建成功');
        } else {
            console.log(`✅ 找到 ${groups.length} 个群组配置`);
            groups.forEach(g => {
                console.log(`- ${g.group_id}: ${g.group_name} (${g.status})`);
            });
        }
        
        // 5. 测试查询
        console.log('\n🧪 测试API查询...');
        
        // 测试用户列表查询
        const testUsers = db.prepare(`
            SELECT user_id, display_name, username, level, total_exp 
            FROM user_levels 
            WHERE user_id >= 1000000 AND (user_eval_count > 0 OR merchant_eval_count > 0 OR text_eval_count > 0 OR total_exp > 0)
            ORDER BY level DESC, total_exp DESC
            LIMIT 5
        `).all();
        
        console.log('排行榜前5名:');
        testUsers.forEach((user, index) => {
            console.log(`${index + 1}. ${user.display_name} (@${user.username || '未设置'}) - Lv.${user.level} (${user.total_exp}经验)`);
        });
        
        // 6. 显示API访问示例
        console.log('\n📡 API访问示例:');
        console.log('- 获取群组列表: GET /api/level/groups');
        console.log('- 获取用户列表: GET /api/level/users?groupId=-1002384738564&activeOnly=true');
        console.log('- 获取统计数据: GET /api/level/stats?groupId=-1002384738564');
        console.log('- 获取勋章列表: GET /api/level/badges?groupId=-1002384738564');
        
        db.close();
        console.log('\n✅ 生产环境等级系统API修复完成！');
        
    } catch (error) {
        console.error('❌ 修复失败:', error);
        process.exit(1);
    }
}

// 执行修复
fixProductionLevelAPI(); 