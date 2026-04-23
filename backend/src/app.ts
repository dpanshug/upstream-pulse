import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config, validateConfig } from './shared/config/index.js';

const __app_dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__app_dirname, '../package.json'), 'utf-8'));
import { logger } from './shared/utils/logger.js';
import { db } from './shared/database/client.js';
import { teamMembers, projects } from './shared/database/schema.js';
import { eq, sql, count, and } from 'drizzle-orm';
import { registerIdentityMiddleware } from './shared/middleware/identity.js';
import { requireAdmin } from './shared/middleware/admin-guard.js';

// Validate configuration on startup
try {
  validateConfig();
} catch (error) {
  logger.error('Configuration validation failed', { error });
  process.exit(1);
}

// Create Fastify instance
const app = Fastify({
  logger: {
    level: config.logLevel,
  },
  requestIdHeader: 'x-request-id',
  disableRequestLogging: false,
});

// Register plugins
await app.register(cors, {
  origin: true, // Allow all origins in development
  credentials: true,
});

await app.register(websocket);

// Identity middleware — extracts user from gateway headers on every request
registerIdentityMiddleware(app);

// Health check endpoint
app.get('/health', async (request, reply) => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
});

// Ready check (includes database)
app.get('/ready', async (request, reply) => {
  try {
    // Check database connection
    await db.execute(sql`SELECT 1`);

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      database: 'connected',
    };
  } catch (error) {
    reply.status(503);
    return {
      status: 'not ready',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: (error as Error).message,
    };
  }
});

// Public config (safe to expose — no secrets)
app.get('/api/config', async () => ({
  orgName: config.orgName,
  orgDescription: config.orgDescription,
  orgDocsUrl: config.orgDocsUrl,
  adminContactName: config.adminContactName || undefined,
  adminContactUrl: config.adminContactUrl || undefined,
  version: pkg.version,
}));

// Current user identity (read from gateway headers + resolved team member)
import { resolveTeamMember } from './shared/middleware/resolve-team-member.js';

app.get('/api/auth/me', async (request) => {
  const resolved = await resolveTeamMember(
    request.identity.email || undefined,
    request.identity.username || undefined,
  );

  return {
    username: request.identity.username,
    email: request.identity.email,
    groups: request.identity.groups,
    isAdmin: request.identity.isAdmin,
    teamMemberId: resolved?.id ?? null,
    teamMemberName: resolved?.name ?? null,
    githubUsername: resolved?.githubUsername ?? null,
    avatarUrl: resolved?.avatarUrl ?? null,
  };
});

// Register API routes
import { metricsRoutes } from './modules/api/routes/metrics.js';
await app.register(metricsRoutes);

// GitHub repo info (for the Add Project form)
app.get<{
  Querystring: { org: string; repo: string };
}>('/api/github/repo-info', { preHandler: [requireAdmin] }, async (request, reply) => {
  const { org, repo } = request.query;
  if (!org || !repo) {
    reply.status(400);
    return { error: 'org and repo query params are required' };
  }

  const { fetchGitHubRepoInfo } = await import('./shared/utils/github.js');
  const info = await fetchGitHubRepoInfo(org, repo);
  if (!info) {
    reply.status(404);
    return { error: `Repository ${org}/${repo} not found on GitHub` };
  }

  return info;
});

// Projects API
app.get<{
  Querystring: { githubOrg?: string };
}>('/api/projects', async (request, reply) => {
  try {
    const { githubOrg } = request.query;
    const projectsList = await db.query.projects.findMany({
      where: (projects, { eq, and: drizzleAnd }) => {
        const conditions = [eq(projects.trackingEnabled, true)];
        if (githubOrg) conditions.push(eq(projects.githubOrg, githubOrg));
        return drizzleAnd(...conditions);
      },
    });

    return {
      projects: projectsList,
      total: projectsList.length,
    };
  } catch (error) {
    logger.error('Error fetching projects', { error });
    reply.status(500);
    return {
      error: 'Failed to fetch projects',
      message: (error as Error).message,
    };
  }
});

