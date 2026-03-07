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
    const { projectId } = options;
    const queryOptions = { days, projectId };
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

    logger.info('Building dashboard', { days, projectId, start: startStr, end: endStr });

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

    const [projectCountResult, activeContributors] = await Promise.all([
      db.select({ count: count() }).from(projects).where(eq(projects.trackingEnabled, true)),
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
      const topProjectsRaw = await db
        .select({
          id: projects.id,
          name: projects.name,
          githubOrg: projects.githubOrg,
          githubRepo: projects.githubRepo,
        })
        .from(projects)
        .where(eq(projects.trackingEnabled, true));

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
    const leadershipData = await this.getLeadershipSummary(projectId, projectRepo);

    return {
      summary: {
        periodDays: days,
        periodStart: startStr,
        periodEnd: endStr,
        trackedProjects: Number(projectCountResult[0].count),
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
  private async getLeadershipSummary(projectId?: string, githubRepo?: string) {
    try {
      // ── maintainerStatus (OWNERS/CODEOWNERS) ──
      const msConditions = [eq(maintainerStatus.isActive, true)];
      if (projectId) msConditions.push(eq(maintainerStatus.projectId, projectId));

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

      // When viewing a specific project, filter leadership to relevant WGs
      let filteredLp = allLp;
      if (projectId && githubRepo) {
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
