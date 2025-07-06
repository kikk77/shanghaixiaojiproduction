# 小鸡管家等级系统设计文档（独立版本）

## 🎯 核心设计原则

### 1. 完全独立原则
- **独立数据库**：使用独立的 `level_system.db` 文件，与现有生产数据完全隔离
- **独立服务**：创建独立的等级服务模块，不修改现有代码
- **零破坏性**：绝不修改现有数据库结构和数据
- **可逆集成**：可随时禁用或卸载，不影响现有功能

### 2. Railway部署兼容
- **Volume支持**：完全兼容Railway Volume挂载
- **环境变量控制**：通过环境变量控制启用/禁用
- **自动发现数据路径**：自动适应生产/测试环境

### 3. 现有接口复用
- **复用Bot服务**：使用现有的 `botService.js` 播报方法
- **复用数据库操作**：使用现有的 `dbOperations.js` 查询用户信息
- **复用EAV架构**：基于现有EAV模式设计，但使用独立数据库

---

## 📊 独立数据库设计

### 1. 独立数据库文件
```javascript
// config/levelDatabase.js - 完全独立的等级系统数据库
class LevelDatabaseManager {
    constructor() {
        // 使用与现有系统相同的路径逻辑，但独立的数据库文件
        const nodeEnv = process.env.NODE_ENV || process.env.RAILWAY_ENVIRONMENT_NAME || 'development';
        const isProduction = nodeEnv === 'production';
        const isStaging = nodeEnv === 'staging';
        
        // 数据目录路径（与现有系统一致）
        let dataDir;
        if (isProduction || isStaging) {
            const volumeDataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/app/data';
            const localDataDir = path.join(__dirname, '..', 'data');
            
            try {
                if (fs.existsSync(volumeDataDir)) {
                    fs.accessSync(volumeDataDir, fs.constants.W_OK);
                    dataDir = volumeDataDir;
                } else {
                    throw new Error('Volume目录不存在');
                }
            } catch (error) {
                dataDir = localDataDir;
            }
        } else {
            dataDir = path.join(__dirname, '..', 'data');
        }
        
        // 独立的等级系统数据库文件
        const dbFileName = isProduction ? 'level_system.db' : 'level_system_dev.db';
        this.dbPath = path.join(dataDir, dbFileName);
        
        console.log(`🏆 等级系统数据库路径: ${this.dbPath}`);
        
        // 检查是否启用等级系统
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
        if (!this.enabled) {
            console.log('🏆 等级系统已禁用，设置 LEVEL_SYSTEM_ENABLED=true 启用');
            return;
        }
        
        this.initializeDatabase();
    }
}
```

