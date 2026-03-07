# AI-Powered Upstream OSS Contribution Tracker
## Architecture & Implementation Plan

**Project Name:** `upstream-pulse`
**Stack:** TypeScript + Node.js + Fastify + PostgreSQL + React + Vite
**Deployment:** Web service with real-time dashboard

---

## Executive Summary

Build an AI-powered web application to track Red Hat AI Organization's contributions across upstream open source communities (Kubernetes, CNCF, LF AI & Data, Python AI/ML ecosystem, Kubeflow, MLFlow). The system will:

1. Automatically collect contribution data from GitHub (commits, PRs, reviews, issues)
2. Parse governance documents to track maintainer status and leadership positions
3. Map contributor identities to Red Hat team members
4. Calculate contribution percentages and trend metrics
5. Generate AI-powered insights using Claude API
6. Provide real-time executive dashboard with KPIs and visualizations

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React + Vite Dashboard (TypeScript + Tailwind + shadcn/ui) │
│  - Executive KPIs   - Trend Charts   - AI Insights          │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API + WebSocket
┌────────────────────────▼────────────────────────────────────┐
│  Fastify API Server (TypeScript)                            │
│  - /api/contributions  - /api/insights  - /api/reports      │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Business Logic Layer                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ GitHub       │  │ Identity     │  │ Metrics      │      │
│  │ Collector    │  │ Resolver     │  │ Calculator   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ AI Insights  │  │ Governance   │  │ Report       │      │
│  │ Engine       │  │ Parser       │  │ Generator    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Data Storage Layer                                         │
│  PostgreSQL (time-series data) + Redis (cache/queue)        │
│  BullMQ (job scheduling)                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend
- **Runtime:** Node.js 20 LTS
- **Language:** TypeScript 5.3+
- **Framework:** Fastify 4.x (2x faster than Express, native TypeScript support)
- **Database:** PostgreSQL 16 (primary) + Redis 7.x (cache/queue)
- **ORM:** Drizzle ORM (better TypeScript inference than Prisma)
- **Queue:** BullMQ (job persistence and retry logic)
- **Scheduler:** node-cron (daily/hourly collection jobs)
- **Validation:** Zod
- **AI SDK:** @google/generative-ai (Gemini 1.5 Pro)
- **GitHub API:** @octokit/rest

### Frontend
- **UI Library:** React 18 (component rendering)
- **Build Tool:** Vite 5.x (dev server, bundling, hot reload - replaces Create React App)
- **Language:** TypeScript 5.3+
- **Styling:** Tailwind CSS + shadcn/ui
- **Charts:** Recharts
- **Data Fetching:** @tanstack/react-query
- **State Management:** Zustand
- **Forms:** react-hook-form + Zod validation
- **Routing:** React Router v6

**Why Vite over alternatives:**
- 10-100x faster than Webpack (instant hot reload)
- Zero config setup (vs complex Webpack configuration)
- Native ESM in dev (modern architecture)
- Proven in your portfolio project

### DevOps
- **Containerization:** Docker + docker-compose
- **Orchestration:** Kubernetes (production)
- **CI/CD:** GitHub Actions
- **Monitoring:** Prometheus + Winston logging

---

## Core Components

### 1. Data Collection Layer

**GitHub Collector (`src/modules/collection/github-collector.ts`)**
- Collects commits, PRs, issues, reviews from GitHub API using Octokit
- Tracks repository permissions for maintainer status
- Handles rate limiting (5000 requests/hour)
- Scheduled runs: Daily full sync (2 AM UTC) + hourly incremental updates

**Org Registry (`src/shared/config/org-registry.ts`)**
- Static config declaring all supported upstream organizations
- Each entry specifies the GitHub org slug, governance model (`owners` | `codeowners` | `none`), community repo location, leadership files, and optional WG YAML path
- Adding a new org = PR to this file (see [adding-an-org.md](adding-an-org.md))

**Leadership Collector (`src/modules/collection/leadership-collector.ts`)**
- Config-driven collector that accepts an `UpstreamOrgConfig` and dispatches to the appropriate parser
- **Markdown table parser** — unified parser for leadership tables; supports uniform-role files (e.g. `KUBEFLOW-STEERING-COMMITTEE.md` where every row is `steering_committee`) and mixed-role files (e.g. `MAINTAINERS.md` where each row has its own role column)
- **WGs YAML parser** — parameterized via `communityRepo.wgFile`; extracts chairs and tech leads from `sigs`, `workinggroups`, `usergroups`, and `committees` sections
- Results are stored in `leadershipPositions` with a `communityOrg` column to scope data per org

**CODEOWNERS Parser (`src/modules/collection/codeowners-parser.ts`)**
- Parses GitHub-native `CODEOWNERS` files to extract per-user maintainer entries
- Checks `.github/CODEOWNERS`, then root `CODEOWNERS`, then `docs/CODEOWNERS`
- Skips `@org/team` references (resolving team membership requires `read:org` scope on external orgs)

