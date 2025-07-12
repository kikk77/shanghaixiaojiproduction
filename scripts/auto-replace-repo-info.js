#!/usr/bin/env node
/**
 * 自动替换仓库信息脚本
 * 确保推送到不同仓库时信息正确
 */

const fs = require('fs');
const path = require('path');

// 仓库信息配置
const REPO_CONFIGS = {
  shanghai: {
    name: '上海仓库',
    ranking: 'xiaoji233',
    customer_service: '@xiaoji57',
    files: [
      'services/httpService.js',
      'services/botService.js'
    ]
  },
  guangzhou: {
    name: '广州仓库', 
    ranking: 'xiaoji899',
    customer_service: '@xiaoji779',
    files: [
      'services/httpService.js',
      'services/botService.js'
    ]
  }
};

// 替换规则
const REPLACEMENT_RULES = {
  // 榜单链接替换
  ranking: {
    shanghai_to_guangzhou: {
      from: 'https://t.me/xiaoji233',
      to: 'https://t.me/xiaoji899'
    },
    guangzhou_to_shanghai: {
      from: 'https://t.me/xiaoji899', 
      to: 'https://t.me/xiaoji233'
    }
  },
  // 客服信息替换
  customer_service: {
    shanghai_to_guangzhou: {
      from: '@xiaoji57',
      to: '@xiaoji779'
    },
    guangzhou_to_shanghai: {
      from: '@xiaoji779',
      to: '@xiaoji57'
    }
  }
};

/**
 * 检测当前是哪个仓库的信息
 */
function detectCurrentRepo() {
  const httpServicePath = path.join(__dirname, '../services/httpService.js');
  
  if (!fs.existsSync(httpServicePath)) {
    console.error('❌ 找不到 httpService.js 文件');
    return null;
  }
  
  const content = fs.readFileSync(httpServicePath, 'utf8');
  
  if (content.includes('xiaoji233') && content.includes('@xiaoji57')) {
    return 'shanghai';
  } else if (content.includes('xiaoji899') && content.includes('@xiaoji779')) {
    return 'guangzhou';
  }
  
  return null;
}

/**
 * 替换文件中的信息
 */
function replaceFileContent(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  文件不存在: ${filePath}`);
    return false;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  for (const replacement of replacements) {
    if (content.includes(replacement.from)) {
      content = content.replace(new RegExp(replacement.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement.to);
      changed = true;
      console.log(`✅ 替换 ${replacement.from} → ${replacement.to} 在 ${filePath}`);
    }
  }
  
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  
  return false;
}

/**
 * 执行仓库信息替换
 */
function replaceRepoInfo(targetRepo) {
  const currentRepo = detectCurrentRepo();
  
  if (!currentRepo) {
    console.error('❌ 无法检测当前仓库信息');
    return false;
  }
  
  if (currentRepo === targetRepo) {
    console.log(`✅ 当前已经是${REPO_CONFIGS[targetRepo].name}的信息，无需替换`);
    return true;
  }
  
  console.log(`🔄 从${REPO_CONFIGS[currentRepo].name}切换到${REPO_CONFIGS[targetRepo].name}`);
  
  // 准备替换规则
  const replacements = [];
  
  if (currentRepo === 'shanghai' && targetRepo === 'guangzhou') {
    replacements.push(REPLACEMENT_RULES.ranking.shanghai_to_guangzhou);
    replacements.push(REPLACEMENT_RULES.customer_service.shanghai_to_guangzhou);
  } else if (currentRepo === 'guangzhou' && targetRepo === 'shanghai') {
    replacements.push(REPLACEMENT_RULES.ranking.guangzhou_to_shanghai);
    replacements.push(REPLACEMENT_RULES.customer_service.guangzhou_to_shanghai);
  }
  
  // 执行替换
  let totalChanged = 0;
  const targetFiles = REPO_CONFIGS[targetRepo].files;
  
  for (const file of targetFiles) {
    const filePath = path.join(__dirname, '..', file);
    if (replaceFileContent(filePath, replacements)) {
      totalChanged++;
    }
  }
  
  console.log(`✅ 完成替换，共修改了 ${totalChanged} 个文件`);
  return totalChanged > 0;
}

/**
 * 验证替换结果
 */
function verifyReplacement(targetRepo) {
  const currentRepo = detectCurrentRepo();
  
  if (currentRepo === targetRepo) {
    console.log(`✅ 验证通过：当前信息已正确设置为${REPO_CONFIGS[targetRepo].name}`);
    return true;
  } else {
    console.error(`❌ 验证失败：信息替换不正确`);
    return false;
  }
}

// 主函数
function main() {
  const targetRepo = process.argv[2];
  
  if (!targetRepo || !REPO_CONFIGS[targetRepo]) {
    console.log('用法: node auto-replace-repo-info.js <shanghai|guangzhou>');
    console.log('');
    console.log('示例:');
    console.log('  node auto-replace-repo-info.js shanghai   # 切换到上海仓库信息');
    console.log('  node auto-replace-repo-info.js guangzhou  # 切换到广州仓库信息');
    return;
  }
  
  console.log(`🚀 开始替换仓库信息为: ${REPO_CONFIGS[targetRepo].name}`);
  console.log(`📋 榜单: @${REPO_CONFIGS[targetRepo].ranking}`);
  console.log(`👤 客服: ${REPO_CONFIGS[targetRepo].customer_service}`);
  console.log('');
  
  if (replaceRepoInfo(targetRepo)) {
    if (verifyReplacement(targetRepo)) {
      console.log('');
      console.log('🎉 仓库信息替换完成！');
      console.log(`现在可以安全推送到${REPO_CONFIGS[targetRepo].name}`);
    } else {
      console.error('');
      console.error('❌ 替换验证失败，请检查');
      process.exit(1);
    }
  } else {
    console.log('');
    console.log('ℹ️  无需替换或替换失败');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  replaceRepoInfo,
  verifyReplacement,
  detectCurrentRepo,
  REPO_CONFIGS
}; 