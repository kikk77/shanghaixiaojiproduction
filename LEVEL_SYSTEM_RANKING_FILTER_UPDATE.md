# 等级系统排行榜筛选功能更新

## 更新概述
根据需求，等级系统的排行榜功能已更新，现在支持筛选显示用户：
- 默认只显示有评价记录的用户
- 可选择显示所有用户（包括无评价记录的用户）

## 主要修改

### 1. 数据同步服务
**文件**: `level/scripts/sync-user-evaluation-data.js`
- 从主数据库同步有评价记录的用户到等级系统
- 同步用户ID、显示名称、@用户名和评价计数

### 2. 排行榜API更新
**文件**: `level/services/levelService.js`
- `getRankings()` 方法新增 `includeInactive` 参数
- `includeInactive = false`（默认）：只显示有评价记录的用户
- `includeInactive = true`：显示所有用户
- 查询结果包含 `username` 字段用于显示 @用户名

### 3. Bot命令更新
**文件**: `services/botService.js`
- `/ranking` 命令默认只显示有评价记录的用户
- 无评价记录的用户查看排名时会提示"暂无排名"

### 4. 管理面板更新
**文件**: `level/admin/level-system.html` 和 `level/admin/level-system.js`
- 添加"只显示有评价记录的用户"复选框
- 表格新增"评价数"列
- 支持动态切换显示模式

## 数据库结构
`user_levels` 表包含以下关键字段：
- `user_id`: 用户ID
- `display_name`: 显示名称
- `username`: Telegram用户名（不含@）
- `user_eval_count`: 用户评价次数
- `level`: 等级
- `total_exp`: 总经验值

## 使用方式

### 1. 同步数据
```bash
LEVEL_SYSTEM_ENABLED=true node level/scripts/sync-user-evaluation-data.js
```

### 2. 测试排行榜筛选
```bash
LEVEL_SYSTEM_ENABLED=true node level/scripts/test-ranking-filter.js
```

### 3. 在代码中使用
```javascript
// 获取活跃用户排行榜（默认）
const activeRanking = await levelService.getRankings('level', 10, false);

// 获取所有用户排行榜
const allRanking = await levelService.getRankings('level', 10, true);
```

## 重要说明
1. **主数据库保持只读**：等级系统只从主数据库读取数据，不会修改任何内容
2. **独立运行**：等级系统有自己的数据库，不依赖主系统
3. **兼容性**：等级系统去兼容原系统，而不是改原系统去兼容等级系统

## 部署注意事项
1. 设置环境变量 `LEVEL_SYSTEM_ENABLED=true` 启用等级系统
2. 首次部署需要运行初始化脚本和数据同步脚本
3. 定期运行数据同步脚本以更新用户评价数据 