/**
 * 测试等级提升广播功能
 */

const levelService = require('../services/levelService').getInstance();
const Database = require('better-sqlite3');

async function testBroadcastLevelUp() {
    console.log('🧪 测试等级提升广播功能...\n');
    
    // 检查等级系统是否启用
    if (!levelService.enabled) {
        console.log('❌ 等级系统未启用');
        return;
    }
    
    const testUserId = 6843026401; // @xiaoji57
    
    try {
        // 1. 获取当前用户信息
        console.log('📊 获取用户当前信息...');
        const currentInfo = await levelService.getUserLevelInfo(testUserId);
        
        if (!currentInfo || !currentInfo.profile) {
            console.log('❌ 用户不存在');
            return;
        }
        
        console.log(`当前等级: Lv.${currentInfo.profile.level}`);
        console.log(`当前经验: ${currentInfo.profile.total_exp}`);
        console.log(`当前评价数: ${currentInfo.profile.user_eval_count}`);
        
        // 2. 模拟增加经验值以触发升级
        console.log('\n🎮 模拟增加经验值...');
        
        // 获取下一级所需经验
        if (currentInfo.nextLevel) {
            const expNeeded = currentInfo.nextLevel.required_exp - currentInfo.profile.total_exp;
            console.log(`升级所需经验: ${expNeeded}`);
            
            // 直接更新数据库中的经验值
            const levelDbManager = require('../config/levelDatabase').getInstance();
            const db = levelDbManager.getDatabase();
            
            if (db) {
                // 先备份当前数据
                const backupStmt = db.prepare('SELECT * FROM user_levels WHERE user_id = ?');
                const backup = backupStmt.get(testUserId);
                console.log('✅ 已备份用户数据');
                
                // 更新经验值到足够升级
                const updateStmt = db.prepare(`
                    UPDATE user_levels 
                    SET total_exp = ?, updated_at = ?
                    WHERE user_id = ?
                `);
                updateStmt.run(
                    currentInfo.nextLevel.required_exp + 10, // 超过升级所需一点
                    Date.now() / 1000,
                    testUserId
                );
                console.log('✅ 已更新经验值');
                
                // 3. 手动触发升级检查
                console.log('\n🏆 检查升级...');
                
                // 获取更新后的用户数据
                const updatedProfile = db.prepare('SELECT * FROM user_levels WHERE user_id = ?').get(testUserId);
                
                // 模拟升级结果
                const levelUpResult = {
                    leveledUp: true,
                    oldLevel: currentInfo.profile.level,
                    newLevel: currentInfo.nextLevel.level,
                    oldLevelInfo: currentInfo.currentLevel,
                    newLevelInfo: currentInfo.nextLevel
                };
                
                console.log(`✨ 模拟升级: Lv.${levelUpResult.oldLevel} → Lv.${levelUpResult.newLevel}`);
                
                // 4. 测试广播功能
                console.log('\n📢 测试广播功能...');
                console.log('注意: 由于没有配置Telegram Bot Token，实际广播会失败');
                console.log('但我们可以看到广播逻辑是否正常执行\n');
                
                // 调用广播函数
                await levelService.handleLevelUp(testUserId, null, levelUpResult);
                
                console.log('\n✅ 广播函数调用完成');
                
                // 5. 恢复原始数据
                console.log('\n🔄 恢复原始数据...');
                const restoreStmt = db.prepare(`
                    UPDATE user_levels 
                    SET level = ?, total_exp = ?, updated_at = ?
                    WHERE user_id = ?
                `);
                restoreStmt.run(
                    backup.level,
                    backup.total_exp,
                    Date.now() / 1000,
                    testUserId
                );
                console.log('✅ 数据已恢复');
                
            } else {
                console.log('❌ 无法获取数据库连接');
            }
            
        } else {
            console.log('ℹ️ 用户已达到最高等级，无法测试升级');
        }
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
    }
    
    console.log('\n✅ 测试完成！');
}

// 运行测试
if (require.main === module) {
    testBroadcastLevelUp().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('❌ 测试失败:', error);
        process.exit(1);
    });
}

module.exports = testBroadcastLevelUp; 