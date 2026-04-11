# Code Review Criteria

This file defines the review criteria for all code reviews — automated (CI) and
manual (local `/pr-review` command). All reviewers (human or AI) should apply
these criteria consistently.

## Review checklist

1. **Security** — OWASP top 10 vulnerabilities: injection (SQL, command, XSS),
   broken auth, sensitive data exposure, insecure deserialization. Pay special
   attention to:
   - User input handling and API route boundaries
   - Fastify request validation (Zod schemas must validate all inputs)
   - Octokit/GitHub API token handling — never log or expose tokens
   - Secrets in config — must come from env vars, never hardcoded

2. **Correctness** — Bugs, logic errors, off-by-one errors, unhandled edge
   cases, race conditions, null/undefined access, and incorrect assumptions
   about data shape or API behavior. Verify TypeScript types match runtime
   reality — no unsafe `as` casts or `any` types without justification.

3. **Code quality** — Readability, maintainability, appropriate abstraction
   level. Flag unnecessary complexity, dead code, or misleading names. Prefer
   clarity over cleverness.

4. **Project conventions**:
   - ESM (`import`/`export`) throughout — both backend and frontend
   - TypeScript strict mode — no `!` non-null assertions, explicit null guards
   - Backend logging via `winston` logger — never `console.log`
   - Drizzle ORM for database queries — no raw SQL unless justified
   - Zod for runtime validation of API inputs
   - React functional components with hooks — no class components
   - Tailwind CSS for styling — no CSS modules or inline styles
   - Test coverage for changed logic (Vitest)

5. **Performance**:
   - Frontend: unnecessary re-renders (missing `useMemo`/`useCallback`),
     missing React Query cache keys, unbounded data fetching
   - Backend: N+1 queries, missing database indexes for new query patterns,
     unbounded result sets without pagination
   - Workers: BullMQ jobs must handle failures gracefully and not retry
     indefinitely — check `attempts` and `backoff` config
   - Memory leaks: event listeners, timers, subscriptions not cleaned up

6. **Database**:
   - Drizzle schema changes in `schema.ts` must have a corresponding migration
     (`npm run db:generate`)
   - Verify queries use proper indexes — check for full table scans on large
     tables (contributions, collection_jobs)
   - Transactions for multi-table writes
   - Foreign key cascades configured correctly

7. **API & integration**:
   - Octokit calls must use the throttling plugin — never raw `fetch` to
     GitHub API
   - WebSocket handlers (`@fastify/websocket`) must clean up on disconnect
   - Cron jobs (`node-cron`) must be idempotent — safe to run if triggered
     twice

## Review tone

- Be concise. Focus on actionable feedback.
- Don't nitpick style unless it impacts readability.
- Only flag issues you're confident about. If something is ambiguous or
  subjective, frame it as a suggestion, not a blocker.
- Don't comment on files outside the scope of the PR unless they're directly
  affected (e.g., a missing import).
