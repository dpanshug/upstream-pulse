import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/database/client.js';
import { projects } from '../../shared/database/schema.js';
import { config } from '../../shared/config/index.js';
import { IDS } from '../../test/seed.js';
import type { ContributionRecord, Project } from '../../shared/types/index.js';
import {
  collectProjectContributions,
  computeCollectossWindow,
  shouldAdvanceCollectossCursor,
  COLLECTOSS_FIRST_SYNC_OVERLAP_MS,
  type CollectionBackends,
} from './project-collection.js';

type MutableConfig = { -readonly [K in keyof typeof config]: (typeof config)[K] };
const mutableConfig = config as MutableConfig;

const DAY = 24 * 60 * 60 * 1000;

describe('computeCollectossWindow', () => {
  const since = new Date('2026-06-01T00:00:00Z');

  it('uses the contribution-date range for explicit (non-incremental) runs', () => {
    expect(computeCollectossWindow({ incremental: false, since, syncedThrough: new Date(), lastSyncAt: new Date() }))
      .toEqual({ since });
  });

  it('reads everything for a non-incremental run without a date', () => {
    expect(computeCollectossWindow({ incremental: false, syncedThrough: null, lastSyncAt: null })).toEqual({});
  });

  it('uses the data_collection_date cursor for incremental runs once one exists', () => {
    const syncedThrough = new Date('2026-06-10T00:00:00Z');
    expect(computeCollectossWindow({ incremental: true, since, syncedThrough, lastSyncAt: new Date() }))
      .toEqual({ collectedAfter: syncedThrough });
  });

  it('backfills everything on the first incremental run of a never-synced project', () => {
    expect(computeCollectossWindow({ incremental: true, since, syncedThrough: null, lastSyncAt: null })).toEqual({});
  });

  it('overlaps the first incremental run of a project previously collected from GitHub', () => {
    const window = computeCollectossWindow({ incremental: true, since, syncedThrough: null, lastSyncAt: since });
    expect(window.since?.getTime()).toBe(since.getTime() - COLLECTOSS_FIRST_SYNC_OVERLAP_MS);
    expect(window.collectedAfter).toBeUndefined();
  });
});

describe('shouldAdvanceCollectossCursor', () => {
  it('advances after a full incremental run', () => {
    expect(shouldAdvanceCollectossCursor({ incremental: true, jobType: 'sync', syncedThrough: new Date() })).toBe(true);
  });

  it('does not advance when only some phases ran', () => {
    expect(shouldAdvanceCollectossCursor({
      phases: ['commits'], incremental: true, jobType: 'sync', syncedThrough: null,
    })).toBe(false);
  });

  it('advances after a full-history run', () => {
    expect(shouldAdvanceCollectossCursor({ incremental: false, jobType: 'full_sync', syncedThrough: new Date() })).toBe(true);
  });

  it('does not move an existing cursor from a partial date-range run', () => {
    expect(shouldAdvanceCollectossCursor({ incremental: false, jobType: 'sync', syncedThrough: new Date() })).toBe(false);
  });

  it('seeds the cursor from a date-range run when none exists yet', () => {
    expect(shouldAdvanceCollectossCursor({ incremental: false, jobType: 'sync', syncedThrough: null })).toBe(true);
  });
});

