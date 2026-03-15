/**
 * Governance Worker
 *
 * Collects maintainer/reviewer data from OWNERS or CODEOWNERS files
 * depending on the org's configured governance model.
 *
 * Runs weekly to refresh maintainer status for all tracked projects.
 */

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { db } from '../../shared/database/client.js';
import { projects, collectionJobs, maintainerStatus, teamMembers } from '../../shared/database/schema.js';
import { GitHubCollector } from '../../modules/collection/github-collector.js';
import { CodeownersParser } from '../../modules/collection/codeowners-parser.js';
import { getOrgConfig } from '../../shared/config/org-registry.js';
import { eq, and } from 'drizzle-orm';

interface GovernanceJobData {
  projectId?: string;
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
      const projectsToProcess = projectId
        ? await db.query.projects.findMany({ where: eq(projects.id, projectId) })
        : await db.query.projects.findMany({ where: eq(projects.trackingEnabled, true) });

      if (projectsToProcess.length === 0) {
        throw new Error(projectId ? `Project not found: ${projectId}` : 'No projects to process');
      }

      logger.info(`Processing ${projectsToProcess.length} project(s) for governance refresh`);

      const allTeamMembers = await db.query.teamMembers.findMany({
        where: eq(teamMembers.isActive, true),
      });
      const usernameToTeamMember = new Map(
        allTeamMembers
          .filter(m => m.githubUsername)
          .map(m => [m.githubUsername!.toLowerCase(), m]),
      );

      const ownersCollector = new GitHubCollector();
      const codeownersParser = new CodeownersParser();
      let totalOwnersProcessed = 0;
      let totalProjectsProcessed = 0;
      let errorsCount = 0;

      for (const project of projectsToProcess) {
        try {
          // Determine governance model from org registry; default to 'owners'
          const orgCfg = getOrgConfig(project.githubOrg);
          const model = orgCfg?.repoGovernanceOverride?.[project.githubRepo] ?? orgCfg?.governanceModel ?? 'owners';

          if (model === 'none') {
            logger.debug(`Skipping governance for ${project.name} (model=none)`);
            totalProjectsProcessed++;
            continue;
          }

          logger.info(`Collecting ${model} for ${project.githubOrg}/${project.githubRepo}`);

          // Mark ALL existing governance entries as inactive for this project
          // (scope by projectId only, not source, so switching models doesn't orphan rows)
          await db.update(maintainerStatus)
            .set({ isActive: false, updatedAt: new Date() })
            .where(
              and(
                eq(maintainerStatus.projectId, project.id),
                // Only clear entries from automated governance parsers
                eq(maintainerStatus.source, model === 'codeowners' ? 'CODEOWNERS' : 'OWNERS_file'),
              ),
            );

          if (model === 'owners') {
            const ownersMaintainers = await ownersCollector.getOwnersAsMaintainers(
              project.githubOrg,
              project.githubRepo,
            );

            logger.info(`Found ${ownersMaintainers.length} maintainers in OWNERS files for ${project.name}`);

            for (const owner of ownersMaintainers) {
              const teamMember = usernameToTeamMember.get(owner.username.toLowerCase());
              let positionType = 'maintainer';
              if (owner.role === 'reviewer') positionType = 'reviewer';
              else if (owner.roleTitle === 'Project Lead' || owner.roleTitle === 'Owner') positionType = owner.roleTitle.toLowerCase().replace(' ', '_');
              const isRoot = owner.paths.some(p => p === '/' || p === '');
              const scope = isRoot ? 'root' : 'component';
              const pathsNote = (() => {
                const full = `Paths: ${owner.paths.join(', ')}`;
                if (full.length <= 4900) return full;
                return `Paths: ${owner.paths.slice(0, 20).join(', ')} ... and ${owner.paths.length - 20} more`;
              })();

              try {
                const existing = await db.query.maintainerStatus.findFirst({
                  where: and(
                    eq(maintainerStatus.projectId, project.id),
                    eq(maintainerStatus.githubUsername, owner.username.toLowerCase()),
                    eq(maintainerStatus.source, 'OWNERS_file'),
                  ),
                });

                if (existing) {
                  await db.update(maintainerStatus)
                    .set({
                      positionType,
                      teamMemberId: teamMember?.id || null,
                      isActive: true,
                      scope,
                      evidenceUrl: owner.sources[0],
                      notes: pathsNote,
                      updatedAt: new Date(),
                    })
                    .where(eq(maintainerStatus.id, existing.id));
                } else {
                  await db.insert(maintainerStatus).values({
                    projectId: project.id,
                    teamMemberId: teamMember?.id || null,
                    githubUsername: owner.username.toLowerCase(),
                    positionType,
                    positionTitle: owner.roleTitle,
                    isActive: true,
                    scope,
                    source: 'OWNERS_file',
                    evidenceUrl: owner.sources[0],
                    notes: pathsNote,
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
          } else if (model === 'codeowners') {
            const entries = await codeownersParser.parse(project.githubOrg, project.githubRepo);

            logger.info(`Found ${entries.length} CODEOWNERS entries for ${project.name}`);

            for (const entry of entries) {
              const teamMember = usernameToTeamMember.get(entry.username.toLowerCase());

              try {
                const existing = await db.query.maintainerStatus.findFirst({
                  where: and(
                    eq(maintainerStatus.projectId, project.id),
                    eq(maintainerStatus.githubUsername, entry.username.toLowerCase()),
                    eq(maintainerStatus.source, 'CODEOWNERS'),
                  ),
                });

                if (existing) {
                  await db.update(maintainerStatus)
                    .set({
                      positionType: 'maintainer',
                      teamMemberId: teamMember?.id || null,
                      isActive: true,
                      scope: 'root',
                      evidenceUrl: entry.source,
                      notes: `Paths: ${entry.paths.join(', ')}`,
                      updatedAt: new Date(),
                    })
                    .where(eq(maintainerStatus.id, existing.id));
                } else {
                  await db.insert(maintainerStatus).values({
                    projectId: project.id,
                    teamMemberId: teamMember?.id || null,
                    githubUsername: entry.username.toLowerCase(),
                    positionType: 'maintainer',
                    positionTitle: 'Code Owner',
                    isActive: true,
                    scope: 'root',
                    source: 'CODEOWNERS',
                    evidenceUrl: entry.source,
                    notes: `Paths: ${entry.paths.join(', ')}`,
                  });
                }
                totalOwnersProcessed++;
              } catch (entryError) {
                logger.warn(`Error storing CODEOWNERS status for @${entry.username}`, {
                  error: (entryError as Error).message,
                });
                errorsCount++;
              }
            }
          }

          totalProjectsProcessed++;

          const progress = Math.round((totalProjectsProcessed / projectsToProcess.length) * 100);
          await job.updateProgress(progress);
        } catch (projectError) {
          logger.warn(`Error processing governance for ${project.name}`, {
            error: (projectError as Error).message,
          });
          errorsCount++;
        }
      }

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
    concurrency: 1,
  },
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
