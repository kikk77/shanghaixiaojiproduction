/**
 * 增强排行榜服务 - 获取更多评价数据
 * 
 * 功能：
 * 1. 从JSON文件中获取评价数据
 * 2. 计算用户的详细评价统计
 * 3. 提供丰富的排行榜数据
 */

const fs = require('fs');
const path = require('path');

class EnhancedRankingService {
    constructor() {
        this.levelService = require('./levelService').getInstance();
        this.dataPath = path.join(__dirname, '../../business_data/core_business');
        this.evaluationsData = null;
        this.evaluationDetailsData = null;
        this.evaluationSessionsData = null;
        
        // 加载评价数据
        this.loadEvaluationData();
    }
    
    /**
     * 加载评价数据
     */
    loadEvaluationData() {
        try {
            // 加载评价主数据
            const evaluationsPath = path.join(this.dataPath, 'evaluations.json');
            if (fs.existsSync(evaluationsPath)) {
                this.evaluationsData = JSON.parse(fs.readFileSync(evaluationsPath, 'utf8'));
                console.log(`✅ 加载评价数据: ${this.evaluationsData.length} 条记录`);
            }
            
            // 加载评价详情数据
            const evaluationDetailsPath = path.join(this.dataPath, 'evaluation_details.json');
            if (fs.existsSync(evaluationDetailsPath)) {
                this.evaluationDetailsData = JSON.parse(fs.readFileSync(evaluationDetailsPath, 'utf8'));
                console.log(`✅ 加载评价详情数据: ${this.evaluationDetailsData.length} 条记录`);
            }
            
            // 加载评价会话数据
            const evaluationSessionsPath = path.join(this.dataPath, 'evaluation_sessions.json');
            if (fs.existsSync(evaluationSessionsPath)) {
                this.evaluationSessionsData = JSON.parse(fs.readFileSync(evaluationSessionsPath, 'utf8'));
                console.log(`✅ 加载评价会话数据: ${this.evaluationSessionsData.length} 条记录`);
            }
            
        } catch (error) {
            console.error('加载评价数据失败:', error);
        }
    }
    
    /**
     * 获取用户的详细评价统计
     */
    getUserEvaluationStats(userId) {
        if (!this.evaluationsData || !this.evaluationDetailsData) {
            return null;
        }
        
        try {
            // 获取用户作为评价者的评价
            const userEvaluations = this.evaluationsData.filter(evaluation => 
                evaluation.evaluator_id === userId && evaluation.status === 'completed'
            );
            
            // 获取用户被评价的评价
            const evaluationsReceived = this.evaluationsData.filter(evaluation => 
                evaluation.target_id === userId && evaluation.status === 'completed'
            );
            
            // 计算详细统计
            const stats = {
                // 基础统计
                totalEvaluationsGiven: userEvaluations.length,
                totalEvaluationsReceived: evaluationsReceived.length,
                
                // 评价给出的统计
                givenStats: this.calculateGivenStats(userEvaluations),
                
                // 收到评价的统计
                receivedStats: this.calculateReceivedStats(evaluationsReceived),
                
                // 详细评价数据
                detailedEvaluations: this.getDetailedEvaluations(userEvaluations),
                
                // 收到的详细评价
                receivedDetailedEvaluations: this.getDetailedEvaluations(evaluationsReceived)
            };
            
            return stats;
            
        } catch (error) {
            console.error('获取用户评价统计失败:', error);
            return null;
        }
    }
    
    /**
     * 计算给出评价的统计
     */
    calculateGivenStats(evaluations) {
        if (!evaluations.length) return null;
        
        const stats = {
            count: evaluations.length,
            averageOverallScore: 0,
            scoreDistribution: {},
            commentStats: {
                withComments: 0,
                averageCommentLength: 0,
                totalComments: []
            }
        };
        
        let totalScore = 0;
        let totalCommentLength = 0;
        
        evaluations.forEach(evaluation => {
            // 整体评分统计
            if (evaluation.overall_score !== null) {
                totalScore += evaluation.overall_score;
                const score = evaluation.overall_score;
                stats.scoreDistribution[score] = (stats.scoreDistribution[score] || 0) + 1;
            }
            
            // 评论统计
            if (evaluation.comments && evaluation.comments.trim()) {
                stats.commentStats.withComments++;
                totalCommentLength += evaluation.comments.length;
                stats.commentStats.totalComments.push({
                    comment: evaluation.comments,
                    created_at: evaluation.created_at,
                    target_id: evaluation.target_id
                });
            }
        });
        
        stats.averageOverallScore = totalScore / evaluations.length;
        stats.commentStats.averageCommentLength = stats.commentStats.withComments > 0 ? 
            totalCommentLength / stats.commentStats.withComments : 0;
        
        return stats;
    }
    
