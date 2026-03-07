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
  };
  teamLeaders: LeadershipMember[];
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
  topProjects: any[];
  dailyBreakdown: any[];
  leadership?: LeadershipData;
}

// Period options for the selector
export const PERIOD_OPTIONS = [
  { label: '7d', value: 7, description: 'Last 7 days' },
  { label: '30d', value: 30, description: 'Last 30 days' },
  { label: '90d', value: 90, description: 'Last 90 days' },
  { label: '1y', value: 365, description: 'Last year' },
  { label: 'All time', value: 0, description: 'Since beginning' },
] as const;
