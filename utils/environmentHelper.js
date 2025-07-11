/**
 * 统一的环境检测工具
 * 确保整个项目使用一致的环境判断逻辑
 */

const fs = require('fs');
const path = require('path');

class EnvironmentHelper {
    constructor() {
        this.nodeEnv = process.env.NODE_ENV || process.env.RAILWAY_ENVIRONMENT_NAME || 'development';
        this.isProduction = this.nodeEnv === 'production';
        this.isStaging = this.nodeEnv === 'staging';
        this.isDevelopment = this.nodeEnv === 'development';
        this.isRailway = !!process.env.RAILWAY_ENVIRONMENT_NAME;
    }
    
    // 获取当前环境名称
    getEnvironment() {
        return this.nodeEnv;
    }
    
    // 检查是否为生产环境
    isProductionEnvironment() {
        return this.isProduction;
    }
    
    // 检查是否为预发布环境
    isStagingEnvironment() {
        return this.isStaging;
    }
    
    // 检查是否为开发环境
    isDevelopmentEnvironment() {
        return this.isDevelopment;
    }
    
    // 检查是否在Railway平台运行
    isRailwayEnvironment() {
        return this.isRailway;
    }
    
    // 获取统一的数据目录路径
    getDataDirectory() {
        if (this.isProduction || this.isStaging) {
            // 生产环境：强制使用Railway Volume，不允许回退
            const volumeDataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/app/data';
            
            // 确保目录存在
            if (!fs.existsSync(volumeDataDir)) {
                fs.mkdirSync(volumeDataDir, { recursive: true });
                console.log(`📁 创建Railway Volume目录: ${volumeDataDir}`);
            }
            
            // 验证目录可写
            try {
                fs.accessSync(volumeDataDir, fs.constants.W_OK);
                console.log(`✅ 使用Railway Volume: ${volumeDataDir}`);
                return volumeDataDir;
            } catch (error) {
                console.error(`❌ Railway Volume目录不可写: ${volumeDataDir}`);
                throw new Error(`生产环境必须使用Railway Volume，但目录不可写: ${error.message}`);
            }
        } else {
            // 开发环境：使用本地data目录
            const localDataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(localDataDir)) {
                fs.mkdirSync(localDataDir, { recursive: true });
                console.log(`📁 创建本地数据目录: ${localDataDir}`);
            }
            return localDataDir;
        }
    }
    
    // 获取数据库文件路径
    getDatabasePath(dbName) {
        const dataDir = this.getDataDirectory();
        const suffix = this.isProduction ? '' : '_dev';
        const dbFileName = `${dbName}${suffix}.db`;
        return path.join(dataDir, dbFileName);
    }
    
    // 获取等级系统数据库路径
    getLevelSystemDatabasePath() {
        return this.getDatabasePath('level_system');
    }
    
    // 获取主数据库路径
    getMainDatabasePath() {
        return this.getDatabasePath('marketing_bot');
    }
    
    // 获取频道数据库路径
    getChannelDatabasePath() {
        return this.getDatabasePath('channel_data');
    }
    
    // 输出环境信息
    logEnvironmentInfo() {
        console.log(`🌍 环境信息:`);
        console.log(`   - 当前环境: ${this.nodeEnv}`);
        console.log(`   - 是否生产环境: ${this.isProduction}`);
        console.log(`   - 是否预发布环境: ${this.isStaging}`);
        console.log(`   - 是否开发环境: ${this.isDevelopment}`);
        console.log(`   - 是否Railway平台: ${this.isRailway}`);
        console.log(`   - 数据目录: ${this.getDataDirectory()}`);
    }
}

// 导出单例
const environmentHelper = new EnvironmentHelper();

module.exports = {
    // 单例实例
    getInstance: () => environmentHelper,
    
    // 便捷方法
    getEnvironment: () => environmentHelper.getEnvironment(),
    isProduction: () => environmentHelper.isProductionEnvironment(),
    isStaging: () => environmentHelper.isStagingEnvironment(),
    isDevelopment: () => environmentHelper.isDevelopmentEnvironment(),
    isRailway: () => environmentHelper.isRailwayEnvironment(),
    getDataDirectory: () => environmentHelper.getDataDirectory(),
    getDatabasePath: (dbName) => environmentHelper.getDatabasePath(dbName),
    getLevelSystemDatabasePath: () => environmentHelper.getLevelSystemDatabasePath(),
    getMainDatabasePath: () => environmentHelper.getMainDatabasePath(),
    getChannelDatabasePath: () => environmentHelper.getChannelDatabasePath(),
    logEnvironmentInfo: () => environmentHelper.logEnvironmentInfo()
}; 