### 2. 简化的EAV表结构（独立数据库）
```sql
-- 等级系统独立数据库表结构
-- 文件：level_system.db

-- 1. 等级系统元信息表
CREATE TABLE IF NOT EXISTS level_meta (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- 2. 用户等级数据表（简化版EAV）
CREATE TABLE IF NOT EXISTS user_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    group_id TEXT NOT NULL DEFAULT 'default',
    level INTEGER DEFAULT 1,
    total_exp INTEGER DEFAULT 0,
    available_points INTEGER DEFAULT 0,
    total_points_earned INTEGER DEFAULT 0,
    total_points_spent INTEGER DEFAULT 0,
    attack_count INTEGER DEFAULT 0,
    user_eval_count INTEGER DEFAULT 0,
    merchant_eval_count INTEGER DEFAULT 0,
    text_eval_count INTEGER DEFAULT 0,
    badges TEXT DEFAULT '[]', -- JSON数组
    display_name TEXT,
    last_milestone_points INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(user_id, group_id)
);

-- 3. 积分变更日志表
CREATE TABLE IF NOT EXISTS points_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    group_id TEXT NOT NULL DEFAULT 'default',
    action_type TEXT NOT NULL, -- 'attack', 'user_eval', 'merchant_eval', 'text_eval', 'admin_adjust', 'consume', 'milestone'
    exp_change INTEGER DEFAULT 0,
    points_change INTEGER DEFAULT 0,
    exp_after INTEGER NOT NULL,
    points_after INTEGER NOT NULL,
    description TEXT,
    related_eval_id INTEGER,
    admin_id INTEGER,
    timestamp INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 4. 群组配置表
CREATE TABLE IF NOT EXISTS group_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL UNIQUE,
    group_name TEXT,
    level_config TEXT, -- JSON配置
    points_config TEXT, -- JSON配置
    broadcast_config TEXT, -- JSON配置
    status TEXT DEFAULT 'active',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 5. 勋章定义表
CREATE TABLE IF NOT EXISTS badge_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    badge_id TEXT NOT NULL,
    group_id TEXT NOT NULL DEFAULT 'default',
    badge_name TEXT NOT NULL,
    badge_emoji TEXT DEFAULT '🏆',
    badge_desc TEXT,
    unlock_conditions TEXT, -- JSON格式
    badge_type TEXT DEFAULT 'auto', -- 'auto', 'manual', 'special'
    rarity TEXT DEFAULT 'common', -- 'common', 'rare', 'epic', 'legendary'
    status TEXT DEFAULT 'active',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(badge_id, group_id)
);

-- 6. 勋章获得记录表
CREATE TABLE IF NOT EXISTS user_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    group_id TEXT NOT NULL DEFAULT 'default',
    badge_id TEXT NOT NULL,
    awarded_by TEXT DEFAULT 'system', -- 'system', 'admin', user_id
    awarded_reason TEXT,
    awarded_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_levels_user_group ON user_levels(user_id, group_id);
CREATE INDEX IF NOT EXISTS idx_user_levels_level ON user_levels(level DESC);
CREATE INDEX IF NOT EXISTS idx_user_levels_points ON user_levels(available_points DESC);
CREATE INDEX IF NOT EXISTS idx_points_log_user_time ON points_log(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_badges_user_group ON user_badges(user_id, group_id);
```

---

## 🔌 现有接口复用设计

### 1. 复用现有Bot服务（播报功能）
```javascript
// services/levelService.js - 新建独立服务
class LevelService {
    constructor() {
        this.levelDb = require('../config/levelDatabase');
        
        // 复用现有的Bot服务和数据库操作（不修改）
        this.botService = require('./botService'); // 现有的Bot服务
        this.dbOperations = require('../models/dbOperations'); // 现有的数据库操作
        
        // 检查是否启用
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
    }
    
    // 复用现有的播报方法
    async broadcastLevelUp(userId, levelUpData) {
        if (!this.enabled) return;
        
        try {
            // 使用现有的群组播报逻辑
            const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
            if (!GROUP_CHAT_ID) return;
            
            const message = this.formatLevelUpMessage(levelUpData);
            
            // 直接使用现有的bot实例
            if (this.botService.bot) {
                const sentMessage = await this.botService.bot.sendMessage(GROUP_CHAT_ID, message, {
                    parse_mode: 'Markdown'
                });
                
                // 使用现有的置顶逻辑
                try {
                    await this.botService.bot.pinChatMessage(GROUP_CHAT_ID, sentMessage.message_id);
                } catch (pinError) {
                    console.log('置顶消息失败:', pinError.message);
                }
            }
        } catch (error) {
            console.error('等级系统播报失败:', error);
        }
    }
    
    // 复用现有的用户信息获取
    async getUserInfo(userId) {
        try {
            // 使用现有的数据库操作获取用户信息（只读，不修改）
            const userRecord = this.dbOperations.getUserRecord ? 
                this.dbOperations.getUserRecord(userId) : null;
            
            return {
                userId: userId,
                username: userRecord?.username || null,
                displayName: userRecord?.display_name || null
            };
        } catch (error) {
            console.error('获取用户信息失败:', error);
            return { userId, username: null, displayName: null };
        }
    }
}
```

