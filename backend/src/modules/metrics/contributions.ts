import { db } from '../../shared/database/client.js';
import { contributions, teamMembers } from '../../shared/database/schema.js';
import { eq, and, gte, lte, sql, count, isNotNull } from 'drizzle-orm';
import { getDateRange, formatDate, normalizeDateValue, buildCounts, calculatePercentage, buildTrend } from './helpers.js';
import type {
  ContributionCounts,
  ContributionBreakdown,
  MetricsQueryOptions,
  DailyContribution,
  ContributorSummary,
  TrendComparison,
} from './types.js';

export async function getContributionBreakdown(options: MetricsQueryOptions = {}): Promise<ContributionBreakdown> {
  const dateRange = getDateRange(options);

  const conditions: ReturnType<typeof eq>[] = [];

  if (dateRange) {
    const startStr = formatDate(dateRange.start);
    const endStr = formatDate(dateRange.end);
    conditions.push(gte(contributions.contributionDate, startStr));
    conditions.push(lte(contributions.contributionDate, endStr));
  }

  if (options.projectId) {
    conditions.push(eq(contributions.projectId, options.projectId));
  }
  if (options.githubOrg) {
    conditions.push(
      sql`${contributions.projectId} in (select id from projects where github_org = ${options.githubOrg})`
    );
  }

  const [allContribs, teamContribs] = await Promise.all([
    db
      .select({
        type: contributions.contributionType,
        count: count(),
      })
      .from(contributions)
      .where(and(...conditions))
      .groupBy(contributions.contributionType),

    db
      .select({
        type: contributions.contributionType,
        count: count(),
      })
      .from(contributions)
      .where(and(...conditions, isNotNull(contributions.teamMemberId)))
      .groupBy(contributions.contributionType),
  ]);

  const all = buildCounts(allContribs.map(r => ({ type: r.type, count: Number(r.count) })));
  const team = buildCounts(teamContribs.map(r => ({ type: r.type, count: Number(r.count) })));

  return {
    all,
    team,
    percentage: calculatePercentage(team.total, all.total),
  };
}

