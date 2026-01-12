# Upstream Pulse - Quick Start Guide

## Prerequisites

- Node.js 20+ installed
- Docker & Docker Compose installed
- GitHub Personal Access Token with `repo` and `read:org` scopes
- Google AI API key (Gemini)

## Initial Setup

### 1. Clone and Navigate

```bash
cd /Users/dipgupta/Documents/projects/upstream-pulse
```

### 2. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```bash
GITHUB_TOKEN=ghp_your_token_here
GOOGLE_AI_API_KEY=AIzaSy_your_key_here
```

### 3. Start Database Services

```bash
docker-compose up -d postgres redis
```

Wait for services to be healthy:
```bash
docker-compose ps
```

### 4. Install Backend Dependencies

```bash
cd backend
npm install
```

### 5. Run Database Migrations

```bash
npm run db:generate  # Generate migration files
npm run db:migrate   # Apply migrations
```

### 6. Start Backend Server

```bash
npm run dev
```

Backend should now be running on http://localhost:3000

### 7. Test Backend (in new terminal)

```bash
# Health check
curl http://localhost:3000/health

# Ready check (includes database)
curl http://localhost:3000/ready

# Get projects
curl http://localhost:3000/api/projects
```

### 8. Install Frontend Dependencies (optional)

```bash
cd ../frontend
npm install
```

### 9. Start Frontend (optional)

```bash
npm run dev
```

Frontend should now be running on http://localhost:5173

## Next Steps

### Seed Initial Data

You'll need to add:
1. **Team Members**: Red Hat AI team members to track
2. **Projects**: Upstream repositories to monitor

You can do this via:
- Direct database inserts (for now)
- API endpoints (to be implemented)
- Admin UI (to be implemented)

### Run Your First Collection

Once you have projects and team members configured, you can:
1. Implement the collection scheduler
2. Manually trigger a collection job
3. View results in the database

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
# Check what's using port 3000
lsof -i :3000

# Kill the process or change PORT in .env
PORT=3001
```

## What's Been Implemented

✅ **Backend Infrastructure**
- PostgreSQL database schema (11 tables)
- Drizzle ORM setup
- TypeScript configuration
- Fastify API server
- Health check endpoints
- WebSocket support

✅ **Core Modules**
- GitHub Collector (commits, PRs, reviews, issues)
- Identity Resolver (email matching, fuzzy matching)
- AI Insights Engine (Google Gemini integration)

✅ **Configuration**
- Environment management
- Logger (Winston)
- Type definitions

## What's Next

⏳ **To Implement**
- BullMQ job queue for scheduled collections
- Metrics calculation engine
- Frontend dashboard components
- Report generation
- Admin panel for configuration

## Development Workflow

```bash
# Backend development (with hot reload)
cd backend
npm run dev

# Frontend development (with hot reload)
cd frontend
npm run dev

# Database studio (visual DB editor)
cd backend
npm run db:studio
```

## Architecture Reference

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the complete system architecture and implementation plan.
