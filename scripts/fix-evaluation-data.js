const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

console.log('🔧 开始修复评价数据迁移问题...');

// 数据库连接
const dbPath = path.join(__dirname, '..', 'data', 'marketing_bot.db');
const db = new Database(dbPath);

// 读取原始evaluations数据
const evaluationsJsonPath = path.join(__dirname, '..', '..', 'export_2025-06-29T15-35-35-653Z', 'business_data', 'core_business', 'evaluations.json');

try {
    // 检查文件是否存在
    if (!fs.existsSync(evaluationsJsonPath)) {
        console.error('❌ 找不到evaluations.json文件:', evaluationsJsonPath);
        process.exit(1);
    }

    // 读取评价数据
    const evaluationsData = JSON.parse(fs.readFileSync(evaluationsJsonPath, 'utf8'));
    console.log(`📊 找到 ${evaluationsData.length} 条评价记录`);

    // 开始事务
    const transaction = db.transaction(() => {
        // 清空现有的evaluations表数据（如果有的话）
        db.prepare('DELETE FROM evaluations').run();
        console.log('🗑️ 清空现有evaluations表数据');

        // 准备插入语句
        const insertStmt = db.prepare(`
            INSERT INTO evaluations (
                id, booking_session_id, evaluator_type, evaluator_id, target_id,
                overall_score, detailed_scores, comments, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let successCount = 0;
        let errorCount = 0;

        // 逐条插入数据
        for (const evaluation of evaluationsData) {
            try {
                insertStmt.run(
                    evaluation.id,
                    evaluation.booking_session_id,
                    evaluation.evaluator_type,
                    evaluation.evaluator_id,
                    evaluation.target_id,
                    evaluation.overall_score,
                    evaluation.detailed_scores, // 注意：JSON中是detailed_scores，数据库中是detail_scores
                    evaluation.comments,
                    evaluation.status,
                    evaluation.created_at,
                    evaluation.created_at // 使用created_at作为updated_at
                );
                successCount++;
            } catch (error) {
                console.error(`❌ 插入评价记录失败 (ID: ${evaluation.id}):`, error.message);
                errorCount++;
            }
        }

        console.log(`✅ 成功插入 ${successCount} 条评价记录`);
        if (errorCount > 0) {
            console.log(`⚠️ 失败 ${errorCount} 条记录`);
        }
    });

    // 执行事务
    transaction();

    // 验证数据
    const finalCount = db.prepare('SELECT COUNT(*) as count FROM evaluations').get().count;
    console.log(`📊 最终evaluations表记录数: ${finalCount}`);

    // 统计评价状态
    const userEvals = db.prepare("SELECT COUNT(*) as count FROM evaluations WHERE evaluator_type = 'user' AND status = 'completed'").get().count;
    const merchantEvals = db.prepare("SELECT COUNT(*) as count FROM evaluations WHERE evaluator_type = 'merchant' AND status = 'completed'").get().count;
    
    console.log(`👤 用户完成评价: ${userEvals} 条`);
    console.log(`👩‍🏫 商家完成评价: ${merchantEvals} 条`);

    // 检查有双向评价的订单
    const doubleEvals = db.prepare(`
        SELECT booking_session_id, COUNT(*) as eval_count
        FROM evaluations 
        WHERE status IN ('completed', 'detail_completed')
        GROUP BY booking_session_id 
        HAVING COUNT(*) >= 2
    `).all();
    
    console.log(`🔄 双向评价的订单: ${doubleEvals.length} 个`);

    console.log('✅ 评价数据修复完成！');

} catch (error) {
    console.error('❌ 修复评价数据失败:', error);
    process.exit(1);
} finally {
    db.close();
} 