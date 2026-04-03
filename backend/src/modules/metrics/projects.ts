import { db } from '../../shared/database/client.js';
import { contributions, projects } from '../../shared/database/schema.js';
import { eq, and, gte, lte, sql, count, isNotNull } from 'drizzle-orm';
import { getDateRange, formatDate, calculatePercentage } from './helpers.js';
import type {
  ContributionCounts,
  MetricsQueryOptions,
  ProjectSummary,
} from './types.js';

export async function getTopProjects(options: MetricsQueryOptions = {}): Promise<ProjectSummary[]> {
  const dateRange = getDateRange(options);
  const topN = options.topN || 5;

  const trackedProjects = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.trackingEnabled, true));

  if (trackedProjects.length === 0) return [];

  const projectIds = trackedProjects.map(p => p.id);
  const dateConditions: ReturnType<typeof eq>[] = [];
  if (dateRange) {
    dateConditions.push(gte(contributions.contributionDate, formatDate(dateRange.start)));
    dateConditions.push(lte(contributions.contributionDate, formatDate(dateRange.end)));
  }

  const [projContribs, projActiveContribs] = await Promise.all([
    db
      .select({
        projectId: contributions.projectId,
        type: contributions.contributionType,
        totalCount: count(),
        teamCount: sql<number>`count(${contributions.teamMemberId})::int`,
      })
      .from(contributions)
      .where(and(
        sql`${contributions.projectId} IN ${projectIds}`,
        ...dateConditions,
      ))
      .groupBy(contributions.projectId, contributions.contributionType),

    db
      .select({
        projectId: contributions.projectId,
        activeCount: sql<number>`count(DISTINCT ${contributions.teamMemberId})::int`,
      })
      .from(contributions)
      .where(and(
        isNotNull(contributions.teamMemberId),
        sql`${contributions.projectId} IN ${projectIds}`,
        ...dateConditions,
      ))
      .groupBy(contributions.projectId),
  ]);

  const contribMap = new Map<string, { all: ContributionCounts; team: ContributionCounts }>();
  for (const row of projContribs) {
    const pid = row.projectId!;
    if (!contribMap.has(pid)) {
      contribMap.set(pid, {
        all: { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
        team: { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
      });
    }
    const entry = contribMap.get(pid)!;
    const total = Number(row.totalCount);
    const team = Number(row.teamCount);
    switch (row.type) {
      case 'commit': entry.all.commits = total; entry.team.commits = team; break;
      case 'pr':     entry.all.prs = total;     entry.team.prs = team;     break;
      case 'review': entry.all.reviews = total; entry.team.reviews = team; break;
      case 'issue':  entry.all.issues = total;  entry.team.issues = team;  break;
    }
  }
  for (const entry of contribMap.values()) {
    entry.all.total = entry.all.commits + entry.all.prs + entry.all.reviews + entry.all.issues;
    entry.team.total = entry.team.commits + entry.team.prs + entry.team.reviews + entry.team.issues;
  }

  const activeMap = new Map<string, number>();
  for (const row of projActiveContribs) {
    activeMap.set(row.projectId!, Number(row.activeCount));
  }

  const summaries: ProjectSummary[] = trackedProjects.map(p => {
    const c = contribMap.get(p.id) ?? {
      all: { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
      team: { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
    };
    return {
      id: p.id,
      name: p.name,
      contributions: {
        all: c.all,
        team: c.team,
        percentage: calculatePercentage(c.team.total, c.all.total),
      },
      activeContributors: activeMap.get(p.id) ?? 0,
    };
  });

  return summaries
    .sort((a, b) => b.contributions.team.total - a.contributions.team.total)
    .slice(0, topN);
}
