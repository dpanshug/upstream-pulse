/**
 * MetricsService
 * 
 * On-demand metrics calculation from raw contributions data.
 * Designed to be extensible - add new metric methods as needed.
 */

import { db } from '../../shared/database/client.js';
import { contributions, projects, teamMembers, maintainerStatus, leadershipPositions } from '../../shared/database/schema.js';
import { eq, and, gte, lte, sql, count, isNotNull } from 'drizzle-orm';
import { getOrgConfig } from '../../shared/config/org-registry.js';
import { logger } from '../../shared/utils/logger.js';
import type {
  DateRange,
  ContributionCounts,
  ContributionBreakdown,
  ContributionsByType,
  ContributionTypeMetric,
  TrendMetric,
  DailyDataPoint,
  ContributorRanking,
  ProjectMetric,
  DashboardResponse,
  DashboardResponseWithLeadership,
  MetricsQueryOptions,
  DailyContribution,
  ContributorSummary,
  ProjectSummary,
  TrendComparison,
  DashboardMetrics,
  OrgActivityItem,
} from './types.js';

export class MetricsService {
  
  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Get date range from options or default to last N days
   * If days=0, returns null to indicate "all time" (no date filtering)
   */
  private getDateRange(options: MetricsQueryOptions): DateRange | null {
    if (options.dateRange) {
      return options.dateRange;
    }
    const days = options.days ?? 0; // Default to 0 (all time)
    
    // days=0 means "all time" - no date filtering
    if (days === 0) {
      return null;
    }
    
    return {
      start: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      end: new Date(),
    };
  }

  /**
   * Format date to YYYY-MM-DD string
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Build contribution counts from query result
   */
  private buildCounts(rows: { type: string; count: number }[]): ContributionCounts {
    const counts: ContributionCounts = {
      commits: 0,
      prs: 0,
      reviews: 0,
      issues: 0,
      total: 0,
    };

    for (const row of rows) {
      switch (row.type) {
        case 'commit':
          counts.commits = row.count;
          break;
        case 'pr':
          counts.prs = row.count;
          break;
        case 'review':
          counts.reviews = row.count;
          break;
        case 'issue':
          counts.issues = row.count;
          break;
      }
    }
    counts.total = counts.commits + counts.prs + counts.reviews + counts.issues;
    return counts;
  }

  /**
   * Calculate percentage safely
   */
  private calculatePercentage(part: number, total: number): number {
    if (total === 0) return 0;
    return parseFloat(((part / total) * 100).toFixed(2));
  }

  /**
   * Build trend comparison
   */
  private buildTrend(current: number, previous: number): TrendMetric {
    const changePercent = previous === 0 
      ? (current > 0 ? 100 : 0)
      : parseFloat((((current - previous) / previous) * 100).toFixed(1));
    
    return {
      current,
      previous,
      changePercent,
      direction: changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'flat',
    };
  }

  /**
   * Build contribution type metric
   */
  private buildTypeMetric(total: number, team: number): ContributionTypeMetric {
    return {
      total,
      team,
      teamPercent: this.calculatePercentage(team, total),
    };
  }

  // ============================================
  // CONTRIBUTION METRICS
  // ============================================

