# 等级系统生产环境数据同步指南

## 🔍 问题分析

### 问题现象
- **本地开发环境**：用户列表正常显示（xiaoji57、Iron-man钢铁侠等2个用户）
- **生产环境**：后台管理员页面显示"加载用户列表失败"或显示旧的测试数据

### 根本原因
1. **数据库隔离设计**：等级系统使用独立数据库（`level_system.db`），与主数据库（`marketing_bot.db`）分离
2. **数据同步缺失**：生产环境的等级系统数据库没有从主数据库同步真实的评价数据
3. **环境差异**：
   - 本地：`/Users/kikk/Desktop/上海小鸡管家/data/level_system_dev.db`
   - 生产：`/app/data/level_system.db`（Railway Volume）

## 🛠️ 解决方案

### 1. 自动同步（推荐）

**在Railway部署时自动运行数据同步：**

```bash
# Railway启动脚本已更新，会自动执行：
# 1. 初始化等级系统表结构
# 2. 从主数据库同步用户评价数据
# 3. 启动主应用
```

**确保环境变量设置：**
```bash
LEVEL_SYSTEM_ENABLED=true
```

### 2. 手动同步

**如果需要手动执行数据同步：**

```bash
# 在Railway控制台或SSH连接中执行
cd /app
LEVEL_SYSTEM_ENABLED=true node level/scripts/sync-from-main-database.js
```

### 3. 验证同步结果

**检查用户数据：**
```bash
# 连接等级系统数据库
sqlite3 /app/data/level_system.db

# 查看用户列表
SELECT user_id, display_name, level, total_exp, available_points 
FROM user_levels 
ORDER BY total_exp DESC;

# 查看用户数量
SELECT COUNT(*) as total_users FROM user_levels;
```

## 📊 数据同步逻辑

### 数据来源
等级系统从主数据库的 `evaluations` 表读取数据：
- `evaluator_id` → 用户ID
- `evaluator_type` → 评价类型（user/merchant）
- `comments` → 文字评价内容
- `created_at` → 评价时间

### 计算规则
```javascript
// 基于历史评价数据计算奖励
const userEvalReward = evaluation_count * 30;     // 每次用户评价30经验
const merchantEvalReward = merchant_eval_count * 25; // 每次商家评价25经验  
const textEvalReward = text_eval_count * 15;     // 每次文字评价15经验

const totalExp = userEvalReward + merchantEvalReward + textEvalReward;
const totalPoints = Math.floor(totalExp * 0.8);  // 积分约为经验的80%

// 等级计算
if (totalExp >= 1000) level = 5;
else if (totalExp >= 500) level = 4;
else if (totalExp >= 200) level = 3;
else if (totalExp >= 100) level = 2;
else level = 1;
```

## 🔄 同步脚本功能

### 主要特性
- ✅ **安全性**：只读取主数据库，不修改
- ✅ **增量同步**：跳过已存在用户，避免重复
- ✅ **数据完整性**：同时同步用户数据和积分历史
- ✅ **环境适配**：自动识别开发/生产环境路径

### 同步内容
1. **用户基础信息**：用户ID、显示名称、创建时间
2. **等级数据**：等级、经验值、积分
3. **评价统计**：用户评价次数、商家评价次数、文字评价次数
4. **积分历史**：记录历史数据同步日志

## 🚀 部署流程

### Railway自动部署
1. 推送代码到GitHub
2. Railway自动构建和部署
3. 启动脚本自动执行数据同步
4. 等级系统正常工作

### 验证步骤
1. 访问管理面板：`https://your-app.railway.app/level/admin/level-system.html`
2. 检查"👥 用户管理"标签页
3. 确认显示真实用户数据而非测试数据

## 📝 注意事项

### 数据库隔离原则
- **主数据库（marketing_bot.db）**：核心业务数据，绝对不能动
- **等级系统数据库（level_system.db）**：独立功能，独立管理
- **数据流向**：主数据库 → 等级系统（单向读取）

### 环境变量要求
```bash
# 必需
LEVEL_SYSTEM_ENABLED=true

# Railway环境自动设置
RAILWAY_ENVIRONMENT_NAME=production
NODE_ENV=production
```

### 故障排除
1. **用户列表为空**：检查环境变量，运行同步脚本
2. **API错误**：检查数据库连接和表结构
3. **权限问题**：确保Railway Volume挂载正常

## 🔧 维护命令

### 重新同步数据
```bash
# 清空等级系统数据（谨慎操作）
sqlite3 /app/data/level_system.db "DELETE FROM user_levels; DELETE FROM points_log;"

# 重新同步
LEVEL_SYSTEM_ENABLED=true node level/scripts/sync-from-main-database.js
```

### 检查同步状态
```bash
# 查看最近同步记录
sqlite3 /app/data/level_system.db "
SELECT description, timestamp, COUNT(*) as count 
FROM points_log 
WHERE action_type = 'historical_sync' 
GROUP BY description 
ORDER BY timestamp DESC;
"
```

这样就能确保生产环境的等级系统正常显示真实的用户数据了！ 