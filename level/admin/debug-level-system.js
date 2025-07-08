/**
 * 等级系统管理前端 - 调试版本
 * 添加详细的日志输出来诊断问题
 */

console.log('🚀 开始加载等级系统管理界面...');

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
        console.log('🏆 开始初始化等级系统管理界面...');
        
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
        console.log('🔗 开始绑定事件监听器...');
        
        // 检查必要的DOM元素
        const requiredElements = [
            'rankingType', 'rankingLimit', 'includeInactive', 
            'refreshRanking', 'searchUsers', 'userSearch'
        ];
        
        for (const elementId of requiredElements) {
            const element = document.getElementById(elementId);
            if (!element) {
                console.warn(`⚠️ 找不到DOM元素: ${elementId}`);
                continue;
            }
            console.log(`✅ 找到DOM元素: ${elementId}`);
        }

        // 排行榜筛选控件
        const rankingType = document.getElementById('rankingType');
        if (rankingType) {
            rankingType.addEventListener('change', (e) => {
                console.log('🔄 排行榜类型变更:', e.target.value);
                this.currentRankingType = e.target.value;
                this.loadRankingData();
            });
        }

        const rankingLimit = document.getElementById('rankingLimit');
        if (rankingLimit) {
            rankingLimit.addEventListener('change', (e) => {
                console.log('🔄 排行榜限制变更:', e.target.value);
                this.currentRankingLimit = parseInt(e.target.value);
                this.loadRankingData();
            });
        }

        const includeInactive = document.getElementById('includeInactive');
        if (includeInactive) {
            includeInactive.addEventListener('change', (e) => {
                console.log('🔄 包含非活跃用户变更:', e.target.checked);
                this.includeInactive = e.target.checked;
                this.loadRankingData();
            });
        }

        // 刷新按钮
        const refreshRanking = document.getElementById('refreshRanking');
        if (refreshRanking) {
            refreshRanking.addEventListener('click', () => {
                console.log('🔄 手动刷新排行榜');
                this.clearCache();
                this.loadRankingData();
            });
        }

        // 用户搜索
        const searchUsers = document.getElementById('searchUsers');
        if (searchUsers) {
            searchUsers.addEventListener('click', () => {
                console.log('🔍 用户搜索');
                this.searchUsers();
            });
        }

        // 回车搜索
        const userSearch = document.getElementById('userSearch');
        if (userSearch) {
            userSearch.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    console.log('🔍 回车搜索');
                    this.searchUsers();
                }
            });
        }

        // 选项卡切换
        document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (e) => {
                const target = e.target.getAttribute('data-bs-target');
                console.log('🔄 选项卡切换:', target);
                this.handleTabSwitch(target);
            });
        });
        
        console.log('✅ 事件监听器绑定完成');
    }

    /**
     * 加载初始数据
     */
    async loadInitialData() {
        console.log('📊 开始加载初始数据...');
        
        try {
            // 并行加载数据
            const promises = [
                this.loadSystemStats(),
                this.loadRankingData(),
                this.loadLevelConfig()
            ];
            
            console.log('⏳ 并行执行API请求...');
            await Promise.all(promises);
            
            console.log('✅ 初始数据加载完成');
        } catch (error) {
            console.error('❌ 加载初始数据失败:', error);
            this.showError('加载数据失败，请刷新页面重试: ' + error.message);
        }
    }

    /**
     * 加载系统统计数据
     */
    async loadSystemStats() {
        console.log('📈 开始加载系统统计数据...');
        
        try {
            const response = await this.apiRequest('/api/level/stats');
            console.log('📈 系统统计API响应:', response);
            
            if (response.success) {
                this.updateSystemStats(response.data);
                console.log('✅ 系统统计数据加载完成');
            } else {
                console.error('❌ 获取系统统计失败:', response.error);
                this.showError('获取系统统计失败: ' + response.error);
            }
        } catch (error) {
            console.error('❌ 加载系统统计失败:', error);
            this.showError('加载系统统计失败: ' + error.message);
        }
    }

    /**
     * 更新系统统计显示
     */
    updateSystemStats(stats) {
        console.log('📊 更新系统统计显示:', stats);
        
        // 更新状态卡片
        const systemStatus = document.getElementById('systemStatus');
        if (systemStatus) {
            systemStatus.textContent = stats.enabled ? '✅ 正常' : '❌ 禁用';
            console.log('✅ 系统状态更新完成');
        } else {
            console.warn('⚠️ 找不到systemStatus元素');
        }
        
        // 从排行榜数据计算统计
        this.calculateStatsFromRanking();
    }

    /**
     * 从排行榜数据计算统计信息
     */
    async calculateStatsFromRanking() {
        console.log('🧮 开始计算统计信息...');
        
        try {
            // 获取所有用户数据（包含非活跃用户）
            const allUsersResponse = await this.apiRequest('/api/level/rankings?includeInactive=true&limit=1000');
            const activeUsersResponse = await this.apiRequest('/api/level/rankings?includeInactive=false&limit=1000');
            
            console.log('👥 所有用户数据:', allUsersResponse);
            console.log('🟢 活跃用户数据:', activeUsersResponse);
            
            if (allUsersResponse.success && activeUsersResponse.success) {
                const allUsers = allUsersResponse.data || [];
                const activeUsers = activeUsersResponse.data || [];
                
                // 计算平均等级
                const avgLevel = allUsers.length > 0 ? 
                    (allUsers.reduce((sum, user) => sum + user.level, 0) / allUsers.length).toFixed(1) : 0;
                
                console.log('📊 统计结果:', {
                    totalUsers: allUsers.length,
                    activeUsers: activeUsers.length,
                    avgLevel: avgLevel
                });
                
                // 更新显示
                const totalUsers = document.getElementById('totalUsers');
                const activeUsersEl = document.getElementById('activeUsers');
                const avgLevelEl = document.getElementById('avgLevel');
                
                if (totalUsers) {
                    totalUsers.textContent = allUsers.length;
                    console.log('✅ 总用户数更新完成');
                }
                
                if (activeUsersEl) {
                    activeUsersEl.textContent = activeUsers.length;
                    console.log('✅ 活跃用户数更新完成');
                }
                
                if (avgLevelEl) {
                    avgLevelEl.textContent = `Lv.${avgLevel}`;
                    console.log('✅ 平均等级更新完成');
                }
            }
        } catch (error) {
            console.error('❌ 计算统计信息失败:', error);
        }
    }

    /**
     * 加载排行榜数据
     */
    async loadRankingData() {
        console.log('🏆 开始加载排行榜数据...');
        
        const tableBody = document.getElementById('rankingTableBody');
        if (!tableBody) {
            console.error('❌ 找不到rankingTableBody元素');
            return;
        }
        
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
        
        console.log('⏳ 显示加载状态完成');

        try {
            const cacheKey = `ranking_${this.currentRankingType}_${this.currentRankingLimit}_${this.includeInactive}`;
            console.log('🔑 缓存键:', cacheKey);
            
            // 检查缓存
            const cachedData = this.getFromCache(cacheKey);
            if (cachedData) {
                console.log('💾 使用缓存数据');
                this.renderRankingTable(cachedData);
                return;
            }

            // 构建API请求URL
            const params = new URLSearchParams({
                type: this.currentRankingType,
                limit: this.currentRankingLimit,
                includeInactive: this.includeInactive
            });
            
            const url = `/api/level/rankings?${params}`;
            console.log('🌐 API请求URL:', url);

            const response = await this.apiRequest(url);
            console.log('🏆 排行榜API响应:', response);
            
            if (response.success) {
                const data = response.data || [];
                console.log('📊 排行榜数据:', data);
                
                this.setCache(cacheKey, data);
                this.renderRankingTable(data);
                
                // 更新统计信息
                this.calculateStatsFromRanking();
                
                console.log('✅ 排行榜数据加载完成');
            } else {
                throw new Error(response.error || '获取排行榜数据失败');
            }
        } catch (error) {
            console.error('❌ 加载排行榜失败:', error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-danger">
                        <i class="fas fa-exclamation-triangle"></i>
                        加载排行榜数据失败: ${error.message}
                        <br>
                        <button class="btn btn-sm btn-primary mt-2" onclick="levelSystemManager.loadRankingData()">
                            重试
                        </button>
                    </td>
                </tr>
            `;
        }
    }

    /**
     * 渲染排行榜表格
     */
    renderRankingTable(data) {
        console.log('🎨 开始渲染排行榜表格, 数据量:', data.length);
        
        const tableBody = document.getElementById('rankingTableBody');
        if (!tableBody) {
            console.error('❌ 找不到rankingTableBody元素');
            return;
        }

        if (!data || data.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-muted">
                        <i class="fas fa-inbox"></i>
                        暂无排行榜数据
                    </td>
                </tr>
            `;
            console.log('📭 显示暂无数据');
            return;
        }

        const rows = data.map((user, index) => {
            const rank = index + 1;
            const displayName = user.username || user.display_name || `用户${user.user_id}`;
            const levelBadge = this.getLevelBadge(user.level);
            const expProgress = this.calculateExpProgress(user);
            
            return `
                <tr>
                    <td>
                        <span class="rank-medal">${this.getRankMedal(rank)}</span>
                        ${rank}
                    </td>
                    <td>
                        <div class="user-info">
                            <strong>${this.escapeHtml(displayName)}</strong>
                            <small class="text-muted d-block">ID: ${user.user_id}</small>
                        </div>
                    </td>
                    <td>${levelBadge}</td>
                    <td>
                        <div class="exp-progress">
                            <div class="progress mb-1" style="height: 6px;">
                                <div class="progress-bar" role="progressbar" 
                                     style="width: ${expProgress.percentage}%"
                                     aria-valuenow="${expProgress.percentage}" 
                                     aria-valuemin="0" aria-valuemax="100">
                                </div>
                            </div>
                            <small class="text-muted">${user.total_exp} / ${expProgress.nextLevelExp}</small>
                        </div>
                    </td>
                    <td>
                        <span class="badge bg-success">${user.available_points}</span>
                    </td>
                    <td>
                        <span class="badge bg-info">${user.total_points_earned}</span>
                    </td>
                    <td>
                        <span class="badge bg-primary">${user.user_eval_count || 0}</span>
                    </td>
                    <td>
                        <div class="btn-group" role="group">
                            <button class="btn btn-sm btn-outline-primary" 
                                    onclick="levelSystemManager.viewUserDetail(${user.user_id})"
                                    title="查看详情">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-success" 
                                    onclick="levelSystemManager.adjustUserPoints(${user.user_id})"
                                    title="调整积分">
                                <i class="fas fa-coins"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-info" 
                                    onclick="levelSystemManager.viewUserHistory(${user.user_id})"
                                    title="查看历史">
                                <i class="fas fa-history"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tableBody.innerHTML = rows;
        console.log('✅ 排行榜表格渲染完成');
    }

    /**
     * 获取排名奖牌
     */
    getRankMedal(rank) {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return '🏅';
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
        // 简化的等级经验计算
        const baseExp = [0, 0, 50, 150, 300, 500, 750, 1050, 1400, 1800, 2250];
        const currentLevel = user.level;
        const nextLevel = Math.min(currentLevel + 1, 10);
        const currentLevelExp = baseExp[currentLevel] || 0;
        const nextLevelExp = baseExp[nextLevel] || baseExp[10];
        
        const progress = Math.max(0, user.total_exp - currentLevelExp);
        const required = nextLevelExp - currentLevelExp;
        const percentage = required > 0 ? Math.min(100, (progress / required) * 100) : 100;
        
        return {
            percentage: percentage,
            nextLevelExp: nextLevelExp
        };
    }

    /**
     * 查看用户详情
     */
    async viewUserDetail(userId) {
        console.log('👤 查看用户详情:', userId);
        // 实现用户详情查看逻辑
    }

    /**
     * 加载等级配置
     */
    async loadLevelConfig() {
        console.log('⚙️ 开始加载等级配置...');
        
        try {
            const response = await this.apiRequest('/api/level/config');
            console.log('⚙️ 等级配置API响应:', response);
            
            if (response.success) {
                this.renderLevelConfig(response.data);
                console.log('✅ 等级配置加载完成');
            } else {
                throw new Error(response.error || '获取等级配置失败');
            }
        } catch (error) {
            console.error('❌ 加载等级配置失败:', error);
            this.showError('加载等级配置失败: ' + error.message);
        }
    }

    /**
     * 渲染等级配置
     */
    renderLevelConfig(config) {
        console.log('⚙️ 渲染等级配置:', config);
        
        const configContainer = document.getElementById('levelConfigContainer');
        if (!configContainer) {
            console.warn('⚠️ 找不到levelConfigContainer元素');
            return;
        }

        if (!config || !config.levels) {
            configContainer.innerHTML = '<p class="text-muted">暂无等级配置</p>';
            return;
        }

        const levels = config.levels;
        const levelRows = levels.map(level => `
            <tr>
                <td>${this.getLevelBadge(level.level)}</td>
                <td>${level.name}</td>
                <td>${level.required_exp || 0}</td>
                <td>${level.required_evals || 0}</td>
            </tr>
        `).join('');

        configContainer.innerHTML = `
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead>
                        <tr>
                            <th>等级</th>
                            <th>名称</th>
                            <th>所需经验</th>
                            <th>所需评价</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${levelRows}
                    </tbody>
                </table>
            </div>
        `;
        
        console.log('✅ 等级配置渲染完成');
    }

    /**
     * 处理选项卡切换
     */
    handleTabSwitch(target) {
        console.log('🔄 处理选项卡切换:', target);
        
        switch (target) {
            case '#ranking':
                // 排行榜标签页，可能需要刷新数据
                console.log('📊 切换到排行榜标签页');
                break;
            case '#management':
                // 用户管理标签页
                console.log('👥 切换到用户管理标签页');
                break;
            case '#config':
                // 配置标签页，加载系统统计
                console.log('⚙️ 切换到配置标签页');
                this.loadSystemStats();
                break;
        }
    }

    /**
     * 调整用户积分（占位符）
     */
    adjustUserPoints(userId) {
        console.log('💰 调整用户积分:', userId);
        this.showInfo(`调整用户 ${userId} 的积分功能开发中...`);
    }

    /**
     * 查看用户历史（占位符）
     */
    viewUserHistory(userId) {
        console.log('📜 查看用户历史:', userId);
        this.showInfo(`查看用户 ${userId} 的历史记录功能开发中...`);
    }

    /**
     * 用户搜索
     */
    async searchUsers() {
        console.log('🔍 开始用户搜索...');
        const searchInput = document.getElementById('userSearch');
        if (!searchInput) {
            console.warn('⚠️ 找不到userSearch元素');
            return;
        }
        
        const searchTerm = searchInput.value.trim();
        console.log('🔍 搜索关键词:', searchTerm);
        
        if (!searchTerm) {
            this.showInfo('请输入搜索关键词');
            return;
        }
        
        // 简单的前端搜索实现
        try {
            const response = await this.apiRequest('/api/level/rankings?limit=1000&includeInactive=true');
            if (response.success) {
                const allUsers = response.data || [];
                const filteredUsers = allUsers.filter(user => {
                    const displayName = user.username || user.display_name || `用户${user.user_id}`;
                    return displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.user_id.toString().includes(searchTerm);
                });
                
                console.log('🔍 搜索结果:', filteredUsers);
                this.renderRankingTable(filteredUsers);
            }
        } catch (error) {
            console.error('❌ 搜索失败:', error);
            this.showError('搜索失败: ' + error.message);
        }
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
        console.log('💾 设置缓存:', key);
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) {
            console.log('💾 缓存未命中:', key);
            return null;
        }
        
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            console.log('💾 缓存过期:', key);
            this.cache.delete(key);
            return null;
        }
        
        console.log('💾 缓存命中:', key);
        return cached.data;
    }

    clearCache() {
        console.log('🧹 清理缓存');
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
        console.log('✅ 成功消息:', message);
        this.showToast(message, 'success');
    }

    showError(message) {
        console.error('❌ 错误消息:', message);
        this.showToast(message, 'danger');
    }

    showInfo(message) {
        console.log('ℹ️ 信息消息:', message);
        this.showToast(message, 'info');
    }

    showToast(message, type = 'info') {
        console.log('🍞 显示Toast:', message, type);
        
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
        if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
            const toast = new bootstrap.Toast(toastElement, {
                autohide: true,
                delay: 5000
            });
            
            toast.show();
        } else {
            console.warn('⚠️ Bootstrap Toast不可用');
        }
        
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
    levelSystemManager = new LevelSystemManager();
});

console.log('📝 等级系统管理脚本加载完成'); 