### 2. 复用现有评价系统接口（监听模式）
```javascript
// 在现有的evaluationService.js中添加非破坏性的钩子
// 通过事件监听模式集成，不修改现有代码

// models/levelServiceHook.js - 新建钩子服务
class LevelServiceHook {
    constructor() {
        this.levelService = require('../services/levelService');
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
        
        if (this.enabled) {
            this.initializeHooks();
        }
    }
    
    initializeHooks() {
        // 监听评价完成事件（非破坏性）
        if (global.evaluationEvents) {
            global.evaluationEvents.on('evaluation_completed', this.handleEvaluationCompleted.bind(this));
        } else {
            // 创建全局事件系统（如果不存在）
            const EventEmitter = require('events');
            global.evaluationEvents = new EventEmitter();
            global.evaluationEvents.on('evaluation_completed', this.handleEvaluationCompleted.bind(this));
        }
    }
    
    async handleEvaluationCompleted(evaluationData) {
        try {
            await this.levelService.processEvaluationReward(evaluationData);
        } catch (error) {
            console.error('等级系统处理评价奖励失败:', error);
        }
    }
    
    // 提供给现有代码调用的非破坏性方法
    static triggerEvaluationCompleted(evaluationData) {
        if (global.evaluationEvents) {
            global.evaluationEvents.emit('evaluation_completed', evaluationData);
        }
    }
}

// 自动初始化（仅在启用时）
if (process.env.LEVEL_SYSTEM_ENABLED === 'true') {
    new LevelServiceHook();
}
```

### 3. 现有代码的最小化修改（仅添加一行）
```javascript
// 在现有的evaluationService.js文件中，只需要在评价完成时添加一行代码：

// 现有的评价完成逻辑...
// ... 现有代码不变 ...

// 在评价完成后添加这一行（非破坏性）
if (global.evaluationEvents) {
    global.evaluationEvents.emit('evaluation_completed', {
        userId: evaluation.evaluator_id,
        evaluationId: evaluation.id,
        type: 'user_evaluation', // 或其他类型
        timestamp: Date.now()
    });
}

// 这样现有代码几乎不需要修改，等级系统完全独立运行
```

---

## 🎮 等级系统核心功能

### 1. 默认等级配置
```javascript
const DEFAULT_LEVEL_CONFIG = {
    levels: [
        { level: 1, name: "新手勇士 🟢", required_evals: 0, required_exp: 0 },
        { level: 2, name: "初级勇士 🔵", required_evals: 3, required_exp: 50 },
        { level: 3, name: "中级勇士 🟣", required_evals: 8, required_exp: 150 },
        { level: 4, name: "高级勇士 🟠", required_evals: 15, required_exp: 300 },
        { level: 5, name: "专家勇士 🔴", required_evals: 25, required_exp: 500 },
        { level: 6, name: "大师勇士 🟡", required_evals: 40, required_exp: 750 },
        { level: 7, name: "传说勇士 ⚪", required_evals: 60, required_exp: 1050 },
        { level: 8, name: "史诗勇士 🟤", required_evals: 85, required_exp: 1400 },
        { level: 9, name: "神话勇士 ⚫", required_evals: 120, required_exp: 1800 },
        { level: 10, name: "至尊勇士 🌟", required_evals: 160, required_exp: 2250 }
    ]
};

const DEFAULT_POINTS_CONFIG = {
    attack: { exp: 20, points: 10, desc: "完成出击" },
    user_eval_12: { exp: 30, points: 25, desc: "完成12项按钮评价" },
    merchant_eval: { exp: 25, points: 20, desc: "商家评价用户" },
    text_eval: { exp: 15, points: 15, desc: "文字详细评价" },
    level_up_bonus: { exp: 0, points: 50, desc: "升级奖励" },
    milestones: [100, 500, 1000, 2000, 5000, 10000] // 积分里程碑
};
```

### 2. 用户查询命令（新增，不影响现有）
```javascript
// 在botService.js中添加新的命令处理（不修改现有命令）
bot.onText(/\/我的等级|\/mylevel|\/level/, async (msg) => {
    if (process.env.LEVEL_SYSTEM_ENABLED !== 'true') return;
    
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    
    try {
        const levelService = require('../services/levelService');
        const userLevel = await levelService.getUserLevelInfo(userId);
        const response = levelService.formatLevelResponse(userLevel);
        
        await bot.sendMessage(chatId, response, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔄 刷新', callback_data: 'level_refresh' },
                        { text: '📊 历史', callback_data: 'level_history' }
                    ]
                ]
            }
        });
    } catch (error) {
        console.error('等级查询失败:', error);
    }
});
```

---

## 🎖️ 勋章系统设计