// Add new project
app.post<{
  Body: {
    name: string;
    githubOrg: string;
    githubRepo: string;
    ecosystem?: string;
    primaryLanguage?: string;
    startCollection?: boolean;
    fullHistory?: boolean;
  };
}>('/api/projects', { preHandler: [requireAdmin] }, async (request, reply) => {
  const { name, githubOrg, githubRepo, ecosystem, primaryLanguage, startCollection, fullHistory } = request.body;

  if (!name || !githubOrg || !githubRepo) {
    reply.status(400);
    return { error: 'name, githubOrg, and githubRepo are required' };
  }

  // Validate repo exists on GitHub and get creation date
  const { fetchGitHubRepoInfo } = await import('./shared/utils/github.js');
  const repoInfo = await fetchGitHubRepoInfo(githubOrg, githubRepo);

  if (!repoInfo) {
    reply.status(404);
    return { error: `Repository ${githubOrg}/${githubRepo} not found on GitHub` };
  }

  const repoCreatedAt = new Date(repoInfo.createdAt);

  // ── Step 1: Insert project (must succeed) ──────────────────────
  let newProject;
  try {
    [newProject] = await db.insert(projects).values({
      name,
      githubOrg,
      githubRepo,
      ecosystem: ecosystem || 'unknown',
      primaryLanguage: primaryLanguage || repoInfo.language || undefined,
      trackingEnabled: true,
    }).returning();
  } catch (error) {
    if ((error as any).code === '23505') {
      reply.status(409);
      return { error: 'This repository is already being tracked' };
    }
    logger.error('Error inserting project', { error });
    reply.status(500);
    return { error: 'Failed to create project', message: (error as Error).message };
  }

  logger.info(`Created project: ${name} (${githubOrg}/${githubRepo})`, { id: newProject.id });

  // ── Step 2: Queue background jobs (best-effort) ────────────────
  const jobs: { governance?: string; leadership?: string; collection?: string } = {};
  const jobErrors: string[] = [];

  try {
    const { CollectionScheduler } = await import('./jobs/scheduler.js');
    const scheduler = new CollectionScheduler();

    // Governance (OWNERS/CODEOWNERS) — always for new projects
    try {
      const govJob = await scheduler.triggerProjectGovernance(newProject.id, 'new_project');
      jobs.governance = govJob.id;
    } catch (e) {
      logger.error('Failed to queue governance job', { error: e, projectId: newProject.id });
      jobErrors.push('governance');
    }

    // Leadership — if org has a communityRepo and no data yet
    try {
      const { getOrgConfig } = await import('./shared/config/org-registry.js');
      const orgCfg = getOrgConfig(githubOrg);
      if (orgCfg?.communityRepo) {
        const { leadershipPositions: lpTable } = await import('./shared/database/schema.js');
        const existing = await db.query.leadershipPositions.findFirst({
          where: eq(lpTable.communityOrg, githubOrg),
        });
        if (!existing) {
          const ldJob = await scheduler.triggerManualLeadershipRefresh(githubOrg);
          jobs.leadership = ldJob.id;
        }
      }
    } catch (e) {
      logger.error('Failed to queue leadership job', { error: e, githubOrg });
      jobErrors.push('leadership');
    }

    // Contribution collection — optional
    if (startCollection) {
      try {
        const colJob = await scheduler.triggerProjectCollection(newProject.id, repoCreatedAt);
        jobs.collection = colJob.id;
        logger.info(`Queued contribution collection for ${name}`, { since: repoCreatedAt.toISOString() });
      } catch (e) {
        logger.error('Failed to queue collection job', { error: e, projectId: newProject.id });
        jobErrors.push('collection');
      }
    }
  } catch (error) {
    logger.error('Failed to initialize scheduler (Redis may be unavailable)', { error });
    jobErrors.push('scheduler');
  }

  return {
    success: true,
    project: newProject,
    repoCreatedAt: repoCreatedAt.toISOString(),
    collection: jobs.collection ? { jobId: jobs.collection, since: fullHistory ? repoCreatedAt.toISOString() : undefined } : null,
    governance: jobs.governance ? { jobId: jobs.governance } : null,
    leadership: jobs.leadership ? { jobId: jobs.leadership } : null,
    jobErrors: jobErrors.length > 0 ? jobErrors : undefined,
  };
});

// Team members API
app.get('/api/team-members', async (request, reply) => {
  try {
    const members = await db.query.teamMembers.findMany({
      where: (teamMembers, { eq }) => eq(teamMembers.isActive, true),
    });

    return {
      members,
      total: members.length,
    };
  } catch (error) {
    logger.error('Error fetching team members', { error });
    reply.status(500);
    return {
      error: 'Failed to fetch team members',
      message: (error as Error).message,
    };
  }
});

