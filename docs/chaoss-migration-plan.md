# CollectOSS Integration Plan — Dual-Backend Architecture

## Goal

Source contribution data from the OSPO data team's CollectOSS/Augur database instead of collecting it directly from the GitHub API. Governance, leadership, team identity, metrics, AI insights, and the entire React dashboard remain in Upstream Pulse. A per-project toggle allows switching between GitHub-direct and CollectOSS backends — no lock-in to either.

## Principle

The `contributions` table is a **stable interface**. Both backends write into it in the same format. Everything above it (MetricsService, frontend, insights) sees no difference.

---

## Architecture

```
                        ┌─────────────────────────┐
                        │   React Dashboard        │  unchanged
                        └────────────┬────────────┘
                                     │
                        ┌────────────┴────────────┐
                        │   MetricsService         │  unchanged — queries contributions table
                        └────────────┬────────────┘
                                     │
                        ┌────────────┴────────────┐
                        │   contributions table    │  stable interface, same schema
                        └──────┬────────────┬─────┘
                               │            │
                  ┌────────────┴──┐   ┌─────┴───────────────┐
                  │ GitHubCollector│   │ CollectOSSAdapter    │
                  │ (existing)     │   │ (new)                │
                  └────────────┬──┘   └─────┬───────────────┘
                               │            │
                         GitHub API    Augur DB (eightknot.osci.io)
```

### What each component does

| Component | Role | Status |
|---|---|---|
| **collection-worker** | Dispatches to GitHubCollector or CollectOSSAdapter based on project.dataSource | Modified — add dispatch logic |
| **GitHubCollector** | Collects from GitHub API, writes to contributions table | Stays permanently |
| **CollectOSSAdapter** | Reads from Augur DB, writes to contributions table | NEW |
| **RepoResolver** | Maps Pulse project (org/repo) to Augur repo_id | NEW |
| **IdentityResolver** | Matches contributor logins to team_members. Enhanced to use Augur's cntrb_login/gh_user_id | Enhanced |
| **MetricsService** | Queries contributions table, computes team vs. total | Unchanged |
| **governance-worker** | Parses OWNERS/CODEOWNERS via GitHub API | Unchanged |
| **leadership-worker** | Extracts steering/TSC/SIG chairs via GitHub API | Unchanged |
| **team-sync-worker** | Syncs GitHub org members to team_members | Unchanged |
| **AI Insights** | Gemini analysis | Unchanged |
| **React Dashboard** | Entire frontend | Unchanged |

---

## Data Source: OSPO Data Team's CollectOSS Instance

The OSPO Aspen team runs a CollectOSS/Augur instance at `eightknot.osci.io`.

**Provided:**
- PostgreSQL database (`collectoss` DB, `data` schema — renamed from `augur` / `augur_data` as of Jun 2026)
- Commits, PRs, reviews, issues, contributor profiles, messages
- SSH tunnel for dev: `ssh -L 5411:localhost:5432 <username>@eightknot.osci.io`
- Local sample database for testing: `ghcr.io/oss-aspen/sample-collected-data:latest`
- Database refreshed weekly (~12 hours refresh time, mostly 8Knot materialized views)
- Production access available via Adrian Edwards (adredwar@redhat.com) or `#proj-ospo-aspen`

**Schema rename (from Adrian Edwards, Jun 2026):**

> Database name changed from `augur` to `collectoss`. Schema name changed from `augur_data` to `data`.

**Schema stability (from Adrian Edwards, Jun 9):**

> "The data schema is subject to potentially breaking changes. Advance warning may or may not be given. The recommendation for usecases requiring stability is to use the 'stable' schema that is being introduced."

**Implication:** All adapter queries are isolated in a single file (`augur-data-source.ts`). Schema changes require updating only that file.

---

## Per-Project Data Source Toggle

### Three levels of configuration

**1. Environment** — Is CollectOSS available?

`AUGUR_DATABASE_URL` is optional. If not set, CollectOSS backend is unavailable. Upstream Pulse works exactly as it does today (GitHub-direct only).

**2. Default** — What do new projects default to?

`DATA_SOURCE_DEFAULT` config value: `'github'` (default) or `'collectoss'`.

**3. Per-project** — The `dataSource` field on the projects table.

Each project has `dataSource: 'github' | 'collectoss'`. Toggled via admin API. The collection-worker reads this field and dispatches accordingly.

### Dispatch logic

```
project.dataSource === 'collectoss'
  → CollectOSSAdapter reads from Augur DB → writes to contributions table

project.dataSource === 'github'
  → GitHubCollector calls GitHub API → writes to contributions table
```

Both paths produce identical rows in the `contributions` table. Same columns, same dedup key (`projectId + contributionType + githubId`).

### Validation rules

- Cannot set `dataSource='collectoss'` if `AUGUR_DATABASE_URL` is not configured
- Cannot set `dataSource='collectoss'` if the project has no `augurRepoId` (repo must exist in Augur)
- Switching dataSource: next scheduled collection uses the new backend. Existing data stays — new data overlays via upsert.

---

## Schema Changes to Upstream Pulse

