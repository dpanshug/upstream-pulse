# GitHub API Scaling Strategy

This document outlines the current architecture and future scaling strategy for GitHub data collection.

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CURRENT STATE                                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  API Server  │     │  Scheduler   │     │    Worker    │
│  (app.ts)    │     │ (2 AM cron)  │     │ (single)     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │   Enqueue jobs     │                    │
       ▼                    ▼                    │
┌─────────────────────────────────────┐          │
│           Redis Queue               │          │
│           (BullMQ)                  │◀─────────┘
│                                     │   Process jobs
│  • contribution-collection          │
│  • insight-generation               │
└─────────────────────────────────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  Single GitHub     │
         │  Token (PAT)       │
         │                    │
         │  🔑 GITHUB_TOKEN   │
         └─────────┬──────────┘
                   │
                   │  REST API calls
                   │  (no caching)
                   ▼
┌─────────────────────────────────────┐
│          GitHub API                 │
│                                     │
│    ⚠️  5,000 requests/hour limit    │
│                                     │
│  Endpoints used:                    │
│  • /repos/{owner}/{repo}/commits    │
│  • /repos/{owner}/{repo}/pulls      │
│  • /repos/{owner}/{repo}/issues     │
│  • /pulls/{number}/reviews          │
└─────────────────────────────────────┘
                   │
                   ▼
         ┌────────────────────┐
         │    PostgreSQL      │
         │                    │
         │  • contributions   │
         │  • projects        │
         │  • team_members    │
         └────────────────────┘


╔═══════════════════════════════════════════════════════════════════════════╗
║  LIMITATIONS                                                               ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  ❌ Single token = max 5,000 req/hr                                       ║
║  ❌ No ETag caching (every request counts against limit)                  ║
║  ❌ All data fetched via API (including commits)                          ║
║  ❌ Single worker process                                                 ║
║  ❌ No request deduplication                                              ║
╚═══════════════════════════════════════════════════════════════════════════╝


