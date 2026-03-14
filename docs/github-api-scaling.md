# GitHub API Usage

This document describes how Upstream Pulse uses the GitHub API and the current rate limit constraints.

---

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  API Server  │     │  Scheduler   │     │    Worker    │
│  (app.ts)    │     │ (2 AM cron)  │     │ (3 concur.) │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │   Enqueue jobs     │                    │
       ▼                    ▼                    │
┌─────────────────────────────────────┐          │
│           Redis Queue               │          │
│           (BullMQ)                  │◀─────────┘
│                                     │   Process jobs
│  • contribution-collection          │
│  • governance-refresh               │
│  • leadership-refresh               │
│  • team-sync                        │
└─────────────────────────────────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  GitHub Tokens     │
         │                    │
         │  GITHUB_TOKEN      │  ← collection, governance, leadership
         │  GITHUB_TEAM_TOKEN │  ← team sync (read:org scope)
         └─────────┬──────────┘
                   │
                   │  REST + GraphQL
                   ▼
┌─────────────────────────────────────┐
│          GitHub API                 │
│                                     │
│  REST:  5,000 requests/hour         │
│  GraphQL: 5,000 points/hour         │
│                                     │
│  REST endpoints:                    │
│  • /repos/{owner}/{repo}/commits    │
│  • /repos/{owner}/{repo}/pulls      │
│  • /repos/{owner}/{repo}/issues     │
│  • /repos/{owner}/{repo}/git/trees  │
│  • /repos/{owner}/{repo}/contents   │
│                                     │
│  GraphQL:                           │
│  • PR reviews (100 PRs × 10 nested) │
└─────────────────────────────────────┘
                   │
                   ▼
         ┌────────────────────┐
         │    PostgreSQL      │
         │                    │
         │  • contributions   │
         │  • maintainer_status│
         │  • leadership_pos. │
         └────────────────────┘
```

---

## API Calls Per Operation

### Contribution Collection

| Data Type | API | Calls per sync | Notes |
|-----------|-----|---------------|-------|
| Commits | REST `repos.listCommits` | 1 per 100 commits | Paginated, filtered by `since` |
| Pull Requests | REST `pulls.list` | 1 per 100 PRs | Early break when all older than `since` |
| Reviews | **GraphQL** | 1 per 100 PRs (nested) | Avoids N+1 REST problem |
| Issues | REST `issues.listForRepo` | 1 per 100 issues | Filtered by `since` param |

### Governance Collection

| Data Type | API | Calls per repo | Notes |
|-----------|-----|---------------|-------|
| OWNERS files | REST `git.getTree` + `repos.getContent` | 1 (tree) + 1 per OWNERS file | Tree fetched recursively |
| OWNERS_ALIASES | REST `repos.getContent` | 1-2 | Checks two paths |
| CODEOWNERS | REST `repos.getContent` | 1-3 | Checks three paths |

### Leadership Collection

| Data Type | API | Calls per org | Notes |
|-----------|-----|---------------|-------|
| Markdown files | REST `repos.getContent` | 1 per file | Raw content from community repo |
| WG/SIG YAML | REST `repos.getContent` | 1 | Single YAML file |

---

## Rate Limit Handling

The collector tracks rate limits from both REST and GraphQL:

- **REST**: Reads `x-ratelimit-remaining` and `x-ratelimit-reset` from response headers after every call
- **GraphQL**: Reads `rateLimit.remaining` and `rateLimit.resetAt` from the query response

When remaining calls drop below **50**, the collector sleeps until the reset window (plus a 5-second buffer). During the wait, the job status is updated to `waiting_for_api` so the system status page reflects what's happening. Collection resumes automatically after the reset.

---

## Capacity Estimates

Based on a single GitHub PAT with 5,000 REST requests/hour:

| Scenario | Estimated API Calls | Time |
|----------|-------------------|------|
| Daily sync (10 repos) | ~150 | ~2 min |
| Daily sync (100 repos) | ~1,500 | ~20 min |
| Daily sync (500 repos) | ~7,500 | ~1.5 hrs |
| Full sync (1 repo) | ~300 | ~4 min |
| Full sync (100 repos) | ~30,000 | ~6 hrs |

Daily syncs use `lastSyncAt` per project, so the actual call count depends on how much activity occurred since the last sync. Quiet repos may need only 4-5 calls; active repos with hundreds of daily PRs will need more.

---

## Known Limitations

- **Two tokens, one budget** — `GITHUB_TOKEN` handles collection, governance, and leadership. `GITHUB_TEAM_TOKEN` (separate PAT with `read:org`) handles team sync. But all collection work still shares one token's 5,000 req/hr budget
- **No ETag caching** — Every request counts against the rate limit, even if data hasn't changed
- **No local git clones** — Commit data is fetched entirely via API; cloning repos and parsing `git log` would use zero API calls for commits
- **Single worker process** — One process with 3 concurrent collection jobs; horizontal scaling would require multiple worker deployments
