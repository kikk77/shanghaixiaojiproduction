const { db } = require('../config/database');

/**
 * 更新地区数据为广州的地区
 */
async function updateGuangzhouRegions() {
    console.log('🔄 开始更新地区数据为广州地区...');
    
    try {
        // 广州地区数据
        const guangzhouRegions = [
            { id: 1, name: '天河区', sort_order: 1 },
            { id: 2, name: '越秀区', sort_order: 2 },
            { id: 3, name: '海珠区', sort_order: 3 },
            { id: 4, name: '荔湾区', sort_order: 4 },
            { id: 5, name: '白云区', sort_order: 5 },
            { id: 6, name: '黄埔区', sort_order: 6 },
            { id: 7, name: '番禺区', sort_order: 7 },
            { id: 8, name: '花都区', sort_order: 8 },
            { id: 9, name: '南沙区', sort_order: 9 },
            { id: 10, name: '从化区', sort_order: 10 },
            { id: 11, name: '增城区', sort_order: 11 }
        ];
        
        // 检查现有地区
        const existingRegions = db.prepare('SELECT * FROM regions ORDER BY id').all();
        console.log('当前地区数据:', existingRegions.map(r => `${r.id}: ${r.name}`));
        
        // 更新地区名称
        const updateRegion = db.prepare('UPDATE regions SET name = ?, sort_order = ? WHERE id = ?');
        
        for (const region of guangzhouRegions) {
            const existing = existingRegions.find(r => r.id === region.id);
            if (existing) {
                updateRegion.run(region.name, region.sort_order, region.id);
                console.log(`✅ 更新地区 ID ${region.id}: ${existing.name} -> ${region.name}`);
            } else {
                // 如果不存在，则插入新地区
                const insertRegion = db.prepare('INSERT INTO regions (id, name, sort_order, active) VALUES (?, ?, ?, 1)');
                insertRegion.run(region.id, region.name, region.sort_order);
                console.log(`✅ 创建地区 ID ${region.id}: ${region.name}`);
            }
        }
        
        // 删除多余的地区（如果有）
        const maxId = Math.max(...guangzhouRegions.map(r => r.id));
        const extraRegions = existingRegions.filter(r => r.id > maxId);
        
        if (extraRegions.length > 0) {
            console.log(`发现 ${extraRegions.length} 个多余的地区，需要检查是否可以删除...`);
            
            for (const region of extraRegions) {
                // 检查是否有商家使用这个地区
                const merchantCount = db.prepare('SELECT COUNT(*) as count FROM merchants WHERE region_id = ?').get(region.id);
                
                if (merchantCount.count === 0) {
                    db.prepare('DELETE FROM regions WHERE id = ?').run(region.id);
                    console.log(`✅ 删除未使用的地区 ID ${region.id}: ${region.name}`);
                } else {
                    console.log(`⚠️  保留地区 ID ${region.id}: ${region.name} (有 ${merchantCount.count} 个商家使用)`);
                }
            }
        }
        
        // 验证更新结果
        const updatedRegions = db.prepare('SELECT * FROM regions ORDER BY id').all();
        console.log('\n=== 更新后的地区数据 ===');
        updatedRegions.forEach(region => {
            console.log(`ID ${region.id}: ${region.name} (排序: ${region.sort_order})`);
        });
        
        // 验证商家地区关联
        const merchantRegions = db.prepare(`
            SELECT m.id, m.teacher_name, m.region_id, r.name as region_name
            FROM merchants m
            LEFT JOIN regions r ON m.region_id = r.id
            ORDER BY m.id
        `).all();
        
        console.log('\n=== 商家地区关联验证 ===');
        merchantRegions.forEach(merchant => {
            console.log(`商家 ${merchant.teacher_name} (ID: ${merchant.id}) -> ${merchant.region_name}`);
        });
        
        console.log('\n🎉 广州地区数据更新完成！');
        
    } catch (error) {
        console.error('❌ 更新地区数据失败:', error);
        throw error;
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    updateGuangzhouRegions().then(() => {
        console.log('\n✅ 广州地区数据更新完成');
        process.exit(0);
    }).catch(error => {
        console.error('❌ 更新失败:', error);
        process.exit(1);
    });
}

module.exports = { updateGuangzhouRegions }; 