// Add new team member
app.post<{
  Body: {
    name: string;
    primaryEmail: string;
    githubUsername?: string;
    department?: string;
    role?: string;
  };
}>('/api/team-members', { preHandler: [requireAdmin] }, async (request, reply) => {
  try {
    const { name, primaryEmail, githubUsername, department, role } = request.body;

    if (!name) {
      reply.status(400);
      return { error: 'name is required' };
    }

    // Require at least one identifier (email or GitHub username)
    if (!primaryEmail && !githubUsername) {
      reply.status(400);
      return { error: 'Either primaryEmail or githubUsername is required' };
    }

    // Auto-fetch GitHub user ID if username is provided (soft failure - don't block creation)
    let githubUserId: number | null = null;
    if (githubUsername) {
      try {
        const { fetchGitHubUserId } = await import('./shared/utils/github.js');
        githubUserId = await fetchGitHubUserId(githubUsername);
        if (githubUserId) {
          logger.info(`Fetched GitHub user ID for @${githubUsername}: ${githubUserId}`);
        } else {
          logger.warn(`GitHub user @${githubUsername} not found, continuing without ID`);
        }
      } catch (error) {
        logger.warn(`Failed to fetch GitHub ID for @${githubUsername}, continuing without it`, { error });
      }
    }

    const [newMember] = await db.insert(teamMembers).values({
      name,
      primaryEmail,
      githubUsername,
      githubUserId,
      department,
      role,
      isActive: true,
    }).returning();

    logger.info(`Created team member: ${name} (@${githubUsername})`);

    // Re-link orphaned contributions/governance records that were collected
    // before this team member existed in the database
    let relinked = { contributions: 0, maintainerStatus: 0, leadershipPositions: 0 };
    if (githubUsername) {
      try {
        const contribResult = await db.execute(sql`
          UPDATE contributions
          SET team_member_id = ${newMember.id}
          WHERE team_member_id IS NULL
            AND LOWER((metadata #>> '{}')::jsonb->>'author') = LOWER(${githubUsername})
        `) as unknown as { count: number; rowCount?: number };
        relinked.contributions = contribResult.count ?? contribResult.rowCount ?? 0;

        const msResult = await db.execute(sql`
          UPDATE maintainer_status
          SET team_member_id = ${newMember.id}
          WHERE team_member_id IS NULL
            AND LOWER(github_username) = LOWER(${githubUsername})
        `) as unknown as { count: number; rowCount?: number };
        relinked.maintainerStatus = msResult.count ?? msResult.rowCount ?? 0;

        const lpResult = await db.execute(sql`
          UPDATE leadership_positions
          SET team_member_id = ${newMember.id}
          WHERE team_member_id IS NULL
            AND LOWER(github_username) = LOWER(${githubUsername})
        `) as unknown as { count: number; rowCount?: number };
        relinked.leadershipPositions = lpResult.count ?? lpResult.rowCount ?? 0;

        if (relinked.contributions > 0 || relinked.maintainerStatus > 0 || relinked.leadershipPositions > 0) {
          logger.info(`Re-linked orphaned records for @${githubUsername}`, relinked);
        }
      } catch (relinkError) {
        logger.warn(`Failed to re-link orphaned records for @${githubUsername}`, { error: relinkError });
      }
    }

    return {
      success: true,
      member: newMember,
      relinked,
    };
  } catch (error) {
    logger.error('Error creating team member', { error });
    
    // Handle duplicate email
    if ((error as any).code === '23505') {
      reply.status(409);
      return { error: 'A team member with this email already exists' };
    }

    reply.status(500);
    return {
      error: 'Failed to create team member',
      message: (error as Error).message,
    };
  }
});

