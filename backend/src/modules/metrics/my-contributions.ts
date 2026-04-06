import { db } from '../../shared/database/client.js';
import { contributions, teamMembers, projects, maintainerStatus, leadershipPositions } from '../../shared/database/schema.js';
import { eq, and, gte, lte, isNotNull, count, sql } from 'drizzle-orm';
import { getDateRange, formatDate, normalizeDateValue, buildCounts, buildTrend, calculatePercentage } from './helpers.js';
import type { MetricsQueryOptions, TrendMetric, ContributionCounts } from './types.js';

/** Contribution counts for a single contributor (my breakdown). */
export async function getMyContributionBreakdown(
  teamMemberId: string,
  options: MetricsQueryOptions = {},
): Promise<ContributionCounts> {
  const dateRange = getDateRange(options);
  const conditions: ReturnType<typeof eq>[] = [
    eq(contributions.teamMemberId, teamMemberId),
  ];
  if (dateRange) {
    conditions.push(gte(contributions.contributionDate, formatDate(dateRange.start)));
    conditions.push(lte(contributions.contributionDate, formatDate(dateRange.end)));
  }
  if (options.projectId) {
    conditions.push(eq(contributions.projectId, options.projectId));
  }

  const rows = await db
    .select({ type: contributions.contributionType, count: count() })
    .from(contributions)
    .where(and(...conditions))
    .groupBy(contributions.contributionType);

  return buildCounts(rows.map((r) => ({ type: r.type, count: Number(r.count) })));
}

/** Trend: current period vs previous period of equal length. */
export async function getMyContributionTrend(
  teamMemberId: string,
  options: MetricsQueryOptions = {},
): Promise<TrendMetric> {
  const dateRange = getDateRange(options);

  if (!dateRange) {
    const current = await getMyContributionBreakdown(teamMemberId, { days: 0 });
    return buildTrend(current.total, 0);
  }

  const { start, end } = dateRange;
  const periodMs = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - periodMs);

  const [current, previous] = await Promise.all([
    getMyContributionBreakdown(teamMemberId, { ...options, dateRange: { start, end } }),
    getMyContributionBreakdown(teamMemberId, { ...options, dateRange: { start: previousStart, end: previousEnd } }),
  ]);

  return buildTrend(current.total, previous.total);
}

export interface MyDailyActivity {
  date: string;
  commits: number;
  prs: number;
  reviews: number;
  issues: number;
  total: number;
}