### 1. 勋章定义
```javascript
const DEFAULT_BADGES = [
    {
        badge_id: "first_attack",
        badge_name: "初次出击",
        badge_emoji: "⚡",
        badge_desc: "完成第一次出击",
        unlock_conditions: {
            type: "stat_based",
            field: "attack_count",
            target: 1
        },
        rarity: "common"
    },
    {
        badge_id: "perfect_warrior",
        badge_name: "完美战士",
        badge_emoji: "🏆",
        badge_desc: "连续10次获得满分评价",
        unlock_conditions: {
            type: "evaluation_streak",
            streak_type: "perfect_score",
            count: 10
        },
        rarity: "legendary"
    },
    {
        badge_id: "point_collector",
        badge_name: "积分收集家",
        badge_emoji: "💰",
        badge_desc: "累计获得1000积分",
        unlock_conditions: {
            type: "stat_based",
            field: "total_points_earned",
            target: 1000
        },
        rarity: "rare"
    }
];
```

---

## 📊 管理员界面设计（独立）

### 1. 独立管理页面
```html
<!-- admin/level-system.html - 新建独立页面 -->
<!DOCTYPE html>
<html>
<head>
    <title>等级系统管理</title>
    <link rel="stylesheet" href="../styles/common.css">
    <style>
        .level-system-container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .status-indicator { padding: 5px 10px; border-radius: 3px; }
        .status-enabled { background: #d4edda; color: #155724; }
        .status-disabled { background: #f8d7da; color: #721c24; }
        .user-search { margin: 20px 0; }
        .user-info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="level-system-container">
        <h1>🏆 等级系统管理</h1>
        
        <!-- 系统状态 -->
        <div class="system-status">
            <h2>系统状态</h2>
            <div id="systemStatus" class="status-indicator">检查中...</div>
            <button onclick="toggleLevelSystem()">启用/禁用等级系统</button>
        </div>
        
        <!-- 用户查询 -->
        <div class="user-search">
            <h2>用户查询</h2>
            <input type="text" id="userSearchInput" placeholder="输入用户ID或用户名">
            <button onclick="searchUser()">查询</button>
            
            <div id="userInfo" class="user-info" style="display: none;">
                <!-- 动态显示用户信息 -->
            </div>
        </div>
        
        <!-- 积分调整 -->
        <div class="points-adjustment">
            <h2>积分调整</h2>
            <input type="hidden" id="adjustUserId">
            <input type="number" id="pointsChange" placeholder="积分变化量（正数增加，负数减少）">
            <input type="text" id="adjustReason" placeholder="调整原因">
            <button onclick="adjustPoints()">调整积分</button>
        </div>
        
        <!-- 统计信息 -->
        <div class="statistics">
            <h2>统计信息</h2>
            <div id="levelStats">加载中...</div>
        </div>
    </div>
    
    <script src="../scripts/level-system.js"></script>
</body>
</html>
```

### 2. 管理API接口（独立）
```javascript
// 在httpService.js中添加等级系统API（不修改现有API）
async function handleLevelSystemAPI(pathname, method, data) {
    // 验证管理员权限
    if (!data.password || !isAdminAuthorized(data.password)) {
        return { success: false, message: '无权限访问' };
    }
    
    const levelService = require('../services/levelService');
    
    switch (pathname) {
        case '/api/level/status':
            return {
                success: true,
                enabled: process.env.LEVEL_SYSTEM_ENABLED === 'true',
                userCount: await levelService.getUserCount(),
                totalPoints: await levelService.getTotalPointsIssued()
            };
            
        case '/api/level/user/search':
            return await levelService.searchUser(data.query);
            
        case '/api/level/user/adjust':
            return await levelService.adjustUserPoints(
                data.userId, 
                data.pointsChange, 
                data.reason,
                data.adminId || 0
            );
            
        case '/api/level/stats':
            return await levelService.getSystemStats();
            
        default:
            return { success: false, message: '未知API路径' };
    }
}

// 在现有的路由中添加
if (pathname.startsWith('/api/level/')) {
    return handleLevelSystemAPI(pathname, method, data);
}
```

---

## 🚀 部署和配置

### 1. Railway环境变量
```bash
# Railway Variables 配置
LEVEL_SYSTEM_ENABLED=true        # 启用等级系统
LEVEL_CACHE_TTL=300000           # 缓存时间（5分钟）
LEVEL_BROADCAST_ENABLED=true     # 启用等级播报
LEVEL_POINTS_MILESTONE_100=100   # 积分里程碑配置
LEVEL_POINTS_MILESTONE_500=500
LEVEL_POINTS_MILESTONE_1000=1000
```