  /**
   * Get contribution breakdown for a date range
   */
  async getContributionBreakdown(options: MetricsQueryOptions = {}): Promise<ContributionBreakdown> {
    const dateRange = this.getDateRange(options);

    // Build where conditions
    const conditions: ReturnType<typeof eq>[] = [];
    
    // Only add date filters if not "all time"
    if (dateRange) {
      const startStr = this.formatDate(dateRange.start);
      const endStr = this.formatDate(dateRange.end);
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

    // Get all contributions by type
    const allContribs = await db
      .select({
        type: contributions.contributionType,
        count: count(),
      })
      .from(contributions)
      .where(and(...conditions))
      .groupBy(contributions.contributionType);

    // Get team contributions by type
    const teamContribs = await db
      .select({
        type: contributions.contributionType,
        count: count(),
      })
      .from(contributions)
      .where(and(...conditions, isNotNull(contributions.teamMemberId)))
      .groupBy(contributions.contributionType);

    const all = this.buildCounts(allContribs.map(r => ({ type: r.type, count: Number(r.count) })));
    const team = this.buildCounts(teamContribs.map(r => ({ type: r.type, count: Number(r.count) })));

    return {
      all,
      team,
      percentage: this.calculatePercentage(team.total, all.total),
    };
  }

  /**
   * Get daily contribution trend
   */
  async getDailyTrend(options: MetricsQueryOptions = {}): Promise<DailyContribution[]> {
    const dateRange = this.getDateRange(options);
    
    // For "all time", default to last 365 days for the daily chart
    const effectiveRange = dateRange || {
      start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      end: new Date(),
    };
    const startStr = this.formatDate(effectiveRange.start);
    const endStr = this.formatDate(effectiveRange.end);

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

    // Get all contributions grouped by date and type
    const allDaily = await db
      .select({
        date: contributions.contributionDate,
        type: contributions.contributionType,
        count: count(),
      })
      .from(contributions)
      .where(and(...conditions))
      .groupBy(contributions.contributionDate, contributions.contributionType)
      .orderBy(contributions.contributionDate);

    // Get team contributions grouped by date and type
    const teamDaily = await db
      .select({
        date: contributions.contributionDate,
        type: contributions.contributionType,
        count: count(),
      })
      .from(contributions)
      .where(and(...conditions, isNotNull(contributions.teamMemberId)))
      .groupBy(contributions.contributionDate, contributions.contributionType)
      .orderBy(contributions.contributionDate);

    // Build daily map
    const dailyMap = new Map<string, DailyContribution>();

    // Initialize with all dates in range
    const current = new Date(effectiveRange.start);
    while (current <= effectiveRange.end) {
      const dateStr = this.formatDate(current);
      dailyMap.set(dateStr, {
        date: dateStr,
        all: { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
        team: { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
      });
      current.setDate(current.getDate() + 1);
    }

    // Fill in all contributions
    for (const row of allDaily) {
      const dateStr = row.date as string;
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

    // Fill in team contributions
    for (const row of teamDaily) {
      const dateStr = row.date as string;
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

  // ============================================
  // CONTRIBUTOR METRICS
  // ============================================

  /**
   * Get count of active team contributors
   */
  async getActiveContributorCount(options: MetricsQueryOptions = {}): Promise<number> {
    const dateRange = this.getDateRange(options);

    const conditions: ReturnType<typeof eq>[] = [
      isNotNull(contributions.teamMemberId),
    ];
    
    // Only add date filters if not "all time"
    if (dateRange) {
      const startStr = this.formatDate(dateRange.start);
      const endStr = this.formatDate(dateRange.end);
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

  /**
   * Get top contributors by contribution count
   */
  async getTopContributors(options: MetricsQueryOptions = {}): Promise<ContributorSummary[]> {
    const dateRange = this.getDateRange(options);
    const topN = options.topN || 10;

    const conditions: ReturnType<typeof eq>[] = [
      isNotNull(contributions.teamMemberId),
    ];
    
    // Only add date filters if not "all time"
    if (dateRange) {
      const startStr = this.formatDate(dateRange.start);
      const endStr = this.formatDate(dateRange.end);
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

    // Get contribution counts per team member per type
    const result = await db
      .select({
        teamMemberId: contributions.teamMemberId,
        type: contributions.contributionType,
        count: count(),
      })
      .from(contributions)
      .where(and(...conditions))
      .groupBy(contributions.teamMemberId, contributions.contributionType);

    // Aggregate by team member
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

    // Get team member details
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

    // Build summaries
    const summaries: ContributorSummary[] = members.map(m => ({
      id: m.id,
      name: m.name,
      githubUsername: m.githubUsername,
      contributions: memberMap.get(m.id) || { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 },
    }));

    // Sort by total and take top N
    return summaries
      .sort((a, b) => b.contributions.total - a.contributions.total)
      .slice(0, topN);
  }

  // ============================================
  // PROJECT METRICS
  // ============================================

  /**
   * Get top projects by team contribution
   */
  async getTopProjects(options: MetricsQueryOptions = {}): Promise<ProjectSummary[]> {
    const dateRange = this.getDateRange(options);
    const topN = options.topN || 5;

    // Get tracked projects
    const trackedProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
      })
      .from(projects)
      .where(eq(projects.trackingEnabled, true));

    const summaries: ProjectSummary[] = [];

    for (const project of trackedProjects) {
      const breakdown = await this.getContributionBreakdown({
        projectId: project.id,
        ...(dateRange ? { dateRange } : { days: 0 }),
      });

      const activeContributors = await this.getActiveContributorCount({
        projectId: project.id,
        ...(dateRange ? { dateRange } : { days: 0 }),
      });

      summaries.push({
        id: project.id,
        name: project.name,
        contributions: breakdown,
        activeContributors,
      });
    }

    // Sort by team contributions and take top N
    return summaries
      .sort((a, b) => b.contributions.team.total - a.contributions.team.total)
      .slice(0, topN);
  }

  // ============================================
  // TREND METRICS
  // ============================================

  /**
   * Get contribution trend comparing current vs previous period
   */
  async getContributionTrend(options: MetricsQueryOptions = {}): Promise<TrendComparison> {
    const dateRange = this.getDateRange(options);
    
    // For "all time", there's no previous period to compare
    if (!dateRange) {
      const current = await this.getContributionBreakdown({ days: 0 });
      return this.buildTrend(current.team.total, 0);
    }
    
    const { start, end } = dateRange;
    const periodMs = end.getTime() - start.getTime();
    
    const previousEnd = new Date(start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - periodMs);

    const current = await this.getContributionBreakdown({
      ...options,
      dateRange: { start, end },
    });

    const previous = await this.getContributionBreakdown({
      ...options,
      dateRange: { start: previousStart, end: previousEnd },
    });

    return this.buildTrend(current.team.total, previous.team.total);
  }

  /**
   * Get active contributor trend
   */
  async getActiveContributorTrend(options: MetricsQueryOptions = {}): Promise<TrendComparison> {
    const dateRange = this.getDateRange(options);
    
    // For "all time", there's no previous period to compare
    if (!dateRange) {
      const current = await this.getActiveContributorCount({ days: 0 });
      return this.buildTrend(current, 0);
    }
    
    const { start, end } = dateRange;
    const periodMs = end.getTime() - start.getTime();
    
    const previousEnd = new Date(start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - periodMs);

    const current = await this.getActiveContributorCount({
      ...options,
      dateRange: { start, end },
    });

    const previous = await this.getActiveContributorCount({
      ...options,
      dateRange: { start: previousStart, end: previousEnd },
    });

    return this.buildTrend(current, previous);
  }

  // ============================================
  // ORG ACTIVITY
  // ============================================

  /**
   * Get per-org activity summary for org cards.
   * Uses batched SQL queries (GROUP BY github_org) to avoid N+1.
   */
  async getOrgActivity(options: MetricsQueryOptions = {}): Promise<OrgActivityItem[]> {
    const dateRange = this.getDateRange(options);

    const dateConditions: ReturnType<typeof eq>[] = [];
    if (dateRange) {
      dateConditions.push(gte(contributions.contributionDate, this.formatDate(dateRange.start)));
      dateConditions.push(lte(contributions.contributionDate, this.formatDate(dateRange.end)));
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
          gte(contributions.contributionDate, this.formatDate(sparkRange.start)),
          lte(contributions.contributionDate, this.formatDate(sparkRange.end)),
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
          gte(contributions.contributionDate, this.formatDate(sparkRange.start)),
          lte(contributions.contributionDate, this.formatDate(sparkRange.end)),
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
          gte(contributions.contributionDate, this.formatDate(prevStart)),
          lte(contributions.contributionDate, this.formatDate(prevEnd)),
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

      results.push({
        org,
        orgName: getOrgConfig(org)?.name ?? org,
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

  // ============================================
  // DASHBOARD AGGREGATE
  // ============================================

  /**
   * Get complete dashboard metrics (main entry point)
   */
  async getDashboardMetrics(options: MetricsQueryOptions = {}): Promise<DashboardMetrics> {
    const days = options.days ?? 0; // Default to 0 (all time)
    const queryOptions = { ...options, days };

    logger.info('Calculating dashboard metrics', { days });

    // Run queries in parallel for performance
    const [
      projectCount,
      contributions,
      contributionsTrend,
      activeContributors,
      activeContributorsTrend,
      topContributors,
      topProjects,
      dailyTrend,
    ] = await Promise.all([
      db.select({ count: count() }).from(projects).where(eq(projects.trackingEnabled, true)),
      this.getContributionBreakdown(queryOptions),
      this.getContributionTrend(queryOptions),
      this.getActiveContributorCount(queryOptions),
      this.getActiveContributorTrend(queryOptions),
      this.getTopContributors({ ...queryOptions, topN: 10 }),
      this.getTopProjects({ ...queryOptions, topN: 5 }),
      options.includeDaily !== false ? this.getDailyTrend(queryOptions) : Promise.resolve([]),
    ]);

    return {
      projectCount: Number(projectCount[0].count),
      contributions,
      contributionsTrend,
      activeContributors,
      activeContributorsTrend,
      topContributors,
      topProjects,
      dailyTrend,
    };
  }

  // ============================================
  // NEW CLEAR DASHBOARD FORMAT
  // ============================================

  /**
   * Get dashboard with clear, organized structure
   * This is the new preferred method for the frontend
   */
  async getDashboard(options: MetricsQueryOptions = {}): Promise<DashboardResponseWithLeadership> {
    const days = options.days ?? 0; // Default to 0 (all time)
    const { projectId, githubOrg } = options;
    const queryOptions = { days, projectId, githubOrg };
    const dateRange = this.getDateRange({ days });
    
    let startStr: string;
    let endStr: string;
    
    if (dateRange) {
      startStr = this.formatDate(dateRange.start);
      endStr = this.formatDate(dateRange.end);
    } else {
      endStr = this.formatDate(new Date());
      startStr = 'All time';
    }

    logger.info('Building dashboard', { days, projectId, githubOrg, start: startStr, end: endStr });

    const breakdown = await this.getContributionBreakdown(queryOptions);
    
    const contributionsByType: ContributionsByType = {
      commits: this.buildTypeMetric(breakdown.all.commits, breakdown.team.commits),
      pullRequests: this.buildTypeMetric(breakdown.all.prs, breakdown.team.prs),
      reviews: this.buildTypeMetric(breakdown.all.reviews, breakdown.team.reviews),
      issues: this.buildTypeMetric(breakdown.all.issues, breakdown.team.issues),
      all: this.buildTypeMetric(breakdown.all.total, breakdown.team.total),
    };

    const [contributionsTrend, contributorsTrend] = await Promise.all([
      this.getContributionTrend(queryOptions),
      this.getActiveContributorTrend(queryOptions),
    ]);

    const projectCountConditions = [eq(projects.trackingEnabled, true)];
    if (githubOrg) {
      projectCountConditions.push(eq(projects.githubOrg, githubOrg));
    }
    const [projectCountResult, activeContributors] = await Promise.all([
      db.select({ count: count() }).from(projects).where(and(...projectCountConditions)),
      this.getActiveContributorCount(queryOptions),
    ]);

    const topContributorsRaw = await this.getTopContributors({ ...queryOptions, topN: 50 });
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

    // Only fetch per-project breakdown when viewing all projects
    let topProjects: ProjectMetric[] = [];
    if (!projectId) {
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

      topProjects = await Promise.all(
        topProjectsRaw.map(async (p) => {
          const projBreakdown = await this.getContributionBreakdown({ 
            projectId: p.id, 
            days,
          });
          const projActiveContributors = await this.getActiveContributorCount({
            projectId: p.id,
            days,
          });

          return {
            id: p.id,
            name: p.name,
            githubOrg: p.githubOrg,
            githubRepo: p.githubRepo,
            contributions: {
              commits: this.buildTypeMetric(projBreakdown.all.commits, projBreakdown.team.commits),
              pullRequests: this.buildTypeMetric(projBreakdown.all.prs, projBreakdown.team.prs),
              reviews: this.buildTypeMetric(projBreakdown.all.reviews, projBreakdown.team.reviews),
              issues: this.buildTypeMetric(projBreakdown.all.issues, projBreakdown.team.issues),
              all: this.buildTypeMetric(projBreakdown.all.total, projBreakdown.team.total),
            },
            activeContributors: projActiveContributors,
          };
        })
      );

      topProjects.sort((a, b) => b.contributions.all.team - a.contributions.all.team);
    }

    const dailyRaw = await this.getDailyTrend(queryOptions);
    const dailyBreakdown: DailyDataPoint[] = dailyRaw.map(d => ({
      date: d.date,
      commits: { total: d.all.commits, team: d.team.commits },
      pullRequests: { total: d.all.prs, team: d.team.prs },
      reviews: { total: d.all.reviews, team: d.team.reviews },
      issues: { total: d.all.issues, team: d.team.issues },
    }));

    let projectRepo: string | undefined;
    if (projectId) {
      const proj = await db.query.projects.findFirst({
        columns: { githubRepo: true },
        where: eq(projects.id, projectId),
      });
      projectRepo = proj?.githubRepo;
    }
    const [leadershipData, orgActivity] = await Promise.all([
      this.getLeadershipSummary(projectId, projectRepo, githubOrg),
      !projectId && !githubOrg
        ? this.getOrgActivity({ days }).then(r => r.slice(0, 4))
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
      topProjects,
      dailyBreakdown,
      leadership: leadershipData,
      orgActivity,
    };
  }

  /**
   * Get working groups for a repo using the org registry config.
   */
  private getWorkingGroupsForProject(githubOrg: string, githubRepo: string): string[] {
    const orgCfg = getOrgConfig(githubOrg);
    if (!orgCfg?.repoToWorkingGroup) return [];
    return orgCfg.repoToWorkingGroup[githubRepo] ?? [];
  }

  /**
   * Leadership summary for dashboard — returns per-org leadership groups.
   *
   * Structure:
   *   byOrg[].positions[] — grouped by positionType within each org
   *   maintainers — OWNERS/CODEOWNERS based approvers/reviewers
   *   teamLeaders — all team members with any governance role
   */
  private async getLeadershipSummary(projectId?: string, githubRepo?: string, githubOrg?: string) {
    try {
      // ── maintainerStatus (OWNERS/CODEOWNERS) ──
      const msConditions = [eq(maintainerStatus.isActive, true)];
      if (projectId) msConditions.push(eq(maintainerStatus.projectId, projectId));
      if (githubOrg) msConditions.push(eq(projects.githubOrg, githubOrg));

      const maintainerStatuses = await db
        .select({
          id: maintainerStatus.id,
          positionType: maintainerStatus.positionType,
          teamMemberId: maintainerStatus.teamMemberId,
          teamMemberName: teamMembers.name,
          githubUsername: teamMembers.githubUsername,
          projectId: maintainerStatus.projectId,
          projectName: projects.name,
          isActive: maintainerStatus.isActive,
        })
        .from(maintainerStatus)
        .innerJoin(teamMembers, eq(maintainerStatus.teamMemberId, teamMembers.id))
        .innerJoin(projects, eq(maintainerStatus.projectId, projects.id))
        .where(and(...msConditions));

      // ── leadershipPositions (community repo leadership) ──
      const allLp = await db
        .select({
          id: leadershipPositions.id,
          positionType: leadershipPositions.positionType,
          committeeName: leadershipPositions.committeeName,
          roleTitle: leadershipPositions.roleTitle,
          communityOrg: leadershipPositions.communityOrg,
          teamMemberId: leadershipPositions.teamMemberId,
          teamMemberName: teamMembers.name,
          githubUsername: teamMembers.githubUsername,
          isActive: leadershipPositions.isActive,
          votingRights: leadershipPositions.votingRights,
        })
        .from(leadershipPositions)
        .innerJoin(teamMembers, eq(leadershipPositions.teamMemberId, teamMembers.id))
        .where(eq(leadershipPositions.isActive, true));

      // Filter leadership positions by scope
      let filteredLp = allLp;
      if (githubOrg && !projectId) {
        filteredLp = allLp.filter(p => p.communityOrg === githubOrg);
      } else if (projectId && githubRepo) {
        const project = await db.query.projects.findFirst({
          columns: { githubOrg: true },
          where: eq(projects.id, projectId),
        });
        if (project) {
          const relevantWGs = new Set(
            this.getWorkingGroupsForProject(project.githubOrg, githubRepo)
              .map(wg => wg.toLowerCase()),
          );
          filteredLp = allLp.filter(p => {
            if (p.communityOrg !== project.githubOrg) return false;
            const name = p.committeeName?.toLowerCase() ?? '';
            return relevantWGs.has(name);
          });
        }
      }

      // ── Build byOrg structure ──
      type OrgPositionGroup = {
        positionType: string;
        roleTitle: string;
        teamCount: number;
        totalCount: number;
        members: Array<{
          id: string;
          name: string;
          githubUsername: string | null;
          avatarUrl?: string;
          groupName: string;
          votingRights: boolean;
        }>;
      };

      const orgMap = new Map<string, {
        org: string;
        orgName: string;
        positions: Map<string, OrgPositionGroup>;
      }>();

      // Count total positions (all, not just team) by org+type
      const totalLpCounts = await db
        .select({
          communityOrg: leadershipPositions.communityOrg,
          positionType: leadershipPositions.positionType,
          count: sql<number>`count(*)::int`,
        })
        .from(leadershipPositions)
        .where(eq(leadershipPositions.isActive, true))
        .groupBy(leadershipPositions.communityOrg, leadershipPositions.positionType);

      const totalKey = (org: string, type: string) => `${org}::${type}`;
      const totalMap = new Map(totalLpCounts.map(r => [totalKey(r.communityOrg ?? '', r.positionType), r.count]));

      for (const pos of filteredLp) {
        const orgSlug = pos.communityOrg ?? 'unknown';
        if (!orgMap.has(orgSlug)) {
          const orgCfg = getOrgConfig(orgSlug);
          orgMap.set(orgSlug, {
            org: orgSlug,
            orgName: orgCfg?.name ?? orgSlug,
            positions: new Map(),
          });
        }
        const orgEntry = orgMap.get(orgSlug)!;

        if (!orgEntry.positions.has(pos.positionType)) {
          const roleTitle = pos.roleTitle
            || pos.positionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          orgEntry.positions.set(pos.positionType, {
            positionType: pos.positionType,
            roleTitle,
            teamCount: 0,
            totalCount: totalMap.get(totalKey(orgSlug, pos.positionType)) ?? 0,
            members: [],
          });
        }

        const group = orgEntry.positions.get(pos.positionType)!;
        group.teamCount++;
        group.members.push({
          id: pos.teamMemberId!,
          name: pos.teamMemberName,
          githubUsername: pos.githubUsername,
          avatarUrl: pos.githubUsername
            ? `https://github.com/${pos.githubUsername}.png?size=80`
            : undefined,
          groupName: pos.committeeName || 'Unknown',
          votingRights: pos.votingRights ?? false,
        });
      }

      const byOrg = Array.from(orgMap.values()).map(o => ({
        org: o.org,
        orgName: o.orgName,
        positions: Array.from(o.positions.values()),
      }));

      // ── Maintainer counts ──
      const teamApprovers = maintainerStatuses.filter(s => s.positionType === 'maintainer').length;
      const teamReviewers = maintainerStatuses.filter(s => s.positionType === 'reviewer').length;
      const totalApprovers = Math.max(teamApprovers * 2, 6);
      const totalReviewers = Math.max(teamReviewers * 2, 5);

      // ── teamLeaders — comprehensive member map ──
      const memberMap = new Map<string, {
        id: string;
        name: string;
        githubUsername: string | null;
        avatarUrl?: string;
        roles: Array<{ projectId?: string; projectName?: string; roleType: string; isActive: boolean }>;
        leadershipRoles: Array<{ positionType: string; groupName: string; roleTitle: string; votingRights: boolean }>;
      }>();

      const getMember = (id: string, name: string, ghUser: string | null) => {
        if (!memberMap.has(id)) {
          memberMap.set(id, {
            id, name, githubUsername: ghUser,
            avatarUrl: ghUser ? `https://github.com/${ghUser}.png?size=80` : undefined,
            roles: [], leadershipRoles: [],
          });
        }
        return memberMap.get(id)!;
      };

      for (const s of maintainerStatuses) {
        if (!s.teamMemberId) continue;
        getMember(s.teamMemberId, s.teamMemberName, s.githubUsername).roles.push({
          projectId: s.projectId!, projectName: s.projectName,
          roleType: s.positionType === 'maintainer' ? 'approver' : 'reviewer',
          isActive: s.isActive ?? true,
        });
      }

      for (const p of filteredLp) {
        if (!p.teamMemberId) continue;
        getMember(p.teamMemberId, p.teamMemberName, p.githubUsername).leadershipRoles.push({
          positionType: p.positionType,
          groupName: p.committeeName || 'Unknown',
          roleTitle: p.roleTitle || p.positionType,
          votingRights: p.votingRights ?? false,
        });
      }

      return {
        byOrg,
        maintainers: { teamApprovers, teamReviewers, totalApprovers, totalReviewers },
        teamLeaders: Array.from(memberMap.values()),
      };
    } catch (error) {
      logger.warn('Error fetching leadership data', { error });
      return {
        byOrg: [],
        maintainers: { teamApprovers: 0, teamReviewers: 0, totalApprovers: 0, totalReviewers: 0 },
        teamLeaders: [],
      };
    }
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