    /**
     * 计算收到评价的统计
     */
    calculateReceivedStats(evaluations) {
        if (!evaluations.length) return null;
        
        const stats = {
            count: evaluations.length,
            averageOverallScore: 0,
            scoreDistribution: {},
            commentStats: {
                withComments: 0,
                averageCommentLength: 0,
                totalComments: []
            }
        };
        
        let totalScore = 0;
        let totalCommentLength = 0;
        
        evaluations.forEach(evaluation => {
            // 整体评分统计
            if (evaluation.overall_score !== null) {
                totalScore += evaluation.overall_score;
                const score = evaluation.overall_score;
                stats.scoreDistribution[score] = (stats.scoreDistribution[score] || 0) + 1;
            }
            
            // 评论统计
            if (evaluation.comments && evaluation.comments.trim()) {
                stats.commentStats.withComments++;
                totalCommentLength += evaluation.comments.length;
                stats.commentStats.totalComments.push({
                    comment: evaluation.comments,
                    created_at: evaluation.created_at,
                    evaluator_id: evaluation.evaluator_id
                });
            }
        });
        
        stats.averageOverallScore = evaluations.length > 0 ? totalScore / evaluations.length : 0;
        stats.commentStats.averageCommentLength = stats.commentStats.withComments > 0 ? 
            totalCommentLength / stats.commentStats.withComments : 0;
        
        return stats;
    }
    
    /**
     * 获取详细评价数据
     */
    getDetailedEvaluations(evaluations) {
        if (!evaluations.length || !this.evaluationDetailsData) return [];
        
        return evaluations.map(evaluation => {
            // 获取该评价的详细评分
            const details = this.evaluationDetailsData.filter(detail => 
                detail.evaluation_id === evaluation.id
            );
            
            // 解析详细评分
            let detailedScores = {};
            try {
                if (evaluation.detailed_scores) {
                    detailedScores = JSON.parse(evaluation.detailed_scores);
                }
            } catch (error) {
                console.error('解析详细评分失败:', error);
            }
            
            // 整理详细评分数据
            const scoreBreakdown = {};
            details.forEach(detail => {
                scoreBreakdown[detail.metric_name] = {
                    score: detail.score,
                    text_value: detail.text_value,
                    created_at: detail.created_at
                };
            });
            
            return {
                id: evaluation.id,
                evaluator_id: evaluation.evaluator_id,
                target_id: evaluation.target_id,
                overall_score: evaluation.overall_score,
                comments: evaluation.comments,
                created_at: evaluation.created_at,
                detailed_scores: detailedScores,
                score_breakdown: scoreBreakdown
            };
        });
    }
    
    /**
     * 获取增强的排行榜数据
     */
    async getEnhancedRankings(type = 'level', limit = 10, includeInactive = false) {
        try {
            // 获取基础排行榜数据
            const baseRankings = await this.levelService.getRankings(type, limit, includeInactive);
            
            // 为每个用户添加详细评价统计
            const enhancedRankings = baseRankings.map(user => {
                const evaluationStats = this.getUserEvaluationStats(user.user_id);
                
                return {
                    ...user,
                    evaluation_stats: evaluationStats,
                    // 添加一些计算字段
                    evaluation_activity_score: this.calculateActivityScore(evaluationStats),
                    evaluation_quality_score: this.calculateQualityScore(evaluationStats)
                };
            });
            
            return enhancedRankings;
            
        } catch (error) {
            console.error('获取增强排行榜失败:', error);
            return [];
        }
    }
    
