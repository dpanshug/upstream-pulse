# Architecture

Upstream Pulse is a modular monolith built with TypeScript that tracks an organization's contributions across upstream open-source communities. It collects data from GitHub, resolves contributor identities, parses governance files, and serves everything through an executive dashboard.

This document describes how the system actually works — components, data flow, schemas, and design tradeoffs.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     React + Vite SPA (Frontend)                      │
│  Dashboard · Organizations · Projects · Contributors · System Status │
└──────────────────────┬─────────────────────────────────────────────┬─┘
                       │  REST API                        WebSocket  │
┌──────────────────────▼─────────────────────────────────────────────▼─┐
│                      Fastify API Server (app.ts)                     │
│  /api/metrics/dashboard  ·  /api/projects  ·  /api/orgs              │
│  /api/admin/collect  ·  /api/leadership/refresh  ·  /ws/updates      │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
    ▼                  ▼                  ▼
┌─────────┐    ┌─────────────┐    ┌────────────────┐
│ Postgres │    │    Redis    │    │ GitHub API     │
│  (data)  │    │ (job queue) │    │ (REST+GraphQL) │
└─────────┘    └──────┬──────┘    └───────▲────────┘
                      │                   │
               ┌──────▼──────────────────────────────────────┐
               │            Worker Process (worker.ts)        │
               │  ┌──────────────┐  ┌────────────────────┐   │
               │  │  Collection  │  │    Governance       │   │
               │  │  Worker (×3) │  │    Worker (×1)      │   │
               │  └──────────────┘  └────────────────────┘   │
               │  ┌──────────────┐  ┌────────────────────┐   │
               │  │  Leadership  │  │    Team Sync        │   │
               │  │  Worker (×1) │  │    Worker (×1)      │   │
               │  └──────────────┘  └────────────────────┘   │
               │                                              │
               │  ┌──────────────────────────────────────┐   │
               │  │  Scheduler (node-cron → BullMQ)      │   │
               │  └──────────────────────────────────────┘   │
               └──────────────────────────────────────────────┘
```

The API server and worker process are **separate OS processes** that share code but run independently. In production, they are separate container deployments. They communicate exclusively through Redis (BullMQ job queues) and PostgreSQL (shared database).

---

## Two Processes

### API Server (`app.ts`)

Fastify HTTP server. Handles all client-facing requests — dashboard metrics, project CRUD, team member management, job triggering, and WebSocket connections. Reads from PostgreSQL, enqueues jobs to Redis, serves JSON to the frontend.

Starts with `npm run dev` (development) or `node dist/app.js` (production).

### Worker (`worker.ts`)

BullMQ consumer process. Runs the scheduler (node-cron) and four workers that pull jobs from Redis queues. Each worker talks to GitHub's API and writes results into PostgreSQL. On startup, it cleans up stale `running` job records (>5 min old) left by previous crashes.

Starts with `npm run worker` (development) or `node dist/worker.js` (production).

Both processes validate configuration on startup (`validateConfig()`) and exit if `GITHUB_TOKEN` is missing.

---

## Data Collection Pipeline

All data originates from GitHub and flows through a three-stage pipeline:

```
GitHub API ──► Collector ──► Identity Resolver ──► PostgreSQL
                                    │
                            team_members table
                            (username lookup)
```

### Stage 1: Collection

`GitHubCollector` uses Octokit to fetch four types of contributions:

| Type | API Used | Pagination | Since Filter |
|------|----------|------------|--------------|
| Commits | REST `repos.listCommits` | Iterator (100/page) | `since` param |
| Pull Requests | REST `pulls.list` | Iterator, early break when `created_at < since` | Manual date check |
| Reviews | **GraphQL** (nested under PRs) | Paginated (100 PRs × 10 reviews per query) | `updatedAt` check |
| Issues | REST `issues.listForRepo` | Iterator (100/page) | `since` param |

Reviews use GraphQL to avoid the N+1 problem — instead of one REST call per PR, a single GraphQL query fetches 100 PRs with their nested reviews. PRs with >10 reviews are paginated individually via a follow-up query.

Merge commits (>1 parent) are skipped. Only issue-type issues are collected (items with `pull_request` are filtered out).

**Rate limit handling:** The collector tracks `x-ratelimit-remaining` from REST headers and `rateLimit.remaining` from GraphQL responses. When remaining calls drop below 50, it sleeps until the reset window. During the wait, job status is updated to `waiting_for_api` so the system status page can show what's happening.

**Phase-by-phase persistence:** Instead of collecting everything and writing once, each phase (commits, PRs, reviews, issues) is persisted to the database as soon as it completes. This means a job that fails midway through (e.g., rate-limited during reviews) still keeps the commits and PRs it already collected.

### Stage 2: Identity Resolution

`IdentityResolver` maps GitHub usernames to team members. The primary (and currently only active) resolution method is direct `github_username` match against the `team_members` table:

```
contributor.author ──► SELECT FROM team_members WHERE github_username = ?
                              │
                      found ──► teamMemberId set on contribution row
                  not found ──► teamMemberId left NULL, logged as unresolved
