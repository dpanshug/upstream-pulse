# Adding a New Upstream Organization

This guide walks through adding a new upstream open-source organization to Upstream Pulse.

All org configuration lives in a single file:

```
backend/src/shared/config/org-registry.ts
```

Adding a new org is a PR to this file. No other code changes are required unless the org uses a governance format that isn't already supported.

---

## 1. Check Supported Governance Formats

Before adding an org, confirm its governance format is already supported:

| Format | Example Orgs | Parser |
|--------|-------------|--------|
| **Markdown leadership tables** (steering committee, TSC, maintainers) | Kubeflow, KServe, Argo | `LeadershipCollector.parseLeadershipMarkdown()` |
| **WGs/SIGs YAML** (chairs + tech leads) | Kubeflow | `LeadershipCollector.fetchWorkingGroupLeadership()` |
| **OWNERS files** (Kubernetes-style) | Kubeflow, KServe, Kubernetes SIGs, Feast | `GitHubCollector` (governance worker) |
| **CODEOWNERS** (GitHub-native) | vLLM, Ray, OpenVINO, Meta Llama, Caikit | `CodeownersParser` |
| **None** | MLflow, Hugging Face, BerriAI | No governance collection |

If the org uses one of these formats, you can add it with config alone. If not, see [Adding a New Parser](#7-adding-a-new-parser-if-needed).

---

## 2. Add an Entry to the Org Registry

Open `backend/src/shared/config/org-registry.ts` and add an entry to the `ORG_REGISTRY` array.

### Minimal entry (no leadership collection)

For orgs where you only want contribution tracking, with no structured governance data:

```typescript
{
  name: 'NVIDIA',
  githubOrg: 'NVIDIA',
  governanceModel: 'none',
},
```

### Entry with CODEOWNERS governance

For orgs that use GitHub CODEOWNERS but have no separate community repo:

```typescript
{
  name: 'vLLM',
  githubOrg: 'vllm-project',
  governanceModel: 'codeowners',
},
```

### Entry with community repo and leadership files

For orgs with a dedicated community repo containing leadership data:

```typescript
{
  name: 'KServe',
  githubOrg: 'kserve',
  communityRepo: {
    repo: 'community',            // repo name (not full URL)
    defaultBranch: 'main',        // default branch
    leadershipFiles: [
      {
        path: 'TECHNICAL-STEERING-COMMITTEE.md',
        groupName: 'KServe TSC',
        positionType: 'tsc_member',  // uniform role for all rows
      },
      {
        path: 'MAINTAINERS.md',
        groupName: 'KServe',
        // positionType omitted → parser reads role from each row's "Role" column
      },
    ],
  },
  governanceModel: 'owners',
},
```

### Full entry with WG YAML and repo-to-WG mapping

For orgs with working groups/SIGs and a YAML file listing their leadership:

```typescript
{
  name: 'Kubeflow',
  githubOrg: 'kubeflow',
  communityRepo: {
    repo: 'community',
    defaultBranch: 'master',
    leadershipFiles: [
      {
        path: 'KUBEFLOW-STEERING-COMMITTEE.md',
        groupName: 'Kubeflow Steering Committee',
        positionType: 'steering_committee',
      },
    ],
    wgFile: 'wgs.yaml',
  },
  governanceModel: 'owners',
  repoToWorkingGroup: {
    'model-registry': ['WG Data'],
    'pipelines': ['WG Pipelines'],
    'trainer': ['WG Training'],
  },
},
```

---

## 3. Field Reference

### `UpstreamOrgConfig`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Human-readable display name (e.g. `'Kubeflow'`) |
| `githubOrg` | `string` | Yes | GitHub organization slug (e.g. `'kubeflow'`) |
| `governanceModel` | `'owners' \| 'codeowners' \| 'none'` | Yes | Which maintainer-file format this org uses at the repo level |
| `communityRepo` | `CommunityRepoConfig` | No | Community repo with leadership & WG data. Omit to skip leadership collection. |
| `repoToWorkingGroup` | `Record<string, string[]>` | No | Maps repo names to their owning working groups |

### `CommunityRepoConfig`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo` | `string` | Yes | Repo name (e.g. `'community'`) |
| `defaultBranch` | `string` | Yes | Default branch (e.g. `'main'` or `'master'`) |
| `leadershipFiles` | `LeadershipFileConfig[]` | No | Markdown files containing leadership tables |
| `wgFile` | `string` | No | YAML file listing WGs/SIGs with chairs and tech leads |

### `LeadershipFileConfig`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | Yes | Path relative to the community repo root (e.g. `'MAINTAINERS.md'`) |
| `groupName` | `string` | Yes | Human-readable group name (e.g. `'KServe TSC'`) |
| `positionType` | `string` | No | If set, all rows get this position type. If unset, the parser reads the role from each row's "Role" / "Project Roles" column. |

---

## 4. How It Works at Runtime

Once your entry is in the registry:

1. **Scheduler** (`scheduler.ts`) calls `getOrgsWithCommunityRepo()` and dispatches one `leadership-refresh` job per org that has a `communityRepo` configured.
2. **Leadership worker** receives the job with `githubOrg`, looks up the org config, instantiates `LeadershipCollector`, and stores results scoped by `communityOrg`.
3. **Governance worker** looks up `governanceModel` from the registry. For `'owners'` it parses OWNERS files; for `'codeowners'` it uses `CodeownersParser`; for `'none'` it skips.
4. **Metrics service** returns leadership data grouped per org in its `byOrg[]` array.
5. **Frontend** renders leadership sections dynamically per org.

---

## 5. Testing Locally

### Start the dev environment

```bash
docker-compose up -d postgres redis
cd backend && npm run dev
```

### Trigger a leadership refresh for your new org

```bash
curl -X POST http://localhost:4321/api/leadership/refresh \
  -H "Content-Type: application/json" \
  -d '{"githubOrg": "your-org-slug"}'
```

### Verify leadership data was collected

```bash
curl http://localhost:4321/api/metrics/overview | jq '.leadership.byOrg'
```

### Check the org registry endpoint

```bash
curl http://localhost:4321/api/orgs | jq '.[] | select(.githubOrg == "your-org-slug")'
```

### Verify governance data (OWNERS / CODEOWNERS)

Add a tracked project for the org, then trigger governance refresh:

```bash
# Add a project
curl -X POST http://localhost:4321/api/projects \
  -H "Content-Type: application/json" \
  -d '{"githubOrg": "your-org-slug", "githubRepo": "repo-name", "ecosystem": "your-ecosystem"}'

# Check maintainer_status table via Drizzle Studio
cd backend && npm run db:studio
```

---

## 6. Checklist Before Submitting Your PR

- [ ] Entry added to `ORG_REGISTRY` in `org-registry.ts`
- [ ] `governanceModel` is set correctly (`owners`, `codeowners`, or `none`)
- [ ] If the org has a community repo: `communityRepo` is configured with correct `repo`, `defaultBranch`, and leadership files
- [ ] If using `leadershipFiles`: verified that the markdown files exist in the community repo and contain pipe-delimited tables
- [ ] If using `wgFile`: verified that the YAML file exists and follows the expected `sigs`/`workinggroups` structure with `leadership.chairs`/`leadership.tech_leads`
- [ ] Tested locally with `POST /api/leadership/refresh` and verified data appears
- [ ] Projects listed in [docs/upstream-projects.md](upstream-projects.md) (add to "Planned" or "Currently Tracked" as appropriate)

---

## 7. Adding a New Parser (If Needed)

If the org's governance format isn't supported by existing parsers:

1. Create a new parser file under `backend/src/modules/collection/` (e.g. `my-format-parser.ts`).
2. The parser should accept `(org: string, repo: string)` and return a list of structured entries (usernames + roles).
3. Wire the parser into the appropriate worker:
   - For repo-level governance (like OWNERS/CODEOWNERS): integrate into `governance-worker.ts` and add a new `governanceModel` variant.
   - For org-level leadership (like community repo files): integrate into `LeadershipCollector` and use a new config field.
4. Add the new `governanceModel` value to the `UpstreamOrgConfig` interface.
5. Update this guide to document the new format.
