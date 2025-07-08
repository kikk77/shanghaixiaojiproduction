/**
 * 等级系统集成测试脚本
 * 验证等级系统与主系统的集成是否正常工作
 */

const path = require('path');
const fs = require('fs');

// 设置环境变量
process.env.LEVEL_SYSTEM_ENABLED = 'true';

class LevelSystemIntegrationTest {
    constructor() {
        this.testResults = [];
        this.testUserId = 999999999; // 测试用户ID
    }
    
    async runAllTests() {
        console.log('🧪 开始等级系统集成测试...\n');
        
        // 测试等级系统初始化
        await this.testLevelSystemInitialization();
        
        // 测试数据库隔离
        await this.testDatabaseIsolation();
        
        // 测试等级系统服务
        await this.testLevelSystemServices();
        
        // 测试评价系统集成
        await this.testEvaluationSystemIntegration();
        
        // 测试错误处理
        await this.testErrorHandling();
        
        // 测试性能
        await this.testPerformance();
        
        // 输出测试结果
        this.printTestResults();
        
        return this.testResults.every(result => result.passed);
    }
    
    /**
     * 测试等级系统初始化
     */
    async testLevelSystemInitialization() {
        console.log('📋 测试等级系统初始化...');
        
        try {
            // 测试数据库管理器
            const levelDbManager = require('../config/levelDatabase');
            const levelDb = levelDbManager.getInstance();
            
            this.addTestResult('数据库管理器初始化', levelDb !== null);
            this.addTestResult('数据库启用状态', levelDb.enabled === true);
            this.addTestResult('数据库连接可用', levelDb.getDatabase() !== null);
            
            // 测试等级服务
            const levelService = require('../services/levelService').getInstance();
            this.addTestResult('等级服务初始化', levelService !== null);
            this.addTestResult('等级服务可用性', levelService.isAvailable());
            
            // 测试广播服务
            const broadcastService = require('../services/broadcastService').getInstance();
            this.addTestResult('广播服务初始化', broadcastService !== null);
            this.addTestResult('广播服务可用性', broadcastService.isAvailable());
            
            // 测试勋章服务
            const badgeService = require('../services/badgeService').getInstance();
            this.addTestResult('勋章服务初始化', badgeService !== null);
            this.addTestResult('勋章服务可用性', badgeService.isAvailable());
            
        } catch (error) {
            this.addTestResult('等级系统初始化', false, error.message);
        }
    }
    
    /**
     * 测试数据库隔离
     */
    async testDatabaseIsolation() {
        console.log('🔒 测试数据库隔离...');
        
        try {
            const levelDbManager = require('../config/levelDatabase');
            const levelDb = levelDbManager.getInstance();
            const db = levelDb.getDatabase();
            
            // 检查等级系统数据库文件路径
            const dbPath = levelDb.dbPath;
            this.addTestResult('数据库文件路径独立', dbPath.includes('level_system'));
            this.addTestResult('数据库文件存在', fs.existsSync(dbPath));
            
            // 检查表结构
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            const tableNames = tables.map(t => t.name);
            
            this.addTestResult('用户等级表存在', tableNames.includes('user_levels'));
            this.addTestResult('群组配置表存在', tableNames.includes('group_configs'));
            this.addTestResult('勋章定义表存在', tableNames.includes('badge_definitions'));
            
            // 验证不会访问主数据库表
            const hasMainTables = tableNames.some(name => 
                ['orders', 'evaluations', 'merchants', 'users'].includes(name)
            );
            this.addTestResult('不包含主数据库表', !hasMainTables);
            
        } catch (error) {
            this.addTestResult('数据库隔离测试', false, error.message);
        }
    }
    
    /**
     * 测试等级系统服务
     */
    async testLevelSystemServices() {
        console.log('⚙️ 测试等级系统服务...');
        
        try {
            const levelService = require('../services/levelService').getInstance();
            
            // 测试用户档案创建
            const userProfile = await levelService.createUserProfile(this.testUserId);
            this.addTestResult('用户档案创建', userProfile !== null);
            
            // 测试用户档案获取
            const retrievedProfile = await levelService.getUserProfile(this.testUserId);
            this.addTestResult('用户档案获取', retrievedProfile !== null);
            this.addTestResult('用户档案一致性', 
                retrievedProfile && retrievedProfile.user_id === this.testUserId);
            
            // 测试等级配置获取
            const levelConfig = await levelService.getLevelConfig();
            this.addTestResult('等级配置获取', levelConfig !== null);
            
            // 测试奖励配置获取
            const rewardConfig = await levelService.getRewardConfig();
            this.addTestResult('奖励配置获取', rewardConfig !== null);
            
            // 测试缓存功能
            const cachedProfile = levelService.getCachedUserProfile(this.testUserId);
            this.addTestResult('缓存功能', cachedProfile !== null);
            
        } catch (error) {
            this.addTestResult('等级系统服务测试', false, error.message);
        }
    }
    
