import type { FastifyInstance } from 'fastify';
import { leadershipService } from '../../leadership/leadership-service.js';
import { ownersCollector } from '../../collection/owners-collector.js';
import { logger } from '../../../shared/utils/logger.js';

export async function leadershipRoutes(app: FastifyInstance) {

  /**
   * GET /api/leadership/summary
   * 
   * Get leadership summary across all projects.
   * Returns counts of approvers, reviewers, and team member breakdown.
   */
  app.get('/api/leadership/summary', async (_request, reply) => {
    try {
      const summary = await leadershipService.getLeadershipSummary();
      return summary;
    } catch (error) {
      logger.error('Error fetching leadership summary', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch leadership summary',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/leadership/team
   * 
   * Get team members with leadership roles.
   * Returns list of team members and their roles across projects.
   */
  app.get('/api/leadership/team', async (_request, reply) => {
    try {
      const teamLeadership = await leadershipService.getTeamLeadership();
      return {
        members: teamLeadership,
        count: teamLeadership.length,
      };
    } catch (error) {
      logger.error('Error fetching team leadership', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch team leadership',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/leadership/projects/:projectId
   * 
   * Get leadership roles for a specific project.
   */
  app.get<{
    Params: { projectId: string };
  }>('/api/leadership/projects/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params;
      const leadership = await leadershipService.getProjectLeadership(projectId);
      return leadership;
    } catch (error) {
      logger.error('Error fetching project leadership', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch project leadership',
        message: (error as Error).message,
      };
    }
  });

  /**
   * POST /api/leadership/sync
   * 
   * Trigger a sync of OWNERS files from all tracked projects.
   * This fetches OWNERS files from GitHub and updates the database.
   */
  app.post('/api/leadership/sync', async (_request, reply) => {
    try {
      logger.info('Starting OWNERS sync');
      
      // Run sync in background
      ownersCollector.collectAllProjects().catch(error => {
        logger.error('OWNERS sync failed', { error });
      });

      return {
        status: 'started',
        message: 'OWNERS sync started in background',
      };
    } catch (error) {
      logger.error('Error starting OWNERS sync', { error });
      reply.status(500);
      return {
        error: 'Failed to start OWNERS sync',
        message: (error as Error).message,
      };
    }
  });
}