export async function getDailyTrend(options: MetricsQueryOptions = {}): Promise<DailyContribution[]> {
  const dateRange = getDateRange(options);

  const effectiveRange = dateRange || {
    start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    end: new Date(),
  };
  const startStr = formatDate(effectiveRange.start);
  const endStr = formatDate(effectiveRange.end);

  const conditions: ReturnType<typeof eq>[] = [
    gte(contributions.contributionDate, startStr),
    lte(contributions.contributionDate, endStr),
  ];
  if (options.projectId) {
    conditions.push(eq(contributions.projectId, options.projectId));
  }
  if (options.githubOrg) {
    conditions.push(
      sql`${contributions.projectId} in (select id from projects where github_org = ${options.githubOrg})`
    );
  }

  const [allDaily, teamDaily] = await Promise.all([
    db
      .select({
        date: contributions.contributionDate,
        type: contributions.contributionType,
        count: count(),
      })
      .from(contributions)
      .where(and(...conditions))
      .groupBy(contributions.contributionDate, contributions.contributionType)
      .orderBy(contributions.contributionDate),

    db
      .select({
        date: contributions.contributionDate,
        type: contributions.contributionType,
        count: count(),
      })
      .from(contributions)
      .where(and(...conditions, isNotNull(contributions.teamMemberId)))
      .groupBy(contributions.contributionDate, contributions.contributionType)
      .orderBy(contributions.contributionDate),
  ]);

  const dailyMap = new Map<string, DailyContribution>();

  const current = new Date(effectiveRange.start);
  while (current <= effectiveRange.end) {
    const dateStr = formatDate(current);
    dailyMap.set(dateStr, {
      date: dateStr,
      all: { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
      team: { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
    });
    current.setDate(current.getDate() + 1);
  }

  for (const row of allDaily) {
    const dateStr = normalizeDateValue(row.date);
    const daily = dailyMap.get(dateStr);
    if (daily) {
      switch (row.type) {
        case 'commit': daily.all.commits = Number(row.count); break;
        case 'pr': daily.all.prs = Number(row.count); break;
        case 'review': daily.all.reviews = Number(row.count); break;
        case 'issue': daily.all.issues = Number(row.count); break;
      }
      daily.all.total = daily.all.commits + daily.all.prs + daily.all.reviews + daily.all.issues;
    }
  }

  for (const row of teamDaily) {
    const dateStr = normalizeDateValue(row.date);
    const daily = dailyMap.get(dateStr);
    if (daily) {
      switch (row.type) {
        case 'commit': daily.team.commits = Number(row.count); break;
        case 'pr': daily.team.prs = Number(row.count); break;
        case 'review': daily.team.reviews = Number(row.count); break;
        case 'issue': daily.team.issues = Number(row.count); break;
      }
      daily.team.total = daily.team.commits + daily.team.prs + daily.team.reviews + daily.team.issues;
    }
  }

  return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getActiveContributorCount(options: MetricsQueryOptions = {}): Promise<number> {
  const dateRange = getDateRange(options);

  const conditions: ReturnType<typeof eq>[] = [
    isNotNull(contributions.teamMemberId),
  ];

  if (dateRange) {
    const startStr = formatDate(dateRange.start);
    const endStr = formatDate(dateRange.end);
    conditions.push(gte(contributions.contributionDate, startStr));
    conditions.push(lte(contributions.contributionDate, endStr));
  }

  if (options.projectId) {
    conditions.push(eq(contributions.projectId, options.projectId));
  }
  if (options.githubOrg) {
    conditions.push(
      sql`${contributions.projectId} in (select id from projects where github_org = ${options.githubOrg})`
    );
  }

  const result = await db
    .selectDistinct({ teamMemberId: contributions.teamMemberId })
    .from(contributions)
    .where(and(...conditions));

  return result.length;
}

export async function getTopContributors(options: MetricsQueryOptions = {}): Promise<ContributorSummary[]> {
  const dateRange = getDateRange(options);
  const topN = options.topN || 10;

  const conditions: ReturnType<typeof eq>[] = [
    isNotNull(contributions.teamMemberId),
  ];

  if (dateRange) {
    const startStr = formatDate(dateRange.start);
    const endStr = formatDate(dateRange.end);
    conditions.push(gte(contributions.contributionDate, startStr));
    conditions.push(lte(contributions.contributionDate, endStr));
  }

  if (options.projectId) {
    conditions.push(eq(contributions.projectId, options.projectId));
  }
  if (options.githubOrg) {
    conditions.push(
      sql`${contributions.projectId} in (select id from projects where github_org = ${options.githubOrg})`
    );
  }

  const result = await db
    .select({
      teamMemberId: contributions.teamMemberId,
      type: contributions.contributionType,
      count: count(),
    })
    .from(contributions)
    .where(and(...conditions))
    .groupBy(contributions.teamMemberId, contributions.contributionType);

  const memberMap = new Map<string, ContributionCounts>();
  for (const row of result) {
    const memberId = row.teamMemberId!;
    if (!memberMap.has(memberId)) {
      memberMap.set(memberId, { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 });
    }
    const counts = memberMap.get(memberId)!;
    switch (row.type) {
      case 'commit': counts.commits = Number(row.count); break;
      case 'pr': counts.prs = Number(row.count); break;
      case 'review': counts.reviews = Number(row.count); break;
      case 'issue': counts.issues = Number(row.count); break;
    }
    counts.total = counts.commits + counts.prs + counts.reviews + counts.issues;
  }

  const memberIds = Array.from(memberMap.keys());
  if (memberIds.length === 0) return [];

  const members = await db
    .select({
      id: teamMembers.id,
      name: teamMembers.name,
      githubUsername: teamMembers.githubUsername,
    })
    .from(teamMembers)
    .where(sql`${teamMembers.id} IN ${memberIds}`);

  const summaries: ContributorSummary[] = members.map(m => ({
    id: m.id,
    name: m.name,
    githubUsername: m.githubUsername,
    contributions: memberMap.get(m.id) || { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
  }));

  return summaries
    .sort((a, b) => b.contributions.total - a.contributions.total)
    .slice(0, topN);
}

export async function getContributionTrend(options: MetricsQueryOptions = {}): Promise<TrendComparison> {
  const dateRange = getDateRange(options);

  if (!dateRange) {
    const current = await getContributionBreakdown({ days: 0 });
    return buildTrend(current.team.total, 0);
  }

  const { start, end } = dateRange;
  const periodMs = end.getTime() - start.getTime();

  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - periodMs);

  const [current, previous] = await Promise.all([
    getContributionBreakdown({
      ...options,
      dateRange: { start, end },
    }),
    getContributionBreakdown({
      ...options,
      dateRange: { start: previousStart, end: previousEnd },
    }),
  ]);

  return buildTrend(current.team.total, previous.team.total);
}

export async function getActiveContributorTrend(options: MetricsQueryOptions = {}): Promise<TrendComparison> {
  const dateRange = getDateRange(options);

  if (!dateRange) {
    const current = await getActiveContributorCount({ days: 0 });
    return buildTrend(current, 0);
  }

  const { start, end } = dateRange;
  const periodMs = end.getTime() - start.getTime();

  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - periodMs);

  const [currentCount, previousCount] = await Promise.all([
    getActiveContributorCount({
      ...options,
      dateRange: { start, end },
    }),
    getActiveContributorCount({
      ...options,
      dateRange: { start: previousStart, end: previousEnd },
    }),
  ]);

  return buildTrend(currentCount, previousCount);
}
