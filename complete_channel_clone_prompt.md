# Telegram频道内容克隆功能集成需求 - EAV模式

## 项目概述
在现有的"上海小鸡管家"Telegram机器人系统基础上，集成频道内容克隆功能模块，实现主频道到目标频道的实时内容克隆，支持所有消息类型的完整复制。保持现有技术栈和架构设计，采用EAV（Entity-Attribute-Value）数据模型进行数据管理。

## 核心功能需求

### 1. 实时监控与克隆
- **监听主频道**：实时监控主频道的所有新消息（不硬编码频道ID，通过配置管理）
- **完整复制**：支持纯文字、纯图片/视频、图片+文字、视频+文字等所有消息类型
- **无转发标记**：使用copyMessage API确保复制的消息不显示"转发自"标记
- **实时性**：消息发送后立即触发复制（延迟<5秒）

### 2. 编辑同步功能
- **监听编辑事件**：检测主频道消息的编辑操作
- **同步编辑**：自动更新目标频道对应的消息内容
- **消息映射**：维护原消息ID与复制消息ID的映射关系

### 3. 历史消息同步
- **批量同步**：支持同步指定时间段的历史消息
- **进度控制**：显示同步进度，支持暂停/继续
- **防限流**：实现智能速率控制避免API限制

### 4. 管理员控制界面
- **频道配置管理**：通过Web管理界面配置源频道和目标频道（不硬编码）
- **消息选择**：提供Web管理界面或Telegram内联键盘
- **选择方式**：支持单选、多选、滑动范围选择
- **过滤功能**：按消息类型、时间、关键词过滤
- **白名单/黑名单**：设置需要/不需要复制的消息规则

### 5. 高级功能
- **内容修改**：可选择性修改复制内容（添加前缀、后缀等）
- **定时发送**：支持延迟发送或定时发送
- **统计功能**：复制成功率、失败日志等

## 技术栈要求（基于现有项目）

### 后端技术（保持一致）
- **语言**：Node.js 18+（与现有项目一致）
- **Bot框架**：node-telegram-bot-api（现有依赖）
- **数据库**：SQLite (better-sqlite3)（现有数据库）
- **数据模型**：EAV（Entity-Attribute-Value）模式
- **Web服务**：原生HTTP服务器（现有架构）
- **定时任务**：node-cron（现有依赖）
- **部署**：Railway平台 + Volume持久化存储（现有部署）

### 前端管理界面（扩展现有后台）
- **技术**：HTML/CSS/JavaScript（与现有admin后台一致）
- **UI风格**：响应式设计（保持现有风格）
- **集成方式**：在现有admin目录下新增频道管理页面

### Railway部署约束
- **Volume限制**：Railway只能设置一个Volume挂载路径(/app/data)
- **数据库文件**：在/app/data目录下可以创建多个.db文件
- **建议结构**：
  - `/app/data/database.db` - 现有业务数据库
  - `/app/data/channel_clone.db` - 频道克隆EAV数据库

### 配置管理方案（不硬编码）
**推荐方案：环境变量 + 管理面板结合**
- **环境变量**：设置默认配置和系统参数
- **管理面板**：动态配置源频道和目标频道
- **支持多组配置**：一个系统可以管理多组频道克隆关系

```bash
# 新增环境变量（不硬编码频道ID）
CHANNEL_CLONE_ENABLED=true
DEFAULT_SOURCE_CHANNEL_ID=-1001234567890  # 默认源频道（可选）
DEFAULT_TARGET_CHANNEL_ID=-1001234567891  # 默认目标频道（可选）
MAX_CLONE_RATE=30  # 每分钟最大克隆消息数
CLONE_QUEUE_SIZE=1000  # 消息队列最大长度
```

### 关键API使用
```javascript
// 主要用到的Telegram Bot API方法
- bot.copyMessage() // 复制消息
- bot.editMessageText() // 编辑文字消息  
- bot.editMessageMedia() // 编辑媒体消息
- bot.on('message') // 监听新消息
- bot.on('edited_message') // 监听消息编辑
- bot.getChat() // 获取频道信息
```

## EAV数据模型设计

