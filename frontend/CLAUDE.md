# Frontend

React 18 SPA dashboard with Vite bundler.

## Stack

- **Framework**: React 18 with functional components and hooks
- **Bundler**: Vite 5
- **Routing**: React Router v6
- **Data fetching**: TanStack React Query v5
- **Charts**: Recharts
- **Styling**: Tailwind CSS 3, `clsx`, `tailwind-merge`, `class-variance-authority`
- **Icons**: Lucide React
- **Validation**: Zod (shared with backend)

## Project Layout

```
src/
  pages/                  # Route-level components
    Dashboard.tsx         # Main dashboard view
    Organizations.tsx     # Org listing
    OrganizationDetail.tsx
    Projects.tsx          # Project listing
    ProjectDetail.tsx
    Contributors.tsx      # Contributor directory
    MyContributions.tsx   # Current user's contributions
    SystemStatus.tsx      # Admin system health
    About.tsx
  components/
    layout/               # App shell, navigation, sidebar
    dashboard/            # Dashboard-specific components (StatCard, charts)
    admin/                # Admin-only components
    common/               # Shared components
    ui/                   # Primitive UI components (buttons, cards, inputs)
  context/                # React context providers
  lib/
    api.ts                # API client (fetch wrapper for backend)
```

## Conventions

- Functional components only — no class components
- Use React Query for all server state — no manual `useEffect` + `fetch`
- Keep components focused: extract hooks for complex logic
- Tailwind utility classes for styling — no CSS modules or styled-components
- `clsx()` and `tailwind-merge` for conditional class composition
- Pages are lazy-loaded via React Router
