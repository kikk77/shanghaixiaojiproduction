/**
 * 频道管理前端脚本
 * 处理频道克隆配置的所有前端交互逻辑
 */

// 全局变量
let allConfigs = [];
let currentEditingConfig = null;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('📺 频道管理页面初始化');
    initializePage();
});

// 初始化页面
async function initializePage() {
    try {
        await loadInitialData();
        setupEventListeners();
    } catch (error) {
        console.error('页面初始化失败:', error);
        showError('页面初始化失败，请刷新重试');
    }
}

// 加载初始数据
async function loadInitialData() {
    await Promise.all([
        loadStats(),
        loadConfigs()
    ]);
}

// 设置事件监听器
function setupEventListeners() {
    // 表单提交
    const configForm = document.getElementById('configForm');
    if (configForm) {
        configForm.addEventListener('submit', handleConfigSubmit);
    }

    // 模态框点击外部关闭
    window.addEventListener('click', function(event) {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    // 键盘事件
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeAllModals();
        }
    });
}

// API请求封装
async function apiRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const mergedOptions = { ...defaultOptions, ...options };

    try {
        const response = await fetch(url, mergedOptions);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('API请求失败:', error);
        throw error;
    }
}

// 加载统计信息
async function loadStats() {
    try {
        const [configStats, queueStats, cloneStats, systemStats] = await Promise.all([
            apiRequest('/api/channel/stats/configs'),
            apiRequest('/api/channel/stats/queue'),
            apiRequest('/api/channel/stats/clone'),
            apiRequest('/api/channel/stats/system')
        ]);

        updateStatsDisplay({
            totalConfigs: configStats.data?.total || 0,
            enabledConfigs: configStats.data?.enabled || 0,
            todayCloned: cloneStats.data?.totalCloned || 0,
            queueTasks: queueStats.data?.pendingTasks || 0
        });

    } catch (error) {
        console.warn('加载统计信息失败:', error);
        // 即使统计加载失败也不影响主要功能
        updateStatsDisplay({
            totalConfigs: '-',
            enabledConfigs: '-',
            todayCloned: '-',
            queueTasks: '-'
        });
    }
}

// 更新统计显示
function updateStatsDisplay(stats) {
    const elements = {
        totalConfigs: document.getElementById('totalConfigs'),
        enabledConfigs: document.getElementById('enabledConfigs'),
        todayCloned: document.getElementById('todayCloned'),
        queueTasks: document.getElementById('queueTasks')
    };

    Object.keys(elements).forEach(key => {
        if (elements[key]) {
            elements[key].textContent = stats[key];
        }
    });
}

// 加载配置列表
async function loadConfigs() {
    const configsList = document.getElementById('configsList');
    
    try {
        configsList.innerHTML = '<div class="loading">加载配置中...</div>';
        
        const response = await apiRequest('/api/channel/configs');
        allConfigs = response.data || [];
        
        displayConfigs(allConfigs);
        updateConfigFilter();
        
    } catch (error) {
        console.error('加载配置失败:', error);
        configsList.innerHTML = `<div class="error">加载配置失败: ${error.message}</div>`;
    }
}

