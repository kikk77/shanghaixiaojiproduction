/**
 * 测试增强排行榜服务
 * 
 * 功能：
 * 1. 测试从JSON文件加载评价数据
 * 2. 测试用户评价统计计算
 * 3. 测试增强排行榜数据生成
 * 4. 测试评价趋势分析
 */

const path = require('path');

// 设置项目根目录
process.chdir(path.join(__dirname, '../..'));

async function testEnhancedRankingService() {
    console.log('🧪 开始测试增强排行榜服务...\n');
    
    try {
        // 1. 测试服务初始化
        console.log('1️⃣ 测试服务初始化');
        const enhancedRankingService = require('../services/enhancedRankingService').getInstance();
        console.log('✅ 增强排行榜服务初始化成功\n');
        
        // 2. 测试评价数据加载
        console.log('2️⃣ 测试评价数据加载');
        console.log('数据加载状态:');
        console.log('- 评价数据:', enhancedRankingService.evaluationsData ? `${enhancedRankingService.evaluationsData.length} 条` : '未加载');
        console.log('- 评价详情数据:', enhancedRankingService.evaluationDetailsData ? `${enhancedRankingService.evaluationDetailsData.length} 条` : '未加载');
        console.log('- 评价会话数据:', enhancedRankingService.evaluationSessionsData ? `${enhancedRankingService.evaluationSessionsData.length} 条` : '未加载');
        console.log('');
        
        // 3. 测试用户评价统计
        console.log('3️⃣ 测试用户评价统计');
        
        // 获取测试用户ID（从评价数据中获取）
        if (enhancedRankingService.evaluationsData && enhancedRankingService.evaluationsData.length > 0) {
            const testUserId = enhancedRankingService.evaluationsData[0].evaluator_id;
            console.log(`测试用户ID: ${testUserId}`);
            
            const userStats = enhancedRankingService.getUserEvaluationStats(testUserId);
            if (userStats) {
                console.log('✅ 用户评价统计:');
                console.log(`- 给出评价数: ${userStats.totalEvaluationsGiven}`);
                console.log(`- 收到评价数: ${userStats.totalEvaluationsReceived}`);
                console.log(`- 给出评价平均分: ${userStats.givenStats?.averageOverallScore?.toFixed(2) || 'N/A'}`);
                console.log(`- 收到评价平均分: ${userStats.receivedStats?.averageOverallScore?.toFixed(2) || 'N/A'}`);
                console.log(`- 活跃度分数: ${enhancedRankingService.calculateActivityScore(userStats)}`);
                console.log(`- 质量分数: ${enhancedRankingService.calculateQualityScore(userStats)}`);
            } else {
                console.log('❌ 获取用户评价统计失败');
            }
        } else {
            console.log('⚠️ 没有评价数据可供测试');
        }
        console.log('');
        
        // 4. 测试增强排行榜
        console.log('4️⃣ 测试增强排行榜');
        try {
            const rankings = await enhancedRankingService.getEnhancedRankings('level', 5, true);
            console.log('✅ 增强排行榜数据:');
            rankings.forEach((user, index) => {
                console.log(`${index + 1}. 用户${user.user_id} (${user.display_name})`);
                console.log(`   - 等级: ${user.level}, 经验: ${user.total_exp}, 积分: ${user.available_points}`);
                console.log(`   - 评价统计: 给出${user.evaluation_stats?.totalEvaluationsGiven || 0}, 收到${user.evaluation_stats?.totalEvaluationsReceived || 0}`);
                console.log(`   - 活跃度: ${user.evaluation_activity_score}, 质量: ${user.evaluation_quality_score}`);
            });
        } catch (error) {
            console.log('❌ 获取增强排行榜失败:', error.message);
        }
        console.log('');
        
        // 5. 测试评价趋势分析
        console.log('5️⃣ 测试评价趋势分析');
        const trends = enhancedRankingService.getEvaluationTrends();
        if (trends) {
            console.log('✅ 评价趋势分析:');
            console.log(`- 本周评价总数: ${trends.weekly_total}`);
            console.log(`- 本月评价总数: ${trends.monthly_total}`);
            console.log(`- 本周活跃用户数: ${trends.active_users_weekly}`);
            console.log('- 本周评价排行榜:');
            trends.top_evaluators_weekly.forEach((user, index) => {
                console.log(`  ${index + 1}. 用户${user.user_id}: 给出${user.evaluations_given}, 收到${user.evaluations_received}`);
            });
        } else {
            console.log('❌ 获取评价趋势分析失败');
        }
        console.log('');
        
        // 6. 测试用户详细报告
        console.log('6️⃣ 测试用户详细报告');
        if (enhancedRankingService.evaluationsData && enhancedRankingService.evaluationsData.length > 0) {
            const testUserId = enhancedRankingService.evaluationsData[0].evaluator_id;
            try {
                const report = await enhancedRankingService.getUserEvaluationReport(testUserId);
                if (report) {
                    console.log('✅ 用户详细报告:');
                    console.log(`- 用户ID: ${testUserId}`);
                    console.log(`- 等级信息: Lv.${report.user_level_info?.profile?.level || 0}`);
                    console.log(`- 评价活跃度: ${report.activity_score}`);
                    console.log(`- 评价质量: ${report.quality_score}`);
                    console.log(`- 积分历史记录: ${report.points_history?.length || 0} 条`);
                    console.log(`- 报告生成时间: ${report.report_generated_at}`);
                } else {
                    console.log('❌ 获取用户详细报告失败');
                }
            } catch (error) {
                console.log('❌ 获取用户详细报告失败:', error.message);
            }
        } else {
            console.log('⚠️ 没有评价数据可供测试');
        }
        console.log('');
        
        // 7. 测试API端点
        console.log('7️⃣ 测试API端点');
        console.log('可用的API端点:');
        console.log('- GET /api/level/enhanced-rankings?type=level&limit=10&includeInactive=false');
        console.log('- GET /api/level/user-evaluation-report?userId=123456');
        console.log('- GET /api/level/evaluation-trends');
        console.log('- GET /api/level/user-evaluation-stats?userId=123456');
        console.log('');
        
        console.log('🎉 增强排行榜服务测试完成！');
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        console.error('错误详情:', error.stack);
    }
}

// 运行测试
if (require.main === module) {
    testEnhancedRankingService();
}

module.exports = { testEnhancedRankingService }; 