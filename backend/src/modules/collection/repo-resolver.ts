import { getAugurClient } from '../../shared/database/augur-client.js';
import { db } from '../../shared/database/client.js';
import { projects } from '../../shared/database/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../shared/utils/logger.js';

const cache = new Map<string, { value: number | null; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const NULL_CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * Resolve a Pulse project (org/repo) to an Augur repo_id.
 * Caches the result in memory and persists to the projects table.
 */
export async function resolveAugurRepoId(
  projectId: string,
  githubOrg: string,
  githubRepo: string,
): Promise<number | null> {
  const cacheKey = `${githubOrg}/${githubRepo}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const augur = getAugurClient();
  if (!augur) {
    logger.debug('RepoResolver: Augur client not available');
    return null;
  }

  try {
    const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');
    const pattern = `%${escapeLike(githubOrg)}/${escapeLike(githubRepo)}%`;
    const rows = await augur`
      SELECT repo_id FROM data.repo
      WHERE repo_git LIKE ${pattern}
      LIMIT 1
    `;

    if (rows.length === 0) {
      logger.info(`RepoResolver: no Augur repo found for ${cacheKey}`);
      cache.set(cacheKey, { value: null, expiresAt: Date.now() + NULL_CACHE_TTL_MS });
      return null;
    }

    const repoId = Number(rows[0].repo_id);
    cache.set(cacheKey, { value: repoId, expiresAt: Date.now() + CACHE_TTL_MS });

    await db.update(projects)
      .set({ augurRepoId: repoId, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    logger.info(`RepoResolver: mapped ${cacheKey} → Augur repo_id ${repoId}`);
    return repoId;
  } catch (error) {
    logger.error('RepoResolver: failed to resolve repo', {
      error: (error as Error).message,
      org: githubOrg,
      repo: githubRepo,
    });
    return null;
  }
}

export function clearRepoResolverCache(): void {
  cache.clear();
}
