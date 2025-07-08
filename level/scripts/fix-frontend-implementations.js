/**
 * 修复假前端实现
 * 在管理面板中禁用未实现的功能，避免错误
 */

// 未实现的API列表
const UNIMPLEMENTED_APIS = {
    dataExport: [
        '/api/level/export/all',
        '/api/level/export/users',
        '/api/level/export/config'
    ],
    dataImport: [
        '/api/level/import'
    ],
    database: [
        '/api/level/database/stats',
        '/api/level/database/cleanup',
        '/api/level/database/optimize',
        '/api/level/database/backup',
        '/api/level/database/restore'
    ],
    statistics: [
        '/api/level/stats/users',
        '/api/level/stats/badges',
        '/api/level/stats/config'
    ],
    migration: [
        '/api/level/migrate'
    ]
};

// 禁用未实现功能的UI提示
const DISABLED_FEATURES_MESSAGE = {
    exportData: '数据导出功能正在开发中，预计下个版本上线',
    importData: '数据导入功能正在开发中，预计下个版本上线',
    databaseManagement: '数据库管理功能正在开发中',
    advancedStats: '高级统计功能正在开发中',
    dataMigration: '数据迁移功能正在开发中'
};

// 在前端添加功能检查
function disableUnimplementedFeatures() {
    console.log('🔧 禁用未实现的功能...');
    
    // 需要在管理面板JS中调用此函数
    // 替换相关函数为提示版本
    return {
        // 数据导出功能
        exportAllData: async function() {
            showWarning(DISABLED_FEATURES_MESSAGE.exportData);
        },
        
        exportUserData: async function() {
            showWarning(DISABLED_FEATURES_MESSAGE.exportData);
        },
        
        exportConfig: async function() {
            showWarning(DISABLED_FEATURES_MESSAGE.exportData);
        },
        
        // 数据导入功能
        importData: async function() {
            showWarning(DISABLED_FEATURES_MESSAGE.importData);
        },
        
        // 数据库管理
        loadDataManagement: async function() {
            showWarning(DISABLED_FEATURES_MESSAGE.databaseManagement);
            // 显示基础信息
            const basicInfo = `
                <div class="info-box">
                    <h3>数据库信息</h3>
                    <p>数据库类型：SQLite</p>
                    <p>数据库文件：level_system.db</p>
                    <p>数据库位置：独立于主系统</p>
                    <p class="warning">高级管理功能正在开发中...</p>
                </div>
            `;
            document.getElementById('dataManagementContent').innerHTML = basicInfo;
        },
        
        // 统计功能
        loadDetailedStats: async function() {
            showWarning(DISABLED_FEATURES_MESSAGE.advancedStats);
        },
        
        // 迁移功能
        migrateGroup: async function() {
            showWarning(DISABLED_FEATURES_MESSAGE.dataMigration);
        },
        
        // 测试播报
        testBroadcast: async function() {
            showWarning('播报测试功能即将上线');
        },
        
        // 授予勋章
        awardBadge: async function() {
            showWarning('勋章授予功能即将上线');
        }
    };
}

// 显示警告信息
function showWarning(message) {
    if (typeof showMessage === 'function') {
        showMessage(message, 'warning');
    } else {
        alert('⚠️ ' + message);
    }
}

// 导出给管理面板使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = disableUnimplementedFeatures;
}

// 如果是在浏览器环境，自动初始化
if (typeof window !== 'undefined') {
    window.levelSystemFeatureFlags = disableUnimplementedFeatures();
} 