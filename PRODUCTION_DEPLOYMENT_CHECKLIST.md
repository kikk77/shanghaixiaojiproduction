# 生产环境部署检查清单

## 部署前确认事项

### 1. 数据库表结构检查
- [ ] 确认生产环境的 `evaluations` 表存在以下字段：
  - evaluator_id
  - evaluator_type
  - status
  - comments
- [ ] 确认生产环境的 `orders` 表存在以下字段：
  - user_id
  - user_name
  - user_username

### 2. 环境变量设置
- [ ] 确认Railway已设置：`LEVEL_SYSTEM_ENABLED=true`
- [ ] 确认Railway Volume已正确挂载到 `/app/data`

### 3. 代码更新确认
已修改的文件：
- [ ] `app.js` - 启动时自动同步
- [ ] `services/httpService.js` - API查询逻辑
- [ ] `level/scripts/sync-production-data.js` - 数据同步脚本
- [ ] `level/admin/level-system.js` - 管理面板默认设置

新增的文件：
- [ ] `level/scripts/manual-sync-now.js`
- [ ] `level/scripts/fix-production-level-api.js`
- [ ] `LEVEL_SYSTEM_FIX_GUIDE.md`

### 4. 首次部署步骤

1. **推送代码到GitHub**
   ```bash
   git add .
   git commit -m "修复等级系统：只显示有活动的用户"
   git push origin main
   ```

2. **Railway部署**
   - Railway会自动部署最新代码
   - 查看部署日志，确认没有错误

3. **验证同步脚本运行**
   查看日志中应该有：
   ```
   🔄 同步生产环境用户数据...
   ✅ 用户数据同步完成
   ```

4. **验证管理面板**
   - 访问 `https://your-app.railway.app/admin/level-system`
   - 检查是否需要创建默认群组配置
   - 验证用户列表是否正确显示

### 5. 可能的问题及解决方案

#### 问题1：没有群组配置
**解决方案**：
1. 在Railway Shell中运行：
   ```bash
   node level/scripts/fix-production-level-api.js
   ```
2. 或在管理面板中创建群组

#### 问题2：数据同步失败
**解决方案**：
1. 检查数据库表结构
2. 手动运行同步：
   ```bash
   node level/scripts/sync-production-data.js
   ```

#### 问题3：API返回空数据
**解决方案**：
1. 确保在API请求中包含groupId参数
2. 检查是否有有效的群组配置

### 6. 功能验证清单

- [ ] 排行榜默认只显示有评价的用户
- [ ] "显示所有用户"复选框功能正常
- [ ] 统计数据正确（只统计有活动的用户）
- [ ] 等级分布图表正确显示
- [ ] 用户详情功能正常
- [ ] 积分调整功能正常

### 7. 监控要点

部署后需要监控：
1. **错误日志**：查看是否有数据库连接或查询错误
2. **性能指标**：确保查询性能正常
3. **用户反馈**：确认功能是否符合预期

### 8. 回滚方案

如果出现问题：
1. 在Railway中回滚到上一个部署版本
2. 或者临时禁用等级系统：
   ```bash
   # 在Railway环境变量中设置
   LEVEL_SYSTEM_ENABLED=false
   ```

## 部署后验证

### 管理员面板功能测试
1. [ ] 访问等级系统管理页面
2. [ ] 验证用户列表显示正确
3. [ ] 测试"显示所有用户"开关
4. [ ] 检查统计数据准确性
5. [ ] 测试用户搜索功能
6. [ ] 测试积分调整功能

### API端点测试
```bash
# 在浏览器或curl中测试
GET /api/level/groups
GET /api/level/users?groupId=-1002384738564&activeOnly=true
GET /api/level/stats?groupId=-1002384738564
```

### 数据一致性检查
在Railway Shell中运行：
```bash
node level/scripts/fix-production-level-api.js
```
查看输出的统计信息是否正确。 