```

Contributions with a non-null `teamMemberId` are "team contributions" — this is the fundamental distinction that powers all metrics (team vs. total).

### Stage 3: Storage

Contributions are inserted with `onConflictDoNothing()` using a unique index on `(projectId, contributionType, githubId)`. This makes re-collection idempotent — running the same collection twice doesn't create duplicates.

After collection completes, the project's `lastSyncAt` is updated so the next daily sync picks up where this one left off.

---

## Governance & Leadership Collection

Separate from contribution collection, governance data tracks who holds maintainer, reviewer, and leadership roles across upstream communities.

### OWNERS Files (Kubernetes-style)

For orgs with `governanceModel: 'owners'`, the governance worker:

1. Fetches the repo's full Git tree via the tree API
2. Finds all files named exactly `OWNERS`
3. Optionally loads `OWNERS_ALIASES` to resolve alias references
4. Parses each OWNERS file as YAML, extracting `approvers` and `reviewers`
5. Stores entries in `maintainer_status` — both team members and external contributors

OWNERS files are hierarchical — a repo can have `OWNERS` at the root and in subdirectories, each scoping different people to different code paths.

### CODEOWNERS (GitHub-native)

For orgs with `governanceModel: 'codeowners'`, the `CodeownersParser`:

1. Checks `.github/CODEOWNERS`, then `CODEOWNERS`, then `docs/CODEOWNERS`
2. Parses the file line by line, extracting `@username` references
3. Skips `@org/team` references (would require `read:org` on external orgs)
4. Stores entries in `maintainer_status`

### Per-repo governance override

The org registry supports `repoGovernanceOverride` — a map that lets specific repos within an org use a different governance model than the org default. For example, the `containers` org uses `owners` by default but `ramalama` uses `codeowners`.

### Leadership Positions (Community Repos)

For orgs with a `communityRepo` configured, the leadership worker collects steering committee, TSC, and working group positions. The `LeadershipCollector` is config-driven — it reads the org registry entry and dispatches to the appropriate parser:

| Source Format | Config Field | Parser | Examples |
|---------------|-------------|--------|----------|
| Markdown tables | `leadershipFiles` with `format: 'table'` (default) | Column-based table parser | Steering committee lists, MAINTAINERS.md |
| SIG sections | `leadershipFiles` with `format: 'sig_sections'` | `### SIG {Name}` heading parser with `> Leadership:` blockquotes | llm-d SIGS.md |
| Bullet lists | `leadershipFiles` with `format: 'bullet_list'` + `sectionHeading` | `- [Name](url)` parser scoped to a section | MLflow README.md Core Members |
| WG/SIG YAML | `communityRepo.wgFile` | Structured YAML parser (`sigs`, `workinggroups`, `committees`) | Kubeflow `wgs.yaml`, Kubernetes `sigs.yaml` |

Leadership positions support both **uniform-role** files (every row gets the same `positionType`, e.g., `steering_committee`) and **mixed-role** files (each row has its own role column).

Results are stored in `leadership_positions` scoped by `communityOrg` so positions from different upstream orgs don't collide.

---

## Org Registry

All upstream organization configuration lives in a single file: `backend/src/shared/config/org-registry.ts`. It's a static TypeScript array — adding a new org is a PR to this file.

Each entry declares:

```typescript
interface UpstreamOrgConfig {
  name: string;                   // Display name
  githubOrg: string;              // GitHub org slug
  governanceModel: 'owners' | 'codeowners' | 'none';
  communityRepo?: {               // Optional — enables leadership collection
    repo: string;
    defaultBranch: string;
    leadershipFiles?: LeadershipFileConfig[];
    wgFile?: string;
  };
  repoGovernanceOverride?: Record<string, 'owners' | 'codeowners' | 'none'>;
  repoToWorkingGroup?: Record<string, string[]>;
}
```

