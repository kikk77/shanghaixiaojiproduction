# 数据库版本管理和迁移指南

## 概述

你的系统已经内置了完善的数据库版本管理机制，**不需要重置数据库**就能进行功能升级。系统通过以下方式确保数据兼容性：

## 核心机制

### 1. 多数据库架构
- **核心数据库** (`core.db`): 存储商家、地区、订单等永久数据
- **模板数据库** (`templates.db`): 存储消息模板和配置
- **月度用户数据库** (`users_YYYY_MM.db`): 按月分离用户交互数据

### 2. 数据库版本控制
```sql
-- 系统自动维护版本信息
CREATE TABLE db_meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

### 3. 自动迁移机制
系统在启动时会：
- 检查当前数据库版本
- 自动添加缺失的列
- 迁移旧格式数据
- 保持向下兼容

## 实际使用场景

### 场景1：增加新功能字段
**需求**：为商家表添加"营业时间"字段

```javascript
// 在database.js中添加：
try {
    db.exec(`ALTER TABLE merchants ADD COLUMN working_hours TEXT`);
} catch (e) { /* 列已存在，忽略错误 */ }
```

**结果**：
- ✅ 现有56个老师数据完全保留
- ✅ 400多个订单数据完全保留
- ✅ 新字段自动添加，默认值为NULL
- ✅ 系统正常运行

### 场景2：修改数据结构
**需求**：将价格字段从单一改为区间

```javascript
// 旧字段保留，新增字段
try {
    db.exec(`ALTER TABLE merchants ADD COLUMN price_range_min INTEGER`);
    db.exec(`ALTER TABLE merchants ADD COLUMN price_range_max INTEGER`);
} catch (e) { /* 已存在 */ }

// 数据迁移逻辑
const merchants = db.prepare('SELECT * FROM merchants WHERE price_range_min IS NULL').all();
merchants.forEach(merchant => {
    if (merchant.price1) {
        db.prepare(`UPDATE merchants SET price_range_min = ?, price_range_max = ? WHERE id = ?`)
          .run(merchant.price1, merchant.price2 || merchant.price1, merchant.id);
    }
});
```

### 场景3：添加新功能表
**需求**：增加"优惠券"功能

```javascript
// 直接添加新表，不影响现有数据
db.exec(`
    CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        merchant_id INTEGER,
        code TEXT UNIQUE,
        discount_amount INTEGER,
        valid_until INTEGER,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    )
`);
```

## 线上升级流程

### 1. 开发环境测试
```bash
# 1. 备份当前数据
node utils/backupDatabase.js backup ./backup-before-upgrade.json

# 2. 部署新代码
# 3. 系统启动时自动执行迁移
# 4. 验证数据完整性
```

### 2. 生产环境部署
```bash
# Railway会自动执行：
# 1. 下载新代码
# 2. 启动应用
# 3. 自动数据库迁移
# 4. 保持服务运行
```

## 数据备份和恢复

### 备份数据
```bash
# 创建完整备份
node utils/backupDatabase.js backup ./backup-$(date +%Y%m%d).json

# 定期自动备份
node utils/backupDatabase.js scheduled
```

### 恢复数据
```bash
# 从备份恢复
node utils/backupDatabase.js restore ./backup-20241220.json
```

## Railway云端数据管理

### 数据访问方式
1. **Railway CLI**
```bash
railway login
railway environment
railway run node utils/backupDatabase.js backup ./cloud-backup.json
```

2. **通过API接口**
系统提供管理接口访问云端数据

3. **定期自动备份**
可配置定时任务将数据备份到云存储

### 数据本地同步
```bash
# 下载云端数据到本地
railway run node -e "
const { backupToJSON } = require('./utils/backupDatabase');
backupToJSON('./local-sync.json');
"
```

## 最佳实践

### 1. 版本兼容性
- ✅ 只添加字段，不删除字段
- ✅ 使用默认值确保兼容性
- ✅ 保留旧字段，逐步迁移
- ❌ 直接删除或重命名字段

### 2. 数据安全
- 🔄 升级前自动备份
- 📊 迁移后数据验证
- 🔒 关键操作使用事务
- ⏰ 定期备份策略

### 3. 零停机升级
- 🚀 Railway自动部署
- 📈 渐进式功能发布
- 🔍 实时监控数据完整性
- 🛡️ 快速回滚机制

## 总结

**你完全不需要担心数据兼容性问题！**

- ✅ 现有的56个老师和400多个订单数据会完全保留
- ✅ 可以在现有文件基础上直接开发新功能
- ✅ 数据库会自动升级，无需手动操作
- ✅ Railway云端数据可以备份和同步
- ✅ 支持零停机升级和快速回滚

系统设计时就考虑了长期演进，你可以放心地持续开发和升级功能！ 