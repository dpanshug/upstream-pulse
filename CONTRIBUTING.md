# Contributing to Upstream Pulse

Thank you for your interest in contributing to Upstream Pulse! This document provides guidelines and information for contributors.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Issues

- Use [GitHub Issues](https://github.com/dpanshug/upstream-pulse/issues) to report bugs or request features
- Check existing issues before creating a new one
- Include steps to reproduce for bug reports
- Provide as much context as possible

### Submitting Changes

1. Fork the repository
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Make your changes following the coding standards below
4. Test your changes locally
5. Commit with clear, descriptive messages
6. Push to your fork and open a Pull Request

### Pull Request Guidelines

- Keep PRs focused and reasonably sized
- Describe what the PR does and why
- Reference any related issues
- Ensure the build passes before requesting review

## Development Setup

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### Getting Started

```bash
# Clone your fork
git clone https://github.com/your-username/upstream-pulse.git
cd upstream-pulse

# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Start services
docker-compose up -d postgres redis

# Install and run backend
cd backend
npm install
npm run db:migrate
npm run dev

# Install and run frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend + frontend concurrently |
| `npm run dev:backend` | Start backend only |
| `npm run dev:frontend` | Start frontend only |
| `npm run build` | Build both backend and frontend |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Drizzle Studio (DB GUI) |

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Prefer `const` over `let`; avoid `var`
- Use explicit return types for public functions

### Backend

- Use Fastify for HTTP routes
- Use Drizzle ORM for database queries
- Use Winston for logging
- Follow the existing module structure under `backend/src/modules/`

### Frontend

- Use React functional components with hooks
- Use TanStack Query for data fetching
- Use Tailwind CSS for styling
- Follow the component structure under `frontend/src/components/`

### Git Commit Messages

- Use present tense ("Add feature" not "Added feature")
- Keep the first line under 72 characters
- Reference issues when applicable (e.g., "Fix #123")

## Project Structure

```
upstream-pulse/
├── backend/              # Fastify API server + BullMQ workers
│   └── src/
│       ├── jobs/         # BullMQ job definitions and workers
│       ├── modules/      # Feature modules (api, collection, identity, etc.)
│       ├── scripts/      # Database seeds and utility scripts
│       └── shared/       # Config, database, types, utilities
├── frontend/             # React + Vite dashboard
│   └── src/
│       ├── components/   # Reusable UI components
│       └── pages/        # Route-level page components
├── deploy/               # OpenShift deployment manifests and scripts
└── docs/                 # Additional documentation
```

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
