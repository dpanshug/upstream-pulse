import { db } from '../../shared/database/client.js';
import { contributions, projects, maintainerStatus, leadershipPositions } from '../../shared/database/schema.js';
import { eq, and, gte, lte, count, isNotNull, sql } from 'drizzle-orm';
import { getOrgConfig } from '../../shared/config/org-registry.js';
import { getDateRange, formatDate } from './helpers.js';
import type { MetricsQueryOptions, OrgActivityItem } from './types.js';

export async function getOrgActivity(options: MetricsQueryOptions = {}): Promise<OrgActivityItem[]> {
  const dateRange = getDateRange(options);

  const dateConditions: ReturnType<typeof eq>[] = [];
  if (dateRange) {
    dateConditions.push(gte(contributions.contributionDate, formatDate(dateRange.start)));
    dateConditions.push(lte(contributions.contributionDate, formatDate(dateRange.end)));
  }

  const sparkRange = {
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: new Date(),
  };

  const [contribByOrg, totalContribByOrg, activeTeamMembersByOrg, sparklineData, totalSparklineData, leadershipCounts, maintainerCounts] = await Promise.all([
    db.select({
        githubOrg: projects.githubOrg,
        type: contributions.contributionType,
        count: count(),
      })
      .from(contributions)
      .innerJoin(projects, eq(contributions.projectId, projects.id))
      .where(dateConditions.length > 0
        ? and(isNotNull(contributions.teamMemberId), ...dateConditions)
        : isNotNull(contributions.teamMemberId))
      .groupBy(projects.githubOrg, contributions.contributionType),

    db.select({
        githubOrg: projects.githubOrg,
        count: count(),
      })
      .from(contributions)
      .innerJoin(projects, eq(contributions.projectId, projects.id))
      .where(dateConditions.length > 0 ? and(...dateConditions) : undefined)
      .groupBy(projects.githubOrg),

    db.select({
        githubOrg: projects.githubOrg,
        count: sql<number>`count(distinct ${contributions.teamMemberId})`,
      })
      .from(contributions)
      .innerJoin(projects, eq(contributions.projectId, projects.id))
      .where(dateConditions.length > 0
        ? and(isNotNull(contributions.teamMemberId), ...dateConditions)
        : isNotNull(contributions.teamMemberId))
      .groupBy(projects.githubOrg),

    db.select({
        githubOrg: projects.githubOrg,
        date: contributions.contributionDate,
        count: count(),
      })
      .from(contributions)
      .innerJoin(projects, eq(contributions.projectId, projects.id))
      .where(and(
        isNotNull(contributions.teamMemberId),
        gte(contributions.contributionDate, formatDate(sparkRange.start)),
        lte(contributions.contributionDate, formatDate(sparkRange.end)),
      ))
      .groupBy(projects.githubOrg, contributions.contributionDate)
      .orderBy(contributions.contributionDate),

    db.select({
        githubOrg: projects.githubOrg,
        date: contributions.contributionDate,
        count: count(),
      })
      .from(contributions)
      .innerJoin(projects, eq(contributions.projectId, projects.id))
      .where(and(
        gte(contributions.contributionDate, formatDate(sparkRange.start)),
        lte(contributions.contributionDate, formatDate(sparkRange.end)),
      ))
      .groupBy(projects.githubOrg, contributions.contributionDate)
      .orderBy(contributions.contributionDate),

    db.select({
        communityOrg: leadershipPositions.communityOrg,
        count: count(),
      })
      .from(leadershipPositions)
      .where(and(
        eq(leadershipPositions.isActive, true),
        isNotNull(leadershipPositions.teamMemberId),
      ))
      .groupBy(leadershipPositions.communityOrg),

    db.select({
        githubOrg: projects.githubOrg,
        count: count(),
      })
      .from(maintainerStatus)
      .innerJoin(projects, eq(maintainerStatus.projectId, projects.id))
      .where(and(
        eq(maintainerStatus.isActive, true),
        isNotNull(maintainerStatus.teamMemberId),
      ))
      .groupBy(projects.githubOrg),
  ]);

  const prevTotals = new Map<string, number>();
  if (dateRange) {
    const periodMs = dateRange.end.getTime() - dateRange.start.getTime();
    const prevEnd = new Date(dateRange.start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodMs);

    const prevContribs = await db.select({
        githubOrg: projects.githubOrg,
        count: count(),
      })
      .from(contributions)
      .innerJoin(projects, eq(contributions.projectId, projects.id))
      .where(and(
        isNotNull(contributions.teamMemberId),
        gte(contributions.contributionDate, formatDate(prevStart)),
        lte(contributions.contributionDate, formatDate(prevEnd)),
      ))
      .groupBy(projects.githubOrg);

    for (const row of prevContribs) {
      prevTotals.set(row.githubOrg, Number(row.count));
    }
  }

  const orgCounts = new Map<string, { total: number; commits: number; prs: number; reviews: number; issues: number }>();
  for (const row of contribByOrg) {
    if (!orgCounts.has(row.githubOrg)) {
      orgCounts.set(row.githubOrg, { total: 0, commits: 0, prs: 0, reviews: 0, issues: 0 });
    }
    const entry = orgCounts.get(row.githubOrg)!;
    const cnt = Number(row.count);
    switch (row.type) {
      case 'commit': entry.commits = cnt; break;
      case 'pr': entry.prs = cnt; break;
      case 'review': entry.reviews = cnt; break;
      case 'issue': entry.issues = cnt; break;
    }
  }
  for (const entry of orgCounts.values()) {
    entry.total = entry.commits + entry.prs + entry.reviews + entry.issues;
  }

  const sparklineMap = new Map<string, Array<{ date: string; count: number }>>();
  for (const row of sparklineData) {
    if (!sparklineMap.has(row.githubOrg)) {
      sparklineMap.set(row.githubOrg, []);
    }
    sparklineMap.get(row.githubOrg)!.push({
      date: row.date as string,
      count: Number(row.count),
    });
  }

  const totalSparklineMap = new Map<string, Array<{ date: string; count: number }>>();
  for (const row of totalSparklineData) {
    if (!totalSparklineMap.has(row.githubOrg)) {
      totalSparklineMap.set(row.githubOrg, []);
    }
    totalSparklineMap.get(row.githubOrg)!.push({
      date: row.date as string,
      count: Number(row.count),
    });
  }

  const leadershipMap = new Map<string, number>();
  for (const row of leadershipCounts) {
    if (row.communityOrg) {
      leadershipMap.set(row.communityOrg, Number(row.count));
    }
  }

  const maintainerMap = new Map<string, number>();
  for (const row of maintainerCounts) {
    maintainerMap.set(row.githubOrg, Number(row.count));
  }

  const totalContribMap = new Map<string, number>();
  for (const row of totalContribByOrg) {
    totalContribMap.set(row.githubOrg, Number(row.count));
  }

  const activeTeamMap = new Map<string, number>();
  for (const row of activeTeamMembersByOrg) {
    activeTeamMap.set(row.githubOrg, Number(row.count));
  }

  const allOrgs = new Set([
    ...orgCounts.keys(),
    ...leadershipMap.keys(),
    ...maintainerMap.keys(),
  ]);

  const results: OrgActivityItem[] = [];
  for (const org of allOrgs) {
    const counts = orgCounts.get(org) ?? { total: 0, commits: 0, prs: 0, reviews: 0, issues: 0 };
    const prev = prevTotals.get(org) ?? 0;
    const percentChange = !dateRange
      ? 0
      : prev === 0
        ? (counts.total > 0 ? 100 : 0)
        : parseFloat((((counts.total - prev) / prev) * 100).toFixed(1));

    const totalContribs = totalContribMap.get(org) ?? 0;
    const teamShare = totalContribs > 0
      ? parseFloat(((counts.total / totalContribs) * 100).toFixed(1))
      : 0;

    const orgConfig = getOrgConfig(org);
    results.push({
      org,
      orgName: orgConfig?.name ?? org,
      strategicParticipation: orgConfig?.strategicParticipation ?? null,
      strategicLeadership: orgConfig?.strategicLeadership ?? null,
      ...counts,
      trend: sparklineMap.get(org) ?? [],
      totalTrend: totalSparklineMap.get(org) ?? [],
      percentChange,
      leadershipCount: leadershipMap.get(org) ?? 0,
      maintainerCount: maintainerMap.get(org) ?? 0,
      totalContributions: totalContribs,
      teamSharePercent: teamShare,
      activeTeamMembers: activeTeamMap.get(org) ?? 0,
    });
  }

  results.sort((a, b) => b.total - a.total);
  return results;
}
