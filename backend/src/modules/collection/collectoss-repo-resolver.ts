import type postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { errorMessage, getCollectossClient } from '../../shared/database/collectoss-client.js';
import { db } from '../../shared/database/client.js';
import { projects } from '../../shared/database/schema.js';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';

const SCHEMA_NAME_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Fully-qualified identifier for a CollectOSS table, e.g. `data.repo`.
 * The schema comes from COLLECTOSS_SCHEMA and is validated so it can never be
 * used for injection (postgres.js escapes identifiers as well).
 */
export function collectossTable(sql: postgres.Sql, table: string) {
  const schema = config.collectossSchema;
  if (!SCHEMA_NAME_RE.test(schema)) {
    throw new Error(`Invalid COLLECTOSS_SCHEMA "${schema}"`);
  }
  return sql(`${schema}.${table}`);
}

const cache = new Map<string, { value: number | null; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const NULL_CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * Look up the CollectOSS repo_id for a GitHub org/repo.
 *
 * Matching is case-insensitive on the canonical `https://github.com/{org}/{repo}`
 * URL (with or without `.git`). Repos that were renamed/moved are also matched
 * via `historical_repo_urls`.
 *
 * Throws if the CollectOSS query fails (so callers can distinguish
 * "not tracked" → null from "unreachable" → error).
 */
export async function findCollectossRepoId(githubOrg: string, githubRepo: string): Promise<number | null> {
  const key = `${githubOrg}/${githubRepo}`.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const sql = getCollectossClient();
  if (!sql) throw new Error('CollectOSS is not configured (COLLECTOSS_DATABASE_URL is empty)');

  const url = `https://github.com/${key}`;
  const candidates = [url, `${url}.git`];

  const rows = await sql<{ repo_id: string }[]>`
    SELECT repo_id FROM ${collectossTable(sql, 'repo')}
    WHERE lower(repo_git) IN ${sql(candidates)}
    ORDER BY repo_id
    LIMIT 1
  `;

  let repoId: number | null = rows.length > 0 ? Number(rows[0].repo_id) : null;

  if (repoId == null) {
    // Renamed / transferred repos keep their old URL here
    try {
      const historical = await sql<{ repo_id: string }[]>`
        SELECT repo_id FROM ${collectossTable(sql, 'historical_repo_urls')}
        WHERE lower(git_url) IN ${sql(candidates)}
        LIMIT 1
      `;
      if (historical.length > 0) repoId = Number(historical[0].repo_id);
    } catch (error) {
      // Table only exists on newer CollectOSS versions — not fatal
      logger.debug('CollectOSS historical_repo_urls lookup skipped', { error: errorMessage(error) });
    }
  }

  cache.set(key, { value: repoId, expiresAt: Date.now() + (repoId == null ? NULL_CACHE_TTL_MS : CACHE_TTL_MS) });
  return repoId;
}

/**
 * Resolve and persist a project's CollectOSS repo_id (projects.collectoss_repo_id).
 * Returns null when the repo is not tracked in CollectOSS. Throws when CollectOSS
 * is unreachable.
 */
export async function resolveCollectossRepoId(
  projectId: string,
  githubOrg: string,
  githubRepo: string,
): Promise<number | null> {
  const repoId = await findCollectossRepoId(githubOrg, githubRepo);

  if (repoId == null) {
    logger.info(`CollectOSS: no repo found for ${githubOrg}/${githubRepo}`);
    return null;
  }

  await db.update(projects)
    .set({ collectossRepoId: repoId, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  logger.info(`CollectOSS: mapped ${githubOrg}/${githubRepo} → repo_id ${repoId}`);
  return repoId;
}

export function clearCollectossRepoCache(): void {
  cache.clear();
}
