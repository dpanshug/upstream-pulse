import { eq } from 'drizzle-orm';
import { db } from '../../shared/database/client.js';
import { projects } from '../../shared/database/schema.js';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { errorMessage, isCollectossConfigured } from '../../shared/database/collectoss-client.js';
import type {
  CollectionPhase,
  CollectionPhaseCallback,
  CollectionProgressCallback,
  DataSource,
  Project,
  Repository,
} from '../../shared/types/index.js';
import type { CollectossAdapter, CollectossWindow } from './collectoss-adapter.js';

/** Overlap applied the first time a project is collected incrementally from CollectOSS. */
export const COLLECTOSS_FIRST_SYNC_OVERLAP_MS = 14 * 24 * 60 * 60 * 1000;

const ALL_PHASES: CollectionPhase[] = ['commits', 'pull_requests', 'reviews', 'issues'];

export interface ProjectCollectionRequest {
  project: Project;
  jobType: 'sync' | 'full_sync';
  /** Contribution-date lower bound (GitHub always uses it; CollectOSS uses it for range syncs) */
  since?: Date;
  /**
   * Incremental (scheduled / "since last sync") vs explicit range.
   * CollectOSS incremental syncs use the data_collection_date cursor instead of `since`.
   */
  incremental: boolean;
  phases?: CollectionPhase[];
  /** Force a backend for this run (e.g. validation runs); defaults to project.dataSource */
  dataSourceOverride?: DataSource;
}

export interface ProjectCollectionOutcome {
  requestedDataSource: DataSource;
  /** Backend that actually collected */
  dataSource: DataSource;
  /** Set when a CollectOSS project was collected from GitHub instead */
  fallbackReason?: string;
  collectoss?: {
    repoId: number;
    window: CollectossWindow;
    highWaterMark: string | null;
    cursorAdvanced: boolean;
  };
}

export interface GithubBackend {
  collectRepositoryContributions: (
    repo: Repository,
    since: Date,
    onProgress?: CollectionProgressCallback,
    onPhaseComplete?: CollectionPhaseCallback,
    phases?: CollectionPhase[],
  ) => Promise<unknown>;
}

/** Injectable backends (tests substitute fakes). */
export interface CollectionBackends {
  github: () => Promise<GithubBackend>;
  collectoss: () => Promise<Pick<CollectossAdapter, 'collectRepositoryContributions'>>;
  resolveRepoId: (projectId: string, githubOrg: string, githubRepo: string) => Promise<number | null>;
}

const defaultBackends: CollectionBackends = {
  github: async () => {
    const { GitHubCollector } = await import('./github-collector.js');
    return new GitHubCollector();
  },
  collectoss: async () => {
    const { CollectossAdapter } = await import('./collectoss-adapter.js');
    return new CollectossAdapter();
  },
  resolveRepoId: async (projectId, githubOrg, githubRepo) => {
    const { resolveCollectossRepoId } = await import('./collectoss-repo-resolver.js');
    return resolveCollectossRepoId(projectId, githubOrg, githubRepo);
  },
};

/**
 * Decide which CollectOSS rows to read for a run.
 *
 * - Range runs (full history / explicit `since`): filter on contribution date.
 * - Incremental runs with a cursor: everything CollectOSS collected after the cursor,
 *   regardless of contribution date (CollectOSS refreshes in weekly batches, so
 *   late-arriving data must still be picked up).
 * - First incremental run: never synced → full backfill; otherwise `since` minus
 *   a 14-day overlap (re-collection is idempotent).
 */
export function computeCollectossWindow(input: {
  incremental: boolean;
  since?: Date;
  syncedThrough: Date | null;
  lastSyncAt: Date | null;
}): CollectossWindow {
  if (!input.incremental) {
    return input.since ? { since: input.since } : {};
  }
  if (input.syncedThrough) {
    return { collectedAfter: input.syncedThrough };
  }
  if (!input.lastSyncAt || !input.since) {
    return {};
  }
  return { since: new Date(input.since.getTime() - COLLECTOSS_FIRST_SYNC_OVERLAP_MS) };
}

/**
 * Whether a completed CollectOSS run may move the incremental cursor forward.
 * Only runs that covered every phase and every contribution date that could
 * have been collected since the cursor are safe to advance from.
 */