**Governance Worker (`src/jobs/workers/governance-worker.ts`)**
- Looks up `governanceModel` from the org registry to decide whether to parse OWNERS files, CODEOWNERS files, or skip governance for each project

**Collection Scheduler (`src/jobs/scheduler.ts`)**
- node-cron based scheduling
- BullMQ job queue for reliable execution
- Retry logic with exponential backoff
- Dispatches one leadership job per org that has a `communityRepo` configured

### 2. Identity Resolution Engine

**Identity Resolver (`src/modules/identity/resolver.ts`)**
- Maps GitHub usernames → Red Hat team members
- Matching strategies:
  1. Explicit mappings (manual verification)
  2. Email domain matching (@redhat.com)
  3. Fuzzy name matching (PostgreSQL similarity functions)
- Confidence scoring (0.0 - 1.0)
- Stores unresolved identities for manual review

### 3. Metrics Calculation Engine

**Metrics Calculator (`src/modules/metrics/calculator.ts`) + Metrics Service (`src/modules/metrics/metrics-service.ts`)**
- **Contribution Percentage:** Red Hat commits/PRs/reviews vs total
- **Leadership Metrics:** Maintainer seats, steering committee, TSC, and WG positions — returned per org (`byOrg[]`) instead of hardcoded Kubeflow fields
- **Trend Analysis:** Month-over-month, quarter-over-quarter, year-over-year
- **Working Group mapping:** driven by `repoToWorkingGroup` in the org registry

### 4. AI Insights Engine

**AI Engine (`src/modules/insights/ai-engine.ts`)**
- Uses Google Gemini 1.5 Pro API (similar to retro-agent pattern)
- Analyzes contribution data to generate:
  - **Trends:** Growing/declining contribution patterns
  - **Opportunities:** Repos needing more presence, potential maintainer positions
  - **Anomalies:** Sudden drops, unusual patterns
  - **Recommendations:** Strategic actions for leadership
- Scheduled weekly deep analysis
- Cached insights (1 hour TTL)
- Cost: ~$0.35 per 1M tokens (7x cheaper than Claude)

### 5. API Layer

**Fastify Server (`src/app.ts`)**
- REST endpoints: `/api/contributions`, `/api/insights`, `/api/reports`, `/api/projects`, `/api/orgs`, `/api/leadership/refresh`
- `GET /api/orgs` returns org registry entries
- `POST /api/leadership/refresh` accepts optional `githubOrg` to scope the refresh
- `POST /api/projects` auto-triggers leadership refresh for the new project's org
- WebSocket endpoint: `/ws/updates` for real-time job status
- Built-in validation using Zod schemas
- Prometheus metrics endpoint: `/metrics`

### 6. Frontend Dashboard

**React + Vite SPA (`frontend/src/pages/`)**
- **Main Dashboard (`Dashboard.tsx`):** Executive KPI cards, trend charts, AI insights panel
- **Projects View:** Project-by-project breakdown with drill-down
- **Contributors View:** Team member contribution leaderboard
- **Insights View:** Full AI-generated insights and recommendations
- **Reports View:** Generate and export executive reports (PDF/JSON)
- **Admin Panel:** Team member registry, project configuration

---

## Database Schema (PostgreSQL)

### Core Tables

**projects**
- Tracks repositories to monitor (GitHub org/repo, ecosystem, governance type)
- Columns: id, name, ecosystem, github_org, github_repo, tracking_enabled

**team_members**
- Red Hat AI team member registry
- Columns: id, name, primary_email, github_username, employee_id, department, is_active

**identity_mappings**
- Maps multiple identities to team members (handles personal emails, username changes)
- Columns: id, team_member_id, identity_type, identity_value, confidence_score, verified

**contributions**
- Time-series contribution records (commits, PRs, reviews, issues)
- Partitioned by contribution_date for performance
- Columns: id, project_id, team_member_id, contribution_type, contribution_date, github_id, lines_added/deleted, metadata

**maintainer_status**
- Tracks maintainer/committer/reviewer positions
- Columns: id, project_id, team_member_id, position_type, granted_date, revoked_date, is_active, source, evidence_url

**leadership_positions**
- Tracks steering committee, working group, and TSC positions across all upstream orgs
- Stores both team members (via `team_member_id`) and external contributors (via `github_username`, `external_name`, `organization`)
- Columns: id, project_id, team_member_id, github_username, external_name, organization, community_org, position_type, committee_name, role_title, start_date, end_date, is_active, voting_rights, source, evidence_url

**metrics_daily**
- Pre-calculated daily aggregates for dashboard performance
- Columns: id, project_id, metric_date, total_commits, redhat_commits, commit_percentage, active_contributors

**insights**
- AI-generated insights and recommendations
- Columns: id, insight_type, severity, title, description, project_id, time_range, confidence_score, actionable, action_items

