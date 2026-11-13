import { describe, it, expect, vi } from 'vitest';
import { relinkOrphanedRecords, relinkForMember } from './relink.js';

type DbArg = typeof import('../../shared/database/client.js').db;

function fakeDb(results: Array<number | Error>) {
  const execute = vi.fn(async () => {
    const next = results.shift();
    if (next instanceof Error) throw next;
    return { rowCount: next ?? 0 };
  });
  return { execute } as unknown as DbArg;
}

describe('relinkOrphanedRecords', () => {
  it('sums the row counts across the three tables', async () => {
    const result = await relinkOrphanedRecords(fakeDb([10, 2, 3]));

    expect(result).toEqual({
      contributions: 10,
      maintainerStatus: 2,
      leadershipPositions: 3,
      total: 15,
      errors: [],
    });
  });

  it('keeps going when one table fails, and reports the failure', async () => {
    const result = await relinkOrphanedRecords(
      fakeDb([new Error('invalid byte sequence for encoding "UTF8": 0x00'), 4, 0])
    );

    expect(result.contributions).toBe(0);
    expect(result.maintainerStatus).toBe(4);
    expect(result.total).toBe(4);
    expect(result.errors).toEqual([
      { table: 'contributions', message: 'invalid byte sequence for encoding "UTF8": 0x00' },
    ]);
  });

  it('treats a missing row count as zero', async () => {
    const execute = vi.fn(async () => ({}));
    const result = await relinkOrphanedRecords({ execute } as unknown as DbArg);

    expect(result.total).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('joins against one deduplicated identity row per username', async () => {
    const execute = vi.fn(async (_query: unknown) => ({ rowCount: 0 }));
    await relinkOrphanedRecords({ execute } as unknown as DbArg);

    // `github_username` is not unique, so joining team_members directly could
    // match the same orphaned row twice and let PostgreSQL pick which member
    // receives it. Every statement must use the deduplicated target instead.
    const statements = execute.mock.calls.map(([query]) =>
      JSON.stringify((query as { queryChunks?: unknown[] }).queryChunks)
    );
    expect(statements).toHaveLength(3);
    for (const statement of statements) {
      expect(statement).toContain('DISTINCT ON (lower(github_username))');
      expect(statement).not.toContain('FROM team_members tm');
    }
  });
});

describe('relinkForMember', () => {
  it('returns per-table counts and no errors on success', async () => {
    const result = await relinkForMember(fakeDb([7, 1, 0]), 'member-id', 'hjrnunes');

    expect(result).toEqual({
      contributions: 7,
      maintainerStatus: 1,
      leadershipPositions: 0,
      errors: [],
    });
  });

  it('reports a failure without throwing', async () => {
    const result = await relinkForMember(fakeDb([new Error('boom'), 0, 0]), 'member-id', 'a');

    expect(result.contributions).toBe(0);
    expect(result.errors).toEqual([{ table: 'contributions', message: 'boom' }]);
  });
});