export function shouldAdvanceCollectossCursor(input: {
  phases?: CollectionPhase[];
  incremental: boolean;
  jobType: 'sync' | 'full_sync';
  syncedThrough: Date | null;
}): boolean {
  const allPhases = !input.phases || ALL_PHASES.every((p) => input.phases?.includes(p));
  if (!allPhases) return false;
  return input.incremental || input.jobType === 'full_sync' || input.syncedThrough == null;
}

/**
 * Collect contributions for one project from its configured backend.
 *
 * Both backends emit identical ContributionRecords through onPhaseComplete.
 * A CollectOSS project falls back to GitHub (when COLLECTOSS_FALLBACK_TO_GITHUB
 * is enabled, the default) if CollectOSS is not configured, unreachable, or
 * does not track the repo — so data keeps flowing while coverage is incomplete.
 */
export async function collectProjectContributions(
  request: ProjectCollectionRequest,
  onProgress: CollectionProgressCallback,
  onPhaseComplete: CollectionPhaseCallback,
  backends: CollectionBackends = defaultBackends,
): Promise<ProjectCollectionOutcome> {
  const { project, phases } = request;
  const requestedDataSource: DataSource = request.dataSourceOverride
    ?? (project.dataSource === 'collectoss' ? 'collectoss' : 'github');
  const sinceForGithub = request.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const repo = {
    name: project.name || `${project.githubOrg}/${project.githubRepo}`,
    githubOrg: project.githubOrg,
    githubRepo: project.githubRepo,
    id: project.id,
  };

  const runGithub = async (fallbackReason?: string): Promise<ProjectCollectionOutcome> => {
    if (fallbackReason) {
      logger.warn(`CollectOSS unavailable for ${repo.name} — falling back to GitHub`, { reason: fallbackReason });
    }
    const github = await backends.github();
    await github.collectRepositoryContributions(repo, sinceForGithub, onProgress, onPhaseComplete, phases);
    return { requestedDataSource, dataSource: 'github', fallbackReason };
  };

  if (requestedDataSource === 'github') {
    return runGithub();
  }

  // ── CollectOSS ───────────────────────────────────────────────
  const fail = (reason: string): Promise<ProjectCollectionOutcome> => {
    if (config.collectossFallbackToGithub) return runGithub(reason);
    throw new Error(`CollectOSS collection failed for ${repo.name}: ${reason}`);
  };

  if (!isCollectossConfigured()) {
    return fail('COLLECTOSS_DATABASE_URL is not configured');
  }

  let repoId = project.collectossRepoId ?? null;
  if (repoId == null) {
    try {
      repoId = await backends.resolveRepoId(project.id, project.githubOrg, project.githubRepo);
    } catch (error) {
      return fail(`CollectOSS unreachable: ${errorMessage(error)}`);
    }
    if (repoId == null) {
      return fail(`${project.githubOrg}/${project.githubRepo} is not tracked in CollectOSS`);
    }
  }

  const syncedThrough = project.collectossSyncedThrough ?? null;
  const window = computeCollectossWindow({
    incremental: request.incremental,
    since: request.since,
    syncedThrough,
    lastSyncAt: project.lastSyncAt ?? null,
  });

  let adapter: Pick<CollectossAdapter, 'collectRepositoryContributions'>;
  try {
    adapter = await backends.collectoss();
  } catch (error) {
    return fail(errorMessage(error));
  }

  // Errors after this point are real collection failures (partial data may
  // already be persisted) — surface them so BullMQ retries instead of
  // silently switching backends mid-run.
  const result = await adapter.collectRepositoryContributions(repo, repoId, window, onProgress, onPhaseComplete, phases);

  const advance = result.highWaterMark != null && shouldAdvanceCollectossCursor({
    phases,
    incremental: request.incremental,
    jobType: request.jobType,
    syncedThrough,
  }) && (syncedThrough == null || result.highWaterMark > syncedThrough);

  if (advance && result.highWaterMark) {
    await db.update(projects)
      .set({ collectossSyncedThrough: result.highWaterMark, updatedAt: new Date() })
      .where(eq(projects.id, project.id));
  }

  return {
    requestedDataSource,
    dataSource: 'collectoss',
    collectoss: {
      repoId,
      window,
      highWaterMark: result.highWaterMark?.toISOString() ?? null,
      cursorAdvanced: advance,
    },
  };
}
