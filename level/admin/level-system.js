// 等级系统管理界面JavaScript

// 全局变量
let currentPage = 1;
let pageSize = 20;
let levelChart = null;
let allUsers = [];
let allBadges = [];
let currentUserId = null;
let currentGroupId = 'default';
let groupConfigs = {};
let showActiveUsersOnly = true; // 默认只显示有评价记录的用户

// ==================== 管理员密码验证系统 ====================

// 当前等待执行的管理员操作
let pendingAdminAction = null;

// 显示管理员密码验证模态框
function showAdminPasswordModal(actionName, actionFunction, actionParams = []) {
    pendingAdminAction = {
        name: actionName,
        function: actionFunction,
        params: actionParams
    };
    
    document.getElementById('passwordPromptText').textContent = `执行"${actionName}"操作需要管理员密码验证，请输入密码：`;
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('adminPasswordModal').style.display = 'block';
    
    // 聚焦到密码输入框
    setTimeout(() => {
        document.getElementById('adminPasswordInput').focus();
    }, 100);
}

// 确认管理员操作
async function confirmAdminAction() {
    const password = document.getElementById('adminPasswordInput').value.trim();
    
    if (!password) {
        showError('请输入管理员密码');
        return;
    }
    
    if (!pendingAdminAction) {
        showError('没有待执行的操作');
        closeModal('adminPasswordModal');
        return;
    }
    
    try {
        // 验证密码
        const verifyResponse = await fetch('/api/admin/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        });
        
        const verifyResult = await verifyResponse.json();
        
        if (!verifyResult.success || !verifyResult.valid) {
            showError('管理员密码错误');
            return;
        }
        
        // 密码验证通过，执行操作
        closeModal('adminPasswordModal');
        
        // 将密码添加到参数中
        const params = [...pendingAdminAction.params, password];
        await pendingAdminAction.function(...params);
        
    } catch (error) {
        console.error('管理员操作失败:', error);
        showError('操作失败：' + error.message);
    } finally {
        pendingAdminAction = null;
    }
}

// 监听密码输入框的回车键
document.addEventListener('DOMContentLoaded', function() {
    const passwordInput = document.getElementById('adminPasswordInput');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                confirmAdminAction();
            }
        });
    }
});

// ==================== 修改破坏性操作函数 ====================

// 删除群组（需要密码验证）
async function deleteGroupWithPassword(groupId, adminPassword) {
    if (!confirm(`确定要删除群组 ${groupId} 吗？此操作将删除所有相关数据且不可恢复！`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/level/groups/${groupId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminPassword: adminPassword })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('群组删除成功');
            if (result.details) {
                console.log('删除详情:', result.details);
                showSuccess(`删除完成：配置${result.details.configDeleted}条，用户${result.details.usersDeleted}条，勋章${result.details.badgesDeleted}条`);
            }
            
            // 强制刷新所有相关数据
            await refreshAllData();
            showSuccess('页面数据已刷新');
        } else {
            if (result.requirePassword) {
                showError(result.error);
            } else {
                showError('删除失败：' + result.error);
            }
        }
    } catch (error) {
        console.error('删除群组失败:', error);
        showError('删除失败');
    }
}

// 修改原有的删除群组函数
function deleteGroup(groupId) {
    showAdminPasswordModal('删除群组', deleteGroupWithPassword, [groupId]);
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('🏆 等级系统管理界面初始化开始...');
    
    // 应用假前端修复
    applyFakeFrontendFixes();
    
    // 检查等级系统是否启用
    checkLevelSystemStatus();
    
    // 加载统计数据
    loadStats();
    
    // 加载初始数据
    loadInitialData();
    
    // 初始化标签页
    initTabs();
    
    // 加载用户列表
    loadUsers();
    
    // 初始化搜索
    initSearch();
    
    // 添加页面焦点事件监听，用户切换回页面时自动刷新数据
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            console.log('🔄 页面重新获得焦点，自动刷新数据');
            refreshAllData();
        }
    });
    
    console.log('✅ 等级系统管理界面初始化完成');
});

// 应用假前端修复
function applyFakeFrontendFixes() {
    console.log('🔧 应用假前端修复...');
    
    // 禁用未实现的功能
    const disabledFeatures = {
        // 数据导出功能
        exportAllData: async function() {
            showMessage('数据导出功能正在开发中，预计下个版本上线', 'warning');
        },
        exportUserData: async function() {
            showMessage('数据导出功能正在开发中，预计下个版本上线', 'warning');
        },
        exportConfig: async function() {
            showMessage('数据导出功能正在开发中，预计下个版本上线', 'warning');
        },
        // 数据导入功能
        importData: async function() {
            showMessage('数据导入功能正在开发中，预计下个版本上线', 'warning');
        },
        // 测试播报
        testBroadcast: async function() {
            try {
                showMessage('正在发送测试播报...', 'info');
                
                const response = await fetch('/api/level/broadcast/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'level_up',
                        testData: {
                            user_name: '@测试用户',
                            old_level: 1,
                            new_level: 2,
                            level_name: '初级勇士 🔵',
                            level_up_points: 50
                        }
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showSuccess('测试播报发送成功！请检查群组消息');
                } else {
                    showError('测试播报失败：' + result.error);
                }
            } catch (error) {
                showError('测试播报失败：' + error.message);
            }
        },
        // 授予勋章
        awardBadge: async function() {
            showMessage('勋章授予功能即将上线', 'warning');
        },
        // 调整用户数据
        adjustUserData: async function() {
            showMessage('用户数据调整功能即将上线', 'warning');
        },
        // 群组迁移
        migrateGroup: async function() {
            showMessage('数据迁移功能正在开发中，预计下个版本上线', 'warning');
        },
        // 数据库管理
        loadDataManagement: async function() {
            showMessage('数据库管理功能正在开发中', 'warning');
            // 显示基础信息
            const container = document.getElementById('data-tab');
            if (container) {
                container.innerHTML = `
                    <div class="info-box" style="margin: 20px; padding: 20px; background: #e8f4fd; border: 1px solid #b3d4fc; border-radius: 8px;">
                        <h3>📊 数据库信息</h3>
                        <p>数据库类型：SQLite</p>
                        <p>数据库文件：level_system.db</p>
                        <p>数据库位置：独立于主系统</p>
                        <p class="warning" style="color: #f57c00; margin-top: 15px;">⚠️ 高级管理功能正在开发中...</p>
                    </div>
                `;
            }
        },
        // 统计功能
        loadDetailedStats: async function() {
            showMessage('高级统计功能正在开发中', 'warning');
        },
        // 系统切换
        toggleLevelSystem: async function() {
            showMessage('系统状态切换功能暂未实现', 'warning');
        }
    };
    
    // 替换全局函数
    for (const [funcName, func] of Object.entries(disabledFeatures)) {
        window[funcName] = func;
    }
    
    console.log('✅ 假前端修复应用完成');
}

// 检查等级系统状态
async function checkLevelSystemStatus() {
    console.log('🔍 检查等级系统状态...');
    try {
        const response = await fetch('/api/level/groups');
        console.log('API响应状态:', response.status);
        
        if (!response.ok) {
            const error = await response.json();
            console.error('API错误:', error);
            if (error.error === '等级系统未启用') {
                showError('等级系统未启用，请在环境变量中设置 LEVEL_SYSTEM_ENABLED=true');
                const container = document.querySelector('.level-container');
                if (container) {
                    container.style.opacity = '0.5';
                }
            }
        } else {
            const result = await response.json();
            if (result.success && result.data.length === 0) {
                showMessage('欢迎使用等级系统！请先在"群组管理"页面添加您的群组配置。', 'info');
            }
            console.log('✅ 等级系统状态正常');
        }
    } catch (error) {
        console.error('检查等级系统状态失败:', error);
        showError('无法连接到服务器，请检查服务是否运行');
    }
}

// 加载统计数据
async function loadStats() {
    try {
        // 使用现有的stats API
        const response = await fetch('/api/level/stats');
        const result = await response.json();
        
        if (result.success) {
            const stats = result.data;
            
            // 获取用户数据来计算统计
            const rankingsResponse = await fetch('/api/level/rankings');
            const rankingsResult = await rankingsResponse.json();
            
            let totalUsers = 0;
            let totalPoints = 0;
            let avgLevel = 0;
            let levelDistribution = [];
            
            if (rankingsResult.success && rankingsResult.data.length > 0) {
                const users = rankingsResult.data;
                totalUsers = users.length;
                totalPoints = users.reduce((sum, user) => sum + (user.available_points || 0), 0);
                avgLevel = totalUsers > 0 ? (users.reduce((sum, user) => sum + (user.level || 1), 0) / totalUsers).toFixed(1) : 0;
                
                // 计算等级分布
                const levelCounts = {};
                users.forEach(user => {
                    const level = user.level || 1;
                    levelCounts[level] = (levelCounts[level] || 0) + 1;
                });
                
                levelDistribution = Object.entries(levelCounts).map(([level, count]) => ({
                    level: parseInt(level),
                    count: count
                }));
            }
            
            // 更新统计卡片
            document.getElementById('totalUsers').textContent = totalUsers;
            document.getElementById('totalPoints').textContent = totalPoints;
            document.getElementById('avgLevel').textContent = avgLevel;
            document.getElementById('totalBadges').textContent = '0'; // 暂时设为0
            
            // 绘制等级分布图表
            drawLevelChart(levelDistribution);
            
            console.log('✅ 统计数据加载成功');
        } else {
            showError('加载统计数据失败：' + result.error);
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
        showError('加载统计数据失败');
    }
}

// 绘制等级分布图表
function drawLevelChart(distribution) {
    try {
        // 检查Chart.js是否加载
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js未加载，跳过图表绘制');
            return;
        }
        
        const canvas = document.getElementById('levelChart');
        if (!canvas) {
            console.warn('找不到图表canvas元素');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        
        if (levelChart) {
            levelChart.destroy();
        }
        
        const levelNames = ['Lv.1 新手', 'Lv.2 熟练', 'Lv.3 精英', 'Lv.4 大师', 'Lv.5 传说'];
        const labels = distribution.map(d => levelNames[d.level - 1] || `Lv.${d.level}`);
        const data = distribution.map(d => d.count);
        
        levelChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '用户数量',
                    data: data,
                    backgroundColor: [
                        '#1976d2',
                        '#388e3c',
                        '#f57c00',
                        '#c2185b',
                        '#7b1fa2'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
        
        console.log('✅ 图表绘制成功');
    } catch (error) {
        console.error('绘制图表失败:', error);
    }
}

// 初始化标签页
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchTab(tabName);
        });
    });
}

// 切换标签页
function switchTab(tabName) {
    // 更新标签状态
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
    
    // 更新内容
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // 加载对应内容 - 每次切换都刷新数据
    switch(tabName) {
        case 'users':
            loadUsers();
            loadStats();
            break;
        case 'levels':
            loadLevelConfig();
            break;
        case 'rewards':
            loadRewardsConfig();
            break;
        case 'badges':
            loadBadges();
            break;
        case 'broadcast':
            loadBroadcastConfig();
            break;
        case 'groups':
            loadGroups();
            break;
        case 'data':
            loadDataManagement();
            break;
    }
}

// 加载初始数据
async function loadInitialData() {
    try {
        // 简化初始数据加载，使用现有API
        console.log('✅ 初始数据加载完成');
    } catch (error) {
        console.error('加载初始数据失败:', error);
    }
}