**collection_jobs**
- Job execution tracking
- Columns: id, job_type, project_id, status, started_at, completed_at, records_processed, errors

### Redis Schema

**Cache Keys:**
- `metrics:dashboard:{orgId}` (TTL: 5 min)
- `contributions:{projectId}:{range}` (TTL: 15 min)
- `insights:latest:{orgId}` (TTL: 1 hour)

**BullMQ Queues:**
- `contribution-collection` (priority: 1)
- `insight-generation` (priority: 2)
- `report-generation` (priority: 3)

---

## Implementation Phases

### Phase 1: MVP Foundation (4-6 weeks)

**Week 1-2: Project Setup & Database**
- Initialize monorepo structure
- PostgreSQL schema implementation with Drizzle ORM
- Redis setup with BullMQ
- Basic GitHub collector (commits + PRs only)
- Team member registry (CSV import)

**Week 3-4: Core Collection & API**
- Identity resolution (email domain matching)
- Metrics calculation (contribution percentage)
- Fastify API with REST endpoints
- BullMQ job scheduling

**Week 5-6: Basic Dashboard**
- React + Vite frontend setup
- Dashboard page with KPI cards
- Project list view
- Contributor list view

**MVP Deliverable:** Functional system tracking 10-20 repos with basic dashboard

### Phase 2: AI & Advanced Features (4-6 weeks)

**Week 7-8: AI Integration**
- Claude API integration
- Insight generation engine
- Anomaly detection

**Week 9-10: Advanced Collection**
- Governance document parsing
- Maintainer status tracking
- GitHub review activity
- Leadership position tracking

**Week 11-12: Enhanced Dashboard**
- AI insights panel
- Recharts trend visualization
- Project deep-dive pages
- Alert system

**Phase 2 Deliverable:** AI-powered insights, complete contribution tracking, interactive dashboard

### Phase 3: Production Deployment (3-4 weeks)

**Week 13-14: Reports & Exports**
- PDF report generation
- JSON export API
- Email notifications

**Week 15-16: Production Infrastructure**
- Docker containerization
- Kubernetes deployment (2 API replicas, 3 worker replicas)
- CI/CD pipeline (GitHub Actions)
- Monitoring (Prometheus metrics, Winston logging)

**Week 17 (optional): Scale Testing**
- Load testing (100+ repos)
- Performance optimization
- Database query tuning

**Phase 3 Deliverable:** Production-ready deployment on Kubernetes with monitoring

---

## Critical Implementation Files

### 1. Database Schema
**Path:** `backend/src/shared/database/schema.ts`

Core Drizzle ORM schema definitions. Establishes the data model that all components depend on.

```typescript
import { pgTable, uuid, varchar, timestamp, boolean, integer, decimal, jsonb, date, index } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  ecosystem: varchar('ecosystem', { length: 100 }).notNull(),
  githubOrg: varchar('github_org', { length: 255 }).notNull(),
  githubRepo: varchar('github_repo', { length: 255 }).notNull(),
  trackingEnabled: boolean('tracking_enabled').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const teamMembers = pgTable('team_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  primaryEmail: varchar('primary_email', { length: 255 }).unique().notNull(),
  githubUsername: varchar('github_username', { length: 255 }),
  githubUserId: integer('github_user_id').unique(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const contributions = pgTable('contributions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id),
  teamMemberId: uuid('team_member_id').references(() => teamMembers.id),
  contributionType: varchar('contribution_type', { length: 50 }).notNull(),
  contributionDate: date('contribution_date').notNull(),
  githubId: integer('github_id'),
  linesAdded: integer('lines_added'),
  linesDeleted: integer('lines_deleted'),
  metadata: jsonb('metadata'),
  collectedAt: timestamp('collected_at').defaultNow(),
}, (table) => ({
  dateIdx: index('idx_contributions_date').on(table.contributionDate),
  projectMemberIdx: index('idx_contributions_project_member').on(table.projectId, table.teamMemberId),
}));

// Additional tables: identityMappings, maintainerStatus, leadershipPositions,
// metricsdaily, insights, collectionJobs, reports
```

### 2. GitHub Collector
**Path:** `backend/src/modules/collection/github-collector.ts`

Primary data ingestion pipeline using Octokit.

