import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { db } from '../../shared/database/client.js';
import { projects, collectionJobs, maintainerStatus, teamMembers } from '../../shared/database/schema.js';
import { GitHubCollector } from '../../modules/collection/github-collector.js';
import { eq, and } from 'drizzle-orm';

interface GovernanceJobData {
  projectId?: string; // If provided, only refresh this project; otherwise refresh all
  trigger: 'new_project' | 'scheduled' | 'manual';
}

const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const governanceWorker = new Worker<GovernanceJobData>(
  'governance-refresh',
  async (job: Job<GovernanceJobData>) => {
    const { projectId, trigger } = job.data;

    logger.info('Starting governance refresh job', {
      jobId: job.id,
      projectId: projectId || 'all',
      trigger,
    });

    // Create job record
    const jobRecordId = randomUUID();
    await db.insert(collectionJobs).values({
      id: jobRecordId,
      jobType: 'governance_refresh',
      projectId: projectId || null,
      status: 'running',
      startedAt: new Date(),
      metadata: { bullmqJobId: job.id, trigger },
    });

    try {
      // Get projects to process
      const projectsToProcess = projectId
        ? await db.query.projects.findMany({
            where: eq(projects.id, projectId),
          })
        : await db.query.projects.findMany({
            where: eq(projects.trackingEnabled, true),
          });

      if (projectsToProcess.length === 0) {
        throw new Error(projectId ? `Project not found: ${projectId}` : 'No projects to process');
      }

      logger.info(`Processing ${projectsToProcess.length} project(s) for governance refresh`);

      // Get all active team members for matching
      const allTeamMembers = await db.query.teamMembers.findMany({
        where: eq(teamMembers.isActive, true),
      });

      // Create a map of GitHub usernames (lowercase) to team member IDs
      const usernameToTeamMember = new Map(
        allTeamMembers
          .filter(m => m.githubUsername)
          .map(m => [m.githubUsername!.toLowerCase(), m])
      );

      const collector = new GitHubCollector();
      let totalOwnersProcessed = 0;
      let totalProjectsProcessed = 0;
      let errorsCount = 0;

      for (const project of projectsToProcess) {
        try {
          logger.info(`Collecting OWNERS for ${project.githubOrg}/${project.githubRepo}`);

          const ownersMaintainers = await collector.getOwnersAsMaintainers(
            project.githubOrg,
            project.githubRepo
          );

          logger.info(`Found ${ownersMaintainers.length} maintainers in OWNERS files for ${project.name}`);

          // Mark existing OWNERS-sourced entries as inactive before updating
          // This handles cases where someone was removed from OWNERS files
          await db.update(maintainerStatus)
            .set({ isActive: false, updatedAt: new Date() })
            .where(
              and(
                eq(maintainerStatus.projectId, project.id),
                eq(maintainerStatus.source, 'OWNERS_file')
              )
            );

          // Store maintainer status for each owner
          for (const owner of ownersMaintainers) {
            const teamMember = usernameToTeamMember.get(owner.username.toLowerCase());

            if (!teamMember) {
              logger.debug(`OWNERS entry for non-team member: @${owner.username} (${owner.role})`);
              continue;
            }

            // Map role to position type
            const positionType = owner.role === 'approver' ? 'maintainer' : 'reviewer';

            try {
              // Check if entry already exists
              const existing = await db.query.maintainerStatus.findFirst({
                where: and(
                  eq(maintainerStatus.projectId, project.id),
                  eq(maintainerStatus.teamMemberId, teamMember.id),
                  eq(maintainerStatus.source, 'OWNERS_file')
                ),
              });

              if (existing) {
                // Update existing entry
                await db.update(maintainerStatus)
                  .set({
                    positionType,
                    isActive: true,
                    evidenceUrl: owner.sources[0],
                    notes: `Paths: ${owner.paths.join(', ')}`,
                    updatedAt: new Date(),
                  })
                  .where(eq(maintainerStatus.id, existing.id));
              } else {
                // Insert new entry
                await db.insert(maintainerStatus).values({
                  projectId: project.id,
                  teamMemberId: teamMember.id,
                  positionType,
                  positionTitle: owner.role === 'approver' ? 'Approver' : 'Reviewer',
                  isActive: true,
                  source: 'OWNERS_file',
                  evidenceUrl: owner.sources[0],
                  notes: `Paths: ${owner.paths.join(', ')}`,
                });
              }

              totalOwnersProcessed++;
            } catch (ownerError) {
              logger.warn(`Error storing maintainer status for @${owner.username}`, {
                error: (ownerError as Error).message,
              });
              errorsCount++;
            }
          }

          totalProjectsProcessed++;

          // Update progress
          const progress = Math.round((totalProjectsProcessed / projectsToProcess.length) * 100);
          await job.updateProgress(progress);

        } catch (projectError) {
          logger.warn(`Error processing OWNERS for ${project.name}`, {
            error: (projectError as Error).message,
          });
          errorsCount++;
        }
      }

      // Mark job as completed
      await db.update(collectionJobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          recordsProcessed: totalOwnersProcessed,
          errorsCount,
          metadata: {
            bullmqJobId: job.id,
            trigger,
            projectsProcessed: totalProjectsProcessed,
          },
        })
        .where(eq(collectionJobs.id, jobRecordId));

      logger.info('Governance refresh job completed', {
        jobId: job.id,
        projectsProcessed: totalProjectsProcessed,
        ownersProcessed: totalOwnersProcessed,
        errorsCount,
      });

      return {
        success: true,
        projectsProcessed: totalProjectsProcessed,
        ownersProcessed: totalOwnersProcessed,
        errorsCount,
      };

    } catch (error) {
      logger.error('Governance refresh job failed', {
        jobId: job.id,
        error: (error as Error).message,
      });

      // Mark job as failed
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
    concurrency: 1, // Only one governance job at a time
  }
);

governanceWorker.on('completed', (job) => {
  logger.info('Governance refresh job completed', { jobId: job.id });
});

governanceWorker.on('failed', (job, err) => {
  logger.error('Governance refresh job failed', {
    jobId: job?.id,
    error: err.message,
  });
});

governanceWorker.on('error', (err) => {
  logger.error('Governance worker error', { error: err });
});

logger.info('Governance worker started');
