import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { randomUUID } from 'crypto';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { db } from '../../shared/database/client.js';
import { projects, openOpportunities, collectionJobs } from '../../shared/database/schema.js';
import { eq, and, lt, inArray, notInArray } from 'drizzle-orm';

interface OpportunityJobData {
  trigger: 'scheduled' | 'manual';
  mode: 'incremental' | 'full';
  projectId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ThrottledOctokit = Octokit.plugin(throttling as any);

let octokitInstance: InstanceType<typeof ThrottledOctokit> | null = null;

function getOctokit(): InstanceType<typeof ThrottledOctokit> {
  if (!octokitInstance) {
    octokitInstance = new ThrottledOctokit({
      auth: config.githubToken,
      throttle: {
        onRateLimit: (retryAfter: number, options: Record<string, unknown>, _octokit: unknown, retryCount: number) => {
          logger.warn(`Opportunity worker rate limit for ${options['method']} ${options['url']}, retry after ${retryAfter}s (attempt ${retryCount + 1})`);
          return retryCount < 2;
        },
        onSecondaryRateLimit: (retryAfter: number, options: Record<string, unknown>) => {
          logger.warn(`Opportunity worker secondary rate limit for ${options['method']} ${options['url']}, retry after ${retryAfter}s`);
          return false;
        },
      },
    });
  }
  return octokitInstance;
}

interface GitHubIssue {
  id: number;
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  labels: Array<{ name?: string } | string>;
  state: string;
  assignees?: Array<unknown>;
  comments: number;
  reactions?: { total_count: number };
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  pull_request?: unknown;
}

function extractLabels(labels: GitHubIssue['labels']): string[] {
  return labels
    .map((l) => (typeof l === 'string' ? l : l.name ?? ''))
    .filter(Boolean);
}

function truncateBody(body: string | null, maxLen = 5000): string | null {
  if (!body) return null;
  return body.length > maxLen ? body.slice(0, maxLen) : body;
}

async function syncProjectIncremental(
  project: { id: string; githubOrg: string; githubRepo: string; primaryLanguage: string | null; lastOpportunityRefreshAt: Date | null },
): Promise<{ newIssues: number; closedIssues: number }> {
  const octokit = getOctokit();
  const { githubOrg: owner, githubRepo: repo, primaryLanguage } = project;
  const since = project.lastOpportunityRefreshAt?.toISOString();
  let newIssues = 0;
  let closedIssues = 0;
  const now = new Date();

  const openIssues: GitHubIssue[] = await octokit.paginate(
    octokit.rest.issues.listForRepo,
    { owner, repo, state: 'open', ...(since && { since }), per_page: 100 },
  );

  for (const issue of openIssues) {
    if (issue.pull_request) continue;
    const githubId = `${owner}/${repo}#${issue.number}`;
    await db.insert(openOpportunities).values({
      projectId: project.id,
      githubId,
      githubNumber: issue.number,
      githubUrl: issue.html_url,
      title: issue.title,
      body: truncateBody(issue.body),
      labels: extractLabels(issue.labels),
      language: primaryLanguage,
      repo,
      org: owner,
      state: 'open',
      issueType: 'issue',
      assigneeCount: issue.assignees?.length ?? 0,
      commentsCount: issue.comments,
      reactionsCount: issue.reactions?.total_count ?? 0,
      githubCreatedAt: new Date(issue.created_at),
      githubUpdatedAt: new Date(issue.updated_at),
      lastRefreshedAt: now,
    }).onConflictDoUpdate({
      target: openOpportunities.githubId,
      set: {
        title: issue.title,
        body: truncateBody(issue.body),
        labels: extractLabels(issue.labels),
        assigneeCount: issue.assignees?.length ?? 0,
        commentsCount: issue.comments,
        reactionsCount: issue.reactions?.total_count ?? 0,
        githubUpdatedAt: new Date(issue.updated_at),
        updatedAt: now,
        lastRefreshedAt: now,
        state: 'open',
        closedAt: null,
      },
    });
    newIssues++;
  }

  if (since) {
    const closedIssuesList: GitHubIssue[] = await octokit.paginate(
      octokit.rest.issues.listForRepo,
      { owner, repo, state: 'closed', since, per_page: 100 },
    );

    for (const issue of closedIssuesList) {
      if (issue.pull_request) continue;
      const githubId = `${owner}/${repo}#${issue.number}`;
      const result = await db.update(openOpportunities)
        .set({
          state: 'closed',
          closedAt: issue.closed_at ? new Date(issue.closed_at) : now,
          updatedAt: now,
          lastRefreshedAt: now,
        })
        .where(and(
          eq(openOpportunities.githubId, githubId),
          eq(openOpportunities.state, 'open'),
        ))
        .returning({ id: openOpportunities.id });
      closedIssues += result.length;
    }
  }

  await db.update(projects)
    .set({ lastOpportunityRefreshAt: now })
    .where(eq(projects.id, project.id));

  return { newIssues, closedIssues };
}

async function syncProjectFull(
  project: { id: string; githubOrg: string; githubRepo: string; primaryLanguage: string | null },
): Promise<{ newIssues: number; closedIssues: number }> {
  const octokit = getOctokit();
  const { githubOrg: owner, githubRepo: repo, primaryLanguage } = project;
  let newIssues = 0;
  let closedIssues = 0;
  const now = new Date();

  const allOpenIssues: GitHubIssue[] = await octokit.paginate(
    octokit.rest.issues.listForRepo,
    { owner, repo, state: 'open', per_page: 100 },
  );

  const seenGithubIds = new Set<string>();

  for (const issue of allOpenIssues) {
    if (issue.pull_request) continue;
    const githubId = `${owner}/${repo}#${issue.number}`;
    seenGithubIds.add(githubId);

    await db.insert(openOpportunities).values({
      projectId: project.id,
      githubId,
      githubNumber: issue.number,
      githubUrl: issue.html_url,
      title: issue.title,
      body: truncateBody(issue.body),
      labels: extractLabels(issue.labels),
      language: primaryLanguage,
      repo,
      org: owner,
      state: 'open',
      issueType: 'issue',
      assigneeCount: issue.assignees?.length ?? 0,
      commentsCount: issue.comments,
      reactionsCount: issue.reactions?.total_count ?? 0,
      githubCreatedAt: new Date(issue.created_at),
      githubUpdatedAt: new Date(issue.updated_at),
      lastRefreshedAt: now,
    }).onConflictDoUpdate({
      target: openOpportunities.githubId,
      set: {
        title: issue.title,
        body: truncateBody(issue.body),
        labels: extractLabels(issue.labels),
        assigneeCount: issue.assignees?.length ?? 0,
        commentsCount: issue.comments,
        reactionsCount: issue.reactions?.total_count ?? 0,
        githubUpdatedAt: new Date(issue.updated_at),
        updatedAt: now,
        lastRefreshedAt: now,
        state: 'open',
        closedAt: null,
      },
    });
    newIssues++;
  }

  if (seenGithubIds.size > 0) {
    const seenArray = Array.from(seenGithubIds);
    const result = await db.update(openOpportunities)
      .set({ state: 'closed', closedAt: now, updatedAt: now, lastRefreshedAt: now })
      .where(and(
        eq(openOpportunities.projectId, project.id),
        eq(openOpportunities.state, 'open'),
        notInArray(openOpportunities.githubId, seenArray),
      ))
      .returning({ id: openOpportunities.id });
    closedIssues = result.length;
  } else {
    const result = await db.update(openOpportunities)
      .set({ state: 'closed', closedAt: now, updatedAt: now, lastRefreshedAt: now })
      .where(and(
        eq(openOpportunities.projectId, project.id),
        eq(openOpportunities.state, 'open'),
      ))
      .returning({ id: openOpportunities.id });
    closedIssues = result.length;
  }

  await db.update(projects)
    .set({ lastOpportunityRefreshAt: now })
    .where(eq(projects.id, project.id));

  return { newIssues, closedIssues };
}

async function pruneStaleOpportunities(): Promise<{ deleted: number; stale: number }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const deleted = await db.delete(openOpportunities)
    .where(and(
      inArray(openOpportunities.state, ['closed', 'stale']),
      lt(openOpportunities.updatedAt, sevenDaysAgo),
    ))
    .returning({ id: openOpportunities.id });