// 加载用户列表
async function loadUsers(page = 1) {
    try {
        console.log('🔄 开始加载用户列表...');
        
        // 添加时间戳防止缓存
        const timestamp = Date.now();
        const includeInactive = !showActiveUsersOnly;
        const apiUrl = `/api/level/rankings?t=${timestamp}&includeInactive=${includeInactive}&limit=50`;
        
        console.log('🔗 API请求URL:', apiUrl);
        
        const response = await fetch(apiUrl, {
            cache: 'no-cache',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        const result = await response.json();
        
        console.log('📊 API响应:', result);
        
        if (result.success) {
            allUsers = result.data || [];
            console.log('👥 用户数据:', allUsers);
            renderUserTable(allUsers);
            renderPagination(allUsers.length, page);
            console.log('✅ 用户列表加载完成，共', allUsers.length, '个用户');
        } else {
            console.error('❌ API返回错误:', result.error);
            showError('加载用户列表失败：' + result.error);
            renderUserTable([]); // 显示空表格
        }
    } catch (error) {
        console.error('❌ 加载用户列表失败:', error);
        showError('加载用户列表失败');
        renderUserTable([]); // 显示空表格
    }
}

// 渲染用户表格
function renderUserTable(users) {
    const tbody = document.getElementById('userRankingBody');
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map((user, index) => {
        const rank = index + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
        
        // 获取用户名称和@用户名
        const displayName = user.display_name || '未设置';
        const username = user.username ? `@${user.username}` : '未设置用户名';
        
        return `
        <tr>
            <td>${medal}</td>
            <td style="font-family: monospace; color: #666;">${user.user_id}</td>
            <td><strong>${displayName}</strong></td>
            <td style="color: #0088cc;">${username}</td>
            <td><span class="level-badge level-${user.level}">Lv.${user.level}</span></td>
            <td>${user.total_exp}</td>
            <td>${user.available_points}</td>
            <td>${user.user_eval_count || 0}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="viewUserDetails('${user.user_id}')" title="查看详情">
                        👤 详情
                    </button>
                    <button class="btn btn-sm btn-success" onclick="adjustUserPoints('${user.user_id}')" title="调整积分">
                        💎 积分
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="adjustUserExp('${user.user_id}')" title="调整经验">
                        ⚡ 经验
                    </button>
                    <button class="btn btn-sm btn-info" onclick="adjustUserLevel('${user.user_id}')" title="调整等级">
                        ⭐ 等级
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

// 渲染分页
function renderPagination(total, currentPage) {
    const totalPages = Math.ceil(total / pageSize);
    const pagination = document.getElementById('userPagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '<div style="text-align: center; margin-top: 20px;">';
    
    // 上一页
    if (currentPage > 1) {
        html += `<button onclick="loadUsers(${currentPage - 1})">上一页</button> `;
    }
    
    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<span style="margin: 0 5px; font-weight: bold;">${i}</span> `;
        } else {
            html += `<button onclick="loadUsers(${i})">${i}</button> `;
        }
    }
    
    // 下一页
    if (currentPage < totalPages) {
        html += ` <button onclick="loadUsers(${currentPage + 1})">下一页</button>`;
    }
    
    html += '</div>';
    pagination.innerHTML = html;
}

// 初始化搜索
function initSearch() {
    const searchInput = document.getElementById('userSearch');
    let searchTimer;
    
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            const keyword = this.value.trim();
            if (keyword) {
                const filtered = allUsers.filter(user => 
                    user.user_id.includes(keyword) || 
                    user.display_name.toLowerCase().includes(keyword.toLowerCase())
                );
                renderUserTable(filtered);
            } else {
                renderUserTable(allUsers);
            }
        }, 300);
    });
}

// 编辑用户
async function editUser(userId) {
    const user = allUsers.find(u => u.user_id === userId);
    if (!user) return;
    
    // 填充表单
    document.getElementById('editUserId').value = user.user_id;
    document.getElementById('editDisplayName').value = user.display_name;
    document.getElementById('editLevel').value = user.level;
    document.getElementById('editExp').value = '';
    document.getElementById('editPoints').value = '';
    
    // 显示模态框
    document.getElementById('editUserModal').style.display = 'block';
}

// 保存用户编辑
async function saveUserEdit() {
    const userId = document.getElementById('editUserId').value;
    const data = {
        displayName: document.getElementById('editDisplayName').value,
        level: parseInt(document.getElementById('editLevel').value),
        exp: parseInt(document.getElementById('editExp').value) || 0,
        points: parseInt(document.getElementById('editPoints').value) || 0
    };
    
    try {
        // 暂时显示成功消息，实际功能需要后端API支持
        showMessage('用户编辑功能正在开发中，请使用调整按钮进行单项调整', 'warning');
        closeModal('editUserModal');
    } catch (error) {
        console.error('保存用户编辑失败:', error);
        showError('保存失败');
    }
}

// 查看用户勋章
async function viewUserBadges(userId) {
    try {
        // 使用现有的用户API
        const response = await fetch(`/api/level/user/${userId}`);
        const result = await response.json();
        
        if (result.success && result.data) {
            const userInfo = result.data;
            alert(`用户 ${userInfo.profile.display_name} 的勋章功能开发中...`);
        } else {
            alert('用户勋章功能开发中...');
        }
    } catch (error) {
        console.error('获取用户勋章失败:', error);
        alert('用户勋章功能开发中...');
    }
}

// 加载勋章列表
async function loadBadges() {
    try {
        const response = await fetch('/api/level/badges');
        const result = await response.json();
        
        if (result.success) {
            allBadges = result.data;
            renderBadgesList(allBadges);
        }
    } catch (error) {
        console.error('加载勋章列表失败:', error);
        showError('加载勋章列表失败');
    }
}

