#!/usr/bin/env node

/**
 * 导入导出的数据到开发环境
 * 用于测试等级系统功能
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const envHelper = require('../utils/environmentHelper');

console.log('📥 开始导入导出数据到开发环境...');

async function importExportData() {
    try {
        // 获取数据库路径
        const mainDbPath = envHelper.getMainDatabasePath();
        console.log(`📂 目标数据库: ${mainDbPath}`);
        
        // 连接数据库
        const db = new Database(mainDbPath);
        
        // 禁用外键约束
        db.pragma('foreign_keys = OFF');
        
        // 1. 导入评价数据
        const evaluationsPath = path.join(__dirname, '../business_data/core_business/evaluations.json');
        console.log(`🔍 检查评价数据文件: ${evaluationsPath}`);
        console.log(`📁 文件存在: ${fs.existsSync(evaluationsPath)}`);
        
        if (fs.existsSync(evaluationsPath)) {
            console.log('\n📊 导入评价数据...');
            const evaluations = JSON.parse(fs.readFileSync(evaluationsPath, 'utf8'));
            console.log(`📋 找到 ${evaluations.length} 条评价记录`);
            
            // 创建评价表（如果不存在）
            db.exec(`
                CREATE TABLE IF NOT EXISTS evaluations (
                    id INTEGER PRIMARY KEY,
                    evaluator_id INTEGER,
                    evaluator_type TEXT,
                    target_id INTEGER,
                    booking_session_id INTEGER,
                    overall_score INTEGER,
                    status TEXT,
                    comments TEXT,
                    created_at INTEGER
                )
            `);
            
            // 清空现有数据
            db.exec('DELETE FROM evaluations');
            
            // 插入评价数据
            const stmt = db.prepare(`
                INSERT INTO evaluations (
                    id, evaluator_id, evaluator_type, target_id, booking_session_id,
                    overall_score, status, comments, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            let insertedCount = 0;
            for (const eval of evaluations) {
                try {
                    stmt.run(
                        eval.id, eval.evaluator_id, eval.evaluator_type,
                        eval.target_id, eval.booking_session_id,
                        eval.overall_score, eval.status, eval.comments, eval.created_at
                    );
                    insertedCount++;
                } catch (error) {
                    console.error(`❌ 插入评价 ${eval.id} 失败:`, error.message);
                }
            }
            
            console.log(`✅ 成功导入 ${insertedCount} 条评价数据`);
        } else {
            console.log('❌ 评价数据文件不存在！');
        }
        
        // 2. 导入订单数据（只导入有评价的用户的订单）
        const ordersPath = path.join(__dirname, '../business_data/core_business/orders.json');
        
        if (fs.existsSync(ordersPath)) {
            console.log('\n📊 导入订单数据...');
            const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
            
            // 获取有评价的用户ID
            const userIds = db.prepare('SELECT DISTINCT evaluator_id FROM evaluations').all().map(r => r.evaluator_id);
            
            // 过滤订单数据
            const relevantOrders = orders.filter(o => userIds.includes(o.user_id));
            
            // 创建订单表（如果不存在）
            db.exec(`
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER,
                    user_name TEXT,
                    user_username TEXT,
                    merchant_id INTEGER,
                    status TEXT,
                    created_at INTEGER
                )
            `);
            
            // 清空现有数据
            db.exec('DELETE FROM orders');
            
            // 插入订单数据
            const orderStmt = db.prepare(`
                INSERT INTO orders (
                    id, user_id, user_name, user_username, merchant_id, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            let orderInsertedCount = 0;
            for (const order of relevantOrders) {
                try {
                    orderStmt.run(
                        order.id, order.user_id, order.user_name || '未设置',
                        order.user_username || '未设置用户名', order.merchant_id,
                        order.status, order.created_at
                    );
                    orderInsertedCount++;
                } catch (error) {
                    console.error(`❌ 插入订单 ${order.id} 失败:`, error.message);
                }
            }
            
            console.log(`✅ 成功导入 ${orderInsertedCount} 条订单数据`);
        }
        
        // 3. 显示统计
        const stats = db.prepare(`
            SELECT 
                (SELECT COUNT(DISTINCT evaluator_id) FROM evaluations WHERE status = 'completed') as eval_users,
                (SELECT COUNT(*) FROM evaluations WHERE status = 'completed') as total_evals,
                (SELECT COUNT(DISTINCT user_id) FROM orders) as order_users,
                (SELECT COUNT(*) FROM orders) as total_orders
        `).get();
        
        console.log('\n📊 导入统计:');
        console.log(`- 有评价的用户数: ${stats.eval_users}`);
        console.log(`- 总评价数: ${stats.total_evals}`);
        console.log(`- 有订单的用户数: ${stats.order_users}`);
        console.log(`- 总订单数: ${stats.total_orders}`);
        
        db.close();
        console.log('\n✅ 数据导入完成！');
        console.log('📌 现在可以运行 node level/scripts/sync-production-data.js 来同步等级数据');
        
    } catch (error) {
        console.error('❌ 导入失败:', error);
        process.exit(1);
    }
}

// 执行导入
importExportData(); 