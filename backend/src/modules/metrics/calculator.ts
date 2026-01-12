import { db } from '../../shared/database/client.js';
import { contributions, metricsDaily, projects, teamMembers } from '../../shared/database/schema.js';
import { eq, and, gte, lte, sql, count } from 'drizzle-orm';
import { logger } from '../../shared/utils/logger.js';

export class MetricsCalculator {
  /**
   * Calculate daily metrics for a project
   */
  async calculateDailyMetrics(
    projectId: string,
    date: Date
  ): Promise<void> {
    logger.info('Calculating daily metrics', {
      projectId,
      date: date.toISOString().split('T')[0],
    });

    const dateStr = date.toISOString().split('T')[0];

    try {
      // Get all contributions for this date
      const allContributions = await db
        .select()
        .from(contributions)
        .where(
          and(
            eq(contributions.projectId, projectId),
            eq(contributions.contributionDate, dateStr)
          )
        );

      // Separate Red Hat vs total contributions
      const redhatContributions = allContributions.filter(c => c.teamMemberId !== null);

      // Count by type
      const totalCommits = allContributions.filter(c => c.contributionType === 'commit').length;
      const totalPrs = allContributions.filter(c => c.contributionType === 'pr').length;
      const totalReviews = allContributions.filter(c => c.contributionType === 'review').length;
      const totalIssues = allContributions.filter(c => c.contributionType === 'issue').length;

      const redhatCommits = redhatContributions.filter(c => c.contributionType === 'commit').length;
      const redhatPrs = redhatContributions.filter(c => c.contributionType === 'pr').length;
      const redhatReviews = redhatContributions.filter(c => c.contributionType === 'review').length;
      const redhatIssues = redhatContributions.filter(c => c.contributionType === 'issue').length;

      // Calculate percentages
      const commitPercentage = totalCommits > 0
        ? ((redhatCommits / totalCommits) * 100).toFixed(2)
        : '0.00';

      const prPercentage = totalPrs > 0
        ? ((redhatPrs / totalPrs) * 100).toFixed(2)
        : '0.00';

      const reviewPercentage = totalReviews > 0
        ? ((redhatReviews / totalReviews) * 100).toFixed(2)
        : '0.00';

      // Count unique contributors
      const activeContributors = new Set(
        redhatContributions.map(c => c.teamMemberId).filter(Boolean)
      ).size;

      // Store metrics
      await db
        .insert(metricsDaily)
        .values({
          projectId,
          metricDate: dateStr,
          totalCommits,
          totalPrs,
          totalReviews,
          totalIssues,
          redhatCommits,
          redhatPrs,
          redhatReviews,
          redhatIssues,
          commitPercentage,
          prPercentage,
          reviewPercentage,
          activeContributors,
        })
        .onConflictDoUpdate({
          target: [metricsDaily.projectId, metricsDaily.metricDate],
          set: {
            totalCommits,
            totalPrs,
            totalReviews,
            totalIssues,
            redhatCommits,
            redhatPrs,
            redhatReviews,
            redhatIssues,
            commitPercentage,
            prPercentage,
            reviewPercentage,
            activeContributors,
          },
        });

      logger.info('Daily metrics calculated', {
        projectId,
        date: dateStr,
        totalCommits,
        redhatCommits,
        commitPercentage,
      });

    } catch (error) {
      logger.error('Error calculating daily metrics', {
        error,
        projectId,
        date: dateStr,
      });
      throw error;
    }
  }

  /**
   * Calculate metrics for a date range
   */
  async calculateMetricsRange(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    logger.info('Calculating metrics for date range', {
      projectId,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    });

    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      await this.calculateDailyMetrics(projectId, new Date(currentDate));

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    logger.info('Metrics range calculation completed');
  }

