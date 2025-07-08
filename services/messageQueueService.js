const cron = require('node-cron');
const ChannelDataMapper = require('../models/channelDataMapper');
const ChannelCloneService = require('./channelCloneService');

/**
 * 消息队列处理服务
 * 基于EAV模式，支持定时任务、重试机制和优先级队列
 */
class MessageQueueService {
    constructor(bot) {
        this.bot = bot;
        this.dataMapper = new ChannelDataMapper();
        this.cloneService = new ChannelCloneService(bot);
        
        this.isRunning = false;
        this.cronJob = null;
        
        // 队列处理配置（优化：减少处理频率）
        this.config = {
            processingInterval: 60, // 秒（从30秒改为60秒）
            batchSize: 10, // 每次处理的任务数量
            maxRetries: 3,
            retryDelayMultiplier: 2 // 指数退避倍数
        };

        this.stats = {
            totalProcessed: 0,
            totalSucceeded: 0,
            totalFailed: 0,
            lastProcessTime: null
        };
    }

    /**
     * 启动队列服务
     */
    start() {
        if (this.isRunning) {
            console.log('📺 消息队列服务已在运行中');
            return;
        }

        this.isRunning = true;
        
        // 启动定时任务处理器
        this.cronJob = cron.schedule(`*/${this.config.processingInterval} * * * * *`, () => {
            this.processQueue();
        }, {
            scheduled: false
        });

        this.cronJob.start();
        
        console.log(`📺 消息队列服务已启动，处理间隔: ${this.config.processingInterval}秒`);
    }

    /**
     * 停止队列服务
     */
    stop() {
        if (!this.isRunning) {
            console.log('📺 消息队列服务未在运行');
            return;
        }

        this.isRunning = false;
        
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
        }
        
