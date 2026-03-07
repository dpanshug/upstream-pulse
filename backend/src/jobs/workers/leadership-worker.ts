/**
 * Leadership Worker
 *
 * Collects leadership positions from a community repository for a given org.
 * Dispatches to the appropriate parsers via LeadershipCollector based on the
 * org registry config.
 *
 * Runs monthly (separate from the weekly OWNERS collection in governance-worker).
 */

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { db } from '../../shared/database/client.js';
import { collectionJobs, leadershipPositions, teamMembers } from '../../shared/database/schema.js';
import { LeadershipCollector } from '../../modules/collection/leadership-collector.js';
import { getOrgConfig, getOrgsWithCommunityRepo } from '../../shared/config/org-registry.js';
import { eq, and } from 'drizzle-orm';

interface LeadershipJobData {
  trigger: 'scheduled' | 'manual';
  githubOrg?: string;
}

const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const leadershipWorker = new Worker<LeadershipJobData>(
  'leadership-refresh',
  async (job: Job<LeadershipJobData>) => {
    const { trigger, githubOrg } = job.data;

    logger.info('Starting leadership refresh job', {
      jobId: job.id,
      trigger,
      githubOrg: githubOrg || 'all',
    });

    // Create job record
    const jobRecordId = randomUUID();
    await db.insert(collectionJobs).values({
      id: jobRecordId,
      jobType: 'leadership_refresh',
      projectId: null,
      status: 'running',
      startedAt: new Date(),
      metadata: { bullmqJobId: job.id, trigger, githubOrg },
    });

    try {
      // Determine which orgs to process
      const orgsToProcess = githubOrg
        ? [getOrgConfig(githubOrg)].filter(Boolean)
        : getOrgsWithCommunityRepo();

      if (orgsToProcess.length === 0) {
        throw new Error(githubOrg
          ? `Org ${githubOrg} not found in registry or has no communityRepo`
          : 'No orgs with communityRepo configured');
      }

      // Get all active team members for matching
      const allTeamMembers = await db.query.teamMembers.findMany({
        where: eq(teamMembers.isActive, true),
      });
      const usernameToTeamMember = new Map(
        allTeamMembers
          .filter(m => m.githubUsername)
          .map(m => [m.githubUsername!.toLowerCase(), m]),
      );

      logger.info(`Found ${allTeamMembers.length} team members for matching`);

      let totalTeamPositions = 0;
      let totalExternalPositions = 0;
      let errorsCount = 0;

      for (const orgCfg of orgsToProcess) {
        if (!orgCfg?.communityRepo) continue;
        const orgSlug = orgCfg.githubOrg;

        try {
          const collector = new LeadershipCollector(orgSlug, orgCfg.communityRepo);
          const positions = await collector.getAllLeadershipPositions();

          logger.info(`Collected ${positions.length} leadership positions for ${orgSlug}`);

          // Mark existing positions for this org as inactive
          await db.update(leadershipPositions)
            .set({ isActive: false, updatedAt: new Date() })
            .where(
              and(
                eq(leadershipPositions.source, 'github_community_repo'),
                eq(leadershipPositions.communityOrg, orgSlug),
              ),
            );

          for (const pos of positions) {
            const teamMember = usernameToTeamMember.get(pos.githubUsername.toLowerCase());

            try {
              const existing = await db.query.leadershipPositions.findFirst({
                where: and(
                  eq(leadershipPositions.githubUsername, pos.githubUsername.toLowerCase()),
                  eq(leadershipPositions.positionType, pos.positionType),
                  eq(leadershipPositions.committeeName, pos.groupName),
                  eq(leadershipPositions.source, 'github_community_repo'),
                  eq(leadershipPositions.communityOrg, orgSlug),
                ),
              });

              const startDate = pos.termStart
                ? new Date(pos.termStart.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$1-$2'))
                : new Date();
              const endDate = pos.termEnd
                ? new Date(pos.termEnd.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$1-$2'))
                : null;

              // Use the positionType directly as part of the role title
              const roleTitle = pos.positionType
                .replace(/_/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());

              if (existing) {
                await db.update(leadershipPositions)
                  .set({
                    isActive: pos.isActive,
                    roleTitle,
                    teamMemberId: teamMember?.id || null,
                    externalName: pos.name,
                    organization: pos.organization || null,
                    startDate: startDate.toISOString().split('T')[0],
                    endDate: endDate ? endDate.toISOString().split('T')[0] : null,
                    evidenceUrl: pos.sourceUrl,
                    updatedAt: new Date(),
                  })
                  .where(eq(leadershipPositions.id, existing.id));
              } else {
                await db.insert(leadershipPositions).values({
                  teamMemberId: teamMember?.id || null,
                  githubUsername: pos.githubUsername.toLowerCase(),
                  externalName: pos.name,
                  organization: pos.organization || null,
                  communityOrg: orgSlug,
                  projectId: null,
                  positionType: pos.positionType,
                  committeeName: pos.groupName,
                  roleTitle,
                  startDate: startDate.toISOString().split('T')[0],
                  endDate: endDate ? endDate.toISOString().split('T')[0] : null,
                  isActive: pos.isActive,
                  votingRights: false,
                  source: 'github_community_repo',
                  evidenceUrl: pos.sourceUrl,
                });
              }

              if (teamMember) totalTeamPositions++;
              else totalExternalPositions++;
            } catch (posError) {
              logger.warn(`Error storing leadership position for @${pos.githubUsername}`, {
                error: (posError as Error).message,
              });
              errorsCount++;
            }
          }
        } catch (orgError) {
          logger.error(`Error processing org ${orgSlug}`, {
            error: (orgError as Error).message,
          });
          errorsCount++;
        }
      }

      await job.updateProgress(100);

      await db.update(collectionJobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          recordsProcessed: totalTeamPositions + totalExternalPositions,
          errorsCount,
          metadata: {
            bullmqJobId: job.id,
            trigger,
            githubOrg,
            teamPositions: totalTeamPositions,
            externalPositions: totalExternalPositions,
            orgsProcessed: orgsToProcess.length,
          },
        })
        .where(eq(collectionJobs.id, jobRecordId));

      logger.info('Leadership refresh job completed', {
        jobId: job.id,
        teamPositions: totalTeamPositions,
        externalPositions: totalExternalPositions,
        errorsCount,
      });

      return {
        success: true,
        teamPositions: totalTeamPositions,
        externalPositions: totalExternalPositions,
        errorsCount,
      };

    } catch (error) {
      logger.error('Leadership refresh job failed', {
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

leadershipWorker.on('completed', (job) => {
  logger.info('Leadership refresh job completed', { jobId: job.id });
});

leadershipWorker.on('failed', (job, err) => {
  logger.error('Leadership refresh job failed', {
    jobId: job?.id,
    error: err.message,
  });
});

leadershipWorker.on('error', (err) => {
  logger.error('Leadership worker error', { error: err });
});

logger.info('Leadership worker started');
