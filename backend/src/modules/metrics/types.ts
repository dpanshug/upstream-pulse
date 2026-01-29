/**
 * Metrics Types
 * 
 * Extensible type definitions for metrics calculations.
 * Add new metric types here as needed.
 */

// Time range for queries
export interface DateRange {
  start: Date;
  end: Date;
}

// Single contribution type metric (e.g., commits, PRs)
export interface ContributionTypeMetric {
  total: number;
  team: number;
  teamPercent: number;
}

// All contribution types
export interface ContributionsByType {
  commits: ContributionTypeMetric;
  pullRequests: ContributionTypeMetric;
  reviews: ContributionTypeMetric;
  issues: ContributionTypeMetric;
  all: ContributionTypeMetric;
}

// Trend comparison between periods
export interface TrendMetric {
  current: number;
  previous: number;
  changePercent: number;
  direction: 'up' | 'down' | 'flat';
}

// Daily contribution data point
export interface DailyDataPoint {
  date: string;
  commits: { total: number; team: number };
  pullRequests: { total: number; team: number };
  reviews: { total: number; team: number };
  issues: { total: number; team: number };
}

// Contributor in leaderboard
export interface ContributorRanking {
  rank: number;
  id: string;
  name: string;
  githubUsername: string | null;
  avatarUrl?: string;
  commits: number;
  pullRequests: number;
  reviews: number;
  issues: number;
  total: number;
}

// Project summary
export interface ProjectMetric {
  id: string;
  name: string;
  githubOrg: string;
  githubRepo: string;
  contributions: ContributionsByType;
  activeContributors: number;
}

// Summary section of dashboard
export interface DashboardSummary {
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  trackedProjects: number;
  activeContributors: number;
}

// Complete dashboard response - clear and organized
export interface DashboardResponse {
  summary: DashboardSummary;
  contributions: ContributionsByType;
  trends: {
    contributions: TrendMetric;
    activeContributors: TrendMetric;
  };
  topContributors: ContributorRanking[];
  topProjects: ProjectMetric[];
  dailyBreakdown: DailyDataPoint[];
}

// Query options for metrics
export interface MetricsQueryOptions {
  projectId?: string;
  days?: number;
  dateRange?: DateRange;
  includeDaily?: boolean;
  topN?: number;
}

// Legacy types for backwards compatibility (can be removed later)
export interface ContributionCounts {
  commits: number;
  prs: number;
  reviews: number;
  issues: number;
  total: number;
}

export interface ContributionBreakdown {
  all: ContributionCounts;
  team: ContributionCounts;
  percentage: number;
}
