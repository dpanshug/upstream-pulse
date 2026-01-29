import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import cron from 'node-cron';
import { config } from '../shared/config/index.js';
import { logger } from '../shared/utils/logger.js';
import { db } from '../shared/database/client.js';
import { projects } from '../shared/database/schema.js';
import { eq } from 'drizzle-orm';

const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

// Create job queues
export const contributionQueue = new Queue('contribution-collection', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const governanceQueue = new Queue('governance-refresh', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 50,
    removeOnFail: 25,
  },
});

export const insightQueue = new Queue('insight-generation', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 50,
    removeOnFail: 25,
  },
});

export class CollectionScheduler {
  private dailySyncSchedule: cron.ScheduledTask | null = null;
  private weeklyGovernanceSchedule: cron.ScheduledTask | null = null;

  /**
   * Start scheduled jobs
   * 
   * Schedule:
   * - Daily sync at 2 AM UTC: Fetches from last_sync_at for each project
   * - Weekly governance at 3 AM UTC on Sundays: Refreshes OWNERS files for all projects
   * - Full history sync: Only when adding new projects (triggered via API)
   */
  start() {
    logger.info('Starting collection scheduler');

    // Daily sync at 2 AM UTC - fetches from last_sync_at
    this.dailySyncSchedule = cron.schedule('0 2 * * *', async () => {
      logger.info('Triggering daily sync');
      await this.triggerDailySync();
    });

    // Weekly governance refresh at 3 AM UTC on Sundays
    this.weeklyGovernanceSchedule = cron.schedule('0 3 * * 0', async () => {
      logger.info('Triggering weekly governance refresh');
      await this.triggerGovernanceRefresh();
    });

    logger.info('Collection scheduler started', {
      dailySync: '0 2 * * * (2 AM UTC)',
      weeklyGovernance: '0 3 * * 0 (3 AM UTC on Sundays)',
    });
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    logger.info('Stopping collection scheduler');

    if (this.dailySyncSchedule) {
      this.dailySyncSchedule.stop();
    }

    if (this.weeklyGovernanceSchedule) {
      this.weeklyGovernanceSchedule.stop();
    }

    logger.info('Collection scheduler stopped');
  }

  /**
   * Daily sync for all enabled projects
   * Uses last_sync_at to avoid redundant fetches
   */
  async triggerDailySync() {
    try {
      const enabledProjects = await db.query.projects.findMany({
        where: eq(projects.trackingEnabled, true),
      });

      logger.info(`Queuing daily sync for ${enabledProjects.length} projects`);

      for (const project of enabledProjects) {
        // Use last_sync_at if available, otherwise default to 7 days ago
        const defaultSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const sinceDate = project.lastSyncAt || defaultSince;

        await contributionQueue.add(
          'daily-sync',
          {
            projectId: project.id,
            jobType: 'sync',
            since: sinceDate.toISOString(),
          },
          {
            priority: 1,
            jobId: `daily-sync-${project.id}-${Date.now()}`,
          }
        );

        logger.debug('Queued daily sync job', {
          project: project.name,
          since: sinceDate.toISOString(),
        });
      }

      return enabledProjects.length;

    } catch (error) {
      logger.error('Error triggering daily sync', { error });
      throw error;
    }
  }

  /**
   * Full history sync for a project (from repo creation date)
   * Use when adding new projects
   */
  async triggerFullHistorySync(projectId: string, repoCreatedAt: Date) {
    logger.info('Triggering full history sync', { projectId, since: repoCreatedAt });

    const job = await contributionQueue.add(
      'full-history-sync',
      {
        projectId,
        jobType: 'full_sync',
        since: repoCreatedAt.toISOString(),
      },
      {
        priority: 0, // Highest priority
        jobId: `full-history-${projectId}-${Date.now()}`,
      }
    );

    logger.info('Full history sync job queued', {
      jobId: job.id,
      projectId,
      since: repoCreatedAt.toISOString(),
    });

    return job;
  }

  /**
   * Manually trigger collection for a specific project
   * Fetches from a custom date or last_sync_at
   */
  async triggerProjectCollection(projectId: string, since?: Date) {
    logger.info('Manually triggering collection', { projectId });

    // If no since date provided, fetch the project's last_sync_at
    let sinceDate = since;
    if (!sinceDate) {
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });
      // Default to last 30 days if no last_sync_at
      sinceDate = project?.lastSyncAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const job = await contributionQueue.add(
      'manual-sync',
      {
        projectId,
        jobType: 'sync',
        since: sinceDate.toISOString(),
      },
      {
        priority: 0, // Highest priority
      }
    );

    logger.info('Manual collection job queued', {
      jobId: job.id,
      projectId,
      since: sinceDate.toISOString(),
    });

    return job;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      contributionQueue.getWaitingCount(),
      contributionQueue.getActiveCount(),
      contributionQueue.getCompletedCount(),
      contributionQueue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    };
  }

  /**
   * Trigger AI insights generation
   */
  async triggerInsightGeneration(timeRange?: { start: Date; end: Date }) {
    logger.info('Triggering AI insights generation');

    const defaultEnd = new Date();
    const defaultStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

    const job = await insightQueue.add(
      'generate-insights',
      {
        timeRangeStart: timeRange?.start?.toISOString() || defaultStart.toISOString(),
        timeRangeEnd: timeRange?.end?.toISOString() || defaultEnd.toISOString(),
      },
      {
        priority: 1,
      }
    );

    logger.info('Insight generation job queued', { jobId: job.id });

    return job;
  }

  /**
   * Trigger governance refresh for all projects
   * Runs weekly to update OWNERS file data
   */
  async triggerGovernanceRefresh() {
    logger.info('Triggering governance refresh for all projects');

    const job = await governanceQueue.add(
      'weekly-governance',
      {
        trigger: 'scheduled',
      },
      {
        priority: 1,
        jobId: `weekly-governance-${Date.now()}`,
      }
    );

    logger.info('Governance refresh job queued', { jobId: job.id });

    return job;
  }

  /**
   * Trigger governance refresh for a specific project
   * Called when a new project is added
   */
  async triggerProjectGovernance(projectId: string, trigger: 'new_project' | 'manual' = 'manual') {
    logger.info('Triggering governance refresh for project', { projectId, trigger });

    const job = await governanceQueue.add(
      `governance-${trigger}`,
      {
        projectId,
        trigger,
      },
      {
        priority: 0, // Highest priority for new projects
        jobId: `governance-${projectId}-${Date.now()}`,
      }
    );

    logger.info('Project governance job queued', { jobId: job.id, projectId });

    return job;
  }

  /**
   * Get governance queue statistics
   */
  async getGovernanceQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      governanceQueue.getWaitingCount(),
      governanceQueue.getActiveCount(),
      governanceQueue.getCompletedCount(),
      governanceQueue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    };
  }
}
