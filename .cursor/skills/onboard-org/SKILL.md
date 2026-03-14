---
name: onboard-org
description: Onboards a new upstream organization into Upstream Pulse — researches the org's governance and repos, adds to org-registry.ts, creates projects via API, verifies collection/leadership/governance data, checks dashboard, and updates docs. Use when asked to add, onboard, or track a new upstream org.
---

# Onboard a New Upstream Organization

Follow these steps in order when asked to add or onboard a new upstream org.

## Step 1: Research the Org

Before adding anything, investigate:

- Does the org have a community repo? (e.g., `orgname/community`) — check GitHub.
- What governance format? OWNERS files, CODEOWNERS, or neither? **Check each repo individually** — repos within an org often differ.
- If a community repo exists, what leadership files are available? (steering/TSC markdown, maintainers markdown, WGs/SIGs YAML or markdown)
- What repos should be tracked? Check `docs/upstream-projects.md` and the `opendatahub-io` fork list.
- **Team contributions** — fetch the team members list from `GET /api/team-members`, then for each candidate repo use `gh api "repos/{org}/{repo}/contributors?per_page=100"` to get contributors and cross-reference against the team list. Only track repos where team members appear in the top 100 contributors. For borderline cases, check PR counts with `gh api "search/issues?q=repo:{org}/{repo}+type:pr+author:{username}"`.

### Leadership & Governance Deep Check (DO NOT SKIP)

Do not just check if governance files exist — **read the actual file content** and verify our parsers can handle the format. If they can't, implement parser support now. Do not defer to a future issue.

1. **Read the files** — fetch and read `MAINTAINERS.md`, `GOVERNANCE.md`, `SIGS.md`, `OWNERS`, `CODEOWNERS` etc. from GitHub.
2. **Verify format compatibility** — check the parser code in `backend/src/modules/collection/leadership-collector.ts` to confirm it can parse this org's file format. Don't assume — read the parser and compare against the actual file. Specifically verify that column names in markdown tables match what the parser looks for (`name`/`maintainer`/`member`, `github`/`github id`, `project roles`/`role`, `organization`/`affiliation`/`company`).
3. **SIG/WG files** — if the org has SIGs or WGs, check the parser code to see which formats are supported. YAML files use `wgFile` config. Markdown files go in `leadershipFiles` with the appropriate `format` field (e.g., `format: 'sig_sections'` for blockquote-style leadership). If the format doesn't match any existing parser, add support.
4. **Multiple leadership files** — some orgs have separate files for steering, TSC, maintainers. Add each to `leadershipFiles` array with appropriate `positionType`.
5. **If format is unsupported** — implement the parser as part of this onboarding. Do not skip leadership data.
6. **Alumni/Emeritus sections** — the parser auto-detects `## Alumni` or `## Emeritus` headings and marks those entries as inactive. Verify the org's file uses one of these headings if it has former members listed.

## Step 2: Add to Org Registry

Edit `backend/src/shared/config/org-registry.ts` and add an entry to `ORG_REGISTRY`.

Key fields:

