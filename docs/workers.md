# Workers & Job System

Upstream Pulse uses **BullMQ** (backed by Redis) for background job processing. This allows long-running tasks like GitHub data collection and AI analysis to run asynchronously without blocking the API.

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

Handles GitHub data collection for tracked projects.

| Property | Value |
|----------|-------|
| Concurrency | 3 jobs simultaneously |
| Rate limit | 10 jobs per minute |
| Retries | 3 attempts with exponential backoff |
| Retention | Keeps last 100 completed, 50 failed |

### 2. `insight-generation`

Handles AI-powered analysis using Google Gemini.

| Property | Value |
|----------|-------|
| Concurrency | 1 job at a time |
| Retries | 2 attempts |
| Retention | Keeps last 50 completed, 25 failed |

---

## Sync Strategy

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
3. Stores contributions in the database (skips duplicates)
4. Updates project `last_sync_at` timestamp

> **Note:** Metrics are calculated on-demand by the API from raw contributions data, not pre-calculated by the worker.

**Job types:**
- `full_sync` - For new projects (fetches from repo creation date)
- `sync` - For daily/manual syncs (fetches from `last_sync_at`)

**Data collected per repository:**

| Type | What's fetched |
|------|----------------|
| Commits | SHA, author, date, message, lines changed |
| Pull Requests | Number, author, state, merge status, reviews |
| Issues | Number, author, state, labels |
| Reviews | Reviewer, decision (approved/changes requested) |

---

## Running the Worker

```bash
# Start the worker process
cd backend
npm run worker
```

This starts:
- The collection worker (processes GitHub collection jobs)
- The scheduler (daily sync cron job)

**Note:** The worker runs separately from the API server. You need both running:
- `npm run dev` - API server (port 3000)
- `npm run worker` - Background worker

---

## Triggering Jobs

### Adding a New Project (Full History)

```bash
curl -X POST http://localhost:3000/api/projects \
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

### Manual Sync (Existing Project)

```bash
# Sync from last_sync_at (default)
curl -X POST http://localhost:3000/api/admin/collect \
  -H "Content-Type: application/json" \
  -d '{"projectId": "uuid-here"}'

# Sync from a specific date
curl -X POST http://localhost:3000/api/admin/collect \
  -H "Content-Type: application/json" \
  -d '{"projectId": "uuid-here", "since": "2024-06-01"}'

# Full history (from repo creation)
curl -X POST http://localhost:3000/api/admin/collect \
  -H "Content-Type: application/json" \
  -d '{"projectId": "uuid-here", "fullHistory": true}'
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

Each sync makes multiple GitHub API calls:

| Operation | API Calls |
|-----------|-----------|
| Check rate limit | 1 |
| Fetch commits | 1 per 100 commits |
| Fetch pull requests | 1 per 100 PRs |
| Fetch reviews | 1 per PR (limited to 50 recent PRs) |
| Fetch issues | 1 per 100 issues |

**Estimated calls per sync:**
- Daily sync (from `last_sync_at`): ~10-20 calls
- Full history (2 years): ~200-500 calls

GitHub rate limit: 5,000 requests/hour with token.

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

The collector automatically checks rate limits before each sync. If rate limited:
- Job will fail with a rate limit error
- Retry will happen after exponential backoff
- Check `GITHUB_TOKEN` is set correctly

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis connection URL |
| `GITHUB_TOKEN` | Yes | GitHub personal access token |
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `GEMINI_API_KEY` | For insights | Google Gemini API key |
