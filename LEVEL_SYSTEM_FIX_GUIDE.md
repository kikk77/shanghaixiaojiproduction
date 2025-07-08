# 等级系统修复指南

## 问题描述

1. **硬编码数据问题**：管理员面板显示的是测试数据，而不是真实的生产数据
2. **数据一致性问题**：等级系统数据库与主业务数据库不同步
3. **API功能问题**：部分API端点返回硬编码数据或空数据

## 解决方案

### 1. 数据同步

我们创建了新的数据同步脚本，确保只有有实际活动（订单或评价）的用户才会显示在等级系统中。

#### 手动同步数据
```bash
# 运行数据同步脚本
node level/scripts/sync-production-data.js

# 或使用快捷命令
node level/scripts/manual-sync-now.js
```

### 2. 修复API功能

运行修复脚本来确保所有API端点正常工作：
```bash
node level/scripts/fix-production-level-api.js
```

### 3. 修改说明

#### 已修改的文件

1. **app.js**
   - 启动时自动运行数据同步脚本
   - 确保生产环境数据的一致性

2. **services/httpService.js**
   - 修改了用户列表API，只返回真实用户（user_id >= 1000000）
   - 修改了统计API，只统计有活动的用户
   - 确保activeOnly参数正常工作

3. **level/scripts/sync-production-data.js** （新文件）
   - 从主数据库同步有评价记录的用户
   - 自动计算等级和积分
   - 生成积分变更日志

4. **level/admin/level-system.js**
   - 默认不显示所有用户（showAllUsers = false）
   - 只显示有活动记录的用户

## 使用说明

### 管理员面板

1. 访问管理员面板：`https://your-app.railway.app/admin/level-system`
2. 默认情况下，排行榜只显示有活动记录的用户
3. 如需查看所有用户（包括无活动的），勾选"显示所有用户"选项

### 排行榜规则

- **显示条件**：用户必须有至少一次评价记录（作为评价者或被评价者）
- **等级计算**：基于实际的评价数据自动计算
- **积分奖励**：
  - 用户评价商家：30经验 + 25积分
  - 商家评价用户：25经验 + 20积分
  - 文字详细评价：15经验 + 15积分

### Railway部署

1. 确保设置环境变量：
   ```
   LEVEL_SYSTEM_ENABLED=true
   ```

2. 部署后会自动运行数据同步

3. 可以通过Railway日志查看同步结果

## 故障排除

### 问题1：管理面板显示空数据

**解决方法**：
1. 运行数据同步脚本
2. 检查是否有群组配置
3. 确保选择了正确的群组ID

### 问题2：用户等级不更新

**解决方法**：
1. 检查评价数据是否正确导入
2. 运行 `node level/scripts/import-cloud-evaluations.js` 导入历史评价
3. 检查等级系统是否启用

### 问题3：API返回错误

**解决方法**：
1. 检查请求是否包含必需的参数（如groupId）
2. 确保数据库连接正常
3. 查看服务器日志获取详细错误信息

## 维护建议

1. **定期同步**：建议每天运行一次数据同步脚本
2. **数据备份**：定期备份level_system.db数据库
3. **监控日志**：关注等级系统相关的错误日志
4. **性能优化**：如果用户数量增加，考虑添加更多索引

## 相关脚本

- `level/scripts/sync-production-data.js` - 同步生产数据
- `level/scripts/fix-production-level-api.js` - 修复API功能
- `level/scripts/import-cloud-evaluations.js` - 导入历史评价数据
- `level/scripts/init-level-system.js` - 初始化等级系统 