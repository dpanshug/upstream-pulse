import postgres from 'postgres';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let collectossClient: postgres.Sql | null = null;

/**
 * Whether a CollectOSS database is configured (COLLECTOSS_DATABASE_URL set).
 * Says nothing about reachability — use testCollectossConnection() for that.
 */
export function isCollectossConfigured(): boolean {
  return !!config.collectossDatabaseUrl;
}

/**
 * Human-readable message for driver errors. Connection failures from
 * postgres.js (e.g. ECONNREFUSED as an AggregateError) often have an empty
 * `message`, which made logs useless.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message) return error.message;
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    if (error instanceof AggregateError && error.errors.length > 0) return errorMessage(error.errors[0]);
    return error.name;
  }
  return String(error);
}

/** OID of Postgres `timestamp without time zone`. */
const TIMESTAMP_OID = 1114;

/**
 * Connection options for CollectOSS (exported so tests use identical settings).
 *
 * - Read-only sessions.
 * - CollectOSS stores most timestamps as `timestamp without time zone` (UTC).
 *   postgres.js would parse those in the Node process's local timezone, which
 *   silently shifts dates (and the incremental cursor) on non-UTC hosts. They
 *   are parsed as UTC instead, and the session TimeZone is pinned to UTC so
 *   comparisons against timestamptz parameters are consistent.
 * - int8/bigint columns come back as strings (postgres.js default); callers
 *   convert with Number().
 */
export function collectossConnectionOptions(max = 5) {
  return {
    max,
    idle_timeout: 30,
    connect_timeout: 15,
    types: {
      timestampUtc: {
        to: TIMESTAMP_OID,
        from: [TIMESTAMP_OID],
        serialize: (x: Date | string) => (x instanceof Date ? x : new Date(x)).toISOString(),
        parse: (x: string) => new Date(`${x.replace(' ', 'T')}Z`),
      },
    },
    connection: {
      application_name: 'upstream-pulse',
      default_transaction_read_only: true,
      statement_timeout: 300_000,
      TimeZone: 'UTC',
    },
    onnotice: () => {},
  };
}

/**
 * Lazily create a connection pool to the CollectOSS database.
 *
 * Every session is forced read-only (`default_transaction_read_only=on`) so a
 * bug in Upstream Pulse can never write to the externally owned database,
 * regardless of the privileges of the configured role.
 *
 * Returns null when COLLECTOSS_DATABASE_URL is not configured. The pool itself
 * connects lazily, so creation does not fail on an unreachable host — query
 * errors surface at call sites.
 */
export function getCollectossClient(): postgres.Sql | null {
  if (collectossClient) return collectossClient;
  if (!config.collectossDatabaseUrl) return null;

  collectossClient = postgres(config.collectossDatabaseUrl, collectossConnectionOptions());

  logger.info('CollectOSS DB connection pool created (read-only, max 5)');
  return collectossClient;
}

/** Test connectivity to the CollectOSS DB. Returns true if a trivial query succeeds. */
export async function testCollectossConnection(): Promise<boolean> {
  const client = getCollectossClient();
  if (!client) return false;

  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    logger.warn('CollectOSS DB connectivity check failed', { error: errorMessage(error) });
    return false;
  }
}

/** Gracefully close the CollectOSS connection pool (for shutdown). */
export async function closeCollectossClient(): Promise<void> {
  if (!collectossClient) return;
  const client = collectossClient;
  collectossClient = null;
  await client.end({ timeout: 5 });
  logger.info('CollectOSS DB connection pool closed');
}
