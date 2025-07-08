/**
 * 测试排行榜筛选功能
 */

const levelService = require('../services/levelService').getInstance();

async function testRankingFilter() {
    console.log('🧪 测试排行榜筛选功能...\n');
    
    // 1. 测试默认排行榜（只显示有评价记录的用户）
    console.log('📊 测试1: 默认排行榜（只显示有评价记录的用户）');
    console.log('参数: includeInactive = false');
    const activeRanking = await levelService.getRankings('level', 10, false);
    console.log(`结果: 找到 ${activeRanking.length} 个用户`);
    
    if (activeRanking.length > 0) {
        console.log('\n排行榜前5名:');
        activeRanking.slice(0, 5).forEach((user, index) => {
            console.log(`${index + 1}. ${user.display_name} (ID: ${user.user_id})`);
            console.log(`   等级: Lv.${user.level} | 经验: ${user.total_exp} | 评价数: ${user.user_eval_count}`);
        });
    }
    
    // 2. 测试包含所有用户的排行榜
    console.log('\n\n📊 测试2: 包含所有用户的排行榜');
    console.log('参数: includeInactive = true');
    const allRanking = await levelService.getRankings('level', 10, true);
    console.log(`结果: 找到 ${allRanking.length} 个用户`);
    
    if (allRanking.length > 0) {
        console.log('\n排行榜前5名:');
        allRanking.slice(0, 5).forEach((user, index) => {
            console.log(`${index + 1}. ${user.display_name} (ID: ${user.user_id})`);
            console.log(`   等级: Lv.${user.level} | 经验: ${user.total_exp} | 评价数: ${user.user_eval_count}`);
        });
    }
    
    // 3. 分析差异
    console.log('\n\n📊 分析差异:');
    console.log(`- 有评价记录的用户数: ${activeRanking.length}`);
    console.log(`- 全部用户数: ${allRanking.length}`);
    console.log(`- 无评价记录的用户数: ${allRanking.length - activeRanking.length}`);
    
    // 4. 测试不同排序类型
    console.log('\n\n📊 测试3: 不同排序类型');
    const sortTypes = ['level', 'points', 'exp'];
    
    for (const type of sortTypes) {
        console.log(`\n排序类型: ${type}`);
        const ranking = await levelService.getRankings(type, 3, false);
        console.log(`找到 ${ranking.length} 个用户`);
        if (ranking.length > 0) {
            ranking.forEach((user, index) => {
                console.log(`${index + 1}. ${user.display_name} - Lv.${user.level} | 经验:${user.total_exp} | 积分:${user.available_points}`);
            });
        }
    }
    
    console.log('\n✅ 测试完成！');
}

// 运行测试
if (require.main === module) {
    testRankingFilter().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('❌ 测试失败:', error);
        process.exit(1);
    });
}

module.exports = testRankingFilter; 