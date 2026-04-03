/**
 * Deterministic test seed data.
 *
 * Fixed UUIDs, fixed dates, exact contribution counts — so integration tests
 * can assert precise outputs from MetricsService methods.
 *
 * Layout:
 *   2 orgs  — "testorg" (2 projects), "otherorg" (1 project)
 *   3 projects — proj-alpha, proj-beta (testorg), proj-gamma (otherorg)
 *   3 team members — alice, bob, carol
 *   Contributions split across "current" (last 30 days) and "previous" (30-60 days ago)
 *   Some contributions from external (non-team) contributors (teamMemberId = null)
 *   Maintainer statuses + leadership positions for governance tests
 */

import type { Sql } from 'postgres';

// ── Fixed UUIDs ──
export const IDS = {
  projAlpha:  '00000000-0000-0000-0000-000000000001',
  projBeta:   '00000000-0000-0000-0000-000000000002',
  projGamma:  '00000000-0000-0000-0000-000000000003',
  alice:      '00000000-0000-0000-0000-000000000101',
  bob:        '00000000-0000-0000-0000-000000000102',
  carol:      '00000000-0000-0000-0000-000000000103',
} as const;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export async function seedTestData(sql: Sql) {
  // Wipe tables in dependency order
  await sql.unsafe(`
    DELETE FROM contributions;
    DELETE FROM maintainer_status;
    DELETE FROM leadership_positions;
    DELETE FROM identity_mappings;
    DELETE FROM collection_jobs;
    DELETE FROM insights;
    DELETE FROM reports;
    DELETE FROM metrics_daily;
    DELETE FROM team_members;
    DELETE FROM projects;
  `);

  // ── Projects ──
  await sql`
    INSERT INTO projects (id, name, ecosystem, github_org, github_repo, primary_language, governance_type, tracking_enabled)
    VALUES
      (${IDS.projAlpha}, 'Project Alpha', 'cncf', 'testorg', 'alpha', 'Go', 'cncf', true),
      (${IDS.projBeta},  'Project Beta',  'cncf', 'testorg', 'beta',  'Go', 'cncf', true),
      (${IDS.projGamma}, 'Project Gamma', 'lfai', 'otherorg','gamma', 'Python', 'linux-foundation', true)
    ON CONFLICT DO NOTHING
  `;

  // ── Team members ──
  await sql`
    INSERT INTO team_members (id, name, github_username, department, role, is_active)
    VALUES
      (${IDS.alice}, 'Alice',  'alice-gh',  'Engineering', 'Senior', true),
      (${IDS.bob},   'Bob',    'bob-gh',    'Engineering', 'Staff',  true),
      (${IDS.carol}, 'Carol',  'carol-gh',  'ML Ops',     'Lead',   true)
    ON CONFLICT DO NOTHING
  `;

  // ── Contributions ──
  // Design: exact counts per type/project/period so tests can assert totals.
  //
  // Current period (days 1-15): within last 30 days
  // Previous period (days 35-50): for trend comparison
  //
  // Contribution summary (current period):
  //   proj-alpha, alice:  5 commits, 3 prs, 2 reviews, 1 issue  = 11
  //   proj-alpha, bob:    3 commits, 2 prs, 1 review,  0 issues =  6
  //   proj-alpha, null:   4 commits, 1 pr,  0 reviews, 2 issues =  7  (external)
  //   proj-beta,  carol:  2 commits, 1 pr,  3 reviews, 0 issues =  6
  //   proj-beta,  null:   1 commit,  0 prs, 0 reviews, 1 issue  =  2  (external)
  //   proj-gamma, alice:  3 commits, 1 pr,  1 review,  0 issues =  5
  //   proj-gamma, null:   2 commits, 1 pr,  0 reviews, 0 issues =  3  (external)
  //
  // Totals current period:
  //   team total = 11 + 6 + 6 + 5 = 28
  //   all  total = 28 + 7 + 2 + 3 = 40
  //
  // Previous period (simpler — used for trend %):
  //   proj-alpha, alice:  4 commits, 2 prs, 1 review, 1 issue = 8
  //   proj-alpha, null:   3 commits, 1 pr,  0 reviews, 1 issue = 5
  //   proj-gamma, bob:    2 commits, 1 pr,  0 reviews, 0 issues = 3
  //
  // Totals previous period:
  //   team total = 8 + 3 = 11
  //   all  total = 11 + 5 = 16

  const contribs: Array<{
    project_id: string;
    team_member_id: string | null;
    contribution_type: string;
    contribution_date: string;
    github_id: string;
  }> = [];

  let counter = 0;
  function addContribs(
    projectId: string,
    memberId: string | null,
    type: string,
    count: number,
    periodDaysAgoStart: number,
  ) {
    for (let i = 0; i < count; i++) {
      counter++;
      const dayOffset = periodDaysAgoStart + (i % 15);
      contribs.push({
        project_id: projectId,
        team_member_id: memberId,
        contribution_type: type,
        contribution_date: daysAgo(dayOffset),
        github_id: `test-${counter}`,
      });
    }
  }

  // Current period contributions (days 1-15)
  addContribs(IDS.projAlpha, IDS.alice, 'commit',  5, 1);
  addContribs(IDS.projAlpha, IDS.alice, 'pr',      3, 1);
  addContribs(IDS.projAlpha, IDS.alice, 'review',  2, 1);
  addContribs(IDS.projAlpha, IDS.alice, 'issue',   1, 1);
  addContribs(IDS.projAlpha, IDS.bob,   'commit',  3, 1);
  addContribs(IDS.projAlpha, IDS.bob,   'pr',      2, 1);
  addContribs(IDS.projAlpha, IDS.bob,   'review',  1, 1);
  addContribs(IDS.projAlpha, null,      'commit',  4, 1);
  addContribs(IDS.projAlpha, null,      'pr',      1, 1);
  addContribs(IDS.projAlpha, null,      'issue',   2, 1);

  addContribs(IDS.projBeta,  IDS.carol, 'commit',  2, 1);
  addContribs(IDS.projBeta,  IDS.carol, 'pr',      1, 1);
  addContribs(IDS.projBeta,  IDS.carol, 'review',  3, 1);
  addContribs(IDS.projBeta,  null,      'commit',  1, 1);
  addContribs(IDS.projBeta,  null,      'issue',   1, 1);

  addContribs(IDS.projGamma, IDS.alice, 'commit',  3, 1);
  addContribs(IDS.projGamma, IDS.alice, 'pr',      1, 1);
  addContribs(IDS.projGamma, IDS.alice, 'review',  1, 1);
  addContribs(IDS.projGamma, null,      'commit',  2, 1);
  addContribs(IDS.projGamma, null,      'pr',      1, 1);

  // Previous period contributions (days 35-50)
  addContribs(IDS.projAlpha, IDS.alice, 'commit',  4, 35);
  addContribs(IDS.projAlpha, IDS.alice, 'pr',      2, 35);
  addContribs(IDS.projAlpha, IDS.alice, 'review',  1, 35);
  addContribs(IDS.projAlpha, IDS.alice, 'issue',   1, 35);
  addContribs(IDS.projAlpha, null,      'commit',  3, 35);
  addContribs(IDS.projAlpha, null,      'pr',      1, 35);
  addContribs(IDS.projAlpha, null,      'issue',   1, 35);

  addContribs(IDS.projGamma, IDS.bob,   'commit',  2, 35);
  addContribs(IDS.projGamma, IDS.bob,   'pr',      1, 35);

  // Batch insert contributions
  for (const c of contribs) {
    await sql`
      INSERT INTO contributions (project_id, team_member_id, contribution_type, contribution_date, github_id)
      VALUES (${c.project_id}, ${c.team_member_id}, ${c.contribution_type}, ${c.contribution_date}, ${c.github_id})
      ON CONFLICT DO NOTHING
    `;
  }

  // ── Maintainer statuses ──
  await sql`
    INSERT INTO maintainer_status (project_id, team_member_id, github_username, position_type, position_title, is_active, source, scope)
    VALUES
      (${IDS.projAlpha}, ${IDS.alice}, 'alice-gh', 'maintainer', 'Approver',  true,  'OWNERS', 'root'),
      (${IDS.projAlpha}, ${IDS.bob},   'bob-gh',   'reviewer',   'Reviewer',  true,  'OWNERS', 'root'),
      (${IDS.projBeta},  ${IDS.carol}, 'carol-gh', 'maintainer', 'Approver',  true,  'OWNERS', 'component'),
      (${IDS.projAlpha}, null,         'ext-dev',  'reviewer',   'Reviewer',  true,  'OWNERS', 'root')
    ON CONFLICT DO NOTHING
  `;

  // ── Leadership positions ──
  await sql`
    INSERT INTO leadership_positions
      (project_id, team_member_id, github_username, community_org, position_type, committee_name, role_title, start_date, is_active, voting_rights)
    VALUES
      (${IDS.projAlpha}, ${IDS.alice}, 'alice-gh', 'testorg', 'steering_committee', 'Steering', 'Member', '2024-01-01', true, true),
      (${IDS.projGamma}, ${IDS.bob},   'bob-gh',   'otherorg','wg_chair',           'ML WG',    'Chair',  '2024-06-01', true, false)
    ON CONFLICT DO NOTHING
  `;
}
