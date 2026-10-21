import type postgres from 'postgres';
import { getCollectossClient } from '../../shared/database/collectoss-client.js';
import { collectossTable } from './collectoss-repo-resolver.js';
import { logger } from '../../shared/utils/logger.js';
import type {
  CollectionPhase,
  CollectionPhaseCallback,
  CollectionProgressCallback,
  ContributionRecord,
} from '../../shared/types/index.js';

export interface CollectossProject {
  name: string;
  githubOrg: string;
  githubRepo: string;
}

/**
 * Which CollectOSS rows to read.
 *
 * - `since`: only contributions whose own date (commit authored, PR/issue
 *   created, review submitted) is on/after this date. Used for full-history
 *   and explicit date-range syncs.
 * - `collectedAfter`: only rows CollectOSS inserted (or, for PRs/issues,
 *   updated) after this timestamp. Used for incremental syncs — CollectOSS
 *   refreshes in batches (weekly), so filtering on contribution date alone
 *   would permanently miss anything it collected late.
 *
 * Both may be combined; omitting both reads everything for the repo.
 */
export interface CollectossWindow {
  since?: Date;
  collectedAfter?: Date;
}

export interface CollectossCollectResult {
  /** Records handed to onPhaseComplete */
  collected: number;
  /** Max data_collection_date for the repo when collection started — the next incremental cursor */
  highWaterMark: Date | null;
}

export interface CollectossCounts {
  commits: number;
  prs: number;
  reviews: number;
  issues: number;
}

type Sql = postgres.Sql;
type Flush = (records: ContributionRecord[]) => Promise<void>;

const PAGE_SIZE = 1000;

/** Facade's marker for merge commits (it records one row with this filename and no diff). */
const MERGE_COMMIT_FILENAME = '(Merge commit)';

/** Placeholder logins CollectOSS uses when the forge did not provide a user. */
const PLACEHOLDER_LOGINS = new Set(['not-provided', 'nan', 'nobody', 'ghost']);

