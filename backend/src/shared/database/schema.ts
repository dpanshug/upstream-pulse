import { pgTable, uuid, varchar, timestamp, boolean, integer, decimal, jsonb, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Projects table - tracks repositories to monitor
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  ecosystem: varchar('ecosystem', { length: 100 }).notNull(), // 'kubernetes', 'lfai', 'python-ml'
  githubOrg: varchar('github_org', { length: 255 }).notNull(),
  githubRepo: varchar('github_repo', { length: 255 }).notNull(),
  primaryLanguage: varchar('primary_language', { length: 50 }),
  governanceType: varchar('governance_type', { length: 50 }), // 'cncf', 'apache', 'linux-foundation'
  trackingEnabled: boolean('tracking_enabled').default(true),
  lastSyncAt: timestamp('last_sync_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniqueRepo: uniqueIndex('unique_github_repo').on(table.githubOrg, table.githubRepo),
}));

// Team members table - organization team registry
export const teamMembers = pgTable('team_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  primaryEmail: varchar('primary_email', { length: 255 }).unique(), // Optional - GitHub username is primary identifier
  githubUsername: varchar('github_username', { length: 255 }),
  githubUserId: integer('github_user_id').unique(),
  employeeId: varchar('employee_id', { length: 100 }),
  department: varchar('department', { length: 100 }),
  role: varchar('role', { length: 100 }),
  startDate: date('start_date'),
  endDate: date('end_date'),
  isActive: boolean('is_active').default(true),
  source: varchar('source', { length: 50 }).default('manual'), // 'manual' | 'github_org_sync'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Identity mappings - handles multiple emails/usernames per person
export const identityMappings = pgTable('identity_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  teamMemberId: uuid('team_member_id').references(() => teamMembers.id, { onDelete: 'cascade' }),
  identityType: varchar('identity_type', { length: 50 }).notNull(), // 'github', 'email', 'npm', 'pypi'
  identityValue: varchar('identity_value', { length: 255 }).notNull(),
  confidenceScore: decimal('confidence_score', { precision: 3, scale: 2 }).default('1.0'), // 0.0 to 1.0
  verified: boolean('verified').default(false),
  verifiedAt: timestamp('verified_at'),
  verifiedBy: varchar('verified_by', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueIdentity: uniqueIndex('unique_identity').on(table.identityType, table.identityValue),
  teamMemberIdx: index('identity_team_member_idx').on(table.teamMemberId),
}));

// Contributions table - time-series contribution records
export const contributions = pgTable('contributions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  teamMemberId: uuid('team_member_id').references(() => teamMembers.id, { onDelete: 'cascade' }),
  contributionType: varchar('contribution_type', { length: 50 }).notNull(), // 'commit', 'pr', 'review', 'issue'
  contributionDate: date('contribution_date').notNull(),
  githubId: varchar('github_id', { length: 255 }), // GitHub PR/issue/commit ID
  githubUrl: varchar('github_url', { length: 500 }),
  linesAdded: integer('lines_added'),
  linesDeleted: integer('lines_deleted'),
  filesChanged: integer('files_changed'),
  isMerged: boolean('is_merged'),
  metadata: jsonb('metadata'), // Flexible storage for additional data
  collectedAt: timestamp('collected_at').defaultNow(),
}, (table) => ({
  dateIdx: index('contributions_date_idx').on(table.contributionDate),
  projectMemberIdx: index('contributions_project_member_idx').on(table.projectId, table.teamMemberId),
  typeIdx: index('contributions_type_idx').on(table.contributionType),
  uniqueContribution: uniqueIndex('unique_contribution').on(table.projectId, table.contributionType, table.githubId),
}));

// Maintainer status tracking
// Stores ALL OWNERS/CODEOWNERS entries — both team members and external contributors.
// For team members: teamMemberId is set. For external: teamMemberId is null, githubUsername identifies the person.
export const maintainerStatus = pgTable('maintainer_status', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  teamMemberId: uuid('team_member_id').references(() => teamMembers.id, { onDelete: 'cascade' }),
  githubUsername: varchar('github_username', { length: 255 }),
  positionType: varchar('position_type', { length: 100 }).notNull(), // 'maintainer', 'committer', 'reviewer'
  positionTitle: varchar('position_title', { length: 255 }),
  grantedDate: date('granted_date'),
  revokedDate: date('revoked_date'),
  isActive: boolean('is_active').default(true),
  source: varchar('source', { length: 100 }), // 'MAINTAINERS_file', 'github_permissions', 'manual'
  evidenceUrl: varchar('evidence_url', { length: 500 }),
  notes: varchar('notes', { length: 5000 }),
  scope: varchar('scope', { length: 20 }).default('root'), // 'root' = repo root OWNERS, 'component' = subdirectory OWNERS
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  projectMemberIdx: index('maintainer_project_member_idx').on(table.projectId, table.teamMemberId),
  activeIdx: index('maintainer_active_idx').on(table.isActive),
  githubUsernameIdx: index('maintainer_github_username_idx').on(table.githubUsername),
  scopeIdx: index('maintainer_scope_idx').on(table.scope),
}));

