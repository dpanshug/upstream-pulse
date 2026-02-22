import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (two levels up from backend/src/shared/config)
const envPath = join(__dirname, '../../../../.env');
const result = dotenv.config({ path: envPath, override: true });
console.log('[Config] Loading .env from:', envPath);
if (result.error) {
  console.error('[Config] Error loading .env:', result.error);
} else {
  console.log('[Config] Successfully loaded .env');
  console.log('[Config] GITHUB_TOKEN present:', !!process.env.GITHUB_TOKEN);
  console.log('[Config] GITHUB_TOKEN starts with:', process.env.GITHUB_TOKEN?.substring(0, 10));
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/upstream_pulse',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // GitHub (public repo data)
  githubToken: process.env.GITHUB_TOKEN || '',
  githubOrg: process.env.GITHUB_ORG || 'kubernetes',

  // GitHub org team sync (personal PAT with read:org)
  githubTeamToken: process.env.GITHUB_TEAM_TOKEN || process.env.GITHUB_TOKEN || '',
  githubTeamOrg: process.env.GITHUB_TEAM_ORG || 'opendatahub-io',

  // AI
  googleAIApiKey: process.env.GOOGLE_AI_API_KEY || '',

  // Auth
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Monitoring
  prometheusEnabled: process.env.PROMETHEUS_ENABLED === 'true',
} as const;

// Validate required environment variables
export function validateConfig() {
  const required: (keyof typeof config)[] = ['githubToken', 'googleAIApiKey'];

  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}
