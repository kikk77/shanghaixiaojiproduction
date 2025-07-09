const EAVOperations = require('../models/eavOperations');

class OrderStatusService {
    constructor(db) {
        this.eav = new EAVOperations(db);
        this.db = db;
    }

    // 获取订单状态配置
    getStatusConfig(status) {
        try {
            const config = this.eav.getEntity(status, 'order_status_config');
            if (!config) {
                // 如果EAV中没有找到，返回默认配置
                return this.getDefaultStatusConfig(status);
            }
            return config;
        } catch (error) {
            console.error(`获取订单状态配置失败 (${status}):`, error);
            return this.getDefaultStatusConfig(status);
        }
    }

    // 获取所有状态配置
    getAllStatusConfigs() {
        try {
            return this.eav.getAllEntities('order_status_config');
        } catch (error) {
            console.error('获取所有订单状态配置失败:', error);
            return this.getDefaultAllStatusConfigs();
        }
    }

    // 检查状态流转是否合法
    canTransitionTo(currentStatus, targetStatus) {
        const config = this.getStatusConfig(currentStatus);
        if (!config || !config.next_statuses) {
            // 如果配置不存在或next_statuses不存在，允许合理的状态转换
            console.log(`⚠️ 状态配置不存在，使用默认逻辑检查: ${currentStatus} -> ${targetStatus}`);
            return true; // 暂时允许所有转换，避免阻塞业务
        }
        
        return Array.isArray(config.next_statuses) ? 
            config.next_statuses.includes(targetStatus) : 
            false;
    }

