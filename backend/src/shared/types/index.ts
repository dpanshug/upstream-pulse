import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type * as schema from '../database/schema.js';

// Inferred types from schema
export type Project = InferSelectModel<typeof schema.projects>;
export type NewProject = InferInsertModel<typeof schema.projects>;

export type TeamMember = InferSelectModel<typeof schema.teamMembers>;
export type NewTeamMember = InferInsertModel<typeof schema.teamMembers>;

export type IdentityMapping = InferSelectModel<typeof schema.identityMappings>;
export type NewIdentityMapping = InferInsertModel<typeof schema.identityMappings>;

export type Contribution = InferSelectModel<typeof schema.contributions>;
export type NewContribution = InferInsertModel<typeof schema.contributions>;

export type MaintainerStatus = InferSelectModel<typeof schema.maintainerStatus>;
export type NewMaintainerStatus = InferInsertModel<typeof schema.maintainerStatus>;

export type LeadershipPosition = InferSelectModel<typeof schema.leadershipPositions>;
export type NewLeadershipPosition = InferInsertModel<typeof schema.leadershipPositions>;

export type MetricsDaily = InferSelectModel<typeof schema.metricsDaily>;
export type NewMetricsDaily = InferInsertModel<typeof schema.metricsDaily>;

export type Insight = InferSelectModel<typeof schema.insights>;
export type NewInsight = InferInsertModel<typeof schema.insights>;

export type CollectionJob = InferSelectModel<typeof schema.collectionJobs>;
export type NewCollectionJob = InferInsertModel<typeof schema.collectionJobs>;

export type Report = InferSelectModel<typeof schema.reports>;
export type NewReport = InferInsertModel<typeof schema.reports>;

// Custom types
export interface Repository {
  githubOrg: string;
  githubRepo: string;
  id?: string;
}

export interface ContributionData {
  projectName: string;
  ecosystem: string;
  totalContributions: number;
  redhatContributions: number;
  contributionPercentage: number;
  redhatMaintainers: number;
  totalMaintainers: number;
  trendPercentage: number;
  activeContributors: number;
}

export interface InsightReport {
  trends: InsightItem[];
  opportunities: OpportunityItem[];
  anomalies: AnomalyItem[];
  recommendations: RecommendationItem[];
}

export interface InsightItem {
  type: 'growth' | 'decline';
  project: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface OpportunityItem {
  project: string;
  opportunity: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}

export interface AnomalyItem {
  project: string;
  description: string;
  severity: 'warning' | 'critical';
}

export interface RecommendationItem {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

export interface ResolvedIdentity {
  teamMember: TeamMember | null;
  confidence: number;
  source: 'explicit_mapping' | 'email_domain' | 'fuzzy_match' | 'unresolved';
  requiresVerification?: boolean;
}