// Collection jobs API
app.post<{
  Body: {
    projectId: string;
    since?: string;        // ISO date string - fetch from this date
    fullHistory?: boolean; // Fetch from repo creation date (day 0)
    phases?: ('commits' | 'pull_requests' | 'reviews' | 'issues')[];
  };
}>('/api/admin/collect', { preHandler: [requireAdmin] }, async (request, reply) => {
  try {
    const { projectId, since, fullHistory, phases } = request.body;

    if (!projectId) {
      reply.status(400);
      return { error: 'projectId is required' };
    }

    // Validate project exists
    const project = await db.query.projects.findFirst({
      where: (projects, { eq }) => eq(projects.id, projectId),
    });

    if (!project) {
      reply.status(404);
      return { error: 'Project not found' };
    }

    const { CollectionScheduler } = await import('./jobs/scheduler.js');
    const scheduler = new CollectionScheduler();

    let sinceDate: Date | undefined;

    if (fullHistory) {
      // Fetch repo creation date from GitHub
      const { fetchGitHubRepoCreatedAt } = await import('./shared/utils/github.js');
      const createdAt = await fetchGitHubRepoCreatedAt(project.githubOrg, project.githubRepo);
      if (createdAt) {
        sinceDate = createdAt;
        logger.info(`Full history sync from repo creation: ${createdAt.toISOString()}`);
      } else {
        reply.status(500);
        return { error: 'Failed to fetch repo creation date from GitHub' };
      }
    } else if (since) {
      const parsedDate = new Date(since);
      if (isNaN(parsedDate.getTime())) {
        reply.status(400);
        return { error: 'Invalid date format for "since" parameter' };
      }
      sinceDate = parsedDate;
    }

    const job = await scheduler.triggerProjectCollection(projectId, sinceDate, phases);

    return {
      success: true,
      jobId: job.id,
      message: fullHistory
        ? `Full history collection queued from ${sinceDate?.toISOString().split('T')[0]}`
        : 'Collection job queued',
      since: sinceDate?.toISOString(),
    };
  } catch (error) {
    logger.error('Error triggering collection', { error });
    reply.status(500);
    return {
      error: 'Failed to trigger collection',
      message: (error as Error).message,
    };
  }
});

// Trigger governance refresh (OWNERS files collection)
app.post<{
  Params: { projectId?: string };
}>('/api/governance/refresh/:projectId?', { preHandler: [requireAdmin] }, async (request, reply) => {
  try {
    const { projectId } = request.params;

    const { CollectionScheduler } = await import('./jobs/scheduler.js');
    const scheduler = new CollectionScheduler();

    let job;
    let message;

    if (projectId) {
      // Validate project exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });

      if (!project) {
        reply.status(404);
        return { error: 'Project not found' };
      }

      job = await scheduler.triggerProjectGovernance(projectId, 'manual');
      message = `Governance refresh queued for ${project.name}`;
      logger.info(message);
    } else {
      // Refresh all projects
      job = await scheduler.triggerGovernanceRefresh();
      message = 'Governance refresh queued for all projects';
      logger.info(message);
    }

    return {
      success: true,
      jobId: job.id,
      message,
    };
  } catch (error) {
    logger.error('Error triggering governance refresh', { error });
    reply.status(500);
    return {
      error: 'Failed to trigger governance refresh',
      message: (error as Error).message,
    };
  }
});

// Manual team sync from GitHub org(s)
app.post<{
  Querystring: { org?: string };
}>('/api/admin/team-sync', { preHandler: [requireAdmin] }, async (request, reply) => {
  try {
    const { CollectionScheduler } = await import('./jobs/scheduler.js');
    const scheduler = new CollectionScheduler();

    const orgFilter = (request.query as { org?: string }).org;

    if (orgFilter && !config.githubTeamOrgs.includes(orgFilter)) {
      reply.status(400);
      return {
        error: `Org "${orgFilter}" is not in the configured GITHUB_TEAM_ORG list`,
        configuredOrgs: config.githubTeamOrgs,
      };
    }

    const jobs = await scheduler.triggerTeamSync('manual', orgFilter);
    const orgs = orgFilter ? [orgFilter] : config.githubTeamOrgs;
    const message = `Team sync queued for ${orgs.length} org(s): ${orgs.join(', ')}`;
    logger.info(message);

    return {
      success: true,
      jobs: jobs.map(j => ({ jobId: j.id, org: j.data.org })),
      orgs,
      message,
    };
  } catch (error) {
    logger.error('Error triggering team sync', { error });
    reply.status(500);
    return {
      error: 'Failed to trigger team sync',
      message: (error as Error).message,
    };
  }
});

