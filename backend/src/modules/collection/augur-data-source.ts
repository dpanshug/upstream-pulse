import { getAugurClient } from '../../shared/database/augur-client.js';
import { resolveAugurRepoId } from './repo-resolver.js';
import { logger } from '../../shared/utils/logger.js';
import type { ContributionRecord } from '../../shared/types/index.js';

interface CollectOSSProject {
  id: string;
  name: string;
  githubOrg: string;
  githubRepo: string;
  augurRepoId?: number | null;
}

type AugurSql = NonNullable<ReturnType<typeof getAugurClient>>;

const BATCH_SIZE = 500;

/**
 * CollectOSS adapter — reads from an Augur PostgreSQL database and produces
 * the same ContributionRecord[] that GitHubCollector returns.
 *
 * Column names verified against the CollectOSS sample database (ghcr.io/oss-aspen/sample-collected-data).
 * Schema: "data" (renamed from "augur_data" per Adrian Edwards, Jun 2026).
 * All queries are isolated in this single file for easy migration if the schema changes.
 */
export class CollectOSSAdapter {

  /**
   * Collect all contribution types for a project from the Augur DB.
   * Mirrors GitHubCollector.collectRepositoryContributions() callback API.
   */
  async collectAll(
    project: CollectOSSProject,
    since: Date,
    onProgress?: (detail: { phase: string; collected: number }) => void,
    onPhaseComplete?: (phase: string, records: ContributionRecord[]) => Promise<void>,
    phases?: ('commits' | 'pull_requests' | 'reviews' | 'issues')[],
  ): Promise<ContributionRecord[]> {
    const augur = getAugurClient();
    if (!augur) {
      throw new Error('Augur DB client not available — is AUGUR_DATABASE_URL configured?');
    }

    const repoId = project.augurRepoId ?? await resolveAugurRepoId(project.id, project.githubOrg, project.githubRepo);
    if (!repoId) {
      throw new Error(`Cannot resolve Augur repo_id for ${project.githubOrg}/${project.githubRepo}`);
    }

    const repoGitUrl = `https://github.com/${project.githubOrg}/${project.githubRepo}`;
    const allPhases = phases ?? ['commits', 'pull_requests', 'reviews', 'issues'];
    let totalCollected = 0;

    logger.info(`CollectOSS: collecting from Augur for ${project.githubOrg}/${project.githubRepo} (repo_id=${repoId})`, { phases: allPhases });

    const signal = (phase: string) => onProgress?.({ phase, collected: totalCollected });

    const flush = async (phase: string, records: ContributionRecord[]) => {
      if (records.length === 0) return;
      totalCollected += records.length;
      logger.info(`CollectOSS: flushing ${records.length} ${phase} (total: ${totalCollected})`);
      if (onPhaseComplete) await onPhaseComplete(phase, records);
    };

    if (allPhases.includes('commits')) {
      signal('commits');
      await this.collectCommits(augur, repoId, since, repoGitUrl, signal, flush);
    }

    if (allPhases.includes('pull_requests')) {
      signal('pull_requests');
      await this.collectPullRequests(augur, repoId, since, repoGitUrl, signal, flush);
    }

    if (allPhases.includes('reviews')) {
      signal('reviews');
      await this.collectReviews(augur, repoId, since, repoGitUrl, signal, flush);
    }

    if (allPhases.includes('issues')) {
      signal('issues');
      await this.collectIssues(augur, repoId, since, repoGitUrl, signal, flush);
    }

    signal('done');
    logger.info(`CollectOSS: total contributions collected: ${totalCollected}`);
    return [];
  }

