import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (two levels up from backend/src/shared/config)
const envPath = join(__dirname, '../../../../.env');
dotenv.config({ path: envPath, override: true });

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
  // Comma-separated list of GitHub orgs to sync team members from
  githubTeamOrgs: (process.env.GITHUB_TEAM_ORG || 'opendatahub-io')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  // Insight generation (Google Gemini)
  googleAIApiKey: process.env.GOOGLE_AI_API_KEY || '',

  // Auth — admin users/groups (comma-separated)
  adminUsers: process.env.ADMIN_USERS || '',
  adminGroups: process.env.ADMIN_GROUPS || '',

  // Organization
  orgName: process.env.ORG_NAME || 'My Organization',
  orgDescription: process.env.ORG_DESCRIPTION || '',
  orgDocsUrl: process.env.ORG_DOCS_URL || '',
  teamEmailDomain: process.env.TEAM_EMAIL_DOMAIN || '',

  // Instance admin (shown on About page when set)
  adminContactName: process.env.ADMIN_CONTACT_NAME || '',
  adminContactUrl: process.env.ADMIN_CONTACT_URL || '',

  // Monitoring
  prometheusEnabled: process.env.PROMETHEUS_ENABLED === 'true',
} as const;

// Validate required environment variables
export function validateConfig() {
  const required: (keyof typeof config)[] = ['githubToken'];

  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}