    // 执行状态流转
    transitionStatus(orderId, newStatus, updatedBy = 'system') {
        try {
            // 获取当前订单状态
            const currentOrder = this.getOrderById(orderId);
            if (!currentOrder) {
                throw new Error(`订单 ${orderId} 不存在`);
            }

            const currentStatus = currentOrder.status;
            
            // 检查状态流转是否合法
            if (!this.canTransitionTo(currentStatus, newStatus)) {
                throw new Error(`订单状态不能从 ${currentStatus} 变更为 ${newStatus}`);
            }

            // 检查orders表是否包含status_updated_at字段
            const tableInfo = this.db.prepare("PRAGMA table_info(orders)").all();
            const columnNames = tableInfo.map(col => col.name);
            const hasStatusUpdatedAt = columnNames.includes('status_updated_at');
            const hasStatusUpdatedBy = columnNames.includes('status_updated_by');

            // 根据字段存在情况构建SQL
            let updateStmt;
            if (hasStatusUpdatedAt && hasStatusUpdatedBy) {
                // 完整版本 - 包含状态更新字段
                updateStmt = this.db.prepare(`
                    UPDATE orders 
                    SET status = ?, 
                        status_updated_at = strftime('%s', 'now'),
                        status_updated_by = ?,
                        updated_at = strftime('%s', 'now')
                    WHERE id = ?
                `);
                const result = updateStmt.run(newStatus, updatedBy, orderId);
                
                if (result.changes > 0) {
                    // 记录状态变更日志
                    this.logStatusChange(orderId, currentStatus, newStatus, updatedBy);
                    
                    // 触发状态变更通知
                    this.handleStatusChangeNotification(orderId, currentStatus, newStatus);
                    
                    console.log(`✅ 订单状态更新成功: ${orderId} ${currentStatus} -> ${newStatus}`);
                    return true;
                }
            } else {
                // 兼容版本 - 只更新基本字段
                updateStmt = this.db.prepare(`
                    UPDATE orders 
                    SET status = ?, 
                        updated_at = strftime('%s', 'now')
                    WHERE id = ?
                `);
                const result = updateStmt.run(newStatus, orderId);
                
                if (result.changes > 0) {
                    // 记录状态变更日志
                    this.logStatusChange(orderId, currentStatus, newStatus, updatedBy);
                    
                    // 触发状态变更通知
                    this.handleStatusChangeNotification(orderId, currentStatus, newStatus);
                    
                    console.log(`✅ 订单状态更新成功: ${orderId} ${currentStatus} -> ${newStatus}`);
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error(`订单状态流转失败:`, error);
            throw error;
        }
    }

    // 获取状态显示信息
    getStatusDisplayInfo(status) {
        const config = this.getStatusConfig(status);
        return {
            status: status,
            name: config?.name || status,
            description: config?.description || '未知状态',
            color: config?.color || '#808080',
            auto_timeout: config?.auto_timeout || null
        };
    }

    // 检查超时的订单
    checkTimeoutOrders() {
        try {
            const timeoutOrders = [];
            const currentTime = Math.floor(Date.now() / 1000);
            
            // 获取所有非终态订单
            const activeOrders = this.db.prepare(`
                SELECT id, status, updated_at 
                FROM orders 
                WHERE status NOT IN ('completed', 'cancelled', 'evaluated')
            `).all();

            for (const order of activeOrders) {
                const config = this.getStatusConfig(order.status);
                if (config?.auto_timeout && config.auto_timeout > 0) {
                    const timeoutSeconds = parseInt(config.auto_timeout);
                    const elapsedTime = currentTime - order.updated_at;
                    
                    if (elapsedTime > timeoutSeconds) {
                        timeoutOrders.push({
                            orderId: order.id,
                            currentStatus: order.status,
                            elapsedTime: elapsedTime,
                            timeoutThreshold: timeoutSeconds
                        });
                    }
                }
            }
            
            return timeoutOrders;
        } catch (error) {
            console.error('检查超时订单失败:', error);
            return [];
        }
    }

    // 处理超时订单
    handleTimeoutOrders() {
        const timeoutOrders = this.checkTimeoutOrders();
        
        for (const orderInfo of timeoutOrders) {
            try {
                let targetStatus = null;
                
                // 根据当前状态决定超时后的目标状态
                switch (orderInfo.currentStatus) {
                    case 'attempting':
                        targetStatus = 'merchant_unavailable';
                        break;
                    case 'pending':
                        targetStatus = 'cancelled';
                        break;
                    default:
                        continue; // 跳过不需要自动处理的状态
                }
                
                if (targetStatus && this.canTransitionTo(orderInfo.currentStatus, targetStatus)) {
                    this.transitionStatus(orderInfo.orderId, targetStatus, 'auto_timeout');
                    console.log(`订单 ${orderInfo.orderId} 因超时自动从 ${orderInfo.currentStatus} 变更为 ${targetStatus}`);
                }
            } catch (error) {
                console.error(`处理超时订单 ${orderInfo.orderId} 失败:`, error);
            }
        }
        
        return timeoutOrders.length;
    }

    // 记录状态变更日志
    logStatusChange(orderId, fromStatus, toStatus, updatedBy) {
        try {
            // 检查order_status_logs表是否存在
            const tablesResult = this.db.prepare(`
                SELECT name FROM sqlite_master WHERE type='table' AND name='order_status_logs'
            `).get();
            
            if (tablesResult) {
                // 表存在，记录状态变更日志
                const logStmt = this.db.prepare(`
                    INSERT INTO order_status_logs 
                    (order_id, from_status, to_status, updated_by, created_at) 
                    VALUES (?, ?, ?, ?, strftime('%s', 'now'))
                `);
                logStmt.run(orderId, fromStatus, toStatus, updatedBy);
                console.log(`✅ 状态变更日志已记录: 订单 ${orderId} ${fromStatus} -> ${toStatus}`);
            } else {
                // 表不存在，仅记录到控制台
                console.log(`📝 状态变更: 订单 ${orderId} ${fromStatus} -> ${toStatus} (由 ${updatedBy})`);
            }
        } catch (error) {
            console.error('记录状态变更日志失败:', error);
            // 即使日志记录失败，也不影响状态更新的主要流程
        }
    }

    // 处理状态变更通知
    handleStatusChangeNotification(orderId, fromStatus, toStatus) {
        try {
            // 获取订单信息
            const order = this.getOrderById(orderId);
            if (!order) return;

            // 获取通知规则
            const notificationRules = this.getStatusNotificationRules();
            const statusConfig = this.getStatusConfig(toStatus);
            
            // 检查是否需要发送通知
            if (notificationRules.status_change?.notify_user?.includes(toStatus)) {
                this.sendUserNotification(order, toStatus, statusConfig);
            }
            
            if (notificationRules.status_change?.notify_merchant?.includes(toStatus)) {
                this.sendMerchantNotification(order, toStatus, statusConfig);
            }
            
            if (notificationRules.status_change?.notify_admin?.includes(toStatus)) {
                this.sendAdminNotification(order, toStatus, statusConfig);
            }
        } catch (error) {
            console.error('处理状态变更通知失败:', error);
        }
    }

    // 获取订单信息
    getOrderById(orderId) {
        try {
            const stmt = this.db.prepare('SELECT * FROM orders WHERE id = ?');
            return stmt.get(orderId);
        } catch (error) {
            console.error(`获取订单信息失败 (${orderId}):`, error);
            return null;
        }
    }

    // 获取通知规则 (从EAV或默认配置)
    getStatusNotificationRules() {
        // 这里可以从EAV中读取，或者使用默认配置
        return {
            status_change: {
                notify_user: ['pending', 'confirmed', 'rejected', 'cancelled', 'completed'],
                notify_merchant: ['attempting', 'cancelled', 'completed', 'dispute'],
                notify_admin: ['dispute', 'interrupted', 'no_show']
            }
        };
    }

    // 发送用户通知
    sendUserNotification(order, status, statusConfig) {
        console.log(`发送用户通知: 订单 ${order.order_number} 状态变更为 ${statusConfig.name}`);
        // 这里可以集成实际的通知服务
    }

    // 发送商家通知
    sendMerchantNotification(order, status, statusConfig) {
        console.log(`发送商家通知: 订单 ${order.order_number} 状态变更为 ${statusConfig.name}`);
        // 这里可以集成实际的通知服务
    }

    // 发送管理员通知
    sendAdminNotification(order, status, statusConfig) {
        console.log(`发送管理员通知: 订单 ${order.order_number} 状态变更为 ${statusConfig.name}`);
        // 这里可以集成实际的通知服务
    }

    // 默认状态配置 (兜底方案)
    getDefaultStatusConfig(status) {
        const defaultConfigs = {
            attempting: {
                name: '尝试联系',
                description: '用户刚下单，系统尝试联系商家',
                color: '#FFA500',
                auto_timeout: 300,
                next_statuses: ['pending', 'cancelled', 'merchant_unavailable']
            },
            pending: {
                name: '等待确认',
                description: '商家已收到通知，等待商家确认',
                color: '#FFD700',
                auto_timeout: 1800,
                next_statuses: ['confirmed', 'rejected', 'cancelled']
            },
            confirmed: {
                name: '已确认',
                description: '商家已确认订单，等待服务开始',
                color: '#32CD32',
                auto_timeout: null,
                next_statuses: ['in_progress', 'cancelled', 'no_show']
            },
            completed: {
                name: '已完成',
                description: '服务已完成，等待评价',
                color: '#228B22',
                auto_timeout: null,
                next_statuses: ['evaluated', 'dispute']
            },
            cancelled: {
                name: '已取消',
                description: '订单被取消',
                color: '#DC143C',
                auto_timeout: null,
                next_statuses: []
            }
        };
        
        return defaultConfigs[status] || {
            name: status,
            description: '未知状态',
            color: '#808080',
            auto_timeout: null,
            next_statuses: []
        };
    }

    // 默认所有状态配置
    getDefaultAllStatusConfigs() {
        return {
            attempting: this.getDefaultStatusConfig('attempting'),
            pending: this.getDefaultStatusConfig('pending'),
            confirmed: this.getDefaultStatusConfig('confirmed'),
            completed: this.getDefaultStatusConfig('completed'),
            cancelled: this.getDefaultStatusConfig('cancelled')
        };
    }
}

module.exports = OrderStatusService; 