// 渲染勋章列表
function renderBadgesList(badges) {
    const container = document.getElementById('badgesList');
    
    if (badges.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏆</div>
                <div>暂无勋章</div>
                <div style="font-size: 14px; margin-top: 8px; color: #adb5bd;">
                    点击上方"创建新勋章"按钮来添加第一个勋章
                </div>
            </div>
        `;
        return;
    }
    
    // 按稀有度分组
    const grouped = {
        mythic: [],
        legendary: [],
        epic: [],
        rare: [],
        common: []
    };
    
    badges.forEach(badge => {
        if (grouped[badge.rarity]) {
            grouped[badge.rarity].push(badge);
        }
    });
    
    let html = '';
    
    const rarityNames = {
        mythic: '🔴 神话',
        legendary: '🟡 传说', 
        epic: '🟣 史诗',
        rare: '🔵 稀有',
        common: '⚪ 普通'
    };
    
    for (const [rarity, badgeList] of Object.entries(grouped)) {
        if (badgeList.length === 0) continue;
        
        html += `<div class="badge-category">`;
        html += `<h3 class="badge-category-title">${rarityNames[rarity]} (${badgeList.length})</h3>`;
        html += `<div class="badges-grid">`;
        
        badgeList.forEach(badge => {
            // 解析解锁条件
            let conditionText = '未知条件';
            try {
                const conditions = JSON.parse(badge.unlock_conditions || '{}');
                if (conditions.type === 'stat_based') {
                    const fieldNames = {
                        'total_exp': '总经验值',
                        'level': '等级',
                        'user_eval_count': '评价次数',
                        'available_points': '可用积分'
                    };
                    conditionText = `${fieldNames[conditions.field] || conditions.field} ≥ ${conditions.target}`;
                } else if (conditions.type === 'evaluation_streak') {
                    const streakNames = {
                        'perfect_score': '满分评价',
                        'high_score': '高分评价'
                    };
                    conditionText = `连续${conditions.count}次${streakNames[conditions.streak_type] || conditions.streak_type}`;
                } else if (conditions.type === 'manual') {
                    conditionText = '管理员手动授予';
                }
            } catch (e) {
                conditionText = '解析错误';
            }
            
            html += `<div class="badge-card badge-rarity-${rarity}">`;
            html += `<div class="badge-header">`;
            html += `<span class="badge-emoji">${badge.badge_emoji}</span>`;
            html += `<span class="badge-name">${badge.badge_name}</span>`;
            html += `</div>`;
            html += `<div class="badge-desc">${badge.badge_desc}</div>`;
            html += `<div style="font-size: 12px; color: #6c757d; margin-bottom: 12px; font-style: italic;">`;
            html += `解锁条件: ${conditionText}`;
            html += `</div>`;
            html += `<div class="badge-actions">`;
            html += `<button class="btn-sm btn-primary" onclick="editBadge('${badge.badge_id}')" title="编辑勋章">✏️ 编辑</button>`;
            html += `<button class="btn-sm btn-danger" onclick="deleteBadge('${badge.badge_id}')" title="删除勋章">🗑️ 删除</button>`;
            html += `</div>`;
            html += `</div>`;
        });
        
        html += `</div></div>`;
    }
    
    container.innerHTML = html;
}

// 显示创建勋章模态框
function showCreateBadgeModal() {
    const modal = document.getElementById('createBadgeModal');
    modal.style.display = 'block';
    updateConditionForm();
}

// 更新条件表单
function updateConditionForm() {
    const type = document.getElementById('badgeConditionType').value;
    const container = document.getElementById('conditionDetails');
    
    switch(type) {
        case 'stat_based':
            container.innerHTML = `
                <div class="form-group">
                    <label>统计字段：</label>
                    <select id="conditionField">
                        <option value="total_exp">总经验值</option>
                        <option value="available_points">可用积分</option>
                        <option value="total_points_earned">累计获得积分</option>
                        <option value="attack_count">出击次数</option>
                        <option value="user_eval_count">用户评价次数</option>
                        <option value="level">等级</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>目标值：</label>
                    <input type="number" id="conditionTarget" placeholder="例如：100">
                </div>
            `;
            break;
            
        case 'evaluation_streak':
            container.innerHTML = `
                <div class="form-group">
                    <label>评价类型：</label>
                    <select id="streakType">
                        <option value="perfect_score">满分评价</option>
                        <option value="high_score">高分评价（8分以上）</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>连续次数：</label>
                    <input type="number" id="streakCount" placeholder="例如：10">
                </div>
            `;
            break;
            
        case 'manual':
            container.innerHTML = `
                <div class="info-box">
                    此勋章只能由管理员手动授予
                </div>
            `;
            break;
    }
}

// 创建勋章
async function createBadge() {
    const type = document.getElementById('badgeConditionType').value;
    let unlockConditions = {};
    
    switch(type) {
        case 'stat_based':
            unlockConditions = {
                type: 'stat_based',
                field: document.getElementById('conditionField').value,
                operator: '>=',
                target: parseInt(document.getElementById('conditionTarget').value)
            };
            break;
            
        case 'evaluation_streak':
            unlockConditions = {
                type: 'evaluation_streak',
                streak_type: document.getElementById('streakType').value,
                count: parseInt(document.getElementById('streakCount').value),
                consecutive: true
            };
            break;
            
        case 'manual':
            unlockConditions = {
                type: 'manual',
                desc: '仅管理员可授予'
            };
            break;
    }
    
    const badgeData = {
        badge_id: document.getElementById('newBadgeId').value,
        badge_name: document.getElementById('newBadgeName').value,
        badge_emoji: document.getElementById('newBadgeEmoji').value || '🏆',
        badge_desc: document.getElementById('newBadgeDesc').value,
        badge_type: type === 'manual' ? 'manual' : 'auto',
        rarity: document.getElementById('newBadgeRarity').value,
        unlock_conditions: JSON.stringify(unlockConditions),
        group_id: currentGroupId
    };
    
    try {
        const response = await fetch('/api/level/badges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(badgeData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('勋章创建成功');
            closeModal('createBadgeModal');
            // 自动刷新相关数据
            await Promise.all([
                loadBadges(),
                loadStats()
            ]);
        } else {
            showError(result.error || '创建失败');
        }
    } catch (error) {
        console.error('创建勋章失败:', error);
        showError('创建失败');
    }
}

// 加载系统配置
async function loadConfig() {
    try {
        const response = await fetch('/api/level/groups');
        const result = await response.json();
        
        if (result.success) {
            renderConfig(result.data);
        }
    } catch (error) {
        console.error('加载系统配置失败:', error);
        showError('加载系统配置失败');
    }
}

// 渲染系统配置
function renderConfig(configs) {
    const container = document.getElementById('configContent');
    
    if (configs.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px;">暂无配置</div>';
        return;
    }
    
    // 简化显示，只显示默认配置
    const defaultConfig = configs.find(c => c.group_id === 'default') || configs[0];
    
    if (!defaultConfig) {
        container.innerHTML = '<div style="text-align: center; padding: 40px;">配置加载失败</div>';
        return;
    }
    
    const levelConfig = JSON.parse(defaultConfig.level_config || '{}');
    const pointsConfig = JSON.parse(defaultConfig.points_config || '{}');
    
    let html = '<div style="background: white; padding: 20px; border-radius: 8px;">';
    html += '<h3>等级配置</h3>';
    html += '<table class="user-table" style="margin-bottom: 30px;">';
    html += '<thead><tr><th>等级</th><th>名称</th><th>所需经验</th><th>所需评价次数</th></tr></thead>';
    html += '<tbody>';
    
    if (levelConfig.levels) {
        levelConfig.levels.forEach(level => {
            html += `<tr>`;
            html += `<td>Lv.${level.level}</td>`;
            html += `<td>${level.name}</td>`;
            html += `<td>${level.required_exp}</td>`;
            html += `<td>${level.required_evals}</td>`;
            html += `</tr>`;
        });
    }
    
    html += '</tbody></table>';
    
    html += '<h3>奖励配置</h3>';
    html += '<table class="user-table">';
    html += '<thead><tr><th>行为</th><th>经验奖励</th><th>积分奖励</th><th>描述</th></tr></thead>';
    html += '<tbody>';
    
    if (pointsConfig.base_rewards) {
        Object.entries(pointsConfig.base_rewards).forEach(([action, reward]) => {
            html += `<tr>`;
            html += `<td>${action}</td>`;
            html += `<td>${reward.exp || 0}</td>`;
            html += `<td>${reward.points || 0}</td>`;
            html += `<td>${reward.desc || '-'}</td>`;
            html += `</tr>`;
        });
    }
    
    html += '</tbody></table>';
    html += '</div>';
    
    container.innerHTML = html;
}

// 切换用户筛选
function toggleUserFilter() {
    const checkbox = document.getElementById('showActiveUsersOnly');
    showActiveUsersOnly = checkbox.checked;
    
    console.log('🔄 切换用户筛选模式:', showActiveUsersOnly ? '只显示有评价记录的用户' : '显示所有用户');
    
    // 重新加载统计数据和用户列表
    loadStats();
    loadUsers();
}

// 更新排行榜
function updateRanking(topUsers) {
    const tbody = document.getElementById('userRankingBody');
    
    // 根据筛选条件过滤用户
    let filteredUsers = topUsers;
    if (showActiveUsersOnly) {
        filteredUsers = topUsers.filter(user => user.user_eval_count > 0);
    }
    
    if (filteredUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = filteredUsers.map((user, index) => {
        const rank = index + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
        
        // 获取用户名称和@用户名
        const displayName = user.display_name || '未设置';
        const username = user.username ? `@${user.username}` : '未设置用户名';
        
        return `
            <tr>
                <td>${medal}</td>
                <td style="font-family: monospace; color: #666;">${user.user_id}</td>
                <td><strong>${displayName}</strong></td>
                <td style="color: #0088cc;">${username}</td>
                <td><span class="level-badge level-${user.level}">Lv.${user.level}</span></td>
                <td>${user.total_exp}</td>
                <td>${user.available_points}</td>
                <td>${user.user_eval_count || 0}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-primary" onclick="viewUserDetails('${user.user_id}')" title="查看详情">
                            👤 详情
                        </button>
                        <button class="btn btn-sm btn-success" onclick="adjustUserPoints('${user.user_id}')" title="调整积分">
                            💎 积分
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="adjustUserExp('${user.user_id}')" title="调整经验">
                            ⚡ 经验
                        </button>
                        <button class="btn btn-sm btn-info" onclick="adjustUserLevel('${user.user_id}')" title="调整等级">
                            ⭐ 等级
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// 关闭模态框
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// 显示错误消息
function showError(message) {
    showMessage(message, 'error');
}

// 显示成功消息
function showSuccess(message) {
    showMessage(message, 'success');
}

// 显示消息
function showMessage(message, type) {
    const container = document.getElementById('messageContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = type === 'error' ? 'error-message' : 'success-message';
    messageDiv.textContent = message;
    messageDiv.style.position = 'fixed';
    messageDiv.style.top = '20px';
    messageDiv.style.right = '20px';
    messageDiv.style.zIndex = '9999';
    
    container.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

// 点击模态框外部关闭
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// 将函数暴露到全局作用域
window.editUser = editUser;
window.viewUserBadges = viewUserBadges;
window.showCreateBadgeModal = showCreateBadgeModal;
window.createBadge = createBadge;
window.closeModal = closeModal;
window.saveUserEdit = saveUserEdit;
window.loadUsers = loadUsers;
window.switchTab = switchTab;

// 导出配置管理函数
window.removeLevelRow = removeLevelRow;
window.updateLevelField = updateLevelField;
window.addLevelRow = addLevelRow;
window.saveLevelConfig = saveLevelConfig;
window.resetLevelConfig = resetLevelConfig;
window.saveRewardsConfig = saveRewardsConfig;
window.saveBroadcastConfig = saveBroadcastConfig;
window.insertVariable = insertVariable;
window.testBroadcast = testBroadcast;
window.updateConditionForm = updateConditionForm;
window.createBadge = createBadge;
window.showCreateBadgeModal = showCreateBadgeModal;
window.showCreateGroupModal = showCreateGroupModal;
window.createGroup = createGroup;
window.editGroupConfig = editGroupConfig;
window.deleteGroup = deleteGroup;
window.exportData = exportData;
window.showImportModal = showImportModal;
window.importData = importData;
window.showMigrateModal = showMigrateModal;
window.migrateData = migrateData;

// 导出新增的用户筛选函数
window.toggleUserFilter = toggleUserFilter;

  // 导出其他缺失的函数
  window.toggleLevelSystem = toggleLevelSystem;
  window.searchUser = searchUser;
  window.createNewGroup = createNewGroup;
  window.exportAllData = exportAllData;
  window.exportUserData = exportUserData;
  window.exportConfig = exportConfig;
  window.migrateGroup = migrateGroup;
  window.adjustUserData = adjustUserData;
  window.awardBadge = awardBadge;
  window.loadGroups = loadGroups;
  
  // 导出新的用户管理函数
  window.viewUserDetails = viewUserDetails;
  window.adjustUserPoints = adjustUserPoints;
  window.adjustUserExp = adjustUserExp;
  window.adjustUserLevel = adjustUserLevel;
  window.confirmUserAdjustment = confirmUserAdjustment;

// ==================== 缺失的配置管理函数 ====================

// 删除等级行（需要密码验证）
async function removeLevelRowWithPassword(index, adminPassword) {
    const groupId = document.getElementById('levelGroupSelect').value;
    if (!groupId) return;
    const config = groupConfigs[groupId];
    
    if (!config) return;
    
    const levelConfig = JSON.parse(config.level_config || '{}');
    if (!levelConfig.levels) return;
    
    levelConfig.levels.splice(index, 1);
    
    // 重新编号
    levelConfig.levels.forEach((level, idx) => {
        level.level = idx + 1;
    });
    
    config.level_config = JSON.stringify(levelConfig);
    renderLevelConfig(levelConfig.levels);
    showSuccess('等级删除成功');
}

// 修改原有的删除等级行函数
function removeLevelRow(index) {
    showAdminPasswordModal('删除等级', removeLevelRowWithPassword, [index]);
}

// 重置等级配置（需要密码验证）
async function resetLevelConfigWithPassword(adminPassword) {
    const defaultLevels = [
        { level: 1, name: "新手勇士 🟢", required_exp: 0, required_evals: 0 },
        { level: 2, name: "初级勇士 🔵", required_exp: 50, required_evals: 3 },
        { level: 3, name: "中级勇士 🟣", required_exp: 150, required_evals: 8 },
        { level: 4, name: "高级勇士 🟠", required_exp: 300, required_evals: 15 },
        { level: 5, name: "专家勇士 🔴", required_exp: 500, required_evals: 25 }
    ];
    
    const groupId = document.getElementById('levelGroupSelect').value;
    if (!groupId) {
        showError('请先选择一个群组');
        return;
    }
    
    groupConfigs[groupId] = {
        group_id: groupId,
        level_config: JSON.stringify({ levels: defaultLevels })
    };
    
    renderLevelConfig(defaultLevels);
    showSuccess('等级配置已重置为默认');
}

// 修改原有的重置等级配置函数
function resetLevelConfig() {
    showAdminPasswordModal('重置等级配置', resetLevelConfigWithPassword, []);
}

// 群组迁移（需要密码验证）
async function migrateGroupWithPassword(sourceGroup, targetGroupId, adminPassword) {
    if (!sourceGroup || !targetGroupId) {
        showError('请选择源群组和输入目标群组ID');
        return;
    }
    
    try {
        const response = await fetch('/api/level/migrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourceGroupId: sourceGroup,
                targetGroupId: targetGroupId,
                adminPassword: adminPassword
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('群组迁移成功');
        } else {
            showError('迁移失败：' + result.error);
        }
    } catch (error) {
        console.error('群组迁移失败:', error);
        showError('迁移失败');
    }
}

// 修改原有的群组迁移函数
function migrateGroup() {
    const sourceGroup = document.getElementById('sourceGroup').value;
    const targetGroupId = document.getElementById('targetGroupId').value.trim();
    
    if (!sourceGroup || !targetGroupId) {
        showError('请选择源群组和输入目标群组ID');
        return;
    }
    
    showAdminPasswordModal('群组迁移', migrateGroupWithPassword, [sourceGroup, targetGroupId]);
}

// 加载等级配置
async function loadLevelConfig() {
    try {
        const response = await fetch('/api/level/groups');
        const result = await response.json();
        
        if (result.success) {
            // 填充群组选择框
            const groupSelect = document.getElementById('levelGroupSelect');
            groupSelect.innerHTML = result.data.map(group => 
                `<option value="${group.group_id}">${group.group_name || group.group_id}</option>`
            ).join('');
            
            // 加载当前群组的配置
            loadGroupLevelConfig();
        }
    } catch (error) {
        console.error('加载等级配置失败:', error);
        showError('加载等级配置失败');
    }
}

// 加载群组等级配置
async function loadGroupLevelConfig() {
    const groupId = document.getElementById('levelGroupSelect').value;
    if (!groupId) {
        renderLevelConfig([]);
        return;
    }
    
    try {
        const response = await fetch(`/api/level/groups/${groupId}`);
        const result = await response.json();
        
        if (result.success) {
            const levelConfig = JSON.parse(result.data.level_config || '{}');
            groupConfigs[groupId] = result.data;
            
            if (levelConfig.levels) {
                renderLevelConfig(levelConfig.levels);
            } else {
                renderLevelConfig([]);
            }
        }
    } catch (error) {
        console.error('加载群组等级配置失败:', error);
        showError('加载群组等级配置失败');
    }
}

// 加载奖励配置
async function loadRewardsConfig() {
    const groupId = currentGroupId;
    if (!groupId) {
        showError('请先选择一个群组');
        return;
    }
    
    try {
        const response = await fetch(`/api/level/rewards?groupId=${groupId}`);
        const result = await response.json();
        
        if (result.success) {
            const config = result.data;
            
            // 填充表单
            if (config.base_rewards) {
                document.getElementById('attackExp').value = config.base_rewards.attack?.exp || 20;
                document.getElementById('attackPoints').value = config.base_rewards.attack?.points || 10;
                document.getElementById('userEvalExp').value = config.base_rewards.user_eval_12?.exp || 30;
                document.getElementById('userEvalPoints').value = config.base_rewards.user_eval_12?.points || 25;
                document.getElementById('merchantEvalExp').value = config.base_rewards.merchant_eval?.exp || 25;
                document.getElementById('merchantEvalPoints').value = config.base_rewards.merchant_eval?.points || 20;
                document.getElementById('textEvalExp').value = config.base_rewards.text_eval?.exp || 15;
                document.getElementById('textEvalPoints').value = config.base_rewards.text_eval?.points || 15;
            }
            
            if (config.special_rewards) {
                document.getElementById('perfectScoreExp').value = config.special_rewards.perfect_score?.exp || 50;
                document.getElementById('perfectScorePoints').value = config.special_rewards.perfect_score?.points || 100;
                document.getElementById('levelUpPoints').value = config.special_rewards.level_up_bonus?.points || 50;
            }
            
            if (config.multipliers) {
                document.getElementById('expMultiplier').value = config.multipliers.exp_multiplier || 1.0;
                document.getElementById('pointsMultiplier').value = config.multipliers.points_multiplier || 1.0;
                document.getElementById('weekendBonus').value = config.multipliers.weekend_bonus || 1.2;
            }
        }
    } catch (error) {
        console.error('加载奖励配置失败:', error);
        showError('加载奖励配置失败');
    }
}

// 加载播报配置
async function loadBroadcastConfig() {
    const groupId = currentGroupId;
    if (!groupId) {
        showError('请先选择一个群组');
        return;
    }
    
    try {
        const response = await fetch(`/api/level/broadcast?groupId=${groupId}`);
        const result = await response.json();
        
        if (result.success) {
            // 填充表单
            document.getElementById('broadcastMessage').value = result.data.message || '';
            document.getElementById('broadcastTime').value = result.data.time || '';
        }
    } catch (error) {
        console.error('加载播报配置失败:', error);
        showError('加载播报配置失败');
    }
}

// ==================== 补充缺失的函数实现 ====================

// 更新等级字段
function updateLevelField(index, field, value) {
    const groupId = document.getElementById('levelGroupSelect').value;
    if (!groupId) return;
    const config = groupConfigs[groupId];
    
    if (!config) return;
    
    const levelConfig = JSON.parse(config.level_config || '{}');
    if (!levelConfig.levels || !levelConfig.levels[index]) return;
    
    levelConfig.levels[index][field] = value;
    config.level_config = JSON.stringify(levelConfig);
}

// 添加等级行
function addLevelRow() {
    const groupId = document.getElementById('levelGroupSelect').value || 'default';
    let config = groupConfigs[groupId];
    
    if (!config) {
        config = {
            group_id: groupId,
            level_config: JSON.stringify({ levels: [] })
        };
        groupConfigs[groupId] = config;
    }
    
    const levelConfig = JSON.parse(config.level_config || '{}');
    if (!levelConfig.levels) {
        levelConfig.levels = [];
    }
    
    const newLevel = {
        level: levelConfig.levels.length + 1,
        name: `等级${levelConfig.levels.length + 1}`,
        required_exp: (levelConfig.levels.length + 1) * 100,
        required_evals: (levelConfig.levels.length + 1) * 5
    };
    
    levelConfig.levels.push(newLevel);
    config.level_config = JSON.stringify(levelConfig);
    
    renderLevelConfig(levelConfig.levels);
}

// 保存等级配置
async function saveLevelConfig() {
    const groupId = document.getElementById('levelGroupSelect').value;
    if (!groupId) {
        showError('请先选择一个群组');
        return;
    }
    const config = groupConfigs[groupId];
    
    if (!config) {
        showError('没有配置可保存');
        return;
    }
    
    try {
        const response = await fetch('/api/level/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                groupId: groupId,
                levelConfig: JSON.parse(config.level_config || '{}')
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('等级配置保存成功');
            // 自动刷新相关数据
            await Promise.all([
                loadLevelConfig(),
                loadStats()
            ]);
        } else {
            showError(result.error || '保存失败');
        }
    } catch (error) {
        console.error('保存等级配置失败:', error);
        showError('保存失败');
    }
}

// 渲染等级配置
function renderLevelConfig(levels) {
    const tbody = document.getElementById('levelConfigBody');
    
    if (!levels || levels.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">暂无等级配置</td></tr>';
        return;
    }
    
    tbody.innerHTML = levels.map((level, index) => `
        <tr>
            <td>Lv.${level.level}</td>
            <td><input type="text" value="${level.name}" onchange="updateLevelField(${index}, 'name', this.value)"></td>
            <td><input type="number" value="${level.required_exp}" onchange="updateLevelField(${index}, 'required_exp', parseInt(this.value))"></td>
            <td><input type="number" value="${level.required_evals}" onchange="updateLevelField(${index}, 'required_evals', parseInt(this.value))"></td>
            <td><button class="btn btn-danger" onclick="removeLevelRow(${index})">删除</button></td>
        </tr>
    `).join('');
}

// ==================== 其他缺失的函数实现 ====================

// 切换等级系统状态
async function toggleLevelSystem() {
    showError('系统状态切换功能暂未实现');
}

// 搜索用户
async function searchUser() {
    const keyword = document.getElementById('userSearchInput').value.trim();
    if (!keyword) {
        showError('请输入搜索关键词');
        return;
    }
    
    try {
        const response = await fetch(`/api/level/users?search=${encodeURIComponent(keyword)}`);
        const result = await response.json();
        
        if (result.success) {
            const searchResult = document.getElementById('userSearchResult');
            if (result.data.users.length === 0) {
                searchResult.innerHTML = '<div style="text-align: center; padding: 20px;">未找到匹配的用户</div>';
            } else {
                searchResult.innerHTML = `
                    <table class="config-table">
                        <thead>
                            <tr><th>用户ID</th><th>显示名称</th><th>等级</th><th>经验值</th><th>积分</th><th>操作</th></tr>
                        </thead>
                        <tbody>
                            ${result.data.users.map(user => `
                                <tr>
                                    <td>${user.user_id}</td>
                                    <td>${user.display_name}</td>
                                    <td>Lv.${user.level}</td>
                                    <td>${user.total_exp}</td>
                                    <td>${user.available_points}</td>
                                    <td>
                                        <button class="btn btn-primary" onclick="editUser('${user.user_id}')">编辑</button>
                                        <button class="btn btn-success" onclick="viewUserBadges('${user.user_id}')">勋章</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            }
            searchResult.style.display = 'block';
        } else {
            showError(result.error || '搜索失败');
        }
    } catch (error) {
        console.error('搜索用户失败:', error);
        showError('搜索失败');
    }
}

// 创建新群组
function createNewGroup() {
    document.getElementById('createGroupModal').style.display = 'block';
}

// 创建群组
async function createGroup() {
    const groupId = document.getElementById('newGroupId').value.trim();
    const groupName = document.getElementById('newGroupName').value.trim();
    
    // 验证输入
    if (!groupId || !groupName) {
        showError('请填写完整的群组信息');
        return;
    }
    
    // 验证群组ID格式
    if (!groupId.startsWith('-100')) {
        showError('群组ID格式不正确，应该以-100开头（例如：-1002793326688）');
        return;
    }
    
    // 验证群组ID是否为数字
    if (!/^-\d+$/.test(groupId)) {
        showError('群组ID应该是负数（例如：-1002793326688）');
        return;
    }
    
    try {
        showMessage('正在创建群组配置...', 'info');
        
        const response = await fetch('/api/level/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                group_id: groupId,
                group_name: groupName
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess(`群组配置创建成功！现在可以在群组中使用 /level 命令了`);
            closeModal('createGroupModal');
            
            // 清空表单
            document.getElementById('newGroupId').value = '';
            document.getElementById('newGroupName').value = '';
            
            // 自动刷新相关数据
            await Promise.all([
                loadGroups(),
                loadInitialData(),
                loadStats()
            ]);
            
            // 显示成功提示
            showMessage('🎉 群组配置创建完成！您现在可以：\n1. 在群组中发送 /level 命令测试\n2. 通过其他标签页配置等级、积分、勋章等', 'success');
        } else {
            showError(result.error || '创建失败');
        }
    } catch (error) {
        console.error('创建群组失败:', error);
        showError('网络错误，创建失败');
    }
}

// 加载群组列表
async function loadGroups() {
    try {
        const response = await fetch('/api/level/groups');
        const result = await response.json();
        
        if (result.success) {
            // 清空本地缓存的群组配置
            groupConfigs = {};
            
            // 更新群组配置缓存
            result.data.forEach(group => {
                groupConfigs[group.group_id] = group;
            });
            
            const tbody = document.getElementById('groupsTableBody');
            const guideElement = document.getElementById('groupsGuide');
            
            if (result.data.length === 0) {
                // 没有群组时显示指南和空状态
                if (guideElement) {
                    guideElement.style.display = 'block';
                }
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 40px;">
                            <div style="color: #666;">
                                <h4>🎮 还没有群组配置</h4>
                                <p>点击上方的"➕ 创建新群组"按钮开始配置</p>
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                // 有群组时隐藏指南，显示群组列表
                if (guideElement) {
                    guideElement.style.display = 'none';
                }
                tbody.innerHTML = result.data.map(group => `
                    <tr>
                        <td style="font-family: monospace; font-weight: bold;">${group.group_id}</td>
                        <td>${group.group_name || '-'}</td>
                        <td>-</td>
                        <td><span style="color: #28a745;">●</span> 活跃</td>
                        <td>
                            <button class="btn btn-primary btn-sm" onclick="editGroupConfig('${group.group_id}')">⚙️ 配置</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteGroup('${group.group_id}')" style="margin-left: 5px;">🗑️ 删除</button>
                        </td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('加载群组失败:', error);
        showError('加载群组失败');
    }
}

// 编辑群组配置
function editGroupConfig(groupId) {
    const config = groupConfigs[groupId];
    if (!config) {
        showError('群组配置不存在');
        return;
    }
    
    // 设置当前编辑的群组
    currentGroupId = groupId;
    
    // 填充模态框数据
    document.getElementById('editGroupId').value = groupId;
    document.getElementById('editGroupName').value = config.group_name || '';
    
    // 解析配置数据
    let levelConfig = {};
    let pointsConfig = {};
    let broadcastConfig = {};
    
    try {
        levelConfig = JSON.parse(config.level_config || '{}');
        pointsConfig = JSON.parse(config.points_config || '{}');
        broadcastConfig = JSON.parse(config.broadcast_config || '{}');
    } catch (error) {
        console.error('解析配置失败:', error);
    }
    
    // 设置系统开关
    const settings = levelConfig.settings || {};
    document.getElementById('editEnableLevelSystem').checked = settings.enable_level_system !== false;
    document.getElementById('editEnablePointsSystem').checked = settings.enable_points_system !== false;
    document.getElementById('editEnableRanking').checked = settings.enable_ranking !== false;
    document.getElementById('editEnableNotifications').checked = settings.enable_notifications !== false;
    
    // 显示模态框
    document.getElementById('editGroupConfigModal').style.display = 'block';
}

// 数据导出功能
async function exportAllData() {
    try {
        const response = await fetch('/api/level/export/all');
        const result = await response.json();
        
        if (result.success) {
            downloadJSON(result.data, 'level_system_full_export.json');
            showSuccess('数据导出成功');
        } else {
            showError(result.error || '导出失败');
        }
    } catch (error) {
        console.error('导出数据失败:', error);
        showError('导出失败');
    }
}

async function exportUserData() {
    try {
        const response = await fetch('/api/level/export/users');
        const result = await response.json();
        
        if (result.success) {
            downloadJSON(result.data, 'level_system_users_export.json');
            showSuccess('用户数据导出成功');
        } else {
            showError(result.error || '导出失败');
        }
    } catch (error) {
        console.error('导出用户数据失败:', error);
        showError('导出失败');
    }
}

async function exportConfig() {
    try {
        const response = await fetch('/api/level/export/config');
        const result = await response.json();
        
        if (result.success) {
            downloadJSON(result.data, 'level_system_config_export.json');
            showSuccess('配置数据导出成功');
        } else {
            showError(result.error || '导出失败');
        }
    } catch (error) {
        console.error('导出配置失败:', error);
        showError('导出失败');
    }
}

// 数据导入
async function importData() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showError('请选择要导入的文件');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/level/import', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('数据导入成功');
            // 自动刷新所有数据
            await refreshAllData();
        } else {
            showError(result.error || '导入失败');
        }
    } catch (error) {
        console.error('导入数据失败:', error);
        showError('导入失败');
    }
}

// 调整用户数据
async function adjustUserData() {
    showError('用户数据调整功能暂未实现');
}

// 编辑勋章
function editBadge(badgeId) {
    const badge = allBadges.find(b => b.badge_id === badgeId);
    if (!badge) {
        showError('勋章不存在');
        return;
    }
    
    // 填充编辑表单
    document.getElementById('editBadgeId').value = badge.badge_id;
    document.getElementById('editBadgeName').value = badge.badge_name;
    document.getElementById('editBadgeEmoji').value = badge.badge_emoji;
    document.getElementById('editBadgeDesc').value = badge.badge_desc;
    document.getElementById('editBadgeRarity').value = badge.rarity;
    
    // 解析解锁条件
    let conditions = {};
    try {
        conditions = JSON.parse(badge.unlock_conditions || '{}');
    } catch (e) {
        conditions = {};
    }
    
    document.getElementById('editBadgeConditionType').value = conditions.type || 'stat_based';
    updateEditConditionForm();
    
    // 根据条件类型填充具体字段
    if (conditions.type === 'stat_based') {
        document.getElementById('editConditionField').value = conditions.field || 'total_exp';
        document.getElementById('editConditionTarget').value = conditions.target || 0;
    } else if (conditions.type === 'evaluation_streak') {
        document.getElementById('editStreakType').value = conditions.streak_type || 'perfect_score';
        document.getElementById('editStreakCount').value = conditions.count || 1;
    }
    
    // 显示编辑模态框
    document.getElementById('editBadgeModal').style.display = 'block';
}

// 删除勋章
async function deleteBadge(badgeId) {
    const badge = allBadges.find(b => b.badge_id === badgeId);
    if (!badge) {
        showError('勋章不存在');
        return;
    }
    
    if (!confirm(`确定要删除勋章 "${badge.badge_name}" 吗？\n\n此操作将删除所有用户已获得的该勋章，且不可恢复！`)) {
        return;
    }
    
    // 需要管理员密码验证
    pendingAction = {
        type: 'deleteBadge',
        badgeId: badgeId,
        badgeName: badge.badge_name
    };
    
    document.getElementById('passwordPromptText').textContent = 
        `删除勋章 "${badge.badge_name}" 需要管理员密码验证，请输入密码：`;
    document.getElementById('adminPasswordModal').style.display = 'block';
}

// 删除勋章（需要密码验证）
async function deleteBadgeWithPassword(badgeId, adminPassword) {
    try {
        const response = await fetch(`/api/level/badges/${badgeId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminPassword: adminPassword })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('勋章删除成功');
            if (result.details) {
                showSuccess(`删除完成：勋章定义删除，用户勋章记录删除 ${result.details.userBadgesDeleted} 条`);
            }
            
            // 刷新勋章列表
            await loadBadges();
        } else {
            showError(result.error || '删除失败');
        }
    } catch (error) {
        console.error('删除勋章失败:', error);
        showError('删除失败');
    }
}

// 更新编辑条件表单
function updateEditConditionForm() {
    const type = document.getElementById('editBadgeConditionType').value;
    const container = document.getElementById('editConditionDetails');
    
    switch(type) {
        case 'stat_based':
            container.innerHTML = `
                <div class="form-group">
                    <label>统计字段：</label>
                    <select id="editConditionField">
                        <option value="total_exp">总经验值</option>
                        <option value="available_points">可用积分</option>
                        <option value="total_points_earned">累计获得积分</option>
                        <option value="attack_count">出击次数</option>
                        <option value="user_eval_count">用户评价次数</option>
                        <option value="level">等级</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>目标值：</label>
                    <input type="number" id="editConditionTarget" placeholder="例如：100">
                </div>
            `;
            break;
            
        case 'evaluation_streak':
            container.innerHTML = `
                <div class="form-group">
                    <label>评价类型：</label>
                    <select id="editStreakType">
                        <option value="perfect_score">满分评价</option>
                        <option value="high_score">高分评价（8分以上）</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>连续次数：</label>
                    <input type="number" id="editStreakCount" placeholder="例如：10">
                </div>
            `;
            break;
            
        case 'manual':
            container.innerHTML = `
                <div class="info-box">
                    此勋章只能由管理员手动授予
                </div>
            `;
            break;
    }
}

// 更新勋章
async function updateBadge() {
    const badgeId = document.getElementById('editBadgeId').value;
    const type = document.getElementById('editBadgeConditionType').value;
    let unlockConditions = {};
    
    switch(type) {
        case 'stat_based':
            unlockConditions = {
                type: 'stat_based',
                field: document.getElementById('editConditionField').value,
                operator: '>=',
                target: parseInt(document.getElementById('editConditionTarget').value)
            };
            break;
            
        case 'evaluation_streak':
            unlockConditions = {
                type: 'evaluation_streak',
                streak_type: document.getElementById('editStreakType').value,
                count: parseInt(document.getElementById('editStreakCount').value),
                consecutive: true
            };
            break;
            
        case 'manual':
            unlockConditions = {
                type: 'manual',
                desc: '仅管理员可授予'
            };
            break;
    }
    
    const badgeData = {
        badge_name: document.getElementById('editBadgeName').value,
        badge_emoji: document.getElementById('editBadgeEmoji').value || '🏆',
        badge_desc: document.getElementById('editBadgeDesc').value,
        badge_type: type === 'manual' ? 'manual' : 'auto',
        rarity: document.getElementById('editBadgeRarity').value,
        unlock_conditions: JSON.stringify(unlockConditions)
    };
    
    try {
        const response = await fetch(`/api/level/badges/${badgeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(badgeData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('勋章更新成功');
            closeModal('editBadgeModal');
            // 刷新勋章列表
            await loadBadges();
        } else {
            showError(result.error || '更新失败');
        }
    } catch (error) {
        console.error('更新勋章失败:', error);
        showError('更新失败');
    }
}

// 授予勋章
async function awardBadge() {
    showError('勋章授予功能暂未实现');
}

// 保存奖励配置
async function saveRewardsConfig() {
    const groupId = currentGroupId || 'default';
    
    const rewardsData = {
        base_rewards: {
            attack: {
                exp: parseInt(document.getElementById('attackExp').value) || 20,
                points: parseInt(document.getElementById('attackPoints').value) || 10
            },
            user_eval_12: {
                exp: parseInt(document.getElementById('userEvalExp').value) || 30,
                points: parseInt(document.getElementById('userEvalPoints').value) || 25
            },
            merchant_eval: {
                exp: parseInt(document.getElementById('merchantEvalExp').value) || 25,
                points: parseInt(document.getElementById('merchantEvalPoints').value) || 20
            },
            text_eval: {
                exp: parseInt(document.getElementById('textEvalExp').value) || 15,
                points: parseInt(document.getElementById('textEvalPoints').value) || 15
            }
        },
        special_rewards: {
            perfect_score: {
                exp: parseInt(document.getElementById('perfectScoreExp').value) || 50,
                points: parseInt(document.getElementById('perfectScorePoints').value) || 100
            },
            level_up_bonus: {
                points: parseInt(document.getElementById('levelUpPoints').value) || 50
            }
        },
        multipliers: {
            exp_multiplier: parseFloat(document.getElementById('expMultiplier').value) || 1.0,
            points_multiplier: parseFloat(document.getElementById('pointsMultiplier').value) || 1.0,
            weekend_bonus: parseFloat(document.getElementById('weekendBonus').value) || 1.2
        }
    };
    
    try {
        const response = await fetch('/api/level/rewards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                groupId: groupId,
                rewards: rewardsData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('奖励配置保存成功');
            // 自动刷新相关数据
            await loadRewardsConfig();
        } else {
            showError(result.error || '保存失败');
        }
    } catch (error) {
        console.error('保存奖励配置失败:', error);
        showError('保存失败');
    }
}

// 保存播报配置
async function saveBroadcastConfig() {
    const groupId = currentGroupId;
    if (!groupId) {
        showError('请先选择一个群组');
        return;
    }
    
    const broadcastData = {
        enabled: document.getElementById('enableLevelUp').checked,
        level_up: document.getElementById('enableLevelUp').checked,
        badge_unlock: document.getElementById('enableBadgeUnlock').checked,
        points_milestone: document.getElementById('enableMilestone').checked,
        perfect_score: document.getElementById('enablePerfectScore').checked,
        templates: {
            level_up: document.getElementById('levelUpTemplate').value,
            badge_unlock: document.getElementById('badgeUnlockTemplate').value
        }
    };
    
    try {
        const response = await fetch('/api/level/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                groupId: groupId,
                broadcast: broadcastData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('播报配置保存成功');
            // 自动刷新相关数据
            await loadBroadcastConfig();
        } else {
            showError(result.error || '保存失败');
        }
    } catch (error) {
        console.error('保存播报配置失败:', error);
        showError('保存失败');
    }
}

// 插入变量
function insertVariable(templateId, variable) {
    const textarea = document.getElementById(templateId);
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);
    textarea.value = textBefore + variable + textAfter;
    textarea.focus();
    textarea.setSelectionRange(cursorPos + variable.length, cursorPos + variable.length);
}

// 测试播报
async function testBroadcast() {
    showError('播报测试功能暂未实现');
}

// 数据管理
async function loadDataManagement() {
    try {
        // 加载数据库统计信息
        const response = await fetch('/api/level/database/stats');
        const result = await response.json();
        
        if (result.success) {
            const stats = result.data;
            
            // 更新数据库信息显示
            document.getElementById('dbSize').textContent = stats.dbSize || '计算中...';
            document.getElementById('lastUpdate').textContent = stats.lastUpdate || '未知';
            
            // 显示详细统计信息
            await loadDetailedStats();
            
            showSuccess('数据管理页面加载完成');
        } else {
            showError('加载数据库统计失败：' + result.error);
        }
    } catch (error) {
        console.error('加载数据管理失败:', error);
        showError('加载数据管理失败');
    }
}

// 加载详细统计信息
async function loadDetailedStats() {
    try {
        const [usersResponse, badgesResponse, configResponse] = await Promise.all([
            fetch('/api/level/stats/users'),
            fetch('/api/level/stats/badges'),
            fetch('/api/level/stats/config')
        ]);
        
        const [usersResult, badgesResult, configResult] = await Promise.all([
            usersResponse.json(),
            badgesResponse.json(),
            configResponse.json()
        ]);
        
        // 更新详细统计信息显示
        updateDetailedStatsDisplay({
            users: usersResult.success ? usersResult.data : null,
            badges: badgesResult.success ? badgesResult.data : null,
            config: configResult.success ? configResult.data : null
        });
        
    } catch (error) {
        console.error('加载详细统计失败:', error);
    }
}

// 更新详细统计信息显示
function updateDetailedStatsDisplay(stats) {
    const container = document.getElementById('detailedStatsContainer');
    if (!container) return;
    
    let html = '<div class="detailed-stats">';
    
    if (stats.users) {
        html += `
            <div class="stat-section">
                <h4>👥 用户统计</h4>
                <p>总用户数: ${stats.users.total}</p>
                <p>活跃用户: ${stats.users.active}</p>
                <p>最高等级: ${stats.users.maxLevel}</p>
                <p>总经验值: ${stats.users.totalExp}</p>
            </div>
        `;
    }
    
    if (stats.badges) {
        html += `
            <div class="stat-section">
                <h4>🏆 勋章统计</h4>
                <p>勋章种类: ${stats.badges.types}</p>
                <p>已发放: ${stats.badges.awarded}</p>
                <p>发放率: ${stats.badges.awardRate}%</p>
            </div>
        `;
    }
    
    if (stats.config) {
        html += `
            <div class="stat-section">
                <h4>⚙️ 配置统计</h4>
                <p>群组数量: ${stats.config.groups}</p>
                <p>等级配置: ${stats.config.levels}</p>
                <p>播报规则: ${stats.config.broadcasts}</p>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

// 数据清理功能
async function cleanupData() {
    if (!confirm('确定要清理无效数据吗？此操作将：\n1. 删除无效的用户记录\n2. 清理过期的临时数据\n3. 优化数据库结构\n\n此操作不可撤销！')) {
        return;
    }
    
    try {
        const response = await fetch('/api/level/database/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('数据清理完成：' + result.message);
            // 重新加载数据管理页面
            await loadDataManagement();
        } else {
            showError('数据清理失败：' + result.error);
        }
    } catch (error) {
        console.error('数据清理失败:', error);
        showError('数据清理失败');
    }
}

// 数据库优化
async function optimizeDatabase() {
    if (!confirm('确定要优化数据库吗？此操作将：\n1. 重建索引\n2. 清理碎片\n3. 优化查询性能\n\n此操作可能需要几分钟时间。')) {
        return;
    }
    
    try {
        showSuccess('正在优化数据库，请稍候...');
        
        const response = await fetch('/api/level/database/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('数据库优化完成：' + result.message);
            // 重新加载数据管理页面
            await loadDataManagement();
        } else {
            showError('数据库优化失败：' + result.error);
        }
    } catch (error) {
        console.error('数据库优化失败:', error);
        showError('数据库优化失败');
    }
}

// 创建数据库备份
async function createBackup() {
    try {
        showSuccess('正在创建备份，请稍候...');
        
        const response = await fetch('/api/level/database/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('备份创建成功：' + result.backupPath);
            // 如果返回了下载链接，提供下载
            if (result.downloadUrl) {
                const link = document.createElement('a');
                link.href = result.downloadUrl;
                link.download = result.filename;
                link.click();
            }
        } else {
            showError('备份创建失败：' + result.error);
        }
    } catch (error) {
        console.error('创建备份失败:', error);
        showError('创建备份失败');
    }
}

// 恢复数据库备份
async function restoreBackup() {
    const fileInput = document.getElementById('backupFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showError('请选择要恢复的备份文件');
        return;
    }
    
    if (!confirm('确定要恢复此备份吗？此操作将：\n1. 覆盖当前所有数据\n2. 无法撤销\n\n请确保您已经创建了当前数据的备份！')) {
        return;
    }
    
    try {
        showSuccess('正在恢复备份，请稍候...');
        
        const formData = new FormData();
        formData.append('backup', file);
        
        const response = await fetch('/api/level/database/restore', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('备份恢复成功！页面将在3秒后刷新...');
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        } else {
            showError('备份恢复失败：' + result.error);
        }
    } catch (error) {
        console.error('恢复备份失败:', error);
        showError('恢复备份失败');
    }
}

// 显示创建群组模态框
function showCreateGroupModal() {
    document.getElementById('createGroupModal').style.display = 'block';
}

// 下载JSON文件辅助函数
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ==================== 数据刷新功能 ====================

// 刷新所有数据
async function refreshAllData() {
    console.log('🔄 开始刷新所有数据...');
    
    try {
        // 重新加载所有数据
        await Promise.all([
            loadStats(),
            loadGroups(),
            loadUsers(),
            loadBadges(),
            loadInitialData()
        ]);
        
        console.log('✅ 所有数据刷新完成');
    } catch (error) {
        console.error('❌ 数据刷新失败:', error);
        showError('数据刷新失败');
    }
}

// 手动刷新页面数据
async function manualRefresh() {
    showSuccess('正在刷新数据...');
    await refreshAllData();
    showSuccess('数据刷新完成！');
}

// 保存群组配置
async function saveGroupConfig() {
    const groupId = document.getElementById('editGroupId').value;
    const groupName = document.getElementById('editGroupName').value.trim();
    
    if (!groupId || !groupName) {
        showError('请填写完整的群组信息');
        return;
    }
    
    const config = groupConfigs[groupId];
    if (!config) {
        showError('群组配置不存在');
        return;
    }
    
    try {
        // 更新群组基本信息和设置
        const updateData = {
            group_name: groupName,
            level_config: JSON.stringify({
                ...JSON.parse(config.level_config || '{}'),
                settings: {
                    enable_level_system: document.getElementById('editEnableLevelSystem').checked,
                    enable_points_system: document.getElementById('editEnablePointsSystem').checked,
                    enable_ranking: document.getElementById('editEnableRanking').checked,
                    enable_notifications: document.getElementById('editEnableNotifications').checked
                }
            })
        };
        
        const response = await fetch(`/api/level/groups/${groupId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('群组配置保存成功');
            closeModal('editGroupConfigModal');
            // 刷新数据
            await refreshAllData();
        } else {
            showError(result.error || '保存失败');
        }
    } catch (error) {
        console.error('保存群组配置失败:', error);
        showError('保存失败');
    }
}

// 打开等级配置编辑器
function openLevelConfigEditor() {
    closeModal('editGroupConfigModal');
    switchTab('levels');
    const groupSelect = document.getElementById('levelGroupSelect');
    if (groupSelect) {
        groupSelect.value = currentGroupId;
        loadGroupLevelConfig();
    }
}

// 打开积分配置编辑器
function openPointsConfigEditor() {
    closeModal('editGroupConfigModal');
    switchTab('rewards');
    // 这里可以添加积分配置的特定逻辑
}

// 打开播报配置编辑器
function openBroadcastConfigEditor() {
    closeModal('editGroupConfigModal');
    switchTab('broadcast');
    // 这里可以添加播报配置的特定逻辑
}

// 打开勋章配置编辑器
function openBadgeConfigEditor() {
    closeModal('editGroupConfigModal');
    switchTab('badges');
    // 这里可以添加勋章配置的特定逻辑
}

// 确认管理员操作
window.confirmAdminAction = confirmAdminAction;
window.refreshAllData = refreshAllData;
window.manualRefresh = manualRefresh;
window.saveGroupConfig = saveGroupConfig;
window.openLevelConfigEditor = openLevelConfigEditor;
window.openPointsConfigEditor = openPointsConfigEditor;
window.openBroadcastConfigEditor = openBroadcastConfigEditor;
window.openBadgeConfigEditor = openBadgeConfigEditor;

// 导出数据管理功能
window.loadDataManagement = loadDataManagement;
window.cleanupData = cleanupData;
window.optimizeDatabase = optimizeDatabase;
window.createBackup = createBackup;
window.restoreBackup = restoreBackup;

// ==================== 新的用户管理函数 ====================

// 查看用户详情
async function viewUserDetails(userId) {
    try {
        const response = await fetch(`/api/level/users/${userId}`);
        const result = await response.json();
        
        if (result.success) {
            const userInfo = result.data;
            const profile = userInfo.profile;
            const currentLevel = userInfo.currentLevel;
            const nextLevel = userInfo.nextLevel;
            
            // 构建详情信息
            let detailsHtml = `
                <div class="user-details">
                    <h3>👤 用户详情</h3>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <strong>用户ID:</strong> ${profile.user_id}
                        </div>
                        <div class="detail-item">
                            <strong>用户名称:</strong> ${profile.display_name || '未设置'}
                        </div>
                        <div class="detail-item">
                            <strong>@用户名:</strong> ${profile.username ? '@' + profile.username : '未设置用户名'}
                        </div>
                        <div class="detail-item">
                            <strong>当前等级:</strong> Lv.${profile.level} ${currentLevel ? currentLevel.name : '未知'}
                        </div>
                        <div class="detail-item">
                            <strong>总经验值:</strong> ${profile.total_exp}
                        </div>
                        <div class="detail-item">
                            <strong>可用积分:</strong> ${profile.available_points}
                        </div>
                        <div class="detail-item">
                            <strong>用户评价次数:</strong> ${profile.user_eval_count}
                        </div>
                        <div class="detail-item">
                            <strong>商家评价次数:</strong> ${profile.merchant_eval_count}
                        </div>
                        <div class="detail-item">
                            <strong>创建时间:</strong> ${new Date(profile.created_at * 1000).toLocaleString('zh-CN')}
                        </div>
                        <div class="detail-item">
                            <strong>最后更新:</strong> ${new Date(profile.updated_at * 1000).toLocaleString('zh-CN')}
                        </div>
                    </div>
                    
                    ${nextLevel ? `
                        <div class="progress-info">
                            <h4>📊 升级进度</h4>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${Math.min(100, (profile.total_exp / nextLevel.required_exp) * 100)}%"></div>
                            </div>
                            <div class="progress-text">
                                下一级: Lv.${nextLevel.level} ${nextLevel.name} 
                                (${profile.total_exp}/${nextLevel.required_exp})
                            </div>
                        </div>
                    ` : '<div class="max-level">🎉 已达到最高等级！</div>'}
                </div>
            `;
            
            // 显示在模态框中
            document.getElementById('userDetailsContent').innerHTML = detailsHtml;
            document.getElementById('userDetailsModal').style.display = 'block';
            
        } else {
            showError('获取用户详情失败：' + result.error);
        }
    } catch (error) {
        console.error('获取用户详情失败:', error);
        showError('获取用户详情失败');
    }
}

// 调整用户积分
function adjustUserPoints(userId) {
    const user = allUsers.find(u => u.user_id === userId);
    if (!user) return;
    
    document.getElementById('adjustUserId').value = userId;
    document.getElementById('adjustUserName').textContent = user.display_name || '未设置';
    document.getElementById('adjustType').value = 'points';
    document.getElementById('adjustAmount').value = '';
    document.getElementById('adjustReason').value = '';
    
    // 更新模态框标题和说明
    document.getElementById('adjustModalTitle').textContent = '💎 调整用户积分';
    document.getElementById('adjustModalDesc').textContent = `当前积分: ${user.available_points}`;
    
    document.getElementById('userAdjustModal').style.display = 'block';
}

// 调整用户经验值
function adjustUserExp(userId) {
    const user = allUsers.find(u => u.user_id === userId);
    if (!user) return;
    
    document.getElementById('adjustUserId').value = userId;
    document.getElementById('adjustUserName').textContent = user.display_name || '未设置';
    document.getElementById('adjustType').value = 'exp';
    document.getElementById('adjustAmount').value = '';
    document.getElementById('adjustReason').value = '';
    
    // 更新模态框标题和说明
    document.getElementById('adjustModalTitle').textContent = '⚡ 调整用户经验值';
    document.getElementById('adjustModalDesc').textContent = `当前经验值: ${user.total_exp}`;
    
    document.getElementById('userAdjustModal').style.display = 'block';
}

// 调整用户等级
function adjustUserLevel(userId) {
    const user = allUsers.find(u => u.user_id === userId);
    if (!user) return;
    
    document.getElementById('adjustUserId').value = userId;
    document.getElementById('adjustUserName').textContent = user.display_name || '未设置';
    document.getElementById('adjustType').value = 'level';
    document.getElementById('adjustAmount').value = '';
    document.getElementById('adjustReason').value = '';
    
    // 更新模态框标题和说明
    document.getElementById('adjustModalTitle').textContent = '⭐ 调整用户等级';
    document.getElementById('adjustModalDesc').textContent = `当前等级: Lv.${user.level}`;
    
    document.getElementById('userAdjustModal').style.display = 'block';
}

// 确认用户数据调整
async function confirmUserAdjustment() {
    const userId = document.getElementById('adjustUserId').value;
    const adjustType = document.getElementById('adjustType').value;
    const amount = parseInt(document.getElementById('adjustAmount').value);
    const reason = document.getElementById('adjustReason').value.trim();
    
    if (isNaN(amount) || amount === 0) {
        showError('请输入有效的调整数值');
        return;
    }
    
    if (!reason) {
        showError('请输入调整原因');
        return;
    }
    
    try {
        const response = await fetch(`/api/level/users/${userId}/adjust`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: adjustType,
                amount: amount,
                reason: reason
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess(`用户${adjustType === 'points' ? '积分' : adjustType === 'exp' ? '经验值' : '等级'}调整成功`);
            closeModal('userAdjustModal');
            
            // 刷新数据
            await Promise.all([
                loadUsers(currentPage),
                loadStats(),
                loadInitialData()
            ]);
        } else {
            showError('调整失败：' + result.error);
        }
    } catch (error) {
        console.error('调整用户数据失败:', error);
        showError('调整失败');
    }
}

// ==================== 增强排行榜功能 ====================

// 加载增强排行榜
async function loadEnhancedRankings(type = 'level', limit = 10, includeInactive = false) {
    try {
        const response = await fetch(`/api/level/enhanced-rankings?type=${type}&limit=${limit}&includeInactive=${includeInactive}`);
        const result = await response.json();
        
        if (result.success) {
            renderEnhancedRankings(result.data);
            return result.data;
        } else {
            showError('加载增强排行榜失败：' + result.error);
            return [];
        }
    } catch (error) {
        console.error('加载增强排行榜失败:', error);
        showError('加载增强排行榜失败');
        return [];
    }
}

// 渲染增强排行榜
function renderEnhancedRankings(rankings) {
    const container = document.getElementById('enhanced-ranking-list');
    if (!container) {
        console.warn('找不到增强排行榜容器');
        return;
    }
    
    if (!rankings || rankings.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #666;">
                暂无增强排行榜数据
            </div>
        `;
        return;
    }
    
    container.innerHTML = rankings.map((user, index) => {
        const position = index + 1;
        let positionIcon = '';
        
        switch(position) {
            case 1: positionIcon = '🥇'; break;
            case 2: positionIcon = '🥈'; break;
            case 3: positionIcon = '🥉'; break;
            default: positionIcon = `${position}.`;
        }
        
        const evalStats = user.evaluation_stats;
        const activityScore = user.evaluation_activity_score || 0;
        const qualityScore = user.evaluation_quality_score || 0;
        
        return `
            <div class="enhanced-ranking-item" onclick="viewUserEvaluationReport(${user.user_id})" style="
                border: 1px solid #ddd; 
                padding: 15px; 
                margin: 10px 0; 
                border-radius: 8px; 
                cursor: pointer;
                transition: all 0.3s ease;
                background: white;
            " onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="font-size: 24px; font-weight: bold; color: #1976d2; min-width: 50px;">
                            ${positionIcon}
                        </div>
                        <div>
                            <div style="font-weight: bold; font-size: 16px; color: #333;">
                                ${user.display_name || `用户${user.user_id}`}
                            </div>
                            <div style="color: #666; font-size: 14px; margin: 5px 0;">
                                Lv.${user.level} | ${user.total_exp} EXP | ${user.available_points} 积分
                            </div>
                            <div style="color: #888; font-size: 12px;">
                                📝 评价: 给出${evalStats?.totalEvaluationsGiven || 0} 收到${evalStats?.totalEvaluationsReceived || 0} |
                                🔥 活跃度: ${activityScore} | 
                                ⭐ 质量: ${qualityScore}
                            </div>
                        </div>
                    </div>
                    <div>
                        <button onclick="event.stopPropagation(); viewUserEvaluationReport(${user.user_id})" 
                                style="padding: 5px 10px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            详细报告
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 查看用户评价报告
async function viewUserEvaluationReport(userId) {
    try {
        const response = await fetch(`/api/level/user-evaluation-report?userId=${userId}`);
        const result = await response.json();
        
        if (result.success && result.data) {
            showUserEvaluationReportModal(result.data);
        } else {
            showError('获取用户评价报告失败：' + (result.error || '未知错误'));
        }
    } catch (error) {
        console.error('获取用户评价报告失败:', error);
        showError('获取用户评价报告失败');
    }
}

// 显示用户评价报告模态框
function showUserEvaluationReportModal(reportData) {
    let modal = document.getElementById('userEvaluationReportModal');
    if (!modal) {
        // 创建模态框
        const modalHtml = `
            <div id="userEvaluationReportModal" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 900px; max-height: 80vh; overflow-y: auto;">
                    <span class="close" onclick="closeModal('userEvaluationReportModal')" style="float: right; font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
                    <h2 style="color: #1976d2; margin-bottom: 20px;">📊 用户评价详细报告</h2>
                    <div id="evaluationReportContent"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('userEvaluationReportModal');
    }
    
    // 渲染报告内容
    const content = document.getElementById('evaluationReportContent');
    const profile = reportData.user_level_info?.profile;
    const evalStats = reportData.evaluation_stats;
    const pointsHistory = reportData.points_history || [];
    
    content.innerHTML = `
        <div style="margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
            <h3 style="color: #1976d2; margin-bottom: 15px;">👤 用户基本信息</h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                <div><strong>用户ID:</strong> ${profile?.user_id || 'N/A'}</div>
                <div><strong>显示名称:</strong> ${profile?.display_name || 'N/A'}</div>
                <div><strong>等级:</strong> Lv.${profile?.level || 0}</div>
                <div><strong>总经验:</strong> ${profile?.total_exp || 0}</div>
                <div><strong>可用积分:</strong> ${profile?.available_points || 0}</div>
                <div><strong>评价次数:</strong> ${profile?.user_eval_count || 0}</div>
            </div>
        </div>
        
        <div style="margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
            <h3 style="color: #1976d2; margin-bottom: 15px;">📝 评价统计</h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                <div style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #4caf50;">
                    <h4 style="margin: 0 0 10px 0; color: #4caf50;">给出评价</h4>
                    <div style="font-size: 24px; font-weight: bold; color: #333; margin-bottom: 10px;">
                        ${evalStats?.totalEvaluationsGiven || 0}
                    </div>
                    ${evalStats?.givenStats ? `
                        <div style="font-size: 12px; color: #666;">
                            平均评分: ${evalStats.givenStats.averageOverallScore?.toFixed(2) || 'N/A'}<br>
                            有评论: ${evalStats.givenStats.commentStats?.withComments || 0}<br>
                            评论率: ${evalStats.givenStats.count > 0 ? ((evalStats.givenStats.commentStats?.withComments || 0) / evalStats.givenStats.count * 100).toFixed(1) : 0}%
                        </div>
                    ` : ''}
                </div>
                <div style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #2196f3;">
                    <h4 style="margin: 0 0 10px 0; color: #2196f3;">收到评价</h4>
                    <div style="font-size: 24px; font-weight: bold; color: #333; margin-bottom: 10px;">
                        ${evalStats?.totalEvaluationsReceived || 0}
                    </div>
                    ${evalStats?.receivedStats ? `
                        <div style="font-size: 12px; color: #666;">
                            平均评分: ${evalStats.receivedStats.averageOverallScore?.toFixed(2) || 'N/A'}<br>
                            有评论: ${evalStats.receivedStats.commentStats?.withComments || 0}<br>
                            评论率: ${evalStats.receivedStats.count > 0 ? ((evalStats.receivedStats.commentStats?.withComments || 0) / evalStats.receivedStats.count * 100).toFixed(1) : 0}%
                        </div>
                    ` : ''}
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 20px;">
                <div style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #ff9800;">
                    <h4 style="margin: 0 0 10px 0; color: #ff9800;">活跃度分数</h4>
                    <div style="font-size: 24px; font-weight: bold; color: #333;">
                        ${reportData.activity_score || 0}
                    </div>
                    <div style="font-size: 12px; color: #666;">评价活跃程度</div>
                </div>
                <div style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #9c27b0;">
                    <h4 style="margin: 0 0 10px 0; color: #9c27b0;">质量分数</h4>
                    <div style="font-size: 24px; font-weight: bold; color: #333;">
                        ${reportData.quality_score || 0}
                    </div>
                    <div style="font-size: 12px; color: #666;">评价质量水平</div>
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
            <h3 style="color: #1976d2; margin-bottom: 15px;">💰 积分历史 (最近10条)</h3>
            <div style="max-height: 300px; overflow-y: auto;">
                ${pointsHistory.slice(0, 10).map(log => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; margin: 5px 0; background: white; border-radius: 5px; border-left: 3px solid #1976d2;">
                        <div>
                            <div style="font-weight: bold;">${log.description || log.action_type}</div>
                            <div style="font-size: 12px; color: #666;">${new Date(log.timestamp * 1000).toLocaleString()}</div>
                        </div>
                        <div style="text-align: right;">
                            ${log.exp_change > 0 ? `<div style="color: #4caf50;">+${log.exp_change} EXP</div>` : ''}
                            ${log.points_change > 0 ? `<div style="color: #2196f3;">+${log.points_change} 积分</div>` : log.points_change < 0 ? `<div style="color: #f44336;">${log.points_change} 积分</div>` : ''}
                        </div>
                    </div>
                `).join('')}
                ${pointsHistory.length === 0 ? '<div style="text-align: center; color: #666; padding: 20px;">暂无积分历史记录</div>' : ''}
            </div>
        </div>
        
        <div style="margin-bottom: 15px; padding: 15px; background: #e3f2fd; border-radius: 8px;">
            <h3 style="color: #1976d2; margin-bottom: 10px;">ℹ️ 报告信息</h3>
            <p style="margin: 0; color: #666;">生成时间: ${new Date(reportData.report_generated_at).toLocaleString()}</p>
        </div>
    `;
    
    // 显示模态框
    modal.style.display = 'block';
}

// 加载评价趋势
async function loadEvaluationTrends() {
    try {
        const response = await fetch('/api/level/evaluation-trends');
        const result = await response.json();
        
        if (result.success && result.data) {
            displayEvaluationTrends(result.data);
        } else {
            showError('获取评价趋势失败：' + (result.error || '未知错误'));
        }
    } catch (error) {
        console.error('获取评价趋势失败:', error);
        showError('获取评价趋势失败');
    }
}

// 显示评价趋势
function displayEvaluationTrends(trends) {
    const container = document.getElementById('evaluation-trends');
    if (!container) {
        console.warn('找不到评价趋势容器');
        return;
    }
    
    container.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1976d2; margin-bottom: 20px;">📈 评价趋势分析</h3>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 20px;">
                <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <div style="font-size: 24px; font-weight: bold; color: #4caf50;">${trends.weekly_total}</div>
                    <div style="color: #666;">本周评价总数</div>
                </div>
                <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <div style="font-size: 24px; font-weight: bold; color: #2196f3;">${trends.monthly_total}</div>
                    <div style="color: #666;">本月评价总数</div>
                </div>
                <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <div style="font-size: 24px; font-weight: bold; color: #ff9800;">${trends.active_users_weekly}</div>
                    <div style="color: #666;">本周活跃用户</div>
                </div>
                <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <div style="font-size: 24px; font-weight: bold; color: #9c27b0;">${((trends.weekly_total / Math.max(trends.active_users_weekly, 1)) || 0).toFixed(1)}</div>
                    <div style="color: #666;">人均评价数</div>
                </div>
            </div>
            <h4 style="color: #1976d2; margin-bottom: 15px;">🏆 本周评价排行榜</h4>
            <div>
                ${trends.top_evaluators_weekly.map((user, index) => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; margin: 5px 0; background: #f8f9fa; border-radius: 5px;">
                        <div>
                            <span style="font-weight: bold; margin-right: 10px;">${index + 1}.</span>
                            用户${user.user_id}
                        </div>
                        <div style="color: #666;">
                            给出${user.evaluations_given} | 收到${user.evaluations_received}
                        </div>
                    </div>
                `).join('')}
                ${trends.top_evaluators_weekly.length === 0 ? '<div style="text-align: center; color: #666; padding: 20px;">暂无数据</div>' : ''}
            </div>
        </div>
    `;
}

// 导出增强排行榜函数到全局作用域
window.loadEnhancedRankings = loadEnhancedRankings;
window.viewUserEvaluationReport = viewUserEvaluationReport;
window.loadEvaluationTrends = loadEvaluationTrends;

// ==================== 里程碑管理功能 ====================

// 当前里程碑配置
let currentMilestoneConfig = null;

// 加载里程碑配置
async function loadMilestoneConfig() {
    try {
        const groupId = document.getElementById('milestoneGroupSelect')?.value || 'global';
        
        const response = await fetch(`/api/level/milestones?groupId=${groupId}`);
        const result = await response.json();
        
        if (result.success) {
            currentMilestoneConfig = result.data;
            renderMilestoneConfig(currentMilestoneConfig);
            loadMilestoneStats();
            console.log('✅ 里程碑配置加载成功');
        } else {
            showError('加载里程碑配置失败：' + result.error);
        }
    } catch (error) {
        console.error('加载里程碑配置失败:', error);
        showError('加载里程碑配置失败');
    }
}

// 渲染里程碑配置
function renderMilestoneConfig(config) {
    if (!config) return;
    
    // 更新系统开关
    document.getElementById('milestoneEnabled').checked = config.enabled;
    
    // 更新系统设置
    if (config.settings) {
        document.getElementById('milestoneAutoClaim').checked = config.settings.auto_claim;
        document.getElementById('milestoneBroadcast').checked = config.settings.broadcast_achievement;
        document.getElementById('milestoneAllowRepeat').checked = config.settings.allow_repeat;
        document.getElementById('milestoneCheckInterval').value = config.settings.check_interval;
    }
    
    // 渲染里程碑列表
    renderMilestoneList(config.milestones || []);
}

// 渲染里程碑列表
function renderMilestoneList(milestones) {
    const container = document.getElementById('milestonesContainer');
    if (!container) return;
    
    container.innerHTML = milestones.map((milestone, index) => `
        <div class="milestone-item" style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 24px;">${milestone.icon}</span>
                    <h4 style="margin: 0; color: #333;">${milestone.name}</h4>
                    <span style="background: ${milestone.enabled ? '#d4edda' : '#f8d7da'}; color: ${milestone.enabled ? '#155724' : '#721c24'}; padding: 2px 8px; border-radius: 12px; font-size: 12px;">
                        ${milestone.enabled ? '已启用' : '已禁用'}
                    </span>
                </div>
                <button class="btn btn-danger" onclick="removeMilestone(${index})" style="padding: 5px 10px; font-size: 12px;">删除</button>
            </div>
            
            <div class="form-grid">
                <div class="form-group">
                    <label>里程碑ID：</label>
                    <input type="text" value="${milestone.id}" onchange="updateMilestone(${index}, 'id', this.value)" placeholder="例如：milestone_100">
                </div>
                <div class="form-group">
                    <label>里程碑名称：</label>
                    <input type="text" value="${milestone.name}" onchange="updateMilestone(${index}, 'name', this.value)" placeholder="例如：积分新手">
                </div>
                <div class="form-group">
                    <label>图标：</label>
                    <input type="text" value="${milestone.icon}" onchange="updateMilestone(${index}, 'icon', this.value)" placeholder="🎯" style="width: 60px;">
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" ${milestone.enabled ? 'checked' : ''} onchange="updateMilestone(${index}, 'enabled', this.checked)">
                        启用此里程碑
                    </label>
                </div>
            </div>
            
            <div class="form-group">
                <label>描述：</label>
                <textarea rows="2" onchange="updateMilestone(${index}, 'description', this.value)" placeholder="例如：累计获得100积分">${milestone.description || ''}</textarea>
            </div>
            
            <div class="form-grid">
                <div class="form-group">
                    <label>所需积分：</label>
                    <input type="number" value="${milestone.required_points}" onchange="updateMilestone(${index}, 'required_points', parseInt(this.value))" min="1" placeholder="100">
                </div>
                <div class="form-group">
                    <label>奖励类型：</label>
                    <select onchange="updateMilestone(${index}, 'reward_type', this.value); updateMilestoneRewardForm(${index})">
                        <option value="points" ${milestone.reward_type === 'points' ? 'selected' : ''}>积分奖励</option>
                        <option value="exp" ${milestone.reward_type === 'exp' ? 'selected' : ''}>经验奖励</option>
                        <option value="mixed" ${milestone.reward_type === 'mixed' ? 'selected' : ''}>混合奖励</option>
                        <option value="badge" ${milestone.reward_type === 'badge' ? 'selected' : ''}>勋章奖励</option>
                    </select>
                </div>
            </div>
            
            <div id="milestoneRewardForm_${index}" class="milestone-reward-form">
                ${renderMilestoneRewardForm(milestone, index)}
            </div>
        </div>
    `).join('');
}

// 渲染里程碑奖励表单
function renderMilestoneRewardForm(milestone, index) {
    switch (milestone.reward_type) {
        case 'points':
            return `
                <div class="form-group">
                    <label>奖励积分：</label>
                    <input type="number" value="${milestone.reward_amount || 0}" onchange="updateMilestone(${index}, 'reward_amount', parseInt(this.value))" min="0" placeholder="20">
                </div>
                <div class="form-group">
                    <label>奖励描述：</label>
                    <input type="text" value="${milestone.reward_description || ''}" onchange="updateMilestone(${index}, 'reward_description', this.value)" placeholder="奖励20积分">
                </div>
            `;
        case 'exp':
            return `
                <div class="form-group">
                    <label>奖励经验：</label>
                    <input type="number" value="${milestone.reward_amount || 0}" onchange="updateMilestone(${index}, 'reward_amount', parseInt(this.value))" min="0" placeholder="50">
                </div>
                <div class="form-group">
                    <label>奖励描述：</label>
                    <input type="text" value="${milestone.reward_description || ''}" onchange="updateMilestone(${index}, 'reward_description', this.value)" placeholder="奖励50经验">
                </div>
            `;
        case 'mixed':
            return `
                <div class="form-grid">
                    <div class="form-group">
                        <label>奖励积分：</label>
                        <input type="number" value="${milestone.reward_amount || 0}" onchange="updateMilestone(${index}, 'reward_amount', parseInt(this.value))" min="0" placeholder="100">
                    </div>
                    <div class="form-group">
                        <label>奖励经验：</label>
                        <input type="number" value="${milestone.extra_exp || 0}" onchange="updateMilestone(${index}, 'extra_exp', parseInt(this.value))" min="0" placeholder="50">
                    </div>
                </div>
                <div class="form-group">
                    <label>奖励描述：</label>
                    <input type="text" value="${milestone.reward_description || ''}" onchange="updateMilestone(${index}, 'reward_description', this.value)" placeholder="奖励100积分+50经验">
                </div>
            `;
        case 'badge':
            return `
                <div class="form-group">
                    <label>勋章ID：</label>
                    <input type="text" value="${milestone.badge_reward || ''}" onchange="updateMilestone(${index}, 'badge_reward', this.value)" placeholder="legend_milestone">
                </div>
                <div class="form-group">
                    <label>奖励描述：</label>
                    <input type="text" value="${milestone.reward_description || ''}" onchange="updateMilestone(${index}, 'reward_description', this.value)" placeholder="专属勋章">
                </div>
            `;
        default:
            return '';
    }
}

// 更新里程碑奖励表单
function updateMilestoneRewardForm(index) {
    const milestone = currentMilestoneConfig.milestones[index];
    const formContainer = document.getElementById(`milestoneRewardForm_${index}`);
    if (formContainer) {
        formContainer.innerHTML = renderMilestoneRewardForm(milestone, index);
    }
}

// 更新里程碑配置
function updateMilestone(index, field, value) {
    if (!currentMilestoneConfig || !currentMilestoneConfig.milestones[index]) return;
    
    currentMilestoneConfig.milestones[index][field] = value;
    console.log(`更新里程碑 ${index} 的 ${field} 为:`, value);
}

// 添加里程碑
function addMilestone() {
    if (!currentMilestoneConfig) {
        currentMilestoneConfig = {
            enabled: true,
            milestones: [],
            settings: {
                auto_claim: true,
                broadcast_achievement: true,
                allow_repeat: false,
                check_interval: 'immediate'
            }
        };
    }
    
    const newMilestone = {
        id: `milestone_${Date.now()}`,
        name: '新里程碑',
        description: '请设置里程碑描述',
        required_points: 100,
        reward_type: 'points',
        reward_amount: 20,
        reward_description: '奖励20积分',
        icon: '🎯',
        enabled: true
    };
    
    currentMilestoneConfig.milestones.push(newMilestone);
    renderMilestoneList(currentMilestoneConfig.milestones);
}

// 删除里程碑
function removeMilestone(index) {
    if (!currentMilestoneConfig || !currentMilestoneConfig.milestones[index]) return;
    
    if (confirm('确定要删除这个里程碑吗？')) {
        currentMilestoneConfig.milestones.splice(index, 1);
        renderMilestoneList(currentMilestoneConfig.milestones);
    }
}

// 切换里程碑系统
function toggleMilestoneSystem() {
    if (!currentMilestoneConfig) return;
    
    currentMilestoneConfig.enabled = document.getElementById('milestoneEnabled').checked;
    console.log('里程碑系统状态:', currentMilestoneConfig.enabled);
}

// 保存里程碑配置
async function saveMilestoneConfig() {
    if (!currentMilestoneConfig) {
        showError('没有可保存的配置');
        return;
    }
    
    try {
        // 更新系统设置
        currentMilestoneConfig.settings = {
            auto_claim: document.getElementById('milestoneAutoClaim').checked,
            broadcast_achievement: document.getElementById('milestoneBroadcast').checked,
            allow_repeat: document.getElementById('milestoneAllowRepeat').checked,
            check_interval: document.getElementById('milestoneCheckInterval').value
        };
        
        const groupId = document.getElementById('milestoneGroupSelect')?.value || 'global';
        
        const response = await fetch('/api/level/milestones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                groupId: groupId,
                config: currentMilestoneConfig
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('里程碑配置保存成功');
            loadMilestoneStats(); // 重新加载统计
        } else {
            showError('保存里程碑配置失败：' + result.error);
        }
    } catch (error) {
        console.error('保存里程碑配置失败:', error);
        showError('保存里程碑配置失败');
    }
}

// 重置里程碑配置
async function resetMilestoneConfig() {
    if (!confirm('确定要重置为默认里程碑配置吗？这将覆盖当前的所有设置。')) {
        return;
    }
    
    try {
        // 获取默认配置
        const response = await fetch('/api/level/milestones?groupId=default');
        const result = await response.json();
        
        if (result.success) {
            currentMilestoneConfig = result.data;
            renderMilestoneConfig(currentMilestoneConfig);
            showSuccess('已重置为默认配置，请保存以应用更改');
        } else {
            showError('重置配置失败：' + result.error);
        }
    } catch (error) {
        console.error('重置配置失败:', error);
        showError('重置配置失败');
    }
}

// 加载里程碑统计
async function loadMilestoneStats() {
    try {
        const groupId = document.getElementById('milestoneGroupSelect')?.value || 'global';
        
        const response = await fetch(`/api/level/milestone-stats?groupId=${groupId}`);
        const result = await response.json();
        
        if (result.success) {
            const stats = result.data;
            
            // 更新统计卡片
            document.getElementById('totalMilestones').textContent = stats.total_milestones || 0;
            document.getElementById('enabledMilestones').textContent = stats.enabled_milestones || 0;
            document.getElementById('totalAchievements').textContent = 
                Object.values(stats.milestone_achievements || {}).reduce((sum, m) => sum + m.achievement_count, 0);
            document.getElementById('participatingUsers').textContent = 
                new Set(stats.recent_achievements?.map(a => a.user_id) || []).size;
            
            // 显示最近达成记录
            renderRecentAchievements(stats.recent_achievements || []);
            
            console.log('✅ 里程碑统计加载成功');
        } else {
            showError('加载里程碑统计失败：' + result.error);
        }
    } catch (error) {
        console.error('加载里程碑统计失败:', error);
        showError('加载里程碑统计失败');
    }
}

// 渲染最近达成记录
function renderRecentAchievements(achievements) {
    const container = document.getElementById('recentAchievements');
    if (!container) return;
    
    if (achievements.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #666;">
                <p>暂无里程碑达成记录</p>
                <small>用户达成里程碑后将在此显示</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <table class="config-table">
            <thead>
                <tr>
                    <th>用户</th>
                    <th>里程碑</th>
                    <th>奖励</th>
                    <th>达成时间</th>
                </tr>
            </thead>
            <tbody>
                ${achievements.map(achievement => `
                    <tr>
                        <td>${achievement.display_name || `用户${achievement.user_id}`}</td>
                        <td>${achievement.milestone_name}</td>
                        <td>
                            ${achievement.reward_type === 'points' ? `${achievement.reward_amount}积分` : 
                              achievement.reward_type === 'exp' ? `${achievement.reward_amount}经验` :
                              achievement.reward_type === 'mixed' ? `${achievement.reward_amount}积分+${achievement.extra_exp}经验` :
                              '勋章奖励'}
                        </td>
                        <td>${new Date(achievement.achieved_at * 1000).toLocaleString()}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// 修改原有的switchTab函数以支持里程碑标签页
const originalSwitchTab = switchTab;
switchTab = function(tabName) {
    originalSwitchTab(tabName);
    
    if (tabName === 'milestones') {
        loadMilestoneConfig();
    }
};

// 导出里程碑管理函数到全局作用域
window.loadMilestoneConfig = loadMilestoneConfig;
window.addMilestone = addMilestone;
window.removeMilestone = removeMilestone;
window.updateMilestone = updateMilestone;
window.updateMilestoneRewardForm = updateMilestoneRewardForm;
window.toggleMilestoneSystem = toggleMilestoneSystem;
window.saveMilestoneConfig = saveMilestoneConfig;
window.resetMilestoneConfig = resetMilestoneConfig;
window.loadMilestoneStats = loadMilestoneStats;