```typescript
import { Octokit } from '@octokit/rest';
import type { Repository, Contribution } from '@/shared/types';

export class GitHubCollector {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async collectRepositoryContributions(
    repo: Repository,
    since: Date
  ): Promise<Contribution[]> {
    const contributions: Contribution[] = [];

    // Collect commits
    const commits = await this.octokit.paginate(
      this.octokit.rest.repos.listCommits,
      {
        owner: repo.githubOrg,
        repo: repo.githubRepo,
        since: since.toISOString(),
        per_page: 100,
      }
    );

    for (const commit of commits) {
      contributions.push({
        type: 'commit',
        githubId: commit.sha,
        author: commit.author?.login,
        email: commit.commit.author?.email,
        date: new Date(commit.commit.author.date),
        stats: {
          additions: commit.stats?.additions,
          deletions: commit.stats?.deletions,
        }
      });
    }

    // Collect PRs
    const pulls = await this.octokit.paginate(
      this.octokit.rest.pulls.list,
      {
        owner: repo.githubOrg,
        repo: repo.githubRepo,
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      }
    );

    // Filter PRs updated since 'since' date
    const recentPulls = pulls.filter(pr =>
      new Date(pr.updated_at) >= since
    );

    for (const pr of recentPulls) {
      contributions.push({
        type: 'pr',
        githubId: pr.number,
        author: pr.user?.login,
        date: new Date(pr.created_at),
        isMerged: pr.merged_at !== null,
      });

      // Collect reviews for this PR
      const reviews = await this.octokit.rest.pulls.listReviews({
        owner: repo.githubOrg,
        repo: repo.githubRepo,
        pull_number: pr.number,
      });

      for (const review of reviews.data) {
        if (review.user && new Date(review.submitted_at) >= since) {
          contributions.push({
            type: 'review',
            githubId: review.id,
            author: review.user.login,
            date: new Date(review.submitted_at),
            metadata: { prNumber: pr.number, state: review.state },
          });
        }
      }
    }

    return contributions;
  }

  async getMaintainerStatus(username: string, org: string, repo: string) {
    try {
      const { data } = await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        owner: org,
        repo: repo,
        username: username,
      });

      return {
        hasWriteAccess: ['write', 'admin', 'maintain'].includes(data.permission),
        permission: data.permission,
      };
    } catch (error) {
      return { hasWriteAccess: false, permission: 'none' };
    }
  }
}
```

### 3. Identity Resolver
**Path:** `backend/src/modules/identity/resolver.ts`

Critical for accurate contribution attribution.

```typescript
import { db } from '@/shared/database';
import { teamMembers, identityMappings } from '@/shared/database/schema';
import { eq, and, sql } from 'drizzle-orm';

interface ResolvedIdentity {
  teamMember: TeamMember | null;
  confidence: number;
  source: 'explicit_mapping' | 'email_domain' | 'fuzzy_match' | 'unresolved';
  requiresVerification?: boolean;
}

export class IdentityResolver {
  async resolveContributor(
    githubUsername: string,
    email?: string
  ): Promise<ResolvedIdentity> {
    // 1. Check explicit verified mappings
    const explicitMapping = await db.query.identityMappings.findFirst({
      where: and(
        eq(identityMappings.identityType, 'github'),
        eq(identityMappings.identityValue, githubUsername),
        eq(identityMappings.verified, true)
      ),
      with: { teamMember: true }
    });

    if (explicitMapping) {
      return {
        teamMember: explicitMapping.teamMember,
        confidence: 1.0,
        source: 'explicit_mapping'
      };
    }

    // 2. Email domain matching (@redhat.com)
    if (email && email.endsWith('@redhat.com')) {
      const teamMember = await db.query.teamMembers.findFirst({
        where: eq(teamMembers.primaryEmail, email)
      });

      if (teamMember) {
        // Auto-create mapping for future lookups
        await this.createMapping(teamMember.id, 'github', githubUsername, 0.95);

        return {
          teamMember,
          confidence: 0.95,
          source: 'email_domain'
        };
      }
    }

    // 3. Fuzzy name matching (low confidence)
    if (email) {
      const nameFromEmail = email.split('@')[0];
      const candidates = await this.fuzzyMatchByName(nameFromEmail);

      if (candidates.length === 1) {
        return {
          teamMember: candidates[0],
          confidence: 0.6,
          source: 'fuzzy_match',
          requiresVerification: true
        };
      }
    }

    // 4. Unresolved - store for manual review
    await this.storeUnresolvedIdentity(githubUsername, email);

    return {
      teamMember: null,
      confidence: 0,
      source: 'unresolved'
    };
  }

  private async fuzzyMatchByName(name: string): Promise<TeamMember[]> {
    const normalized = name.toLowerCase().replace(/[._-]/g, ' ');

    return db.query.teamMembers.findMany({
      where: sql`similarity(lower(name), ${normalized}) > 0.7`
    });
  }

  private async createMapping(
    teamMemberId: string,
    identityType: string,
    identityValue: string,
    confidence: number
  ) {
    await db.insert(identityMappings).values({
      teamMemberId,
      identityType,
      identityValue,
      confidenceScore: confidence,
      verified: confidence >= 0.9,
    });
  }

  private async storeUnresolvedIdentity(githubUsername: string, email?: string) {
    // Store in unresolved_identities table for manual review dashboard
    logger.warn(`Unresolved identity: ${githubUsername} (${email})`);
  }
}
```

