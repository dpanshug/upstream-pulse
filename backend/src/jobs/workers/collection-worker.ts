import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { db } from '../../shared/database/client.js';
import { projects, contributions, collectionJobs } from '../../shared/database/schema.js';
import { GitHubCollector } from '../../modules/collection/github-collector.js';
import { IdentityResolver } from '../../modules/identity/resolver.js';
import { eq, sql } from 'drizzle-orm';

interface CollectionJobData {
  projectId: string;
  jobType: 'sync' | 'full_sync';
  since?: string;
  phases?: ('commits' | 'pull_requests' | 'reviews' | 'issues')[];
}

const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

async function resolveAndStore(
  records: { type: string; author?: string; email?: string; githubId: string; date: Date; metadata?: Record<string, any>; isMerged?: boolean; linesAdded?: number; linesDeleted?: number; filesChanged?: number }[],
  projectId: string,
  resolver: IdentityResolver,
): Promise<{ processed: number; errors: number }> {
  const contributors = records.map(c => ({ username: c.author || 'unknown', email: c.email }));
  const unique = Array.from(new Map(contributors.map(c => [c.username, c])).values());
  const identities = await resolver.bulkResolve(unique);

  let processed = 0;
  let errors = 0;

  for (const record of records) {
    try {
      const identity = identities.get(record.author || 'unknown');
      const inserted = await db.insert(contributions).values({
        projectId,
        teamMemberId: identity?.teamMember?.id,
        contributionType: record.type,
        contributionDate: record.date.toISOString().split('T')[0],
        githubId: record.githubId,
        githubUrl: record.metadata?.url,
        linesAdded: record.linesAdded,
        linesDeleted: record.linesDeleted,
        filesChanged: record.filesChanged,
        isMerged: record.isMerged,
        metadata: record.metadata,
      }).onConflictDoNothing().returning({ id: contributions.id });
      if (inserted.length > 0) processed++;
    } catch (error) {
      errors++;
      logger.warn('Error storing contribution', {
        error: (error as Error).message,
        record: record.githubId,
      });
    }
  }

  return { processed, errors };
}

export const collectionWorker = new Worker<CollectionJobData>(
  'contribution-collection',
  async (job: Job<CollectionJobData>) => {
    const { projectId, jobType, since, phases } = job.data;

    logger.info('Starting collection job', {
      jobId: job.id,
      projectId,
      jobType,
      phases: phases || 'all',
    });

    const jobRecordId = randomUUID();
    await db.insert(collectionJobs).values({
      id: jobRecordId,
      jobType,
      projectId,
      status: 'running',
      startedAt: new Date(),
      metadata: { bullmqJobId: job.id },
    }).returning();

    try {
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });

      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      logger.info('Collecting contributions for project', {
        name: project.name,
        org: project.githubOrg,
        repo: project.githubRepo,
      });

      const sinceDate = since
        ? new Date(since)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const collector = new GitHubCollector();
      const resolver = new IdentityResolver();
      let recordsProcessed = 0;
      let errorsCount = 0;

      await collector.collectRepositoryContributions(
        {
          name: project.name || `${project.githubOrg}/${project.githubRepo}`,
          githubOrg: project.githubOrg,
          githubRepo: project.githubRepo,
          id: project.id,
        },
        sinceDate,
        ({ phase, collected }) => {
          job.updateProgress({ phase, collected });
          if (phase === 'waiting_for_api') {
            db.update(collectionJobs)
              .set({ status: 'waiting_for_api' })
              .where(eq(collectionJobs.id, jobRecordId))
              .catch(() => {});
          } else if (phase === 'resuming') {
            db.update(collectionJobs)
              .set({ status: 'running' })
              .where(eq(collectionJobs.id, jobRecordId))
              .catch(() => {});
          }
        },
        async (phase, records) => {
          if (records.length === 0) return;
          const result = await resolveAndStore(records, project.id, resolver);
          recordsProcessed += result.processed;
          errorsCount += result.errors;
          logger.info(`Phase ${phase} batch persisted`, {
            project: project.name,
            phaseRecords: records.length,
            totalProcessed: recordsProcessed,
          });
          await job.updateProgress({ phase: `${phase}_stored`, stored: recordsProcessed });
        },
        phases,
      );

      await db.update(projects)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(projects.id, projectId));

      await db.update(collectionJobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          recordsProcessed,
          errorsCount,
        })
        .where(eq(collectionJobs.id, jobRecordId));

      logger.info('Collection job completed', {
        jobId: job.id,
        project: project.name,
        recordsProcessed,
        errorsCount,
      });

      return { success: true, recordsProcessed, errorsCount };

    } catch (error) {
      logger.error('Collection job failed', {
        jobId: job.id,
        projectId,
        error: (error as Error).message,
      });

      await db.update(collectionJobs)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorDetails: {
            message: (error as Error).message,
            stack: (error as Error).stack,
          },
        })
        .where(eq(collectionJobs.id, jobRecordId));

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,
    lockDuration: 600_000,
    stalledInterval: 600_000,
    maxStalledCount: 3,
    limiter: {
      max: 10,
      duration: 60000,
    },
  }
);

collectionWorker.on('completed', (job) => {
  logger.info('Collection job completed', { jobId: job.id });
});

collectionWorker.on('failed', async (job, err) => {
  logger.error('Collection job failed', {
    jobId: job?.id,
    error: err.message,
  });

  if (!job) return;
  try {
    const bullmqJobId = job.id;
    await db.update(collectionJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorDetails: { message: err.message, source: 'bullmq_event' },
      })
      .where(
        sql`${collectionJobs.metadata}->>'bullmqJobId' = ${bullmqJobId} AND ${collectionJobs.status} = 'running'`
      );
  } catch (dbErr) {
    logger.error('Failed to update job record on BullMQ failure event', { error: (dbErr as Error).message });
  }
});

collectionWorker.on('error', (err) => {
  logger.error('Collection worker error', { error: err });
});

logger.info('Collection worker started');