// 显示配置列表
function displayConfigs(configs) {
    const configsList = document.getElementById('configsList');
    
    if (configs.length === 0) {
        configsList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <h3>暂无配置</h3>
                <p>点击"新建配置"开始创建第一个频道克隆配置</p>
            </div>
        `;
        return;
    }

    const configsHtml = configs.map(config => createConfigCard(config)).join('');
    configsList.innerHTML = configsHtml;
}

// 创建配置卡片HTML
function createConfigCard(config) {
    const statusClass = config.settings.enabled ? 
        (config.status === 'active' ? 'status-running' : 'status-stopped') : 
        'status-disabled';
    
    const statusText = config.settings.enabled ? 
        (config.status === 'active' ? '运行中' : '已停止') : 
        '已禁用';

    return `
        <div class="config-card">
            <div class="config-info">
                <div class="config-details">
                    <h3>
                        ${escapeHtml(config.name)}
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </h3>
                    
                    <div class="config-meta">
                        <div class="meta-item">
                            <span class="label">源频道</span>
                            <div class="value">${config.sourceChannel.id}</div>
                        </div>
                        <div class="meta-item">
                            <span class="label">目标频道</span>
                            <div class="value">${config.targetChannel.id}</div>
                        </div>
                        <div class="meta-item">
                            <span class="label">速率限制</span>
                            <div class="value">${config.settings.rateLimit}/分钟</div>
                        </div>
                        <div class="meta-item">
                            <span class="label">创建时间</span>
                            <div class="value">${formatDate(config.createdAt)}</div>
                        </div>
                    </div>

                    <div style="margin-top: 10px;">
                        <small style="color: #666;">
                            同步编辑: ${config.settings.syncEdits ? '✅' : '❌'} | 
                            内容过滤: ${config.settings.filterEnabled ? '✅' : '❌'}
                        </small>
                    </div>
                </div>

                <div class="config-actions">
                    <button class="btn btn-primary" onclick="editConfig('${config.name}')">
                        ✏️ 编辑
                    </button>
                    <button class="btn ${config.settings.enabled ? 'btn-warning' : 'btn-success'}" 
                            onclick="toggleConfig('${config.name}', ${!config.settings.enabled})">
                        ${config.settings.enabled ? '⏸️ 禁用' : '▶️ 启用'}
                    </button>
                    <button class="btn btn-secondary" onclick="testConfig('${config.name}')">
                        🔍 测试
                    </button>
                    <button class="btn btn-danger" onclick="confirmDeleteConfig('${config.name}')">
                        🗑️ 删除
                    </button>
                </div>
            </div>
        </div>
    `;
}

// 过滤配置
function filterConfigs() {
    const searchBox = document.getElementById('searchBox');
    const searchTerm = searchBox.value.toLowerCase();
    
    if (!searchTerm) {
        displayConfigs(allConfigs);
        return;
    }

    const filteredConfigs = allConfigs.filter(config => 
        config.name.toLowerCase().includes(searchTerm) ||
        config.sourceChannel.id.includes(searchTerm) ||
        config.targetChannel.id.includes(searchTerm)
    );

    displayConfigs(filteredConfigs);
}

// 显示创建配置模态框
function showCreateModal() {
    currentEditingConfig = null;
    
    // 重置表单
    document.getElementById('configForm').reset();
    document.getElementById('modalTitle').textContent = '新建频道配置';
    
    // 设置默认值
    document.getElementById('enabled').checked = true;
    document.getElementById('syncEdits').checked = true;
    document.getElementById('filterEnabled').checked = false;
    document.getElementById('rateLimit').value = 30;
    
    showModal('configModal');
}

// 编辑配置
function editConfig(configName) {
    const config = allConfigs.find(c => c.name === configName);
    if (!config) {
        showError('配置不存在');
        return;
    }

    currentEditingConfig = configName;
    
    // 填充表单
    document.getElementById('configName').value = config.name;
    document.getElementById('sourceChannelId').value = config.sourceChannel.id;
    document.getElementById('targetChannelId').value = config.targetChannel.id;
    document.getElementById('enabled').checked = config.settings.enabled;
    document.getElementById('syncEdits').checked = config.settings.syncEdits;
    document.getElementById('filterEnabled').checked = config.settings.filterEnabled;
    document.getElementById('rateLimit').value = config.settings.rateLimit;
    
    document.getElementById('modalTitle').textContent = '编辑频道配置';
    showModal('configModal');
}

// 处理配置表单提交
async function handleConfigSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    const configData = {
        name: formData.get('name'),
        sourceChannelId: formData.get('sourceChannelId'),
        targetChannelId: formData.get('targetChannelId'),
        enabled: formData.has('enabled'),
        syncEdits: formData.has('syncEdits'),
        filterEnabled: formData.has('filterEnabled'),
        rateLimit: parseInt(formData.get('rateLimit'))
    };

    // 验证表单数据
    const validation = validateConfigData(configData);
    if (!validation.valid) {
        showError(validation.errors.join('\n'));
        return;
    }

    try {
        showLoading('保存配置中...');
        
        const response = await apiRequest('/api/channel/configs', {
            method: 'POST',
            body: JSON.stringify(configData)
        });

        if (response.success) {
            showSuccess(currentEditingConfig ? '配置更新成功' : '配置创建成功');
            closeModal('configModal');
            await refreshData();
        } else {
            showError(response.errors ? response.errors.join('\n') : '保存失败');
        }
        
    } catch (error) {
        console.error('保存配置失败:', error);
        showError(`保存失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// 切换配置状态
async function toggleConfig(configName, enabled) {
    try {
        showLoading(enabled ? '启用配置中...' : '禁用配置中...');
        
        const response = await apiRequest(`/api/channel/configs/${configName}/toggle`, {
            method: 'POST',
            body: JSON.stringify({ enabled })
        });

        if (response.success) {
            showSuccess(enabled ? '配置已启用' : '配置已禁用');
            await refreshData();
        } else {
            showError(response.error || '操作失败');
        }
        
    } catch (error) {
        console.error('切换配置状态失败:', error);
        showError(`操作失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// 测试配置
async function testConfig(configName) {
    try {
        showLoading('测试配置中...');
        
        const response = await apiRequest(`/api/channel/configs/${configName}/test`, {
            method: 'POST'
        });

        if (response.success) {
            const results = response.results;
            let message = '配置测试完成:\n\n';
            
            message += `源频道: ${results.sourceChannel.accessible ? '✅ 可访问' : '❌ 无法访问'}\n`;
            message += `目标频道: ${results.targetChannel.accessible ? '✅ 可访问' : '❌ 无法访问'}\n`;
            message += `Bot权限: ${results.permissions?.valid ? '✅ 权限充足' : '❌ 权限不足'}\n`;
            
            if (!response.success) {
                message += '\n⚠️ 发现问题，请检查配置';
            }
            
            alert(message);
        } else {
            showError(response.error || '测试失败');
        }
        
    } catch (error) {
        console.error('测试配置失败:', error);
        showError(`测试失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// 确认删除配置
function confirmDeleteConfig(configName) {
    if (confirm(`确定要删除配置"${configName}"吗？\n\n此操作不可撤销！`)) {
        deleteConfig(configName);
    }
}

// 删除配置
async function deleteConfig(configName) {
    try {
        showLoading('删除配置中...');
        
        const response = await apiRequest(`/api/channel/configs/${configName}`, {
            method: 'DELETE'
        });

        if (response.success) {
            showSuccess('配置删除成功');
            await refreshData();
        } else {
            showError(response.error || '删除失败');
        }
        
    } catch (error) {
        console.error('删除配置失败:', error);
        showError(`删除失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// 显示服务管理模态框
async function showServiceModal() {
    showModal('serviceModal');
    await loadServiceStatus();
}

// 加载服务状态
async function loadServiceStatus() {
    const statusDiv = document.getElementById('serviceStatus');
    
    try {
        statusDiv.innerHTML = '<div class="loading">获取服务状态中...</div>';
        
        const response = await apiRequest('/api/channel/service/status');
        
        if (response.success) {
            const data = response.data;
            statusDiv.innerHTML = `
                <div class="config-meta">
                    <div class="meta-item">
                        <span class="label">队列服务</span>
                        <div class="value">${data.queueService.running ? '✅ 运行中' : '❌ 已停止'}</div>
                    </div>
                    <div class="meta-item">
                        <span class="label">待处理任务</span>
                        <div class="value">${data.queueService.pendingTasks}</div>
                    </div>
                    <div class="meta-item">
                        <span class="label">已克隆消息</span>
                        <div class="value">${data.cloneService.totalCloned}</div>
                    </div>
                    <div class="meta-item">
                        <span class="label">错误次数</span>
                        <div class="value">${data.cloneService.totalErrors}</div>
                    </div>
                </div>
            `;
        } else {
            statusDiv.innerHTML = `<div class="error">获取服务状态失败: ${response.error}</div>`;
        }
        
    } catch (error) {
        console.error('获取服务状态失败:', error);
        statusDiv.innerHTML = `<div class="error">获取服务状态失败: ${error.message}</div>`;
    }
}

// 启动服务
async function startService() {
    try {
        showLoading('启动服务中...');
        
        const response = await apiRequest('/api/channel/service/start', {
            method: 'POST'
        });

        if (response.success) {
            showSuccess('服务启动成功');
            await loadServiceStatus();
        } else {
            showError(response.error || '启动失败');
        }
        
    } catch (error) {
        console.error('启动服务失败:', error);
        showError(`启动失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// 停止服务
async function stopService() {
    try {
        showLoading('停止服务中...');
        
        const response = await apiRequest('/api/channel/service/stop', {
            method: 'POST'
        });

        if (response.success) {
            showSuccess('服务停止成功');
            await loadServiceStatus();
        } else {
            showError(response.error || '停止失败');
        }
        
    } catch (error) {
        console.error('停止服务失败:', error);
        showError(`停止失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// 重新加载服务
async function reloadService() {
    try {
        showLoading('重新加载服务中...');
        
        const response = await apiRequest('/api/channel/service/reload', {
            method: 'POST'
        });

        if (response.success) {
            showSuccess('服务重新加载成功');
            await loadServiceStatus();
            await refreshData();
        } else {
            showError(response.error || '重新加载失败');
        }
        
    } catch (error) {
        console.error('重新加载服务失败:', error);
        showError(`重新加载失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// 清空队列
async function clearQueue() {
    if (!confirm('确定要清空所有队列任务吗？\n\n此操作不可撤销！')) {
        return;
    }

    try {
        showLoading('清空队列中...');
        
        const response = await apiRequest('/api/channel/queue/clear', {
            method: 'POST'
        });

        if (response.success) {
            showSuccess(`队列清空成功，删除了 ${response.clearedCount} 个任务`);
            await loadServiceStatus();
            await loadStats();
        } else {
            showError(response.error || '清空失败');
        }
        
    } catch (error) {
        console.error('清空队列失败:', error);
        showError(`清空失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// 显示日志模态框
async function showLogsModal() {
    showModal('logsModal');
    await loadLogs();
}

// 加载日志
async function loadLogs() {
    const logsList = document.getElementById('logsList');
    
    try {
        logsList.innerHTML = '<div class="loading">加载日志中...</div>';
        
        const configFilter = document.getElementById('logConfigFilter').value;
        const params = new URLSearchParams();
        if (configFilter) params.append('configId', configFilter);
        params.append('limit', '50');
        
        const response = await apiRequest(`/api/channel/logs?${params.toString()}`);
        
        if (response.success) {
            const logs = response.data;
            displayLogs(logs);
        } else {
            logsList.innerHTML = `<div class="error">加载日志失败: ${response.error}</div>`;
        }
        
    } catch (error) {
        console.error('加载日志失败:', error);
        logsList.innerHTML = `<div class="error">加载日志失败: ${error.message}</div>`;
    }
}

// 显示日志
function displayLogs(logs) {
    const logsList = document.getElementById('logsList');
    
    if (logs.length === 0) {
        logsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">暂无日志</div>';
        return;
    }

    const logsHtml = logs.map(log => `
        <div class="config-card" style="padding: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <strong>${escapeHtml(log.action)}</strong>
                <span class="status-badge ${log.isSuccess ? 'status-running' : 'status-stopped'}">
                    ${log.isSuccess ? '成功' : '失败'}
                </span>
            </div>
            
            ${log.errorMessage ? `<div style="color: #dc3545; margin-bottom: 10px;">${escapeHtml(log.errorMessage)}</div>` : ''}
            
            <div style="font-size: 12px; color: #666;">
                时间: ${formatDate(log.createdAt)} | 
                耗时: ${log.duration} | 
                配置ID: ${log.configId || 'N/A'}
            </div>
        </div>
    `).join('');

    logsList.innerHTML = logsHtml;
}

// 更新配置过滤器
function updateConfigFilter() {
    const select = document.getElementById('logConfigFilter');
    if (!select) return;
    
    select.innerHTML = '<option value="">所有配置</option>';
    
    allConfigs.forEach(config => {
        const option = document.createElement('option');
        option.value = config.id;
        option.textContent = config.name;
        select.appendChild(option);
    });
}

// 导出配置
async function exportConfigs() {
    try {
        showLoading('导出配置中...');
        
        const response = await apiRequest('/api/channel/export', {
            method: 'POST',
            body: JSON.stringify({})
        });

        if (response.success) {
            const blob = new Blob([JSON.stringify(response.data, null, 2)], { 
                type: 'application/json' 
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `channel-configs-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            showSuccess('配置导出成功');
        } else {
            showError(response.error || '导出失败');
        }
        
    } catch (error) {
        console.error('导出配置失败:', error);
        showError(`导出失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// 导入配置
async function importConfigs(input) {
    const file = input.files[0];
    if (!file) return;

    try {
        showLoading('导入配置中...');
        
        const text = await file.text();
        const importData = JSON.parse(text);
        
        const response = await apiRequest('/api/channel/import', {
            method: 'POST',
            body: JSON.stringify({
                importData,
                options: { overwrite: false, skipExisting: true }
            })
        });

        if (response.success) {
            showSuccess(`导入完成：成功 ${response.successCount}，失败 ${response.failedCount}`);
            await refreshData();
        } else {
            showError(response.error || '导入失败');
        }
        
    } catch (error) {
        console.error('导入配置失败:', error);
        showError(`导入失败: ${error.message}`);
    } finally {
        hideLoading();
        input.value = ''; // 清空文件选择
    }
}

// 刷新数据
async function refreshData() {
    try {
        await loadInitialData();
        showSuccess('数据刷新成功', 1000);
    } catch (error) {
        console.error('刷新数据失败:', error);
        showError('刷新数据失败');
    }
}

// 验证配置数据
function validateConfigData(data) {
    const errors = [];
    
    if (!data.name || data.name.trim().length === 0) {
        errors.push('配置名称不能为空');
    }
    
    if (!data.sourceChannelId || !data.sourceChannelId.startsWith('-100')) {
        errors.push('源频道ID格式错误，应以-100开头');
    }
    
    if (!data.targetChannelId || !data.targetChannelId.startsWith('-100')) {
        errors.push('目标频道ID格式错误，应以-100开头');
    }
    
    if (data.sourceChannelId === data.targetChannelId) {
        errors.push('源频道和目标频道不能相同');
    }
    
    if (data.rateLimit < 1 || data.rateLimit > 1000) {
        errors.push('速率限制必须在1-1000之间');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// 工具函数
function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function closeAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.style.display = 'none';
    });
}

function showLoading(message = '处理中...') {
    // 简单的加载提示，可以根据需要改进
    console.log('Loading:', message);
}

function hideLoading() {
    console.log('Loading finished');
}

function showSuccess(message, duration = 3000) {
    showNotification(message, 'success', duration);
}

function showError(message) {
    showNotification(message, 'error');
}

function showNotification(message, type = 'info', duration = 3000) {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        padding: 15px 20px;
        border-radius: 5px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        color: white;
        font-weight: bold;
        max-width: 400px;
        word-wrap: break-word;
        animation: slideIn 0.3s ease-out;
    `;
    
    // 设置背景色
    switch (type) {
        case 'success':
            notification.style.backgroundColor = '#28a745';
            break;
        case 'error':
            notification.style.backgroundColor = '#dc3545';
            break;
        default:
            notification.style.backgroundColor = '#6c757d';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 自动移除
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, duration);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return dateString;
    }
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style); 