    /**
     * 测试评价系统集成
     */
    async testEvaluationSystemIntegration() {
        console.log('🔗 测试评价系统集成...');
        
        try {
            const levelService = require('../services/levelService').getInstance();
            
            // 模拟评价奖励处理
            const oldProfile = await levelService.getUserProfile(this.testUserId);
            const initialExp = oldProfile ? oldProfile.total_exp : 0;
            
            // 处理评价奖励
            await levelService.processEvaluationReward(
                this.testUserId, 
                null, 
                'test_evaluation_123', 
                'evaluate_merchant'
            );
            
            // 检查奖励是否生效
            const newProfile = await levelService.getUserProfile(this.testUserId);
            this.addTestResult('评价奖励处理', newProfile !== null);
            this.addTestResult('经验值增加', 
                newProfile && newProfile.total_exp > initialExp);
            
            // 测试等级系统钩子
            const levelServiceHook = require('../services/levelServiceHook');
            this.addTestResult('等级系统钩子可用', 
                typeof levelServiceHook.onEvaluationComplete === 'function');
            
        } catch (error) {
            this.addTestResult('评价系统集成测试', false, error.message);
        }
    }
    
    /**
     * 测试错误处理
     */
    async testErrorHandling() {
        console.log('🛡️ 测试错误处理...');
        
        try {
            const levelService = require('../services/levelService').getInstance();
            
            // 测试无效用户ID
            const invalidResult = await levelService.processEvaluationReward(
                null, null, 'invalid_test', 'invalid_action'
            );
            this.addTestResult('无效参数处理', invalidResult === null);
            
            // 测试无效动作类型
            const invalidActionResult = await levelService.processEvaluationReward(
                this.testUserId, null, 'test_123', 'invalid_action_type'
            );
            this.addTestResult('无效动作类型处理', invalidActionResult === null);
            
            // 测试服务健康状态
            const healthStatus = levelService.getHealthStatus();
            this.addTestResult('健康状态检查', healthStatus !== null);
            this.addTestResult('健康状态完整性', 
                healthStatus.hasOwnProperty('enabled') && 
                healthStatus.hasOwnProperty('databaseAvailable'));
            
        } catch (error) {
            this.addTestResult('错误处理测试', false, error.message);
        }
    }
    
    /**
     * 测试性能
     */
    async testPerformance() {
        console.log('🚀 测试性能...');
        
        try {
            const levelService = require('../services/levelService').getInstance();
            
            // 测试缓存性能
            const startTime = Date.now();
            
            // 连续获取用户档案（应该使用缓存）
            for (let i = 0; i < 10; i++) {
                await levelService.getUserProfile(this.testUserId);
            }
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            this.addTestResult('缓存性能', duration < 100); // 应该在100ms内完成
            
            // 测试批量操作
            const batchStartTime = Date.now();
            const promises = [];
            
            for (let i = 0; i < 5; i++) {
                promises.push(levelService.processEvaluationReward(
                    this.testUserId + i, 
                    null, 
                    `test_batch_${i}`, 
                    'evaluate_merchant'
                ));
            }
            
            await Promise.all(promises);
            const batchEndTime = Date.now();
            const batchDuration = batchEndTime - batchStartTime;
            
            this.addTestResult('批量操作性能', batchDuration < 1000); // 应该在1秒内完成
            
        } catch (error) {
            this.addTestResult('性能测试', false, error.message);
        }
    }
    
    /**
     * 添加测试结果
     */
    addTestResult(testName, passed, error = null) {
        const result = {
            name: testName,
            passed: passed,
            error: error
        };
        
        this.testResults.push(result);
        
        const status = passed ? '✅' : '❌';
        const errorMsg = error ? ` (${error})` : '';
        console.log(`  ${status} ${testName}${errorMsg}`);
    }
    
    /**
     * 打印测试结果
     */
    printTestResults() {
        console.log('\n📊 测试结果汇总:');
        console.log('='.repeat(50));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.passed).length;
        const failedTests = totalTests - passedTests;
        
        console.log(`总测试数: ${totalTests}`);
        console.log(`通过: ${passedTests}`);
        console.log(`失败: ${failedTests}`);
        console.log(`成功率: ${Math.round((passedTests / totalTests) * 100)}%`);
        
        if (failedTests > 0) {
            console.log('\n❌ 失败的测试:');
            this.testResults.filter(r => !r.passed).forEach(result => {
                console.log(`  - ${result.name}: ${result.error || '未知错误'}`);
            });
        }
        
        console.log('\n' + '='.repeat(50));
        
        if (failedTests === 0) {
            console.log('🎉 所有测试都通过了！等级系统集成正常。');
        } else {
            console.log('⚠️ 有测试失败，请检查等级系统配置。');
        }
    }
    
    /**
     * 清理测试数据
     */
    async cleanup() {
        try {
            const levelDbManager = require('../config/levelDatabase');
            const levelDb = levelDbManager.getInstance();
            const db = levelDb.getDatabase();
            
            if (db) {
                // 删除测试用户数据
                db.prepare('DELETE FROM user_levels WHERE user_id >= ?').run(this.testUserId);
                db.prepare('DELETE FROM points_log WHERE user_id >= ?').run(this.testUserId);
                db.prepare('DELETE FROM user_badges WHERE user_id >= ?').run(this.testUserId);
                
                console.log('🧹 测试数据已清理');
            }
        } catch (error) {
            console.error('清理测试数据失败:', error);
        }
    }
}

// 运行测试
async function runTests() {
    const tester = new LevelSystemIntegrationTest();
    
    try {
        const allPassed = await tester.runAllTests();
        await tester.cleanup();
        
        process.exit(allPassed ? 0 : 1);
    } catch (error) {
        console.error('测试运行失败:', error);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    runTests();
}

module.exports = LevelSystemIntegrationTest; 