CAPACITY ESTIMATES (Current):
┌────────────────────────┬─────────────┬──────────────────┐
│ Scenario               │ API Calls   │ Time @ 5K/hr     │
├────────────────────────┼─────────────┼──────────────────┤
│ Daily sync (10 repos)  │ ~150        │ ~2 min           │
│ Daily sync (100 repos) │ ~1,500      │ ~20 min          │
│ Daily sync (500 repos) │ ~7,500      │ ~1.5 hrs         │
│ Full sync (1 repo)     │ ~300        │ ~4 min           │
│ Full sync (100 repos)  │ ~30,000     │ ~6 hrs           │
└────────────────────────┴─────────────┴──────────────────┘
```

---

## Future Architecture (Proposed)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FUTURE STATE - SCALABLE                              │
└─────────────────────────────────────────────────────────────────────────────┘

                              DATA SOURCES
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌─────────────────────┐              ┌─────────────────────┐              │
│   │    GitHub API       │              │   Local Git Clones  │              │
│   │                     │              │   (Facade Worker)   │              │
│   │  • REST API         │              │                     │              │
│   │  • GraphQL API      │              │  📁 /repos/         │              │
│   │                     │              │    ├── org1/repo1   │              │
│   │  5,000 req/hr/token │              │    ├── org1/repo2   │              │
│   └──────────┬──────────┘              │    └── org2/repo1   │              │
│              │                         └──────────┬──────────┘              │
│              │                                    │                         │
└──────────────┼────────────────────────────────────┼─────────────────────────┘
               │                                    │
               │   REST/GraphQL                     │  git fetch + log parse
               │                                    │  (0 API calls!)
               ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PROCESSING LAYER                                  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Token Pool                                    │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                             │  │
│  │  │ 🔑1 │ │ 🔑2 │ │ 🔑3 │ │ 🔑4 │ │ 🔑5 │  ──▶  25,000 req/hr!        │  │
│  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                             │  │
│  │                                                                       │  │
│  │  • Rotate on rate limit hit                                          │  │
│  │  • Track remaining quota per token                                   │  │
│  │  • Auto-select token with most capacity                              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         ETag Cache                                    │  │
│  │                                                                       │  │
│  │   Request ──▶ Check ETag ──▶ If-None-Match header ──▶ GitHub         │  │
│  │                                                           │           │  │
│  │                              ┌────────────────────────────┘           │  │
│  │                              ▼                                        │  │
│  │                    ┌─────────────────────┐                            │  │
│  │                    │  304 Not Modified?  │                            │  │
│  │                    └─────────┬───────────┘                            │  │
│  │                              │                                        │  │
│  │              ┌───────────────┴───────────────┐                        │  │
│  │              ▼                               ▼                        │  │
│  │     ┌──────────────┐               ┌──────────────┐                   │  │
│  │     │ YES: Use     │               │ NO: Process  │                   │  │
│  │     │ cached data  │               │ new data     │                   │  │
│  │     │              │               │              │                   │  │
│  │     │ 🎉 FREE!     │               │ Update cache │                   │  │
│  │     │ No rate hit  │               │ + ETag       │                   │  │
│  │     └──────────────┘               └──────────────┘                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      Distributed Workers                               │ │
│  │                                                                        │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               │ │
│  │  │ Worker 1 │  │ Worker 2 │  │ Worker 3 │  │ Worker N │               │ │
│  │  │          │  │          │  │          │  │   ...    │               │ │
│  │  │ API jobs │  │ API jobs │  │ Facade   │  │          │               │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘               │ │
│  │       │             │             │             │                      │ │
│  │       └─────────────┴─────────────┴─────────────┘                      │ │
│  │                           │                                            │ │
│  │                           ▼                                            │ │
│  │              ┌─────────────────────────┐                               │ │
│  │              │     Message Broker      │                               │ │
│  │              │   (Redis / RabbitMQ)    │                               │ │
│  │              └─────────────────────────┘                               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STORAGE LAYER                                     │
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │                      PostgreSQL                                 │      │
│    │                                                                 │      │
│    │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │      │
│    │  │  contributions  │  │ collection_     │  │  github_tokens  │ │      │
│    │  │                 │  │ status          │  │  (token pool)   │ │      │
│    │  │ commits, PRs,   │  │                 │  │                 │ │      │
│    │  │ issues, reviews │  │ per-repo job    │  │ token, limit,   │ │      │
│    │  │                 │  │ progress        │  │ reset_at        │ │      │
│    │  └─────────────────┘  └─────────────────┘  └─────────────────┘ │      │
│    │                                                                 │      │
│    │  ┌─────────────────┐  ┌─────────────────┐                      │      │
│    │  │  etag_cache     │  │  projects       │                      │      │
│    │  │                 │  │                 │                      │      │
│    │  │ url, etag,      │  │ last_sync_at,   │                      │      │
│    │  │ cached_data     │  │ sync_status     │                      │      │
│    │  └─────────────────┘  └─────────────────┘                      │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │                      Redis                                      │      │
│    │                                                                 │      │
│    │  • Job queues (BullMQ)                                          │      │
│    │  • In-memory ETag cache (fast lookups)                          │      │
│    │  • Rate limit counters per token                                │      │
│    └─────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘


╔═══════════════════════════════════════════════════════════════════════════╗
║  BENEFITS                                                                  ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  ✅ N tokens = N × 5,000 req/hr capacity                                  ║
║  ✅ ETag caching = ~90% fewer counted requests                            ║
║  ✅ Facade worker = 0 API calls for commit data                           ║
║  ✅ Parallel workers = horizontal scaling                                 ║
║  ✅ Collection status = resume interrupted jobs                           ║
║  ✅ GraphQL = fewer requests for complex queries                          ║
╚═══════════════════════════════════════════════════════════════════════════╝


CAPACITY ESTIMATES (Future with 5 tokens + ETag + Facade):
┌────────────────────────┬─────────────┬──────────────────┐
│ Scenario               │ API Calls   │ Time             │
├────────────────────────┼─────────────┼──────────────────┤
│ Daily sync (10 repos)  │ ~15*        │ <1 min           │
│ Daily sync (100 repos) │ ~150*       │ ~2 min           │
│ Daily sync (500 repos) │ ~750*       │ ~10 min          │
│ Full sync (1 repo)     │ ~50**       │ <1 min           │
│ Full sync (100 repos)  │ ~5,000**    │ ~15 min          │
└────────────────────────┴─────────────┴──────────────────┘
* With ETag caching (90% reduction assumed)
** With Facade worker (commits via git clone, not API)
```

