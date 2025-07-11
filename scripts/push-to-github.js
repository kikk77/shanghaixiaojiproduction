const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * 推送代码到GitHub仓库的脚本
 * 根据用户记忆，只能强制推送到上海仓库（生产环境）
 */

// 配置
const config = {
    branch: 'main',  // 使用main分支
    commitMessage: 'fix: 修复Telegram Bot崩溃问题 - 增强用户屏蔽错误处理和网络容错能力',
    remote: 'origin'  // 上海仓库（生产环境）- origin指向shanghaixiaojiproduction
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
        
        // 切换到main分支
        try {
            runGitCommand('git checkout main');
            console.log('✅ 已切换到main分支');
        } catch (error) {
            console.log('⚠️ 切换分支失败，继续使用当前分支');
        }
        
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
        
        // 检查远程仓库是否存在
        try {
            runGitCommand(`git remote get-url ${config.remote}`);
            console.log(`✅ 远程仓库 ${config.remote} 已配置`);
        } catch (error) {
            console.log(`⚠️ 远程仓库 ${config.remote} 未配置，请手动添加`);
            console.log(`💡 请运行: git remote add ${config.remote} <仓库URL>`);
            throw new Error(`远程仓库 ${config.remote} 未配置`);
        }
        
        // 强制推送到远程仓库（根据用户记忆，只能强制推送到上海仓库）
        console.log(`🔄 强制推送到远程仓库 ${config.remote}/${config.branch}...`);
        console.log('⚠️ 注意：根据用户要求，将进行强制推送');
        runGitCommand(`git push -f ${config.remote} ${config.branch}`);
        console.log('✅ 强制推送成功！')
        
        console.log('✅ 代码已成功推送到GitHub!');
        console.log(`🔗 远程仓库: ${config.remote} (上海仓库 - 生产环境)`);
        console.log(`🔗 分支: ${config.branch}`);
        console.log(`📝 提交信息: ${config.commitMessage}`);
        
        console.log('\n🚀 部署说明:');
        console.log('1. 代码已推送到上海仓库（生产环境）');
        console.log('2. Railway会自动检测到更改并重新部署');
        console.log('3. 新的错误处理机制将防止用户屏蔽导致的崩溃');
        console.log('4. 监控日志中的 🚫 和 ❌ 标记来观察错误处理效果');
        
    } catch (error) {
        console.error('❌ 推送失败:', error.message);
        console.log('\n💡 可能的解决方案:');
        console.log('1. 检查网络连接');
        console.log('2. 确认远程仓库配置正确');
        console.log('3. 检查Git凭据是否有效');
        process.exit(1);
    }
}

// 执行主函数
main().catch(console.error); 