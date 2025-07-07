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
    
    console.log('✅ 等级系统管理界面初始化完成');
});

// 检查等级系统状态
async function checkLevelSystemStatus() {
    console.log('🔍 检查等级系统状态...');
    try {
        const response = await fetch('/api/level/stats');
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
        const response = await fetch('/api/level/stats');
        const result = await response.json();
        
        if (result.success) {
            const stats = result.data;
            
            // 更新统计卡片
            document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
            document.getElementById('totalPoints').textContent = stats.totalBadgesUnlocked || 0;
            document.getElementById('avgLevel').textContent = stats.avgLevel || '-';
            document.getElementById('totalBadges').textContent = stats.totalBadges || 0;
            
            // 绘制等级分布图表
            drawLevelChart(stats.levelDistribution || []);
            
            // 更新排行榜
            updateRanking(stats.topUsers || []);
            
            console.log('✅ 统计数据加载成功:', stats);
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
    
    // 加载对应内容
    switch(tabName) {
        case 'users':
            loadUsers();
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
        // 加载群组列表
        const response = await fetch('/api/level/groups');
        const result = await response.json();
        
        if (result.success) {
            const groups = result.data;
            
            // 更新群组选择器
            const selectors = ['levelGroupSelect', 'sourceGroup'];
            selectors.forEach(id => {
                const select = document.getElementById(id);
                if (select) {
                    select.innerHTML = groups.map(g => 
                        `<option value="${g.group_id}">${g.group_name || g.group_id}</option>`
                    ).join('');
                }
            });
            
            // 保存群组配置
            groups.forEach(g => {
                groupConfigs[g.group_id] = g;
            });
        }
    } catch (error) {
        console.error('加载初始数据失败:', error);
    }
}

// 加载用户列表
async function loadUsers(page = 1) {
    try {
        const offset = (page - 1) * pageSize;
        const response = await fetch(`/api/level/users?limit=${pageSize}&offset=${offset}`);
        const result = await response.json();
        
        if (result.success) {
            allUsers = result.data.users;
            renderUserTable(allUsers);
            renderPagination(result.data.total, page);
        }
    } catch (error) {
        console.error('加载用户列表失败:', error);
        showError('加载用户列表失败');
    }
}

// 渲染用户表格
function renderUserTable(users) {
    const tbody = document.getElementById('userTableBody');
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.user_id}</td>
            <td>${user.display_name}</td>
            <td><span class="level-badge level-${user.level}">Lv.${user.level}</span></td>
            <td>${user.total_exp}</td>
            <td>${user.available_points}</td>
            <td>${user.user_eval_count}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-sm btn-primary" onclick="editUser('${user.user_id}')">编辑</button>
                    <button class="btn-sm btn-success" onclick="viewUserBadges('${user.user_id}')">勋章</button>
                </div>
            </td>
        </tr>
    `).join('');
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
        const response = await fetch(`/api/level/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('用户信息更新成功');
            closeModal('editUserModal');
            loadUsers(currentPage);
            loadStats(); // 重新加载统计数据
        } else {
            showError(result.error || '更新失败');
        }
    } catch (error) {
        console.error('保存用户编辑失败:', error);
        showError('保存失败');
    }
}

// 查看用户勋章
async function viewUserBadges(userId) {
    try {
        const response = await fetch(`/api/level/users/${userId}`);
        const result = await response.json();
        
        if (result.success) {
            const userInfo = result.data;
            // TODO: 显示用户勋章详情
            alert(`用户 ${userInfo.profile.display_name} 的勋章功能开发中...`);
        }
    } catch (error) {
        console.error('获取用户勋章失败:', error);
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
        container.innerHTML = '<div style="text-align: center; padding: 40px;">暂无勋章</div>';
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
        mythic: '神话',
        legendary: '传说',
        epic: '史诗',
        rare: '稀有',
        common: '普通'
    };
    
    for (const [rarity, badgeList] of Object.entries(grouped)) {
        if (badgeList.length === 0) continue;
        
        html += `<div style="margin-bottom: 30px;">`;
        html += `<h3>${rarityNames[rarity]}</h3>`;
        html += `<div>`;
        
        badgeList.forEach(badge => {
            html += `<span class="badge-item badge-rarity-${rarity}">`;
            html += `${badge.badge_emoji} ${badge.badge_name}`;
            html += `</span>`;
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
            loadBadges();
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

// 更新排行榜
function updateRanking(topUsers) {
    const tbody = document.getElementById('userRankingBody');
    
    if (topUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = topUsers.map((user, index) => {
        const rank = index + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
        
        return `
            <tr>
                <td>${medal}</td>
                <td>${user.display_name}</td>
                <td><span class="level-badge level-${user.level}">Lv.${user.level}</span></td>
                <td>${user.total_exp}</td>
                <td>${user.user_eval_count}</td>
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

// ==================== 缺失的配置管理函数 ====================

// 删除等级行（需要密码验证）
async function removeLevelRowWithPassword(index, adminPassword) {
    const groupId = document.getElementById('levelGroupSelect').value || 'default';
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
    
    const groupId = document.getElementById('levelGroupSelect').value || 'default';
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
    const groupId = document.getElementById('levelGroupSelect').value || 'default';
    
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
    const groupId = currentGroupId || 'default';
    
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
    const groupId = currentGroupId || 'default';
    
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
    const groupId = document.getElementById('levelGroupSelect').value || 'default';
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
    const groupId = document.getElementById('levelGroupSelect').value || 'default';
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
    
    if (!groupId || !groupName) {
        showError('请填写完整的群组信息');
        return;
    }
    
    try {
        const response = await fetch('/api/level/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                groupId: groupId,
                groupName: groupName
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('群组创建成功');
            closeModal('createGroupModal');
            loadGroups();
        } else {
            showError(result.error || '创建失败');
        }
    } catch (error) {
        console.error('创建群组失败:', error);
        showError('创建失败');
    }
}

// 加载群组列表
async function loadGroups() {
    try {
        const response = await fetch('/api/level/groups');
        const result = await response.json();
        
        if (result.success) {
            const tbody = document.getElementById('groupsTableBody');
            if (result.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">暂无群组</td></tr>';
            } else {
                tbody.innerHTML = result.data.map(group => `
                    <tr>
                        <td>${group.group_id}</td>
                        <td>${group.group_name || '-'}</td>
                        <td>-</td>
                        <td>活跃</td>
                        <td>
                            <button class="btn btn-primary" onclick="editGroupConfig('${group.group_id}')">配置</button>
                            <button class="btn btn-danger" onclick="deleteGroup('${group.group_id}')">删除</button>
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
    showError('群组配置编辑功能暂未实现');
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
            loadStats();
            loadUsers();
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

// 授予勋章
async function awardBadge() {
    showError('勋章授予功能暂未实现');
}

// 保存奖励配置
async function saveRewardsConfig() {
    showError('奖励配置保存功能暂未实现');
}

// 保存播报配置
async function saveBroadcastConfig() {
    showError('播报配置保存功能暂未实现');
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
    showError('数据管理功能暂未实现');
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
        // 清除缓存
        groupConfigs = {};
        allUsers = [];
        allBadges = [];
        
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

// 确认管理员操作
window.confirmAdminAction = confirmAdminAction;
window.refreshAllData = refreshAllData;
window.manualRefresh = manualRefresh;