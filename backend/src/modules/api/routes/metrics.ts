import type { FastifyInstance } from 'fastify';
import { MetricsCalculator } from '../../metrics/calculator.js';
import { logger } from '../../../shared/utils/logger.js';

export async function metricsRoutes(app: FastifyInstance) {
  const calculator = new MetricsCalculator();

  // Get dashboard overview
  app.get('/api/metrics/overview', async (request, reply) => {
    try {
      const metrics = await calculator.getDashboardMetrics(30);
      return metrics;
    } catch (error) {
      logger.error('Error fetching dashboard metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch dashboard metrics',
        message: (error as Error).message,
      };
    }
  });

  // Get project contribution summary
  app.get<{
    Params: { projectId: string };
    Querystring: { days?: string };
  }>('/api/metrics/projects/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params;
      const days = parseInt(request.query.days || '30', 10);

      const endDate = new Date();
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const summary = await calculator.getContributionSummary(
        projectId,
        startDate,
        endDate
      );

      return summary;
    } catch (error) {
      logger.error('Error fetching project metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch project metrics',
        message: (error as Error).message,
      };
    }
  });

  // Calculate metrics for a project
  app.post<{
    Body: { projectId: string; startDate: string; endDate: string };
  }>('/api/metrics/calculate', async (request, reply) => {
    try {
      const { projectId, startDate, endDate } = request.body;

      await calculator.calculateMetricsRange(
        projectId,
        new Date(startDate),
        new Date(endDate)
      );

      return {
        success: true,
        message: 'Metrics calculation completed',
      };
    } catch (error) {
      logger.error('Error calculating metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to calculate metrics',
        message: (error as Error).message,
      };
    }
  });

  // Get contribution trend for a project
  app.get<{
    Params: { projectId: string };
    Querystring: { days?: string };
  }>('/api/metrics/projects/:projectId/trend', async (request, reply) => {
    try {
      const { projectId } = request.params;
      const days = parseInt(request.query.days || '30', 10);

      const endDate = new Date();
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const trend = await calculator.calculateTrend(
        projectId,
        startDate,
        endDate
      );

      return {
        projectId,
        trendPercentage: trend,
        period: `${days} days`,
      };
    } catch (error) {
      logger.error('Error calculating trend', { error });
      reply.status(500);
      return {
        error: 'Failed to calculate trend',
        message: (error as Error).message,
      };
    }
  });
}