- `governanceModel`: `'owners'` if repo has OWNERS files, `'codeowners'` if .github/CODEOWNERS, `'none'` if neither. Set to the **dominant model** for the tracked repos.
- `repoGovernanceOverride`: if repos use **different** governance models, specify per-repo overrides. Repos not listed fall back to the org-level `governanceModel`. Example: `{ 'ramalama': 'codeowners', 'ai-lab-recipes': 'none' }`. Repos with `'none'` skip governance entirely.
- `communityRepo`: set if the org has leadership files to parse. Can be any repo containing leadership data (e.g., `containers` uses `podman` since that's where `MAINTAINERS.md` lives).
- `leadershipFiles`: for each markdown file with leadership data:
  - Set `positionType` if everyone in the file has the same role (e.g., TSC members).
  - Leave `positionType` unset if roles vary per row.
- `repoToWorkingGroup`: only needed if the org has WGs and you want project-level leadership filtering.

## Step 3: Add Projects via API

The backend container does **not** have `curl`. Use `node -e` with `fetch()`.

```bash
oc exec -n upstream-pulse deploy/backend -- node -e "
const projects = [
  {name:'Display Name', githubOrg:'org-name', githubRepo:'repo-name', ecosystem:'org-name', primaryLanguage:'Go', startCollection:true},
];
(async()=>{
  for(const p of projects){
    const r = await fetch('http://127.0.0.1:3000/api/projects', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(p)
    });
    const d = await r.json();
    console.log(r.status, p.name, JSON.stringify(d).slice(0,120));
  }
})();
"
```

A `409` response means the project already exists.

## Step 4: Verify Collection

Check contribution counts via DB query:

```bash
oc exec -n upstream-pulse deploy/postgres -- psql -U postgres -d upstream_pulse \
  -c "SELECT p.name, p.github_org || '/' || p.github_repo as repo, COUNT(c.id) as contributions FROM projects p LEFT JOIN contributions c ON p.id = c.project_id WHERE p.github_org = '<org-name>' GROUP BY p.id, p.name, p.github_org, p.github_repo ORDER BY contributions DESC;"
```

If contributions are 0 and sync jobs aren't running, check if `startCollection: true` was set. If not, trigger manually:

```bash
oc exec -n upstream-pulse deploy/backend -- node -e "
fetch('http://127.0.0.1:3000/api/admin/collect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId: '<id>', fullHistory: true })
}).then(r=>r.text()).then(console.log)
"
```

## Step 5: Verify Leadership

```bash
oc exec -n upstream-pulse deploy/postgres -- psql -U postgres -d upstream_pulse \
  -c "SELECT community_org, position_type, COUNT(*) FROM leadership_positions WHERE community_org = '<org-name>' AND is_active = true GROUP BY community_org, position_type;"
```

If no leadership data, trigger manually:

```bash
oc exec -n upstream-pulse deploy/backend -- node -e "
fetch('http://127.0.0.1:3000/api/leadership/refresh', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ githubOrg: '<org-name>' })
}).then(r=>r.text()).then(console.log)
"
```

## Step 6: Verify Governance

```bash
oc exec -n upstream-pulse deploy/postgres -- psql -U postgres -d upstream_pulse \
  -c "SELECT p.name, ms.position_type, ms.source, COUNT(*) FROM maintainer_status ms JOIN projects p ON ms.project_id = p.id WHERE p.github_org = '<org-name>' AND ms.is_active = true GROUP BY p.name, ms.position_type, ms.source;"
```

If using `repoGovernanceOverride`, verify each repo used the correct source (OWNERS_file vs CODEOWNERS) and repos with `'none'` have no entries.

## Step 7: Check Dashboard

Verify the dashboard shows the new org's data:

- Contributions appear in the project cards.
- Leadership section shows per-org positions (if community repo configured).
- OWNERS/CODEOWNERS roles appear in governance section.
- Open individual project detail pages and verify project name and GitHub repo link display correctly.

## Step 8: Update Docs

Update `docs/upstream-projects.md`:

- Add the org section under "Currently Tracked" with a table of repos.
- Document the governance setup (leadership source, OWNERS/CODEOWNERS, per-repo overrides).
- Update the summary table totals.

## Common Issues

- **No contributions collected**: Check `startCollection: true`. If not set, trigger via `POST /api/admin/collect`.
- **Leadership empty**: Org may not have a `communityRepo` in the registry, or the parser doesn't match the file format.
- **CODEOWNERS empty**: Parser only handles `@username`, skips `@org/team` references.
- **Repo not found**: Verify the GitHub org/repo exists and is public.
- **Mixed governance**: Use `repoGovernanceOverride` for per-repo models. Do not change worker logic.
- **Incomplete PRs/issues after crash**: Worker marks interrupted jobs as failed but does NOT re-queue them. When re-triggering, **always use `fullHistory: true`** — otherwise the collector defaults to `lastSyncAt` or 30-day lookback, skipping historical data.
