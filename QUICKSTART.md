# Upstream Pulse - Quick Start Guide

## Prerequisites

- Node.js 20+ installed
- Docker & Docker Compose installed
- GitHub Personal Access Token with `repo` and `read:org` scopes
- Google AI API key (Gemini)

## Initial Setup

### 1. Clone and Navigate

```bash
git clone https://github.com/dpanshug/upstream-pulse.git
cd upstream-pulse
```

### 2. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```bash
GITHUB_TOKEN=ghp_your_token_here
GOOGLE_AI_API_KEY=AIzaSy_your_key_here
ORG_NAME=Your Organization Name
TEAM_EMAIL_DOMAIN=your-company.com
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
npm run db:migrate
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

### 8. Start Workers (in new terminal)

```bash
cd backend
npm run worker
```

### 9. Install and Start Frontend (in new terminal)

```bash
cd frontend
npm install
npm run dev
```

Frontend should now be running on http://localhost:5173

## Next Steps

### Seed Sample Data

To populate the database with sample projects and team members:

```bash
cd backend
npm run db:seed
```

### Add Your Team Members

Add your organization's team members to the `team_members` table with their GitHub usernames. This enables identity resolution for contribution tracking.

### Add Projects to Track

Add upstream repositories to the `projects` table. Each project needs a GitHub org and repo name.

### Run Your First Collection

Once projects and team members are configured, the BullMQ workers will automatically collect contribution data on a schedule. You can also trigger collections manually through the API.

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
