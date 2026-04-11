# Backend

Fastify 4 API server with BullMQ async job workers.

## Stack

- **Runtime**: Node 20, TypeScript, ESM
- **Framework**: Fastify 4 with `@fastify/cors`, `@fastify/websocket`
- **Database**: PostgreSQL 16 via Drizzle ORM (`postgres` driver)
- **Queue**: Redis + BullMQ for background jobs
- **Logging**: Winston (never use `console.log`)
- **Validation**: Zod for request schemas
- **GitHub API**: `@octokit/rest` with `@octokit/plugin-throttling`
- **Testing**: Vitest

## Project Layout

```
src/
  app.ts                    # Fastify server, route registration, startup
  worker.ts                 # BullMQ worker process (runs separately)
  shared/
    config/                 # App config, org-registry
    database/
      client.ts             # Drizzle + postgres client
      schema.ts             # Drizzle table definitions
      migrate.ts            # Migration runner
      migrations/           # SQL migration files (drizzle-kit generate)
    middleware/              # Fastify hooks (identity, admin-guard)
    types/                  # Shared TypeScript types
    utils/                  # Logger, helpers
  modules/
    api/routes/             # Fastify route handlers
    collection/             # GitHub data collection logic
    metrics/                # Dashboard metrics, aggregation
    insights/               # AI-powered insights (Gemini)
    identity/               # Team member identity resolution
  jobs/
    scheduler.ts            # Cron-based job scheduling (node-cron)
    workers/                # BullMQ worker implementations
      collection-worker.ts  # GitHub contribution data collection
      governance-worker.ts  # Governance file parsing
      leadership-worker.ts  # Leadership/maintainer extraction
      team-sync-worker.ts   # GitHub org member sync
  scripts/                  # One-off scripts (seed, backfill)
  test/                     # Test helpers, fixtures
```

## Database Conventions

- All tables defined in `src/shared/database/schema.ts`
- Schema changes: modify `schema.ts`, then `npm run db:generate` to create
  migration, then `npm run db:migrate` to apply
- Use Drizzle query builder — avoid raw SQL
- UUIDs for primary keys (`uuid('id').defaultRandom().primaryKey()`)
- Timestamps: `created_at`, `updated_at` with `defaultNow()`
- Indexes defined in table config function

## API Conventions

- Routes registered in `app.ts` or via `modules/api/routes/`
- Use Fastify's `request.log` or the shared `logger` — never `console.log`
- Validate inputs with Zod schemas
- Return consistent JSON shapes: `{ data }` for success, throw Fastify errors
  for failures

## Worker Conventions

- Workers defined in `src/jobs/workers/`, registered in `src/worker.ts`
- Each worker processes a specific BullMQ queue
- Scheduler (`src/jobs/scheduler.ts`) uses `node-cron` to enqueue periodic jobs
- Workers must handle failures gracefully and log errors via Winston