  /**
   * Get contribution summary for a project over a time period
   */
  async getContributionSummary(
    projectId: string,
    startDate: Date,
    endDate: Date
  ) {
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    try {
      const metrics = await db
        .select()
        .from(metricsDaily)
        .where(
          and(
            eq(metricsDaily.projectId, projectId),
            gte(metricsDaily.metricDate, startDateStr),
            lte(metricsDaily.metricDate, endDateStr)
          )
        )
        .orderBy(metricsDaily.metricDate);

      // Aggregate totals
      const totals = metrics.reduce(
        (acc, m) => ({
          totalCommits: acc.totalCommits + (m.totalCommits || 0),
          totalPrs: acc.totalPrs + (m.totalPrs || 0),
          totalReviews: acc.totalReviews + (m.totalReviews || 0),
          totalIssues: acc.totalIssues + (m.totalIssues || 0),
          redhatCommits: acc.redhatCommits + (m.redhatCommits || 0),
          redhatPrs: acc.redhatPrs + (m.redhatPrs || 0),
          redhatReviews: acc.redhatReviews + (m.redhatReviews || 0),
          redhatIssues: acc.redhatIssues + (m.redhatIssues || 0),
        }),
        {
          totalCommits: 0,
          totalPrs: 0,
          totalReviews: 0,
          totalIssues: 0,
          redhatCommits: 0,
          redhatPrs: 0,
          redhatReviews: 0,
          redhatIssues: 0,
        }
      );

      const totalContributions = totals.totalCommits + totals.totalPrs + totals.totalReviews + totals.totalIssues;
      const redhatContributions = totals.redhatCommits + totals.redhatPrs + totals.redhatReviews + totals.redhatIssues;

      const contributionPercentage = totalContributions > 0
        ? ((redhatContributions / totalContributions) * 100)
        : 0;

      return {
        projectId,
        startDate: startDateStr,
        endDate: endDateStr,
        ...totals,
        totalContributions,
        redhatContributions,
        contributionPercentage: parseFloat(contributionPercentage.toFixed(2)),
        dailyMetrics: metrics,
      };

    } catch (error) {
      logger.error('Error getting contribution summary', {
        error,
        projectId,
      });
      throw error;
    }
  }

  /**
   * Get dashboard overview metrics
   */
  async getDashboardMetrics(days: number = 30) {
    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const endDateStr = endDate.toISOString().split('T')[0];
    const startDateStr = startDate.toISOString().split('T')[0];

    try {
      // Get all metrics for the period
      const allMetrics = await db
        .select()
        .from(metricsDaily)
        .where(
          and(
            gte(metricsDaily.metricDate, startDateStr),
            lte(metricsDaily.metricDate, endDateStr)
          )
        );

      // Aggregate across all projects
      const totals = allMetrics.reduce(
        (acc, m) => ({
          totalCommits: acc.totalCommits + (m.totalCommits || 0),
          totalPrs: acc.totalPrs + (m.totalPrs || 0),
          totalReviews: acc.totalReviews + (m.totalReviews || 0),
          redhatCommits: acc.redhatCommits + (m.redhatCommits || 0),
          redhatPrs: acc.redhatPrs + (m.redhatPrs || 0),
          redhatReviews: acc.redhatReviews + (m.redhatReviews || 0),
        }),
        {
          totalCommits: 0,
          totalPrs: 0,
          totalReviews: 0,
          redhatCommits: 0,
          redhatPrs: 0,
          redhatReviews: 0,
        }
      );

      const totalContributions = totals.totalCommits + totals.totalPrs + totals.totalReviews;
      const redhatContributions = totals.redhatCommits + totals.redhatPrs + totals.redhatReviews;

      const avgContributionPct = totalContributions > 0
        ? ((redhatContributions / totalContributions) * 100)
        : 0;

      // Get project count
      const projectCount = await db
        .select({ count: count() })
        .from(projects)
        .where(eq(projects.trackingEnabled, true));

      // Get active contributor count
      const activeContributorsData = await db
        .select({
          teamMemberId: contributions.teamMemberId,
        })
        .from(contributions)
        .where(
          and(
            gte(contributions.contributionDate, startDateStr),
            lte(contributions.contributionDate, endDateStr),
            sql`${contributions.teamMemberId} IS NOT NULL`
          )
        )
        .groupBy(contributions.teamMemberId);

      const activeContributors = activeContributorsData.length;

      return {
        projectCount: projectCount[0].count,
        contributions30d: redhatContributions,
        contributions30dChange: 0, // TODO: Calculate change vs previous period
        maintainerCount: 0, // TODO: Query maintainer_status table
        maintainerCountChange: 0,
        avgContributionPct: parseFloat(avgContributionPct.toFixed(2)),
        activeContributors,
        activeContributorsChange: 0, // TODO: Calculate change
        trendData: [], // TODO: Format daily metrics for charts
        latestInsights: [], // TODO: Query insights table
        topProjects: [], // TODO: Get top projects by contribution
      };

    } catch (error) {
      logger.error('Error getting dashboard metrics', { error });
      throw error;
    }
  }

  /**
   * Calculate trend percentage vs previous period
   */
  async calculateTrend(
    projectId: string,
    currentStart: Date,
    currentEnd: Date
  ): Promise<number> {
    const periodLength = currentEnd.getTime() - currentStart.getTime();
    const previousEnd = new Date(currentStart.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - periodLength);

    const current = await this.getContributionSummary(projectId, currentStart, currentEnd);
    const previous = await this.getContributionSummary(projectId, previousStart, previousEnd);

    if (previous.redhatContributions === 0) {
      return current.redhatContributions > 0 ? 100 : 0;
    }

    const change = ((current.redhatContributions - previous.redhatContributions) / previous.redhatContributions) * 100;

    return parseFloat(change.toFixed(2));
  }
}
