# 广州小鸡管家 - Telegram营销机器人系统

一个功能完整的Telegram营销机器人系统，专为服务行业打造，支持商家管理、用户预约、订单处理、评价系统等完整业务流程。

## 🚀 功能特性

### 核心功能
- **智能Bot交互** - 基于Telegram Bot API的用户交互系统
- **商家管理** - 完整的商家注册、认证、信息管理流程
- **预约系统** - 用户预约、商家确认、订单跟踪
- **双向评价** - 用户和商家互相评价系统
- **实时播报** - 订单状态群组播报功能
- **数据统计** - 完整的业务数据统计和报表

### 管理功能
- **Web管理后台** - 订单管理、商家管理、统计报表
- **数据导入导出** - 支持业务数据的备份和迁移
- **多环境支持** - 开发、测试、生产环境隔离
- **权限管理** - 管理员身份验证和权限控制

## 🏗️ 技术架构

### 技术栈
- **运行时**: Node.js 18+
- **数据库**: SQLite (better-sqlite3)
- **Bot框架**: node-telegram-bot-api
- **Web服务**: 原生HTTP服务器
- **前端**: HTML/CSS/JavaScript
- **部署**: Railway Platform + Docker

### 项目结构
```
kitelegrambot/
├── app.js                 # 应用入口
├── config/               # 配置文件
│   ├── database.js       # 数据库配置
│   └── environment.js    # 环境配置
├── models/               # 数据模型
├── services/             # 业务服务层
├── admin/                # Web管理后台
├── scripts/              # 部署和维护脚本
├── utils/                # 工具函数
└── data/                 # 数据库文件目录
```

## 📦 部署指南

### Railway部署 (推荐)

1. **创建Railway项目**
   ```bash
   # 连接GitHub仓库到Railway
   # Railway会自动检测并使用railway.toml配置
   ```

2. **设置环境变量**
   在Railway Variables中设置：
   ```
   NODE_ENV=production
   BOT_TOKEN=你的Bot Token
   BOT_USERNAME=你的Bot用户名
   GROUP_CHAT_ID=播报群组ID
   ADMIN_PASSWORD=管理员密码
   ```

3. **配置Volume**
   - 创建Volume: `telegram-bot-data`
   - 挂载路径: `/app/data`
   - 用于数据库文件持久化

4. **部署**
   - 推送代码到GitHub
   - Railway自动触发部署
   - 访问 `https://your-app.railway.app/health` 检查状态

### Docker部署

```bash
# 构建镜像
docker build -t telegram-marketing-bot .

# 运行容器
docker run -d \
  --name marketing-bot \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e BOT_TOKEN=你的Bot Token \
  -e BOT_USERNAME=你的Bot用户名 \
  -e NODE_ENV=production \
  telegram-marketing-bot
```

### 本地开发

1. **安装依赖**
   ```bash
   npm install
   ```

2. **配置环境**
   ```bash
   # 复制环境变量模板
   cp env.example .env
   # 编辑.env文件，填入真实配置
   ```

3. **启动应用**
   ```bash
   # 开发模式
   npm run dev
   
   # 生产模式
   npm start
   ```

## 🔧 配置说明

### 环境变量
| 变量名 | 必需 | 说明 |
|--------|------|------|
| `BOT_TOKEN` | ✅ | Telegram Bot Token |
| `BOT_USERNAME` | ✅ | Bot用户名(不含@) |
| `GROUP_CHAT_ID` | ❌ | 播报群组ID |
| `ADMIN_PASSWORD` | ✅ | 管理员密码 |
| `NODE_ENV` | ❌ | 环境标识 |
| `PORT` | ❌ | HTTP服务端口 |

### 数据库配置
- **生产环境**: 使用Railway Volume (`/app/data/marketing_bot.db`)
- **开发环境**: 本地文件 (`./data/marketing_bot_dev.db`)
- **自动迁移**: 应用启动时自动执行数据库迁移

## 📱 使用指南

### Bot功能
1. **用户端**
   - 发送触发词开始预约流程
   - 选择地区和服务类型
   - 联系商家并完成服务
   - 提交评价和反馈

2. **商家端**
   - 使用绑定码注册商家账号
   - 管理个人信息和服务价格
   - 处理用户预约请求
   - 参与评价系统

### 管理后台
访问 `https://your-app.railway.app/admin` 进入管理后台：
- 订单管理和状态跟踪
- 商家信息管理
- 数据统计和报表
- 系统配置管理

## 🔄 数据管理

### 备份
```bash
# 手动备份
npm run db:backup

# 定时备份
npm run db:backup-scheduled
```

### 数据导出
```bash
# 导出业务数据
curl -X POST http://localhost:3000/api/data/export
```

### 数据迁移
```bash
# EAV模型迁移
npm run migrate:eav
```

## 🛠️ 开发指南

### 添加新功能
1. 在 `services/` 目录添加服务模块
2. 在 `models/` 目录添加数据模型
3. 更新 `botService.js` 添加Bot交互逻辑
4. 在 `admin/` 目录添加管理界面

### 数据库变更
1. 修改 `config/database.js` 中的表结构
2. 增加数据库版本号
3. 添加迁移逻辑

### API扩展
1. 在相应的服务文件中添加业务逻辑
2. 在 `services/apiService.js` 中添加API端点
3. 更新管理后台前端代码

## 📊 监控和维护

### 健康检查
- 端点: `/health`
- 检查数据库连接和Bot状态
- Railway自动监控

### 日志管理
```bash
# 查看实时日志
npm run logs

# 检查应用状态
npm run status
```

### 性能优化
- 定期清理过期数据
- 监控内存使用情况
- 优化数据库查询

## 🔒 安全注意事项

1. **环境变量保护**
   - 不要在代码中硬编码敏感信息
   - 使用Railway Variables管理密钥

2. **数据库安全**
   - 定期备份数据库
   - 使用Volume确保数据持久化

3. **API安全**
   - 管理员接口需要密码验证
   - 限制敏感操作的访问权限

## 📝 更新日志

### v1.1.2 (当前版本)
- 完整的评价系统重构
- 优化数据库结构和性能
- 增强Railway部署支持
- 改进错误处理和日志记录

## 🤝 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 📄 许可证

MIT License

## 🆘 支持

如遇问题，请：
1. 检查 `/health` 端点状态
2. 查看应用日志
3. 验证环境变量配置
4. 确认数据库连接正常

---

**注意**: 本项目专为特定业务场景设计，使用前请确保了解完整的业务流程和数据结构。 