### 1. EAV表结构（存储在channel_clone.db）
```sql
-- 实体表 - 存储所有频道克隆相关的实体
CREATE TABLE IF NOT EXISTS channel_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL, -- 'channel_config', 'message_mapping', 'clone_queue', 'filter_rule', 'clone_log', 'statistics'
    entity_name TEXT, -- 实体名称（如配置名称）
    parent_id INTEGER, -- 父实体ID（用于建立关联关系）
    status TEXT DEFAULT 'active', -- 'active', 'inactive', 'deleted'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT DEFAULT 'system'
);

-- 属性表 - 定义所有可能的属性
CREATE TABLE IF NOT EXISTS channel_attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attribute_name TEXT NOT NULL UNIQUE, -- 属性名称
    attribute_type TEXT NOT NULL, -- 'string', 'integer', 'boolean', 'json', 'datetime', 'text'
    attribute_category TEXT, -- 属性分类
    description TEXT, -- 属性描述
    is_required BOOLEAN DEFAULT 0,
    default_value TEXT,
    validation_rule TEXT, -- JSON格式验证规则
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 值表 - 存储实体的属性值
CREATE TABLE IF NOT EXISTS channel_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL,
    attribute_id INTEGER NOT NULL,
    value_string TEXT,
    value_integer INTEGER,
    value_boolean BOOLEAN,
    value_json TEXT,
    value_datetime DATETIME,
    value_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES channel_entities(id),
    FOREIGN KEY (attribute_id) REFERENCES channel_attributes(id),
    UNIQUE(entity_id, attribute_id)
);

-- 关系表 - 存储实体间的关系
CREATE TABLE IF NOT EXISTS channel_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_entity_id INTEGER NOT NULL,
    child_entity_id INTEGER NOT NULL,
    relation_type TEXT NOT NULL, -- 'config_to_mapping', 'mapping_to_log', 'config_to_filter'
    relation_data TEXT, -- JSON格式的关系数据
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_entity_id) REFERENCES channel_entities(id),
    FOREIGN KEY (child_entity_id) REFERENCES channel_entities(id)
);
```

### 2. EAV属性预定义
频道克隆功能需要预定义的属性包括：
- **channel_config类型**：source_channel_id, target_channel_id, config_name, clone_enabled, clone_rules等
- **message_mapping类型**：source_message_id, target_message_id, message_type, clone_status等
- **clone_queue类型**：priority, scheduled_time, retry_count, queue_type等
- **filter_rule类型**：filter_type, filter_rule, filter_action, modification_template等
- **clone_log类型**：action, status, error_message, processing_time等

## 架构设计要求（集成到现有项目）

### 1. 文件结构扩展（独立模块设计）
```
kitelegrambot/
├── app.js                    # 现有入口文件
├── config/                   # 现有配置
│   ├── database.js          # 现有业务数据库配置
│   ├── channelDatabase.js   # 新增：频道克隆EAV数据库配置
│   └── environment.js       # 现有环境配置
├── models/                   # 现有数据模型
│   ├── databaseSchema.js    # 现有业务表结构
│   ├── channelEAVSchema.js  # 新增：频道克隆EAV表结构
│   ├── dbOperations.js      # 现有业务数据操作
│   ├── channelEAVOperations.js # 新增：频道克隆EAV数据操作
│   └── channelDataMapper.js # 新增：EAV到业务对象的映射层
├── services/                 # 现有业务服务
│   ├── botService.js        # 扩展：集成频道监听功能
│   ├── httpService.js       # 扩展：添加频道管理API
│   ├── channelCloneService.js # 新增：频道克隆核心服务
│   ├── messageQueueService.js # 新增：消息队列处理（基于EAV）
│   ├── contentFilterService.js # 新增：内容过滤服务（基于EAV）
│   └── channelConfigService.js # 新增：频道配置管理服务（EAV模式）
├── admin/                    # 现有管理后台
│   ├── channels.html        # 新增：频道管理主页
│   ├── channel-config.html  # 新增：频道配置页面（动态配置，不硬编码）
│   ├── channel-logs.html    # 新增：克隆日志页面
│   ├── channel-stats.html   # 新增：统计分析页面
│   └── scripts/             # 扩展：频道管理脚本
│       └── channel-management.js # 新增：频道管理专用脚本
└── data/                     # 数据目录（Railway Volume挂载）
    ├── database.db          # 现有业务数据库
    └── channel_clone.db     # 新增：频道克隆EAV数据库
```

### 2. 与现有botService.js集成
- **扩展消息监听器**：在现有的message监听基础上添加频道消息处理
- **保持指令系统**：现有的预约、绑定等指令功能不变
- **新增频道管理指令**：添加频道配置相关的管理员指令
- **频道ID动态获取**：从EAV数据库中动态获取需要监听的频道列表