The registry is used by:
- **Scheduler** — iterates orgs with `communityRepo` to dispatch leadership jobs
- **Governance worker** — looks up `governanceModel` to decide which parser to use
- **Leadership worker** — reads `communityRepo` config to know what files to fetch
- **Metrics service** — maps repos to working groups, resolves org display names
- **API** (`GET /api/orgs`) — returns registry entries enriched with activity stats

---

## Job Scheduling

The scheduler uses node-cron to dispatch BullMQ jobs on fixed schedules:

| Queue | Worker | Concurrency | Schedule | What It Does |
|-------|--------|-------------|----------|--------------|
| `contribution-collection` | collection-worker | 3 | Daily at 2:00 AM UTC | Collects commits, PRs, reviews, issues from `lastSyncAt` |
| `governance-refresh` | governance-worker | 1 | Weekly, Mondays at 3:00 AM UTC | Refreshes OWNERS/CODEOWNERS files for all projects |
| `leadership-refresh` | leadership-worker | 1 | Monthly, 1st at 4:00 AM UTC | Collects steering/TSC/WG positions from community repos |
| `team-sync` | team-sync-worker | 1 | Weekly, Mondays at 1:00 AM UTC | Syncs team members from the GitHub organization |

All queues use exponential backoff for retries. The contribution queue allows 3 attempts; others allow 2.

Jobs can also be triggered manually via API endpoints (`POST /api/admin/collect`, `POST /api/governance/refresh`, `POST /api/leadership/refresh`, `POST /api/admin/team-sync`).

Each job creates a tracking record in the `collection_jobs` table with status transitions: `pending` → `running` → `completed`/`failed`. Rate-limited jobs show `waiting_for_api` as an intermediate status.

---

## Metrics Calculation

Metrics are calculated **on demand** from raw contribution data — there are no pre-computed aggregates. The `MetricsService` is a stateless singleton that runs SQL queries against the `contributions`, `maintainer_status`, and `leadership_positions` tables.

The core abstraction is "team vs. total": every metric compares contributions with a non-null `teamMemberId` (team) against all contributions (total) to derive a percentage.

### What Gets Counted

| Metric | What it includes | What it excludes |
|--------|-----------------|------------------|
| **Commits** | Default branch only, one entry per commit SHA | Merge commits |
| **Pull Requests** | All PRs (open, closed, merged) created in the time window | — |
| **Reviews** | Each review submission — same person reviewing the same PR multiple times counts separately | — |
| **Issues** | Issues created in the time window | Pull requests (excluded to avoid double-counting) |

**"Team" contributions** — A contribution is counted as "team" if the GitHub username of the author matches a record in the `team_members` table. Contributions by non-team members have a null `teamMemberId` and count toward the "total" but not the "team" number.

**Time filtering** — The `days` parameter filters on `contribution_date` (when the commit was authored, the PR was created, the review was submitted, or the issue was opened), not when it was collected into the database.

**Deduplication** — Contributions are unique on `(project_id, contribution_type, github_id)`. Re-collecting the same data doesn't inflate counts.

### Dashboard Endpoint Flow

`GET /api/metrics/dashboard?days=30&githubOrg=kubeflow`

```
Request
  │
  ▼
MetricsService.getDashboard()
  │
  ├── getContributionBreakdown()    → team/total counts by type (commit, PR, review, issue)
  ├── getContributionTrend()        → current vs previous period comparison
  ├── getActiveContributorCount()   → distinct team_member_ids in window
  ├── getActiveContributorTrend()   → current vs previous period comparison
  ├── getTopContributors()          → top 50 by total contribution count
  ├── per-project breakdowns        → contribution counts per tracked project
  ├── getDailyTrend()               → daily time series for charts
  ├── getLeadershipSummary()        → OWNERS/CODEOWNERS + community leadership
  └── getOrgActivity()              → per-org sparklines (top-level dashboard only)
      │
      ▼
  Parallel SQL queries → assembled into DashboardResponseWithLeadership
```

The `days` parameter controls the time window. `days=0` means "all time" (no date filtering). Most queries are scoped with optional `projectId` and `githubOrg` filters so the same service powers the global dashboard, org-specific views, and project drill-downs.

**Org activity** uses a batched query approach — a single `GROUP BY github_org` query instead of N per-org queries — to generate org cards with sparkline trend data, leadership counts, and maintainer counts.

---

## Database Schema

PostgreSQL 16 with Drizzle ORM. All primary keys are UUID. Schema defined in `backend/src/shared/database/schema.ts`.

