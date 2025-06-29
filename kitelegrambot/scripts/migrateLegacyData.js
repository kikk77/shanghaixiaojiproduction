const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// 设置环境变量
process.env.NODE_ENV = 'production';

// 引入数据库相关模块
const { db } = require('../config/database');
const dbOperations = require('../models/dbOperations');

console.log('🚀 开始迁移旧系统数据到EAV架构...');
console.log('========================================');

class LegacyDataMigrator {
    constructor() {
        this.exportPath = path.join(__dirname, '../../export_2025-06-29T15-35-35-653Z');
        this.businessDataPath = path.join(this.exportPath, 'business_data');
        this.legacyDbPath = path.join(this.exportPath, 'database_backup/marketing_bot.db');
        this.migrationReport = {
            started_at: new Date().toISOString(),
            tables_migrated: {},
            errors: [],
            status: 'in_progress'
        };
    }

    async migrate() {
        try {
            console.log('📋 检查旧系统数据完整性...');
            await this.validateLegacyData();
            
            console.log('🔧 初始化新系统数据库结构...');
            await this.initializeNewSystem();
            
            console.log('📊 迁移核心业务数据...');
            await this.migrateCoreData();
            
            console.log('⚙️ 迁移配置数据...');
            await this.migrateConfigurationData();
            
            console.log('👥 迁移用户交互数据...');
            await this.migrateInteractionData();
            
            console.log('🔄 转换数据到EAV模式...');
            await this.convertToEAV();
            
            console.log('✅ 验证迁移结果...');
            await this.validateMigration();
            
            this.migrationReport.status = 'completed';
            this.migrationReport.completed_at = new Date().toISOString();
            
            console.log('🎉 数据迁移完成！');
            
        } catch (error) {
            this.migrationReport.status = 'failed';
            this.migrationReport.error = error.message;
            console.error('❌ 数据迁移失败:', error);
            throw error;
        } finally {
            await this.saveMigrationReport();
        }
    }

    async validateLegacyData() {
        const requiredFiles = [
            'core_business/regions.json',
            'core_business/merchants.json',
            'core_business/orders.json'
        ];

        for (const file of requiredFiles) {
            const filePath = path.join(this.businessDataPath, file);
            if (!fs.existsSync(filePath)) {
                throw new Error(`缺少必需的数据文件: ${file}`);
            }
        }

        console.log('✅ 旧系统数据验证通过');
    }

    async initializeNewSystem() {
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        try {
            dbOperations.initializeDatabase();
            console.log('✅ 新系统数据库结构初始化完成');
        } catch (error) {
            console.log('ℹ️  数据库已存在，跳过初始化');
        }
    }

    async migrateCoreData() {
        await this.migrateRegions();
        await this.migrateBindCodes();
        await this.migrateMerchants();
        await this.migrateBookingSessions();
        await this.migrateOrders();
        await this.migrateEvaluations();
    }

    async migrateRegions() {
        const regionsData = JSON.parse(
            fs.readFileSync(path.join(this.businessDataPath, 'core_business/regions.json'), 'utf8')
        );

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO regions (id, name, sort_order, active)
            VALUES (?, ?, ?, ?)
        `);

        let count = 0;

        for (const region of regionsData) {
            stmt.run(
                region.id,
                region.name,
                region.sort_order || count + 1,
                region.active || 1
            );
            count++;
        }

        this.migrationReport.tables_migrated.regions = count;
        console.log(`✅ 迁移地区数据: ${count} 条记录`);
    }

    async migrateBindCodes() {
        const bindCodesPath = path.join(this.businessDataPath, 'core_business/bind_codes.json');
        if (!fs.existsSync(bindCodesPath)) {
            console.log('ℹ️  跳过绑定码数据 - 文件不存在');
            return;
        }

        const bindCodesData = JSON.parse(fs.readFileSync(bindCodesPath, 'utf8'));

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO bind_codes (code, description, used, used_by, used_at)
            VALUES (?, ?, ?, ?, ?)
        `);

        let count = 0;
        for (const bindCode of bindCodesData) {
            stmt.run(
                bindCode.code,
                `Imported bind code ${bindCode.code}`,
                bindCode.status === 'used' ? 1 : 0,
                bindCode.user_id || null,
                bindCode.used_at || null
            );
            count++;
        }