### 4. AI Insights Engine
**Path:** `backend/src/modules/insights/ai-engine.ts`

Generates executive insights using Google Gemini API (pattern from retro-agent).

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ContributionData, InsightReport } from '@/shared/types';

const INSIGHTS_SYSTEM_PROMPT = `You are an open source strategy analyst for Red Hat AI Organization.

Analyze contribution data from upstream open source projects and provide:
1. Key trends (growing/declining contributions)
2. Strategic opportunities (where to gain maintainer status, underinvested projects)
3. Anomalies requiring attention (sudden drops, new competitors)
4. Actionable recommendations for leadership

Output must be structured JSON matching this schema:
{
  "trends": [{ "type": "growth|decline", "project": "name", "description": "...", "severity": "info|warning|critical" }],
  "opportunities": [{ "project": "name", "opportunity": "...", "effort": "low|medium|high", "impact": "low|medium|high" }],
  "anomalies": [{ "project": "name", "description": "...", "severity": "warning|critical" }],
  "recommendations": [{ "title": "...", "description": "...", "priority": "low|medium|high" }]
}

Return ONLY the JSON object, no additional text.`;

export class AIInsightsEngine {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      }
    });
  }

  async generateInsights(
    data: ContributionData[],
    timeRange: { start: Date; end: Date }
  ): Promise<InsightReport> {
    const prompt = this.buildInsightPrompt(data, timeRange);

    const fullPrompt = `${INSIGHTS_SYSTEM_PROMPT}\n\n${prompt}`;

    const result = await this.model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7, -3).trim();
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3, -3).trim();
    }

    // Parse JSON response
    const insights = JSON.parse(jsonText);

    // Validate with Zod schema
    return InsightReportSchema.parse(insights);
  }

  private buildInsightPrompt(data: ContributionData[], timeRange: { start: Date; end: Date }): string {
    return `Analyze the following contribution data for Red Hat AI Organization across upstream open source projects.

Time Range: ${timeRange.start.toISOString().split('T')[0]} to ${timeRange.end.toISOString().split('T')[0]}

Projects Data:
${data.map(d => `
Project: ${d.projectName} (${d.ecosystem})
- Total Contributions: ${d.totalContributions}
- Red Hat Contributions: ${d.redhatContributions} (${d.contributionPercentage.toFixed(1)}%)
- Red Hat Maintainers: ${d.redhatMaintainers}/${d.totalMaintainers}
- Trend vs Previous Period: ${d.trendPercentage > 0 ? '+' : ''}${d.trendPercentage.toFixed(1)}%
- Active Red Hat Contributors: ${d.activeContributors}
`).join('\n')}

Provide strategic insights following the JSON schema.`;
  }
}
```

### 5. Dashboard Main Page
**Path:** `frontend/src/pages/Dashboard.tsx`

Executive dashboard with KPIs, charts, and AI insights.

```typescript
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/dashboard/metric-card';
import { ContributionChart } from '@/components/dashboard/contribution-chart';
import { InsightsList } from '@/components/dashboard/insights-list';
import { ProjectsTable } from '@/components/dashboard/projects-table';
import { GitCommit, Users, TrendingUp, UserPlus } from 'lucide-react';

async function fetchDashboardMetrics() {
  const res = await fetch('http://localhost:3000/api/metrics/overview');
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.json();
}