### Entity Relationship

```
projects ──┬──< contributions >── team_members ──< identity_mappings
            ├──< maintainer_status >── team_members
            ├──< leadership_positions >── team_members
            └──< collection_jobs

metrics_daily (deprecated — not used)
```

### Tables

**`projects`** — Tracked GitHub repositories. Unique on `(github_org, github_repo)`. `lastSyncAt` marks where the next daily sync should start.

**`team_members`** — Organization's team registry. Primary identifier is `github_username` (matched during identity resolution). Can be populated manually or via GitHub org sync (`source: 'manual' | 'github_org_sync'`). `githubUserId` is auto-fetched on creation for stable identity across username changes.

**`identity_mappings`** — Maps alternate identities (email, other platforms) to team members with confidence scores. Unique on `(identity_type, identity_value)`.

**`contributions`** — Core time-series table. Every commit, PR, review, and issue collected from GitHub. Unique on `(project_id, contribution_type, github_id)` for idempotent re-collection. `team_member_id` is nullable — null means the contributor is not a team member (or unresolved).

**`maintainer_status`** — OWNERS/CODEOWNERS entries. Stores both team members (`teamMemberId` set) and external contributors (`teamMemberId` null, `githubUsername` populated). `positionType` is either `'maintainer'` (approver) or `'reviewer'`.

**`leadership_positions`** — Community leadership roles (steering, TSC, WG chairs, tech leads). Scoped by `communityOrg` to separate positions across upstream orgs. Tracks both team and external members.

**`collection_jobs`** — Job execution history. Tracks status, timing, records processed, and error details. Linked to BullMQ jobs via `metadata.bullmqJobId`.

**`metrics_daily`** — **Deprecated.** Was designed for pre-calculated daily aggregates but never actively used. Metrics are now computed on demand by `MetricsService`. Kept for backwards compatibility.

### Key Indexes

- `contributions_date_idx` — Date range queries for trend charts
- `contributions_project_member_idx` — Per-project, per-member breakdowns
- `unique_contribution` — Idempotent insertion deduplication
- `leadership_community_org_idx` — Filtering leadership by upstream org
- `maintainer_github_username_idx` — Looking up governance roles by username

### Migrations

Managed by drizzle-kit. Migration files live in `backend/src/shared/database/migrations/`. Run with `npm run db:migrate` which executes `tsx src/shared/database/run-migrate.ts`.

---

## Frontend

React 18 SPA built with Vite 5, styled with Tailwind CSS and shadcn/ui components.

### Routes

| Path | Page | Purpose |
|------|------|---------|
| `/` | Dashboard | Executive KPIs, contribution charts, top contributors, org cards |
| `/organizations` | Organizations | Org registry cards with activity sparklines |
| `/organizations/:org` | OrganizationDetail | Org-scoped dashboard (same metrics, filtered by `githubOrg`) |
| `/organizations/:org/projects/:projectId` | ProjectDetail | Single-project drill-down |
| `/projects` | Projects | All tracked projects list |
| `/projects/:projectId` | ProjectDetail | Single-project drill-down |
| `/contributors` | Contributors | Team member contribution leaderboard |
| `/system` | SystemStatus | Worker health, queue stats, recent job history |
| `/about` | About | Instance info, admin contact, version |

### Data Fetching

