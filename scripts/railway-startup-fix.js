#!/usr/bin/env node

/**
 * Railway启动时的修复脚本
 * 在应用启动前自动修复已知问题
 */

const fs = require('fs');
const path = require('path');

console.log('🚂 Railway启动修复脚本开始执行...');

async function railwayStartupFix() {
    try {
        // 检查是否在Railway环境中
        if (!process.env.RAILWAY_ENVIRONMENT) {
            console.log('⚠️ 非Railway环境，跳过修复');
            return;
        }
        
        console.log('🔧 Railway环境检测到，开始修复...');
        
        // 1. 修复levelDbManager调用错误
        console.log('1. 修复levelDbManager调用错误...');
        await fixLevelDbManagerCalls();
        
        // 2. 运行主修复脚本
        console.log('2. 运行主修复脚本...');
        const { fixRailwayErrors } = require('./fix-railway-errors');
        await fixRailwayErrors();
        
        console.log('✅ Railway启动修复完成!');
        
    } catch (error) {
        console.error('❌ Railway启动修复失败:', error);
        // 不要退出进程，让应用继续启动
    }
}

async function fixLevelDbManagerCalls() {
    const filesToCheck = [
        'services/botService.js',
        'level/scripts/init-milestone-tables.js',
        'level/scripts/test-broadcast-levelup.js',
        'level/scripts/test-milestone-system.js'
    ];
    
    for (const file of filesToCheck) {
        const filePath = path.join(__dirname, '..', file);
        if (fs.existsSync(filePath)) {
            let content = fs.readFileSync(filePath, 'utf8');
            let changed = false;
            
            // 修复直接调用levelDatabase的错误
            const patterns = [
                {
                    old: /require\(['"]\.\.\/level\/config\/levelDatabase['"]\)\.getDatabase\(\)/g,
                    new: "require('../level/config/levelDatabase').getInstance().getDatabase()"
                },
                {
                    old: /require\(['"]\.\.\/config\/levelDatabase['"]\)\.getDatabase\(\)/g,
                    new: "require('../config/levelDatabase').getInstance().getDatabase()"
                },
                {
                    old: /const levelDbManager = require\(['"]\.\.\/level\/config\/levelDatabase['"]\);\s*const db = levelDbManager\.getDatabase\(\);/g,
                    new: "const levelDbManager = require('../level/config/levelDatabase').getInstance();\n        const db = levelDbManager.getDatabase();"
                },
                {
                    old: /const levelDbManager = require\(['"]\.\.\/config\/levelDatabase['"]\);\s*const db = levelDbManager\.getDatabase\(\);/g,
                    new: "const levelDbManager = require('../config/levelDatabase').getInstance();\n        const db = levelDbManager.getDatabase();"
                }
            ];
            
            for (const pattern of patterns) {
                if (pattern.old.test(content)) {
                    content = content.replace(pattern.old, pattern.new);
                    changed = true;
                }
            }
            
            if (changed) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`✅ 修复了 ${file} 中的levelDbManager调用`);
            }
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    railwayStartupFix();
}

module.exports = {
    railwayStartupFix
}; 