### 2. 自动初始化脚本
```javascript
// scripts/init-level-system.js - 独立初始化脚本
class LevelSystemInitializer {
    constructor() {
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
    }
    
    async initialize() {
        if (!this.enabled) {
            console.log('🏆 等级系统未启用，跳过初始化');
            return;
        }
        
        console.log('🏆 初始化等级系统...');
        
        try {
            const LevelDatabaseManager = require('../config/levelDatabase');
            const levelDb = new LevelDatabaseManager();
            
            // 创建默认群组配置
            await this.createDefaultGroupConfig(levelDb);
            
            // 初始化默认勋章
            await this.initializeDefaultBadges(levelDb);
            
            console.log('✅ 等级系统初始化完成');
        } catch (error) {
            console.error('❌ 等级系统初始化失败:', error);
        }
    }
    
    async createDefaultGroupConfig(levelDb) {
        const defaultGroupId = process.env.GROUP_CHAT_ID || 'default';
        
        const config = {
            group_id: defaultGroupId,
            group_name: '默认群组',
            level_config: JSON.stringify(DEFAULT_LEVEL_CONFIG),
            points_config: JSON.stringify(DEFAULT_POINTS_CONFIG),
            broadcast_config: JSON.stringify({
                enabled: true,
                level_up: true,
                badge_unlock: true,
                points_milestone: false
            }),
            status: 'active'
        };
        
        levelDb.db.prepare(`
            INSERT OR REPLACE INTO group_configs 
            (group_id, group_name, level_config, points_config, broadcast_config, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            config.group_id, 
            config.group_name, 
            config.level_config, 
            config.points_config, 
            config.broadcast_config, 
            config.status
        );
    }
}

// 自动运行（仅在启用时）
if (process.env.LEVEL_SYSTEM_ENABLED === 'true') {
    const initializer = new LevelSystemInitializer();
    initializer.initialize();
}
```

---

## 📈 性能和安全考虑

### 1. 数据隔离保证
- **完全独立数据库**：`level_system.db` 与 `marketing_bot.db` 完全分离
- **只读访问现有数据**：等级系统只读取现有用户信息，不修改
- **可逆性**：删除 `level_system.db` 即可完全移除等级系统

### 2. 性能优化
- **缓存策略**：用户等级数据缓存5分钟
- **批量查询**：支持批量获取多用户等级信息
- **异步处理**：积分奖励异步处理，不阻塞主流程

### 3. 故障安全
- **优雅降级**：等级系统故障不影响现有功能
- **错误隔离**：等级系统错误独立处理，不传播到主系统
- **开关控制**：可通过环境变量随时禁用

---

## 🔧 实施计划

### 阶段1：基础架构（2-3小时）
1. 创建独立数据库配置 `config/levelDatabase.js`
2. 创建核心服务 `services/levelService.js`
3. 创建钩子服务 `models/levelServiceHook.js`
4. 添加环境变量控制逻辑

### 阶段2：功能实现（3-4小时）
1. 实现用户等级查询功能
2. 实现积分奖励逻辑
3. 实现勋章系统
4. 添加播报功能

### 阶段3：管理界面（2-3小时）
1. 创建独立管理页面
2. 实现管理API接口
3. 添加统计功能

### 阶段4：测试和优化（1-2小时）
1. 功能测试
2. 性能优化
3. 错误处理完善

---

## 📋 总结

### ✅ 符合要求
1. **完全独立**：使用独立数据库，零破坏性
2. **Railway兼容**：完全支持Volume挂载
3. **复用现有接口**：最大化复用现有bot服务和数据查询
4. **生产数据安全**：绝不修改现有数据库和表结构

### 🎯 实施简单
- **开发时间**：8-12小时总计
- **风险等级**：极低（完全独立）
- **回退成本**：零成本（删除文件即可）
- **维护成本**：低（独立模块）

### 🚀 即时启用
```bash
# Railway Variables 中设置
LEVEL_SYSTEM_ENABLED=true
# 重启应用即可启用等级系统
```

这个设计确保了等级系统完全独立，不会对现有生产数据造成任何影响，同时最大化复用了现有的接口和服务。