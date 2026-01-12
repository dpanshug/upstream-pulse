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
  private dailyFullSyncSchedule: cron.ScheduledTask | null = null;
  private hourlyIncrementalSchedule: cron.ScheduledTask | null = null;

  /**
   * Start all scheduled jobs
   */
  start() {
    logger.info('Starting collection scheduler');

    // Daily full sync at 2 AM UTC
    this.dailyFullSyncSchedule = cron.schedule('0 2 * * *', async () => {
      logger.info('Triggering daily full sync');
      await this.triggerFullSync();
    });

    // Hourly incremental sync for active repos
    this.hourlyIncrementalSchedule = cron.schedule('0 * * * *', async () => {
      logger.info('Triggering hourly incremental sync');
      await this.triggerIncrementalSync();
    });

    logger.info('Collection scheduler started', {
      dailyFullSync: '0 2 * * * (2 AM UTC)',
      hourlyIncremental: '0 * * * * (every hour)',
    });
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    logger.info('Stopping collection scheduler');

    if (this.dailyFullSyncSchedule) {
      this.dailyFullSyncSchedule.stop();
    }

    if (this.hourlyIncrementalSchedule) {
      this.hourlyIncrementalSchedule.stop();
    }

    logger.info('Collection scheduler stopped');
  }

  /**
   * Trigger full sync for all enabled projects
   */
  async triggerFullSync() {
    try {
      const enabledProjects = await db.query.projects.findMany({
        where: eq(projects.trackingEnabled, true),
      });

      logger.info(`Queuing full sync for ${enabledProjects.length} projects`);

      for (const project of enabledProjects) {
        await contributionQueue.add(
          'full-sync',
          {
            projectId: project.id,
            jobType: 'full_sync',
            since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // Last 90 days
          },
          {
            priority: 1,
            jobId: `full-sync-${project.id}-${Date.now()}`,
          }
        );

        logger.debug('Queued full sync job', {
          project: project.name,
          org: project.githubOrg,
          repo: project.githubRepo,
        });
      }

      return enabledProjects.length;

    } catch (error) {
      logger.error('Error triggering full sync', { error });
      throw error;
    }
  }

  /**
   * Trigger incremental sync for active projects (updated in last 7 days)
   */
  async triggerIncrementalSync() {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const activeProjects = await db.query.projects.findMany({
        where: eq(projects.trackingEnabled, true),
        // TODO: Add filter for recently active projects
      });

      // Only sync projects that have had recent activity
      // For now, we'll sync all enabled projects
      const projectsToSync = activeProjects;

      logger.info(`Queuing incremental sync for ${projectsToSync.length} projects`);

      for (const project of projectsToSync) {
        await contributionQueue.add(
          'incremental-sync',
          {
            projectId: project.id,
            jobType: 'incremental',
            since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24 hours
          },
          {
            priority: 2,
            jobId: `incremental-sync-${project.id}-${Date.now()}`,
          }
        );
      }

      return projectsToSync.length;

    } catch (error) {
      logger.error('Error triggering incremental sync', { error });
      throw error;
    }
  }

  /**
   * Manually trigger collection for a specific project
   */
  async triggerProjectCollection(
    projectId: string,
    since?: Date
  ) {
    logger.info('Manually triggering collection', { projectId });

    const job = await contributionQueue.add(
      'manual-sync',
      {
        projectId,
        jobType: 'full_sync',
        since: since?.toISOString() || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        priority: 0, // Highest priority
      }
    );

    logger.info('Manual collection job queued', {
      jobId: job.id,
      projectId,
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
}