function login(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || PLACEHOLDER_LOGINS.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

function lower(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value.toLowerCase() : undefined;
}

function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * CollectOSS adapter — reads contributions for one repo from a CollectOSS
 * (formerly Augur) PostgreSQL database and emits the same ContributionRecord
 * shape as GitHubCollector, so both backends feed the `contributions` table
 * identically.
 *
 * ID parity with GitHubCollector (so switching backends never duplicates rows):
 *   commit → commit SHA, pr → PR number, review → GitHub review databaseId,
 *   issue → issue number.
 *
 * Schema verified against chaoss/collectoss `collectoss/application/db/models/data.py`
 * and the sample DB `ghcr.io/oss-aspen/sample-collected-data`. All CollectOSS
 * SQL lives in this file (plus the repo resolver) so schema changes are contained.
 */
export class CollectossAdapter {
  private readonly sql: Sql;

  constructor(sql?: Sql) {
    const client = sql ?? getCollectossClient();
    if (!client) {
      throw new Error('CollectOSS is not configured (COLLECTOSS_DATABASE_URL is empty)');
    }
    this.sql = client;
  }

  /**
   * Collect all requested contribution types for a repo.
   * Mirrors GitHubCollector.collectRepositoryContributions(): records are
   * streamed to onPhaseComplete page by page.
   */
  async collectRepositoryContributions(
    project: CollectossProject,
    repoId: number,
    window: CollectossWindow,
    onProgress?: CollectionProgressCallback,
    onPhaseComplete?: CollectionPhaseCallback,
    phases?: CollectionPhase[],
  ): Promise<CollectossCollectResult> {
    const allPhases = phases ?? ['commits', 'pull_requests', 'reviews', 'issues'];
    const repoUrl = `https://github.com/${project.githubOrg}/${project.githubRepo}`;
    let collected = 0;

    // Capture the cursor *before* reading so rows inserted mid-run are picked up next time.
    const highWaterMark = await this.getHighWaterMark(repoId);

    logger.info(`CollectOSS: collecting ${project.githubOrg}/${project.githubRepo} (repo_id=${repoId})`, {
      phases: allPhases,
      since: window.since?.toISOString(),
      collectedAfter: window.collectedAfter?.toISOString(),
    });

    const makeFlush = (phase: CollectionPhase): Flush => async (records) => {
      if (records.length === 0) return;
      collected += records.length;
      onProgress?.({ phase, collected });
      if (onPhaseComplete) await onPhaseComplete(phase, records);
    };

    if (allPhases.includes('commits')) {
      onProgress?.({ phase: 'commits', collected });
      await this.collectCommits(repoId, window, repoUrl, makeFlush('commits'));
    }
    if (allPhases.includes('pull_requests')) {
      onProgress?.({ phase: 'pull_requests', collected });
      await this.collectPullRequests(repoId, window, repoUrl, makeFlush('pull_requests'));
    }
    if (allPhases.includes('reviews')) {
      onProgress?.({ phase: 'reviews', collected });
      await this.collectReviews(repoId, window, repoUrl, makeFlush('reviews'));
    }
    if (allPhases.includes('issues')) {
      onProgress?.({ phase: 'issues', collected });
      await this.collectIssues(repoId, window, repoUrl, makeFlush('issues'));
    }

    onProgress?.({ phase: 'done', collected });
    logger.info(`CollectOSS: collected ${collected} contributions for ${project.githubOrg}/${project.githubRepo}`);
    return { collected, highWaterMark };
  }

  /**
   * Count contributions CollectOSS holds for a repo with the same filters the
   * adapter applies (merge commits excluded, PRs excluded from issues, etc.).
   * Used to validate CollectOSS coverage against GitHub-collected data.
   */
  async countContributions(repoId: number, since?: Date): Promise<CollectossCounts> {
    const sql = this.sql;
    const sinceFilter = (col: postgres.PendingQuery<postgres.Row[]>) => since ? sql`AND ${col} >= ${since}` : sql``;

    const [row] = await sql<{ commits: string; prs: string; reviews: string; issues: string }[]>`
      SELECT
        (SELECT count(*) FROM (
          SELECT 1 FROM ${collectossTable(sql, 'commits')} c
          WHERE c.repo_id = ${repoId} ${sinceFilter(sql`c.cmt_author_timestamp`)}
          GROUP BY c.cmt_commit_hash
          HAVING NOT bool_or(c.cmt_filename = ${MERGE_COMMIT_FILENAME})
        ) x) AS commits,
        (SELECT count(*) FROM ${collectossTable(sql, 'pull_requests')} pr
          WHERE pr.repo_id = ${repoId} ${sinceFilter(sql`pr.pr_created_at`)}) AS prs,
        (SELECT count(*) FROM ${collectossTable(sql, 'pull_request_reviews')} r
          JOIN ${collectossTable(sql, 'pull_requests')} pr ON pr.pull_request_id = r.pull_request_id
          WHERE pr.repo_id = ${repoId}
            AND r.pr_review_submitted_at IS NOT NULL
            AND upper(coalesce(r.pr_review_state, '')) <> 'PENDING'
            ${sinceFilter(sql`r.pr_review_submitted_at`)}) AS reviews,
        (SELECT count(*) FROM ${collectossTable(sql, 'issues')} i
          WHERE i.repo_id = ${repoId} AND i.pull_request IS NULL
            ${sinceFilter(sql`i.created_at`)}) AS issues
    `;

    return {
      commits: Number(row?.commits ?? 0),
      prs: Number(row?.prs ?? 0),
      reviews: Number(row?.reviews ?? 0),
      issues: Number(row?.issues ?? 0),
    };
  }

  // ── Internals ───────────────────────────────────────────────────

  private async getHighWaterMark(repoId: number): Promise<Date | null> {
    const sql = this.sql;
    const [row] = await sql<{ hwm: Date | null }[]>`
      SELECT greatest(
        (SELECT max(data_collection_date) FROM ${collectossTable(sql, 'commits')} WHERE repo_id = ${repoId}),
        (SELECT max(data_collection_date) FROM ${collectossTable(sql, 'pull_requests')} WHERE repo_id = ${repoId}),
        (SELECT max(r.data_collection_date) FROM ${collectossTable(sql, 'pull_request_reviews')} r
          JOIN ${collectossTable(sql, 'pull_requests')} pr ON pr.pull_request_id = r.pull_request_id
          WHERE pr.repo_id = ${repoId}),
        (SELECT max(data_collection_date) FROM ${collectossTable(sql, 'issues')} WHERE repo_id = ${repoId})
      ) AS hwm
    `;
    return row?.hwm ? new Date(row.hwm) : null;
  }

  /**
   * Commits. CollectOSS (Facade) stores one row per file per commit, so rows
   * are grouped by SHA and line stats summed. Facade marks merge commits with
   * a single `(Merge commit)` row — those are skipped to match GitHubCollector.
   * Date = author timestamp (GitHubCollector uses commit.author.date).
   * Keyset-paginated on SHA (index: repo_id, cmt_commit_hash).
   *
   * Author = contributors.cntrb_login via cmt_ght_author_id (the canonical,
   * actively maintained identity). cmt_author_platform_username is only a
   * fallback: CollectOSS maintainers note it is not reliably populated and it
   * is proposed for removal (chaoss/CollectOSS#215).
   *
   * Upcoming CollectOSS rename: cmt_ght_author_id (and pr_augur_contributor_id
   * below) are slated to lose their legacy names (chaoss/CollectOSS#513).
   * When that ships, update the column names here and in REQUIRED_COLUMNS
   * (collectoss-health.ts); the health check reports them as missing until then.
   */
  private async collectCommits(repoId: number, window: CollectossWindow, repoUrl: string, flush: Flush): Promise<void> {
    const sql = this.sql;
    let after = '';

    for (;;) {
      const rows = await sql<{
        sha: string;
        authored_at: Date;
        lines_added: string | null;
        lines_removed: string | null;
        files_changed: string;
        platform_username: string | null;
        author_email: string | null;
        author_id: string | null;
      }[]>`
        SELECT
          c.cmt_commit_hash AS sha,
          min(c.cmt_author_timestamp) AS authored_at,
          sum(c.cmt_added) AS lines_added,
          sum(c.cmt_removed) AS lines_removed,
          count(*) FILTER (WHERE c.cmt_filename <> '') AS files_changed,
          max(c.cmt_author_platform_username) AS platform_username,
          max(c.cmt_author_raw_email) AS author_email,
          max(c.cmt_ght_author_id::text) AS author_id
        FROM ${collectossTable(sql, 'commits')} c
        WHERE c.repo_id = ${repoId}
          AND c.cmt_commit_hash > ${after}
          ${window.since ? sql`AND c.cmt_author_timestamp >= ${window.since}` : sql``}
          ${window.collectedAfter ? sql`AND c.data_collection_date > ${window.collectedAfter}` : sql``}
        GROUP BY c.cmt_commit_hash
        HAVING NOT bool_or(c.cmt_filename = ${MERGE_COMMIT_FILENAME})
        ORDER BY c.cmt_commit_hash
        LIMIT ${PAGE_SIZE}
      `;
      if (rows.length === 0) break;
      after = rows[rows.length - 1].sha;

      // Resolve logins + messages for this page in one round trip each
      const shas = rows.map((r) => r.sha);
      const authorIds = [...new Set(rows.map((r) => r.author_id).filter((id): id is string => typeof id === 'string' && id.length > 0))];

      const [logins, messages] = await Promise.all([
        authorIds.length > 0
          ? sql<{ id: string; login: string | null }[]>`
              SELECT cntrb_id::text AS id, cntrb_login AS login
              FROM ${collectossTable(sql, 'contributors')}
              WHERE cntrb_id = ANY(${authorIds}::uuid[])
            `
          : Promise.resolve([]),
        sql<{ sha: string; msg: string }[]>`
          SELECT cmt_hash AS sha, cmt_msg AS msg
          FROM ${collectossTable(sql, 'commit_messages')}
          WHERE repo_id = ${repoId} AND cmt_hash IN ${sql(shas)}
        `,
      ]);
      const loginById = new Map(logins.map((l) => [l.id, l.login]));
      const messageBySha = new Map(messages.map((m) => [m.sha, m.msg]));

      const records: ContributionRecord[] = rows.map((row) => {
        const author = login(row.author_id ? loginById.get(row.author_id) : undefined) ?? login(row.platform_username);
        return {
          type: 'commit',
          githubId: row.sha,
          author,
          email: row.author_email ?? undefined,
          date: new Date(row.authored_at),
          linesAdded: toNumber(row.lines_added),
          linesDeleted: toNumber(row.lines_removed),
          filesChanged: toNumber(row.files_changed),
          metadata: {
            author,
            message: messageBySha.get(row.sha),
            url: `${repoUrl}/commit/${row.sha}`,
            dataSource: 'collectoss',
          },
        };
      });

      await flush(records);
      if (rows.length < PAGE_SIZE) break;
    }
  }

  /**
   * Pull requests. Incremental mode also picks up PRs CollectOSS *updated*
   * (merged/closed) since the cursor so merge state stays current.
   * Keyset-paginated on pull_request_id.
   */
  private async collectPullRequests(repoId: number, window: CollectossWindow, repoUrl: string, flush: Flush): Promise<void> {
    const sql = this.sql;
    let after = 0;

    for (;;) {
      const rows = await sql<{
        id: string;
        number: string;
        created_at: Date;
        merged_at: Date | null;
        state: string | null;
        title: string | null;
        html_url: string | null;
        author_login: string | null;
      }[]>`
        SELECT
          pr.pull_request_id AS id,
          pr.pr_src_number AS number,
          pr.pr_created_at AS created_at,
          pr.pr_merged_at AS merged_at,
          pr.pr_src_state AS state,
          pr.pr_src_title AS title,
          pr.pr_html_url AS html_url,
          ct.cntrb_login AS author_login
        FROM ${collectossTable(sql, 'pull_requests')} pr
        LEFT JOIN ${collectossTable(sql, 'contributors')} ct ON ct.cntrb_id = pr.pr_augur_contributor_id
        WHERE pr.repo_id = ${repoId}
          AND pr.pull_request_id > ${after}
          AND pr.pr_created_at IS NOT NULL
          AND pr.pr_src_number IS NOT NULL
          ${window.since ? sql`AND pr.pr_created_at >= ${window.since}` : sql``}
          ${window.collectedAfter
            ? sql`AND (pr.data_collection_date > ${window.collectedAfter} OR pr.pr_updated_at > ${window.collectedAfter})`
            : sql``}
        ORDER BY pr.pull_request_id
        LIMIT ${PAGE_SIZE}
      `;
      if (rows.length === 0) break;
      after = Number(rows[rows.length - 1].id);

      const records: ContributionRecord[] = [];
      for (const row of rows) {
        const author = login(row.author_login);
        if (!author) continue; // GitHubCollector skips PRs without a user (deleted accounts)
        records.push({
          type: 'pr',
          githubId: String(row.number),
          author,
          date: new Date(row.created_at),
          isMerged: row.merged_at != null,
          metadata: {
            author,
            title: row.title ?? undefined,
            state: lower(row.state),
            mergedAt: row.merged_at ? new Date(row.merged_at).toISOString() : null,
            url: row.html_url ?? `${repoUrl}/pull/${row.number}`,
            dataSource: 'collectoss',
          },
        });
      }

      await flush(records);
      if (rows.length < PAGE_SIZE) break;
    }
  }

  /**
   * Reviews. One contribution per submitted review (same as GitHubCollector).
   * Pending (unsubmitted) reviews are skipped. Keyset-paginated on pr_review_id.
   */
  private async collectReviews(repoId: number, window: CollectossWindow, repoUrl: string, flush: Flush): Promise<void> {
    const sql = this.sql;
    let after = 0;

    for (;;) {
      const rows = await sql<{
        id: string;
        src_id: string | null;
        submitted_at: Date;
        state: string | null;
        html_url: string | null;
        pr_number: string;
        pr_title: string | null;
        author_login: string | null;
      }[]>`
        SELECT
          r.pr_review_id AS id,
          r.pr_review_src_id AS src_id,
          r.pr_review_submitted_at AS submitted_at,
          r.pr_review_state AS state,
          r.pr_review_html_url AS html_url,
          pr.pr_src_number AS pr_number,
          pr.pr_src_title AS pr_title,
          ct.cntrb_login AS author_login
        FROM ${collectossTable(sql, 'pull_request_reviews')} r
        JOIN ${collectossTable(sql, 'pull_requests')} pr ON pr.pull_request_id = r.pull_request_id
        LEFT JOIN ${collectossTable(sql, 'contributors')} ct ON ct.cntrb_id = r.cntrb_id
        WHERE pr.repo_id = ${repoId}
          AND r.pr_review_id > ${after}
          AND r.pr_review_submitted_at IS NOT NULL
          AND upper(coalesce(r.pr_review_state, '')) <> 'PENDING'
          ${window.since ? sql`AND r.pr_review_submitted_at >= ${window.since}` : sql``}
          ${window.collectedAfter ? sql`AND r.data_collection_date > ${window.collectedAfter}` : sql``}
        ORDER BY r.pr_review_id
        LIMIT ${PAGE_SIZE}
      `;
      if (rows.length === 0) break;
      after = Number(rows[rows.length - 1].id);

      const records: ContributionRecord[] = [];
      for (const row of rows) {
        const author = login(row.author_login);
        if (!author || row.src_id == null) continue; // GitHubCollector skips reviews without an author
        records.push({
          type: 'review',
          githubId: String(row.src_id),
          author,
          date: new Date(row.submitted_at),
          metadata: {
            author,
            prNumber: Number(row.pr_number),
            prTitle: row.pr_title ?? undefined,
            state: lower(row.state),
            url: row.html_url ?? `${repoUrl}/pull/${row.pr_number}#pullrequestreview-${row.src_id}`,
            dataSource: 'collectoss',
          },
        });
      }

      await flush(records);
      if (rows.length < PAGE_SIZE) break;
    }
  }

  /**
   * Issues (PRs excluded — CollectOSS stores PRs in issues with `pull_request` set).
   * Incremental mode also picks up issues CollectOSS updated since the cursor.
   * Keyset-paginated on issue_id.
   */
  private async collectIssues(repoId: number, window: CollectossWindow, repoUrl: string, flush: Flush): Promise<void> {
    const sql = this.sql;
    let after = 0;

    for (;;) {
      const rows = await sql<{
        id: string;
        number: string;
        created_at: Date;
        state: string | null;
        title: string | null;
        html_url: string | null;
        author_login: string | null;
      }[]>`
        SELECT
          i.issue_id AS id,
          i.gh_issue_number AS number,
          i.created_at,
          i.issue_state AS state,
          i.issue_title AS title,
          i.html_url,
          ct.cntrb_login AS author_login
        FROM ${collectossTable(sql, 'issues')} i
        LEFT JOIN ${collectossTable(sql, 'contributors')} ct ON ct.cntrb_id = i.reporter_id
        WHERE i.repo_id = ${repoId}
          AND i.issue_id > ${after}
          AND i.pull_request IS NULL
          AND i.created_at IS NOT NULL
          AND i.gh_issue_number IS NOT NULL
          ${window.since ? sql`AND i.created_at >= ${window.since}` : sql``}
          ${window.collectedAfter
            ? sql`AND (i.data_collection_date > ${window.collectedAfter} OR i.updated_at > ${window.collectedAfter})`
            : sql``}
        ORDER BY i.issue_id
        LIMIT ${PAGE_SIZE}
      `;
      if (rows.length === 0) break;
      after = Number(rows[rows.length - 1].id);

      const records: ContributionRecord[] = [];
      for (const row of rows) {
        const author = login(row.author_login);
        if (!author) continue; // GitHubCollector skips issues without a user
        records.push({
          type: 'issue',
          githubId: String(row.number),
          author,
          date: new Date(row.created_at),
          metadata: {
            author,
            title: row.title ?? undefined,
            state: lower(row.state),
            url: row.html_url ?? `${repoUrl}/issues/${row.number}`,
            dataSource: 'collectoss',
          },
        });
      }

      await flush(records);
      if (rows.length < PAGE_SIZE) break;
    }
  }
}
