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

// Per-org activity summary for org cards
export interface OrgActivityItem {
  org: string;
  orgName: string;
  strategicParticipation?: string | null;
  strategicLeadership?: string | null;
  total: number;
  commits: number;
  prs: number;
  reviews: number;
  issues: number;
  trend: Array<{ date: string; count: number }>;
  totalTrend: Array<{ date: string; count: number }>;
  percentChange: number;
  leadershipCount: number;
  maintainerCount: number;
  totalContributions: number;
  teamSharePercent: number;
  activeTeamMembers: number;
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
  githubOrg?: string;
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

// Daily contribution data used in trend charts
export interface DailyContribution {
  date: string;
  all: ContributionCounts;
  team: ContributionCounts;
}

// Contributor summary for leaderboards
export interface ContributorSummary {
  id: string;
  name: string;
  githubUsername: string | null;
  contributions: ContributionCounts;
}

// Project summary for rankings
export interface ProjectSummary {
  id: string;
  name: string;
  contributions: ContributionBreakdown;
  activeContributors: number;
}

// Alias for TrendMetric (used in comparison methods)
export type TrendComparison = TrendMetric;

// Full dashboard metrics response (legacy format)
export interface DashboardMetrics {
  projectCount: number;
  contributions: ContributionBreakdown;
  contributionsTrend: TrendComparison;
  activeContributors: number;
  activeContributorsTrend: TrendComparison;
  topContributors: ContributorSummary[];
  topProjects: ProjectSummary[];
  dailyTrend: DailyContribution[];
}

// Leadership summary returned by the dashboard API
export interface LeadershipSummaryResponse {
  byOrg: Array<{
    org: string;
    orgName: string;
    positions: Array<{
      positionType: string;
      roleTitle: string;
      groupName?: string;
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
    }>;
  }>;
  maintainers: {
    teamApprovers: number;
    teamReviewers: number;
    totalApprovers: number;
    totalReviewers: number;
    rootApprovers: number;
    rootReviewers: number;
    componentApprovers: number;
    componentReviewers: number;
    teamRootApprovers: number;
    teamRootReviewers: number;
    teamComponentApprovers: number;
    teamComponentReviewers: number;
    governanceByType?: Array<{ positionType: string; label: string; team: number; total: number; teamRoot: number; teamComponent: number }>;
  };
  teamLeaders: Array<{
    id: string;
    name: string;
    githubUsername: string | null;
    avatarUrl?: string;
    roles: Array<{ projectId: string; projectName: string; roleType: string; roleLabel: string; scope: string; isActive: boolean }>;
    leadershipRoles: Array<{ positionType: string; groupName: string; roleTitle: string; votingRights: boolean }>;
  }>;
}

// Extended dashboard response with leadership data
export interface DashboardResponseWithLeadership extends DashboardResponse {
  leadership: LeadershipSummaryResponse;
  orgActivity?: OrgActivityItem[];
}
