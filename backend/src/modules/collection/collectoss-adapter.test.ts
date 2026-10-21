import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { CollectossAdapter, type CollectossWindow } from './collectoss-adapter.js';
import { REQUIRED_COLUMNS } from './collectoss-health.js';
import { collectossConnectionOptions } from '../../shared/database/collectoss-client.js';
import type { ContributionRecord } from '../../shared/types/index.js';

/**
 * Integration tests against a real CollectOSS database.
 *
 * Opt-in: set COLLECTOSS_TEST_DATABASE_URL to the sample DB, e.g.
 *   docker compose --profile collectoss up -d collectoss-db
 *   COLLECTOSS_TEST_DATABASE_URL=postgresql://sample_user:sample_password@localhost:5434/sample_collected_data npm test
 *
 * Expected numbers are derived from ghcr.io/oss-aspen/sample-collected-data
 * (repo operate-first/blueprint, repo_id 24442) via direct SQL.
 */
const TEST_URL = process.env.COLLECTOSS_TEST_DATABASE_URL;
const SCHEMA = process.env.COLLECTOSS_SCHEMA || 'data';

describe.skipIf(!TEST_URL)('CollectossAdapter (sample CollectOSS DB)', () => {
  let sql: postgres.Sql;
  let adapter: CollectossAdapter;
  let repoId: number;
  const project = { name: 'Blueprint', githubOrg: 'operate-first', githubRepo: 'blueprint' };

  async function collect(window: CollectossWindow, phases?: ('commits' | 'pull_requests' | 'reviews' | 'issues')[]) {
    const byPhase = new Map<string, ContributionRecord[]>();
    const result = await adapter.collectRepositoryContributions(project, repoId, window, undefined, async (phase, records) => {
      byPhase.set(phase, [...(byPhase.get(phase) ?? []), ...records]);
    }, phases);
    return { result, byPhase };
  }

  /** Ground truth computed with plain SQL, independent of the adapter. */
  async function groundTruth() {
    const t = (name: string) => sql(`${SCHEMA}.${name}`);
    const [row] = await sql<{ commits: string; merges: string; prs: string; reviews: string; issues: string }[]>`
      SELECT
        (SELECT count(DISTINCT cmt_commit_hash) FROM ${t('commits')} WHERE repo_id = ${repoId}) AS commits,
        (SELECT count(DISTINCT cmt_commit_hash) FROM ${t('commits')} WHERE repo_id = ${repoId} AND cmt_filename = '(Merge commit)') AS merges,
        (SELECT count(*) FROM ${t('pull_requests')} pr
          JOIN ${t('contributors')} c ON c.cntrb_id = pr.pr_augur_contributor_id
          WHERE pr.repo_id = ${repoId}) AS prs,
        (SELECT count(*) FROM ${t('pull_request_reviews')} r
          JOIN ${t('pull_requests')} pr ON pr.pull_request_id = r.pull_request_id
          JOIN ${t('contributors')} c ON c.cntrb_id = r.cntrb_id
          WHERE pr.repo_id = ${repoId} AND r.pr_review_submitted_at IS NOT NULL
            AND r.pr_review_state <> 'PENDING') AS reviews,
        (SELECT count(*) FROM ${t('issues')} i
          JOIN ${t('contributors')} c ON c.cntrb_id = i.reporter_id
          WHERE i.repo_id = ${repoId} AND i.pull_request IS NULL) AS issues
    `;
    return {
      commits: Number(row.commits) - Number(row.merges),
      prs: Number(row.prs),
      reviews: Number(row.reviews),
      issues: Number(row.issues),
    };
  }

  beforeAll(async () => {
    sql = postgres(TEST_URL as string, collectossConnectionOptions(2)) as unknown as postgres.Sql;
    adapter = new CollectossAdapter(sql);
    const [repo] = await sql<{ repo_id: string }[]>`
      SELECT repo_id FROM ${sql(`${SCHEMA}.repo`)} WHERE lower(repo_git) = 'https://github.com/operate-first/blueprint'
    `;
    repoId = Number(repo.repo_id);
  });

  afterAll(async () => {
    await sql?.end();
  });

  it('exposes every column the adapter depends on', async () => {
    const rows = await sql<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = ${SCHEMA} AND table_name IN ${sql(Object.keys(REQUIRED_COLUMNS))}
    `;
    const found = new Set(rows.map(r => `${r.table_name}.${r.column_name}`));
    const missing = Object.entries(REQUIRED_COLUMNS)
      .flatMap(([table, cols]) => cols.map(c => `${table}.${c}`))
      .filter(c => !found.has(c));
    expect(missing).toEqual([]);
  });

  it('collects a full backfill matching direct SQL counts', async () => {
    const truth = await groundTruth();
    const { result, byPhase } = await collect({});

    expect(byPhase.get('commits')?.length).toBe(truth.commits);
    expect(byPhase.get('pull_requests')?.length).toBe(truth.prs);
    expect(byPhase.get('reviews')?.length).toBe(truth.reviews);
    expect(byPhase.get('issues')?.length).toBe(truth.issues);
    expect(result.collected).toBe(truth.commits + truth.prs + truth.reviews + truth.issues);
    expect(result.highWaterMark).toBeInstanceOf(Date);
  });

  it('countContributions agrees with what collection emits', async () => {
    const truth = await groundTruth();
    const counts = await adapter.countContributions(repoId);
    expect(counts).toEqual(truth);
  });

  it('emits unique GitHub-compatible ids per type', async () => {
    const { byPhase } = await collect({});
    for (const [phase, records] of byPhase) {
      const ids = records.map(r => r.githubId);
      expect(new Set(ids).size, `duplicate ids in ${phase}`).toBe(ids.length);
    }
    const commit = byPhase.get('commits')?.[0];
    expect(commit?.githubId).toMatch(/^[0-9a-f]{40}$/);
    expect(commit?.metadata?.url).toBe(`https://github.com/operate-first/blueprint/commit/${commit?.githubId}`);
    for (const pr of byPhase.get('pull_requests') ?? []) {
      expect(pr.githubId).toMatch(/^\d+$/);
      expect(pr.author).toBeTruthy();
      expect(['open', 'closed']).toContain(pr.metadata?.state);
    }
    for (const review of byPhase.get('reviews') ?? []) {
      expect(review.githubId).toMatch(/^\d+$/);
      expect(review.metadata?.state).not.toBe('pending');
    }
  });

  it('excludes merge commits and aggregates per-file rows into one commit', async () => {
    const { byPhase } = await collect({}, ['commits']);
    const commits = byPhase.get('commits') ?? [];
    const merges = await sql<{ sha: string }[]>`
      SELECT DISTINCT cmt_commit_hash AS sha FROM ${sql(`${SCHEMA}.commits`)}
      WHERE repo_id = ${repoId} AND cmt_filename = '(Merge commit)'
    `;
    const emitted = new Set(commits.map(c => c.githubId));
    expect(merges.length).toBeGreaterThan(0);
    for (const m of merges) expect(emitted.has(m.sha)).toBe(false);

    const [multi] = await sql<{ sha: string; files: string; added: string }[]>`
      SELECT cmt_commit_hash AS sha, count(*) AS files, sum(cmt_added) AS added
      FROM ${sql(`${SCHEMA}.commits`)} WHERE repo_id = ${repoId}
      GROUP BY cmt_commit_hash
      HAVING count(*) > 1 AND NOT bool_or(cmt_filename = '(Merge commit)')
      ORDER BY count(*) DESC LIMIT 1
    `;
    const rec = commits.find(c => c.githubId === multi.sha);
    expect(rec?.filesChanged).toBe(Number(multi.files));
    expect(rec?.linesAdded).toBe(Number(multi.added));
  });

  it('resolves most commit authors to GitHub logins and attaches messages', async () => {
    const { byPhase } = await collect({}, ['commits']);
    const commits = byPhase.get('commits') ?? [];
    const withAuthor = commits.filter(c => c.author).length;
    expect(withAuthor / commits.length).toBeGreaterThan(0.9);
    expect(commits.filter(c => typeof c.metadata?.message === 'string').length).toBeGreaterThan(0);
  });

  it('resolves commit authors from the contributors table (cmt_ght_author_id → cntrb_login)', async () => {
    const { byPhase } = await collect({}, ['commits']);
    const expected = await sql<{ sha: string; login: string }[]>`
      SELECT c.cmt_commit_hash AS sha, max(ct.cntrb_login) AS login
      FROM ${sql(`${SCHEMA}.commits`)} c
      JOIN ${sql(`${SCHEMA}.contributors`)} ct ON ct.cntrb_id = c.cmt_ght_author_id
      WHERE c.repo_id = ${repoId}
        AND ct.cntrb_login NOT IN ('not-provided', 'nan', 'nobody', 'ghost')
      GROUP BY c.cmt_commit_hash
    `;
    const loginBySha = new Map(expected.map(r => [r.sha, r.login]));
    const commits = byPhase.get('commits') ?? [];
    const checked = commits.filter(c => loginBySha.has(c.githubId));
    expect(checked.length).toBeGreaterThan(0);
    for (const c of checked) expect(c.author).toBe(loginBySha.get(c.githubId));
  });

  it('filters by contribution date for range syncs', async () => {
    const all = await collect({}, ['pull_requests']);
    const prs = all.byPhase.get('pull_requests') ?? [];
    const sorted = prs.map(p => p.date.getTime()).sort((a, b) => a - b);
    const median = new Date(sorted[Math.floor(sorted.length / 2)]);

    const ranged = await collect({ since: median }, ['pull_requests']);
    const rangedPrs = ranged.byPhase.get('pull_requests') ?? [];
    expect(rangedPrs.length).toBe(prs.filter(p => p.date >= median).length);
    expect(rangedPrs.every(p => p.date >= median)).toBe(true);
  });

  it('incremental window returns nothing beyond the high-water mark and everything before it', async () => {
    const { result } = await collect({}, ['issues']);
    const hwm = result.highWaterMark as Date;

    const after = await collect({ collectedAfter: hwm });
    expect(after.result.collected).toBe(0);

    const before = await collect({ collectedAfter: new Date(hwm.getTime() - 365 * 24 * 60 * 60 * 1000 * 50) });
    const truth = await groundTruth();
    expect(before.result.collected).toBe(truth.commits + truth.prs + truth.reviews + truth.issues);
  });

  it('paginates large repos without skipping or duplicating (keyset)', async () => {
    const [big] = await sql<{ repo_id: string }[]>`
      SELECT repo_id FROM ${sql(`${SCHEMA}.repo`)} WHERE lower(repo_git) = 'https://github.com/augurlabs/augur'
    `;
    const bigId = Number(big.repo_id);
    const shas: string[] = [];
    await adapter.collectRepositoryContributions(
      { name: 'augur', githubOrg: 'augurlabs', githubRepo: 'augur' },
      bigId, {}, undefined,
      async (_phase, records) => { shas.push(...records.map(r => r.githubId)); },
      ['commits'],
    );
    const [row] = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM (
        SELECT 1 FROM ${sql(`${SCHEMA}.commits`)} WHERE repo_id = ${bigId}
        GROUP BY cmt_commit_hash HAVING NOT bool_or(cmt_filename = '(Merge commit)')
      ) x
    `;
    expect(shas.length).toBeGreaterThan(1000); // spans multiple pages
    expect(shas.length).toBe(Number(row.n));
    expect(new Set(shas).size).toBe(shas.length);
  });
});