    /**
     * 计算用户活跃度分数
     */
    calculateActivityScore(evaluationStats) {
        if (!evaluationStats) return 0;
        
        const givenCount = evaluationStats.totalEvaluationsGiven || 0;
        const receivedCount = evaluationStats.totalEvaluationsReceived || 0;
        const commentsGiven = evaluationStats.givenStats?.commentStats?.withComments || 0;
        const commentsReceived = evaluationStats.receivedStats?.commentStats?.withComments || 0;
        
        // 活跃度分数 = 给出评价数 * 2 + 收到评价数 + 评论数
        return givenCount * 2 + receivedCount + commentsGiven + commentsReceived;
    }
    
    /**
     * 计算用户评价质量分数
     */
    calculateQualityScore(evaluationStats) {
        if (!evaluationStats) return 0;
        
        const givenStats = evaluationStats.givenStats;
        const receivedStats = evaluationStats.receivedStats;
        
        let qualityScore = 0;
        
        // 给出评价的质量分数
        if (givenStats) {
            const avgCommentLength = givenStats.commentStats?.averageCommentLength || 0;
            const commentRate = givenStats.count > 0 ? 
                (givenStats.commentStats?.withComments || 0) / givenStats.count : 0;
            
            qualityScore += avgCommentLength * 0.1 + commentRate * 10;
        }
        
        // 收到评价的质量分数
        if (receivedStats) {
            const avgScore = receivedStats.averageOverallScore || 0;
            qualityScore += avgScore * 2;
        }
        
        return Math.round(qualityScore);
    }
    
    /**
     * 获取用户的详细评价报告
     */
    async getUserEvaluationReport(userId) {
        try {
            // 获取用户等级信息
            const userLevelInfo = await this.levelService.getUserLevelInfo(userId);
            
            // 获取评价统计
            const evaluationStats = this.getUserEvaluationStats(userId);
            
            // 获取积分历史
            const pointsHistory = await this.levelService.getUserPointsHistory(userId, 20);
            
            return {
                user_level_info: userLevelInfo,
                evaluation_stats: evaluationStats,
                points_history: pointsHistory,
                activity_score: this.calculateActivityScore(evaluationStats),
                quality_score: this.calculateQualityScore(evaluationStats),
                report_generated_at: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('获取用户评价报告失败:', error);
            return null;
        }
    }
    
    /**
     * 获取评价趋势分析
     */
    getEvaluationTrends() {
        if (!this.evaluationsData) return null;
        
        try {
            const now = Math.floor(Date.now() / 1000);
            const oneWeekAgo = now - (7 * 24 * 60 * 60);
            const oneMonthAgo = now - (30 * 24 * 60 * 60);
            
            const recentEvaluations = this.evaluationsData.filter(evaluation => 
                evaluation.created_at >= oneWeekAgo && evaluation.status === 'completed'
            );
            
            const monthlyEvaluations = this.evaluationsData.filter(evaluation => 
                evaluation.created_at >= oneMonthAgo && evaluation.status === 'completed'
            );
            
            // 按用户统计
            const userStats = {};
            recentEvaluations.forEach(evaluation => {
                const userId = evaluation.evaluator_id;
                if (!userStats[userId]) {
                    userStats[userId] = { given: 0, received: 0 };
                }
                userStats[userId].given++;
            });
            
            recentEvaluations.forEach(evaluation => {
                const userId = evaluation.target_id;
                if (!userStats[userId]) {
                    userStats[userId] = { given: 0, received: 0 };
                }
                userStats[userId].received++;
            });
            
            return {
                weekly_total: recentEvaluations.length,
                monthly_total: monthlyEvaluations.length,
                active_users_weekly: Object.keys(userStats).length,
                top_evaluators_weekly: Object.entries(userStats)
                    .sort(([,a], [,b]) => b.given - a.given)
                    .slice(0, 10)
                    .map(([userId, stats]) => ({
                        user_id: parseInt(userId),
                        evaluations_given: stats.given,
                        evaluations_received: stats.received
                    }))
            };
            
        } catch (error) {
            console.error('获取评价趋势失败:', error);
            return null;
        }
    }
}

// 导出单例
let instance = null;
module.exports = {
    getInstance: () => {
        if (!instance) {
            instance = new EnhancedRankingService();
        }
        return instance;
    }
}; 