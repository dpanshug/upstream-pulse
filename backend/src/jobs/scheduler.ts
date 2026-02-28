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

export const leadershipQueue = new Queue('leadership-refresh', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 25,
    removeOnFail: 10,
  },
});

export const teamSyncQueue = new Queue('team-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 25,
    removeOnFail: 10,
  },
});

export class CollectionScheduler {
  private dailySyncSchedule: cron.ScheduledTask | null = null;
  private weeklyGovernanceSchedule: cron.ScheduledTask | null = null;
  private monthlyLeadershipSchedule: cron.ScheduledTask | null = null;
  private weeklyTeamSyncSchedule: cron.ScheduledTask | null = null;

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

    // Weekly governance refresh at 3 AM UTC on Mondays
    this.weeklyGovernanceSchedule = cron.schedule('0 3 * * 1', async () => {
      logger.info('Triggering weekly governance refresh');
      await this.triggerGovernanceRefresh();
    });

    // Monthly leadership refresh at 4 AM UTC on the 1st of each month
    this.monthlyLeadershipSchedule = cron.schedule('0 4 1 * *', async () => {
      logger.info('Triggering monthly leadership refresh');
      await this.triggerLeadershipRefresh();
    });

    // Weekly team sync at 1 AM UTC on Mondays (before governance refresh at 3 AM)
    this.weeklyTeamSyncSchedule = cron.schedule('0 1 * * 1', async () => {
      logger.info('Triggering weekly team sync from GitHub org');
      await this.triggerTeamSync();
    });

    logger.info('Collection scheduler started', {
      weeklyTeamSync: '0 1 * * 1 (1 AM UTC on Mondays)',
      dailySync: '0 2 * * * (2 AM UTC)',
      weeklyGovernance: '0 3 * * 1 (3 AM UTC on Mondays)',
      monthlyLeadership: '0 4 1 * * (4 AM UTC on 1st of month)',
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

    if (this.monthlyLeadershipSchedule) {
      this.monthlyLeadershipSchedule.stop();
    }

    if (this.weeklyTeamSyncSchedule) {
      this.weeklyTeamSyncSchedule.stop();
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
   * Trigger insight generation (uses Gemini when configured)
   */
  async triggerInsightGeneration(timeRange?: { start: Date; end: Date }) {
    logger.info('Triggering insight generation');

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

  /**
   * Trigger leadership refresh (steering committee, WG chairs/leads)
   * Runs monthly to update leadership positions from community repo
   */
  async triggerLeadershipRefresh() {
    logger.info('Triggering leadership refresh');

    const job = await leadershipQueue.add(
      'monthly-leadership',
      {
        trigger: 'scheduled',
      },
      {
        priority: 1,
        jobId: `monthly-leadership-${Date.now()}`,
      }
    );

    logger.info('Leadership refresh job queued', { jobId: job.id });

    return job;
  }

  /**
   * Manually trigger leadership refresh
   */
  async triggerManualLeadershipRefresh() {
    logger.info('Manually triggering leadership refresh');

    const job = await leadershipQueue.add(
      'manual-leadership',
      {
        trigger: 'manual',
      },
      {
        priority: 0, // Highest priority for manual triggers
        jobId: `manual-leadership-${Date.now()}`,
      }
    );

    logger.info('Manual leadership refresh job queued', { jobId: job.id });

    return job;
  }

  /**
   * Get leadership queue statistics
   */
  async getLeadershipQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      leadershipQueue.getWaitingCount(),
      leadershipQueue.getActiveCount(),
      leadershipQueue.getCompletedCount(),
      leadershipQueue.getFailedCount(),
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
   * Trigger team member sync from GitHub org
   */
  async triggerTeamSync(trigger: 'scheduled' | 'manual' = 'scheduled') {
    logger.info('Triggering team sync from GitHub org');

    const job = await teamSyncQueue.add(
      `team-sync-${trigger}`,
      {
        trigger,
        org: config.githubTeamOrg,
      },
      {
        priority: trigger === 'manual' ? 0 : 1,
        jobId: `team-sync-${Date.now()}`,
      }
    );

    logger.info('Team sync job queued', { jobId: job.id });

    return job;
  }

  /**
   * Get team sync queue statistics
   */
  async getTeamSyncQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      teamSyncQueue.getWaitingCount(),
      teamSyncQueue.getActiveCount(),
      teamSyncQueue.getCompletedCount(),
      teamSyncQueue.getFailedCount(),
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
