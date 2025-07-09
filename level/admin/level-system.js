/**
 * 等级系统管理前端 - 完全重构版本
 * 基于真实后端API数据构建
 */

console.log('🚀 等级系统管理界面脚本开始加载...');

class LevelSystemManager {
    constructor() {
        console.log('🏗️ 构造LevelSystemManager实例');
        this.currentRankingType = 'level';
        this.currentRankingLimit = 20;
        this.includeInactive = false;
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
        
        this.init();
    }

    /**
     * 初始化系统
     */
    async init() {
        console.log('🏆 初始化等级系统管理界面...');
        
        try {
            // 绑定事件监听器
            console.log('🔗 绑定事件监听器...');
            this.bindEventListeners();
            
            // 加载初始数据
            console.log('📊 加载初始数据...');
            await this.loadInitialData();
            
            console.log('✅ 等级系统管理界面初始化完成');
    } catch (error) {
            console.error('❌ 初始化失败:', error);
            this.showError('系统初始化失败: ' + error.message);
        }
    }

    /**
     * 绑定事件监听器
     */
    bindEventListeners() {
        // 排行榜筛选控件
        document.getElementById('rankingType').addEventListener('change', (e) => {
            this.currentRankingType = e.target.value;
            this.loadRankingData();
        });

        document.getElementById('rankingLimit').addEventListener('change', (e) => {
            this.currentRankingLimit = parseInt(e.target.value);
            this.loadRankingData();
        });

        document.getElementById('includeInactive').addEventListener('change', (e) => {
            this.includeInactive = e.target.checked;
            this.loadRankingData();
        });

        // 刷新按钮
        document.getElementById('refreshRanking').addEventListener('click', () => {
            this.clearCache();
            this.loadRankingData();
        });

        // 用户搜索
        document.getElementById('searchUsers').addEventListener('click', () => {
            this.searchUsers();
        });

        // 回车搜索
        document.getElementById('userSearch').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchUsers();
            }
        });

        // 选项卡切换
        document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (e) => {
                const target = e.target.getAttribute('data-bs-target');
                this.handleTabSwitch(target);
            });
        });
    }

    /**
     * 加载初始数据
     */
    async loadInitialData() {
        try {
            // 并行加载数据
            await Promise.all([
                this.loadSystemStats(),
                this.loadRankingData(),
                this.loadLevelConfig()
            ]);
    } catch (error) {
            console.error('加载初始数据失败:', error);
            this.showError('加载数据失败，请刷新页面重试');
        }
    }

    /**
     * 加载系统统计数据
     */
    async loadSystemStats() {
        try {
            const response = await this.apiRequest('/api/level/stats');
            if (response.success) {
                this.updateSystemStats(response.data);
        } else {
                console.error('获取系统统计失败:', response.error);
        }
    } catch (error) {
            console.error('加载系统统计失败:', error);
        }
    }

    /**
     * 更新系统统计显示
     */
    updateSystemStats(stats) {
        // 更新状态卡片
        document.getElementById('systemStatus').textContent = stats.enabled ? '✅ 正常' : '❌ 禁用';
        
        // 从排行榜数据计算统计
        this.calculateStatsFromRanking();
    }

    /**
     * 从排行榜数据计算统计信息
     */
    async calculateStatsFromRanking() {
        try {
            // 获取所有用户数据（包含非活跃用户）
            const allUsersResponse = await this.apiRequest('/api/level/rankings?includeInactive=true&limit=1000');
            const activeUsersResponse = await this.apiRequest('/api/level/rankings?includeInactive=false&limit=1000');
            
            if (allUsersResponse.success && activeUsersResponse.success) {
                const allUsers = allUsersResponse.data || [];
                const activeUsers = activeUsersResponse.data || [];
                
                // 计算平均等级
                const avgLevel = allUsers.length > 0 ? 
                    (allUsers.reduce((sum, user) => sum + user.level, 0) / allUsers.length).toFixed(1) : 0;
                
                // 更新显示
                document.getElementById('totalUsers').textContent = allUsers.length;
                document.getElementById('activeUsers').textContent = activeUsers.length;
                document.getElementById('avgLevel').textContent = `Lv.${avgLevel}`;
        }
    } catch (error) {
            console.error('计算统计信息失败:', error);
        }
    }

    /**
     * 加载排行榜数据
     */
    async loadRankingData() {
        const tableBody = document.getElementById('rankingTableBody');
        
        // 显示加载状态
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center">
                    <div class="loading">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">加载中...</span>
                        </div>
                        <div class="mt-2">正在加载排行榜数据...</div>
                </div>
            </td>
        </tr>
        `;

        try {
            const cacheKey = `ranking_${this.currentRankingType}_${this.currentRankingLimit}_${this.includeInactive}`;
            
            // 检查缓存
            const cachedData = this.getFromCache(cacheKey);
            if (cachedData) {
                this.renderRankingTable(cachedData);
        return;
    }
    
            // 构建API请求URL
            const params = new URLSearchParams({
                type: this.currentRankingType,
                limit: this.currentRankingLimit,
                includeInactive: this.includeInactive
            });

            const response = await this.apiRequest(`/api/level/rankings?${params}`);
            
            if (response.success) {
                const data = response.data || [];
                this.setCache(cacheKey, data);
                this.renderRankingTable(data);
                
                // 更新统计信息
                this.calculateStatsFromRanking();
        } else {
                throw new Error(response.error || '获取排行榜数据失败');
        }
    } catch (error) {
            console.error('加载排行榜失败:', error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center">
            <div class="empty-state">
                            <i class="fas fa-exclamation-triangle text-warning"></i>
                            <h5>加载失败</h5>
                            <p>${error.message}</p>
                            <button class="btn btn-primary" onclick="levelSystemManager.loadRankingData()">
                                <i class="fas fa-redo me-1"></i>重试
                            </button>
                </div>
                    </td>
                </tr>
            `;
        }
    }

    /**
     * 渲染排行榜表格
     */
    renderRankingTable(data) {
        const tableBody = document.getElementById('rankingTableBody');
        
        if (!data || data.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center">
                        <div class="empty-state">
                            <i class="fas fa-users"></i>
                            <h5>暂无数据</h5>
                            <p>当前筛选条件下没有找到用户数据</p>
                </div>
                    </td>
                </tr>
            `;
        return;
    }
    
        const rows = data.map((user, index) => {
        const rank = index + 1;
            const rankMedal = this.getRankMedal(rank);
            const levelBadge = this.getLevelBadge(user.level);
            const displayName = user.display_name || `用户${user.user_id}`;
            const username = user.username ? `@${user.username}` : '@未设置';
        
        return `
            <tr>
                    <td>
                        ${rankMedal}
                        <span class="fw-bold">${rank}</span>
                    </td>
                    <td>
                        <div>
                            <div class="fw-bold">${this.escapeHtml(displayName)}</div>
                            <small class="text-muted">${this.escapeHtml(username)}</small>
                            <br>
                            <small class="text-muted">ID: ${user.user_id}</small>
                        </div>
                    </td>
                    <td>${levelBadge}</td>
                    <td>
                        <div class="d-flex align-items-center">
                            <span class="me-2">${user.total_exp || 0}</span>
                            <div class="progress flex-grow-1" style="height: 6px;">
                                <div class="progress-bar" style="width: ${this.calculateExpProgress(user)}%"></div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="badge bg-success">${user.available_points || 0}</span>
                    </td>
                    <td>
                        <span class="badge bg-info">${user.total_points_earned || 0}</span>
                    </td>
                    <td>
                        <span class="badge bg-warning">${user.user_eval_count || 0}</span>
                    </td>
                    <td>
                        <div class="btn-group" role="group">
                            <button class="btn btn-sm btn-outline-primary" onclick="levelSystemManager.viewUserDetail('${user.user_id}')" title="查看详情">
                                <i class="fas fa-eye"></i>
                        </button>
                            <button class="btn btn-sm btn-outline-success" onclick="levelSystemManager.adjustUserPoints('${user.user_id}')" title="调整积分">
                                <i class="fas fa-coins"></i>
                        </button>
                            <button class="btn btn-sm btn-outline-info" onclick="levelSystemManager.viewUserHistory('${user.user_id}')" title="查看历史">
                                <i class="fas fa-history"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

        tableBody.innerHTML = rows;
    }

    /**
     * 获取排名奖牌
     */
    getRankMedal(rank) {
        if (rank === 1) return '<span class="rank-medal rank-1">1</span>';
        if (rank === 2) return '<span class="rank-medal rank-2">2</span>';
        if (rank === 3) return '<span class="rank-medal rank-3">3</span>';
        return '<span class="rank-medal rank-other">' + rank + '</span>';
    }

    /**
     * 获取等级徽章
     */
    getLevelBadge(level) {
        return `<span class="level-badge level-${level}">Lv.${level}</span>`;
    }

    /**
     * 计算经验进度
     */
    calculateExpProgress(user) {
        // 简单的进度计算，可以根据等级配置优化
        const currentLevel = user.level || 1;
        const exp = user.total_exp || 0;
        const baseExp = (currentLevel - 1) * 100;
        const nextLevelExp = currentLevel * 100;
        
        if (exp >= nextLevelExp) return 100;
        
        const progress = ((exp - baseExp) / (nextLevelExp - baseExp)) * 100;
        return Math.max(0, Math.min(100, progress));
    }

    /**
     * 查看用户详情
     */
    async viewUserDetail(userId) {
        const modal = new bootstrap.Modal(document.getElementById('userDetailModal'));
        const content = document.getElementById('userDetailContent');
        
        // 显示加载状态
        content.innerHTML = `
            <div class="loading">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">加载中...</span>
                </div>
                <div class="mt-2">正在加载用户详情...</div>
            </div>
        `;
        
        modal.show();
        
        try {
            const response = await this.apiRequest(`/api/level/user/${userId}`);
            
            if (response.success) {
                this.renderUserDetail(response.data);
        } else {
                throw new Error(response.error || '获取用户详情失败');
        }
    } catch (error) {
            console.error('获取用户详情失败:', error);
            content.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    ${error.message}
                            </div>
            `;
        }
    }

    /**
     * 渲染用户详情
     */
    renderUserDetail(userData) {
        const content = document.getElementById('userDetailContent');
        const user = userData.profile || userData;
        
        content.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h6 class="card-title">基本信息</h6>
                        </div>
                        <div class="card-body">
                            <dl class="row">
                                <dt class="col-sm-4">用户ID</dt>
                                <dd class="col-sm-8">${user.user_id}</dd>
                                
                                <dt class="col-sm-4">显示名称</dt>
                                <dd class="col-sm-8">${user.display_name || '未设置'}</dd>
                                
                                <dt class="col-sm-4">用户名</dt>
                                <dd class="col-sm-8">${user.username ? '@' + user.username : '未设置'}</dd>
                                
                                <dt class="col-sm-4">当前等级</dt>
                                <dd class="col-sm-8">${this.getLevelBadge(user.level)}</dd>
                                
                                <dt class="col-sm-4">总经验值</dt>
                                <dd class="col-sm-8">${user.total_exp || 0}</dd>
                                
                                <dt class="col-sm-4">可用积分</dt>
                                <dd class="col-sm-8">
                                    <span class="badge bg-success">${user.available_points || 0}</span>
                                </dd>
                                
                                <dt class="col-sm-4">总获得积分</dt>
                                <dd class="col-sm-8">
                                    <span class="badge bg-info">${user.total_points_earned || 0}</span>
                                </dd>
                                
                                <dt class="col-sm-4">评价次数</dt>
                                <dd class="col-sm-8">
                                    <span class="badge bg-warning">${user.user_eval_count || 0}</span>
                                </dd>
                            </dl>
                </div>
                </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h6 class="card-title">等级进度</h6>
                </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <div class="d-flex justify-content-between mb-1">
                                    <span>当前等级</span>
                                    <span>Lv.${user.level}</span>
                </div>
                                <div class="progress mb-2">
                                    <div class="progress-bar" style="width: ${this.calculateExpProgress(user)}%"></div>
            </div>
                                <small class="text-muted">经验值: ${user.total_exp || 0}</small>
            </div>
                            
                            <div class="row text-center">
                                <div class="col-4">
                                    <div class="border rounded p-2">
                                        <div class="h5 mb-0 text-primary">${user.level || 1}</div>
                                        <small class="text-muted">当前等级</small>
            </div>
                        </div>
                                <div class="col-4">
                                    <div class="border rounded p-2">
                                        <div class="h5 mb-0 text-success">${user.available_points || 0}</div>
                                        <small class="text-muted">可用积分</small>
                        </div>
                        </div>
                                <div class="col-4">
                                    <div class="border rounded p-2">
                                        <div class="h5 mb-0 text-warning">${user.user_eval_count || 0}</div>
                                        <small class="text-muted">评价次数</small>
                        </div>
                        </div>
                        </div>
                        </div>
                    </div>
                    
                    <div class="mt-3">
                        <button class="btn btn-primary me-2" onclick="levelSystemManager.adjustUserPoints('${user.user_id}')">
                            <i class="fas fa-coins me-1"></i>
                            调整积分
                        </button>
                        <button class="btn btn-info me-2" onclick="levelSystemManager.viewUserHistory('${user.user_id}')">
                            <i class="fas fa-history me-1"></i>
                            查看历史
                        </button>
                            </div>
                            </div>
                </div>
            `;
    }

    /**
     * 搜索用户
     */
    async searchUsers() {
        const searchTerm = document.getElementById('userSearch').value.trim();
        const levelFilter = document.getElementById('levelFilter').value;
        const activityFilter = document.getElementById('activityFilter').value;
        const content = document.getElementById('userManagementContent');
        
        if (!searchTerm && !levelFilter && !activityFilter) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h5>请输入搜索条件</h5>
                    <p>请输入用户ID、用户名或选择筛选条件</p>
                </div>
            `;
            return;
        }
        
        // 显示加载状态
        content.innerHTML = `
            <div class="loading">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">加载中...</span>
                </div>
                <div class="mt-2">正在搜索用户...</div>
            </div>
        `;
        
        try {
            // 获取所有用户数据进行客户端筛选
            const response = await this.apiRequest('/api/level/rankings?includeInactive=true&limit=1000');
            
            if (response.success) {
                let users = response.data || [];
                
                // 应用筛选条件
                if (searchTerm) {
                    const searchLower = searchTerm.toLowerCase();
                    users = users.filter(user => 
                        user.user_id.toString().includes(searchTerm) ||
                        (user.display_name && user.display_name.toLowerCase().includes(searchLower)) ||
                        (user.username && user.username.toLowerCase().includes(searchLower))
                    );
                }
                
                if (levelFilter) {
                    users = users.filter(user => user.level === parseInt(levelFilter));
                }
                
                if (activityFilter === 'active') {
                    users = users.filter(user => user.user_eval_count > 0);
                } else if (activityFilter === 'inactive') {
                    users = users.filter(user => user.user_eval_count === 0);
                }
                
                this.renderUserManagement(users);
        } else {
                throw new Error(response.error || '搜索失败');
        }
    } catch (error) {
            console.error('搜索用户失败:', error);
            content.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    搜索失败: ${error.message}
                </div>
            `;
        }
    }

    /**
     * 渲染用户管理界面
     */
    renderUserManagement(users) {
        const content = document.getElementById('userManagementContent');
        
        if (!users || users.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h5>未找到用户</h5>
                    <p>没有找到符合条件的用户</p>
            </div>
        `;
        return;
    }
    
        const userCards = users.map(user => {
            const displayName = user.display_name || `用户${user.user_id}`;
            const username = user.username ? `@${user.username}` : '@未设置';
        
        return `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                                    <h6 class="card-title mb-1">${this.escapeHtml(displayName)}</h6>
                                    <small class="text-muted">${this.escapeHtml(username)}</small>
                            </div>
                                ${this.getLevelBadge(user.level)}
                            </div>
                            
                            <div class="row text-center mb-3">
                                <div class="col-4">
                                    <div class="text-primary">
                                        <strong>${user.total_exp || 0}</strong>
                                        <br>
                                        <small>经验值</small>
                </div>
            </div>
                                <div class="col-4">
                                    <div class="text-success">
                                        <strong>${user.available_points || 0}</strong>
                                        <br>
                                        <small>积分</small>
            </div>
        </div>
                                <div class="col-4">
                                    <div class="text-warning">
                                        <strong>${user.user_eval_count || 0}</strong>
                                        <br>
                                        <small>评价</small>
                    </div>
            </div>
        </div>
        
                            <div class="d-flex gap-1">
                                <button class="btn btn-sm btn-outline-primary flex-fill" onclick="levelSystemManager.viewUserDetail('${user.user_id}')">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-success flex-fill" onclick="levelSystemManager.adjustUserPoints('${user.user_id}')">
                                    <i class="fas fa-coins"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-info flex-fill" onclick="levelSystemManager.viewUserHistory('${user.user_id}')">
                                    <i class="fas fa-history"></i>
                                </button>
                        </div>
                        </div>
                    </div>
            </div>
            `;
        }).join('');
        
        content.innerHTML = `
            <div class="row">
                ${userCards}
        </div>
    `;
    }

    /**
     * 加载等级配置
     */
    async loadLevelConfig() {
        try {
            const response = await this.apiRequest('/api/level/config');
            
            if (response.success) {
                this.renderLevelConfig(response.data);
        } else {
                console.error('获取等级配置失败:', response.error);
        }
    } catch (error) {
            console.error('加载等级配置失败:', error);
        }
    }

    /**
     * 渲染等级配置
     */
    renderLevelConfig(config) {
        const content = document.getElementById('levelConfigContent');
        
        if (!config) {
            content.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    等级配置不可用
        </div>
    `;
            return;
        }
        
        content.innerHTML = `
            <div class="mb-3">
                <h6>基础配置</h6>
                <dl class="row">
                    <dt class="col-sm-4">系统版本</dt>
                    <dd class="col-sm-8">${config.version || '未知'}</dd>
                    
                    <dt class="col-sm-4">最大等级</dt>
                    <dd class="col-sm-8">${config.maxLevel || 10}</dd>
                    
                    <dt class="col-sm-4">升级方式</dt>
                    <dd class="col-sm-8">${config.upgradeMode || '经验值'}</dd>
                </dl>
            </div>
            
            <div class="mb-3">
                <h6>等级列表</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>等级</th>
                                <th>所需经验</th>
                                <th>奖励积分</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.renderLevelTable(config.levels)}
                        </tbody>
                    </table>
                </div>
                </div>
            `;
    }

    /**
     * 渲染等级表格
     */
    renderLevelTable(levels) {
        if (!levels || !Array.isArray(levels)) {
            return '<tr><td colspan="3" class="text-center">暂无等级配置</td></tr>';
        }
        
        return levels.map(level => `
            <tr>
                <td>${this.getLevelBadge(level.level)}</td>
                <td>${level.requiredExp || 0}</td>
                <td><span class="badge bg-success">${level.reward || 0}</span></td>
            </tr>
        `).join('');
    }

    /**
     * 处理选项卡切换
     */
    handleTabSwitch(target) {
        switch (target) {
            case '#ranking':
                // 排行榜标签页，可能需要刷新数据
                break;
            case '#management':
                // 用户管理标签页
                break;
            case '#config':
                // 配置标签页，加载系统统计
                this.loadSystemStats();
                break;
        }
    }

    /**
     * 调整用户积分（占位符）
     */
    adjustUserPoints(userId) {
        this.showInfo(`调整用户 ${userId} 的积分功能开发中...`);
    }

    /**
     * 查看用户历史（占位符）
     */
    viewUserHistory(userId) {
        this.showInfo(`查看用户 ${userId} 的历史记录功能开发中...`);
    }

    /**
     * API请求封装
     */
    async apiRequest(url, options = {}) {
        console.log('🌐 发送API请求:', url);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    ...options.headers
                },
                ...options
            });
            
            console.log('📡 API响应状态:', response.status, response.statusText);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('📦 API响应数据:', data);
            
            return data;
    } catch (error) {
            console.error('❌ API请求失败:', error);
            throw error;
        }
    }

    /**
     * 缓存管理
     */
    setCache(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    clearCache() {
        this.cache.clear();
    }

    /**
     * 工具函数
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'danger');
    }

    showInfo(message) {
        this.showToast(message, 'info');
    }

    showToast(message, type = 'info') {
        // 创建toast容器（如果不存在）
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            toastContainer.style.zIndex = '9999';
            document.body.appendChild(toastContainer);
        }

        // 创建toast
        const toastId = 'toast_' + Date.now();
        const toastHtml = `
            <div id="${toastId}" class="toast" role="alert">
                <div class="toast-header">
                    <i class="fas fa-info-circle text-${type} me-2"></i>
                    <strong class="me-auto">系统消息</strong>
                    <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body">
                    ${message}
                </div>
            </div>
        `;

        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, {
            autohide: true,
            delay: 5000
        });
        
        toast.show();
        
        // 自动清理
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }
}

// 初始化系统
let levelSystemManager;
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM加载完成，开始初始化系统...');
    try {
        levelSystemManager = new LevelSystemManager();
        console.log('✅ 系统初始化完成');
    } catch (error) {
        console.error('❌ 系统初始化失败:', error);
        alert('系统初始化失败: ' + error.message);
    }
});

console.log('📝 等级系统管理脚本加载完成'); 