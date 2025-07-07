// 测试等级系统功能
const http = require('http');

// 设置环境变量
process.env.LEVEL_SYSTEM_ENABLED = 'true';

async function testLevelSystem() {
    console.log('🧪 开始测试等级系统...\n');
    
    // 测试1: 检查等级系统是否启用
    console.log('1️⃣ 检查环境变量:');
    console.log(`   LEVEL_SYSTEM_ENABLED = ${process.env.LEVEL_SYSTEM_ENABLED}`);
    
    // 测试2: 检查数据库是否存在
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, 'data', 'level_system_dev.db');
    
    console.log('\n2️⃣ 检查数据库文件:');
    if (fs.existsSync(dbPath)) {
        console.log(`   ✅ 数据库文件存在: ${dbPath}`);
        const stats = fs.statSync(dbPath);
        console.log(`   文件大小: ${stats.size} bytes`);
    } else {
        console.log(`   ❌ 数据库文件不存在: ${dbPath}`);
    }
    
    // 测试3: 测试服务是否可访问
    console.log('\n3️⃣ 测试HTTP服务:');
    
    const testEndpoints = [
        { path: '/health', name: '健康检查' },
        { path: '/api/level/stats', name: '等级统计API' },
        { path: '/admin/level-system', name: '管理界面' },
        { path: '/level/admin/level-system.js', name: '管理界面JS' }
    ];
    
    for (const endpoint of testEndpoints) {
        await testEndpoint(endpoint.path, endpoint.name);
    }
    
    console.log('\n✅ 测试完成！');
}

function testEndpoint(path, name) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET'
        };
        
        const req = http.request(options, (res) => {
            console.log(`   ${name} (${path}): ${res.statusCode} ${res.statusCode === 200 ? '✅' : '❌'}`);
            resolve();
        });
        
        req.on('error', (error) => {
            console.log(`   ${name} (${path}): 连接失败 ❌ - ${error.message}`);
            resolve();
        });
        
        req.end();
    });
}

// 等待服务启动后再测试
setTimeout(() => {
    testLevelSystem();
}, 3000);

console.log('⏳ 等待3秒后开始测试...');