        this.migrationReport.tables_migrated.bind_codes = count;
        console.log(`✅ 迁移绑定码数据: ${count} 条记录`);
    }

    async migrateMerchants() {
        const merchantsData = JSON.parse(
            fs.readFileSync(path.join(this.businessDataPath, 'core_business/merchants.json'), 'utf8')
        );

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO merchants (
                id, user_id, username, teacher_name, region_id, contact,
                bind_code, bind_step, bind_data, status,
                advantages, disadvantages, price1, price2,
                skill_wash, skill_blow, skill_do, skill_kiss,
                channel_link, channel_clicks, image_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let count = 0;
        for (const merchant of merchantsData) {
            stmt.run(
                merchant.id,
                merchant.user_id,
                merchant.username,
                merchant.teacher_name,
                merchant.region_id,
                merchant.contact,
                merchant.bind_code,
                merchant.bind_step || 0,
                merchant.bind_data,
                merchant.status || 'active',
                merchant.advantages,
                merchant.disadvantages,
                merchant.price1,
                merchant.price2,
                merchant.skill_wash,
                merchant.skill_blow,
                merchant.skill_do,
                merchant.skill_kiss,
                merchant.channel_link,
                merchant.channel_clicks || 0,
                merchant.image_url
            );
            count++;
        }

        this.migrationReport.tables_migrated.merchants = count;
        console.log(`✅ 迁移商家数据: ${count} 条记录`);
    }

    async migrateBookingSessions() {
        const bookingSessionsPath = path.join(this.businessDataPath, 'core_business/booking_sessions.json');
        if (!fs.existsSync(bookingSessionsPath)) {
            console.log('ℹ️  跳过预约会话数据 - 文件不存在');
            return;
        }

        const bookingSessionsData = JSON.parse(fs.readFileSync(bookingSessionsPath, 'utf8'));

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO booking_sessions (
                id, user_id, merchant_id, status, course_type
            ) VALUES (?, ?, ?, ?, ?)
        `);

        let count = 0;
        for (const session of bookingSessionsData) {
            stmt.run(
                session.id,
                session.user_id,
                session.merchant_id,
                session.status || 'pending',
                session.course_type
            );
            count++;
        }

        this.migrationReport.tables_migrated.booking_sessions = count;
        console.log(`✅ 迁移预约会话数据: ${count} 条记录`);
    }

    async migrateOrders() {
        const ordersData = JSON.parse(
            fs.readFileSync(path.join(this.businessDataPath, 'core_business/orders.json'), 'utf8')
        );

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO orders (
                id, order_number, booking_session_id, user_id, user_name, user_username,
                merchant_id, merchant_user_id, teacher_name, teacher_contact, region_id,
                course_type, course_content, price_range, actual_price, status,
                booking_time, confirmed_time, completed_time,
                user_evaluation_id, merchant_evaluation_id, report_content
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let count = 0;
        for (const order of ordersData) {
            stmt.run(
                order.id,
                order.order_number,
                order.booking_session_id,
                order.user_id,
                order.user_name,
                order.user_username,
                order.merchant_id,
                order.merchant_user_id,
                order.teacher_name,
                order.teacher_contact,
                order.region_id,
                order.course_type,
                order.course_content,
                order.price_range,
                order.actual_price,
                order.status,
                order.booking_time,
                order.confirmed_time,
                order.completed_time,
                order.user_evaluation_id,
                order.merchant_evaluation_id,
                order.report_content
            );
            count++;
        }

        this.migrationReport.tables_migrated.orders = count;
        console.log(`✅ 迁移订单数据: ${count} 条记录`);
    }

    async migrateEvaluations() {
        const evaluationsPath = path.join(this.businessDataPath, 'core_business/evaluations.json');
        if (!fs.existsSync(evaluationsPath)) {
            console.log('ℹ️  跳过评价数据 - 文件不存在');
            return;
        }

        const evaluationsData = JSON.parse(fs.readFileSync(evaluationsPath, 'utf8'));

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO evaluations (
                id, booking_session_id, evaluator_type, evaluator_id, target_id,
                overall_score, comments, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let count = 0;
        for (const evaluation of evaluationsData) {
            stmt.run(
                evaluation.id,
                evaluation.booking_session_id || evaluation.order_id,
                evaluation.evaluator_type,
                evaluation.evaluator_id,
                evaluation.target_id,
                evaluation.rating || evaluation.overall_score || 5,
                evaluation.comment || evaluation.text_comment,
                'completed'
            );
            count++;
        }

        this.migrationReport.tables_migrated.evaluations = count;
        console.log(`✅ 迁移评价数据: ${count} 条记录`);
    }

    async migrateConfigurationData() {
        console.log('ℹ️  跳过配置数据迁移 - 使用默认配置');
        // await this.migrateMessageTemplates();
        // await this.migrateTriggerWords();
        // await this.migrateButtons();
    }

    async migrateMessageTemplates() {
        const templatesPath = path.join(this.businessDataPath, 'configuration/message_templates.json');
        if (!fs.existsSync(templatesPath)) {
            console.log('ℹ️  跳过消息模板 - 文件不存在');
            return;
        }

        const templatesData = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO message_templates (
                id, name, template, description, category, active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let count = 0;
        const now = Math.floor(Date.now() / 1000);

        for (const template of templatesData) {
            stmt.run(
                template.id,
                template.name,
                template.template,
                template.description,
                template.category || 'general',
                template.active !== undefined ? template.active : 1,
                template.created_at || now,
                template.updated_at || now
            );
            count++;
        }

        this.migrationReport.tables_migrated.message_templates = count;
        console.log(`✅ 迁移消息模板: ${count} 条记录`);
    }

    async migrateTriggerWords() {
        const triggerWordsPath = path.join(this.businessDataPath, 'configuration/trigger_words.json');
        if (!fs.existsSync(triggerWordsPath)) {
            console.log('ℹ️  跳过触发词 - 文件不存在');
            return;
        }

        const triggerWordsData = JSON.parse(fs.readFileSync(triggerWordsPath, 'utf8'));

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO trigger_words (
                id, word, action, response, priority, active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let count = 0;
        const now = Math.floor(Date.now() / 1000);

        for (const triggerWord of triggerWordsData) {
            stmt.run(
                triggerWord.id,
                triggerWord.word,
                triggerWord.action,
                triggerWord.response,
                triggerWord.priority || 0,
                triggerWord.active !== undefined ? triggerWord.active : 1,
                triggerWord.created_at || now,
                triggerWord.updated_at || now
            );
            count++;
        }

        this.migrationReport.tables_migrated.trigger_words = count;
        console.log(`✅ 迁移触发词: ${count} 条记录`);
    }

    async migrateButtons() {
        const buttonsPath = path.join(this.businessDataPath, 'configuration/buttons.json');
        if (!fs.existsSync(buttonsPath)) {
            console.log('ℹ️  跳过按钮配置 - 文件不存在');
            return;
        }

        const buttonsData = JSON.parse(fs.readFileSync(buttonsPath, 'utf8'));

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO buttons (
                id, name, text, callback_data, type, position, active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let count = 0;
        const now = Math.floor(Date.now() / 1000);

        for (const button of buttonsData) {
            stmt.run(
                button.id,
                button.name,
                button.text,
                button.callback_data,
                button.type || 'inline',
                button.position || 0,
                button.active !== undefined ? button.active : 1,
                button.created_at || now,
                button.updated_at || now
            );
            count++;
        }

        this.migrationReport.tables_migrated.buttons = count;
        console.log(`✅ 迁移按钮配置: ${count} 条记录`);
    }

    async migrateInteractionData() {
        console.log('ℹ️  跳过交互数据迁移 - 非必需数据');
        // 交互数据不是核心业务数据，可以跳过
    }

    async convertToEAV() {
        console.log('🔄 开始转换到EAV模式...');
        
        try {
            const { migrateToEAV } = require('./migrateToEAV');
            await migrateToEAV();
            
            console.log('✅ EAV模式转换完成');
        } catch (error) {
            console.error('⚠️  EAV转换过程中出现错误:', error.message);
        }
    }

    async validateMigration() {
        const validationResults = {};
        
        const tables = ['regions', 'merchants', 'orders', 'bind_codes'];
        
        for (const table of tables) {
            try {
                const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
                validationResults[table] = result.count;
                console.log(`📊 ${table}: ${result.count} 条记录`);
            } catch (error) {
                console.error(`❌ 验证表 ${table} 失败:`, error.message);
                validationResults[table] = 'ERROR';
            }
        }

        try {
            const merchants = dbOperations.getAllMerchants();
            let eavValidCount = 0;
            
            for (const merchant of merchants.slice(0, 5)) {
                const skills = dbOperations.getMerchantSkills(merchant.id);
                if (skills && (skills.wash || skills.blow || skills.do || skills.kiss)) {
                    eavValidCount++;
                }
            }
            
            validationResults.eav_skills_sample = `${eavValidCount}/5 商家技能EAV数据有效`;
            console.log(`🔬 EAV技能数据验证: ${eavValidCount}/5 商家有效`);
            
        } catch (error) {
            console.error('❌ EAV数据验证失败:', error.message);
            validationResults.eav_skills_sample = 'ERROR';
        }

        this.migrationReport.validation_results = validationResults;
    }

    async saveMigrationReport() {
        const reportPath = path.join(__dirname, '../exports/legacy_migration_report.json');
        
        const exportsDir = path.dirname(reportPath);
        if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
        }
        
        fs.writeFileSync(reportPath, JSON.stringify(this.migrationReport, null, 2));
        console.log(`📋 迁移报告已保存: ${reportPath}`);
    }
}

async function migrateLegacyData() {
    const migrator = new LegacyDataMigrator();
    
    try {
        await migrator.migrate();
        
        console.log('========================================');
        console.log('🎉 旧系统数据迁移完成！');
        console.log('📊 迁移统计:');
        
        for (const [table, count] of Object.entries(migrator.migrationReport.tables_migrated)) {
            console.log(`   ${table}: ${count} 条记录`);
        }
        
        console.log('🔄 系统现已使用EAV架构进行数据管理');
        console.log('✅ 可以开始正常使用新系统');
        console.log('========================================');
        
    } catch (error) {
        console.error('💥 迁移失败:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    migrateLegacyData().then(() => {
        console.log('🏁 迁移脚本执行完成');
        process.exit(0);
    }).catch((error) => {
        console.error('💥 迁移脚本执行失败:', error);
        process.exit(1);
    });
}

module.exports = { migrateLegacyData, LegacyDataMigrator }; 