// Bulk team member sync from external source
app.post<{
  Body: {
    source: string;
    replacesSources?: string[];
    people: Array<{
      name: string;
      email?: string;
      githubUsername?: string;
      employeeId?: string;
      department?: string;
      role?: string;
    }>;
  };
}>('/api/admin/team-members/sync', { preHandler: [requireAdmin] }, async (request, reply) => {
  try {
    const { source, replacesSources = [], people } = request.body;

    if (!source || typeof source !== 'string') {
      reply.status(400);
      return { error: 'source is required (string label for this sync provider)' };
    }
    if (!Array.isArray(people) || people.length === 0) {
      reply.status(400);
      return { error: 'people array is required and must not be empty' };
    }

    const deactivationSources = [source, ...replacesSources];
    const incomingByUsername = new Map<string, typeof people[0]>();
    const incomingByEmail = new Map<string, typeof people[0]>();
    const duplicateUsernames: string[] = [];

    for (const person of people) {
      if (!person.name || (!person.email && !person.githubUsername)) continue;
      if (person.githubUsername) {
        const lower = person.githubUsername.toLowerCase();
        if (incomingByUsername.has(lower)) {
          duplicateUsernames.push(person.githubUsername);
        }
        incomingByUsername.set(lower, person);
      }
      if (person.email) {
        incomingByEmail.set(person.email.toLowerCase(), person);
      }
    }

    if (duplicateUsernames.length > 0) {
      logger.warn(`Bulk sync: duplicate GitHub usernames in payload`, { duplicateUsernames });
    }

    const existingMembers = await db.query.teamMembers.findMany();
    const existingByUsername = new Map<string, typeof existingMembers[0]>();
    const existingByEmail = new Map<string, typeof existingMembers[0]>();
    for (const m of existingMembers) {
      if (m.githubUsername) existingByUsername.set(m.githubUsername.toLowerCase(), m);
      if (m.primaryEmail) existingByEmail.set(m.primaryEmail.toLowerCase(), m);
    }

    let upserted = 0;
    let inserted = 0;
    const processedIds = new Set<string>();
    const incomingUsernames = new Set<string>();

    for (const person of people) {
      if (!person.name || (!person.email && !person.githubUsername)) continue;
      if (person.githubUsername) incomingUsernames.add(person.githubUsername.toLowerCase());

      const existing =
        (person.githubUsername ? existingByUsername.get(person.githubUsername.toLowerCase()) : undefined) ??
        (person.email ? existingByEmail.get(person.email.toLowerCase()) : undefined);

      if (existing) {
        await db.update(teamMembers).set({
          name: person.name,
          primaryEmail: person.email || existing.primaryEmail,
          githubUsername: person.githubUsername || existing.githubUsername,
          employeeId: person.employeeId || existing.employeeId,
          department: person.department || existing.department,
          role: person.role || existing.role,
          source,
          isActive: true,
          endDate: null,
          updatedAt: new Date(),
        }).where(eq(teamMembers.id, existing.id));
        processedIds.add(existing.id);
        upserted++;
      } else {
        try {
          const [newMember] = await db.insert(teamMembers).values({
            name: person.name,
            primaryEmail: person.email || null,
            githubUsername: person.githubUsername || null,
            employeeId: person.employeeId || null,
            department: person.department || null,
            role: person.role || null,
            source,
            isActive: true,
          }).returning();
          processedIds.add(newMember.id);
          inserted++;
        } catch (insertError) {
          if ((insertError as any).code === '23505') {
            logger.warn(`Bulk sync: skipping duplicate for ${person.name} (${person.email})`, { insertError });
          } else {
            throw insertError;
          }
        }
      }
    }

    // Deactivate stale rows from owned sources
    let deactivated = 0;
    for (const m of existingMembers) {
      if (!m.isActive) continue;
      if (processedIds.has(m.id)) continue;
      if (!m.source || !deactivationSources.includes(m.source)) continue;
      if (m.githubUsername && incomingUsernames.has(m.githubUsername.toLowerCase())) continue;

      await db.update(teamMembers).set({
        isActive: false,
        endDate: new Date().toISOString().split('T')[0],
        updatedAt: new Date(),
      }).where(eq(teamMembers.id, m.id));
      deactivated++;
    }

    // Relink orphaned contributions/maintainer/leadership for new members
    let totalRelinked = 0;
    if (inserted > 0) {
      try {
        const newMembers = await db.query.teamMembers.findMany({
          where: and(eq(teamMembers.source, source), eq(teamMembers.isActive, true)),
        });
        for (const m of newMembers) {
          if (!m.githubUsername || !processedIds.has(m.id)) continue;
          const contribResult = await db.execute(sql`
            UPDATE contributions SET team_member_id = ${m.id}
            WHERE team_member_id IS NULL
              AND LOWER((metadata #>> '{}')::jsonb->>'author') = LOWER(${m.githubUsername})
          `) as unknown as { rowCount?: number };
          const msResult = await db.execute(sql`
            UPDATE maintainer_status SET team_member_id = ${m.id}
            WHERE team_member_id IS NULL AND LOWER(github_username) = LOWER(${m.githubUsername})
          `) as unknown as { rowCount?: number };
          const lpResult = await db.execute(sql`
            UPDATE leadership_positions SET team_member_id = ${m.id}
            WHERE team_member_id IS NULL AND LOWER(github_username) = LOWER(${m.githubUsername})
          `) as unknown as { rowCount?: number };
          totalRelinked += (contribResult.rowCount ?? 0) + (msResult.rowCount ?? 0) + (lpResult.rowCount ?? 0);
        }
      } catch (relinkError) {
        logger.warn('Bulk sync: relink failed (non-fatal)', { error: relinkError });
      }
    }

    // Queue governance + leadership refresh if new members were added
    if (inserted > 0 || totalRelinked > 0) {
      try {
        const { CollectionScheduler } = await import('./jobs/scheduler.js');
        const scheduler = new CollectionScheduler();
        await scheduler.triggerGovernanceRefresh();
        await scheduler.triggerLeadershipRefresh();
      } catch (refreshError) {
        logger.warn('Bulk sync: governance/leadership refresh queue failed (non-fatal)', { error: refreshError });
      }
    }

    logger.info(`Bulk team sync complete`, { source, upserted, inserted, deactivated, relinked: totalRelinked });

    return {
      success: true,
      source,
      upserted,
      inserted,
      deactivated,
      relinked: totalRelinked,
    };
  } catch (error) {
    logger.error('Error in bulk team sync', { error });
    reply.status(500);
    return {
      error: 'Bulk team sync failed',
      message: (error as Error).message,
    };
  }
});

