#!/usr/bin/env node

/**
 * 部署前检查脚本
 * 确保代码可以正常部署到Railway
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 开始部署前检查...\n');

// 检查关键文件是否存在
function checkRequiredFiles() {
    console.log('1️⃣ 检查关键文件');
    console.log('================');
    
    const requiredFiles = [
        'app.js',
        'package.json',
        'railway.toml',
        'services/botService.js',
        'services/httpService.js',
        'config/database.js',
        'config/environment.js'
    ];
    
    let allFilesExist = true;
    
    for (const file of requiredFiles) {
        if (fs.existsSync(file)) {
            console.log(`✅ ${file}`);
        } else {
            console.log(`❌ ${file} - 文件不存在`);
            allFilesExist = false;
        }
    }
    
    console.log('');
    return allFilesExist;
}

// 检查package.json配置
function checkPackageJson() {
    console.log('2️⃣ 检查package.json配置');
    console.log('========================');
    
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        
        // 检查启动脚本
        if (packageJson.scripts && packageJson.scripts.start) {
            console.log(`✅ start脚本: ${packageJson.scripts.start}`);
        } else {
            console.log('❌ 缺少start脚本');
            return false;
        }
        
        if (packageJson.scripts && packageJson.scripts.railway) {
            console.log(`✅ railway脚本: ${packageJson.scripts.railway}`);
        } else {
            console.log('❌ 缺少railway脚本');
            return false;
        }
        
        // 检查Node.js版本要求
        if (packageJson.engines && packageJson.engines.node) {
            console.log(`✅ Node.js版本要求: ${packageJson.engines.node}`);
        } else {
            console.log('⚠️ 未指定Node.js版本要求');
        }
        
        // 检查关键依赖
        const requiredDeps = [
            'node-telegram-bot-api',
            'better-sqlite3',
            'dotenv'
        ];
        
        for (const dep of requiredDeps) {
            if (packageJson.dependencies && packageJson.dependencies[dep]) {
                console.log(`✅ 依赖 ${dep}: ${packageJson.dependencies[dep]}`);
            } else {
                console.log(`❌ 缺少依赖: ${dep}`);
                return false;
            }
        }
        
        console.log('');
        return true;
        
    } catch (error) {
        console.error('❌ 读取package.json失败:', error.message);
        return false;
    }
}

// 检查Railway配置
function checkRailwayConfig() {
    console.log('3️⃣ 检查Railway配置');
    console.log('==================');
    
    try {
        const railwayConfig = fs.readFileSync('railway.toml', 'utf8');
        
        // 检查关键配置
        const checks = [
            { pattern: /startCommand\s*=\s*"npm run railway"/, name: '启动命令' },
            { pattern: /healthcheckPath\s*=\s*"\/health"/, name: '健康检查路径' },
            { pattern: /NODE_ENV\s*=\s*"production"/, name: '生产环境设置' },
            { pattern: /PORT\s*=\s*"3000"/, name: '端口配置' }
        ];
        
        for (const check of checks) {
            if (check.pattern.test(railwayConfig)) {
                console.log(`✅ ${check.name}`);
            } else {
                console.log(`⚠️ ${check.name} - 可能需要检查`);
            }
        }
        
        console.log('');
        return true;
        
    } catch (error) {
        console.error('❌ 读取railway.toml失败:', error.message);
        return false;
    }
}

// 检查代码语法
function checkCodeSyntax() {
    console.log('4️⃣ 检查代码语法');
    console.log('================');
    
    const filesToCheck = [
        'app.js',
        'services/botService.js',
        'services/httpService.js',
        'config/environment.js'
    ];
    
    let allSyntaxValid = true;
    
    for (const file of filesToCheck) {
        try {
            require(path.resolve(file));
            console.log(`✅ ${file} - 语法正确`);
        } catch (error) {
            console.log(`❌ ${file} - 语法错误: ${error.message}`);
            allSyntaxValid = false;
        }
    }
    
    console.log('');
    return allSyntaxValid;
}

// 检查错误处理增强
function checkErrorHandling() {
    console.log('5️⃣ 检查错误处理增强');
    console.log('====================');
    
    try {
        const botServiceCode = fs.readFileSync('services/botService.js', 'utf8');
        
        const enhancements = [
            { pattern: /isUserBlockedError/, name: '用户屏蔽错误检测' },
            { pattern: /markUserAsBlocked/, name: '屏蔽用户标记' },
            { pattern: /createResilientBot/, name: '弹性Bot包装器' },
            { pattern: /unhandledRejection/, name: '全局错误捕获' },
            { pattern: /blockedUsers\.add/, name: '屏蔽用户管理' }
        ];
        
        for (const enhancement of enhancements) {
            if (enhancement.pattern.test(botServiceCode)) {
                console.log(`✅ ${enhancement.name}`);
            } else {
                console.log(`❌ ${enhancement.name} - 未找到`);
                return false;
            }
        }
        
        console.log('');
        return true;
        
    } catch (error) {
        console.error('❌ 检查错误处理失败:', error.message);
        return false;
    }
}

// 生成检查报告
function generateReport(results) {
    console.log('📊 部署前检查报告');
    console.log('==================');
    
    const passedChecks = Object.values(results).filter(r => r).length;
    const totalChecks = Object.keys(results).length;
    
    console.log(`\n✅ 检查结果: ${passedChecks}/${totalChecks} 通过`);
    
    if (passedChecks === totalChecks) {
        console.log('\n🎉 所有检查通过！代码可以安全部署。');
        console.log('\n🚀 下一步操作:');
        console.log('1. 运行 node scripts/push-to-github.js 推送到上海仓库');
        console.log('2. Railway 会自动检测到更改并重新部署');
        console.log('3. 监控部署日志确认成功');
        console.log('4. 测试Bot功能确认错误处理生效');
        return true;
    } else {
        console.log('\n⚠️ 部分检查失败，请修复后再部署。');
        console.log('\n❌ 失败的检查:');
        Object.entries(results).forEach(([check, passed]) => {
            if (!passed) {
                console.log(`   - ${check}`);
            }
        });
        return false;
    }
}

// 主函数
function main() {
    const results = {
        '关键文件': checkRequiredFiles(),
        'package.json': checkPackageJson(),
        'Railway配置': checkRailwayConfig(),
        '代码语法': checkCodeSyntax(),
        '错误处理': checkErrorHandling()
    };
    
    const deployReady = generateReport(results);
    
    console.log('\n✅ 检查完成\n');
    
    if (deployReady) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

// 运行检查
main(); 