# Workers & Job System

Upstream Pulse uses **BullMQ** (backed by Redis) for background job processing. This allows long-running tasks like GitHub data collection to run asynchronously without blocking the API.

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Server    │────▶│   Redis Queue   │────▶│     Worker      │
│   (app.ts)      │     │   (BullMQ)      │     │   (worker.ts)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        │  Enqueue jobs                                 │  Process jobs
        ▼                                               ▼
┌─────────────────┐                           ┌─────────────────┐
│   Scheduler     │                           │   GitHub API    │
│   (cron jobs)   │                           │   PostgreSQL    │
└─────────────────┘                           └─────────────────┘
```

---

## Job Queues

### 1. `contribution-collection`

Collects commits, PRs, reviews, and issues from GitHub for tracked projects.

| Property | Value |
|----------|-------|
| Concurrency | 3 jobs simultaneously |
| Rate limit | 10 jobs per minute |
| Retries | 3 attempts with exponential backoff |
| Retention | Keeps last 100 completed, 50 failed |
| Schedule | Daily at 2:00 AM UTC |

### 2. `governance-refresh`

Refreshes OWNERS and CODEOWNERS files to track maintainer/reviewer roles.

| Property | Value |
|----------|-------|
| Concurrency | 1 job at a time |
| Retries | 2 attempts with exponential backoff |
| Retention | Keeps last 50 completed, 25 failed |
| Schedule | Weekly, Mondays at 3:00 AM UTC |

### 3. `leadership-refresh`

Collects steering committee, TSC, and WG/SIG leadership positions from community repos.

| Property | Value |
|----------|-------|
| Concurrency | 1 job at a time |
| Retries | 2 attempts with exponential backoff |
| Retention | Keeps last 25 completed, 10 failed |
| Schedule | Monthly, 1st at 4:00 AM UTC |

### 4. `team-sync`

Syncs team members from the GitHub organization (requires `GITHUB_TEAM_TOKEN` with `read:org` scope).

| Property | Value |
|----------|-------|
| Concurrency | 1 job at a time |
| Retries | 2 attempts with exponential backoff |
| Retention | Keeps last 25 completed, 10 failed |
| Schedule | Weekly, Mondays at 1:00 AM UTC |

---

## Contribution Sync Strategy

### When Syncs Happen

| Trigger | When | What it fetches |
|---------|------|-----------------|
| **New project added** | Once | From day 0 (repo creation date) |
| **Daily sync** | 2 AM UTC | From `last_sync_at` for each project |
| **Manual trigger** | On demand | Custom date range or from `last_sync_at` |

### Why This Design

- **No redundant fetches** - Daily sync uses `last_sync_at`, not a fixed window
- **No overlap** - Each sync picks up exactly where the last one left off
- **Efficient API usage** - ~10-20 API calls per daily sync (vs ~50-100 with old 90-day approach)
- **Full history only once** - When adding a new project, not daily

---

## Workers

### Collection Worker

**File:** `workers/collection-worker.ts`

**What it does:**
1. Fetches commits, pull requests, issues, and reviews from GitHub
2. Resolves contributor identities to team members
3. Stores contributions in the database (skips duplicates via `onConflictDoNothing`)
4. Updates project `last_sync_at` timestamp

Each phase (commits, PRs, reviews, issues) is persisted as soon as it completes, so a job that fails midway still keeps the data it already collected.

> **Note:** Metrics are calculated on-demand by the API from raw contributions data, not pre-calculated by the worker.

**Job types:**
- `full_sync` — For new projects (fetches from repo creation date)
- `sync` — For daily/manual syncs (fetches from `last_sync_at`)

**Data collected per repository:**

| Type | What's fetched |
|------|----------------|
| Commits | SHA, author, date, message, lines changed |
| Pull Requests | Number, author, state, merge status |
| Reviews | Reviewer, decision (approved/changes requested) |
| Issues | Number, author, state, labels |

### Governance Worker

**File:** `workers/governance-worker.ts`

**What it does:**
1. Looks up the org's `governanceModel` from the org registry
2. For `'owners'` — finds all OWNERS files in the repo, resolves aliases, extracts approvers and reviewers
3. For `'codeowners'` — parses CODEOWNERS file, extracts `@username` references
4. For `'none'` — skips
5. Stores results in the `maintainer_status` table (both team and external contributors)

Supports per-repo governance overrides via `repoGovernanceOverride` in the org registry.

### Leadership Worker

**File:** `workers/leadership-worker.ts`

**What it does:**
1. Receives a `githubOrg` from the job payload
2. Looks up the org's `communityRepo` config from the org registry
3. Dispatches to the appropriate parser (markdown tables, SIG sections, bullet lists, WG/SIG YAML)
4. Stores results in the `leadership_positions` table, scoped by `communityOrg`

One job is dispatched per org that has a `communityRepo` configured.

### Team Sync Worker

**File:** `workers/team-sync-worker.ts`

**What it does:**
1. Lists members of each GitHub organization (configured via `GITHUB_TEAM_ORG`, comma-separated)
2. Creates or updates team member records with GitHub username and user ID
3. Marks source as `'github_org_sync'` and tags each member with `source_org` to scope deactivation per-org
4. Deactivation only affects members from the org being synced — other orgs' members are untouched

Uses `GITHUB_TEAM_TOKEN` (separate PAT with `read:org` scope) to access org membership. One job is queued per configured org.

### Startup Cleanup

On startup, `worker.ts` marks any `running` job records older than 5 minutes as `failed`. This handles stale records left by previous crashes or restarts without interfering with jobs still finishing during a rolling deploy.

---

## Running the Worker

```bash
# Start the worker process
cd backend
npm run worker
```

This starts:
- The collection worker (GitHub contribution collection)
- The governance worker (OWNERS/CODEOWNERS refresh)
- The leadership worker (community repo leadership parsing)
- The team sync worker (GitHub org membership sync)
- The scheduler (cron jobs for all of the above)

**Note:** The worker runs separately from the API server. You need both running:
- `npm run dev` - API server (port 4321)
- `npm run worker` - Background worker

---

## Triggering Jobs

### Adding a New Project (Full History)

```bash
curl -X POST http://localhost:4321/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "githubOrg": "org-name",
    "githubRepo": "repo-name",
    "startCollection": true,
    "fullHistory": true
  }'