  const stale = await db.update(openOpportunities)
    .set({ state: 'stale', updatedAt: new Date() })
    .where(and(
      eq(openOpportunities.state, 'open'),
      lt(openOpportunities.lastRefreshedAt, fortyEightHoursAgo),
    ))
    .returning({ id: openOpportunities.id });

  return { deleted: deleted.length, stale: stale.length };
}

const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const opportunityWorker = new Worker<OpportunityJobData>(
  'opportunity-refresh',
  async (job: Job<OpportunityJobData>) => {
    const { mode, trigger, projectId } = job.data;

    logger.info('Starting opportunity refresh', { jobId: job.id, mode, trigger, projectId });

    const jobRecordId = randomUUID();
    await db.insert(collectionJobs).values({
      id: jobRecordId,
      jobType: 'opportunity_sync',
      status: 'running',
      startedAt: new Date(),
      metadata: { bullmqJobId: job.id, mode, trigger },
    });

    let processedRepos = 0;
    let totalNewIssues = 0;
    let totalClosedIssues = 0;
    let errorCount = 0;

    try {
      const projectList = projectId
        ? await db.query.projects.findMany({ where: eq(projects.id, projectId) })
        : await db.query.projects.findMany({ where: eq(projects.trackingEnabled, true) });

      logger.info(`Opportunity refresh: ${projectList.length} projects to process`, { mode });

      for (const project of projectList) {
        try {
          const effectiveMode = mode === 'incremental' && !project.lastOpportunityRefreshAt
            ? 'full'
            : mode;

          const result = effectiveMode === 'full'
            ? await syncProjectFull(project)
            : await syncProjectIncremental(project);

          totalNewIssues += result.newIssues;
          totalClosedIssues += result.closedIssues;
          processedRepos++;

          logger.debug('Opportunity sync completed for project', {
            project: `${project.githubOrg}/${project.githubRepo}`,
            mode: effectiveMode,
            newIssues: result.newIssues,
            closedIssues: result.closedIssues,
          });

          await job.updateProgress({
            processedRepos,
            totalRepos: projectList.length,
            newIssues: totalNewIssues,
          });
        } catch (error) {
          errorCount++;
          logger.warn('Opportunity sync failed for project, continuing', {
            project: `${project.githubOrg}/${project.githubRepo}`,
            error: (error as Error).message,
          });
        }
      }

      const pruneResult = await pruneStaleOpportunities();

      if (errorCount > projectList.length * 0.5) {
        logger.error('Opportunity refresh had high error rate', {
          errorCount,
          totalProjects: projectList.length,
        });
      }

      await db.update(collectionJobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          recordsProcessed: totalNewIssues,
          errorsCount: errorCount,
          metadata: {
            bullmqJobId: job.id,
            mode,
            trigger,
            processedRepos,
            totalNewIssues,
            totalClosedIssues,
            pruned: pruneResult.deleted,
            markedStale: pruneResult.stale,
          },
        })
        .where(eq(collectionJobs.id, jobRecordId));

      logger.info('Opportunity refresh completed', {
        jobId: job.id,
        mode,
        processedRepos,
        totalNewIssues,
        totalClosedIssues,
        pruned: pruneResult.deleted,
        markedStale: pruneResult.stale,
        errorCount,
      });

      return { success: true, processedRepos, totalNewIssues, totalClosedIssues, errorCount };

    } catch (error) {
      logger.error('Opportunity refresh job failed', {
        jobId: job.id,
        error: (error as Error).message,
      });

      await db.update(collectionJobs)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorsCount: errorCount,
          errorDetails: { message: (error as Error).message, stack: (error as Error).stack },
        })
        .where(eq(collectionJobs.id, jobRecordId));

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
    lockDuration: 900_000,
    stalledInterval: 900_000,
    maxStalledCount: 2,
  },
);

opportunityWorker.on('completed', (job) => {
  logger.info('Opportunity refresh job completed', { jobId: job.id });
});

opportunityWorker.on('failed', (job, err) => {
  logger.error('Opportunity refresh job failed', {
    jobId: job?.id,
    error: err.message,
  });
});

opportunityWorker.on('error', (err) => {
  logger.error('Opportunity worker error', { error: err });
});

logger.info('Opportunity worker started');