describe('collectProjectContributions (backend dispatch)', () => {
  const savedConfig = { ...config };
  let project: Project;

  const record: ContributionRecord = { type: 'pr', githubId: '1', author: 'alice-gh', date: new Date() };

  function fakeBackends(opts: {
    repoId?: number | null;
    resolveError?: Error;
    highWaterMark?: Date | null;
  } = {}) {
    const github = vi.fn(async (_repo, _since, _onProgress, onPhaseComplete) => {
      await onPhaseComplete?.('pull_requests', [record]);
      return [];
    });
    const collectoss = vi.fn(async (_project, _repoId, _window, _onProgress, onPhaseComplete) => {
      await onPhaseComplete?.('pull_requests', [record]);
      return { collected: 1, highWaterMark: opts.highWaterMark ?? new Date('2026-07-01T00:00:00Z') };
    });
    const resolveRepoId = vi.fn(async () => {
      if (opts.resolveError) throw opts.resolveError;
      return opts.repoId === undefined ? 42 : opts.repoId;
    });
    const backends: CollectionBackends = {
      github: async () => ({ collectRepositoryContributions: github }),
      collectoss: async () => ({ collectRepositoryContributions: collectoss }),
      resolveRepoId,
    };
    return { backends, github, collectoss, resolveRepoId };
  }

  beforeEach(async () => {
    mutableConfig.collectossDatabaseUrl = 'postgresql://collectoss.invalid/collectoss';
    mutableConfig.collectossFallbackToGithub = true;
    await db.update(projects)
      .set({ dataSource: 'collectoss', collectossRepoId: null, collectossSyncedThrough: null })
      .where(eq(projects.id, IDS.projAlpha));
    const row = await db.query.projects.findFirst({ where: eq(projects.id, IDS.projAlpha) });
    if (!row) throw new Error('seed project missing');
    project = row;
  });

  afterEach(async () => {
    Object.assign(mutableConfig, savedConfig);
    await db.update(projects)
      .set({ dataSource: 'github', collectossRepoId: null, collectossSyncedThrough: null })
      .where(eq(projects.id, IDS.projAlpha));
  });

  it('uses GitHub for github projects without touching CollectOSS', async () => {
    const { backends, github, collectoss, resolveRepoId } = fakeBackends();
    const stored: ContributionRecord[] = [];
    const outcome = await collectProjectContributions(
      { project: { ...project, dataSource: 'github' }, jobType: 'sync', incremental: true },
      () => {},
      async (_phase, records) => { stored.push(...records); },
      backends,
    );
    expect(outcome).toMatchObject({ requestedDataSource: 'github', dataSource: 'github' });
    expect(github).toHaveBeenCalledOnce();
    expect(collectoss).not.toHaveBeenCalled();
    expect(resolveRepoId).not.toHaveBeenCalled();
    expect(stored).toHaveLength(1);
  });

  it('collects from CollectOSS, resolves the repo and advances the cursor', async () => {
    const hwm = new Date('2026-07-01T00:00:00Z');
    const { backends, github, collectoss, resolveRepoId } = fakeBackends({ highWaterMark: hwm });
    const outcome = await collectProjectContributions(
      { project, jobType: 'sync', incremental: true, since: new Date(Date.now() - DAY) },
      () => {},
      async () => {},
      backends,
    );
    expect(outcome.dataSource).toBe('collectoss');
    expect(outcome.collectoss).toMatchObject({ repoId: 42, cursorAdvanced: true, highWaterMark: hwm.toISOString() });
    expect(resolveRepoId).toHaveBeenCalledOnce();
    expect(collectoss).toHaveBeenCalledOnce();
    expect(github).not.toHaveBeenCalled();

    const updated = await db.query.projects.findFirst({ where: eq(projects.id, IDS.projAlpha) });
    expect(updated?.collectossSyncedThrough?.getTime()).toBe(hwm.getTime());
  });

  it('passes the stored cursor to CollectOSS on incremental runs', async () => {
    const cursor = new Date('2026-06-15T00:00:00Z');
    const { backends, collectoss } = fakeBackends();
    await collectProjectContributions(
      { project: { ...project, collectossRepoId: 7, collectossSyncedThrough: cursor }, jobType: 'sync', incremental: true },
      () => {},
      async () => {},
      backends,
    );
    expect(collectoss.mock.calls[0][1]).toBe(7);
    expect(collectoss.mock.calls[0][2]).toEqual({ collectedAfter: cursor });
  });

  it('never moves the cursor backwards', async () => {
    const cursor = new Date('2026-08-01T00:00:00Z');
    const { backends } = fakeBackends({ highWaterMark: new Date('2026-07-01T00:00:00Z') });
    const outcome = await collectProjectContributions(
      { project: { ...project, collectossRepoId: 7, collectossSyncedThrough: cursor }, jobType: 'sync', incremental: true },
      () => {},
      async () => {},
      backends,
    );
    expect(outcome.collectoss?.cursorAdvanced).toBe(false);
  });

  it('falls back to GitHub when the repo is not tracked in CollectOSS', async () => {
    const { backends, github, collectoss } = fakeBackends({ repoId: null });
    const outcome = await collectProjectContributions(
      { project, jobType: 'sync', incremental: true },
      () => {},
      async () => {},
      backends,
    );
    expect(outcome.dataSource).toBe('github');
    expect(outcome.requestedDataSource).toBe('collectoss');
    expect(outcome.fallbackReason).toMatch(/not tracked/);
    expect(github).toHaveBeenCalledOnce();
    expect(collectoss).not.toHaveBeenCalled();
  });

  it('falls back to GitHub when CollectOSS is unreachable', async () => {
    const { backends, github } = fakeBackends({ resolveError: new Error('ECONNREFUSED') });
    const outcome = await collectProjectContributions(
      { project, jobType: 'sync', incremental: true },
      () => {},
      async () => {},
      backends,
    );
    expect(outcome.dataSource).toBe('github');
    expect(outcome.fallbackReason).toMatch(/unreachable/);
    expect(github).toHaveBeenCalledOnce();
  });

  it('falls back to GitHub when CollectOSS is not configured', async () => {
    mutableConfig.collectossDatabaseUrl = '';
    const { backends, github } = fakeBackends();
    const outcome = await collectProjectContributions(
      { project, jobType: 'sync', incremental: true },
      () => {},
      async () => {},
      backends,
    );
    expect(outcome.dataSource).toBe('github');
    expect(outcome.fallbackReason).toMatch(/not configured/);
    expect(github).toHaveBeenCalledOnce();
  });

  it('fails instead of falling back when COLLECTOSS_FALLBACK_TO_GITHUB=false', async () => {
    mutableConfig.collectossFallbackToGithub = false;
    const { backends, github } = fakeBackends({ repoId: null });
    await expect(collectProjectContributions(
      { project, jobType: 'sync', incremental: true },
      () => {},
      async () => {},
      backends,
    )).rejects.toThrow(/not tracked/);
    expect(github).not.toHaveBeenCalled();
  });

  it('honours an explicit per-run data source override', async () => {
    const { backends, github, collectoss } = fakeBackends();
    const outcome = await collectProjectContributions(
      { project, jobType: 'sync', incremental: true, dataSourceOverride: 'github' },
      () => {},
      async () => {},
      backends,
    );
    expect(outcome.dataSource).toBe('github');
    expect(github).toHaveBeenCalledOnce();
    expect(collectoss).not.toHaveBeenCalled();
  });
});
