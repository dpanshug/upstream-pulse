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

export interface SteeringCommitteeMember {
  id: string;
  name: string;
  githubUsername: string | null;
  avatarUrl?: string;
  votingRights: boolean;
}

export interface LeadershipData {
  summary: {
    totalApprovers: number;
    totalReviewers: number;
    teamApprovers: number;
    teamReviewers: number;
    steeringCommitteeCount?: number;
    wgChairsCount?: number;
    wgTechLeadsCount?: number;
  };
  teamLeaders: LeadershipMember[];
  steeringCommittee?: SteeringCommitteeMember[];
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
