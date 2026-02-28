# Upstream Pulse

**Upstream Open Source Contribution Insights**

Track and analyze your organization's contributions across upstream open source communities with automated, data-driven insights.

## Overview

Upstream Pulse helps engineering leadership answer critical questions about their team's open source presence:

- How are we showing up in upstream communities?
- Where do we have maintainer rights and leadership positions?
- What is our contribution percentage vs the overall community?
- Are we leaders, and what are the historic trends?

## Key Features

- **Automated Data Collection** from GitHub (commits, PRs, reviews, issues)
- **Identity Resolution** mapping contributors to team members
- **Leadership Tracking** for maintainer status and steering committee positions
- **Automated Insights** with optional Google Gemini integration for trend analysis
- **Executive Dashboard** with KPIs and trend visualizations

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Node.js, TypeScript, Fastify, PostgreSQL, Redis, BullMQ, Drizzle ORM |
| **Frontend** | React, Vite, Tailwind CSS, shadcn/ui |
| **Insights** | Google Gemini (optional) |
| **Deployment** | Docker, OpenShift / Kubernetes |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- GitHub Personal Access Token with `repo` and `read:org` scopes
- Google Gemini API key (optional — needed only for automated insight generation)

### Setup

```bash
# Clone the repository
git clone https://github.com/dpanshug/upstream-pulse.git
cd upstream-pulse

# Create environment file
cp .env.example .env
# Edit .env with your credentials (GitHub token, optional Gemini key, etc.)

# Install all dependencies
npm run install:all

# Run database migrations
npm run db:migrate

# Start everything (infra + backend + frontend)
npm run dev           # Postgres on :5433, API on :4321, UI on :5173
```

> **Note:** `npm run dev` starts Postgres and Redis via Docker, then launches the
> backend API server and frontend dev server concurrently. Postgres is exposed on
> port **5433** (not the default 5432) to avoid conflicts with any local Postgres
> installation.
>
> To develop against an OpenShift cluster database instead, use `npm run dev:cluster`.

See [QUICKSTART.md](QUICKSTART.md) for a more detailed walkthrough.

## Configuration

All configuration is done via environment variables. See [.env.example](.env.example) for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub PAT for collecting contribution data |
| `GOOGLE_AI_API_KEY` | Google Gemini API key (optional — enables automated insight generation) |
| `ORG_NAME` | Your organization name (used in reports and insight generation) |
| `TEAM_EMAIL_DOMAIN` | Email domain for team member matching (e.g. `example.com`) |
| `GITHUB_TEAM_ORG` | GitHub org for team member sync |

## Deployment

OpenShift / Kubernetes manifests are provided under `deploy/openshift/`. See `deploy/deploy.sh` for the deployment workflow:

```bash
# Set required env vars
export PUSH_REGISTRY=your-registry.example.com
export DEPLOY_REGISTRY=image-registry.openshift-image-registry.svc:5000

# Full deploy (build + push + apply)
./deploy/deploy.sh deploy
```

## Documentation

- [Quick Start Guide](QUICKSTART.md)
- [GitHub API Scaling](docs/github-api-scaling.md)
- [Governance Models](docs/governance-models.md)
- [Workers](docs/workers.md)

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