### 3. 利用现有基础设施
- **数据库连接**：使用现有的database.js配置模式，但为频道功能创建独立的channelDatabase.js
- **HTTP服务**：扩展现有的httpService.js添加频道API（使用独立路由前缀/api/channel/*）
- **定时任务**：利用现有的node-cron进行消息队列处理
- **错误处理**：沿用现有的错误处理机制，但为频道功能添加独立的日志

### 4. Railway部署兼容
- **保持现有railway.toml配置**
- **使用现有Volume挂载**：/app/data目录
- **健康检查兼容**：扩展现有/health端点
- **环境变量管理**：在Railway控制台中添加频道相关环境变量

## 性能要求
- **并发处理**：支持多频道同时监控（通过EAV动态配置）
- **内存控制**：合理的内存使用，避免内存泄漏
- **响应时间**：API调用响应时间<2秒
- **可扩展性**：支持后续添加更多频道（EAV模式天然支持扩展）

## 错误处理
- **API限流**：实现退避重试机制
- **网络异常**：消息重试队列（基于EAV存储）
- **权限错误**：自动检测并提醒
- **EAV数据完整性**：确保实体、属性、值的一致性

## 请基于以上需求生成完整的代码文件

### 代码文件要求（EAV模式独立模块）
1. **config/channelDatabase.js** - 频道克隆EAV数据库配置
2. **models/channelEAVSchema.js** - EAV表结构定义和初始化
3. **models/channelEAVOperations.js** - EAV数据操作基础方法
4. **models/channelDataMapper.js** - EAV到业务对象的映射层
5. **services/channelConfigService.js** - 频道配置管理服务（支持动态配置，不硬编码）
6. **services/channelCloneService.js** - 频道克隆核心服务
7. **services/messageQueueService.js** - 消息队列处理服务（基于EAV）
8. **services/contentFilterService.js** - 内容过滤和修改服务
9. **扩展botService.js** - 添加频道监听功能的具体代码片段
10. **扩展httpService.js** - 频道管理API接口（独立路由组/api/channel/*）
11. **admin/channels.html** - 频道管理主界面（支持动态添加/删除频道配置）
12. **admin/channel-config.html** - 频道配置页面（不硬编码频道ID，支持表单配置）
13. **admin/channel-logs.html** - 克隆日志查看页面
14. **admin/scripts/channel-management.js** - 频道管理专用脚本

### 集成要求（EAV模式独立模块设计）
- **EAV数据完全分离**：使用独立的channel_clone.db数据库文件
- **功能模块化**：频道克隆功能作为独立模块，不影响现有业务逻辑
- **动态配置管理**：频道ID通过管理面板配置，支持多组频道克隆关系
- **共享基础设施**：复用Bot实例、HTTP服务器、配置系统等
- **API命名空间**：频道相关API使用独立的路由前缀（/api/channel/*）
- **管理界面独立**：频道管理页面独立，但保持现有admin风格
- **错误处理分离**：独立的错误处理和日志记录，不与业务日志混合
- **配置隔离**：频道相关配置使用独立的环境变量前缀

### EAV特定要求
- **属性预定义**：系统启动时自动创建所需的属性定义
- **数据映射层**：提供EAV数据到业务对象的转换方法
- **查询优化**：针对EAV模式优化查询性能
- **数据验证**：基于属性定义进行数据验证
- **关系管理**：合理使用关系表管理实体间的关联

### 功能完整性（EAV模式独立模块）
- 实时频道消息监听和克隆（动态获取频道列表）
- 消息编辑同步（EAV存储映射关系）
- 历史消息批量同步（EAV队列系统）
- 内容过滤和修改（EAV规则引擎）
- 定时发送和调度（EAV调度系统）
- 统计分析（EAV统计数据）
- 管理员权限控制（复用现有ADMIN_PASSWORD）
- Web界面管理（动态配置，不硬编码）
- API限流和错误恢复（EAV记录重试信息）

### 重点关注
1. **EAV模式正确实现**：确保实体、属性、值三表的正确使用
2. **模块化设计**：频道克隆功能完全独立，不与现有业务产生数据耦合
3. **动态配置**：所有频道ID通过配置管理，支持运行时修改
4. **性能优化**：EAV查询性能优化和索引设计
5. **数据完整性**：确保EAV数据的一致性和完整性