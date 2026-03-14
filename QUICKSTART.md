# Upstream Pulse - Quick Start Guide

## Prerequisites

- Node.js 20+ installed
- Docker & Docker Compose installed
- GitHub Personal Access Token with `repo` and `read:org` scopes

## Quick Setup (Recommended)

```bash
# Clone and navigate
git clone https://github.com/dpanshug/upstream-pulse.git
cd upstream-pulse

# Create environment file
cp .env.example .env
```

Edit `.env` and add your credentials:
```bash
GITHUB_TOKEN=ghp_your_token_here
ORG_NAME=Your Organization Name
```

```bash
# Install dependencies (root + backend + frontend)
npm run install:all

# Start Postgres, Redis, API, and Frontend
npm run dev
```

This starts:
- **Postgres** on port 5433 (not 5432, to avoid local conflicts)
- **Redis** on port 6379
- **API server** on http://localhost:4321
- **Frontend** on http://localhost:5173

In a separate terminal, create the database tables (Postgres must be running first):

```bash
npm run db:migrate
```

This runs the SQL migration files to create all tables (`projects`, `team_members`, `contributions`, etc.) and indexes. You only need to run this once on initial setup, or again after pulling new migrations.

> **Note:** Workers are not started by `npm run dev`. To run background collection jobs,
> start the worker process separately (see [Start Workers](#start-workers) below).

## Verify It's Running

```bash
# Health check
curl http://localhost:4321/health

# Ready check (includes database)
curl http://localhost:4321/ready

# List projects (empty at first)
curl http://localhost:4321/api/projects
```

## Start Workers

In a separate terminal:

```bash
cd backend
npm run worker
```

This starts the BullMQ workers (contribution collection, governance, leadership, team sync) and the cron scheduler.

## Next Steps

### Seed Sample Data

To populate the database with sample projects and team members:

```bash
cd backend
npm run db:seed
```

### Add Your Team Members

Add team members via the API with their GitHub usernames. This enables identity resolution — contributions by these users will be counted as "team" contributions.

```bash
curl -X POST http://localhost:4321/api/team-members \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Doe", "githubUsername": "janedoe"}'
```

You can also sync members automatically from a GitHub org (requires `GITHUB_TEAM_TOKEN` with `read:org` scope):

```bash
curl -X POST http://localhost:4321/api/admin/team-sync
```

### Add Projects to Track

Add upstream repositories to track via the API. Setting `startCollection: true` immediately queues a full history collection.

```bash
curl -X POST http://localhost:4321/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "githubOrg": "org-name",
    "githubRepo": "repo-name",
    "startCollection": true
  }'
```

### Run Your First Collection

If you added a project with `startCollection: true`, the worker is already collecting data. Check progress at http://localhost:5173 (dashboard) or:

```bash
curl http://localhost:4321/api/system/status | jq '.recentJobs[:3]'
```

For existing projects, the daily sync runs automatically at 2 AM UTC. You can also trigger a manual collection:

```bash
curl -X POST http://localhost:4321/api/admin/collect \
  -H "Content-Type: application/json" \
  -d '{"projectId": "uuid-from-api-projects"}'
```

## Step-by-Step Setup (Manual)

If you prefer to start services individually instead of using `npm run dev`:

### 1. Start Database Services

```bash
docker-compose up -d postgres redis
```

Wait for services to be healthy:
```bash
docker-compose ps
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Run Database Migrations

```bash
npm run db:migrate
```

### 4. Start Backend Server

```bash
npm run dev    # This is the backend's dev script, not the root-level one
```

Backend should now be running on http://localhost:4321

### 5. Start Workers (in new terminal)

```bash
cd backend
npm run worker
```

### 6. Install and Start Frontend (in new terminal)

```bash
cd frontend
npm install
npm run dev
```

Frontend should now be running on http://localhost:5173

## Troubleshooting

### Database Connection Errors

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Restart if needed
docker-compose restart postgres
```

### Module Resolution Errors

Make sure you're using Node.js 20+ with ESM support:
```bash
node --version  # Should be v20.x.x or higher
```

### Port Already in Use

```bash
# Check what's using port 4321
lsof -i :4321

# Kill the process or change PORT in .env
PORT=4322
```

## Development Workflow

```bash
# Backend development (with hot reload)
cd backend
npm run dev

# Worker development (with hot reload)
cd backend
npm run worker

# Frontend development (with hot reload)
cd frontend
npm run dev

# Database studio (visual DB editor)
cd backend
npm run db:studio
```

## What to Read Next

- **[Architecture](docs/ARCHITECTURE.md)** — How the system works (data flow, schema, API reference)
- **[Workers & Jobs](docs/workers.md)** — Background job queues, schedules, and monitoring
- **[Adding an Org](docs/adding-an-org.md)** — How to add a new upstream org to track
- **[Contributing](CONTRIBUTING.md)** — Code contribution guidelines