// System status endpoint — exposes worker health, queue stats, job history, schedules
app.get('/api/system/status', async (request, reply) => {
  try {
    const { CollectionScheduler, contributionQueue, governanceQueue, leadershipQueue, teamSyncQueue } = await import('./jobs/scheduler.js');
    const { collectionJobs } = await import('./shared/database/schema.js');

    const scheduler = new CollectionScheduler();

    // Gather queue stats for all workers in parallel
    const [collectionStats, governanceStats, leadershipStats, teamSyncStats] = await Promise.all([
      scheduler.getQueueStats(),
      scheduler.getGovernanceQueueStats(),
      scheduler.getLeadershipQueueStats(),
      scheduler.getTeamSyncQueueStats(),
    ]);

    const recentJobs = await db.query.collectionJobs.findMany({
      orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
      limit: 50,
      with: { project: { columns: { name: true, githubOrg: true, githubRepo: true } } },
    });

    // Aggregate job stats by status
    const jobStatusCounts = recentJobs.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Fetch last successful sync per job type
    const jobTypes = ['sync', 'full_sync', 'governance_refresh', 'leadership_refresh', 'team_sync'];
    const lastSuccessful: Record<string, typeof recentJobs[0] | null> = {};
    for (const jt of jobTypes) {
      const found = recentJobs.find(j => j.jobType === jt && j.status === 'completed');
      lastSuccessful[jt] = found || null;
    }

    // Compute next run times from cron schedules
    const now = new Date();
    function nextCronRun(cronExpr: string): string {
      const parts = cronExpr.split(' ');
      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts.map(p => (p === '*' ? null : parseInt(p, 10)));

      const next = new Date(now);
      next.setSeconds(0, 0);
      if (minute !== null) next.setMinutes(minute);
      if (hour !== null) next.setHours(hour);

      if (dayOfWeek !== null) {
        // Weekly: advance to next matching day of week
        const currentDay = next.getDay();
        let daysAhead = dayOfWeek - currentDay;
        if (daysAhead < 0 || (daysAhead === 0 && next <= now)) daysAhead += 7;
        next.setDate(next.getDate() + daysAhead);
      } else if (dayOfMonth !== null) {
        // Monthly: advance to next matching day of month
        next.setDate(dayOfMonth);
        if (next <= now) next.setMonth(next.getMonth() + 1);
      } else {
        // Daily: if already past today, advance to tomorrow
        if (next <= now) next.setDate(next.getDate() + 1);
      }

      return next.toISOString();
    }

    // Compute uptime
    const uptimeSeconds = process.uptime();

    const workers = [
      {
        id: 'contribution-collection',
        name: 'Contribution Collector',
        description: 'Collects commits, PRs, reviews, and issues from GitHub',
        schedule: { cron: '0 2 * * *', human: 'Daily at 2:00 AM UTC', nextRun: nextCronRun('0 2 * * *') },
        queue: collectionStats,
        lastSuccess: lastSuccessful['sync']?.completedAt || lastSuccessful['full_sync']?.completedAt || null,
        jobTypes: ['sync', 'full_sync'],
      },
      {
        id: 'governance-refresh',
        name: 'Governance Scanner',
        description: 'Refreshes OWNERS files to track maintainer/reviewer roles',
        schedule: { cron: '0 3 * * 1', human: 'Weekly on Mondays at 3:00 AM UTC', nextRun: nextCronRun('0 3 * * 1') },
        queue: governanceStats,
        lastSuccess: lastSuccessful['governance_refresh']?.completedAt || null,
        jobTypes: ['governance_refresh'],
      },
      {
        id: 'leadership-refresh',
        name: 'Leadership Tracker',
        description: 'Collects steering committee and WG/SIG leadership positions',
        schedule: { cron: '0 4 1 * *', human: 'Monthly on the 1st at 4:00 AM UTC', nextRun: nextCronRun('0 4 1 * *') },
        queue: leadershipStats,
        lastSuccess: lastSuccessful['leadership_refresh']?.completedAt || null,
        jobTypes: ['leadership_refresh'],
      },
      {
        id: 'team-sync',
        name: 'Team Synchronizer',
        description: `Syncs team members from GitHub org(s): ${config.githubTeamOrgs.join(', ')}`,
        schedule: { cron: '0 1 * * 1', human: 'Weekly on Mondays at 1:00 AM UTC', nextRun: nextCronRun('0 1 * * 1') },
        queue: teamSyncStats,
        lastSuccess: lastSuccessful['team_sync']?.completedAt || null,
        jobTypes: ['team_sync'],
      },
    ];

    const workersWithHealth = workers.map(w => {
      let health: 'healthy' | 'warning' | 'error' | 'idle' = 'healthy';

      const totalProcessed = w.queue.completed + w.queue.failed;
      const failureRate = totalProcessed > 0 ? w.queue.failed / totalProcessed : 0;

      if (failureRate > 0.5 && w.queue.failed > 3) {
        health = 'error';
      } else if (failureRate > 0.15 && w.queue.failed > 2) {
        health = 'warning';
      } else if (w.queue.active > 0) {
        health = 'healthy';
      }

      if (health !== 'error') {
        if (w.lastSuccess) {
          const lastMs = new Date(w.lastSuccess).getTime();
          const ageHours = (now.getTime() - lastMs) / (1000 * 60 * 60);

          const cronParts = w.schedule.cron.split(' ');
          const hasDayOfWeek = cronParts[4] !== '*';
          const hasDayOfMonth = cronParts[2] !== '*';
          const isMonthly = hasDayOfMonth;
          const isWeekly = !hasDayOfMonth && hasDayOfWeek;
          const isDaily = !hasDayOfMonth && !hasDayOfWeek;

          if (isDaily && ageHours > 48) health = 'warning';
          if (isWeekly && ageHours > 14 * 24) health = 'warning';
          if (isMonthly && ageHours > 60 * 24) health = 'warning';
        }
      }

      if (totalProcessed === 0 && w.queue.active === 0 && !w.lastSuccess) {
        health = 'idle';
      }

      return { ...w, health };
    });

    // Overall system health
    const hasErrors = workersWithHealth.some(w => w.health === 'error');
    const hasWarnings = workersWithHealth.some(w => w.health === 'warning');
    const overallHealth = hasErrors ? 'degraded' : hasWarnings ? 'warning' : 'operational';

    return {
      system: {
        status: overallHealth,
        timestamp: now.toISOString(),
        uptime: uptimeSeconds,
        version: pkg.version,
      },
      workers: workersWithHealth,
      recentJobs: recentJobs.map(j => {
        const meta = j.metadata as Record<string, unknown> | null;
        const scope = j.project
          ? `${j.project.githubOrg}/${j.project.githubRepo}`
          : (meta?.org as string) || (meta?.githubOrg as string) || null;
        return {
          id: j.id,
          jobType: j.jobType,
          status: j.status,
          startedAt: j.startedAt,
          completedAt: j.completedAt,
          recordsProcessed: j.recordsProcessed,
          errorsCount: j.errorsCount,
          errorDetails: j.errorDetails,
          metadata: j.metadata,
          createdAt: j.createdAt,
          projectId: j.projectId,
          scope,
        };
      }),
      jobSummary: {
        total: recentJobs.length,
        ...jobStatusCounts,
      },
    };
  } catch (error) {
    logger.error('Error fetching system status', { error });
    reply.status(500);
    return {
      error: 'Failed to fetch system status',
      message: (error as Error).message,
    };
  }
});

