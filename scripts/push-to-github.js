const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * 推送代码到GitHub仓库的脚本
 */

// 配置
const config = {
    branch: 'clean-deploy-branch',  // 使用当前分支名
    commitMessage: 'fix: 修复健康检查配置，确保Railway部署成功',
    remote: 'clean-deploy'
};

// 执行Git命令
function runGitCommand(command) {
    console.log(`执行: ${command}`);
    try {
        const output = execSync(command, { encoding: 'utf8' });
        console.log(output);
        return output;
    } catch (error) {
        console.error(`命令执行失败: ${error.message}`);
        if (error.stdout) console.log(error.stdout);
        if (error.stderr) console.error(error.stderr);
        throw error;
    }
}

// 主函数
async function main() {
    try {
        console.log('🚀 开始推送代码到正确的GitHub仓库...');
        
        // 获取当前分支
        const currentBranch = runGitCommand('git rev-parse --abbrev-ref HEAD').trim();
        console.log(`📌 当前分支: ${currentBranch}`);
        
        // 检查Git状态
        const status = runGitCommand('git status --porcelain');
        if (status) {
            console.log('📝 有未提交的更改，准备提交...');
            
            // 添加所有更改
            runGitCommand('git add .');
            
            // 提交更改
            runGitCommand(`git commit -m "${config.commitMessage}"`);
            console.log('✅ 更改已提交');
        } else {
            console.log('✅ 工作区干净，无需提交');
        }
        
        // 推送到远程仓库
        console.log(`🔄 推送到远程仓库 ${config.remote}/${currentBranch}...`);
        try {
            runGitCommand(`git push ${config.remote} ${currentBranch}`);
        } catch (error) {
            console.log('⚠️ 推送失败，尝试强制推送...');
            runGitCommand(`git push -f ${config.remote} ${currentBranch}`);
        }
        
        console.log('✅ 代码已成功推送到GitHub!');
        console.log(`🔗 远程仓库: ${config.remote}`);
        console.log(`🔗 分支: ${currentBranch}`);
        console.log(`📝 提交信息: ${config.commitMessage}`);
        
    } catch (error) {
        console.error('❌ 推送失败:', error.message);
        process.exit(1);
    }
}

// 执行主函数
main().catch(console.error);

async function pushToGithub() {
  try {
    console.log('开始强制推送到finalversion仓库...');
    
    // 检查远程仓库是否存在
    try {
      execSync('git remote get-url finalversion', { stdio: 'inherit' });
    } catch (error) {
      console.log('添加finalversion远程仓库...');
      execSync('git remote add finalversion https://github.com/kikk77/06200217uploadfinalversion.git', { stdio: 'inherit' });
    }
    
    // 确保我们在正确的分支上
    execSync('git checkout main', { stdio: 'inherit' });
    
    // 添加所有更改
    execSync('git add .', { stdio: 'inherit' });
    
    // 提交更改
    const date = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    execSync(`git commit -m "force push: 强制推送所有更改 - ${date}"`, { stdio: 'inherit' });
    
    // 强制推送到finalversion仓库
    console.log('正在强制推送到finalversion仓库...');
    execSync('git push -f finalversion main', { stdio: 'inherit' });
    
    console.log('✅ 成功推送到finalversion仓库！');
  } catch (error) {
    console.error('❌ 推送过程中发生错误：', error.message);
    process.exit(1);
  }
}

pushToGithub(); 