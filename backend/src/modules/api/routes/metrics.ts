import type { FastifyInstance } from 'fastify';
import { metricsService } from '../../metrics/metrics-service.js';
import { logger } from '../../../shared/utils/logger.js';

export async function metricsRoutes(app: FastifyInstance) {

  /**
   * GET /api/metrics/dashboard
   * 
   * Main dashboard endpoint - returns all metrics in a clear, organized structure.
   * Query params:
   *   - days: number of days to analyze (default: 30)
   */
  app.get<{
    Querystring: { days?: string };
  }>('/api/metrics/dashboard', async (request, reply) => {
    try {
      const days = parseInt(request.query.days || '30', 10);
      const dashboard = await metricsService.getDashboard({ days });
      return dashboard;
    } catch (error) {
      logger.error('Error fetching dashboard', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch dashboard',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/overview (legacy - kept for backwards compatibility)
   */
  app.get<{
    Querystring: { days?: string };
  }>('/api/metrics/overview', async (request, reply) => {
    try {
      const days = parseInt(request.query.days || '30', 10);
      const dashboard = await metricsService.getDashboard({ days });
      
      // Transform to legacy format for backwards compatibility
      return {
        projectCount: dashboard.summary.trackedProjects,
        contributions30d: dashboard.contributions.all.team,
        contributions30dChange: dashboard.trends.contributions.changePercent,
        maintainerCount: 0,
        maintainerCountChange: 0,
        avgContributionPct: dashboard.contributions.all.teamPercent,
        activeContributors: dashboard.summary.activeContributors,
        activeContributorsChange: dashboard.trends.activeContributors.changePercent,
        trendData: dashboard.dailyBreakdown,
        latestInsights: [],
        topProjects: dashboard.topProjects,
        topContributors: dashboard.topContributors,
      };
    } catch (error) {
      logger.error('Error fetching dashboard metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch dashboard metrics',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/contributions
   * 
   * Get contribution breakdown.
   * Query params:
   *   - days: number of days (default: 30)
   *   - projectId: filter by project (optional)
   */
  app.get<{
    Querystring: { days?: string; projectId?: string };
  }>('/api/metrics/contributions', async (request, reply) => {
    try {
      const days = parseInt(request.query.days || '30', 10);
      const { projectId } = request.query;

      const breakdown = await metricsService.getContributionBreakdown({
        days,
        projectId,
      });

      return breakdown;
    } catch (error) {
      logger.error('Error fetching contribution metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch contribution metrics',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/contributors
   * 
   * Get top contributors.
   * Query params:
   *   - days: number of days (default: 30)
   *   - projectId: filter by project (optional)
   *   - limit: number of contributors to return (default: 10)
   */
  app.get<{
    Querystring: { days?: string; projectId?: string; limit?: string };
  }>('/api/metrics/contributors', async (request, reply) => {
    try {
      const days = parseInt(request.query.days || '30', 10);
      const topN = parseInt(request.query.limit || '10', 10);
      const { projectId } = request.query;

      const contributors = await metricsService.getTopContributors({
        days,
        projectId,
        topN,
      });

      return {
        contributors,
        count: contributors.length,
        days,
      };
    } catch (error) {
      logger.error('Error fetching contributor metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch contributor metrics',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/trend
   * 
   * Get daily contribution trend.
   * Query params:
   *   - days: number of days (default: 30)
   *   - projectId: filter by project (optional)
   */
  app.get<{
    Querystring: { days?: string; projectId?: string };
  }>('/api/metrics/trend', async (request, reply) => {
    try {
      const days = parseInt(request.query.days || '30', 10);
      const { projectId } = request.query;

      const trend = await metricsService.getDailyTrend({
        days,
        projectId,
      });

      return {
        trend,
        days,
      };
    } catch (error) {
      logger.error('Error fetching trend metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch trend metrics',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/projects/:projectId
   * 
   * Get metrics for a specific project.
   */
  app.get<{
    Params: { projectId: string };
    Querystring: { days?: string };
  }>('/api/metrics/projects/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params;
      const days = parseInt(request.query.days || '30', 10);

      const [breakdown, trend, contributors] = await Promise.all([
        metricsService.getContributionBreakdown({ projectId, days }),
        metricsService.getContributionTrend({ projectId, days }),
        metricsService.getTopContributors({ projectId, days, topN: 10 }),
      ]);

      return {
        projectId,
        days,
        contributions: breakdown,
        trend,
        topContributors: contributors,
      };
    } catch (error) {
      logger.error('Error fetching project metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch project metrics',
        message: (error as Error).message,
      };
    }
  });
}