/** Daily activity series for a single contributor. */
export async function getMyDailyActivity(
  teamMemberId: string,
  options: MetricsQueryOptions = {},
): Promise<MyDailyActivity[]> {
  const dateRange = getDateRange(options);
  const effectiveRange = dateRange || {
    start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    end: new Date(),
  };

  const conditions: ReturnType<typeof eq>[] = [
    eq(contributions.teamMemberId, teamMemberId),
    gte(contributions.contributionDate, formatDate(effectiveRange.start)),
    lte(contributions.contributionDate, formatDate(effectiveRange.end)),
  ];
  if (options.projectId) {
    conditions.push(eq(contributions.projectId, options.projectId));
  }

  const rows = await db
    .select({
      date: contributions.contributionDate,
      type: contributions.contributionType,
      count: count(),
    })
    .from(contributions)
    .where(and(...conditions))
    .groupBy(contributions.contributionDate, contributions.contributionType)
    .orderBy(contributions.contributionDate);

  const dayMap = new Map<string, MyDailyActivity>();
  const cursor = new Date(effectiveRange.start);
  while (cursor <= effectiveRange.end) {
    const ds = formatDate(cursor);
    dayMap.set(ds, { date: ds, commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const row of rows) {
    const ds = normalizeDateValue(row.date);
    const day = dayMap.get(ds);
    if (!day) continue;
    const c = Number(row.count);
    switch (row.type) {
      case 'commit': day.commits = c; break;
      case 'pr': day.prs = c; break;
      case 'review': day.reviews = c; break;
      case 'issue': day.issues = c; break;
    }
    day.total = day.commits + day.prs + day.reviews + day.issues;
  }

  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export interface MyProjectContributions {
  id: string;
  name: string;
  githubOrg: string;
  githubRepo: string;
  commits: number;
  prs: number;
  reviews: number;
  issues: number;
  total: number;
}

/** Per-project breakdown for a single contributor. */
export async function getMyProjects(
  teamMemberId: string,
  options: MetricsQueryOptions = {},
): Promise<MyProjectContributions[]> {
  const dateRange = getDateRange(options);
  const conditions: ReturnType<typeof eq>[] = [
    eq(contributions.teamMemberId, teamMemberId),
  ];
  if (dateRange) {
    conditions.push(gte(contributions.contributionDate, formatDate(dateRange.start)));
    conditions.push(lte(contributions.contributionDate, formatDate(dateRange.end)));
  }

  const rows = await db
    .select({
      projectId: contributions.projectId,
      type: contributions.contributionType,
      count: count(),
    })
    .from(contributions)
    .where(and(...conditions))
    .groupBy(contributions.projectId, contributions.contributionType);

  const projectMap = new Map<string, ContributionCounts>();
  for (const row of rows) {
    const pid = row.projectId!;
    if (!projectMap.has(pid)) {
      projectMap.set(pid, { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 });
    }
    const c = projectMap.get(pid)!;
    const n = Number(row.count);
    switch (row.type) {
      case 'commit': c.commits = n; break;
      case 'pr': c.prs = n; break;
      case 'review': c.reviews = n; break;
      case 'issue': c.issues = n; break;
    }
    c.total = c.commits + c.prs + c.reviews + c.issues;
  }

  const projectIds = Array.from(projectMap.keys());
  if (projectIds.length === 0) return [];

  const projectRows = await db
    .select({ id: projects.id, name: projects.name, githubOrg: projects.githubOrg, githubRepo: projects.githubRepo })
    .from(projects)
    .where(sql`${projects.id} IN ${projectIds}`);

  const projectInfo = new Map(projectRows.map((p) => [p.id, p]));

  return projectIds
    .map((pid) => {
      const info = projectInfo.get(pid);
      const c = projectMap.get(pid)!;
      return {
        id: pid,
        name: info?.name ?? 'Unknown',
        githubOrg: info?.githubOrg ?? '',
        githubRepo: info?.githubRepo ?? '',
        ...c,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface MyTeamRank {
  rank: number;
  teamSize: number;
}

/** Rank of this contributor among all team contributors for the period. */
export async function getMyTeamRank(
  teamMemberId: string,
  options: MetricsQueryOptions = {},
): Promise<MyTeamRank> {
  const dateRange = getDateRange(options);
  const conditions: ReturnType<typeof eq>[] = [isNotNull(contributions.teamMemberId)];
  if (dateRange) {
    conditions.push(gte(contributions.contributionDate, formatDate(dateRange.start)));
    conditions.push(lte(contributions.contributionDate, formatDate(dateRange.end)));
  }

  const rows = await db
    .select({
      teamMemberId: contributions.teamMemberId,
      count: count(),
    })
    .from(contributions)
    .where(and(...conditions))
    .groupBy(contributions.teamMemberId);

  const sorted = rows
    .map((r) => ({ id: r.teamMemberId!, total: Number(r.count) }))
    .sort((a, b) => b.total - a.total);

  const idx = sorted.findIndex((r) => r.id === teamMemberId);

  return {
    rank: idx >= 0 ? idx + 1 : sorted.length + 1,
    teamSize: sorted.length,
  };
}

export interface MyMaintainerRole {
  projectName: string;
  githubOrg: string;
  positionType: string;
  positionTitle: string;
  scope: string;
}

export interface MyLeadershipRole {
  communityOrg: string;
  positionType: string;
  committeeName: string;
  roleTitle: string;
  votingRights: boolean;
}

export interface MyRoles {
  maintainer: MyMaintainerRole[];
  leadership: MyLeadershipRole[];
}

/** Governance and leadership roles for a single contributor. */
export async function getMyRoles(teamMemberId: string): Promise<MyRoles> {
  const [msRows, lpRows] = await Promise.all([
    db
      .select({
        positionType: maintainerStatus.positionType,
        positionTitle: maintainerStatus.positionTitle,
        scope: maintainerStatus.scope,
        projectName: projects.name,
        githubOrg: projects.githubOrg,
      })
      .from(maintainerStatus)
      .innerJoin(projects, eq(maintainerStatus.projectId, projects.id))
      .where(and(eq(maintainerStatus.teamMemberId, teamMemberId), eq(maintainerStatus.isActive, true))),
    db
      .select({
        communityOrg: leadershipPositions.communityOrg,
        positionType: leadershipPositions.positionType,
        committeeName: leadershipPositions.committeeName,
        roleTitle: leadershipPositions.roleTitle,
        votingRights: leadershipPositions.votingRights,
      })
      .from(leadershipPositions)
      .where(and(eq(leadershipPositions.teamMemberId, teamMemberId), eq(leadershipPositions.isActive, true))),
  ]);

  return {
    maintainer: msRows.map((r) => ({
      projectName: r.projectName,
      githubOrg: r.githubOrg,
      positionType: r.positionType,
      positionTitle: r.positionTitle ?? r.positionType,
      scope: r.scope ?? 'root',
    })),
    leadership: lpRows.map((r) => ({
      communityOrg: r.communityOrg ?? '',
      positionType: r.positionType,
      committeeName: r.committeeName ?? '',
      roleTitle: r.roleTitle ?? r.positionType,
      votingRights: r.votingRights ?? false,
    })),
  };
}

/** Team-wide total contributions for computing the user's share. */
export async function getTeamTotalContributions(
  options: MetricsQueryOptions = {},
): Promise<number> {
  const dateRange = getDateRange(options);
  const conditions: ReturnType<typeof eq>[] = [isNotNull(contributions.teamMemberId)];
  if (dateRange) {
    conditions.push(gte(contributions.contributionDate, formatDate(dateRange.start)));
    conditions.push(lte(contributions.contributionDate, formatDate(dateRange.end)));
  }
  const [row] = await db
    .select({ total: count() })
    .from(contributions)
    .where(and(...conditions));

  return Number(row?.total ?? 0);
}
