import type { FastifyInstance } from 'fastify';
import { metricsService } from '../../metrics/metrics-service.js';
import { logger } from '../../../shared/utils/logger.js';
import { db } from '../../../shared/database/client.js';
import { maintainerStatus, teamMembers, projects } from '../../../shared/database/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { resolveTeamMember } from '../../../shared/middleware/resolve-team-member.js';
import {
  getMyContributionBreakdown,
  getMyContributionTrend,
  getMyDailyActivity,
  getMyProjects,
  getMyTeamRank,
  getMyRoles,
  getTeamTotalContributions,
  getMyRecentActivity,
  getMyMergeRate,
  computeStreak,
  toHeatmapData,
} from '../../metrics/my-contributions.js';
import { getDateRange, formatDate, calculatePercentage } from '../../metrics/helpers.js';
import { getActionQueue } from '../../metrics/my-github-queue.js';

const DASHBOARD_CACHE_TTL = 5 * 60 * 1000;
const dashboardCache = new Map<string, { data: unknown; ts: number }>();

function dashboardCacheKey(days: number, projectId?: string, githubOrg?: string): string {
  return `dashboard:${days}:${projectId || ''}:${githubOrg || ''}`;
}

export async function metricsRoutes(app: FastifyInstance) {

  /**
   * GET /api/metrics/dashboard
   * 
   * Main dashboard endpoint - returns all metrics in a clear, organized structure.
   * Responses are cached in Redis for 5 minutes.
   * Query params:
   *   - days: number of days to analyze (default: 30)
   *   - projectId: filter by project (optional)
   */
  app.get<{
    Querystring: { days?: string; projectId?: string; githubOrg?: string };
  }>('/api/metrics/dashboard', async (request, reply) => {
    try {
      const days = parseInt(request.query.days || '30', 10);
      const { projectId, githubOrg } = request.query;
      const cacheKey = dashboardCacheKey(days, projectId, githubOrg);

      const cached = dashboardCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < DASHBOARD_CACHE_TTL) {
        reply.header('x-cache', 'hit');
        return cached.data;
      }

      const dashboard = await metricsService.getDashboard({ days, projectId, githubOrg });

      dashboardCache.set(cacheKey, { data: dashboard, ts: Date.now() });
      if (dashboardCache.size > 50) {
        const oldest = [...dashboardCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
        for (let i = 0; i < 10; i++) dashboardCache.delete(oldest[i][0]);
      }

      reply.header('x-cache', 'miss');
      return dashboard;
    } catch (error) {
      logger.error('Error fetching dashboard', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch dashboard',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/overview (legacy - kept for backwards compatibility)
   */
  app.get<{
    Querystring: { days?: string };
  }>('/api/metrics/overview', async (request, reply) => {
    try {
      const days = parseInt(request.query.days || '30', 10);
      const dashboard = await metricsService.getDashboard({ days });
      
      // Transform to legacy format for backwards compatibility
      return {
        projectCount: dashboard.summary.trackedProjects,
        contributions30d: dashboard.contributions.all.team,
        contributions30dChange: dashboard.trends.contributions.changePercent,
        maintainerCount: 0,
        maintainerCountChange: 0,
        avgContributionPct: dashboard.contributions.all.teamPercent,
        activeContributors: dashboard.summary.activeContributors,
        activeContributorsChange: dashboard.trends.activeContributors.changePercent,
        trendData: dashboard.dailyBreakdown,
        latestInsights: [],
        topProjects: dashboard.topProjects,
        topContributors: dashboard.topContributors,
      };
    } catch (error) {
      logger.error('Error fetching dashboard metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch dashboard metrics',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/contributions
   * 
   * Get contribution breakdown.
   * Query params:
   *   - days: number of days (default: 30)
   *   - projectId: filter by project (optional)
   */
  app.get<{
    Querystring: { days?: string; projectId?: string };
  }>('/api/metrics/contributions', async (request, reply) => {
    try {
      const days = parseInt(request.query.days || '30', 10);
      const { projectId } = request.query;

      const breakdown = await metricsService.getContributionBreakdown({
        days,
        projectId,
      });

      return breakdown;
    } catch (error) {
      logger.error('Error fetching contribution metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch contribution metrics',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/contributors
   * 
   * Get top contributors.
   * Query params:
   *   - days: number of days (default: 30)
   *   - projectId: filter by project (optional)
   *   - limit: number of contributors to return (default: 10)
   */
  app.get<{
    Querystring: { days?: string; projectId?: string; githubOrg?: string; limit?: string };
  }>('/api/metrics/contributors', async (request, reply) => {
    try {
      const days = parseInt(request.query.days || '30', 10);
      const topN = parseInt(request.query.limit || '10', 10);
      const { projectId, githubOrg } = request.query;

      const contributors = await metricsService.getTopContributors({
        days,
        projectId,
        githubOrg,
        topN,
      });

      return {
        contributors,
        count: contributors.length,
        days,
      };
    } catch (error) {
      logger.error('Error fetching contributor metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch contributor metrics',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/trend
   * 
   * Get daily contribution trend.
   * Query params:
   *   - days: number of days (default: 30)
   *   - projectId: filter by project (optional)
   */
  app.get<{
    Querystring: { days?: string; projectId?: string };
  }>('/api/metrics/trend', async (request, reply) => {
    try {
      const days = parseInt(request.query.days || '30', 10);
      const { projectId } = request.query;

      const trend = await metricsService.getDailyTrend({
        days,
        projectId,
      });

      return {
        trend,
        days,
      };
    } catch (error) {
      logger.error('Error fetching trend metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch trend metrics',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/projects/:projectId
   * 
   * Get metrics for a specific project.
   */
  app.get<{
    Params: { projectId: string };
    Querystring: { days?: string };
  }>('/api/metrics/projects/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params;
      const days = parseInt(request.query.days || '30', 10);

      const [breakdown, trend, contributors] = await Promise.all([
        metricsService.getContributionBreakdown({ projectId, days }),
        metricsService.getContributionTrend({ projectId, days }),
        metricsService.getTopContributors({ projectId, days, topN: 10 }),
      ]);

      return {
        projectId,
        days,
        contributions: breakdown,
        trend,
        topContributors: contributors,
      };
    } catch (error) {
      logger.error('Error fetching project metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch project metrics',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/leadership
   * 
   * Get team leadership positions (approvers/reviewers from OWNERS files).
   * Optional `projectId` scopes to a single project; optional `githubOrg`
   * scopes to a single org; omit both for the global (all-orgs) view.
   */
  app.get<{
    Querystring: { projectId?: string; githubOrg?: string };
  }>('/api/metrics/leadership', async (request, reply) => {
    try {
      const { projectId, githubOrg } = request.query as { projectId?: string; githubOrg?: string };

      const isScoped = !!(projectId || githubOrg);
      const scopeFilters = [eq(maintainerStatus.isActive, true)];
      if (projectId) scopeFilters.push(eq(maintainerStatus.projectId, projectId));
      else if (githubOrg) scopeFilters.push(eq(projects.githubOrg, githubOrg));
      const baseConditions = scopeFilters.length > 1 ? and(...scopeFilters) : scopeFilters[0];

      const statuses = await db
        .select({
          id: maintainerStatus.id,
          positionType: maintainerStatus.positionType,
          positionTitle: maintainerStatus.positionTitle,
          source: maintainerStatus.source,
          evidenceUrl: maintainerStatus.evidenceUrl,
          notes: maintainerStatus.notes,
          isActive: maintainerStatus.isActive,
          teamMemberId: maintainerStatus.teamMemberId,
          teamMemberName: teamMembers.name,
          githubUsername: teamMembers.githubUsername,
          projectId: maintainerStatus.projectId,
          projectName: projects.name,
          githubOrg: projects.githubOrg,
          githubRepo: projects.githubRepo,
        })
        .from(maintainerStatus)
        .innerJoin(teamMembers, eq(maintainerStatus.teamMemberId, teamMembers.id))
        .innerJoin(projects, eq(maintainerStatus.projectId, projects.id))
        .where(baseConditions);

      const isApproverType = (t: string) => t !== 'reviewer';
      const teamApproverRows = statuses.filter(s => isApproverType(s.positionType));
      const teamReviewerRows = statuses.filter(s => s.positionType === 'reviewer');

      const teamApproversCount = isScoped
        ? new Set(teamApproverRows.map(s => s.githubUsername)).size
        : teamApproverRows.length;
      const teamReviewersCount = isScoped
        ? new Set(teamReviewerRows.map(s => s.githubUsername)).size
        : teamReviewerRows.length;

      const projectsWithMaintainers = [...new Set(statuses.map(s => s.projectId))];

      const needsProjectJoin = !!(projectId || githubOrg);
      const totalQuery = db
        .select({
          positionType: maintainerStatus.positionType,
          count: sql<number>`count(distinct ${maintainerStatus.githubUsername})::int`,
        })
        .from(maintainerStatus);

      const totalMsCounts = needsProjectJoin
        ? await totalQuery
            .innerJoin(projects, eq(maintainerStatus.projectId, projects.id))
            .where(baseConditions!)
            .groupBy(maintainerStatus.positionType)
        : await totalQuery
            .where(baseConditions)
            .groupBy(maintainerStatus.positionType);

      const totalApproversEstimate = totalMsCounts.filter(r => isApproverType(r.positionType)).reduce((s, r) => s + r.count, 0);
      const totalReviewersEstimate = totalMsCounts.find(r => r.positionType === 'reviewer')?.count ?? 0;

      const governanceByType = totalMsCounts
        .map(r => ({
          positionType: r.positionType,
          label: r.positionType === 'reviewer' ? 'Reviewers'
            : r.positionType === 'maintainer' ? 'Code Owners'
            : r.positionType === 'approver' ? 'Approvers'
            : r.positionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + 's',
          team: statuses.filter(s => s.positionType === r.positionType).length,
          total: r.count,
        }))
        .filter(g => g.total > 0);

      const memberMap = new Map<string, {
        id: string;
        name: string;
        githubUsername: string | null;
        roles: Array<{
          projectId: string;
          projectName: string;
          role: string;
          paths?: string;
          evidenceUrl?: string | null;
        }>;
      }>();

      const defaultRoleLabel = (pt: string) => {
        if (pt === 'reviewer') return 'Reviewer';
        if (pt === 'maintainer') return 'Code Owner';
        if (pt === 'approver') return 'Approver';
        return pt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      };

      for (const status of statuses) {
        if (!memberMap.has(status.teamMemberId!)) {
          memberMap.set(status.teamMemberId!, {
            id: status.teamMemberId!,
            name: status.teamMemberName,
            githubUsername: status.githubUsername,
            roles: [],
          });
        }

        memberMap.get(status.teamMemberId!)!.roles.push({
          projectId: status.projectId!,
          projectName: status.projectName,
          role: status.positionTitle || defaultRoleLabel(status.positionType),
          paths: status.notes?.replace('Paths: ', ''),
          evidenceUrl: status.evidenceUrl,
        });
      }

      const members = Array.from(memberMap.values());

      return {
        summary: {
          teamApprovers: teamApproversCount,
          teamReviewers: teamReviewersCount,
          totalApprovers: totalApproversEstimate,
          totalReviewers: totalReviewersEstimate,
          approverPercent: totalApproversEstimate > 0 
            ? (teamApproversCount / totalApproversEstimate) * 100 
            : 0,
          reviewerPercent: totalReviewersEstimate > 0 
            ? (teamReviewersCount / totalReviewersEstimate) * 100 
            : 0,
          projectsWithTeamLeadership: projectsWithMaintainers.length,
          governanceByType,
        },
        members,
        raw: statuses,
      };
    } catch (error) {
      logger.error('Error fetching leadership metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch leadership metrics',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/me
   *
   * Personal contribution metrics for the logged-in user.
   * Resolves identity from request headers -- no user ID parameter accepted.
   * Query params:
   *   - days: number of days (default: 30)
   */
  app.get<{
    Querystring: { days?: string; heatmapYear?: string };
  }>('/api/metrics/me', async (request, reply) => {
    try {
      const resolved = await resolveTeamMember(
        request.identity.email || undefined,
        request.identity.username || undefined,
      );

      if (!resolved) {
        return {
          resolved: false as const,
          username: request.identity.username,
          email: request.identity.email,
        };
      }

      const days = parseInt(request.query.days || '30', 10);
      const options = { days };
      const dateRange = getDateRange(options);

      const periodStart = dateRange ? formatDate(dateRange.start) : 'All time';
      const periodEnd = dateRange ? formatDate(dateRange.end) : formatDate(new Date());

      const heatmapYearRaw = request.query.heatmapYear;
      const heatmapYear = heatmapYearRaw ? parseInt(heatmapYearRaw, 10) : NaN;
      const heatmapOptions = !isNaN(heatmapYear) && heatmapYear >= 2000 && heatmapYear <= 2100
        ? {
            dateRange: {
              start: new Date(`${heatmapYear}-01-01`),
              end: new Date(`${heatmapYear}-12-31`),
            },
          }
        : { days: 365 };

      const [breakdown, trend, daily, myProjects, rank, roles, teamTotal, recentActivity, mergeRateData, heatmapDaily] = await Promise.all([
        getMyContributionBreakdown(resolved.id, options),
        getMyContributionTrend(resolved.id, options),
        getMyDailyActivity(resolved.id, options),
        getMyProjects(resolved.id),
        getMyTeamRank(resolved.id, options),
        getMyRoles(resolved.id),
        getTeamTotalContributions(options),
        getMyRecentActivity(resolved.id),
        getMyMergeRate(resolved.id, options),
        getMyDailyActivity(resolved.id, heatmapOptions),
      ]);

      const streak = computeStreak(heatmapDaily);
      const heatmap = toHeatmapData(heatmapDaily);

      return {
        resolved: true as const,
        profile: {
          id: resolved.id,
          name: resolved.name,
          githubUsername: resolved.githubUsername,
          avatarUrl: resolved.avatarUrl,
          memberSince: resolved.memberSince,
        },
        summary: {
          periodDays: days,
          periodStart,
          periodEnd,
          totalContributions: breakdown.total,
          activeProjects: myProjects.length,
          teamSharePercent: calculatePercentage(breakdown.total, teamTotal),
          teamRank: rank.rank,
          teamSize: rank.teamSize,
        },
        contributions: {
          commits: breakdown.commits,
          pullRequests: breakdown.prs,
          reviews: breakdown.reviews,
          issues: breakdown.issues,
          total: breakdown.total,
        },
        trend,
        dailyActivity: daily,
        projects: myProjects,
        roles,
        recentActivity,
        mergeRate: mergeRateData,
        streak,
        heatmap,
      };
    } catch (error) {
      logger.error('Error fetching personal metrics', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch personal metrics',
        message: (error as Error).message,
      };
    }
  });

  /**
   * GET /api/metrics/me/action-queue
   *
   * Live GitHub PR queue for the logged-in user.
   * Returns open PRs authored by the user and PRs requesting their review,
   * scoped to tracked project orgs. Cached for 2 minutes per user.
   */
  app.get('/api/metrics/me/action-queue', async (request, reply) => {
    try {
      const resolved = await resolveTeamMember(
        request.identity.email || undefined,
        request.identity.username || undefined,
      );

      if (!resolved?.githubUsername) {
        return {
          resolved: false as const,
          reason: resolved
            ? 'No GitHub username linked to your profile'
            : 'Could not match your login to a team member',
        };
      }

      const data = await getActionQueue(resolved.githubUsername);
      return data;
    } catch (error) {
      logger.error('Error fetching action queue', { error });
      reply.status(500);
      return {
        error: 'Failed to fetch action queue',
        message: (error as Error).message,
      };
    }
  });
}
