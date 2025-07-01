/**
 * 频道管理前端脚本
 * 处理频道克隆配置的所有前端交互逻辑
 */

// 全局变量
let allConfigs = [];
let currentEditingConfig = null;
let currentHistoryConfig = null;
let allHistoryMessages = [];
let selectedMessages = new Set();
let isCloning = false;

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
        
        // 将关键函数暴露到全局，便于调试
        window.toggleConfig = toggleConfig;
        window.testConfig = testConfig;
        window.apiRequest = apiRequest;
        console.log('🔧 调试函数已暴露到全局作用域');
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
        console.log(`🔗 API请求: ${options.method || 'GET'} ${url}`);
        const response = await fetch(url, mergedOptions);
        const data = await response.json();

        console.log(`📡 API响应 (${response.status}):`, data);

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error(`❌ API请求失败 (${url}):`, error);
        throw error;
    }
}

// 加载统计信息
async function loadStats() {
    try {
        console.log('📊 开始加载统计信息...');
        
        const [configStats, queueStats, cloneStats, systemStats] = await Promise.all([
            apiRequest('/api/channel/stats?id=configs'),
            apiRequest('/api/channel/stats?id=queue'),
            apiRequest('/api/channel/stats?id=clone'),
            apiRequest('/api/channel/stats?id=system')
        ]);

        console.log('📊 统计数据获取结果:', {
            configStats,
            queueStats,
            cloneStats,
            systemStats
        });

        updateStatsDisplay({
            totalConfigs: configStats.data?.total || 0,
            enabledConfigs: configStats.data?.enabled || 0,
            todayCloned: cloneStats.data?.totalCloned || 0,
            queueTasks: queueStats.data?.pendingTasks || 0
        });

    } catch (error) {
        console.error('加载统计信息失败:', error);
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
        console.log('📋 开始加载配置列表...');
        configsList.innerHTML = '<div class="loading">加载配置中</div>';
        
        const response = await apiRequest('/api/channel/configs');
        console.log('📋 配置列表响应:', response);
        
        allConfigs = response.data || [];
        console.log('📋 加载的配置数量:', allConfigs.length);
        
        // 调试：打印每个配置的详细信息
        allConfigs.forEach((config, index) => {
            console.log(`配置 ${index + 1}:`, {
                name: config.name,
                sourceChannel: config.sourceChannel,
                targetChannel: config.targetChannel,
                settings: config.settings,
                status: config.status,
                createdAt: config.createdAt
            });
        });
        
        displayConfigs(allConfigs);
        updateConfigFilter();
        
    } catch (error) {
        console.error('加载配置失败:', error);
        configsList.innerHTML = `
            <div class="error">
                <h3>加载配置失败</h3>
                <p>${error.message}</p>
                <button class="btn btn-primary" onclick="loadConfigs()">重试</button>
                <button class="btn btn-warning" onclick="clearAllConfigs()">清空所有配置</button>
            </div>
        `;
    }
}