```

This will:
1. Validate the repo exists on GitHub
2. Create the project in the database
3. Queue a full history sync from the repo's creation date

### Manual Collection (Existing Project)

```bash
# Sync from last_sync_at (default)
curl -X POST http://localhost:4321/api/admin/collect \
  -H "Content-Type: application/json" \
  -d '{"projectId": "uuid-here"}'

# Sync from a specific date
curl -X POST http://localhost:4321/api/admin/collect \
  -H "Content-Type: application/json" \
  -d '{"projectId": "uuid-here", "since": "2024-06-01"}'

# Full history (from repo creation)
curl -X POST http://localhost:4321/api/admin/collect \
  -H "Content-Type: application/json" \
  -d '{"projectId": "uuid-here", "fullHistory": true}'
```

### Governance Refresh

```bash
# Refresh OWNERS/CODEOWNERS for all projects
curl -X POST http://localhost:4321/api/governance/refresh

# Refresh for a single project
curl -X POST http://localhost:4321/api/governance/refresh/<project-id>
```

### Leadership Refresh

```bash
# Refresh leadership for a specific org
curl -X POST http://localhost:4321/api/leadership/refresh \
  -H "Content-Type: application/json" \
  -d '{"githubOrg": "kubeflow"}'

# Refresh for all configured orgs
curl -X POST http://localhost:4321/api/leadership/refresh
```

### Team Sync

```bash
curl -X POST http://localhost:4321/api/admin/team-sync
```

---

## Monitoring Jobs

### Check Queue in Redis

```bash
# List waiting jobs
docker exec upstream-pulse-redis redis-cli LRANGE bull:contribution-collection:wait 0 -1

# Get job details
docker exec upstream-pulse-redis redis-cli HGETALL bull:contribution-collection:<job-id>
```

### Check Collection History in Database

```sql
-- Recent collection jobs
SELECT job_type, status, records_processed, errors_count, 
       started_at, completed_at
FROM collection_jobs 
ORDER BY started_at DESC 
LIMIT 10;

-- Check last sync times
SELECT name, last_sync_at 
FROM projects 
WHERE tracking_enabled = true;
```

---

## GitHub API Usage

See [GitHub API Usage](github-api-scaling.md) for API call breakdowns, capacity estimates, and rate limit handling.

---

## Troubleshooting

### Jobs stuck in queue

```bash
# Check Redis connection
redis-cli ping

# Check queue in Redis
redis-cli KEYS "bull:contribution-collection:*"
```

### Worker not processing

1. Ensure Redis is running: `docker ps | grep redis`
2. Check worker logs for errors
3. Verify `REDIS_URL` in `.env`

### Rate limited by GitHub

The collector tracks rate limits from response headers. When remaining calls drop below 50:
- The job pauses and waits until the rate limit resets (status shows `waiting_for_api`)
- Collection resumes automatically after the reset
- Check `GITHUB_TOKEN` is set correctly if you see persistent failures

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis connection URL |
| `GITHUB_TOKEN` | Yes | GitHub PAT for collection, governance, and leadership |
| `GITHUB_TEAM_TOKEN` | For team sync | Separate PAT with `read:org` scope (falls back to `GITHUB_TOKEN`) |
| `GITHUB_TEAM_ORG` | For team sync | Comma-separated GitHub org(s) to sync members from |
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