### projects table — add two columns

```sql
ALTER TABLE projects ADD COLUMN data_source VARCHAR(20) DEFAULT 'github';
ALTER TABLE projects ADD COLUMN augur_repo_id INTEGER;
```

- `data_source`: `'github'` or `'collectoss'` — controls which backend collects for this project
- `augur_repo_id`: the `repo_id` from Augur's `augur_data.repo` table. Nullable — only set for collectoss projects.

### contributions table — no changes

The existing schema stays exactly as-is. The `CollectOSSAdapter` maps Augur data into the same format.

### All other tables — no changes

`team_members`, `identity_mappings`, `maintainer_status`, `leadership_positions`, `collection_jobs`, `insights`, `reports` — all unchanged.

---

## CollectOSS Tables We Read

All tables live in the `data` schema (previously `augur_data`). Column names verified against the sample database (`ghcr.io/oss-aspen/sample-collected-data`).

| Table | Key columns | Maps to |
|---|---|---|
| `data.repo` | `repo_id`, `repo_git` | projects.augur_repo_id |
| `data.commits` | `cmt_commit_hash`, `cmt_committer_date`, `cmt_added`, `cmt_removed`, `cmt_author_platform_username` | contributions (type='commit'). **Note: 1 row per file — GROUP BY commit SHA needed** |
| `data.pull_requests` | `pr_src_number`, `pr_created_at`, `pr_merged_at`, `pr_src_state`, `pr_augur_contributor_id` | contributions (type='pr') |
| `data.pull_request_reviews` | `pr_review_src_id`, `cntrb_id`, `pr_review_submitted_at`, `pr_review_state` | contributions (type='review') |
| `data.issues` | `gh_issue_number`, `created_at`, `issue_state`, `reporter_id`, `pull_request` | contributions (type='issue'). Filter out PRs where `pull_request IS NOT NULL` |
| `data.contributors` | `cntrb_id`, `cntrb_login`, `gh_user_id` | IdentityResolver — match against team_members |
| `data.message` | PR/issue/review comment text | Available for future use |

**Important details:**
- Augur's `commits` table stores **1 row per file per commit**. The adapter GROUP BYs commit SHA and SUMs lines added/deleted.
- Author resolution uses `cmt_author_platform_username` (direct GitHub username) with a fallback JOIN to `contributors.cntrb_login`.
- PR number is in `pr_src_number` (not `pr_src_id` which is the GitHub API source ID).

---

## What Gets Built

### 1. CollectOSSAdapter (`backend/src/modules/collection/augur-data-source.ts`)

New file. Read-only Postgres client that queries the Augur DB and returns data in the same `ContributionRecord` format that `GitHubCollector` produces.

Methods:
- `getCommits(repoId, since)` — queries `augur_data.commits`, GROUP BY SHA, JOINs `contributors`
- `getPullRequests(repoId, since)` — queries `augur_data.pull_requests`, JOINs `contributors`
- `getReviews(repoId, since)` — queries `augur_data.pull_request_reviews`, JOINs `contributors`
- `getIssues(repoId, since)` — queries `augur_data.issues`, filters out PRs, JOINs `contributors`
- `getRepoId(org, repo)` — queries `augur_data.repo` by URL pattern to find `repo_id`

Returns the same `ContributionRecord[]` that `GitHubCollector.collectRepositoryContributions()` returns. The collection-worker writes these into the `contributions` table using the existing upsert logic.

### 2. RepoResolver (`backend/src/modules/collection/repo-resolver.ts`)

New file. Maps each Pulse project to its CollectOSS `repo_id`.

- On first use (or when `augur_repo_id` is null), queries `augur_data.repo` matching `repo_git LIKE '%{org}/{repo}%'`
- Stores the result in `projects.augur_repo_id`
- Cached in memory after first lookup

### 3. collection-worker dispatch update (`backend/src/jobs/workers/collection-worker.ts`)

Modified. Add dispatch logic:

```typescript
if (project.dataSource === 'collectoss' && config.augurDatabaseUrl) {
  // Use CollectOSSAdapter
  records = await augurDataSource.collect(project, since);
} else {
  // Use GitHubCollector (existing code)
  records = await githubCollector.collectRepositoryContributions(repo, since, ...);
}
// Write to contributions table (existing upsert logic — shared)
```

### 4. Config updates (`backend/src/shared/config/index.ts`)

Add:
- `augurDatabaseUrl` — optional, from `AUGUR_DATABASE_URL` env var

### 5. Schema migration

Drizzle migration adding `data_source` and `augur_repo_id` to `projects` table.

### 6. Admin API endpoint

Add `PATCH /api/admin/projects/:id/data-source` to toggle a project's `dataSource`. Validates that CollectOSS is configured and repo exists in Augur before allowing switch.

---

## What Gets Removed

Nothing in Phase 1. `GitHubCollector` and all existing collection code stays. This is additive only.

In a future phase (optional), if all projects are migrated to CollectOSS and GitHub-direct is no longer needed, the `GitHubCollector` contribution methods could be removed. But this is not planned or required.

---

## Implementation Phases

