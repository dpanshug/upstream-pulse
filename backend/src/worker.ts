import { config, validateConfig } from './shared/config/index.js';
import { logger } from './shared/utils/logger.js';
import { CollectionScheduler } from './jobs/scheduler.js';
import { collectionWorker } from './jobs/workers/collection-worker.js';
import { governanceWorker } from './jobs/workers/governance-worker.js';

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

// Initialize scheduler
const scheduler = new CollectionScheduler();

// Start scheduler
scheduler.start();

// Log queue stats every 5 minutes
setInterval(async () => {
  const [contributionStats, governanceStats] = await Promise.all([
    scheduler.getQueueStats(),
    scheduler.getGovernanceQueueStats(),
  ]);
  logger.info('Queue statistics', {
    contributions: contributionStats,
    governance: governanceStats,
  });
}, 5 * 60 * 1000);

// Handle graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down worker process');

  scheduler.stop();

  await Promise.all([
    collectionWorker.close(),
    governanceWorker.close(),
  ]);

  logger.info('Worker process stopped');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

logger.info('Worker process started successfully');
