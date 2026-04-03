/**
 * Team Sync Worker
 *
 * Syncs team members from a GitHub organization into the local database.
 * Supports multiple orgs — each member is tagged with a `sourceOrg` so
 * deactivation is scoped per-org and syncing org B won't deactivate org A's members.
 *
 * Only manages records with source='github_org_sync' -- manually-added
 * members are never touched by the deactivation logic.
 */

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { db } from '../../shared/database/client.js';
import { collectionJobs, teamMembers } from '../../shared/database/schema.js';
import { fetchGitHubOrgMembers, fetchGitHubUser } from '../../shared/utils/github.js';
import { eq, sql } from 'drizzle-orm';

interface TeamSyncJobData {
  trigger: 'scheduled' | 'manual';
  org: string;
}

interface SyncStats {
  added: number;
  updated: number;
  deactivated: number;
  reactivated: number;
  unchanged: number;
  errors: number;
  relinked: number;
}

const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const teamSyncWorker = new Worker<TeamSyncJobData>(
  'team-sync',
  async (job: Job<TeamSyncJobData>) => {
    const { trigger, org } = job.data;

    logger.info('Starting team sync job', { jobId: job.id, org, trigger });

    const jobRecordId = randomUUID();
    await db.insert(collectionJobs).values({
      id: jobRecordId,
      jobType: 'team_sync',
      projectId: null,
      status: 'running',
      startedAt: new Date(),
      metadata: { bullmqJobId: job.id, trigger, org },
    });

    const stats: SyncStats = {
      added: 0,
      updated: 0,
      deactivated: 0,
      reactivated: 0,
      unchanged: 0,
      errors: 0,
      relinked: 0,
    };

    try {
      const orgMembers = await fetchGitHubOrgMembers(org);

      if (orgMembers.length === 0) {
        logger.warn(`No members returned from GitHub org ${org} — check token scope (read:org)`);
        await db.update(collectionJobs).set({
          status: 'completed',
          completedAt: new Date(),
          recordsProcessed: 0,
          metadata: { bullmqJobId: job.id, trigger, org, warning: 'zero_members_returned' },
        }).where(eq(collectionJobs.id, jobRecordId));
        return stats;
      }

      const orgMemberIds = new Set(orgMembers.map(m => m.id));

      const existingMembers = await db.query.teamMembers.findMany();

      // Index existing members by github_user_id and github_username for fast lookup
      const byGitHubId = new Map<number, typeof existingMembers[0]>();
      const byUsername = new Map<string, typeof existingMembers[0]>();
      for (const member of existingMembers) {
        if (member.githubUserId) {
          byGitHubId.set(member.githubUserId, member);
        }
        if (member.githubUsername) {
          byUsername.set(member.githubUsername.toLowerCase(), member);
        }
      }

      logger.info(`Syncing ${orgMembers.length} members from org ${org} against ${existingMembers.length} existing records`);

      // --- Phase 1: Upsert org members ---
      for (const orgMember of orgMembers) {
        try {
          const existing = byGitHubId.get(orgMember.id)
            ?? byUsername.get(orgMember.login.toLowerCase());

          if (existing) {
            const updates: Record<string, unknown> = {};

            // Sync github_user_id if missing (matched by username only)
            if (!existing.githubUserId) {
              updates.githubUserId = orgMember.id;
            }

            // Handle username renames
            if (existing.githubUsername?.toLowerCase() !== orgMember.login.toLowerCase()) {
              updates.githubUsername = orgMember.login;
            }

            // Reactivate if previously deactivated
            if (!existing.isActive) {
              updates.isActive = true;
              updates.endDate = null;
              stats.reactivated++;
              logger.info(`Reactivating returning member: @${orgMember.login}`);
            }

            // Adopt manually-created members that are in the org
            if (existing.source !== 'github_org_sync') {
              updates.source = 'github_org_sync';
            }

            // Set sourceOrg for records that don't have one yet (backfill).
            // Don't overwrite if already set — the original org "owns" the member
            // for deactivation purposes; other orgs still keep them active.
            if (!existing.sourceOrg) {
              updates.sourceOrg = org;
            }

            if (Object.keys(updates).length > 0) {
              updates.updatedAt = new Date();
              await db.update(teamMembers).set(updates).where(eq(teamMembers.id, existing.id));
              if (!updates.isActive) stats.updated++;
            } else {
              stats.unchanged++;
            }
          } else {
            // New member — fetch profile for name/email
            const profile = await fetchGitHubUser(orgMember.login);

            await db.insert(teamMembers).values({
              name: profile?.name || orgMember.login,
              primaryEmail: profile?.email || null,
              githubUsername: orgMember.login,
              githubUserId: orgMember.id,
              department: null,
              role: null,
              isActive: true,
              source: 'github_org_sync',
              sourceOrg: org,
            });

            stats.added++;
            logger.info(`Added new team member from org: @${orgMember.login} (${profile?.name || orgMember.login})`);

            // Small delay between profile fetches to be courteous to the API
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          stats.errors++;
          logger.error(`Error processing org member @${orgMember.login}:`, { error });
        }
      }

      // --- Phase 2: Deactivate departed members (scoped to this org only) ---
      const syncedMembers = existingMembers.filter(
        m => m.source === 'github_org_sync' && m.sourceOrg === org && m.isActive && m.githubUserId
      );

      for (const member of syncedMembers) {
        if (!orgMemberIds.has(member.githubUserId!)) {
          await db.update(teamMembers).set({
            isActive: false,
            endDate: new Date().toISOString().split('T')[0],
            updatedAt: new Date(),
          }).where(eq(teamMembers.id, member.id));

          stats.deactivated++;
          logger.info(`Deactivated departed member: @${member.githubUsername} (${member.name})`);
        }
      }

      // --- Phase 3: Re-link orphaned records across all tables ---
      // When new members are added (or reactivated), match their GitHub username
      // against records that were collected before they were in team_members.
      if (stats.added > 0 || stats.reactivated > 0) {
        // Re-link contributions (author stored in double-encoded metadata jsonb)
        try {
          const result = await db.execute(sql`
            UPDATE contributions c
            SET team_member_id = tm.id
            FROM team_members tm
            WHERE c.team_member_id IS NULL
              AND tm.github_username IS NOT NULL
              AND tm.is_active = true
              AND (c.metadata #>> '{}')::jsonb->>'author' = tm.github_username
          `) as unknown as { rowCount: number };
          stats.relinked += result.rowCount;
          logger.info(`Re-linked ${result.rowCount} orphaned contributions to team members`);
        } catch (error) {
          logger.error('Error re-linking orphaned contributions', { error });
        }

        // Re-link governance roles (maintainer_status)
        try {
          const result = await db.execute(sql`
            UPDATE maintainer_status ms
            SET team_member_id = tm.id
            FROM team_members tm
            WHERE ms.team_member_id IS NULL
              AND ms.github_username IS NOT NULL
              AND tm.github_username IS NOT NULL
              AND tm.is_active = true
              AND ms.github_username = tm.github_username
          `) as unknown as { rowCount: number };
          stats.relinked += result.rowCount;
          logger.info(`Re-linked ${result.rowCount} orphaned governance roles to team members`);
        } catch (error) {
          logger.error('Error re-linking orphaned governance roles', { error });
        }

        // Re-link leadership positions
        try {
          const result = await db.execute(sql`
            UPDATE leadership_positions lp
            SET team_member_id = tm.id
            FROM team_members tm
            WHERE lp.team_member_id IS NULL
              AND lp.github_username IS NOT NULL
              AND tm.github_username IS NOT NULL
              AND tm.is_active = true
              AND lp.github_username = tm.github_username
          `) as unknown as { rowCount: number };
          stats.relinked += result.rowCount;
          logger.info(`Re-linked ${result.rowCount} orphaned leadership positions to team members`);
        } catch (error) {
          logger.error('Error re-linking orphaned leadership positions', { error });
        }
      }

      // Update job record
      await db.update(collectionJobs).set({
        status: 'completed',
        completedAt: new Date(),
        recordsProcessed: stats.added + stats.updated + stats.deactivated + stats.reactivated,
        errorsCount: stats.errors,
        metadata: { bullmqJobId: job.id, trigger, org, stats },
      }).where(eq(collectionJobs.id, jobRecordId));

      logger.info('Team sync completed', { org, stats });

      return stats;

    } catch (error) {
      logger.error('Team sync job failed', { error, org });

      await db.update(collectionJobs).set({
        status: 'failed',
        completedAt: new Date(),
        errorsCount: stats.errors + 1,
        errorDetails: { message: (error as Error).message, stats },
      }).where(eq(collectionJobs.id, jobRecordId));

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

teamSyncWorker.on('completed', (job) => {
  logger.info(`Team sync job ${job.id} completed`);
});

teamSyncWorker.on('failed', (job, error) => {
  logger.error(`Team sync job ${job?.id} failed: ${error.message}`);
});
