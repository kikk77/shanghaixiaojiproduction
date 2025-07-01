const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class ChannelDatabaseManager {
    constructor() {
        // 频道克隆数据库路径配置 - 支持Railway Volume
        const nodeEnv = process.env.NODE_ENV || process.env.RAILWAY_ENVIRONMENT_NAME || 'development';
        const isProduction = nodeEnv === 'production';
        const isStaging = nodeEnv === 'staging';
        
        // 根据环境选择数据目录和数据库文件名
        let dataDir;
        if (isProduction || isStaging) {
            // Railway Volume路径检查
            const volumeDataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/app/data';
            const localDataDir = path.join(__dirname, '..', 'data');
            
            // 优先尝试使用Volume
            try {
                if (fs.existsSync(volumeDataDir)) {
                    fs.accessSync(volumeDataDir, fs.constants.W_OK);
                    dataDir = volumeDataDir; // Volume可用
                    console.log(`📁 频道克隆数据库使用Volume目录: ${dataDir}`);
                } else {
                    throw new Error('Volume目录不存在');
                }
            } catch (error) {
                console.log(`⚠️ Volume权限问题，频道克隆数据库使用本地目录: ${error.message}`);
                dataDir = localDataDir;
                console.log(`📁 频道克隆数据库使用本地目录: ${dataDir}`);
            }
        } else {
            dataDir = path.join(__dirname, '..', 'data');
        }
        
        // 频道克隆数据库独立文件
        const dbFileName = 'channel_clone.db';
        this.dbPath = path.join(dataDir, dbFileName);
        
        console.log(`📺 频道克隆数据库环境: ${nodeEnv}`);
        console.log(`📂 频道克隆数据库路径: ${this.dbPath}`);
        
        this.ensureDataDirectory();
        
        // 尝试创建数据库连接
        try {
            console.log(`🔗 尝试连接频道克隆数据库: ${this.dbPath}`);
            this.db = new Database(this.dbPath);
            console.log(`✅ 频道克隆数据库连接成功`);
            this.db.pragma('journal_mode = WAL');
            this.initializeChannelDatabase();
        } catch (error) {
            console.error(`❌ 频道克隆数据库连接失败: ${error.message}`);
            console.error(`❌ 错误代码: ${error.code}`);
            console.error(`❌ 数据库路径: ${this.dbPath}`);
            throw error;
        }
    }

    ensureDataDirectory() {
        const dataDir = path.dirname(this.dbPath);
        console.log(`🔍 检查频道克隆数据目录: ${dataDir}`);
        
        if (!fs.existsSync(dataDir)) {
            console.log(`📁 创建频道克隆数据目录: ${dataDir}`);
            try {
                fs.mkdirSync(dataDir, { recursive: true });
                console.log(`✅ 频道克隆数据目录创建成功: ${dataDir}`);
            } catch (error) {
                console.error(`❌ 频道克隆数据目录创建失败: ${error.message}`);
                throw error;
            }
        } else {
            console.log(`✅ 频道克隆数据目录已存在: ${dataDir}`);
        }
        
        // 检查目录权限
        try {
            fs.accessSync(dataDir, fs.constants.W_OK);
            console.log(`✅ 频道克隆数据目录具有写权限: ${dataDir}`);
        } catch (error) {
            console.error(`❌ 频道克隆数据目录没有写权限: ${error.message}`);
            throw error;
        }
    }

    initializeChannelDatabase() {
        console.log('📺 初始化频道克隆数据库...');
        
        // 创建EAV基础表结构
        this.createEAVTables();
        
        // 初始化预定义属性
        this.initializePredefinedAttributes();
        
        // 设置数据库版本
        this.setChannelDbVersion('1.0.0');
        
        console.log('✅ 频道克隆数据库初始化完成');
    }

    createEAVTables() {
        console.log('📺 创建EAV表结构...');
        
        // 实体表 - 存储所有频道克隆相关的实体
        this.db.exec(`
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
        `);

        // 属性表 - 定义所有可能的属性
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS channel_attributes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attribute_name TEXT NOT NULL UNIQUE, -- 属性名称
                attribute_type TEXT NOT NULL, -- 'string', 'integer', 'boolean', 'json', 'datetime', 'text'
                attribute_category TEXT, -- 属性分类
                description TEXT, -- 属性描述
                is_required INTEGER DEFAULT 0, -- SQLite不支持BOOLEAN，使用INTEGER (0/1)
                default_value TEXT,
                validation_rule TEXT, -- JSON格式验证规则
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 值表 - 存储实体的属性值
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS channel_values (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id INTEGER NOT NULL,
                attribute_id INTEGER NOT NULL,
                value_string TEXT,
                value_integer INTEGER,
                value_boolean INTEGER, -- SQLite不支持BOOLEAN，使用INTEGER (0/1)
                value_json TEXT,
                value_datetime DATETIME,
                value_text TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (entity_id) REFERENCES channel_entities(id),
                FOREIGN KEY (attribute_id) REFERENCES channel_attributes(id),
                UNIQUE(entity_id, attribute_id)
            );
        `);

        // 关系表 - 存储实体间的关系
        this.db.exec(`
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
        `);

        // 创建索引优化查询性能
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_channel_entities_type ON channel_entities(entity_type);
            CREATE INDEX IF NOT EXISTS idx_channel_entities_status ON channel_entities(status);
            CREATE INDEX IF NOT EXISTS idx_channel_entities_parent ON channel_entities(parent_id);
            CREATE INDEX IF NOT EXISTS idx_channel_values_entity ON channel_values(entity_id);
            CREATE INDEX IF NOT EXISTS idx_channel_values_attribute ON channel_values(attribute_id);
            CREATE INDEX IF NOT EXISTS idx_channel_relations_parent ON channel_relations(parent_entity_id);
            CREATE INDEX IF NOT EXISTS idx_channel_relations_child ON channel_relations(child_entity_id);
            CREATE INDEX IF NOT EXISTS idx_channel_relations_type ON channel_relations(relation_type);
        `);

        console.log('✅ EAV表结构创建完成');
    }

    initializePredefinedAttributes() {
        console.log('📺 初始化预定义属性...');
        
        const predefinedAttributes = [
            // channel_config 类型属性
            { name: 'source_channel_id', type: 'string', category: 'channel_config', description: '源频道ID', required: true },
            { name: 'target_channel_id', type: 'string', category: 'channel_config', description: '目标频道ID', required: true },
            { name: 'config_name', type: 'string', category: 'channel_config', description: '配置名称', required: true },
            { name: 'clone_enabled', type: 'boolean', category: 'channel_config', description: '是否启用克隆', default: 'true' },
            { name: 'clone_rules', type: 'json', category: 'channel_config', description: '克隆规则配置' },
            { name: 'sync_edits', type: 'boolean', category: 'channel_config', description: '是否同步编辑', default: 'true' },
            { name: 'filter_enabled', type: 'boolean', category: 'channel_config', description: '是否启用过滤', default: 'false' },
            { name: 'rate_limit', type: 'integer', category: 'channel_config', description: '速率限制（条/分钟）', default: '30' },
            { name: 'delay_seconds', type: 'integer', category: 'channel_config', description: '转发延时（秒）', default: '0' },
            { name: 'sequential_mode', type: 'boolean', category: 'channel_config', description: '是否启用顺序转发模式', default: 'false' },
            
            // message_mapping 类型属性
            { name: 'source_message_id', type: 'integer', category: 'message_mapping', description: '源消息ID', required: true },
            { name: 'target_message_id', type: 'integer', category: 'message_mapping', description: '目标消息ID', required: true },
            { name: 'message_type', type: 'string', category: 'message_mapping', description: '消息类型' },
            { name: 'clone_status', type: 'string', category: 'message_mapping', description: '克隆状态', default: 'success' },
            { name: 'clone_time', type: 'datetime', category: 'message_mapping', description: '克隆时间' },
            { name: 'message_content_hash', type: 'string', category: 'message_mapping', description: '消息内容哈希' },
            
            // clone_queue 类型属性
            { name: 'priority', type: 'integer', category: 'clone_queue', description: '优先级', default: '1' },
            { name: 'scheduled_time', type: 'datetime', category: 'clone_queue', description: '计划执行时间' },
            { name: 'retry_count', type: 'integer', category: 'clone_queue', description: '重试次数', default: '0' },
            { name: 'queue_type', type: 'string', category: 'clone_queue', description: '队列类型', default: 'normal' },
            { name: 'queue_data', type: 'json', category: 'clone_queue', description: '队列数据' },
            { name: 'max_retries', type: 'integer', category: 'clone_queue', description: '最大重试次数', default: '3' },
            
            // filter_rule 类型属性
            { name: 'filter_type', type: 'string', category: 'filter_rule', description: '过滤类型' },
            { name: 'filter_rule', type: 'json', category: 'filter_rule', description: '过滤规则' },
            { name: 'filter_action', type: 'string', category: 'filter_rule', description: '过滤动作', default: 'allow' },
            { name: 'modification_template', type: 'text', category: 'filter_rule', description: '内容修改模板' },
            { name: 'rule_enabled', type: 'boolean', category: 'filter_rule', description: '规则是否启用', default: 'true' },
            
            // clone_log 类型属性
            { name: 'action', type: 'string', category: 'clone_log', description: '操作类型', required: true },
            { name: 'log_status', type: 'string', category: 'clone_log', description: '日志状态', default: 'success' },
            { name: 'error_message', type: 'text', category: 'clone_log', description: '错误信息' },
            { name: 'processing_time', type: 'integer', category: 'clone_log', description: '处理时间（毫秒）' },
            { name: 'log_data', type: 'json', category: 'clone_log', description: '日志数据' },
            
            // statistics 类型属性
            { name: 'stat_type', type: 'string', category: 'statistics', description: '统计类型', required: true },
            { name: 'stat_value', type: 'integer', category: 'statistics', description: '统计值', default: '0' },
            { name: 'stat_period', type: 'string', category: 'statistics', description: '统计周期', default: 'daily' },
            { name: 'stat_data', type: 'json', category: 'statistics', description: '统计数据' }
        ];

        const insertAttribute = this.db.prepare(`
            INSERT OR IGNORE INTO channel_attributes 
            (attribute_name, attribute_type, attribute_category, description, is_required, default_value) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        let insertedCount = 0;
        for (const attr of predefinedAttributes) {
            const result = insertAttribute.run(
                attr.name,
                attr.type,
                attr.category,
                attr.description,
                attr.required ? 1 : 0,
                attr.default || null
            );
            if (result.changes > 0) {
                insertedCount++;
            }
        }

        console.log(`✅ 预定义属性初始化完成，新增 ${insertedCount} 个属性`);
    }

    setChannelDbVersion(version) {
        // 创建元信息表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS channel_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);
        
        this.db.prepare('INSERT OR REPLACE INTO channel_meta (key, value) VALUES (?, ?)').run('db_version', version);
        console.log(`📺 频道克隆数据库版本设置为: ${version}`);
    }

    getChannelDbVersion() {
        try {
            const result = this.db.prepare('SELECT value FROM channel_meta WHERE key = ?').get('db_version');
            return result ? result.value : null;
        } catch (error) {
            return null;
        }
    }

    getDatabase() {
        return this.db;
    }

    close() {
        if (this.db) {
            this.db.close();
            console.log('📺 频道克隆数据库连接已关闭');
        }
    }
}

// 创建单例实例
let channelDbManager = null;

function getChannelDatabase() {
    if (!channelDbManager) {
        channelDbManager = new ChannelDatabaseManager();
    }
    return channelDbManager.getDatabase();
}

function closeChannelDatabase() {
    if (channelDbManager) {
        channelDbManager.close();
        channelDbManager = null;
    }
}

module.exports = {
    ChannelDatabaseManager,
    getChannelDatabase,
    closeChannelDatabase
}; 