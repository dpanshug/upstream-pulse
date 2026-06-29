import postgres from 'postgres';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let augurClient: postgres.Sql | null = null;
let initAttempted = false;

/**
 * Lazily initialise a read-only Postgres connection pool to the Augur DB.
 * Returns null when AUGUR_DATABASE_URL is not configured or the connection fails.
 */
export function getAugurClient(): postgres.Sql | null {
  if (augurClient) return augurClient;
  if (initAttempted) return null;

  initAttempted = true;

  if (!config.augurDatabaseUrl) {
    logger.info('Augur DB not configured (AUGUR_DATABASE_URL is empty) — CollectOSS disabled');
    return null;
  }

  try {
    augurClient = postgres(config.augurDatabaseUrl, {
      max: 5,
      idle_timeout: 30,
      connect_timeout: 15,
      types: { bigint: postgres.BigInt },
    });

    logger.info('Augur DB connection pool created (read-only, max 5)');
    return augurClient;
  } catch (error) {
    logger.error('Failed to create Augur DB connection pool', { error: (error as Error).message });
    return null;
  }
}

/**
 * Test connectivity to the Augur DB. Returns true if a simple query succeeds.
 */
export async function testAugurConnection(): Promise<boolean> {
  const client = getAugurClient();
  if (!client) return false;

  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    logger.warn('Augur DB connectivity check failed', { error: (error as Error).message });
    return false;
  }
}

/**
 * Check if the CollectOSS feature is available (configured + connectable).
 */
export function isAugurConfigured(): boolean {
  return !!config.augurDatabaseUrl;
}

/**
 * Gracefully close the Augur connection pool (for shutdown).
 */
export async function closeAugurClient(): Promise<void> {
  if (augurClient) {
    await augurClient.end();
    augurClient = null;
    initAttempted = false;
    logger.info('Augur DB connection pool closed');
  }
}
