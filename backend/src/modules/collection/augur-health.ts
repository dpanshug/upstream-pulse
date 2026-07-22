import { getAugurClient, isAugurConfigured } from '../../shared/database/augur-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface AugurHealthStatus {
  configured: boolean;
  connected: boolean;
  tablesVerified: boolean;
  missingTables: string[];
  lastChecked: string;
}

const REQUIRED_TABLES = [
  'data.repo',
  'data.commits',
  'data.pull_requests',
  'data.pull_request_reviews',
  'data.issues',
  'data.contributors',
] as const;

let lastHealthStatus: AugurHealthStatus | null = null;

/**
 * Run a startup health check against the Augur DB.
 * Verifies connectivity and that expected tables exist.
 * Logs warnings but never throws — CollectOSS degrades gracefully.
 */
export async function checkAugurHealth(): Promise<AugurHealthStatus> {
  const status: AugurHealthStatus = {
    configured: isAugurConfigured(),
    connected: false,
    tablesVerified: false,
    missingTables: [],
    lastChecked: new Date().toISOString(),
  };

  if (!status.configured) {
    lastHealthStatus = status;
    return status;
  }

  const client = getAugurClient();
  if (!client) {
    logger.warn('Augur health check: connection pool unavailable');
    lastHealthStatus = status;
    return status;
  }

  try {
    await client`SELECT 1`;
    status.connected = true;
  } catch (error) {
    logger.error('Augur health check: connectivity failed', { error: (error as Error).message });
    lastHealthStatus = status;
    return status;
  }

  let missing: string[] = [];
  try {
    const rows = await client`
      SELECT table_schema || '.' || table_name AS full_name
      FROM information_schema.tables
      WHERE table_schema = 'data'
        AND table_name IN ('repo', 'commits', 'pull_requests', 'pull_request_reviews', 'issues', 'contributors')
    `;
    const found = new Set(rows.map((r) => String(r.full_name)));
    missing = REQUIRED_TABLES.filter(table => !found.has(table));
  } catch (error) {
    logger.error('Augur health check: table verification query failed', { error: (error as Error).message });
    status.missingTables = [...REQUIRED_TABLES];
    lastHealthStatus = status;
    return status;
  }

  status.missingTables = missing;
  status.tablesVerified = missing.length === 0;

  if (missing.length > 0) {
    logger.warn('Augur health check: missing tables — CollectOSS may not work correctly', { missing });
  } else {
    logger.info('Augur health check: all required tables verified');
  }

  lastHealthStatus = status;
  return status;
}

export function getLastAugurHealth(): AugurHealthStatus | null {
  return lastHealthStatus;
}
