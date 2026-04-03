/**
 * MetricsService — thin facade over domain modules.
 *
 * All query logic lives in focused files:
 *   contributions.ts — breakdown, daily trend, contributor counts, trends
 *   projects.ts      — top projects (batched SQL)
 *   org-activity.ts  — per-org activity summaries
 *   leadership.ts    — governance/OWNERS queries
 *   dashboard.ts     — orchestrators that compose the above
 *   helpers.ts       — shared pure functions
 */

import {
  getContributionBreakdown,
  getDailyTrend,
  getActiveContributorCount,
  getTopContributors,
  getContributionTrend,
  getActiveContributorTrend,
} from './contributions.js';
import { getTopProjects } from './projects.js';
import { getOrgActivity } from './org-activity.js';
import { getDashboard, getDashboardMetrics } from './dashboard.js';

export class MetricsService {
  getContributionBreakdown = getContributionBreakdown;
  getDailyTrend = getDailyTrend;
  getActiveContributorCount = getActiveContributorCount;
  getTopContributors = getTopContributors;
  getTopProjects = getTopProjects;
  getContributionTrend = getContributionTrend;
  getActiveContributorTrend = getActiveContributorTrend;
  getOrgActivity = getOrgActivity;
  getDashboardMetrics = getDashboardMetrics;
  getDashboard = getDashboard;
}

export const metricsService = new MetricsService();
