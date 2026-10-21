import { errorMessage, getCollectossClient, isCollectossConfigured } from '../../shared/database/collectoss-client.js';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';

export interface CollectossHealthStatus {
  configured: boolean;
  connected: boolean;
  schema: string;
  /** All required tables and columns exist */
  schemaVerified: boolean;
  /** `table.column` (or `table` when the whole table is missing) entries that were not found */
  missing: string[];
  /** Most recent data_collection_date across PRs — indicates how fresh CollectOSS data is */
  latestCollectionAt: string | null;
  error: string | null;
  lastChecked: string;
}

/**
 * Columns the CollectOSS adapter depends on. Keep in sync with collectoss-adapter.ts.
 * Verified against CollectOSS `collectoss/application/db/models/data.py`.
 */
export const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  repo: ['repo_id', 'repo_git'],
  commits: [
    'repo_id', 'cmt_commit_hash', 'cmt_filename', 'cmt_added', 'cmt_removed',
    'cmt_author_timestamp', 'cmt_author_raw_email', 'cmt_ght_author_id',
    'cmt_author_platform_username', 'data_collection_date',
  ],
  commit_messages: ['repo_id', 'cmt_hash', 'cmt_msg'],
  pull_requests: [
    'pull_request_id', 'repo_id', 'pr_src_number', 'pr_src_state', 'pr_src_title',
    'pr_created_at', 'pr_merged_at', 'pr_updated_at', 'pr_html_url',
    'pr_augur_contributor_id', 'data_collection_date',
  ],
  pull_request_reviews: [
    'pr_review_id', 'pull_request_id', 'cntrb_id', 'pr_review_src_id',
    'pr_review_state', 'pr_review_submitted_at', 'pr_review_html_url',
    'data_collection_date',
  ],
  issues: [
    'issue_id', 'repo_id', 'gh_issue_number', 'issue_state', 'issue_title',
    'created_at', 'updated_at', 'html_url', 'reporter_id', 'pull_request',
    'data_collection_date',
  ],
  contributors: ['cntrb_id', 'cntrb_login'],
};

const CACHE_TTL_MS = 60_000;
let cached: { status: CollectossHealthStatus; expiresAt: number } | null = null;

/**
 * Check CollectOSS connectivity and schema compatibility.
 * Never throws — CollectOSS is optional and degrades gracefully.
 * Results are cached per process for 60s (pass force=true to bypass).
 */
export async function checkCollectossHealth(force = false): Promise<CollectossHealthStatus> {
  if (!force && cached && Date.now() < cached.expiresAt) return cached.status;

  const status: CollectossHealthStatus = {
    configured: isCollectossConfigured(),
    connected: false,
    schema: config.collectossSchema,
    schemaVerified: false,
    missing: [],
    latestCollectionAt: null,
    error: null,
    lastChecked: new Date().toISOString(),
  };

  const sql = getCollectossClient();
  if (!status.configured || !sql) {
    return remember(status);
  }

  try {
    await sql`SELECT 1`;
    status.connected = true;
  } catch (error) {
    status.error = 'Connection failed';
    logger.warn('CollectOSS health: connectivity failed', { error: errorMessage(error) });
    return remember(status);
  }

  try {
    const rows = await sql<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = ${config.collectossSchema}
        AND table_name IN ${sql(Object.keys(REQUIRED_COLUMNS))}
    `;
    const found = new Map<string, Set<string>>();
    for (const row of rows) {
      const cols = found.get(row.table_name) ?? new Set<string>();
      cols.add(row.column_name);
      found.set(row.table_name, cols);
    }
    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
      const cols = found.get(table);
      if (!cols) {
        status.missing.push(table);
        continue;
      }
      for (const column of columns) {
        if (!cols.has(column)) status.missing.push(`${table}.${column}`);
      }
    }
    status.schemaVerified = status.missing.length === 0;
  } catch (error) {
    status.error = 'Schema verification failed';
    logger.warn('CollectOSS health: schema verification failed', { error: errorMessage(error) });
    return remember(status);
  }

  if (status.schemaVerified) {
    try {
      const schemaTable = sql(`${config.collectossSchema}.pull_requests`);
      const [row] = await sql<{ latest: Date | null }[]>`
        SELECT max(data_collection_date) AS latest FROM ${schemaTable}
      `;
      status.latestCollectionAt = row?.latest ? new Date(row.latest).toISOString() : null;
    } catch (error) {
      logger.debug('CollectOSS health: freshness query failed', { error: errorMessage(error) });
    }
    logger.info('CollectOSS health: schema verified', { schema: status.schema, latestCollectionAt: status.latestCollectionAt });
  } else {
    logger.warn('CollectOSS health: schema incompatible — CollectOSS collection will fail', { missing: status.missing });
  }

  return remember(status);
}

function remember(status: CollectossHealthStatus): CollectossHealthStatus {
  cached = { status, expiresAt: Date.now() + CACHE_TTL_MS };
  return status;
}