// Manual leadership refresh endpoint
app.post<{
  Body: { githubOrg?: string };
}>('/api/leadership/refresh', { preHandler: [requireAdmin] }, async (request, reply) => {
  try {
    const { githubOrg } = (request.body as { githubOrg?: string }) || {};

    const { CollectionScheduler } = await import('./jobs/scheduler.js');
    const scheduler = new CollectionScheduler();

    const job = await scheduler.triggerManualLeadershipRefresh(githubOrg);
    const message = githubOrg
      ? `Leadership refresh queued for ${githubOrg}`
      : 'Leadership refresh queued for all configured orgs';
    logger.info(message);

    return {
      success: true,
      jobId: job?.id,
      message,
    };
  } catch (error) {
    logger.error('Error triggering leadership refresh', { error });
    reply.status(500);
    return {
      error: 'Failed to trigger leadership refresh',
      message: (error as Error).message,
    };
  }
});

// Org registry endpoint with optional activity stats
app.get<{
  Querystring: { days?: string };
}>('/api/orgs', async (request, reply) => {
  try {
    const { ORG_REGISTRY } = await import('./shared/config/org-registry.js');
    const { metricsService } = await import('./modules/metrics/metrics-service.js');
    const days = parseInt(request.query.days || '30', 10);

    const [orgActivity, projectCounts] = await Promise.all([
      metricsService.getOrgActivity({ days }),
      db.select({
        githubOrg: projects.githubOrg,
        count: count(),
      })
      .from(projects)
      .where(eq(projects.trackingEnabled, true))
      .groupBy(projects.githubOrg),
    ]);

    const activityMap = new Map(orgActivity.map(a => [a.org, a]));
    const projectCountMap = new Map(projectCounts.map(r => [r.githubOrg, Number(r.count)]));

    return {
      orgs: ORG_REGISTRY.map(o => {
        const activity = activityMap.get(o.githubOrg);
        return {
          name: o.name,
          githubOrg: o.githubOrg,
          governanceModel: o.governanceModel,
          hasCommunityRepo: !!o.communityRepo,
          strategicParticipation: o.strategicParticipation ?? null,
          strategicLeadership: o.strategicLeadership ?? null,
          contributionCount: activity?.total ?? 0,
          trend: activity?.trend ?? [],
          totalTrend: activity?.totalTrend ?? [],
          percentChange: activity?.percentChange ?? 0,
          leadershipCount: activity?.leadershipCount ?? 0,
          maintainerCount: activity?.maintainerCount ?? 0,
          totalContributions: activity?.totalContributions ?? 0,
          teamSharePercent: activity?.teamSharePercent ?? 0,
          activeTeamMembers: activity?.activeTeamMembers ?? 0,
          projectCount: projectCountMap.get(o.githubOrg) ?? 0,
        };
      }),
    };
  } catch (error) {
    logger.error('Error fetching organizations', { error });
    reply.status(500);
    return {
      error: 'Failed to fetch organizations',
      message: (error as Error).message,
    };
  }
});

// WebSocket endpoint for real-time updates
app.register(async function (fastify) {
  fastify.get('/ws/updates', { websocket: true }, (connection, req) => {
    logger.info('WebSocket connection established');

    connection.socket.on('message', (message: unknown) => {
      connection.socket.send(JSON.stringify({
        type: 'echo',
        data: String(message),
        timestamp: new Date().toISOString(),
      }));
    });

    connection.socket.on('close', () => {
      logger.info('WebSocket connection closed');
    });

    // Send initial message
    connection.socket.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to upstream-pulse',
      timestamp: new Date().toISOString(),
    }));
  });
});

// Error handler
app.setErrorHandler((error, request, reply) => {
  logger.error('Request error', {
    error,
    method: request.method,
    url: request.url,
  });

  reply.status(error.statusCode || 500).send({
    error: error.message || 'Internal Server Error',
    statusCode: error.statusCode || 500,
  });
});

// Start server
const start = async () => {
  try {
    await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    logger.info(`Server listening on port ${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`Health check: http://localhost:${config.port}/health`);

  } catch (error) {
    logger.error('Error starting server', { error });
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await app.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await app.close();
  process.exit(0);
});

start();