// 清空所有配置（紧急修复功能）
async function clearAllConfigs() {
    if (!confirm('⚠️ 危险操作！\n\n这将删除所有频道配置，包括有问题的配置。\n\n确定要继续吗？')) {
        return;
    }

    try {
        showLoading('清空所有配置中...');
        
        // 尝试获取所有配置并逐个删除
        for (const config of allConfigs) {
            try {
                await apiRequest(`/api/channel/configs/${config.name}`, {
                    method: 'DELETE'
                });
                console.log(`删除配置: ${config.name}`);
            } catch (error) {
                console.warn(`删除配置失败: ${config.name}`, error);
            }
        }
        
        showSuccess('所有配置已清空');
        await refreshData();
        
    } catch (error) {
        console.error('清空配置失败:', error);
        showError(`清空失败: ${error.message}`);
    } finally {
        hideLoading();
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
    try {
        // 安全地获取配置数据，防止undefined错误
        const settings = config.settings || {};
        const sourceChannel = config.sourceChannel || {};
        const targetChannel = config.targetChannel || {};
        
        // 调试信息
        console.log('创建配置卡片:', {
            name: config.name,
            settings: settings,
            sourceChannel: sourceChannel,
            targetChannel: targetChannel,
            status: config.status
        });
        
        const enabled = Boolean(settings.enabled);
        const status = config.status || 'active';
        
        const statusClass = enabled ? 
            (status === 'active' ? 'status-running' : 'status-stopped') : 
            'status-disabled';
        
        const statusText = enabled ? 
            (status === 'active' ? '运行中' : '已停止') : 
            '已禁用';

        return `
            <div class="config-card" onclick="editConfig('${escapeHtml(config.name || '')}')" style="cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" 
                 onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 15px rgba(0,0,0,0.15)';"
                 onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='';">
                <div class="config-info">
                    <div class="config-details">
                        <h3>
                            ${escapeHtml(config.name || '未命名配置')}
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </h3>
                        
                        <div class="config-meta">
                            <div class="meta-item">
                                <span class="label">源频道</span>
                                <div class="value">${escapeHtml(sourceChannel.id || '未设置')}</div>
                            </div>
                            <div class="meta-item">
                                <span class="label">目标频道</span>
                                <div class="value">${escapeHtml(targetChannel.id || '未设置')}</div>
                            </div>
                            <div class="meta-item">
                                <span class="label">速率限制</span>
                                <div class="value">${settings.rateLimit || 30}/分钟</div>
                            </div>
                            <div class="meta-item">
                                <span class="label">创建时间</span>
                                <div class="value">${formatDate(config.createdAt) || '未知'}</div>
                            </div>
                        </div>

                        <div style="margin-top: 10px;">
                            <small style="color: #666;">
                                同步编辑: ${Boolean(settings.syncEdits) ? '✅' : '❌'} | 
                                内容过滤: ${Boolean(settings.filterEnabled) ? '✅' : '❌'}
                            </small>
                        </div>
                    </div>

                    <div class="config-actions" onclick="event.stopPropagation();">
                        <button class="btn btn-primary" onclick="editConfig('${escapeHtml(config.name || '')}')" title="编辑配置">
                            ✏️ 编辑
                        </button>
                        <button class="btn ${enabled ? 'btn-warning' : 'btn-success'}" 
                                onclick="toggleConfig('${escapeHtml(config.name || '')}', ${!enabled})"
                                title="${enabled ? '禁用配置' : '启用配置'}">
                            ${enabled ? '⏸️ 禁用' : '▶️ 启用'}
                        </button>
                        <button class="btn btn-secondary" onclick="testConfig('${escapeHtml(config.name || '')}')" title="测试配置">
                            🔍 测试
                        </button>
                        <button class="btn btn-info" onclick="showHistoryModal('${escapeHtml(config.name || '')}')" title="历史消息">
                            📜 历史
                        </button>
                        <button class="btn btn-danger" onclick="confirmDeleteConfig('${escapeHtml(config.name || '')}')" title="删除配置">
                            🗑️ 删除
                        </button>
                    </div>
                </div>
                
                <div class="config-click-hint" style="position: absolute; top: 10px; right: 15px; font-size: 12px; color: #999; opacity: 0.7;">
                    💡 点击卡片编辑
                </div>
            </div>
        `;
    } catch (error) {
        console.error('创建配置卡片失败:', error, config);
        return `
            <div class="config-card" style="border: 2px solid #dc3545;">
                <div class="config-info">
                    <div class="config-details">
                        <h3 style="color: #dc3545;">配置显示错误</h3>
                        <p>配置名: ${config.name || '未知'}</p>
                        <p>错误: ${error.message}</p>
                        <button class="btn btn-danger" onclick="deleteConfig('${escapeHtml(config.name || '')}')">
                            🗑️ 删除错误配置
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
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
    console.log('编辑配置:', configName);
    console.log('所有配置:', allConfigs);
    
    const config = allConfigs.find(c => c.name === configName);
    if (!config) {
        console.error('配置不存在:', configName);
        showError('配置不存在');
        return;
    }

    console.log('找到配置:', config);
    currentEditingConfig = configName;
    
    // 安全地获取配置数据
    const settings = config.settings || {};
    const sourceChannel = config.sourceChannel || {};
    const targetChannel = config.targetChannel || {};
    
    try {
        // 填充表单
        document.getElementById('configName').value = config.name || '';
        document.getElementById('sourceChannelId').value = sourceChannel.id || '';
        document.getElementById('targetChannelId').value = targetChannel.id || '';
        document.getElementById('enabled').checked = Boolean(settings.enabled);
        document.getElementById('syncEdits').checked = Boolean(settings.syncEdits);
        document.getElementById('filterEnabled').checked = Boolean(settings.filterEnabled);
        document.getElementById('rateLimit').value = settings.rateLimit || 30;
        
        document.getElementById('modalTitle').textContent = '编辑频道配置';
        showModal('configModal');
        
        console.log('表单填充完成');
    } catch (error) {
        console.error('填充表单失败:', error);
        showError('填充表单失败: ' + error.message);
    }
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
    console.log(`🔄 开始${enabled ? '启用' : '禁用'}配置:`, configName);
    
    try {
        showLoading(enabled ? '启用配置中...' : '禁用配置中...');
        
        const url = `/api/channel/configs/${encodeURIComponent(configName)}/toggle`;
        console.log('📡 API请求URL:', url);
        console.log('📡 请求数据:', { enabled });
        
        const response = await apiRequest(url, {
            method: 'POST',
            body: JSON.stringify({ enabled })
        });

        console.log('📡 API响应:', response);
        console.log('📡 API响应类型:', typeof response);
        console.log('📡 API响应键值:', Object.keys(response));
        console.log('📡 response.success:', response.success);
        console.log('📡 response.error:', response.error);

        if (response.success) {
            showSuccess(enabled ? '配置已启用' : '配置已禁用');
            await refreshData();
        } else {
            // 处理错误信息 - 支持 error 和 errors 字段
            const errorMessage = response.error || 
                                (response.errors && response.errors.length > 0 ? response.errors.join(', ') : null) ||
                                '操作失败';
            
            console.error('❌ API返回错误:', errorMessage);
            console.error('❌ 完整响应对象:', JSON.stringify(response, null, 2));
            showError(errorMessage);
        }
        
    } catch (error) {
        console.error('❌ 切换配置状态失败:', error);
        showError(`操作失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// 测试配置
async function testConfig(configName) {
    console.log('🧪 开始测试配置:', configName);
    
    try {
        showLoading('测试配置中...');
        
        const url = `/api/channel/configs/${encodeURIComponent(configName)}/test`;
        console.log('📡 测试API请求URL:', url);
        
        const response = await apiRequest(url, {
            method: 'POST'
        });

        console.log('📡 测试API响应:', response);
        console.log('📡 测试API响应类型:', typeof response);
        console.log('📡 测试API响应键值:', Object.keys(response));
        console.log('📡 response.success:', response.success);

        if (response.success) {
            const results = response.results || response.data;
            console.log('🧪 测试结果:', results);
            
            let message = '配置测试完成:\n\n';
            
            if (results) {
                message += `源频道: ${results.sourceChannel?.accessible ? '✅ 可访问' : '❌ 无法访问'}\n`;
                message += `目标频道: ${results.targetChannel?.accessible ? '✅ 可访问' : '❌ 无法访问'}\n`;
                message += `Bot权限: ${results.permissions?.valid ? '✅ 权限充足' : '❌ 权限不足'}\n`;
            } else {
                message += '⚠️ 未获取到详细测试结果\n';
            }
            
            alert(message);
        } else {
            // 处理错误信息 - 支持 error 和 errors 字段
            const errorMessage = response.error || 
                                (response.errors && response.errors.length > 0 ? response.errors.join(', ') : null) ||
                                '测试失败';
            
            console.error('❌ 测试API返回错误:', errorMessage);
            showError(errorMessage);
        }
        
    } catch (error) {
        console.error('❌ 测试配置失败:', error);
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
        statusDiv.innerHTML = '<div class="loading">获取服务状态中</div>';
        
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
        showLoading('重新加载服务中');
        
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
        logsList.innerHTML = '<div class="loading">加载日志中</div>';
        
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
        // 移除刷新成功提示，避免UI一直变化
        console.log('数据刷新成功');
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

// ==================== 历史消息功能 ====================

// 显示历史消息模态框
async function showHistoryModal(configName) {
    console.log('📜 显示历史消息模态框:', configName);
    
    currentHistoryConfig = configName;
    selectedMessages.clear();
    
    // 设置模态框标题
    document.getElementById('historyModalTitle').textContent = `📜 ${configName} - 历史消息`;
    
    // 显示模态框
    showModal('historyModal');
    
    // 加载历史消息
    await loadHistoryMessages();
}

// 加载历史消息
async function loadHistoryMessages() {
    const messagesList = document.getElementById('historyMessagesList');
    
    try {
        messagesList.innerHTML = '<div class="loading">加载历史消息中...</div>';
        
        const limit = document.getElementById('historyLimit').value || 100;
        const response = await apiRequest(`/api/channel/configs/${encodeURIComponent(currentHistoryConfig)}/history?limit=${limit}`);
        
        if (response.success) {
            allHistoryMessages = response.data || [];
            console.log('📜 加载到历史消息:', allHistoryMessages.length, '条');
            displayHistoryMessages(allHistoryMessages);
        } else {
            messagesList.innerHTML = `
                <div class="error">
                    <h3>加载失败</h3>
                    <p>${response.error || '无法获取历史消息'}</p>
                    <button class="action-btn btn-primary" onclick="loadHistoryMessages()">重试</button>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('加载历史消息失败:', error);
        messagesList.innerHTML = `
            <div class="error">
                <h3>加载失败</h3>
                <p>${error.message}</p>
                <button class="action-btn btn-primary" onclick="loadHistoryMessages()">重试</button>
            </div>
        `;
    }
}

// 刷新历史消息
async function refreshHistoryMessages() {
    await loadHistoryMessages();
}

// 显示历史消息列表
function displayHistoryMessages(messages) {
    const messagesList = document.getElementById('historyMessagesList');
    
    if (!messages || messages.length === 0) {
        messagesList.innerHTML = `
            <div class="empty-state">
                <h3>📭 暂无历史消息</h3>
                <p>源频道中没有找到消息，或者消息已被删除</p>
            </div>
        `;
        return;
    }

    const messagesHtml = messages.map(message => createMessageCard(message)).join('');
    messagesList.innerHTML = messagesHtml;
    
    updateSelectionUI();
}

// 创建消息卡片
function createMessageCard(message) {
    const messageId = message.message_id;
    const isSelected = selectedMessages.has(messageId);
    
    // 确定消息类型
    let messageType = '文字';
    let mediaItems = [];
    
    if (message.photo) {
        messageType = '图片';
        mediaItems.push('📷 图片');
    }
    if (message.video) {
        messageType = '视频';
        mediaItems.push('🎥 视频');
    }
    if (message.document) {
        messageType = '文档';
        mediaItems.push('📄 文档');
    }
    if (message.audio) {
        messageType = '音频';
        mediaItems.push('🎵 音频');
    }
    if (message.voice) {
        messageType = '语音';
        mediaItems.push('🎤 语音');
    }
    if (message.sticker) {
        messageType = '贴纸';
        mediaItems.push('😀 贴纸');
    }
    
    // 处理消息文本
    let messageText = message.text || message.caption || '';
    if (messageText.length > 200) {
        messageText = messageText.substring(0, 200) + '...';
    }
    
    // 格式化日期
    const messageDate = new Date(message.date * 1000).toLocaleString('zh-CN');
    
    return `
        <div class="message-item ${isSelected ? 'selected' : ''}" onclick="toggleMessageSelection(${messageId})">
            <input type="checkbox" class="message-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleMessageSelection(${messageId})">
            
            <div class="message-header">
                <span class="message-id">消息 #${messageId}</span>
                <span class="message-type">${messageType}</span>
            </div>
            
            <div class="message-content">
                ${messageText ? `<div class="message-text">${escapeHtml(messageText)}</div>` : ''}
                ${mediaItems.length > 0 ? `
                    <div class="message-media">
                        ${mediaItems.map(item => `<span class="media-item">${item}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
            
            <div class="message-footer">
                <span class="message-date">${messageDate}</span>
                <span class="clone-status status-ready">准备克隆</span>
            </div>
        </div>
    `;
}

// 切换消息选择状态
function toggleMessageSelection(messageId) {
    if (selectedMessages.has(messageId)) {
        selectedMessages.delete(messageId);
    } else {
        selectedMessages.add(messageId);
    }
    
    // 更新UI
    const messageItem = document.querySelector(`.message-item[onclick*="${messageId}"]`);
    const checkbox = messageItem.querySelector('.message-checkbox');
    
    if (selectedMessages.has(messageId)) {
        messageItem.classList.add('selected');
        checkbox.checked = true;
    } else {
        messageItem.classList.remove('selected');
        checkbox.checked = false;
    }
    
    updateSelectionUI();
}

// 全选消息
function selectAllMessages() {
    const isAllSelected = selectedMessages.size === allHistoryMessages.length;
    
    if (isAllSelected) {
        // 如果已全选，则清空选择
        clearSelection();
    } else {
        // 否则全选
        selectedMessages.clear();
        allHistoryMessages.forEach(message => {
            selectedMessages.add(message.message_id);
        });
        
        // 更新UI
        document.querySelectorAll('.message-item').forEach(item => {
            item.classList.add('selected');
            item.querySelector('.message-checkbox').checked = true;
        });
        
        updateSelectionUI();
    }
}

// 清空选择
function clearSelection() {
    selectedMessages.clear();
    
    // 更新UI
    document.querySelectorAll('.message-item').forEach(item => {
        item.classList.remove('selected');
        item.querySelector('.message-checkbox').checked = false;
    });
    
    updateSelectionUI();
}

// 更新选择UI
function updateSelectionUI() {
    const selectedCount = selectedMessages.size;
    const totalCount = allHistoryMessages.length;
    
    // 更新计数显示
    document.getElementById('selectedCount').textContent = selectedCount;
    
    // 更新按钮状态
    const selectAllBtn = document.getElementById('selectAllBtn');
    const cloneBtn = document.getElementById('cloneBtn');
    
    if (selectedCount === 0) {
        selectAllBtn.textContent = '✅ 全选';
        cloneBtn.disabled = true;
        cloneBtn.textContent = '🚀 克隆选中 (0)';
    } else if (selectedCount === totalCount) {
        selectAllBtn.textContent = '❌ 取消全选';
        cloneBtn.disabled = false;
        cloneBtn.textContent = `🚀 克隆选中 (${selectedCount})`;
    } else {
        selectAllBtn.textContent = '✅ 全选';
        cloneBtn.disabled = false;
        cloneBtn.textContent = `🚀 克隆选中 (${selectedCount})`;
    }
}

// 过滤历史消息
function filterHistoryMessages() {
    const typeFilter = document.getElementById('historyTypeFilter').value;
    
    if (!typeFilter) {
        displayHistoryMessages(allHistoryMessages);
        return;
    }
    
    const filteredMessages = allHistoryMessages.filter(message => {
        switch (typeFilter) {
            case 'text':
                return message.text && !message.photo && !message.video && !message.document && !message.audio;
            case 'photo':
                return message.photo;
            case 'video':
                return message.video;
            case 'document':
                return message.document;
            case 'audio':
                return message.audio || message.voice;
            default:
                return true;
        }
    });
    
    displayHistoryMessages(filteredMessages);
}

// 显示历史消息扫描模态框
function showHistoryScanModal(configName) {
    // 移除已存在的模态框
    const existingModal = document.getElementById('historyScanModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modalHtml = `
        <div id="historyScanModal" class="modal" style="display: block;">
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2>🔍 自动扫描历史消息 - ${configName}</h2>
                    <span class="close" onclick="closeModal('historyScanModal')">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="alert alert-info">
                        <strong>功能说明：</strong>
                        <ul style="margin: 10px 0 0 20px;">
                            <li>自动扫描源频道的历史消息并克隆到目标频道</li>
                            <li>使用消息ID范围扫描，自动跳过不存在的消息</li>
                            <li>支持设置扫描范围、数量限制和延迟时间</li>
                            <li>自动去重，避免重复克隆已存在的消息</li>
                        </ul>
                    </div>
                    
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="startMessageId">起始消息ID</label>
                            <input type="number" id="startMessageId" value="1" min="1">
                            <small>从哪个消息ID开始扫描</small>
                        </div>
                        <div class="form-group">
                            <label for="endMessageId">结束消息ID</label>
                            <input type="number" id="endMessageId" placeholder="留空自动估算">
                            <small>扫描到哪个消息ID，留空自动估算</small>
                        </div>
                        <div class="form-group">
                            <label for="maxMessages">最大消息数量</label>
                            <input type="number" id="maxMessages" value="100" min="1" max="1000">
                            <small>最多克隆多少条消息</small>
                        </div>
                        <div class="form-group">
                            <label for="delayMs">延迟时间(毫秒)</label>
                            <input type="number" id="delayMs" value="1000" min="100" max="10000">
                            <small>每条消息间的延迟，避免API限制</small>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="skipExisting" checked>
                            跳过已克隆的消息
                        </label>
                        <small>自动跳过已经克隆过的消息，避免重复</small>
                    </div>
                    
                    <div id="scanProgress" class="progress-container" style="display: none;">
                        <h4>📊 扫描进度</h4>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: 0%"></div>
                        </div>
                        <div class="progress-stats">
                            <div class="stat-item">
                                <span class="stat-label">已扫描</span>
                                <span class="stat-value" id="scannedCount">0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">找到消息</span>
                                <span class="stat-value" id="foundCount">0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">成功克隆</span>
                                <span class="stat-value" id="clonedCount">0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">失败数量</span>
                                <span class="stat-value" id="errorCount">0</span>
                            </div>
                        </div>
                        <div class="progress-info">
                            <span>状态: <span id="scanStatus">准备中...</span></span>
                            <span>耗时: <span id="scanDuration">0秒</span></span>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="action-btn btn-secondary" onclick="closeModal('historyScanModal')">关闭</button>
                    <button class="action-btn btn-primary" id="startScanBtn" onclick="startHistoryScan('${configName}')">
                        🚀 开始扫描
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// 开始历史消息扫描
async function startHistoryScan(configName) {
    const scanData = {
        startMessageId: parseInt(document.getElementById('startMessageId').value) || 1,
        endMessageId: document.getElementById('endMessageId').value ? parseInt(document.getElementById('endMessageId').value) : null,
        maxMessages: parseInt(document.getElementById('maxMessages').value) || 100,
        delayMs: parseInt(document.getElementById('delayMs').value) || 1000,
        skipExisting: document.getElementById('skipExisting').checked
    };
    
    console.log('🔍 开始历史消息扫描:', configName, scanData);
    
    // 显示进度区域
    document.getElementById('scanProgress').style.display = 'block';
    document.getElementById('startScanBtn').disabled = true;
    document.getElementById('startScanBtn').innerHTML = '⏳ 扫描中...';
    
    try {
        // 启动扫描
        const response = await apiRequest(`/api/channel/configs/${encodeURIComponent(configName)}/scan-history`, {
            method: 'POST',
            body: JSON.stringify(scanData)
        });
        
        if (response.success) {
            document.getElementById('scanStatus').textContent = '扫描已启动';
            
            // 开始轮询状态
            pollScanStatus(configName);
        } else {
            throw new Error(response.error || '启动扫描失败');
        }
        
    } catch (error) {
        console.error('启动历史消息扫描失败:', error);
        showError('启动扫描失败: ' + error.message);
        
        // 重置按钮状态
        document.getElementById('startScanBtn').disabled = false;
        document.getElementById('startScanBtn').innerHTML = '🚀 开始扫描';
    }
}

// 轮询扫描状态
async function pollScanStatus(configName) {
    try {
        const response = await apiRequest(`/api/channel/configs/${encodeURIComponent(configName)}/scan-status`);
        
        if (response.success && response.data) {
            const data = response.data;
            
            // 更新进度显示
            if (data.progress) {
                document.getElementById('scannedCount').textContent = data.progress.scannedCount || 0;
                document.getElementById('foundCount').textContent = data.progress.foundCount || 0;
                document.getElementById('clonedCount').textContent = data.progress.clonedCount || 0;
                document.getElementById('errorCount').textContent = data.progress.errorCount || 0;
                
                // 计算进度百分比
                const total = data.progress.scannedCount || 1;
                const found = data.progress.foundCount || 0;
                const progress = Math.min((found / Math.max(total, 1)) * 100, 100);
                
                document.querySelector('.progress-fill').style.width = progress + '%';
            }
            
            // 更新状态和耗时
            const statusText = {
                'running': '扫描中...',
                'completed': '扫描完成',
                'failed': '扫描失败',
                'not_started': '未开始'
            }[data.status] || data.status;
            
            document.getElementById('scanStatus').textContent = statusText;
            
            if (data.duration) {
                const seconds = Math.floor(data.duration / 1000);
                document.getElementById('scanDuration').textContent = seconds + '秒';
            }
            
            // 如果扫描完成或失败，停止轮询
            if (data.status === 'completed' || data.status === 'failed') {
                document.getElementById('startScanBtn').disabled = false;
                document.getElementById('startScanBtn').innerHTML = '🔄 重新扫描';
                
                if (data.status === 'completed') {
                    showSuccess(`扫描完成！共扫描 ${data.progress.scannedCount} 条，找到 ${data.progress.foundCount} 条，成功克隆 ${data.progress.clonedCount} 条`);
                    
                    // 刷新配置列表
                    setTimeout(() => {
                        refreshData();
                    }, 2000);
                } else {
                    showError('扫描失败: ' + (data.error || '未知错误'));
                }
                
                return;
            }
            
            // 继续轮询
            setTimeout(() => pollScanStatus(configName), 2000);
            
        } else {
            console.warn('获取扫描状态失败:', response);
            setTimeout(() => pollScanStatus(configName), 5000);
        }
        
    } catch (error) {
        console.error('轮询扫描状态失败:', error);
        setTimeout(() => pollScanStatus(configName), 5000);
    }
}

// 克隆选中的消息
async function cloneSelectedMessages() {
    if (selectedMessages.size === 0) {
        showError('请先选择要克隆的消息');
        return;
    }
    
    if (isCloning) {
        showError('正在克隆中，请等待完成');
        return;
    }
    
    if (!confirm(`确定要克隆选中的 ${selectedMessages.size} 条消息吗？\n\n克隆将按照消息的原始顺序进行。`)) {
        return;
    }
    
    isCloning = true;
    const messageIds = Array.from(selectedMessages).sort((a, b) => a - b); // 按ID排序确保顺序
    
    // 显示进度条
    document.getElementById('cloneProgress').style.display = 'block';
    document.getElementById('cloneBtn').disabled = true;
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < messageIds.length; i++) {
        if (!isCloning) break; // 检查是否被停止
        
        const messageId = messageIds[i];
        const progress = ((i + 1) / messageIds.length) * 100;
        
        // 更新进度
        document.getElementById('cloneProgressText').textContent = `${i + 1}/${messageIds.length}`;
        document.getElementById('cloneProgressBar').style.width = `${progress}%`;
        
        // 更新消息状态
        updateMessageCloneStatus(messageId, 'cloning');
        
        try {
            // 调用克隆API
            const response = await apiRequest(`/api/channel/configs/${encodeURIComponent(currentHistoryConfig)}/clone-message`, {
                method: 'POST',
                body: JSON.stringify({ messageId })
            });
            
            if (response.success) {
                successCount++;
                updateMessageCloneStatus(messageId, 'success');
            } else {
                errorCount++;
                updateMessageCloneStatus(messageId, 'error');
                console.error(`克隆消息 ${messageId} 失败:`, response.error);
            }
        } catch (error) {
            errorCount++;
            updateMessageCloneStatus(messageId, 'error');
            console.error(`克隆消息 ${messageId} 异常:`, error);
        }
        
        // 添加延迟避免API限制
        if (i < messageIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒延迟
        }
    }
    
    // 克隆完成
    isCloning = false;
    document.getElementById('cloneProgress').style.display = 'none';
    document.getElementById('cloneBtn').disabled = false;
    
    // 显示结果
    if (errorCount === 0) {
        showSuccess(`克隆完成！成功克隆了 ${successCount} 条消息`);
    } else {
        showError(`克隆完成，成功 ${successCount} 条，失败 ${errorCount} 条`);
    }
    
    // 清空选择
    clearSelection();
}

// 停止克隆
function stopCloning() {
    if (confirm('确定要停止克隆吗？已克隆的消息不会回滚。')) {
        isCloning = false;
        document.getElementById('cloneProgress').style.display = 'none';
        document.getElementById('cloneBtn').disabled = false;
        showNotification('克隆已停止', 'warning');
    }
}

// 更新消息克隆状态
function updateMessageCloneStatus(messageId, status) {
    const messageItem = document.querySelector(`.message-item[onclick*="${messageId}"]`);
    if (!messageItem) return;
    
    const statusElement = messageItem.querySelector('.clone-status');
    
    statusElement.className = `clone-status status-${status}`;
    
    switch (status) {
        case 'ready':
            statusElement.textContent = '准备克隆';
            break;
        case 'cloning':
            statusElement.textContent = '克隆中...';
            break;
        case 'success':
            statusElement.textContent = '克隆成功';
            break;
        case 'error':
            statusElement.textContent = '克隆失败';
            break;
    }
} 