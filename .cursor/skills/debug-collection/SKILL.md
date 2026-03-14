---
name: debug-collection
description: Diagnoses and fixes data collection issues in Upstream Pulse — checks job status, GitHub rate limits, identity resolution, worker logs, and re-triggers collection. Use when contributions are missing, collection jobs are failing, or data looks incomplete.
---

# Debug Collection Issues

Follow this diagnostic procedure when contributions are missing, collection jobs are failing, or data looks stale.

## Step 1: Check Job Status

Query the `collectionJobs` table for recent jobs:

```bash
oc exec -n upstream-pulse deploy/postgres -- psql -U postgres -d upstream_pulse \
  -c "SELECT cj.id, p.name, p.github_org || '/' || p.github_repo as repo, cj.status, cj.job_type, cj.started_at, cj.completed_at, cj.error_details FROM collection_jobs cj JOIN projects p ON cj.project_id = p.id ORDER BY cj.started_at DESC LIMIT 20;"
```

Look for:

- `status = 'failed'` — check `error_details` for the cause.
- `status = 'running'` with `started_at` older than 10 minutes — likely a stale job (worker crashed or was restarted).
- No recent jobs at all — scheduler may not be running.

## Step 2: Check GitHub Rate Limits

```bash
oc exec -n upstream-pulse deploy/backend -- node -e "
fetch('http://127.0.0.1:3000/api/system/status')
  .then(r=>r.json())
  .then(d=>console.log(JSON.stringify(d, null, 2)))
"
```

Or check rate limits directly:

```bash
gh api rate_limit --jq '.rate | "Remaining: \(.remaining)/\(.limit), Resets: \(.reset | strftime("%H:%M:%S UTC"))"'
```

If remaining is near 0, the collector will pause until reset. Check if there are unnecessary repos consuming API calls.

## Step 3: Check Worker Health

Verify the worker pod is running:

```bash
oc get pods -n upstream-pulse -l app.kubernetes.io/name=worker
```

Check worker logs for errors:

```bash
oc logs -n upstream-pulse deploy/worker --tail=100
```

Look for:

- Connection errors (Redis, PostgreSQL).
- Rate limit warnings.
- Uncaught exceptions.
- "Marking stale job as failed" messages (indicates previous crash).

## Step 4: Check Specific Project

If a specific project has missing data:

```bash
oc exec -n upstream-pulse deploy/postgres -- psql -U postgres -d upstream_pulse \
  -c "SELECT p.name, p.github_org, p.github_repo, p.is_active, p.last_sync_at,
      (SELECT COUNT(*) FROM contributions c WHERE c.project_id = p.id) as total_contributions,
      (SELECT COUNT(*) FROM contributions c WHERE c.project_id = p.id AND c.contribution_type = 'commit') as commits,
      (SELECT COUNT(*) FROM contributions c WHERE c.project_id = p.id AND c.contribution_type = 'pull_request') as prs,
      (SELECT COUNT(*) FROM contributions c WHERE c.project_id = p.id AND c.contribution_type = 'review') as reviews,
      (SELECT COUNT(*) FROM contributions c WHERE c.project_id = p.id AND c.contribution_type = 'issue') as issues
    FROM projects p WHERE p.github_org = '<org>' AND p.github_repo = '<repo>';"
```

If commits exist but PRs/reviews/issues are 0 — the job was likely interrupted. Re-trigger with `fullHistory: true`.

## Step 5: Check Identity Resolution

If contributions exist but team members aren't mapped:

```bash
oc exec -n upstream-pulse deploy/postgres -- psql -U postgres -d upstream_pulse \
  -c "SELECT c.author_login, c.is_team_member, COUNT(*) FROM contributions c WHERE c.project_id = '<project-id>' GROUP BY c.author_login, c.is_team_member ORDER BY count DESC LIMIT 20;"
```

If known team members show `is_team_member = false`:

1. Check `identity_mappings` for the username.
2. Check `team_members` for the person.
3. The identity resolver matches by: GitHub username → explicit mappings → email domain → fuzzy name.

## Step 6: Re-trigger Collection

**Always get user approval before triggering collection** (this is a POST/write operation).

```bash
oc exec -n upstream-pulse deploy/backend -- node -e "
fetch('http://127.0.0.1:3000/api/admin/collect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId: '<project-id>', fullHistory: true })
}).then(r=>r.text()).then(console.log)
"
```

**Always use `fullHistory: true`** when re-triggering after a failure — without it, the collector uses `lastSyncAt` or 30-day lookback and will miss historical data.

## Common Causes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| All jobs show `failed` | GitHub token expired or rate limited | Check token, wait for rate limit reset |
| Jobs stuck as `running` | Worker crashed mid-job | Worker marks stale jobs on next startup; restart worker pod |
| Commits present, PRs missing | Job interrupted mid-sync | Re-trigger with `fullHistory: true` |
| No jobs at all | Scheduler not running, or project `is_active = false` | Check worker logs; verify project is active |
| Team members not mapped | Missing identity mapping | Check `identity_mappings` and `team_members` tables |
| Zero contributions for new project | `startCollection: true` not set on create | Trigger manually via admin API |