// Leadership positions (steering committees, working groups)
// Stores ALL community leadership positions - both team members and external contributors
// For team members: teamMemberId is set
// For external: teamMemberId is null, but githubUsername/externalName/organization are populated
export const leadershipPositions = pgTable('leadership_positions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  teamMemberId: uuid('team_member_id').references(() => teamMembers.id, { onDelete: 'cascade' }),
  // External member info (used when teamMemberId is null)
  githubUsername: varchar('github_username', { length: 255 }),
  externalName: varchar('external_name', { length: 255 }),
  organization: varchar('organization', { length: 255 }),
  communityOrg: varchar('community_org', { length: 100 }),
  positionType: varchar('position_type', { length: 100 }).notNull(), // 'steering_committee', 'wg_chair', 'wg_tech_lead', etc.
  committeeName: varchar('committee_name', { length: 255 }),
  roleTitle: varchar('role_title', { length: 255 }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  isActive: boolean('is_active').default(true),
  votingRights: boolean('voting_rights').default(false),
  source: varchar('source', { length: 100 }),
  evidenceUrl: varchar('evidence_url', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  projectMemberIdx: index('leadership_project_member_idx').on(table.projectId, table.teamMemberId),
  activeIdx: index('leadership_active_idx').on(table.isActive),
  githubUsernameIdx: index('leadership_github_username_idx').on(table.githubUsername),
  communityOrgIdx: index('leadership_community_org_idx').on(table.communityOrg),
}));

// DEPRECATED: This table is no longer used. Metrics are now calculated on-demand.
// Kept for backwards compatibility. Can be removed in a future migration.
// @deprecated Use MetricsService.getDashboardMetrics() instead
export const metricsDaily = pgTable('metrics_daily', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  metricDate: date('metric_date').notNull(),
  totalCommits: integer('total_commits').default(0),
  totalPrs: integer('total_prs').default(0),
  totalReviews: integer('total_reviews').default(0),
  totalIssues: integer('total_issues').default(0),
  redhatCommits: integer('redhat_commits').default(0),
  redhatPrs: integer('redhat_prs').default(0),
  redhatReviews: integer('redhat_reviews').default(0),
  redhatIssues: integer('redhat_issues').default(0),
  commitPercentage: decimal('commit_percentage', { precision: 5, scale: 2 }),
  prPercentage: decimal('pr_percentage', { precision: 5, scale: 2 }),
  reviewPercentage: decimal('review_percentage', { precision: 5, scale: 2 }),
  activeContributors: integer('active_contributors').default(0),
  newContributors: integer('new_contributors').default(0),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueMetric: uniqueIndex('unique_daily_metric').on(table.projectId, table.metricDate),
  dateIdx: index('metrics_date_idx').on(table.metricDate),
}));

// Generated insights (via Gemini or statistical analysis)
export const insights = pgTable('insights', {
  id: uuid('id').defaultRandom().primaryKey(),
  insightType: varchar('insight_type', { length: 100 }).notNull(), // 'trend', 'opportunity', 'anomaly', 'summary'
  severity: varchar('severity', { length: 50 }), // 'info', 'warning', 'critical'
  title: varchar('title', { length: 500 }).notNull(),
  description: varchar('description', { length: 5000 }).notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  timeRangeStart: date('time_range_start'),
  timeRangeEnd: date('time_range_end'),
  confidenceScore: decimal('confidence_score', { precision: 3, scale: 2 }),
  actionable: boolean('actionable').default(false),
  actionItems: jsonb('action_items'),
  metadata: jsonb('metadata'),
  generatedAt: timestamp('generated_at').defaultNow(),
  acknowledgedAt: timestamp('acknowledged_at'),
  acknowledgedBy: varchar('acknowledged_by', { length: 255 }),
}, (table) => ({
  typeIdx: index('insights_type_idx').on(table.insightType),
  generatedIdx: index('insights_generated_idx').on(table.generatedAt),
}));

// Collection job tracking
export const collectionJobs = pgTable('collection_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobType: varchar('job_type', { length: 100 }).notNull(), // 'full_sync', 'incremental', 'governance_refresh'
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull(), // 'pending', 'running', 'completed', 'failed'
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  recordsProcessed: integer('records_processed').default(0),
  errorsCount: integer('errors_count').default(0),
  errorDetails: jsonb('error_details'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  statusIdx: index('jobs_status_idx').on(table.status),
  createdIdx: index('jobs_created_idx').on(table.createdAt),
}));

// Report generation history
export const reports = pgTable('reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportType: varchar('report_type', { length: 100 }).notNull(), // 'executive_summary', 'quarterly', 'project_deep_dive'
  format: varchar('format', { length: 50 }).notNull(), // 'pdf', 'json', 'slides'
  timeRangeStart: date('time_range_start').notNull(),
  timeRangeEnd: date('time_range_end').notNull(),
  projectIds: jsonb('project_ids'),
  generatedBy: varchar('generated_by', { length: 255 }),
  filePath: varchar('file_path', { length: 500 }),
  fileSizeBytes: integer('file_size_bytes'),
  generationDurationMs: integer('generation_duration_ms'),
  parameters: jsonb('parameters'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  typeIdx: index('reports_type_idx').on(table.reportType),
  createdIdx: index('reports_created_idx').on(table.createdAt),
}));

// Relations
export const projectsRelations = relations(projects, ({ many }) => ({
  contributions: many(contributions),
  maintainerStatuses: many(maintainerStatus),
  leadershipPositions: many(leadershipPositions),
  metricsDaily: many(metricsDaily),
  collectionJobs: many(collectionJobs),
}));

export const collectionJobsRelations = relations(collectionJobs, ({ one }) => ({
  project: one(projects, {
    fields: [collectionJobs.projectId],
    references: [projects.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ many }) => ({
  identityMappings: many(identityMappings),
  contributions: many(contributions),
  maintainerStatuses: many(maintainerStatus),
  leadershipPositions: many(leadershipPositions),
}));

export const contributionsRelations = relations(contributions, ({ one }) => ({
  project: one(projects, {
    fields: [contributions.projectId],
    references: [projects.id],
  }),
  teamMember: one(teamMembers, {
    fields: [contributions.teamMemberId],
    references: [teamMembers.id],
  }),
}));
