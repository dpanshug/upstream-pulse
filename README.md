# Upstream Pulse

**Upstream Open Source Contribution Insights**

Track and analyze your organization's contributions across upstream open source communities.

## Overview

Upstream Pulse helps engineering leadership answer critical questions about their team's open source presence:

- How are we showing up in upstream communities?
- Where do we have maintainer rights and leadership positions?
- What is our contribution percentage vs the overall community?
- Are we leaders, and what are the historic trends?

## Key Features

- **Dual-Backend Data Collection** — Collect contributions from the GitHub API
  (default) or from a [CollectOSS/Augur](https://github.com/chaoss/CollectOSS)
  database. Each project can be toggled independently between backends.
- **Identity Resolution** mapping contributors to team members
- **Leadership Tracking** for maintainer status and steering committee positions
- **Executive Dashboard** with KPIs and trend visualizations

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Node.js, TypeScript, Fastify, PostgreSQL, Redis, BullMQ, Drizzle ORM |
| **Frontend** | React, Vite, Tailwind CSS, shadcn/ui |
| **Data Sources** | GitHub API (default), CollectOSS/Augur PostgreSQL (optional) |
| **Deployment** | Docker, OpenShift / Kubernetes |

## Getting Started

See the **[Quick Start Guide](QUICKSTART.md)** to get Upstream Pulse running locally.

## Documentation

See **[docs/](docs/)** for the full documentation index.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
