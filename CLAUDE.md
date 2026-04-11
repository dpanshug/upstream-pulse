# Upstream Pulse

Automated upstream open-source contribution tracking and insights dashboard.

## Repository Structure

TypeScript monorepo with separate `backend/` and `frontend/` directories, each
with their own `package.json`. No workspace manager — install dependencies in
each directory independently.

```
backend/          # Fastify API + BullMQ workers (TypeScript, ESM)
frontend/         # React SPA (Vite, TypeScript, Tailwind)
deploy/           # OpenShift manifests (kustomize base + overlays)
docs/             # Project documentation
```

## Commands

```bash
# Install
cd backend && npm install
cd frontend && npm install

# Dev (starts Postgres, Redis, API server, and Vite dev server)
npm run dev

# Test (backend only — Vitest)
cd backend && npm test

# Type check
cd backend && npm run type-check
cd frontend && npm run type-check

# Lint
cd backend && npm run lint
cd frontend && npm run lint

# Build
cd backend && npm run build          # tsc
cd frontend && npm run build         # tsc && vite build

# Database
cd backend && npm run db:migrate     # apply Drizzle migrations
cd backend && npm run db:generate    # generate migration from schema changes
cd backend && npm run db:studio      # Drizzle Studio GUI
```

## Architecture

- **Backend**: Fastify 4, PostgreSQL via Drizzle ORM, Redis + BullMQ for async
  job processing, Winston for logging
- **Frontend**: React 18, Vite, TanStack React Query, React Router, Recharts,
  Tailwind CSS
- **Infra**: Docker Compose for local dev (Postgres + Redis), OpenShift for
  production, ArgoCD for GitOps deploys

## Key Patterns

- ESM (`import`/`export`) throughout — both backend and frontend
- TypeScript strict mode — no `any`, no `!` non-null assertions
- Backend logging via `winston` logger — never `console.log`
- Zod for runtime validation of API inputs
- Drizzle ORM for all database access — no raw SQL unless justified
- BullMQ workers run in a separate process (`backend/src/worker.ts`)
- Org registry (`backend/src/shared/config/org-registry.ts`) defines tracked
  upstream projects — adding a project = adding an entry there

## Code Review

Review criteria are centralized in
[`.github/instructions/review.instructions.md`](.github/instructions/review.instructions.md).
This file is used by the CI review workflow, the `/pr-review` slash command,
and GitHub Copilot code review.

## CI/CD

- **`ci.yml`** — Runs on PRs: backend type-check + tests (with Postgres
  service), frontend build
- **`build-and-push.yml`** — On push to `main`/`preprod`: builds Docker
  images, pushes to Quay.io, updates kustomize overlay image tags
- **`claude-review.yml`** — Automated AI code review on every PR

## Repo Secrets

| Secret | Purpose |
|--------|---------|
| `QUAY_ROBOT_USERNAME` / `QUAY_ROBOT_TOKEN` | Quay.io image push |
| `GCP_SA_KEY` | GCP service account JSON key for Vertex AI (Claude review) |
