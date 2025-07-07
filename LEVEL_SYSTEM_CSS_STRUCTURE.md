# 等级系统CSS结构说明

## 概述
等级系统采用独立的CSS文件结构，与主项目的样式完全分离，确保模块的独立性和可维护性。

## 文件结构

```
level/
├── admin/
│   ├── styles/
│   │   └── level-system.css     # 等级系统专用CSS文件
│   ├── level-system.html        # 管理界面HTML
│   └── level-system.js          # 管理界面JavaScript
```

## CSS文件说明

### level-system.css
位置：`/level/admin/styles/level-system.css`

这是等级系统的核心样式文件，包含：

1. **基础样式**
   - 全局样式重置
   - 字体和颜色定义
   - 容器布局

2. **组件样式**
   - 统计卡片（.stats-grid, .stat-card）
   - 标签页（.tabs, .tab）
   - 数据表格（.user-table）
   - 等级徽章（.level-badge, .level-1 到 .level-5）
   - 勋章样式（.badge-item, .badge-rarity-*）

3. **交互元素**
   - 按钮样式（.btn, .btn-primary, .btn-success等）
   - 表单样式（.form-group）
   - 模态框（.modal）
   - 搜索栏（.search-bar）

4. **图表容器**
   - Chart.js图表容器样式

5. **响应式设计**
   - 移动端适配
   - 平板适配

6. **工具类**
   - 文本对齐
   - 间距控制

## 访问路径

- HTML页面：`/admin/level-system`
- CSS文件：`/level/admin/styles/level-system.css`
- JS文件：`/level/admin/level-system.js`

## 与主项目的关系

1. **完全独立**：等级系统不依赖主项目的CSS文件（如`/admin/styles/common.css`）
2. **命名空间隔离**：所有等级系统相关的CSS类都有明确的语义
3. **资源独立**：静态资源通过独立的路径服务

## 部署注意事项

1. **静态文件服务**：确保HTTP服务正确配置了`/level/admin/`路径的静态文件服务
2. **相对路径**：HTML中使用绝对路径引用CSS文件，确保在任何环境下都能正确加载
3. **缓存策略**：生产环境可以为CSS文件添加版本号或哈希值以控制缓存

## 维护指南

1. **样式修改**：所有等级系统的样式修改都应在`level-system.css`中进行
2. **新增组件**：新的UI组件应遵循现有的命名规范
3. **响应式设计**：确保新增样式支持移动端
4. **性能优化**：避免过度嵌套的选择器，保持CSS文件的简洁性

## 示例用法

```html
<!-- 在等级系统HTML页面中引用 -->
<link rel="stylesheet" href="/level/admin/styles/level-system.css">

<!-- 使用等级徽章 -->
<span class="level-badge level-3">精英小鸡</span>

<!-- 使用勋章样式 -->
<span class="badge-item badge-rarity-epic">🏆 评价大师</span>

<!-- 使用按钮样式 -->
<button class="btn btn-primary">保存配置</button>
``` 