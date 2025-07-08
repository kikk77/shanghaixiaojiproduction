/**
 * 从主数据库同步评价数据到等级系统
 * 解决生产环境用户列表为空的问题
 */

const path = require('path');
const Database = require('better-sqlite3');

// 设置项目根目录
process.chdir(path.join(__dirname, '../..'));

async function syncFromMainDatabase() {
    console.log('🔄 开始从主数据库同步评价数据到等级系统...');
    
    try {
        // 1. 获取数据库路径
        const envHelper = require('../../utils/environmentHelper');
        const mainDbPath = envHelper.getMainDatabasePath();
        const levelDbPath = envHelper.getLevelSystemDatabasePath();
        
        console.log(`📂 主数据库路径: ${mainDbPath}`);
        console.log(`📂 等级系统数据库路径: ${levelDbPath}`);
        
        // 2. 连接数据库
        const mainDb = new Database(mainDbPath);
        const levelDb = new Database(levelDbPath);
        
        console.log('✅ 数据库连接成功');
        
        // 3. 检查主数据库中的评价数据
        const evaluationCount = mainDb.prepare(`
            SELECT COUNT(*) as count FROM evaluations
        `).get();
        
        console.log(`📊 主数据库中共有 ${evaluationCount.count} 条评价记录`);
        
        if (evaluationCount.count === 0) {
            console.log('⚠️ 主数据库中没有评价数据，无法同步');
            return;
        }
        
        // 4. 获取所有参与评价的用户
        const evaluationUsers = mainDb.prepare(`
            SELECT 
                evaluator_id as user_id,
                COUNT(*) as evaluation_count,
                MIN(created_at) as first_evaluation,
                MAX(created_at) as last_evaluation
            FROM evaluations 
            WHERE evaluator_id IS NOT NULL 
            GROUP BY evaluator_id
            ORDER BY evaluation_count DESC
        `).all();
        
        console.log(`👥 发现 ${evaluationUsers.length} 个参与评价的用户`);
        
        // 5. 获取商家评价数据（evaluator_type = 'merchant'）
        const merchantEvaluations = mainDb.prepare(`
            SELECT 
                evaluator_id as user_id,
                COUNT(*) as merchant_eval_count
            FROM evaluations 
            WHERE evaluator_id IS NOT NULL AND evaluator_type = 'merchant'
            GROUP BY evaluator_id
        `).all();
        
        const merchantEvalMap = {};
        merchantEvaluations.forEach(row => {
            merchantEvalMap[row.user_id] = row.merchant_eval_count;
        });
        
        // 6. 获取文字评价数据
        const textEvaluations = mainDb.prepare(`
            SELECT 
                evaluator_id as user_id,
                COUNT(*) as text_eval_count
            FROM evaluations 
            WHERE evaluator_id IS NOT NULL AND (comments IS NOT NULL AND comments != '')
            GROUP BY evaluator_id
        `).all();
        
        const textEvalMap = {};
        textEvaluations.forEach(row => {
            textEvalMap[row.user_id] = row.text_eval_count;
        });
        
        // 7. 启用等级系统环境变量
        process.env.LEVEL_SYSTEM_ENABLED = 'true';
        
        // 8. 获取等级服务
        const levelService = require('../services/levelService').getInstance();
        
        if (!levelService) {
            console.error('❌ 等级服务初始化失败');
            return;
        }
        
        // 9. 同步用户数据
        let syncedCount = 0;
        let skippedCount = 0;
        
        for (const user of evaluationUsers) {
            try {
                // 检查用户是否已存在
                const existingUser = levelDb.prepare(`
                    SELECT user_id FROM user_levels WHERE user_id = ?
                `).get(user.user_id);
                
                if (existingUser) {
                    console.log(`⏭️ 用户 ${user.user_id} 已存在，跳过`);
                    skippedCount++;
                    continue;
                }
                
                // 创建用户等级记录
                const merchantEvalCount = merchantEvalMap[user.user_id] || 0;
                const textEvalCount = textEvalMap[user.user_id] || 0;
                
                // 计算基础奖励（基于历史评价数据）
                const userEvalReward = user.evaluation_count * 30; // 每次用户评价30经验
                const merchantEvalReward = merchantEvalCount * 25; // 每次商家评价25经验
                const textEvalReward = textEvalCount * 15; // 每次文字评价15经验
                
                const totalExp = userEvalReward + merchantEvalReward + textEvalReward;
                const totalPoints = Math.floor(totalExp * 0.8); // 积分约为经验的80%
                
                // 计算等级
                let level = 1;
                if (totalExp >= 1000) level = 5;
                else if (totalExp >= 500) level = 4;
                else if (totalExp >= 200) level = 3;
                else if (totalExp >= 100) level = 2;
                
                // 插入用户记录
                levelDb.prepare(`
                    INSERT INTO user_levels (
                        user_id, level, total_exp, available_points, total_points_earned,
                        user_eval_count, merchant_eval_count, text_eval_count,
                        display_name, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    user.user_id,
                    level,
                    totalExp,
                    totalPoints,
                    totalPoints,
                    user.evaluation_count,
                    merchantEvalCount,
                    textEvalCount,
                    `用户${user.user_id}`, // 默认显示名称
                    user.first_evaluation,
                    user.last_evaluation
                );
                
                // 记录积分历史
                levelDb.prepare(`
                    INSERT INTO points_log (
                        user_id, source_group_id, action_type, exp_change, points_change,
                        exp_after, points_after, description, timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    user.user_id,
                    'sync',
                    'historical_sync',
                    totalExp,
                    totalPoints,
                    totalExp,
                    totalPoints,
                    `历史数据同步：${user.evaluation_count}次评价`,
                    user.last_evaluation
                );
                
                console.log(`✅ 同步用户 ${user.user_id}: Lv.${level}, ${totalExp}经验, ${totalPoints}积分`);
                syncedCount++;
                
            } catch (error) {
                console.error(`❌ 同步用户 ${user.user_id} 失败:`, error);
            }
        }
        
        // 10. 同步结果统计
        console.log('\n📊 同步结果统计:');
        console.log(`✅ 成功同步: ${syncedCount} 个用户`);
        console.log(`⏭️ 跳过已存在: ${skippedCount} 个用户`);
        console.log(`📈 总用户数: ${evaluationUsers.length}`);
        
        // 11. 验证同步结果
        const levelUsers = levelDb.prepare(`
            SELECT COUNT(*) as count FROM user_levels
        `).get();
        
        console.log(`🎯 等级系统中现有用户数: ${levelUsers.count}`);
        
        // 12. 显示排行榜预览
        const topUsers = levelDb.prepare(`
            SELECT user_id, display_name, level, total_exp, available_points
            FROM user_levels 
            ORDER BY total_exp DESC 
            LIMIT 10
        `).all();
        
        if (topUsers.length > 0) {
            console.log('\n🏆 用户排行榜预览:');
            topUsers.forEach((user, index) => {
                console.log(`  ${index + 1}. ${user.display_name} - Lv.${user.level} (${user.total_exp}经验, ${user.available_points}积分)`);
            });
        }
        
        // 13. 关闭数据库连接
        mainDb.close();
        levelDb.close();
        
        console.log('\n🎉 数据同步完成！');
        
    } catch (error) {
        console.error('❌ 数据同步失败:', error);
        console.error(error.stack);
    }
}

// 运行同步
if (require.main === module) {
    syncFromMainDatabase();
}

module.exports = { syncFromMainDatabase }; 