  // ── Commits ─────────────────────────────────────────────────────
  // IMPORTANT: Augur stores 1 row per file per commit.
  // We GROUP BY commit hash to get 1 contribution per commit and SUM the line stats.
  //
  // Verified columns:
  //   cmt_commit_hash — the Git SHA
  //   cmt_committer_date — commit timestamp (varchar, not timestamp)
  //   cmt_added / cmt_removed — lines per file-row (SUM across files)
  //   cmt_author_platform_username — GitHub username (direct, no JOIN needed)
  //   cmt_ght_author_id → contributors.cntrb_id for fallback login
  private async collectCommits(
    augur: AugurSql,
    repoId: number,
    since: Date,
    repoGitUrl: string,
    signal: (phase: string) => void,
    flush: (phase: string, records: ContributionRecord[]) => Promise<void>,
  ): Promise<void> {
    let offset = 0;
    let batch = 0;
    let buffer: ContributionRecord[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      batch++;
      signal(`commits (batch ${batch})`);

      const rows = await augur`
        SELECT
          c.cmt_commit_hash AS sha,
          c.cmt_committer_date AS commit_date,
          SUM(c.cmt_added) AS lines_added,
          SUM(c.cmt_removed) AS lines_removed,
          COUNT(*) AS files_changed,
          COALESCE(
            MAX(c.cmt_author_platform_username),
            MAX(ct.cntrb_login)
          ) AS author_login
        FROM data.commits c
        LEFT JOIN data.contributors ct ON c.cmt_ght_author_id = ct.cntrb_id
        WHERE c.repo_id = ${repoId}
          AND c.cmt_committer_date >= ${since.toISOString()}
        GROUP BY c.cmt_commit_hash, c.cmt_committer_date
        ORDER BY c.cmt_committer_date DESC
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `;

      if (rows.length === 0) break;
      offset += rows.length;

      for (const row of rows) {
        buffer.push({
          type: 'commit',
          githubId: String(row.sha),
          author: row.author_login || undefined,
          date: new Date(row.commit_date),
          linesAdded: row.lines_added != null ? Number(row.lines_added) : undefined,
          linesDeleted: row.lines_removed != null ? Number(row.lines_removed) : undefined,
          filesChanged: row.files_changed != null ? Number(row.files_changed) : undefined,
          metadata: {
            author: row.author_login || undefined,
            url: `${repoGitUrl}/commit/${row.sha}`,
            dataSource: 'collectoss',
          },
        });
      }

      if (buffer.length >= BATCH_SIZE) {
        await flush('commits', buffer);
        buffer = [];
      }

      if (rows.length < BATCH_SIZE) break;
    }

    if (buffer.length > 0) await flush('commits', buffer);
  }

  // ── Pull Requests ───────────────────────────────────────────────
  // Verified columns:
  //   pr_src_number — GitHub PR number (used as githubId for dedup parity)
  //   pr_created_at, pr_merged_at, pr_closed_at, pr_src_state, pr_src_title
  //   pr_augur_contributor_id → contributors.cntrb_id for author login
  private async collectPullRequests(
    augur: AugurSql,
    repoId: number,
    since: Date,
    repoGitUrl: string,
    signal: (phase: string) => void,
    flush: (phase: string, records: ContributionRecord[]) => Promise<void>,
  ): Promise<void> {
    let offset = 0;
    let batch = 0;
    let buffer: ContributionRecord[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      batch++;
      signal(`pull_requests (batch ${batch})`);

      const rows = await augur`
        SELECT
          pr.pr_src_number AS pr_number,
          pr.pr_created_at,
          pr.pr_merged_at,
          pr.pr_closed_at,
          pr.pr_src_state AS state,
          pr.pr_src_title AS title,
          ct.cntrb_login AS author_login
        FROM data.pull_requests pr
        LEFT JOIN data.contributors ct ON pr.pr_augur_contributor_id = ct.cntrb_id
        WHERE pr.repo_id = ${repoId}
          AND pr.pr_created_at >= ${since.toISOString()}
        ORDER BY pr.pr_created_at DESC
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `;

      if (rows.length === 0) break;
      offset += rows.length;

      for (const row of rows) {
        buffer.push({
          type: 'pr',
          githubId: String(row.pr_number),
          author: row.author_login || undefined,
          date: new Date(row.pr_created_at),
          isMerged: row.pr_merged_at != null,
          metadata: {
            author: row.author_login || undefined,
            title: row.title,
            state: (row.state || '').toLowerCase(),
            mergedAt: row.pr_merged_at,
            url: `${repoGitUrl}/pull/${row.pr_number}`,
            dataSource: 'collectoss',
          },
        });
      }

      if (buffer.length >= BATCH_SIZE) {
        await flush('pull_requests', buffer);
        buffer = [];
      }

      if (rows.length < BATCH_SIZE) break;
    }

    if (buffer.length > 0) await flush('pull_requests', buffer);
  }

