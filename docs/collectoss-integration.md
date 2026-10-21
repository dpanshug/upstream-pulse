# CollectOSS Data Source

Upstream Pulse can collect contribution data (commits, PRs, reviews, issues)
from two backends:

| Backend | How | When to use |
|---|---|---|
| **GitHub API** (default) | `GitHubCollector` — Octokit REST + GraphQL | Always available; freshest data; costs GitHub API quota |
| **CollectOSS** (optional) | `CollectossAdapter` — read-only SQL against a [CollectOSS](https://github.com/chaoss/collectoss) PostgreSQL database | Repos already collected by an OSPO/CHAOSS CollectOSS instance; no GitHub quota; data is as fresh as the instance's last refresh |

CollectOSS is the CHAOSS community continuation of Augur (Augur moved to
AugurLabs in March 2026). Its schema was renamed from `augur_data` to `data`
in CollectOSS 1.0 (alembic revision 43).

**Only contributions come from CollectOSS.** Governance (OWNERS/CODEOWNERS),
community leadership, and team sync always use the GitHub API.

---

## Architecture

```
                  React dashboard / MetricsService        (unchanged)
                                │
                     contributions table                  (stable interface)
                                │
                  IdentityResolver + upsert               (shared)
                                │
          collectProjectContributions()  ── project.dataSource ──┐
              │                                                   │
      GitHubCollector                                  CollectossAdapter
              │                                                   │
          GitHub API                                CollectOSS DB (read-only)
```

Both backends emit identical `ContributionRecord`s and IDs, so the
`(project_id, contribution_type, github_id)` unique key deduplicates across
them — switching a project between backends never creates duplicate rows.

| Type | `github_id` | CollectOSS source |
|---|---|---|
| commit | commit SHA | `commits.cmt_commit_hash` |
| pr | PR number | `pull_requests.pr_src_number` |
| review | GitHub review databaseId | `pull_request_reviews.pr_review_src_id` |
| issue | issue number | `issues.gh_issue_number` |

### Key files

```
backend/src/modules/collection/
  project-collection.ts         # backend dispatch, GitHub fallback, CollectOSS cursor
  collectoss-adapter.ts         # all CollectOSS contribution SQL
  collectoss-repo-resolver.ts   # github org/repo → CollectOSS repo_id
  collectoss-health.ts          # connectivity + schema (table/column) verification
backend/src/shared/database/
  collectoss-client.ts          # lazy read-only pool (UTC timestamps)
frontend/src/components/admin/
  DataSourceControl.tsx         # badge + admin switch with coverage comparison
```

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `COLLECTOSS_DATABASE_URL` | _(empty)_ | `postgresql://` URL. Empty = CollectOSS disabled, everything uses GitHub |
| `COLLECTOSS_SCHEMA` | `data` | Schema with CollectOSS tables (`augur_data` for legacy Augur DBs) |
| `DEFAULT_DATA_SOURCE` | `github` | Source assigned to newly added projects (`github` \| `collectoss`) |
| `COLLECTOSS_FALLBACK_TO_GITHUB` | `true` | Collect from GitHub when a CollectOSS project's repo is missing or CollectOSS is unreachable |

Use a SELECT-only database role. Regardless of role privileges, every session
is opened with `default_transaction_read_only=on`.

In OpenShift, `COLLECTOSS_DATABASE_URL` is read from the
`upstream-pulse-secrets` secret as an **optional** key (absent = disabled);
the other variables live in the `upstream-pulse-config` ConfigMap.

---

## How a project's source is chosen

1. **New projects** get `DEFAULT_DATA_SOURCE`, or the `dataSource` passed to
   `POST /api/projects`. CollectOSS is only assigned if it is configured and
   tracks the repo; an explicit `collectoss` request that cannot be honoured
   is rejected (400), the instance default silently falls back to `github`.
2. **Admins can switch** any project on its detail page ("Change source") or via
   `PATCH /api/admin/projects/:id/data-source`. Switching to CollectOSS
   requires the repo to exist in CollectOSS. The panel shows CollectOSS vs.
   stored contribution counts for the last 90 days to validate coverage first.
3. **Each collection run** reads `project.dataSource` when it executes (not when
   queued), so a switch applies to the next run. If CollectOSS is not
   configured, unreachable, or does not track the repo, the run falls back to
   GitHub (unless `COLLECTOSS_FALLBACK_TO_GITHUB=false`) and the job is tagged
   "GitHub fallback" on the System Status page with the reason.

Existing contributions are never deleted when switching.

---

## Incremental sync

GitHub syncs use `projects.last_sync_at` as a contribution-date cursor.
That does not work for CollectOSS: an instance refreshes in batches (the
OSPO instance refreshes weekly), so contributions dated before the last
Upstream Pulse sync can appear in CollectOSS later and would be missed.

CollectOSS projects therefore keep their own cursor,
`projects.collectoss_synced_through` = the max `data_collection_date` already
ingested for the repo:

| Run | CollectOSS rows read |
|---|---|
| Full history / explicit `since` date | contribution date ≥ `since` |
| Daily / "since last sync", cursor set | `data_collection_date` > cursor (PRs/issues also when their `updated_at` > cursor, to pick up merges/closures) |
| First incremental run, never synced | everything (backfill) |
| First incremental run after switching from GitHub | contribution date ≥ `last_sync_at` − 14 days |

The cursor is captured before reading (so rows inserted mid-run are picked up
next time) and only advances after a run that covered all phases. Re-reading
rows is harmless — inserts are idempotent upserts.

---

## Mapping details and parity with GitHubCollector

- **Commits** — CollectOSS (Facade) stores one row per file per commit; rows are
  grouped by SHA and `cmt_added`/`cmt_removed` summed. Facade records merge
  commits as a single `(Merge commit)` row; these are skipped, matching
  GitHubCollector. Date = author timestamp (`cmt_author_timestamp`), as on
  GitHub. Author = the `contributors.cntrb_login` of `cmt_ght_author_id`
  (canonical identity), falling back to `cmt_author_platform_username`, which
  CollectOSS does not reliably populate (chaoss/CollectOSS#215). Commit messages come from
  `commit_messages`.
- **PRs / issues / reviews** — author = `contributors.cntrb_login`. Items without
  a resolvable author are skipped (GitHubCollector skips deleted users too).
  Issues exclude PRs (`pull_request IS NULL`). Pending reviews are skipped.
- **Not available from CollectOSS**: PR line stats (`additions`/`deletions`),
  issue labels. PR line stats are not used by any metric.
- **Timestamps** — CollectOSS stores `timestamp without time zone` in UTC; the
  client parses them as UTC so dates don't shift on non-UTC hosts.
- **Pagination** — keyset on primary keys/SHA (`LIMIT 1000`), so large repos
  are read in linear time without skipped or duplicated rows.

The columns the adapter depends on are listed in `REQUIRED_COLUMNS`
(`collectoss-health.ts`). The worker checks them on startup and the System
Status page shows any missing ones — a schema change in CollectOSS shows up
there before collections fail.

---

## API

| Method | Path | Description |
|---|---|---|
| `PATCH` | `/api/admin/projects/:id/data-source` | `{ "dataSource": "github" \| "collectoss" }` |
| `GET` | `/api/admin/projects/:id/collectoss?days=90` | Whether CollectOSS tracks the repo, cursor, CollectOSS vs. stored counts (`days=0` = all time) |
| `GET` | `/api/system/collectoss-status` | Connectivity, schema verification, data freshness, project count |
| `GET` | `/api/config` | Includes `dataSources: { collectossEnabled, default }` |
| `POST` | `/api/projects` | Accepts optional `dataSource` |

---

## Local development

```bash
docker compose --profile collectoss up -d collectoss-db   # sample DB on :5434

# .env
COLLECTOSS_DATABASE_URL=postgresql://sample_user:sample_password@localhost:5434/sample_collected_data
```

The sample DB (`ghcr.io/oss-aspen/sample-collected-data`) contains 7 repos,
e.g. `operate-first/blueprint`, `chaoss/grimoirelab-hatstall`, `augurlabs/augur`.
Add one as a project with data source CollectOSS and full history; the data is
historical, so view it with the period set to "All time".

Adapter integration tests run against the sample DB when
`COLLECTOSS_TEST_DATABASE_URL` is set (they are skipped otherwise, e.g. in CI):

```bash
cd backend
COLLECTOSS_TEST_DATABASE_URL=postgresql://sample_user:sample_password@localhost:5434/sample_collected_data npm test
```

---

## Rollout plan

1. **Ship with CollectOSS disabled** — no `COLLECTOSS_DATABASE_URL` in prod;
   behaviour is identical to GitHub-only. Migration `0008` adds
   `data_source` (default `github`), `collectoss_repo_id`,
   `collectoss_synced_through` to `projects`.
2. **Connect** — add `COLLECTOSS_DATABASE_URL` to the Vault path backing
   `upstream-pulse-secrets` once the OSPO data team grants network access and a
   read-only role. Verify System Status → Data Sources shows "Connected" and
   schema verified.
3. **Validate** — for a handful of tracked repos, open the project page →
   "Change source" and compare CollectOSS vs. stored counts. Investigate gaps
   (repo not tracked, stale refresh, unresolved authors) with the data team.
4. **Switch gradually** — move validated projects to CollectOSS; keep a few on
   GitHub as a control. Consider `DEFAULT_DATA_SOURCE=collectoss` once most
   tracked repos are covered (new repos not in CollectOSS still get GitHub).
5. **Revert anytime** — switch a project back to GitHub; no data is lost.

### Open items

| Item | Notes |
|---|---|
| Production access | Read-only credentials + network path from the OpenShift cluster to the OSPO CollectOSS instance (`#proj-ospo-aspen`) |
| Repo coverage | Which tracked repos (kubeflow, kserve, vllm-project, …) the instance collects; request additions |
| Refresh cadence | ~weekly on the OSPO instance — dashboards for CollectOSS projects lag by up to a week |
| Upcoming column renames | `cmt_ght_author_id` / `pr_augur_contributor_id` will drop their legacy names (chaoss/CollectOSS#513, targeted for 1.1). The health check will report them as missing; update `collectoss-adapter.ts` + `REQUIRED_COLUMNS` when the OSPO instance upgrades |
| Schema stability | The data team recommends a future "stable" schema; set `COLLECTOSS_SCHEMA` when it exists (column changes go in `collectoss-adapter.ts` + `REQUIRED_COLUMNS`) |
| Author resolution | Measure unresolved-author rate per repo during validation |

---

## Reference: CHAOSS team architecture diagram

![Architecture Diagram](../assets/collectoss-architecture-phase1.png)
