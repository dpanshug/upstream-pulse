// Types matching the dashboard API response

export interface ContributionTypeMetric {
  total: number;
  team: number;
  teamPercent: number;
}

export interface TrendMetric {
  current: number;
  previous: number;
  changePercent: number;
  direction: 'up' | 'down' | 'flat';
}

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

export interface LeadershipRole {
  projectId: string;
  projectName: string;
  roleType: string;
  roleLabel?: string;
  scope?: string;
  isActive: boolean;
}

export interface OrgLeadershipRole {
  positionType: string;
  groupName: string;
  roleTitle: string;
  votingRights: boolean;
}

export interface LeadershipMember {
  id: string;
  name: string;
  githubUsername: string | null;
  avatarUrl?: string;
  roles: LeadershipRole[];
  leadershipRoles?: OrgLeadershipRole[];
}

export interface OrgPositionGroup {
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
}

export interface OrgLeadership {
  org: string;
  orgName: string;
  positions: OrgPositionGroup[];
}

export interface LeadershipData {
  byOrg: OrgLeadership[];
  maintainers: {
    totalApprovers: number;
    totalReviewers: number;
    teamApprovers: number;
    teamReviewers: number;
    rootApprovers?: number;
    rootReviewers?: number;
    componentApprovers?: number;
    componentReviewers?: number;
    teamRootApprovers?: number;
    teamRootReviewers?: number;
    teamComponentApprovers?: number;
    teamComponentReviewers?: number;
    governanceByType?: Array<{ positionType: string; label: string; team: number; total: number; teamRoot?: number; teamComponent?: number }>;
  };
  teamLeaders: LeadershipMember[];
}

export interface OrgActivity {
  org: string;
  orgName: string;
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

export interface ProjectMetric {
  id: string;
  name: string;
  githubOrg: string;
  githubRepo: string;
  contributions: {
    commits: ContributionTypeMetric;
    pullRequests: ContributionTypeMetric;
    reviews: ContributionTypeMetric;
    issues: ContributionTypeMetric;
    all: ContributionTypeMetric;
  };
  activeContributors: number;
}

export interface DailyDataPoint {
  date: string;
  commits: { total: number; team: number };
  pullRequests: { total: number; team: number };
  reviews: { total: number; team: number };
  issues: { total: number; team: number };
}

export interface DashboardData {
  summary: {
    periodDays: number;
    periodStart: string;
    periodEnd: string;
    trackedProjects: number;
    activeContributors: number;
  };
  contributions: {
    commits: ContributionTypeMetric;
    pullRequests: ContributionTypeMetric;
    reviews: ContributionTypeMetric;
    issues: ContributionTypeMetric;
    all: ContributionTypeMetric;
  };
  trends: {
    contributions: TrendMetric;
    activeContributors: TrendMetric;
  };
  topContributors: ContributorRanking[];
  topProjects: ProjectMetric[];
  dailyBreakdown: DailyDataPoint[];
  leadership?: LeadershipData;
  orgActivity?: OrgActivity[];
}

export const DEFAULT_PERIOD_DAYS = 30;

// Period options for the selector
export const PERIOD_OPTIONS = [
  { label: '7d', value: 7, description: 'Last 7 days' },
  { label: '30d', value: 30, description: 'Last 30 days' },
  { label: '90d', value: 90, description: 'Last 90 days' },
  { label: '1y', value: 365, description: 'Last year' },
  { label: 'All time', value: 0, description: 'Since beginning' },
] as const;
