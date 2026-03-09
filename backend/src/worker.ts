import { config, validateConfig } from './shared/config/index.js';
import { logger } from './shared/utils/logger.js';
import { db } from './shared/database/client.js';
import { collectionJobs } from './shared/database/schema.js';
import { sql } from 'drizzle-orm';
import { CollectionScheduler } from './jobs/scheduler.js';
import { collectionWorker } from './jobs/workers/collection-worker.js';
import { governanceWorker } from './jobs/workers/governance-worker.js';
import { leadershipWorker } from './jobs/workers/leadership-worker.js';
import { teamSyncWorker } from './jobs/workers/team-sync-worker.js';

// Validate configuration on startup
try {
  validateConfig();
} catch (error) {
  logger.error('Configuration validation failed', { error });
  process.exit(1);
}

logger.info('Starting worker process', {
  nodeEnv: config.nodeEnv,
  redisUrl: config.redisUrl,
});

// Clean up stale 'running' job records left by previous crashes/restarts.
// Only targets records older than 5 minutes to avoid interfering with
// jobs still finishing on the old pod during a rolling deploy.
try {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const stale = await db.update(collectionJobs)
    .set({
      status: 'failed',
      completedAt: new Date(),
      errorDetails: { message: 'marked failed on worker startup: previous worker crashed', source: 'startup_cleanup' },
    })
    .where(sql`${collectionJobs.status} IN ('running', 'waiting_for_api') AND ${collectionJobs.startedAt} < ${fiveMinutesAgo}`)
    .returning({ id: collectionJobs.id });

  if (stale.length > 0) {
    logger.info(`Cleaned up ${stale.length} stale running job records from previous crash`);
  }
} catch (error) {
  logger.warn('Failed to clean up stale job records', { error });
}

// Initialize scheduler
const scheduler = new CollectionScheduler();

// Start scheduler
scheduler.start();

// Log queue stats every 5 minutes
setInterval(async () => {
  const [contributionStats, governanceStats, leadershipStats, teamSyncStats] = await Promise.all([
    scheduler.getQueueStats(),
    scheduler.getGovernanceQueueStats(),
    scheduler.getLeadershipQueueStats(),
    scheduler.getTeamSyncQueueStats(),
  ]);
  logger.info('Queue statistics', {
    contributions: contributionStats,
    governance: governanceStats,
    leadership: leadershipStats,
    teamSync: teamSyncStats,
  });
}, 5 * 60 * 1000);

// Handle graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down worker process');

  scheduler.stop();

  await Promise.all([
    collectionWorker.close(),
    governanceWorker.close(),
    leadershipWorker.close(),
    teamSyncWorker.close(),
  ]);

  logger.info('Worker process stopped');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

logger.info('Worker process started successfully');