  // ── Reviews ─────────────────────────────────────────────────────
  // Verified columns:
  //   pr_review_src_id — GitHub review databaseId (used as githubId)
  //   pr_review_submitted_at, pr_review_state
  private async collectReviews(
    augur: AugurSql,
    repoId: number,
    since: Date,
    repoGitUrl: string,
    signal: (phase: string) => void,
    flush: (phase: string, records: ContributionRecord[]) => Promise<void>,
  ): Promise<void> {
    let offset = 0;
    let batch = 0;
    let buffer: ContributionRecord[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      batch++;
      signal(`reviews (batch ${batch})`);

      const rows = await augur`
        SELECT
          r.pr_review_src_id AS review_id,
          r.pr_review_submitted_at AS submitted_at,
          r.pr_review_state AS state,
          pr.pr_src_number AS pr_number,
          pr.pr_src_title AS pr_title,
          ct.cntrb_login AS author_login
        FROM data.pull_request_reviews r
        JOIN data.pull_requests pr ON r.pull_request_id = pr.pull_request_id
        LEFT JOIN data.contributors ct ON r.cntrb_id = ct.cntrb_id
        WHERE pr.repo_id = ${repoId}
          AND r.pr_review_submitted_at >= ${since.toISOString()}
        ORDER BY r.pr_review_submitted_at DESC
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `;

      if (rows.length === 0) break;
      offset += rows.length;

      for (const row of rows) {
        if (!row.submitted_at) continue;

        buffer.push({
          type: 'review',
          githubId: String(row.review_id),
          author: row.author_login || undefined,
          date: new Date(row.submitted_at),
          metadata: {
            author: row.author_login || undefined,
            prNumber: row.pr_number,
            prTitle: row.pr_title,
            state: (row.state || '').toLowerCase(),
            url: `${repoGitUrl}/pull/${row.pr_number}#pullrequestreview-${row.review_id}`,
            dataSource: 'collectoss',
          },
        });
      }

      if (buffer.length >= BATCH_SIZE) {
        await flush('reviews', buffer);
        buffer = [];
      }

      if (rows.length < BATCH_SIZE) break;
    }

    if (buffer.length > 0) await flush('reviews', buffer);
  }

  // ── Issues ──────────────────────────────────────────────────────
  // Filter out PRs: Augur issues table can contain PRs (pull_request IS NOT NULL).
  // Verified columns:
  //   gh_issue_number — GitHub issue number (used as githubId)
  //   created_at, issue_state, issue_title, reporter_id
  private async collectIssues(
    augur: AugurSql,
    repoId: number,
    since: Date,
    repoGitUrl: string,
    signal: (phase: string) => void,
    flush: (phase: string, records: ContributionRecord[]) => Promise<void>,
  ): Promise<void> {
    let offset = 0;
    let batch = 0;
    let buffer: ContributionRecord[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      batch++;
      signal(`issues (batch ${batch})`);

      const rows = await augur`
        SELECT
          i.gh_issue_number AS issue_number,
          i.created_at,
          i.issue_state AS state,
          i.issue_title AS title,
          ct.cntrb_login AS author_login
        FROM data.issues i
        LEFT JOIN data.contributors ct ON i.reporter_id = ct.cntrb_id
        WHERE i.repo_id = ${repoId}
          AND i.pull_request IS NULL
          AND i.created_at >= ${since.toISOString()}
        ORDER BY i.created_at DESC
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `;

      if (rows.length === 0) break;
      offset += rows.length;

      for (const row of rows) {
        buffer.push({
          type: 'issue',
          githubId: String(row.issue_number),
          author: row.author_login || undefined,
          date: new Date(row.created_at),
          metadata: {
            author: row.author_login || undefined,
            title: row.title,
            state: (row.state || '').toLowerCase(),
            url: `${repoGitUrl}/issues/${row.issue_number}`,
            dataSource: 'collectoss',
          },
        });
      }

      if (buffer.length >= BATCH_SIZE) {
        await flush('issues', buffer);
        buffer = [];
      }

      if (rows.length < BATCH_SIZE) break;
    }

    if (buffer.length > 0) await flush('issues', buffer);
  }
}
