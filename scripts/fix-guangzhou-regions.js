const { db } = require('../config/database');

/**
 * 修复广州地区数据问题
 * 1. 检查地区表数据
 * 2. 检查商家地区关联
 * 3. 检查订单地区关联
 * 4. 修复数据不一致问题
 */
async function fixGuangzhouRegions() {
    console.log('🔍 开始诊断广州地区数据问题...');
    
    try {
        // 1. 检查地区表
        console.log('\n=== 地区表检查 ===');
        const regions = db.prepare('SELECT * FROM regions ORDER BY id').all();
        console.log('地区表数据:', regions);
        
        if (regions.length === 0) {
            console.log('⚠️  地区表为空，创建广州地区数据...');
            const guangzhouRegions = [
                { name: '天河区', sort_order: 1 },
                { name: '越秀区', sort_order: 2 },
                { name: '海珠区', sort_order: 3 },
                { name: '荔湾区', sort_order: 4 },
                { name: '白云区', sort_order: 5 },
                { name: '黄埔区', sort_order: 6 },
                { name: '番禺区', sort_order: 7 },
                { name: '花都区', sort_order: 8 },
                { name: '南沙区', sort_order: 9 },
                { name: '从化区', sort_order: 10 },
                { name: '增城区', sort_order: 11 }
            ];
            
            const insertRegion = db.prepare('INSERT INTO regions (name, sort_order) VALUES (?, ?)');
            guangzhouRegions.forEach(region => {
                insertRegion.run(region.name, region.sort_order);
                console.log(`✅ 创建地区: ${region.name}`);
            });
        }
        
        // 2. 检查商家地区关联
        console.log('\n=== 商家地区关联检查 ===');
        const merchants = db.prepare(`
            SELECT m.id, m.teacher_name, m.region_id, r.name as region_name
            FROM merchants m
            LEFT JOIN regions r ON m.region_id = r.id
            ORDER BY m.id
        `).all();
        
        console.log('商家地区关联情况:');
        merchants.forEach(merchant => {
            console.log(`商家 ${merchant.teacher_name} (ID: ${merchant.id}) -> 地区ID: ${merchant.region_id} (${merchant.region_name || '未关联'})`);
        });
        
        // 3. 检查订单地区关联
        console.log('\n=== 订单地区关联检查 ===');
        const orderRegionCheck = db.prepare(`
            SELECT 
                o.id, 
                o.order_number,
                o.merchant_id,
                m.teacher_name,
                o.region_id as order_region_id,
                m.region_id as merchant_region_id,
                r1.name as order_region_name,
                r2.name as merchant_region_name
            FROM orders o
            LEFT JOIN merchants m ON o.merchant_id = m.id
            LEFT JOIN regions r1 ON o.region_id = r1.id
            LEFT JOIN regions r2 ON m.region_id = r2.id
            ORDER BY o.id DESC
            LIMIT 10
        `).all();
        
        console.log('订单地区关联情况（最近10条）:');
        orderRegionCheck.forEach(order => {
            console.log(`订单 ${order.order_number} -> 商家: ${order.teacher_name}`);
            console.log(`  订单地区ID: ${order.order_region_id} (${order.order_region_name || '无'})`);
            console.log(`  商家地区ID: ${order.merchant_region_id} (${order.merchant_region_name || '无'})`);
            console.log('---');
        });
        
        // 4. 修复商家没有地区的问题
        console.log('\n=== 修复商家地区关联 ===');
        const merchantsWithoutRegion = db.prepare(`
            SELECT * FROM merchants WHERE region_id IS NULL OR region_id = 0
        `).all();
        
        if (merchantsWithoutRegion.length > 0) {
            console.log(`发现 ${merchantsWithoutRegion.length} 个商家没有地区关联`);
            
            // 获取第一个地区作为默认地区
            const defaultRegion = db.prepare('SELECT id FROM regions ORDER BY sort_order LIMIT 1').get();
            if (defaultRegion) {
                const updateMerchantRegion = db.prepare('UPDATE merchants SET region_id = ? WHERE id = ?');
                merchantsWithoutRegion.forEach(merchant => {
                    updateMerchantRegion.run(defaultRegion.id, merchant.id);
                    console.log(`✅ 修复商家 ${merchant.teacher_name} 的地区关联`);
                });
            }
        } else {
            console.log('✅ 所有商家都有地区关联');
        }
        
        // 5. 修复订单地区关联
        console.log('\n=== 修复订单地区关联 ===');
        const ordersWithoutRegion = db.prepare(`
            SELECT o.*, m.region_id as merchant_region_id 
            FROM orders o 
            LEFT JOIN merchants m ON o.merchant_id = m.id 
            WHERE (o.region_id IS NULL OR o.region_id = 0) AND m.region_id IS NOT NULL
        `).all();
        
        if (ordersWithoutRegion.length > 0) {
            console.log(`发现 ${ordersWithoutRegion.length} 个订单需要修复地区关联`);
            
            const updateOrderRegion = db.prepare('UPDATE orders SET region_id = ? WHERE id = ?');
            ordersWithoutRegion.forEach(order => {
                updateOrderRegion.run(order.merchant_region_id, order.id);
                console.log(`✅ 修复订单 ${order.order_number} 的地区关联`);
            });
        } else {
            console.log('✅ 所有订单都有地区关联');
        }
        
        // 6. 最终验证
        console.log('\n=== 最终验证 ===');
        const finalCheck = db.prepare(`
            SELECT 
                COUNT(*) as total_orders,
                COUNT(CASE WHEN r.name IS NOT NULL THEN 1 END) as orders_with_region,
                COUNT(CASE WHEN r.name IS NULL THEN 1 END) as orders_without_region
            FROM orders o
            LEFT JOIN merchants m ON o.merchant_id = m.id
            LEFT JOIN regions r ON m.region_id = r.id
        `).get();
        
        console.log('修复结果统计:');
        console.log(`总订单数: ${finalCheck.total_orders}`);
        console.log(`有地区的订单: ${finalCheck.orders_with_region}`);
        console.log(`无地区的订单: ${finalCheck.orders_without_region}`);
        
        if (finalCheck.orders_without_region === 0) {
            console.log('🎉 所有订单地区关联修复完成！');
        } else {
            console.log(`⚠️  还有 ${finalCheck.orders_without_region} 个订单没有地区关联`);
        }
        
    } catch (error) {
        console.error('❌ 修复过程中出现错误:', error);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    fixGuangzhouRegions().then(() => {
        console.log('\n✅ 广州地区数据修复完成');
        process.exit(0);
    }).catch(error => {
        console.error('❌ 修复失败:', error);
        process.exit(1);
    });
}

module.exports = { fixGuangzhouRegions }; 