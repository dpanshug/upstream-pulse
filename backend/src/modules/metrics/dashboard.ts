import { db } from '../../shared/database/client.js';
import { contributions, projects } from '../../shared/database/schema.js';
import { eq, and, gte, lte, sql, count, isNotNull } from 'drizzle-orm';
import { logger } from '../../shared/utils/logger.js';
import { getDateRange, formatDate, buildTypeMetric } from './helpers.js';
import { getContributionBreakdown, getDailyTrend, getActiveContributorCount, getTopContributors, getContributionTrend, getActiveContributorTrend } from './contributions.js';
import { getTopProjects } from './projects.js';
import { getOrgActivity } from './org-activity.js';
import { getLeadershipSummary } from './leadership.js';
import type {
  ContributionCounts,
  ContributionsByType,
  DailyDataPoint,
  ContributorRanking,
  ProjectMetric,
  DashboardResponseWithLeadership,
  MetricsQueryOptions,
  DashboardMetrics,
} from './types.js';

export async function getDashboardMetrics(options: MetricsQueryOptions = {}): Promise<DashboardMetrics> {
  const days = options.days ?? 0;
  const queryOptions = { ...options, days };

  logger.info('Calculating dashboard metrics', { days });

  const [
    projectCount,
    contributionsData,
    contributionsTrend,
    activeContributors,
    activeContributorsTrend,
    topContributorsData,
    topProjectsData,
    dailyTrend,
  ] = await Promise.all([
    db.select({ count: count() }).from(projects).where(eq(projects.trackingEnabled, true)),
    getContributionBreakdown(queryOptions),
    getContributionTrend(queryOptions),
    getActiveContributorCount(queryOptions),
    getActiveContributorTrend(queryOptions),
    getTopContributors({ ...queryOptions, topN: 10 }),
    getTopProjects({ ...queryOptions, topN: 5 }),
    options.includeDaily !== false ? getDailyTrend(queryOptions) : Promise.resolve([]),
  ]);

  return {
    projectCount: Number(projectCount[0].count),
    contributions: contributionsData,
    contributionsTrend,
    activeContributors,
    activeContributorsTrend,
    topContributors: topContributorsData,
    topProjects: topProjectsData,
    dailyTrend,
  };
}

