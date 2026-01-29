# Governance Model Support

This document describes how Upstream Pulse handles different open source governance models for tracking leadership roles.

## Current Implementation: Kubernetes/Kubeflow OWNERS Files

The current implementation supports the **Kubernetes-style OWNERS file format**, which is used by:

- Kubernetes and all CNCF projects
- Kubeflow
- OpenShift
- Many other cloud-native projects

### OWNERS File Format

```yaml
# Example OWNERS file
approvers:
  - alice
  - bob
  - carol

reviewers:
  - dave
  - eve

emeritus_approvers:
  - former-maintainer
```

### Role Types

| Role                  | Description                   | Permissions                              |
| --------------------- | ----------------------------- | ---------------------------------------- |
| **Approver**          | Can approve and merge PRs     | Full write access, typically maintainers |
| **Reviewer**          | Can review PRs                | Review access, trusted contributors      |
| **Emeritus Approver** | Former approver, now inactive | Historical record                        |

### How It Works

1. **Collection**: The `OwnersCollector` fetches OWNERS files from tracked repos
2. **Parsing**: YAML is parsed to extract usernames and role types
3. **Matching**: GitHub usernames are matched to team members in the database
4. **Storage**: Roles are stored in the `maintainer_status` table

### API Endpoints

- `GET /api/leadership/summary` - Overall leadership statistics
- `GET /api/leadership/team` - Team members with leadership roles
- `POST /api/leadership/sync` - Trigger OWNERS file sync

---

## Future: Other Governance Models

Different open source communities use different governance structures. Here's a roadmap for future support:

### Apache Projects

Apache projects typically use:

- **MAINTAINERS** or **COMMITTERS** files
- PMC (Project Management Committee) membership via Apache's systems
- Different role hierarchy: Contributor → Committer → PMC Member

**Implementation approach**:

- Parse MAINTAINERS files (similar to OWNERS)
- Optionally integrate with Apache's public roster APIs

### Linux Foundation Projects

LF projects often use:

- **MAINTAINERS** file (Linux kernel style)
- **CODEOWNERS** for path-based ownership
- TSC (Technical Steering Committee) membership

**Implementation approach**:

- Parse MAINTAINERS with section-based format
- Parse CODEOWNERS for path-specific ownership

### GitHub-Native Projects

Projects without formal governance files:

- **CODEOWNERS** for automated review requests
- GitHub team permissions (admin, maintain, write)
- Repository collaborators list

**Implementation approach**:

- Parse CODEOWNERS files
- Use GitHub API to fetch team memberships and permissions

---

## Extensibility Architecture

The collector is designed for extensibility:

```typescript
// Future: GovernanceParser interface
interface GovernanceParser {
  detect(repo: Repository): Promise<boolean>;
  parse(repo: Repository): Promise<LeadershipRole[]>;
  getType(): GovernanceType;
}

// Implementations
class OwnersParser implements GovernanceParser { ... }
class MaintainersParser implements GovernanceParser { ... }
class CodeownersParser implements GovernanceParser { ... }
```

### Adding a New Governance Model

1. Create a new parser implementing the interface
2. Register it in the collector factory
3. Auto-detection will try parsers in order of prevalence

---

## Database Schema

Leadership data is stored in two tables:

### `maintainer_status`

For repo-level roles (approvers, reviewers, maintainers)

| Column           | Description                             |
| ---------------- | --------------------------------------- |
| `project_id`     | Repository being tracked                |
| `team_member_id` | Team member (if matched)                |
| `position_type`  | approver, reviewer, maintainer, etc.    |
| `source`         | OWNERS, MAINTAINERS, github_permissions |
| `is_active`      | Whether the role is currently active    |

### `leadership_positions`

For org-level positions (steering committee, working groups)

| Column           | Description                            |
| ---------------- | -------------------------------------- |
| `project_id`     | Organization/project                   |
| `team_member_id` | Team member                            |
| `position_type`  | steering_committee, working_group_lead |
| `committee_name` | Name of committee/WG                   |
| `voting_rights`  | Whether member has voting rights       |

---

## Configuration

To enable OWNERS collection, ensure:

1. `GITHUB_TOKEN` has read access to repository contents
2. Projects are added with `trackingEnabled: true`
3. Run sync via API or scheduled job

```bash
# Manual sync
curl -X POST http://localhost:3000/api/leadership/sync
```

---

## Roadmap

- [x] Kubernetes/Kubeflow OWNERS support
- [ ] CODEOWNERS support
- [ ] Apache MAINTAINERS support
- [ ] GitHub team/permission integration
- [ ] Org-level steering committee tracking
- [ ] Historical leadership changes over time
