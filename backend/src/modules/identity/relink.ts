/**
 * Relink orphaned records to team members.
 *
 * Shared by every path that can create or change a member (bulk roster sync,
 * GitHub org sync, single-member create). Before this helper existed the same
 * three UPDATE statements were copy-pasted in three places, which is how the
 * bulk path and the worker path drifted apart: one relinked only on insert, the
 * other used a jsonb cast that throws on `\u0000`.
 *
 * Author login extraction
 * -----------------------
 * `contributions.metadata` is jsonb, and some rows hold a JSON *string*
 * containing JSON (double-encoded), which is why the old code used
 * `(metadata #>> '{}')::jsonb`. That re-parse fails on any row containing
 * `\u0000`, because jsonb cannot represent it — and the failure was swallowed,
 * so the relink silently did nothing for the whole batch.
 *
 * The expression below never parses JSON, so a `\u0000` row cannot abort it:
 *
 *   - jsonb *string*: `#>> '{}'` returns the inner text with escapes resolved,
 *     giving `{"author":"login"}`; all rows in production are this shape today.
 *   - jsonb *object*: `::text` gives the same shape.
 *
 * Both branches are then split on `"author":"`, which relies on PostgreSQL's
 * canonical jsonb text output (no whitespace). Handling both shapes matters:
 * the writer double-encodes today, but a driver or drizzle upgrade could switch
 * it to a plain object and silently break the relink again.
 */

import { sql } from 'drizzle-orm';

type Db = typeof import('../../shared/database/client.js').db;

export interface RelinkCounts {
  contributions: number;
  maintainerStatus: number;
  leadershipPositions: number;
}

export interface RelinkResult extends RelinkCounts {
  total: number;
  errors: Array<{ table: string; message: string }>;
}

function rowCount(result: unknown): number {
  const r = result as { rowCount?: number | null; count?: number | null };
  return r?.rowCount ?? r?.count ?? 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One row per lowercase GitHub username, used as the join target for the relink
 * statements.
 *
 * `team_members.github_username` is not unique (only `github_user_id` and
 * `primary_email` are), so `UPDATE ... FROM team_members` could match the same
 * orphaned row twice and let PostgreSQL choose arbitrarily which member wins.
 * That would silently attach a departed person's history to a duplicate row, or
 * the other way round. Deduplicating here makes the choice deterministic:
 * prefer the active member, then the oldest record.
 */
const identityTargets = sql`
  SELECT DISTINCT ON (lower(github_username))
         id, lower(github_username) AS username
  FROM team_members
  WHERE github_username IS NOT NULL
  ORDER BY lower(github_username), is_active DESC, created_at ASC
`;

/**
 * Link every orphaned contribution, governance role and leadership position to
 * the member whose GitHub login matches.
 *
 * Runs across all members (not just new ones) so a username correction or a
 * previously failed relink self-heals on the next run. Inactive members are
 * included on purpose: history stays attributed after someone departs.
 *
 * Each table is attempted independently; one failure does not prevent the
 * others, and the failures are reported to the caller instead of swallowed.
 */
export async function relinkOrphanedRecords(db: Db): Promise<RelinkResult> {
  const result: RelinkResult = {
    contributions: 0,
    maintainerStatus: 0,
    leadershipPositions: 0,
    total: 0,
    errors: [],
  };

  try {
    result.contributions = rowCount(await db.execute(sql`
      UPDATE contributions c
      SET team_member_id = m.id
      FROM (${identityTargets}) m
      WHERE c.team_member_id IS NULL
        AND lower(split_part(split_part(
              case when jsonb_typeof(c.metadata) = 'string'
                   then c.metadata #>> '{}'
                   else c.metadata::text
              end,
              '"author":"', 2), '"', 1))
            = m.username
    `));
  } catch (error) {
    result.errors.push({ table: 'contributions', message: errorMessage(error) });
  }

  try {
    result.maintainerStatus = rowCount(await db.execute(sql`
      UPDATE maintainer_status ms
      SET team_member_id = m.id
      FROM (${identityTargets}) m
      WHERE ms.team_member_id IS NULL
        AND ms.github_username IS NOT NULL
        AND lower(ms.github_username) = m.username
    `));
  } catch (error) {
    result.errors.push({ table: 'maintainer_status', message: errorMessage(error) });
  }

  try {
    result.leadershipPositions = rowCount(await db.execute(sql`
      UPDATE leadership_positions lp
      SET team_member_id = m.id
      FROM (${identityTargets}) m
      WHERE lp.team_member_id IS NULL
        AND lp.github_username IS NOT NULL
        AND lower(lp.github_username) = m.username
    `));
  } catch (error) {
    result.errors.push({ table: 'leadership_positions', message: errorMessage(error) });
  }

  result.total = result.contributions + result.maintainerStatus + result.leadershipPositions;
  return result;
}

/**
 * Link orphaned records for one specific member.
 *
 * Used when a single member is created through the admin API. Scoped by member
 * id so it stays fast, and null-byte safe for the same reason as
 * `relinkOrphanedRecords`.
 */
export async function relinkForMember(
  db: Db,
  memberId: string,
  githubUsername: string
): Promise<RelinkCounts & { errors: RelinkResult['errors'] }> {
  const result = {
    contributions: 0,
    maintainerStatus: 0,
    leadershipPositions: 0,
    errors: [] as RelinkResult['errors'],
  };

  try {
    result.contributions = rowCount(await db.execute(sql`
      UPDATE contributions
      SET team_member_id = ${memberId}
      WHERE team_member_id IS NULL
        AND lower(split_part(split_part(
              case when jsonb_typeof(metadata) = 'string'
                   then metadata #>> '{}'
                   else metadata::text
              end,
              '"author":"', 2), '"', 1))
            = lower(${githubUsername})
    `));
  } catch (error) {
    result.errors.push({ table: 'contributions', message: errorMessage(error) });
  }

  try {
    result.maintainerStatus = rowCount(await db.execute(sql`
      UPDATE maintainer_status
      SET team_member_id = ${memberId}
      WHERE team_member_id IS NULL
        AND lower(github_username) = lower(${githubUsername})
    `));
  } catch (error) {
    result.errors.push({ table: 'maintainer_status', message: errorMessage(error) });
  }

  try {
    result.leadershipPositions = rowCount(await db.execute(sql`
      UPDATE leadership_positions
      SET team_member_id = ${memberId}
      WHERE team_member_id IS NULL
        AND lower(github_username) = lower(${githubUsername})
    `));
  } catch (error) {
    result.errors.push({ table: 'leadership_positions', message: errorMessage(error) });
  }

  return result;
}
