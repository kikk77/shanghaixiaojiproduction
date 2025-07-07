/**
 * 等级系统事件钩子
 * 基于版本A设计：提供统一的集成接口，供现有系统调用
 */

class LevelServiceHook {
    constructor() {
        this.levelService = require('./levelService').getInstance();
        this.enabled = process.env.LEVEL_SYSTEM_ENABLED === 'true';
    }
    
    /**
     * 评价完成钩子
     * 由evaluationService在评价完成后调用
     */
    async onEvaluationComplete(evaluationData) {
        if (!this.enabled) return;
        
        try {
            const { user_id, group_id, evaluation_id, action_type } = evaluationData;
            
            // 确定动作类型
            let levelActionType = 'evaluation_complete';
            
            // 根据评价类型细分
            if (evaluationData.evaluation_type === 'merchant') {
                levelActionType = 'evaluate_merchant';
            } else if (evaluationData.evaluation_type === 'user') {
                levelActionType = 'evaluate_user';
            }
            
            // 处理奖励
            await this.levelService.processEvaluationReward(
                user_id,
                group_id || process.env.GROUP_CHAT_ID,
                evaluation_id,
                levelActionType
            );
            
            // 如果是商家被评价，也给商家奖励
            if (evaluationData.merchant_id && evaluationData.merchant_id !== user_id) {
                await this.levelService.processEvaluationReward(
                    evaluationData.merchant_id,
                    group_id || process.env.GROUP_CHAT_ID,
                    evaluation_id,
                    'be_evaluated'
                );
            }
            
        } catch (error) {
            console.error('等级系统评价钩子失败:', error);
        }
    }
    
    /**
     * 订单完成钩子
     * 由orderService在订单完成后调用
     */
    async onOrderComplete(orderData) {
        if (!this.enabled) return;
        
        try {
            const { merchant_id, customer_id, order_id, group_id } = orderData;
            
            // 给商家奖励
            if (merchant_id) {
                await this.levelService.processEvaluationReward(
                    merchant_id,
                    group_id || process.env.GROUP_CHAT_ID,
                    order_id,
                    'order_complete'
                );
            }
            
            // 给客户奖励（如果有）
            if (customer_id && customer_id !== merchant_id) {
                await this.levelService.processEvaluationReward(
                    customer_id,
                    group_id || process.env.GROUP_CHAT_ID,
                    order_id,
                    'place_order'
                );
            }
            
        } catch (error) {
            console.error('等级系统订单钩子失败:', error);
        }
    }
    
    /**
     * 用户活跃钩子
     * 由botService在用户发送消息时调用
     */
    async onUserActivity(activityData) {
        if (!this.enabled) return;
        
        try {
            const { user_id, group_id, activity_type } = activityData;
            
            // 根据活动类型给予奖励
            const rewardableActivities = [
                'send_message',
                'share_content',
                'help_others',
                'report_issue'
            ];
            
            if (rewardableActivities.includes(activity_type)) {
                await this.levelService.processEvaluationReward(
                    user_id,
                    group_id || process.env.GROUP_CHAT_ID,
                    `activity_${Date.now()}`,
                    activity_type
                );
            }
            
        } catch (error) {
            console.error('等级系统活动钩子失败:', error);
        }
    }
    
    /**
     * 商家绑定钩子
     * 由merchantService在商家绑定成功后调用
     */
    async onMerchantBind(bindData) {
        if (!this.enabled) return;
        
        try {
            const { merchant_id, group_id } = bindData;
            
            await this.levelService.processEvaluationReward(
                merchant_id,
                group_id || process.env.GROUP_CHAT_ID,
                `bind_${Date.now()}`,
                'merchant_bind'
            );
            
        } catch (error) {
            console.error('等级系统绑定钩子失败:', error);
        }
    }
    
    /**
     * 首次行为钩子
     * 用于处理用户的首次行为奖励
     */
    async onFirstAction(actionData) {
        if (!this.enabled) return;
        
        try {
            const { user_id, group_id, action_type } = actionData;
            
            // 首次行为的特殊奖励
            const firstActionRewards = {
                'first_evaluation': 'first_evaluation_bonus',
                'first_order': 'first_order_bonus',
                'first_bind': 'first_bind_bonus'
            };
            
            const rewardType = firstActionRewards[action_type];
            if (rewardType) {
                await this.levelService.processEvaluationReward(
                    user_id,
                    group_id || process.env.GROUP_CHAT_ID,
                    `first_${Date.now()}`,
                    rewardType
                );
            }
            
        } catch (error) {
            console.error('等级系统首次行为钩子失败:', error);
        }
    }
    
    /**
     * 获取用户等级信息
     * 供其他服务查询使用
     */
    async getUserLevelInfo(userId, groupId) {
        if (!this.enabled) return null;
        
        try {
            return await this.levelService.getUserLevelInfo(
                userId,
                groupId || process.env.GROUP_CHAT_ID
            );
        } catch (error) {
            console.error('获取用户等级信息失败:', error);
            return null;
        }
    }
    
    /**
     * 检查用户是否达到特定等级
     * 用于权限控制
     */
    async checkUserLevel(userId, groupId, requiredLevel) {
        if (!this.enabled) return true; // 未启用时不限制
        
        try {
            const userInfo = await this.getUserLevelInfo(userId, groupId);
            return userInfo && userInfo.profile.level >= requiredLevel;
        } catch (error) {
            console.error('检查用户等级失败:', error);
            return false;
        }
    }
    
    /**
     * 检查用户是否拥有特定勋章
     * 用于权限控制
     */
    async checkUserBadge(userId, groupId, badgeId) {
        if (!this.enabled) return true; // 未启用时不限制
        
        try {
            const badgeService = require('./badgeService').getInstance();
            const userBadges = await badgeService.getUserBadges(userId, groupId);
            return userBadges.some(b => b.badge_id === badgeId);
        } catch (error) {
            console.error('检查用户勋章失败:', error);
            return false;
        }
    }
    
    /**
     * 手动触发经验/积分奖励
     * 用于特殊场景
     */
    async grantReward(userId, groupId, expAmount, pointsAmount, reason) {
        if (!this.enabled) return false;
        
        try {
            await this.levelService.updateUserRewards(
                userId,
                groupId || process.env.GROUP_CHAT_ID,
                expAmount,
                pointsAmount,
                'manual_grant',
                reason || '管理员手动奖励'
            );
            return true;
        } catch (error) {
            console.error('手动奖励失败:', error);
            return false;
        }
    }
}

// 导出单例
let instance = null;
module.exports = {
    getInstance: () => {
        if (!instance) {
            instance = new LevelServiceHook();
        }
        return instance;
    },
    
    // 便捷方法，直接导出常用钩子
    onEvaluationComplete: async (data) => {
        const hook = module.exports.getInstance();
        return await hook.onEvaluationComplete(data);
    },
    
    onOrderComplete: async (data) => {
        const hook = module.exports.getInstance();
        return await hook.onOrderComplete(data);
    },
    
    onUserActivity: async (data) => {
        const hook = module.exports.getInstance();
        return await hook.onUserActivity(data);
    },
    
    onMerchantBind: async (data) => {
        const hook = module.exports.getInstance();
        return await hook.onMerchantBind(data);
    },
    
    onFirstAction: async (data) => {
        const hook = module.exports.getInstance();
        return await hook.onFirstAction(data);
    }
}; 