        console.log('📺 消息队列服务已停止');
    }

    /**
     * 处理队列任务
     */
    async processQueue() {
        if (!this.isRunning) {
            return;
        }

        try {
            // 获取待处理的任务
            const tasks = await this.dataMapper.getPendingCloneTasks(this.config.batchSize);
            
            if (tasks.length === 0) {
                return; // 没有待处理任务
            }

            console.log(`📺 开始处理 ${tasks.length} 个队列任务`);
            this.stats.lastProcessTime = new Date();

            for (const task of tasks) {
                await this.processTask(task);
            }

            console.log(`📺 队列处理完成: 处理 ${tasks.length} 个任务`);
            
        } catch (error) {
            console.error('处理队列失败:', error);
        }
    }

    /**
     * 处理单个任务
     */
    async processTask(task) {
        const startTime = Date.now();
        
        try {
            this.stats.totalProcessed++;
            
            console.log(`📺 处理任务 ${task.id}: ${task.type}`);

            let result;
            
            // 根据任务类型执行不同的处理逻辑
            switch (task.type) {
                case 'clone_message':
                    result = await this.processCloneMessageTask(task);
                    break;
                case 'sync_edit':
                    result = await this.processSyncEditTask(task);
                    break;
                case 'batch_clone':
                    result = await this.processBatchCloneTask(task);
                    break;
                case 'delayed_clone':
                    result = await this.processDelayedCloneTask(task);
                    break;
                default:
                    throw new Error(`未知的任务类型: ${task.type}`);
            }

            if (result.success) {
                // 任务成功，删除任务
                await this.dataMapper.completeTask(task.id);
                this.stats.totalSucceeded++;
                
                console.log(`✅ 任务 ${task.id} 处理成功`);
                
                // 记录成功日志
                await this.dataMapper.logAction(
                    task.configId,
                    `queue_task_success`,
                    'success',
                    null,
                    Date.now() - startTime,
                    {
                        task_id: task.id,
                        task_type: task.type,
                        retry_count: task.retryCount
                    }
                );
            } else {
                // 任务失败，处理重试逻辑
                await this.handleTaskFailure(task, result.error, startTime);
            }

        } catch (error) {
            console.error(`❌ 处理任务 ${task.id} 失败:`, error);
            await this.handleTaskFailure(task, error.message, startTime);
        }
    }

    /**
     * 处理消息克隆任务
     */
    async processCloneMessageTask(task) {
        try {
            const { sourceChannelId, sourceMessageId, configId } = task.data;
            
            // 这里需要获取消息内容并克隆
            // 由于Bot API限制，可能需要其他方式获取消息
            
            console.log(`📺 执行消息克隆任务: ${sourceChannelId}/${sourceMessageId}`);
            
            // 简化实现：直接返回成功
            // 实际实现中需要调用克隆服务
            
            return {
                success: true,
                result: {
                    targetMessageId: Math.floor(Math.random() * 1000000) // 模拟生成的目标消息ID
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 处理编辑同步任务
     */
    async processSyncEditTask(task) {
        try {
            const { sourceChannelId, sourceMessageId, targetChannelId, targetMessageId, newContent } = task.data;
            
            console.log(`📺 执行编辑同步任务: ${targetChannelId}/${targetMessageId}`);
            
            // 执行编辑同步
            if (newContent.text !== undefined) {
                await this.bot.editMessageText(
                    newContent.text,
                    {
                        chat_id: targetChannelId,
                        message_id: targetMessageId,
                        parse_mode: newContent.parse_mode,
                        disable_web_page_preview: true
                    }
                );
            } else if (newContent.caption !== undefined) {
                await this.bot.editMessageCaption(
                    newContent.caption,
                    {
                        chat_id: targetChannelId,
                        message_id: targetMessageId,
                        parse_mode: newContent.parse_mode
                    }
                );
            }
            
            return { success: true };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 处理批量克隆任务
     */
    async processBatchCloneTask(task) {
        try {
            const { configName, messageIds } = task.data;
            
            console.log(`📺 执行批量克隆任务: ${messageIds.length} 条消息`);
            
            let successCount = 0;
            let failCount = 0;
            
            for (const messageId of messageIds) {
                try {
                    // 这里需要实际的克隆逻辑
                    // 简化实现
                    successCount++;
                    await this.sleep(100); // 避免过快处理
                } catch (error) {
                    failCount++;
                    console.error(`批量克隆消息 ${messageId} 失败:`, error);
                }
            }
            
            return {
                success: failCount === 0,
                result: {
                    successCount,
                    failCount,
                    total: messageIds.length
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 处理延迟克隆任务
     */
    async processDelayedCloneTask(task) {
        try {
            const { delayUntil } = task.data;
            
            // 检查是否到了执行时间
            if (new Date() < new Date(delayUntil)) {
                return {
                    success: false,
                    error: '尚未到达执行时间',
                    shouldRetry: false // 不需要重试，只是时间未到
                };
            }
            
            console.log(`📺 执行延迟克隆任务`);
            
            // 执行实际的克隆逻辑
            // 这里简化实现
            
            return { success: true };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 处理任务失败
     */
    async handleTaskFailure(task, errorMessage, startTime) {
        this.stats.totalFailed++;
        
        if (task.canRetry) {
            // 可以重试
            console.log(`📺 任务 ${task.id} 失败，准备重试 (${task.retryCount + 1}/${task.maxRetries})`);
            
            await this.dataMapper.retryTask(task.id, errorMessage);
            
            // 记录重试日志
            await this.dataMapper.logAction(
                task.configId,
                'queue_task_retry',
                'warning',
                errorMessage,
                Date.now() - startTime,
                {
                    task_id: task.id,
                    task_type: task.type,
                    retry_count: task.retryCount + 1,
                    max_retries: task.maxRetries
                }
            );
        } else {
            // 重试次数超限，标记为失败
            console.error(`❌ 任务 ${task.id} 重试次数超限，标记为失败`);
            
            await this.dataMapper.completeTask(task.id);
            
            // 记录失败日志
            await this.dataMapper.logAction(
                task.configId,
                'queue_task_failed',
                'error',
                `重试次数超限: ${errorMessage}`,
                Date.now() - startTime,
                {
                    task_id: task.id,
                    task_type: task.type,
                    retry_count: task.retryCount,
                    max_retries: task.maxRetries,
                    final_error: errorMessage
                }
            );
        }
    }

    /**
     * 添加消息克隆任务
     */
    async addCloneTask(configId, sourceChannelId, sourceMessageId, priority = 1, delay = 0) {
        try {
            const scheduledTime = delay > 0 
                ? new Date(Date.now() + delay * 1000).toISOString()
                : new Date().toISOString();

            const success = await this.dataMapper.addCloneTask(configId, {
                priority,
                scheduledTime,
                type: 'clone_message',
                data: {
                    sourceChannelId,
                    sourceMessageId,
                    configId
                }
            });

            if (success) {
                console.log(`📺 已添加消息克隆任务: ${sourceChannelId}/${sourceMessageId}`);
            }

            return success;
        } catch (error) {
            console.error('添加克隆任务失败:', error);
            return false;
        }
    }

    /**
     * 添加编辑同步任务
     */
    async addEditSyncTask(configId, sourceChannelId, sourceMessageId, targetChannelId, targetMessageId, newContent, priority = 2) {
        try {
            const success = await this.dataMapper.addCloneTask(configId, {
                priority,
                scheduledTime: new Date().toISOString(),
                type: 'sync_edit',
                data: {
                    sourceChannelId,
                    sourceMessageId,
                    targetChannelId,
                    targetMessageId,
                    newContent
                }
            });

            if (success) {
                console.log(`📺 已添加编辑同步任务: ${targetChannelId}/${targetMessageId}`);
            }

            return success;
        } catch (error) {
            console.error('添加编辑同步任务失败:', error);
            return false;
        }
    }

    /**
     * 添加批量克隆任务
     */
    async addBatchCloneTask(configId, configName, messageIds, priority = 1) {
        try {
            const success = await this.dataMapper.addCloneTask(configId, {
                priority,
                scheduledTime: new Date().toISOString(),
                type: 'batch_clone',
                data: {
                    configName,
                    messageIds
                },
                maxRetries: 1 // 批量任务通常不需要多次重试
            });

            if (success) {
                console.log(`📺 已添加批量克隆任务: ${messageIds.length} 条消息`);
            }

            return success;
        } catch (error) {
            console.error('添加批量克隆任务失败:', error);
            return false;
        }
    }

    /**
     * 添加延迟克隆任务
     */
    async addDelayedCloneTask(configId, delayUntil, taskData, priority = 1) {
        try {
            const success = await this.dataMapper.addCloneTask(configId, {
                priority,
                scheduledTime: delayUntil,
                type: 'delayed_clone',
                data: {
                    delayUntil,
                    ...taskData
                }
            });

            if (success) {
                console.log(`📺 已添加延迟克隆任务，执行时间: ${delayUntil}`);
            }

            return success;
        } catch (error) {
            console.error('添加延迟克隆任务失败:', error);
            return false;
        }
    }

    /**
     * 获取队列统计信息
     */
    async getQueueStats() {
        try {
            const pendingTasks = await this.dataMapper.getPendingCloneTasks(1000);
            
            const stats = {
                ...this.stats,
                isRunning: this.isRunning,
                processingInterval: this.config.processingInterval,
                batchSize: this.config.batchSize,
                pendingTasks: pendingTasks.length,
                tasksByType: {},
                tasksByPriority: {},
                oldestTask: null,
                newestTask: null
            };

            // 按类型分组
            const typeGroups = {};
            const priorityGroups = {};
            let oldestTask = null;
            let newestTask = null;

            for (const task of pendingTasks) {
                // 按类型分组
                typeGroups[task.type] = (typeGroups[task.type] || 0) + 1;
                
                // 按优先级分组
                priorityGroups[task.priority] = (priorityGroups[task.priority] || 0) + 1;
                
                // 找到最老和最新的任务
                if (!oldestTask || new Date(task.scheduledTime) < new Date(oldestTask.scheduledTime)) {
                    oldestTask = task;
                }
                if (!newestTask || new Date(task.scheduledTime) > new Date(newestTask.scheduledTime)) {
                    newestTask = task;
                }
            }

            stats.tasksByType = typeGroups;
            stats.tasksByPriority = priorityGroups;
            stats.oldestTask = oldestTask;
            stats.newestTask = newestTask;

            return stats;
        } catch (error) {
            console.error('获取队列统计失败:', error);
            return {
                ...this.stats,
                isRunning: this.isRunning,
                error: error.message
            };
        }
    }

    /**
     * 清空队列
     */
    async clearQueue(taskType = null) {
        try {
            let clearedCount = 0;
            const pendingTasks = await this.dataMapper.getPendingCloneTasks(1000);
            
            for (const task of pendingTasks) {
                if (!taskType || task.type === taskType) {
                    await this.dataMapper.completeTask(task.id);
                    clearedCount++;
                }
            }

            console.log(`📺 已清空队列: ${clearedCount} 个任务${taskType ? ` (类型: ${taskType})` : ''}`);
            
            return {
                success: true,
                clearedCount
            };
        } catch (error) {
            console.error('清空队列失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            totalProcessed: 0,
            totalSucceeded: 0,
            totalFailed: 0,
            lastProcessTime: null
        };
        console.log('📺 队列统计信息已重置');
    }

    /**
     * 更新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // 如果处理间隔变了，重启定时任务
        if (newConfig.processingInterval && this.isRunning) {
            this.stop();
            this.start();
        }
        
        console.log('📺 队列配置已更新:', this.config);
    }

    /**
     * 工具方法：延迟
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = MessageQueueService; 