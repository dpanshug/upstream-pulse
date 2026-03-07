# Governance Model Support

This document describes how Upstream Pulse handles different open source governance models for tracking leadership roles.

## Supported Governance Models

Upstream Pulse supports three governance models, configured per-org in the [org registry](../backend/src/shared/config/org-registry.ts):

| Model | Format | Orgs |
|-------|--------|------|
| **OWNERS** | Kubernetes-style YAML | Kubeflow, KServe, kubernetes-sigs, Argo, Feast |
| **CODEOWNERS** | GitHub-native `path @owner` | vLLM, OpenVINO, Meta Llama, Ray, Caikit |
| **none** | No automated parsing | MLflow, Hugging Face, BerriAI, etc. |

---

## OWNERS Files (Kubernetes/Kubeflow Style)

Used by Kubernetes, CNCF, and Kubeflow-ecosystem projects.

### Format

```yaml
approvers:
  - alice
  - bob

reviewers:
  - dave
  - eve

emeritus_approvers:
  - former-maintainer
```

### Role Types

| Role | Description | Permissions |
|------|-------------|-------------|
| **Approver** | Can approve and merge PRs | Full write access, typically maintainers |
| **Reviewer** | Can review PRs | Review access, trusted contributors |
| **Emeritus Approver** | Former approver, now inactive | Historical record |

### How It Works

1. **Collection**: The `GitHubCollector` finds all OWNERS files in the repo tree via the Git API
2. **Aliases**: `OWNERS_ALIASES` files are resolved to expand team references
3. **Matching**: GitHub usernames are matched to team members in the database
4. **Storage**: Roles are stored in the `maintainer_status` table with `source: 'OWNERS_file'`

---

## CODEOWNERS Files (GitHub-Native)

Used by projects that rely on GitHub's native code ownership feature.

### Format

```
# Global owners
* @org/default-team

# Path-specific owners
/vllm/compilation/ @user1 @user2
/docs/ @user3
```

### Parsing Rules

- `@username` references are extracted and stored
- `@org/team` references are **skipped** (resolving team membership requires `read:org` scope on external orgs)
- Checks `.github/CODEOWNERS`, then root `CODEOWNERS`, then `docs/CODEOWNERS`
- Users are aggregated across all paths they own

### Storage

Entries are written to `maintainer_status` with:
- `positionType: 'maintainer'`
- `positionTitle: 'Code Owner'`
- `source: 'CODEOWNERS'`

---

## Org-Level Leadership

Beyond repo-level governance files, Upstream Pulse also tracks org-level leadership positions from community repositories (steering committees, TSCs, WG/SIG chairs).

### Data Sources

Leadership data is configured per-org via `communityRepo` in the org registry. Two parser types are available:

| Parser | Config Field | Format | Example |
|--------|-------------|--------|---------|
| **Markdown table** | `leadershipFiles[]` | Table with people + roles | Steering committee, TSC, maintainers |
| **WG/SIG YAML** | `wgFile` | YAML with `chairs:` + `tech_leads:` | Kubeflow WG/SIG structure |

### Markdown Table Parser

One parser handles two modes, controlled by the `positionType` field in config:

**Mode 1 — Uniform role** (`positionType` is set):
All rows get the same position type (e.g., `steering_committee`, `tsc_member`).

**Mode 2 — Role per row** (`positionType` is not set):
Reads role from each row's "Project Roles" / "Role" column.

The parser auto-detects column layout from the header row, finds GitHub usernames from `[username](url)` patterns, and handles Alumni/Emeritus sections.

### Leadership Collector

The `LeadershipCollector` class accepts an org config and dispatches to the appropriate parsers:

```typescript
const collector = new LeadershipCollector(githubOrg, communityRepoConfig);
const allPositions = await collector.getAllLeadershipPositions();
```

### Position Types

Position types are freeform strings — each org's terminology is preserved as-is:

| Position Type | Source | Example Orgs |
|---------------|--------|--------------|
| `steering_committee` | Markdown table | Kubeflow |
| `tsc_member` | Markdown table | KServe |
| `lead`, `maintainer` | Markdown table (role per row) | Argo, KServe |
| `wg_chair` | wgs.yaml | Kubeflow |
| `wg_tech_lead` | wgs.yaml | Kubeflow |
| `sig_chair` | wgs.yaml | Kubeflow |
| `sig_tech_lead` | wgs.yaml | Kubeflow |

### Leadership Worker

- **Queue**: `leadership-refresh`
- **Schedule**: Monthly (1st of month, 4 AM UTC), one job per org
- **Manual trigger**: `POST /api/leadership/refresh` (optional `githubOrg` body param)
- **Scoping**: Each job processes a single org; DB updates scoped by `communityOrg` column

---

## Database Schema

Leadership data is stored in two tables:

### `maintainer_status`

For repo-level roles (OWNERS/CODEOWNERS).

| Column | Description |
|--------|-------------|
| `project_id` | Repository being tracked |
| `team_member_id` | Team member (if matched) |
| `position_type` | maintainer, reviewer |
| `source` | `OWNERS_file` or `CODEOWNERS` |
| `is_active` | Whether the role is currently active |

### `leadership_positions`

For org-level positions (steering committee, TSC, WG chairs).

| Column | Description |
|--------|-------------|
| `community_org` | GitHub org slug (e.g., `kubeflow`, `kserve`) |
| `project_id` | null (org-wide positions) |
| `team_member_id` | Team member (if matched) |
| `github_username` | Always set (for external contributors too) |
| `position_type` | Freeform string (steering_committee, tsc_member, wg_chair, …) |
| `committee_name` | Group name (e.g., 'Kubeflow Steering Committee', 'WG Data') |
| `voting_rights` | Defaults to false |

---

## Configuration

### Governance Model Selection

Set `governanceModel` in the org registry:

```typescript
{ name: 'vLLM', githubOrg: 'vllm-project', governanceModel: 'codeowners' }
```

The governance worker dispatches to the correct parser based on this setting. If an org is not found in the registry, it defaults to `'owners'`.

### Leadership Collection

Configure `communityRepo` with `leadershipFiles` and/or `wgFile`:

```typescript
{
  communityRepo: {
    repo: 'community',
    defaultBranch: 'main',
    leadershipFiles: [
      { path: 'STEERING.md', groupName: 'Steering Committee', positionType: 'steering_committee' },
    ],
    wgFile: 'wgs.yaml',
  },
}
```

### API Endpoints

```bash
# Trigger governance refresh (OWNERS/CODEOWNERS) for all projects
curl -X POST http://localhost:3000/api/governance/refresh

# Trigger leadership refresh for a specific org
curl -X POST http://localhost:3000/api/leadership/refresh \
  -H 'Content-Type: application/json' \
  -d '{"githubOrg": "kubeflow"}'

# Get leadership data (included in dashboard)
curl http://localhost:3000/api/metrics/dashboard | jq '.leadership'

# List all configured orgs
curl http://localhost:3000/api/orgs
```

---

## Adding a New Org

See [docs/adding-an-org.md](adding-an-org.md) for a complete guide.

---

## Roadmap

- [x] Kubernetes/Kubeflow OWNERS support
- [x] CODEOWNERS support
- [x] Org-level steering committee tracking
- [x] Working Group chairs/leads tracking
- [x] Multi-org registry and configurable parsers
- [x] Per-org leadership display
- [ ] Apache MAINTAINERS support
- [ ] GitHub team/permission integration
- [ ] Historical leadership changes over time
- [ ] Resolve CODEOWNERS `@org/team` references
