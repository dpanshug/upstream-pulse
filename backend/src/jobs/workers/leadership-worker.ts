/**
 * Leadership Worker
 * 
 * Collects leadership positions (Steering Committee, WG/SIG Chairs and Tech Leads)
 * from the kubeflow/community repository.
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
import { eq, and } from 'drizzle-orm';

interface LeadershipJobData {
  trigger: 'scheduled' | 'manual';
}

const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const leadershipWorker = new Worker<LeadershipJobData>(
  'leadership-refresh',
  async (job: Job<LeadershipJobData>) => {
    const { trigger } = job.data;

    logger.info('Starting leadership refresh job', {
      jobId: job.id,
      trigger,
    });

    // Create job record
    const jobRecordId = randomUUID();
    await db.insert(collectionJobs).values({
      id: jobRecordId,
      jobType: 'leadership_refresh',
      projectId: null, // Leadership is org-wide, not project-specific
      status: 'running',
      startedAt: new Date(),
      metadata: { bullmqJobId: job.id, trigger },
    });

    try {
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

      logger.info(`Found ${allTeamMembers.length} team members for matching`);

      // Collect all leadership positions
      const collector = new LeadershipCollector();
      const positions = await collector.getAllLeadershipPositions();

      logger.info(`Collected ${positions.length} leadership positions from community repo`);

      // Mark all existing leadership positions as inactive before updating
      // This handles cases where someone was removed from leadership
      await db.update(leadershipPositions)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(leadershipPositions.source, 'github_community_repo'));

      let teamPositionsCount = 0;
      let externalPositionsCount = 0;
      let errorsCount = 0;

      // Process each position (both team members and external community members)
      for (const pos of positions) {
        const teamMember = usernameToTeamMember.get(pos.githubUsername.toLowerCase());
        const isTeamMember = !!teamMember;

        try {
          // Check if entry already exists - use githubUsername as the unique key for all positions
          const existing = await db.query.leadershipPositions.findFirst({
            where: and(
              eq(leadershipPositions.githubUsername, pos.githubUsername.toLowerCase()),
              eq(leadershipPositions.positionType, pos.positionType),
              eq(leadershipPositions.committeeName, pos.groupName),
              eq(leadershipPositions.source, 'github_community_repo')
            ),
          });

          // Format dates if provided (steering committee has term dates)
          const startDate = pos.termStart 
            ? new Date(pos.termStart.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$1-$2'))
            : new Date();

          const endDate = pos.termEnd
            ? new Date(pos.termEnd.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$1-$2'))
            : null;

          // Map position type to role title
          const roleTitle = {
            'steering_committee': 'Steering Committee Member',
            'wg_chair': 'Working Group Chair',
            'wg_tech_lead': 'Working Group Tech Lead',
            'sig_chair': 'SIG Chair',
            'sig_tech_lead': 'SIG Tech Lead',
          }[pos.positionType];

          if (existing) {
            // Update existing entry
            await db.update(leadershipPositions)
              .set({
                isActive: true,
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
            // Insert new entry
            await db.insert(leadershipPositions).values({
              teamMemberId: teamMember?.id || null,
              githubUsername: pos.githubUsername.toLowerCase(),
              externalName: pos.name,
              organization: pos.organization || null,
              projectId: null, // Leadership positions are org-wide
              positionType: pos.positionType,
              committeeName: pos.groupName,
              roleTitle,
              startDate: startDate.toISOString().split('T')[0],
              endDate: endDate ? endDate.toISOString().split('T')[0] : null,
              isActive: true,
              votingRights: pos.positionType === 'steering_committee', // Only SC has voting rights
              source: 'github_community_repo',
              evidenceUrl: pos.sourceUrl,
            });
          }

          if (isTeamMember) {
            teamPositionsCount++;
          } else {
            externalPositionsCount++;
          }
        } catch (posError) {
          logger.warn(`Error storing leadership position for @${pos.githubUsername}`, {
            error: (posError as Error).message,
          });
          errorsCount++;
        }
      }

      // Update job progress
      await job.updateProgress(100);

      // Mark job as completed
      await db.update(collectionJobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          recordsProcessed: teamPositionsCount + externalPositionsCount,
          errorsCount,
          metadata: {
            bullmqJobId: job.id,
            trigger,
            totalPositions: positions.length,
            teamPositions: teamPositionsCount,
            externalPositions: externalPositionsCount,
          },
        })
        .where(eq(collectionJobs.id, jobRecordId));

      logger.info('Leadership refresh job completed', {
        jobId: job.id,
        totalPositions: positions.length,
        teamPositions: teamPositionsCount,
        externalPositions: externalPositionsCount,
        errorsCount,
      });

      return {
        success: true,
        totalPositions: positions.length,
        teamPositions: teamPositionsCount,
        externalPositions: externalPositionsCount,
        errorsCount,
      };

    } catch (error) {
      logger.error('Leadership refresh job failed', {
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
    concurrency: 1, // Only one leadership job at a time
  }
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
