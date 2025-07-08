/**
 * 测试等级系统播报功能
 */

const broadcastService = require('../services/broadcastService').getInstance();

async function testBroadcastSystem() {
    console.log('🧪 开始测试等级系统播报功能...\n');
    
    // 检查等级系统是否启用
    if (!process.env.LEVEL_SYSTEM_ENABLED === 'true') {
        console.log('❌ 等级系统未启用，请设置环境变量 LEVEL_SYSTEM_ENABLED=true');
        return;
    }
    
    console.log('📋 测试项目:');
    console.log('1. 获取播报配置');
    console.log('2. 获取播报目标群组');
    console.log('3. 测试等级提升播报');
    console.log('4. 测试勋章解锁播报\n');
    
    try {
        // 1. 测试获取播报配置
        console.log('📌 测试1: 获取播报配置');
        const broadcastConfig = await broadcastService.getBroadcastConfig();
        console.log('播报配置:', broadcastConfig);
        
        if (!broadcastConfig) {
            console.log('⚠️ 未找到播报配置，使用默认配置');
        }
        
        // 2. 测试获取播报目标群组
        console.log('\n📌 测试2: 获取播报目标群组');
        const targetGroups = await broadcastService.getBroadcastTargetGroups();
        console.log('目标群组:', targetGroups);
        
        if (targetGroups.length === 0) {
            console.log('⚠️ 没有配置播报群组');
            console.log('💡 提示: 请在管理面板创建群组配置，或设置环境变量 GROUP_CHAT_ID');
            return;
        }
        
        // 3. 测试等级提升播报
        console.log('\n📌 测试3: 等级提升播报');
        const levelUpData = {
            user_name: '@测试用户_升级',
            old_level: 2,
            new_level: 3,
            level_name: '中级勇士 🟣',
            level_up_points: 50
        };
        
        console.log('发送测试播报（等级提升）...');
        const levelUpTestResult = await broadcastService.testBroadcast('level_up', levelUpData);
        
        if (levelUpTestResult.success) {
            console.log('✅ 等级提升播报测试成功');
            console.log('播报结果:', levelUpTestResult.results);
        } else {
            console.log('❌ 等级提升播报测试失败:', levelUpTestResult.error);
        }
        
        // 4. 测试勋章解锁播报
        console.log('\n📌 测试4: 勋章解锁播报');
        const badgeData = {
            user_name: '@测试用户_勋章',
            badge_emoji: '🏆',
            badge_name: '评价大师',
            badge_desc: '累计完成100次评价'
        };
        
        console.log('发送测试播报（勋章解锁）...');
        const badgeResult = await broadcastService.testBroadcast('badge_unlock', badgeData);
        
        if (badgeResult.success) {
            console.log('✅ 勋章解锁播报测试成功');
            console.log('播报结果:', badgeResult.results);
        } else {
            console.log('❌ 勋章解锁播报测试失败:', badgeResult.error);
        }
        
        // 5. 测试真实场景
        console.log('\n📌 测试5: 模拟真实升级场景');
        console.log('提示: 此测试会模拟用户真实升级的播报流程');
        
        const realUserId = 6843026401; // @xiaoji57
        const levelUpResult = {
            leveledUp: true,
            oldLevel: 1,
            newLevel: 2,
            oldLevelInfo: { level: 1, name: '新手勇士 🟢' },
            newLevelInfo: { level: 2, name: '初级勇士 🔵' }
        };
        
        console.log(`模拟用户 ${realUserId} 升级..`);
        const realResult = await broadcastService.broadcastLevelUp(realUserId, null, levelUpResult);
        
        if (realResult.success) {
            console.log('✅ 真实场景测试成功');
            console.log('成功播报到的群组数:', realResult.results.filter(r => r.success).length);
        } else {
            console.log('❌ 真实场景测试失败:', realResult.error);
        }
        
    } catch (error) {
        console.error('❌ 测试过程中出错:', error);
    }
    
    console.log('\n🏁 播报系统测试完成');
}

// 运行测试
if (require.main === module) {
    testBroadcastSystem().then(() => {
        console.log('\n测试脚本执行完成');
        process.exit(0);
    }).catch(error => {
        console.error('测试脚本执行失败:', error);
        process.exit(1);
    });
}

module.exports = testBroadcastSystem; 