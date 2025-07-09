const { db } = require('../config/database');
const dbOperations = require('../models/dbOperations');

/**
 * 修复商家绑定问题
 * 解决商家user_id为空但绑定码已使用的情况
 */
async function fixMerchantBinding() {
    console.log('🔄 开始修复商家绑定问题...');
    
    try {
        // 1. 查找所有user_id为空但绑定码已使用的商家
        const problematicMerchants = db.prepare(`
            SELECT m.*, bc.used_by 
            FROM merchants m 
            LEFT JOIN bind_codes bc ON m.bind_code = bc.code 
            WHERE (m.user_id IS NULL OR m.user_id = 0) 
            AND bc.used_by IS NOT NULL
        `).all();
        
        console.log(`发现 ${problematicMerchants.length} 个需要修复的商家`);
        
        if (problematicMerchants.length === 0) {
            console.log('✅ 没有发现需要修复的商家绑定问题');
            return;
        }
        
        // 2. 修复每个商家的user_id
        for (const merchant of problematicMerchants) {
            try {
                console.log(`🔧 修复商家: ${merchant.teacher_name} (ID: ${merchant.id})`);
                console.log(`   绑定码: ${merchant.bind_code}`);
                console.log(`   应该绑定到用户: ${merchant.used_by}`);
                
                // 更新商家的user_id
                dbOperations.updateMerchantUserId(merchant.id, merchant.used_by);
                
                console.log(`✅ 商家 ${merchant.teacher_name} 的user_id已更新为: ${merchant.used_by}`);
                
            } catch (error) {
                console.error(`❌ 修复商家 ${merchant.teacher_name} 失败:`, error);
            }
        }
        
        // 3. 验证修复结果
        console.log('\n🔍 验证修复结果...');
        const stillProblematic = db.prepare(`
            SELECT m.*, bc.used_by 
            FROM merchants m 
            LEFT JOIN bind_codes bc ON m.bind_code = bc.code 
            WHERE (m.user_id IS NULL OR m.user_id = 0) 
            AND bc.used_by IS NOT NULL
        `).all();
        
        if (stillProblematic.length === 0) {
            console.log('✅ 所有商家绑定问题已修复！');
        } else {
            console.log(`⚠️ 还有 ${stillProblematic.length} 个商家需要进一步处理`);
            stillProblematic.forEach(merchant => {
                console.log(`   - ${merchant.teacher_name} (ID: ${merchant.id})`);
            });
        }
        
        // 4. 显示所有商家的当前状态
        console.log('\n📋 当前所有商家绑定状态:');
        const allMerchants = db.prepare(`
            SELECT m.id, m.teacher_name, m.user_id, m.bind_code, bc.used_by, bc.used
            FROM merchants m 
            LEFT JOIN bind_codes bc ON m.bind_code = bc.code 
            ORDER BY m.id
        `).all();
        
        allMerchants.forEach(merchant => {
            const status = merchant.user_id ? '✅ 已绑定' : '❌ 未绑定';
            console.log(`   ${merchant.teacher_name} (ID: ${merchant.id}) - ${status}`);
            if (merchant.user_id) {
                console.log(`      用户ID: ${merchant.user_id}`);
            }
            if (merchant.bind_code) {
                console.log(`      绑定码: ${merchant.bind_code} (${merchant.used ? '已使用' : '未使用'})`);
            }
        });
        
    } catch (error) {
        console.error('❌ 修复过程中出现错误:', error);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    fixMerchantBinding().then(() => {
        console.log('🎉 修复完成');
        process.exit(0);
    }).catch(error => {
        console.error('❌ 修复失败:', error);
        process.exit(1);
    });
}

module.exports = { fixMerchantBinding }; 