TanStack Query (`@tanstack/react-query`) with:
- 5-minute `staleTime` (queries don't refetch for 5 minutes after success)
- No refetch on window focus
- 1 retry on failure

The frontend proxies API requests to `localhost:4321` during development (configured in `vite.config.ts`). In production, nginx reverse-proxies `/api` to the backend service.

### Key Design Choices

- **SPA, not SSR** — This is an internal dashboard, not a public site. No SEO needed. SPA with client-side routing is simpler and sufficient.
- **No state management library** — TanStack Query handles server state caching. No Zustand/Redux needed for this app's complexity.
- **shadcn/ui** — Copy-paste component library (not an npm dependency). Components live in `frontend/src/components/ui/`.

---

## API Reference

### Health & Config

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness probe — always returns `200 { status: 'healthy' }` |
| `GET` | `/ready` | Readiness probe — checks DB connection, returns `503` if disconnected |
| `GET` | `/api/config` | Public instance config (org name, description, version — no secrets) |

### Metrics

| Method | Path | Query Params | Description |
|--------|------|-------------|-------------|
| `GET` | `/api/metrics/dashboard` | `days`, `projectId`, `githubOrg` | Main dashboard — contributions, trends, leadership, org activity |
| `GET` | `/api/metrics/overview` | `days` | Legacy format (wraps dashboard data) |
| `GET` | `/api/metrics/contributions` | `days`, `projectId` | Contribution breakdown (team vs total by type) |
| `GET` | `/api/metrics/contributors` | `days`, `projectId`, `githubOrg`, `limit` | Top contributors ranked by total |
| `GET` | `/api/metrics/trend` | `days`, `projectId` | Daily contribution time series |
| `GET` | `/api/metrics/projects/:projectId` | `days` | Per-project contributions, trend, top contributors |
| `GET` | `/api/metrics/leadership` | — | OWNERS/CODEOWNERS maintainer positions |

### Data Management

| Method | Path | Body/Params | Description |
|--------|------|------------|-------------|
| `GET` | `/api/projects` | `?githubOrg` | List tracked projects |
| `POST` | `/api/projects` | `{ name, githubOrg, githubRepo, ecosystem?, startCollection?, fullHistory? }` | Add project (validates repo exists, auto-triggers governance) |
| `GET` | `/api/team-members` | — | List active team members |
| `POST` | `/api/team-members` | `{ name, primaryEmail?, githubUsername?, department?, role? }` | Add team member (auto-fetches GitHub user ID) |
| `GET` | `/api/orgs` | `?days` | Org registry with activity stats, sparklines, leadership counts |

### Admin / Job Triggers

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/admin/collect` | `{ projectId, since?, fullHistory?, phases? }` | Trigger contribution collection |
| `POST` | `/api/admin/team-sync` | — | Sync team members from GitHub org |
| `POST` | `/api/governance/refresh/:projectId?` | — | Refresh OWNERS/CODEOWNERS (one project or all) |
| `POST` | `/api/leadership/refresh` | `{ githubOrg? }` | Refresh community leadership (one org or all) |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/system/status` | Worker health, queue stats, recent jobs, cron schedules |
| `WS` | `/ws/updates` | WebSocket for real-time updates (echo + connected events) |

---

## Deployment

### Local Development

```bash
npm run dev        # Starts Postgres (:5433), Redis (:6379), API (:4321), Frontend (:5173)
```

`docker-compose.yml` runs Postgres 16 and Redis 7 as containers. The API and worker run as native Node.js processes with hot reload (tsx). Postgres is exposed on port **5433** (not 5432) to avoid conflicts with local installations.

### Production (OpenShift / Kubernetes)

Four deployments orchestrated via Kustomize manifests in `deploy/openshift/` (base + environment overlays in `overlays/dev/` and `overlays/prod/`):

| Deployment | Replicas | Image | Entrypoint |
|-----------|---------|-------|------------|
| `backend` | 1 | `backend/Dockerfile` | `node dist/app.js` |
| `worker` | 1 | `backend/Dockerfile` (same image) | `node dist/worker.js` |
| `frontend` | 1 | `frontend/Dockerfile` (nginx) | Serves built SPA, proxies `/api` to backend service |
| `postgres` | 1 | `postgres:16-alpine` | Standard PostgreSQL |
| `redis` | 1 | `redis:7-alpine` | Standard Redis |

The frontend uses an **OAuth proxy** sidecar in OpenShift for authentication. The backend service is only accessible within the cluster (no public route).

Automated database backups run via CronJob to S3-compatible storage. A separate CronJob runs restore tests to verify backup integrity.

---

## Design Decisions

### Modular Monolith

Single codebase with clear module boundaries under `backend/src/modules/`. The API server and worker share types, schema, and utilities but run as separate processes. This gives deployment flexibility (scale workers independently) without microservice complexity.

### On-demand Metrics (No Pre-aggregation)

Metrics are calculated from raw `contributions` rows at query time. The `metrics_daily` table was designed for pre-aggregation but was never needed — PostgreSQL handles the aggregation queries fast enough with proper indexes. This simplifies the data pipeline (no materialization jobs, no stale caches, no consistency issues).

### PostgreSQL Over SQLite

Time-series contribution data requires concurrent writes (3 collection workers writing simultaneously) and complex aggregations (`GROUP BY` with date ranges across large tables). PostgreSQL handles both natively.

### Drizzle ORM Over Prisma

Drizzle provides SQL-like query building with full TypeScript inference, zero-cost migrations (raw SQL files), and a smaller runtime footprint. Schema types are derived directly from table definitions via `InferSelectModel`/`InferInsertModel`.

### GraphQL for Reviews

The REST API requires one call per PR to fetch its reviews (N+1 problem). With 100+ PRs per sync, this is expensive. GraphQL fetches 100 PRs with their nested reviews in a single query, reducing API calls by ~10x for review collection.

### Identity Resolution via Username, Not Email

GitHub commit emails are unreliable — users set arbitrary values, use `noreply` addresses, or change emails. GitHub usernames are stable and authoritative. The team sync worker populates `team_members.github_username` from the GitHub org API, and the identity resolver matches on that field with 1.0 confidence.

---

## Project Structure

```
upstream-pulse/
├── backend/
│   ├── src/
│   │   ├── app.ts                         # Fastify API server, inline routes, startup
│   │   ├── worker.ts                      # BullMQ worker process, scheduler startup
│   │   ├── jobs/
│   │   │   ├── scheduler.ts               # Cron schedules → BullMQ dispatch
│   │   │   └── workers/
│   │   │       ├── collection-worker.ts   # GitHub contribution collection
│   │   │       ├── governance-worker.ts   # OWNERS/CODEOWNERS refresh
│   │   │       ├── leadership-worker.ts   # Community repo leadership parsing
│   │   │       └── team-sync-worker.ts    # GitHub org → team_members sync
│   │   ├── modules/
│   │   │   ├── api/routes/metrics.ts      # Metrics route group (Fastify plugin)
│   │   │   ├── collection/
│   │   │   │   ├── github-collector.ts    # GitHub REST + GraphQL data collection
│   │   │   │   ├── codeowners-parser.ts   # GitHub CODEOWNERS file parser
│   │   │   │   └── leadership-collector.ts # Config-driven leadership parser
│   │   │   ├── identity/resolver.ts       # GitHub username → team member mapping
│   │   │   └── metrics/
│   │   │       ├── metrics-service.ts     # On-demand metrics calculation (singleton)
│   │   │       └── types.ts              # Metric type definitions
│   │   ├── scripts/                       # One-off scripts (seed, backfill-github-ids)
│   │   └── shared/
│   │       ├── config/
│   │       │   ├── index.ts              # Environment config + validation
│   │       │   └── org-registry.ts       # Static upstream org definitions
│   │       ├── database/
│   │       │   ├── client.ts             # Drizzle client (connection pool of 10)
│   │       │   ├── schema.ts             # Table definitions + relations
│   │       │   ├── run-migrate.ts        # Migration runner
│   │       │   └── migrations/           # SQL migration files
│   │       ├── types/index.ts            # Shared TypeScript types
│   │       └── utils/
│   │           ├── logger.ts             # Winston logger
│   │           └── github.ts             # Octokit utilities (user ID lookup, repo date)
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx                        # Router + QueryClient setup
│   │   ├── main.tsx                       # Vite entry point
│   │   ├── pages/                         # Route-level page components
│   │   ├── components/
│   │   │   ├── dashboard/                 # Dashboard-specific components
│   │   │   ├── layout/                    # AppLayout, nav, sidebar
│   │   │   ├── common/                    # Shared components
│   │   │   └── ui/                        # shadcn/ui primitives
│   │   └── index.css                      # Tailwind base styles
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── deploy/
│   ├── deploy.sh                          # Build, push, apply, status, logs
│   └── openshift/                         # Kustomize manifests
│       ├── kustomization.yaml
│       ├── backend-deployment.yaml
│       ├── worker-deployment.yaml
│       ├── frontend-deployment.yaml
│       ├── postgres.yaml
│       ├── redis.yaml
│       ├── postgres-backup-cronjob.yaml
│       └── ...
├── docs/                                  # Documentation
├── docker-compose.yml                     # Local dev infra (Postgres + Redis)
├── package.json                           # Root scripts (dev, build, db:migrate)
└── .env.example                           # Environment variable template
```

---

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Runtime** | Node.js 20 LTS, TypeScript 5 (strict, ESM) |
| **API** | Fastify 4, CORS, WebSocket |
| **Database** | PostgreSQL 16, Drizzle ORM, `postgres` driver (pool of 10) |
| **Queue** | Redis 7, BullMQ, ioredis |
| **Scheduling** | node-cron |
| **GitHub** | Octokit (REST + GraphQL) |
| **Frontend** | React 18, Vite 5, Tailwind CSS, shadcn/ui, Recharts |
| **Data Fetching** | TanStack Query v5 |
| **Routing** | React Router v6 |
| **Logging** | Winston |
| **Containers** | Docker, OpenShift / Kubernetes, Kustomize |