export async function getDashboard(options: MetricsQueryOptions = {}): Promise<DashboardResponseWithLeadership> {
  const days = options.days ?? 0;
  const { projectId, githubOrg } = options;
  const queryOptions = { days, projectId, githubOrg };
  const dateRange = getDateRange({ days });

  let startStr: string;
  let endStr: string;

  if (dateRange) {
    startStr = formatDate(dateRange.start);
    endStr = formatDate(dateRange.end);
  } else {
    endStr = formatDate(new Date());
    startStr = 'All time';
  }

  logger.info('Building dashboard', { days, projectId, githubOrg, start: startStr, end: endStr });

  const projectCountConditions = [eq(projects.trackingEnabled, true)];
  if (githubOrg) {
    projectCountConditions.push(eq(projects.githubOrg, githubOrg));
  }

  let projectRepoPromise: Promise<string | undefined> = Promise.resolve(undefined);
  if (projectId) {
    projectRepoPromise = db.query.projects.findFirst({
      columns: { githubRepo: true },
      where: eq(projects.id, projectId),
    }).then(p => p?.githubRepo);
  }

  const [
    breakdown,
    contributionsTrend,
    contributorsTrend,
    projectCountResult,
    activeContributors,
    topContributorsRaw,
    dailyRaw,
    projectRepo,
  ] = await Promise.all([
    getContributionBreakdown(queryOptions),
    getContributionTrend(queryOptions),
    getActiveContributorTrend(queryOptions),
    db.select({ count: count() }).from(projects).where(and(...projectCountConditions)),
    getActiveContributorCount(queryOptions),
    getTopContributors({ ...queryOptions, topN: 50 }),
    getDailyTrend(queryOptions),
    projectRepoPromise,
  ]);

  const contributionsByType: ContributionsByType = {
    commits: buildTypeMetric(breakdown.all.commits, breakdown.team.commits),
    pullRequests: buildTypeMetric(breakdown.all.prs, breakdown.team.prs),
    reviews: buildTypeMetric(breakdown.all.reviews, breakdown.team.reviews),
    issues: buildTypeMetric(breakdown.all.issues, breakdown.team.issues),
    all: buildTypeMetric(breakdown.all.total, breakdown.team.total),
  };

  const topContributors: ContributorRanking[] = topContributorsRaw.map((c, idx) => ({
    rank: idx + 1,
    id: c.id,
    name: c.name,
    githubUsername: c.githubUsername,
    avatarUrl: c.githubUsername
      ? `https://github.com/${c.githubUsername}.png?size=80`
      : undefined,
    commits: c.contributions.commits,
    pullRequests: c.contributions.prs,
    reviews: c.contributions.reviews,
    issues: c.contributions.issues,
    total: c.contributions.total,
  }));

  const dailyBreakdown: DailyDataPoint[] = dailyRaw.map(d => ({
    date: d.date,
    commits: { total: d.all.commits, team: d.team.commits },
    pullRequests: { total: d.all.prs, team: d.team.prs },
    reviews: { total: d.all.reviews, team: d.team.reviews },
    issues: { total: d.all.issues, team: d.team.issues },
  }));

  const buildTopProjects = async (): Promise<ProjectMetric[]> => {
    if (projectId) return [];
    const topProjectsConditions = [eq(projects.trackingEnabled, true)];
    if (githubOrg) {
      topProjectsConditions.push(eq(projects.githubOrg, githubOrg));
    }
    const topProjectsRaw = await db
      .select({
        id: projects.id,
        name: projects.name,
        githubOrg: projects.githubOrg,
        githubRepo: projects.githubRepo,
      })
      .from(projects)
      .where(and(...topProjectsConditions));

    if (topProjectsRaw.length === 0) return [];

    const pIds = topProjectsRaw.map(p => p.id);
    const dConds: ReturnType<typeof eq>[] = [];
    if (dateRange) {
      dConds.push(gte(contributions.contributionDate, formatDate(dateRange.start)));
      dConds.push(lte(contributions.contributionDate, formatDate(dateRange.end)));
    }

    const [projContribs, projActive] = await Promise.all([
      db
        .select({
          projectId: contributions.projectId,
          type: contributions.contributionType,
          totalCount: count(),
          teamCount: sql<number>`count(${contributions.teamMemberId})::int`,
        })
        .from(contributions)
        .where(and(sql`${contributions.projectId} IN ${pIds}`, ...dConds))
        .groupBy(contributions.projectId, contributions.contributionType),

      db
        .select({
          projectId: contributions.projectId,
          activeCount: sql<number>`count(DISTINCT ${contributions.teamMemberId})::int`,
        })
        .from(contributions)
        .where(and(
          isNotNull(contributions.teamMemberId),
          sql`${contributions.projectId} IN ${pIds}`,
          ...dConds,
        ))
        .groupBy(contributions.projectId),
    ]);

    const cMap = new Map<string, { all: ContributionCounts; team: ContributionCounts }>();
    for (const row of projContribs) {
      const pid = row.projectId!;
      if (!cMap.has(pid)) {
        cMap.set(pid, {
          all: { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
          team: { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
        });
      }
      const e = cMap.get(pid)!;
      const t = Number(row.totalCount), tm = Number(row.teamCount);
      switch (row.type) {
        case 'commit': e.all.commits = t; e.team.commits = tm; break;
        case 'pr':     e.all.prs = t;     e.team.prs = tm;     break;
        case 'review': e.all.reviews = t; e.team.reviews = tm; break;
        case 'issue':  e.all.issues = t;  e.team.issues = tm;  break;
      }
    }
    for (const e of cMap.values()) {
      e.all.total = e.all.commits + e.all.prs + e.all.reviews + e.all.issues;
      e.team.total = e.team.commits + e.team.prs + e.team.reviews + e.team.issues;
    }

    const aMap = new Map(projActive.map(r => [r.projectId!, Number(r.activeCount)]));

    return topProjectsRaw.map(p => {
      const c = cMap.get(p.id) ?? {
        all: { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
        team: { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
      };
      return {
        id: p.id,
        name: p.name,
        githubOrg: p.githubOrg,
        githubRepo: p.githubRepo,
        contributions: {
          commits: buildTypeMetric(c.all.commits, c.team.commits),
          pullRequests: buildTypeMetric(c.all.prs, c.team.prs),
          reviews: buildTypeMetric(c.all.reviews, c.team.reviews),
          issues: buildTypeMetric(c.all.issues, c.team.issues),
          all: buildTypeMetric(c.all.total, c.team.total),
        },
        activeContributors: aMap.get(p.id) ?? 0,
      };
    }).sort((a, b) => b.contributions.all.team - a.contributions.all.team);
  };

  const [topProjectsResult, leadershipData, orgActivity] = await Promise.all([
    buildTopProjects(),
    getLeadershipSummary(projectId, projectRepo, githubOrg),
    !projectId && !githubOrg
      ? getOrgActivity({ days }).then(r => r.slice(0, 4))
      : Promise.resolve(undefined),
  ]);

  return {
    summary: {
      periodDays: days,
      periodStart: startStr,
      periodEnd: endStr,
      trackedProjects: Number(projectCountResult[0]?.count ?? 0),
      activeContributors,
    },
    contributions: contributionsByType,
    trends: {
      contributions: contributionsTrend,
      activeContributors: contributorsTrend,
    },
    topContributors,
    topProjects: topProjectsResult,
    dailyBreakdown,
    leadership: leadershipData,
    orgActivity,
  };
}
