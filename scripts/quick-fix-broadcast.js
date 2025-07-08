#!/usr/bin/env node

/**
 * 快速修复播报错误
 * 如果在生产环境遇到 levelDbManager.getDatabase is not a function 错误
 * 可以运行此脚本进行快速修复
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 开始修复播报功能...');

try {
    // 读取 botService.js 文件
    const botServicePath = path.join(__dirname, '../services/botService.js');
    let content = fs.readFileSync(botServicePath, 'utf8');
    
    // 查找需要修复的代码
    const oldCode = `const levelDbManager = require('../level/config/levelDatabase');
        const db = levelDbManager.getDatabase();`;
    
    const newCode = `const levelDbManager = require('../level/config/levelDatabase').getInstance();
        const db = levelDbManager.getDatabase();`;
    
    if (content.includes(oldCode)) {
        // 替换代码
        content = content.replace(oldCode, newCode);
        
        // 写回文件
        fs.writeFileSync(botServicePath, content, 'utf8');
        
        console.log('✅ 修复成功！');
        console.log('📌 修复内容：');
        console.log('   - 修正了 levelDbManager 的获取方式');
        console.log('   - 添加了 .getInstance() 调用');
        console.log('\n🚀 请重启应用使修改生效');
    } else {
        console.log('✅ 代码已经是修复后的版本，无需再次修复');
    }
    
} catch (error) {
    console.error('❌ 修复失败:', error.message);
    console.log('\n💡 手动修复方法：');
    console.log('1. 编辑 services/botService.js 文件');
    console.log('2. 找到 getBroadcastTargetGroups 函数');
    console.log('3. 将以下代码：');
    console.log('   const levelDbManager = require(\'../level/config/levelDatabase\');');
    console.log('4. 修改为：');
    console.log('   const levelDbManager = require(\'../level/config/levelDatabase\').getInstance();');
} 