export default function DashboardPage() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: fetchDashboardMetrics,
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return <div>Loading dashboard...</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Red Hat AI OSS Contributions</h1>
        <p className="text-muted-foreground">
          Tracking upstream contributions across {metrics.projectCount} projects
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Contributions (30d)"
          value={metrics.contributions30d.toLocaleString()}
          change={metrics.contributions30dChange}
          changeType={metrics.contributions30dChange > 0 ? 'increase' : 'decrease'}
          icon={GitCommit}
        />

        <MetricCard
          title="Maintainer Positions"
          value={metrics.maintainerCount}
          change={metrics.maintainerCountChange}
          description={`Across ${metrics.projectCount} projects`}
          icon={Users}
        />

        <MetricCard
          title="Average Contribution %"
          value={`${metrics.avgContributionPct.toFixed(1)}%`}
          description="Across tracked projects"
          icon={TrendingUp}
        />

        <MetricCard
          title="Active Contributors"
          value={metrics.activeContributors}
          change={metrics.activeContributorsChange}
          description="Last 30 days"
          icon={UserPlus}
        />
      </div>

      {/* Charts and Insights */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Contribution Trends</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <ContributionChart data={metrics.trendData} />
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>AI Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <InsightsList insights={metrics.latestInsights} />
          </CardContent>
        </Card>
      </div>

      {/* Projects Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Projects by Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectsTable projects={metrics.topProjects} />
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Project Structure

```
upstream-pulse/
├── backend/                          # Backend service (Fastify)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── collection/
│   │   │   │   ├── github-collector.ts    # GitHub API integration (CRITICAL FILE #2)
│   │   │   │   ├── leadership-collector.ts # Config-driven leadership parser (markdown tables, WG YAML)
│   │   │   │   └── codeowners-parser.ts   # GitHub CODEOWNERS file parser
│   │   │   │
│   │   │   ├── identity/
│   │   │   │   └── resolver.ts          # Identity resolution (CRITICAL FILE #3)
│   │   │   │
│   │   │   ├── metrics/
│   │   │   │   └── calculator.ts        # Metrics calculation logic
│   │   │   │
│   │   │   ├── insights/
│   │   │   │   └── ai-engine.ts         # AI insights generation (CRITICAL FILE #4)
│   │   │   │
│   │   │   ├── reports/
│   │   │   │   └── generator.ts         # PDF/JSON report generation
│   │   │   │
│   │   │   └── api/
│   │   │       ├── routes/              # Fastify route handlers
│   │   │       └── middleware/          # Authentication, logging
│   │   │
│   │   ├── shared/
│   │   │   ├── database/
│   │   │   │   ├── schema.ts            # Drizzle ORM schema (CRITICAL FILE #1)
│   │   │   │   ├── client.ts            # Database connection
│   │   │   │   └── migrations/          # SQL migrations
│   │   │   │
│   │   │   ├── types/
│   │   │   │   └── index.ts             # Shared TypeScript types
│   │   │   │
│   │   │   ├── utils/
│   │   │   │   ├── logger.ts            # Winston logger
│   │   │   │   └── metrics.ts           # Prometheus metrics
│   │   │   │
│   │   │   └── config/
│   │   │       ├── index.ts             # Environment configuration
│   │   │       └── org-registry.ts      # Upstream org registry (add new orgs here)
│   │   │
│   │   ├── jobs/
│   │   │   ├── workers/                 # BullMQ worker processors
│   │   │   │   ├── collection-worker.ts
│   │   │   │   ├── governance-worker.ts # OWNERS/CODEOWNERS refresh (checks org registry)
│   │   │   │   ├── leadership-worker.ts # Per-org leadership refresh
│   │   │   │   ├── insights-worker.ts
│   │   │   │   └── reports-worker.ts
│   │   │   └── scheduler.ts             # Main scheduler entry point (dispatches per-org jobs)
│   │   │
│   │   ├── app.ts                       # Fastify application entry
│   │   └── worker.ts                    # Worker process entry
│   │
│   ├── package.json
│   ├── tsconfig.json
│   └── drizzle.config.ts                # Drizzle ORM configuration
│
├── frontend/                         # React SPA (Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx            # Main dashboard (CRITICAL FILE #5)
│   │   │   ├── Projects.tsx             # Project list and detail pages
│   │   │   ├── Contributors.tsx         # Contributor leaderboard
│   │   │   ├── Insights.tsx             # AI insights page
│   │   │   └── Reports.tsx              # Report generation
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                      # shadcn/ui components
│   │   │   └── dashboard/               # Dashboard-specific components
│   │   │       ├── MetricCard.tsx
│   │   │       ├── ContributionChart.tsx
│   │   │       ├── InsightsList.tsx
│   │   │       └── ProjectsTable.tsx
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts                   # API client functions
│   │   │   └── utils.ts                 # Utility functions
│   │   │
│   │   ├── hooks/
│   │   │   └── useMetrics.ts            # Custom React hooks
│   │   │
│   │   ├── App.tsx                      # Main app component
│   │   ├── main.tsx                     # Vite entry point
│   │   └── index.css                    # Global styles (Tailwind)
│   │
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── index.html
│
├── docker-compose.yml               # Local development environment
├── Dockerfile.backend               # Backend container
├── Dockerfile.frontend              # Frontend container (nginx)
└── README.md
```

---

## Key Design Decisions

### 1. Monolith vs Microservices
**Decision: Modular Monolith**

- Single codebase with clear module boundaries
- Easier deployment (1 Docker container for API, 1 for workers)
- Can extract services later if needed
- Shared TypeScript types and utilities

### 2. Database Choice
**Decision: PostgreSQL (not SQLite)**

- Production-scale time-series data handling
- Superior concurrent write performance
- Native partitioning for contributions table
- PostGIS extension available for future geo features
- Easy migration to TimescaleDB if needed

### 3. ORM Choice
**Decision: Drizzle ORM (not Prisma)**

- Better TypeScript inference (type-safe without codegen)
- SQL-like syntax (easier to optimize queries)
- Zero-cost migrations (raw SQL)
- Smaller bundle size

### 4. Frontend Stack
**Decision: React + Vite SPA (not Next.js or Create React App)**

**Understanding React vs Build Tools:**
- **React** = UI library (component rendering, state management, hooks)
- **Vite** = Build tool (dev server, bundling, transpiling, hot reload)
- You need BOTH: React doesn't work standalone in modern development

**Why Vite over other build tools:**
1. **vs Create React App (CRA):**
   - CRA is deprecated/unmaintained
   - Vite is 10-100x faster (instant HMR vs 30+ second rebuilds)
   - Simpler configuration

2. **vs Webpack:**
   - Webpack requires complex manual configuration
   - Vite is zero-config for most use cases
   - Webpack is slower (traditional bundling vs ESM)

3. **vs Next.js:**
   - Next.js adds SSR complexity not needed for internal dashboard
   - Vite SPA is simpler and faster for development
   - Better separation of concerns (backend/frontend)

**Why SPA over SSR (Next.js):**
- **Simpler architecture:** No SSR complexity for internal dashboard (not public-facing)
- **Faster development:** Your portfolio project already uses Vite + React + Tailwind
- **Separation of concerns:** Clear backend/frontend split aligns with modular architecture
- **No SEO needed:** Executive dashboard doesn't need search engine optimization
- **Better for real-time:** SPA with TanStack Query + WebSocket is simpler than Next.js SSR + real-time
- **Proven stack:** You have working patterns from portfolio project

**Trade-off:** Slightly slower initial load vs Next.js SSR, but acceptable for internal tool with caching (5-min cache)

### 5. AI Model
**Decision: Google Gemini 1.5 Pro (not Claude or local LLM)**

**Why Gemini over Claude:**
- **Cost efficiency:** $0.35/1M tokens vs Claude's $3/1M tokens (8.5x cheaper)
- **Proven experience:** Your retro-agent already uses Gemini successfully
- **Large context:** 1M token context window (vs Claude's 200K)
- **Google Cloud integration:** Already using Google Cloud APIs (Gmail, Calendar, Docs)
- **Structured output:** Excellent JSON generation quality, comparable to Claude

**Trade-off:** Slightly less reliable than Claude for complex reasoning, but sufficient for contribution analysis

### 6. Caching Strategy
**Decision: Redis with 5-min dashboard cache**

- Balance between real-time and performance
- BullMQ job queue for reliability
- WebSocket for instant job status updates
- Pre-calculated `metrics_daily` aggregates

---

## Verification & Testing

### End-to-End Verification Steps

1. **Database Setup**
   ```bash
   docker-compose up -d db redis
   npm run db:migrate
   npm run db:seed  # Seed with sample team members
   ```

2. **Collection Test**
   ```bash
   # Manually trigger collection for one repo
   curl -X POST http://localhost:3000/api/admin/collect \
     -H "Content-Type: application/json" \
     -d '{"projectId": "uuid", "since": "2024-01-01"}'

   # Verify data in database
   psql -d oss_tracker -c "SELECT COUNT(*) FROM contributions;"
   ```

3. **Identity Resolution Test**
   ```bash
   # Test identity resolver
   curl http://localhost:3000/api/admin/resolve-identity?username=octocat

   # Should return team member match or unresolved status
   ```

4. **Metrics Calculation Test**
   ```bash
   # Trigger metrics calculation
   curl -X POST http://localhost:3000/api/admin/calculate-metrics

   # Verify metrics_daily table
   psql -d oss_tracker -c "SELECT * FROM metrics_daily ORDER BY metric_date DESC LIMIT 10;"
   ```

5. **AI Insights Test**
   ```bash
   # Generate insights
   curl -X POST http://localhost:3000/api/admin/generate-insights

   # Verify insights table
   psql -d oss_tracker -c "SELECT insight_type, title FROM insights ORDER BY generated_at DESC LIMIT 5;"
   ```

6. **Dashboard Access**
   ```bash
   # Open browser to dashboard
   open http://localhost:3000/dashboard

   # Verify:
   # - KPI cards display metrics
   # - Contribution chart renders
   # - AI insights panel shows recent insights
   # - Projects table populated
   ```

7. **Job Queue Monitoring**
   ```bash
   # Install BullMQ Board (optional)
   npx bull-board

   # Monitor job status at http://localhost:3000/admin/queues
   ```

### Unit Testing

```typescript
// Example test for GitHubCollector
describe('GitHubCollector', () => {
  it('should collect commits since date', async () => {
    const collector = new GitHubCollector(process.env.GITHUB_TOKEN);
    const repo = { githubOrg: 'kubernetes', githubRepo: 'kubernetes' };
    const since = new Date('2024-01-01');

    const contributions = await collector.collectRepositoryContributions(repo, since);

    expect(contributions.length).toBeGreaterThan(0);
    expect(contributions[0]).toHaveProperty('type', 'commit');
  });
});

// Example test for IdentityResolver
describe('IdentityResolver', () => {
  it('should resolve @redhat.com email to team member', async () => {
    const resolver = new IdentityResolver();
    const result = await resolver.resolveContributor('user123', 'john.doe@redhat.com');

    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.source).toBe('email_domain');
    expect(result.teamMember).toBeDefined();
  });
});
```

---

## Configuration & Secrets

### Environment Variables

```bash
# .env.example

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/oss_tracker
REDIS_URL=redis://localhost:6379

# GitHub API
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_ORG=kubernetes  # Primary org to track

# AI Services
GOOGLE_AI_API_KEY=AIzaSy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Frontend
VITE_API_URL=http://localhost:3000

# Authentication (JWT)
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d

# Monitoring
PROMETHEUS_ENABLED=true
```

### Initial Project Configuration

```json
// config/projects.json (seed data)
[
  {
    "name": "Kubernetes",
    "ecosystem": "cncf",
    "githubOrg": "kubernetes",
    "githubRepo": "kubernetes",
    "trackingEnabled": true
  },
  {
    "name": "Kubeflow",
    "ecosystem": "lfai",
    "githubOrg": "kubeflow",
    "githubRepo": "kubeflow",
    "trackingEnabled": true
  },
  {
    "name": "PyTorch",
    "ecosystem": "lfai",
    "githubOrg": "pytorch",
    "githubRepo": "pytorch",
    "trackingEnabled": true
  },
  {
    "name": "MLflow",
    "ecosystem": "lfai",
    "githubOrg": "mlflow",
    "githubRepo": "mlflow",
    "trackingEnabled": true
  }
]
```

---

## Success Metrics

### MVP Success Criteria (Phase 1)
- [ ] System successfully tracks 10+ repositories
- [ ] Daily automated data collection runs without errors
- [ ] Dashboard displays accurate contribution percentages
- [ ] Team member registry manages 20+ Red Hat AI employees
- [ ] Identity resolution achieves >80% automatic match rate

### Phase 2 Success Criteria
- [ ] AI insights generate weekly with actionable recommendations
- [ ] Leadership positions tracked across all monitored projects
- [ ] Dashboard loads in <2 seconds with cached data
- [ ] Trend charts display 90+ days of historical data
- [ ] Alert system notifies on significant contribution drops

### Production Success Criteria (Phase 3)
- [ ] System scales to 100+ repositories
- [ ] 99.9% uptime for dashboard
- [ ] Reports generated on-demand in <30 seconds
- [ ] Zero data loss during collection failures (job retry)
- [ ] Executive reports exported to PDF successfully

---

## Risk Mitigation

### Risk 1: GitHub API Rate Limiting
**Mitigation:**
- Use authenticated requests (5000/hour vs 60/hour)
- Implement exponential backoff
- Cache repository metadata
- Distribute collection across multiple tokens if needed

### Risk 2: Identity Resolution Accuracy
**Mitigation:**
- Manual verification workflow for low-confidence matches
- Dashboard for reviewing unresolved identities
- Allow admins to create explicit mappings
- Confidence scoring system (0.0 - 1.0)

### Risk 3: AI Insight Quality
**Mitigation:**
- Structured output with Zod validation
- Prompt engineering with examples
- Human review workflow for insights
- Fallback to statistical analysis if AI fails

### Risk 4: Data Freshness vs Performance
**Mitigation:**
- 5-minute cache for dashboard (acceptable staleness)
- Incremental hourly updates for active repos
- Pre-calculated aggregates in `metrics_daily`
- WebSocket push for critical updates

### Risk 5: Scaling Beyond 100 Repos
**Mitigation:**
- Database partitioning by date
- Horizontal scaling of worker nodes (BullMQ distributed)
- Read replicas for dashboard queries
- Archive old contribution data (>2 years)

---

## Next Steps After Plan Approval

1. **Week 1 Day 1:** Initialize project structure and dependencies
2. **Week 1 Day 2:** Set up PostgreSQL schema with Drizzle ORM
3. **Week 1 Day 3:** Implement GitHub collector (commits only)
4. **Week 1 Day 4:** Build identity resolver (email domain matching)
5. **Week 1 Day 5:** Create Fastify API with first endpoints

From there, follow the 3-phase implementation plan with regular demos every 2 weeks.

---

## References & Resources

- **GitHub REST API:** https://docs.github.com/en/rest
- **Octokit SDK:** https://github.com/octokit/rest.js
- **Google Generative AI:** https://ai.google.dev/tutorials/node_quickstart
- **Drizzle ORM:** https://orm.drizzle.team/docs/overview
- **BullMQ:** https://docs.bullmq.io/
- **Fastify:** https://fastify.dev/
- **Vite:** https://vitejs.dev/
- **React Router:** https://reactrouter.com/
- **TanStack Query:** https://tanstack.com/query/latest
- **shadcn/ui:** https://ui.shadcn.com/

---

**Total Estimated Timeline:** 11-16 weeks (MVP in 6 weeks, production in 16 weeks)
**Estimated Infrastructure Cost:** $100-200/month (MVP), $500-800/month (production scale)
