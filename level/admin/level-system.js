// 等级系统管理界面JavaScript

// 全局变量
let currentPage = 1;
let pageSize = 20;
let levelChart = null;
let allUsers = [];
let allBadges = [];

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查等级系统是否启用
    checkLevelSystemStatus();
    
    // 加载统计数据
    loadStats();
    
    // 初始化标签页
    initTabs();
    
    // 加载用户列表
    loadUsers();
    
    // 初始化搜索
    initSearch();
});

// 检查等级系统状态
async function checkLevelSystemStatus() {
    try {
        const response = await fetch('/api/level/stats');
        if (!response.ok) {
            const error = await response.json();
            if (error.error === '等级系统未启用') {
                showError('等级系统未启用，请在环境变量中设置 LEVEL_SYSTEM_ENABLED=true');
                document.querySelector('.level-container').style.opacity = '0.5';
            }
        }
    } catch (error) {
        console.error('检查等级系统状态失败:', error);
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
            document.getElementById('activeUsers').textContent = stats.activeUsers || 0;
            document.getElementById('totalBadges').textContent = stats.totalBadges || 0;
            document.getElementById('totalBadgesUnlocked').textContent = stats.totalBadgesUnlocked || 0;
            
            // 绘制等级分布图表
            drawLevelChart(stats.levelDistribution || []);
            
            // 更新排行榜
            updateRanking(stats.topUsers || []);
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
        showError('加载统计数据失败');
    }
}

// 绘制等级分布图表
function drawLevelChart(distribution) {
    const ctx = document.getElementById('levelChart').getContext('2d');
    
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
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
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
        case 'badges':
            loadBadges();
            break;
        case 'config':
            loadConfig();
            break;
        case 'ranking':
            loadStats(); // 重新加载统计数据以更新排行榜
            break;
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
    document.getElementById('createBadgeForm').reset();
    document.getElementById('createBadgeModal').style.display = 'block';
}

// 创建勋章
async function createBadge() {
    const data = {
        badge_id: document.getElementById('badgeId').value,
        badge_name: document.getElementById('badgeName').value,
        badge_emoji: document.getElementById('badgeEmoji').value || '🏅',
        badge_desc: document.getElementById('badgeDesc').value,
        rarity: document.getElementById('badgeRarity').value,
        unlock_conditions: {} // TODO: 添加解锁条件配置
    };
    
    try {
        const response = await fetch('/api/level/badges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('勋章创建成功');
            closeModal('createBadgeModal');
            loadBadges();
            loadStats(); // 重新加载统计数据
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
    const tbody = document.getElementById('rankingTableBody');
    
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