---

## Implementation Phases

### Phase 1: ETag Caching (Quick Win)
**Effort:** Low | **Impact:** High

```typescript
// Add to github.ts
interface CachedResponse {
  etag: string;
  data: any;
  cachedAt: Date;
}

const etagCache = new Map<string, CachedResponse>();

async function fetchWithEtag(url: string, options: RequestInit) {
  const cached = etagCache.get(url);
  const headers = { ...options.headers };
  
  if (cached) {
    headers['If-None-Match'] = cached.etag;
  }
  
  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 304) {
    // Didn't count against rate limit!
    return cached.data;
  }
  
  const data = await response.json();
  const etag = response.headers.get('etag');
  
  if (etag) {
    etagCache.set(url, { etag, data, cachedAt: new Date() });
  }
  
  return data;
}
```

### Phase 2: Token Pool
**Effort:** Medium | **Impact:** High

```sql
-- New table for token management
CREATE TABLE github_tokens (
  id UUID PRIMARY KEY,
  token_hash VARCHAR(64) UNIQUE,  -- Don't store plain tokens
  encrypted_token TEXT,
  rate_limit_remaining INT DEFAULT 5000,
  rate_limit_reset_at TIMESTAMP,
  last_used_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Phase 3: Facade Worker (Local Git)
**Effort:** High | **Impact:** Very High for commit-heavy repos

- Clone repos to local disk
- Parse `git log` for commits
- Only use API for PRs, issues, reviews
- Significantly reduces API dependency

### Phase 4: GraphQL Migration
**Effort:** Medium | **Impact:** Medium

- Batch queries (get PR + reviews + comments in one call)
- More efficient for nested data
- Separate rate limit pool

---

## Comparison with Augur

| Feature | Upstream Pulse (Current) | Upstream Pulse (Future) | Augur |
|---------|-------------------------|------------------------|-------|
| Token Pool | ❌ Single token | ✅ Multiple tokens | ✅ worker_oauth table |
| ETag Caching | ❌ No | ✅ Yes | ❓ Unknown |
| Local Git Clone | ❌ No | ✅ Facade worker | ✅ Facade worker |
| Distributed Workers | ⚠️ Single process | ✅ Multiple workers | ✅ Celery workers |
| Message Broker | ✅ Redis/BullMQ | ✅ Redis/BullMQ | ✅ RabbitMQ |
| Collection Status | ⚠️ Basic | ✅ Per-repo tracking | ✅ collection_status |
| GraphQL | ❌ REST only | ✅ GraphQL | ❌ REST only |

---

## Priority Recommendation

```
                    IMPACT
                      ▲
                      │
           High ──────┼────────────────────────────
                      │         ┌─────────────┐
                      │         │ Token Pool  │
                      │         │ (Phase 2)   │
                      │         └─────────────┘
                      │  ┌──────────────┐
                      │  │ ETag Cache   │    ┌─────────────┐
                      │  │ (Phase 1)    │    │ Facade      │
                      │  └──────────────┘    │ (Phase 3)   │
                      │                      └─────────────┘
           Low ───────┼────────────────────────────
                      │              ┌─────────────┐
                      │              │ GraphQL     │
                      │              │ (Phase 4)   │
                      │              └─────────────┘
                      └────────────────────────────────▶ EFFORT
                           Low              High

Start with Phase 1 (ETag) - immediate wins with minimal effort.
```