### Phase 0: Verify Data Availability — DONE

Column names verified against the sample database (`ghcr.io/oss-aspen/sample-collected-data`).
Schema confirmed as `data.*` (renamed from `augur_data`).

Still needed: verify which of our tracked repos (kubeflow, kubernetes, pytorch, vllm, etc.) exist in the production CollectOSS instance.

```sql
SELECT repo_git, repo_id FROM data.repo
WHERE repo_git LIKE '%kubeflow%' OR repo_git LIKE '%kubernetes%'
   OR repo_git LIKE '%pytorch%' OR repo_git LIKE '%vllm-project%'
   OR repo_git LIKE '%argoproj%' OR repo_git LIKE '%kserve%'
ORDER BY repo_git;
```

### Phase 1: Build Adapter + Config — DONE

1. Added `AUGUR_DATABASE_URL` to config (optional)
2. Created lazy-init read-only Postgres pool (`augur-client.ts`)
3. Built `CollectOSSAdapter` with batched queries for all 4 contribution types
4. Built `RepoResolver` with TTL-based cache
5. Drizzle migration: added `data_source` and `augur_repo_id` to projects
6. Updated collection-worker with dispatch logic (snapshots dataSource at enqueue time)
7. Added admin API: toggle data source, resolve Augur repo, Augur status
8. Added frontend: data source badges, admin toggle, System Status card
9. Added Augur health check on worker startup
10. Added sample DB to docker-compose (`collectoss` profile)
11. Tested end-to-end with sample data (199 records collected for operate-first/blueprint)

### Phase 2: Validate (NEXT — blocked on production credentials)

1. Get correct credentials for the production CollectOSS instance from Adrian Edwards
2. Verify which tracked repos exist in production
3. Switch 3–5 test projects to `dataSource='collectoss'`
4. Compare contribution counts, dates, and team attribution against GitHub-direct
5. Check contributor resolution quality — measure % of null team matches
6. Fix any discrepancies in the adapter

### Phase 3: Gradual Rollout

1. Switch remaining projects to `dataSource='collectoss'` one by one
2. Monitor for data quality issues after each batch
3. Keep a few projects on GitHub-direct as control group if desired

### Phase 4: Production Connection

1. Coordinate with Adrian Edwards for direct DB connection from OpenShift
2. Add `AUGUR_DATABASE_URL` as an OpenShift secret
3. Verify connection and data flow from production pods

---

## Open Items

| Item | Status | Blocking? | Follow-up action |
|---|---|---|---|
| Production DB credentials | Auth failed for user `dipgupta` | Yes — blocks Phase 2 | Ask Adrian on #proj-ospo-aspen for correct username/password |
| Which tracked repos are in production DB | Not checked yet | Yes — blocks Phase 2 | Run query once credentials work |
| Schema rename applied to production? | Adrian announced rename to `collectoss`/`data` | No — code already uses `data` | Confirm production DB name is `collectoss` |
| Production DB connection from OpenShift | "Reach out to data team" | Blocks Phase 4 only | Contact Adrian Edwards |
| Refresh schedule coordination | ~12 hrs/week, mostly 8Knot views | No | Ask if raw tables can refresh first |
| Contributor resolution quality | ~10% null authors reported in large instances | No — measure in Phase 2 | Side-by-side comparison during validation |

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Augur schema breaks without warning | All queries in one `CollectOSSAdapter` file. Migrate to stable schema when available |
| Repos not in Augur DB | Check in Phase 0. Request additions. Keep those projects on GitHub-direct meanwhile |
| Contributor resolution gaps | Measure in Phase 2. If unacceptable, supplement with GitHub-direct data or fix in adapter |
| Augur DB downtime during refresh | `contributions` table has cached data — dashboard still works with last-collected data |
| Production DB access denied/delayed | Does not block dev work (SSH tunnel). Coordinate early with Adrian |
| CollectOSS project abandoned | GitHubCollector stays permanently — flip `dataSource` back to 'github' per project |

---

## Contacts & Resources

- **OSPO data team Slack:** `#proj-ospo-aspen`
- **Adrian Edwards:** adredwar@redhat.com (production DB access, schema questions)
- **CollectOSS repo:** https://github.com/chaoss/CollectOSS
- **Sample database:** `ghcr.io/oss-aspen/sample-collected-data:latest` (local testing)
- **Augur REST API docs:** https://oss-augur.readthedocs.io/en/main/rest-api/api.html

---

## Reference: CHAOSS Team Architecture Diagram

The CHAOSS team provided a detailed architecture diagram for this integration:

![Architecture Diagram](../assets/chaoss-architecture-phase1.png)

Title: "Upstream Pulse × CollectOSS — Phase 1: Read-Only Data Adapter"

Key elements:
- CollectOSS (external, read-only) provides the data collection and Augur DB
- Upstream Pulse backend (modular monolith, architecture unchanged) adds the CollectOSSAdapter and RepoResolver
- Pulse PostgreSQL (existing schema, no breaking changes) keeps all existing tables
- GitHub API remains source of truth for governance and leadership
- React + Vite SPA unchanged
