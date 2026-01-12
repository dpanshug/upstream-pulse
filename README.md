# Upstream Pulse

**AI-Powered Upstream OSS Contribution Insights for Red Hat AI Organization**

Track and analyze your team's contributions across upstream open source communities with AI-powered insights.

## Overview

Upstream Pulse helps Red Hat AI Organization leadership answer critical questions:

- How are we showing up in upstream communities?
- Where do we have maintainer rights and leadership positions?
- What is our contribution percentage vs the overall community?
- Are we leaders, and what are the historic trends?

## Key Features

- Automated data collection from GitHub (commits, PRs, reviews, issues)
- Identity resolution mapping contributors to team members
- Leadership tracking for maintainer status and steering committee positions
- AI-powered insights using Google Gemini
- Executive dashboard with KPIs and trend visualizations

## Tech Stack

**Backend**: Node.js, TypeScript, Fastify, PostgreSQL, Redis, BullMQ, Drizzle ORM
**Frontend**: React, Vite, Tailwind CSS, shadcn/ui
**AI**: Google Gemini

## Tracked Communities

- **Kubernetes & CNCF**: kubernetes, kubeflow, istio, prometheus
- **LF AI & Data**: PyTorch, ONNX, Feast, Horovod
- **Python AI/ML**: scikit-learn, pandas, numpy, huggingface
- **ML Platforms**: Kubeflow, MLflow

## Quick Start

```bash
# Start development environment
docker-compose up -d

# Backend setup
cd backend
npm install
npm run db:migrate
npm run dev

# Frontend setup (in new terminal)
cd frontend
npm install
npm run dev
```

