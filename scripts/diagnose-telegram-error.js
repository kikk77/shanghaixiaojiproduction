#!/usr/bin/env node

/**
 * Telegram 连接错误诊断脚本
 * 用于分析 ETELEGRAM 错误和网络连接问题
 */

require('dotenv').config();
const https = require('https');
const dns = require('dns').promises;
const net = require('net');

console.log('🔍 开始 Telegram 连接诊断...\n');

// 检查环境变量
function checkEnvironment() {
    console.log('1️⃣ 检查环境变量');
    console.log('================');
    
    const requiredVars = ['BOT_TOKEN', 'NODE_ENV'];
    const envStatus = {};
    
    requiredVars.forEach(varName => {
        const value = process.env[varName];
        if (value) {
            envStatus[varName] = '✅ 已设置';
            if (varName === 'BOT_TOKEN') {
                console.log(`${varName}: ✅ 已设置 (长度: ${value.length})`);
            } else {
                console.log(`${varName}: ${value}`);
            }
        } else {
            envStatus[varName] = '❌ 未设置';
            console.log(`${varName}: ❌ 未设置`);
        }
    });
    
    // 检查代理设置
    if (process.env.HTTPS_PROXY) {
        console.log(`HTTPS_PROXY: ${process.env.HTTPS_PROXY}`);
    }
    
    console.log('\n');
    return envStatus;
}

// 检查 DNS 解析
async function checkDNS() {
    console.log('2️⃣ 检查 DNS 解析');
    console.log('================');
    
    const telegramHost = 'api.telegram.org';
    
    try {
        const addresses = await dns.resolve4(telegramHost);
        console.log(`✅ ${telegramHost} 解析成功:`);
        addresses.forEach(addr => console.log(`   - ${addr}`));
        
        // 检查 IPv6
        try {
            const v6addresses = await dns.resolve6(telegramHost);
            console.log(`✅ IPv6 地址:`);
            v6addresses.forEach(addr => console.log(`   - ${addr}`));
        } catch (e) {
            console.log('ℹ️ IPv6 解析不可用');
        }
        
        return true;
    } catch (error) {
        console.error(`❌ DNS 解析失败: ${error.message}`);
        return false;
    }
}

// 检查网络连接
async function checkNetworkConnection() {
    console.log('\n3️⃣ 检查网络连接');
    console.log('================');
    
    return new Promise((resolve) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
            socket.destroy();
            console.log('❌ 连接超时');
            resolve(false);
        }, 10000);
        
        socket.connect(443, 'api.telegram.org', () => {
            clearTimeout(timeout);
            console.log('✅ TCP 连接成功 (api.telegram.org:443)');
            socket.end();
            resolve(true);
        });
        
        socket.on('error', (error) => {
            clearTimeout(timeout);
            console.error(`❌ TCP 连接失败: ${error.message}`);
            resolve(false);
        });
    });
}

// 测试 Telegram API
async function testTelegramAPI() {
    console.log('\n4️⃣ 测试 Telegram API');
    console.log('====================');
    
    const token = process.env.BOT_TOKEN;
    if (!token) {
        console.log('❌ BOT_TOKEN 未设置，跳过 API 测试');
        return false;
    }
    
    return new Promise((resolve) => {
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${token}/getMe`,
            method: 'GET',
            timeout: 30000,
            headers: {
                'User-Agent': 'TelegramBot/1.0'
            }
        };
        
        if (process.env.HTTPS_PROXY) {
            console.log(`ℹ️ 使用代理: ${process.env.HTTPS_PROXY}`);
        }
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`✅ API 响应状态码: ${res.statusCode}`);
                
                try {
                    const response = JSON.parse(data);
                    if (response.ok) {
                        console.log(`✅ Bot 信息获取成功:`);
                        console.log(`   - 用户名: @${response.result.username}`);
                        console.log(`   - ID: ${response.result.id}`);
                        console.log(`   - 名称: ${response.result.first_name}`);
                        resolve(true);
                    } else {
                        console.error(`❌ API 错误: ${response.description}`);
                        resolve(false);
                    }
                } catch (e) {
                    console.error(`❌ 响应解析失败: ${e.message}`);
                    console.log('原始响应:', data);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error(`❌ HTTPS 请求失败: ${error.message}`);
            if (error.code) {
                console.error(`   错误代码: ${error.code}`);
            }
            resolve(false);
        });
        
        req.on('timeout', () => {
            console.error('❌ 请求超时');
            req.destroy();
            resolve(false);
        });
        
        req.end();
    });
}

// 检查系统资源
function checkSystemResources() {
    console.log('\n5️⃣ 检查系统资源');
    console.log('================');
    
    const memUsage = process.memoryUsage();
    console.log('内存使用:');
    console.log(`   - RSS: ${Math.round(memUsage.rss / 1024 / 1024)} MB`);
    console.log(`   - Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`);
    console.log(`   - Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`);
    
    console.log('\n进程信息:');
    console.log(`   - Node.js 版本: ${process.version}`);
    console.log(`   - 平台: ${process.platform}`);
    console.log(`   - 架构: ${process.arch}`);
    console.log(`   - PID: ${process.pid}`);
    console.log(`   - 运行时间: ${Math.round(process.uptime())} 秒`);
}

// 生成诊断报告
async function generateReport(results) {
    console.log('\n📊 诊断报告');
    console.log('===========');
    
    const issues = [];
    const recommendations = [];
    
    // 分析结果
    if (!results.env.BOT_TOKEN) {
        issues.push('BOT_TOKEN 环境变量未设置');
        recommendations.push('设置 BOT_TOKEN 环境变量');
    }
    
    if (!results.dns) {
        issues.push('DNS 解析失败');
        recommendations.push('检查网络 DNS 配置');
        recommendations.push('尝试使用公共 DNS (8.8.8.8)');
    }
    
    if (!results.network) {
        issues.push('无法建立 TCP 连接到 Telegram 服务器');
        recommendations.push('检查防火墙设置');
        recommendations.push('检查是否需要代理');
        recommendations.push('确认 Railway 部署区域的网络限制');
    }
    
    if (!results.api) {
        issues.push('Telegram API 调用失败');
        if (results.network) {
            recommendations.push('检查 BOT_TOKEN 是否正确');
            recommendations.push('确认 Bot 未被封禁');
        }
    }
    
    // 输出结果
    if (issues.length > 0) {
        console.log('\n❌ 发现的问题:');
        issues.forEach(issue => console.log(`   - ${issue}`));
        
        console.log('\n💡 建议:');
        recommendations.forEach(rec => console.log(`   - ${rec}`));
    } else {
        console.log('\n✅ 所有检查通过！');
    }
    
    // 特殊情况分析
    if (process.env.RAILWAY_ENVIRONMENT) {
        console.log('\n🚂 Railway 环境特殊说明:');
        console.log('   - 确保已在 Railway 中正确设置环境变量');
        console.log('   - 某些地区可能需要配置代理访问 Telegram');
        console.log('   - 检查 Railway 日志中的详细错误信息');
    }
}

// 主函数
async function main() {
    const results = {
        env: checkEnvironment(),
        dns: await checkDNS(),
        network: await checkNetworkConnection(),
        api: await testTelegramAPI()
    };
    
    checkSystemResources();
    await generateReport(results);
    
    console.log('\n✅ 诊断完成\n');
}

// 运行诊断
main().catch(error => {
    console.error('诊断过程出错:', error);
    process.exit(1);
}); 