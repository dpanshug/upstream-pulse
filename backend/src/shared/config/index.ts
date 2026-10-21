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

  // CollectOSS (optional — alternative contribution data source, read-only Postgres)
  collectossDatabaseUrl: process.env.COLLECTOSS_DATABASE_URL || '',
  // Schema holding CollectOSS tables ('data' since CollectOSS 1.0; 'augur_data' on legacy Augur DBs)
  collectossSchema: process.env.COLLECTOSS_SCHEMA || 'data',
  // Data source assigned to newly added projects: 'github' | 'collectoss'
  defaultDataSource: (process.env.DEFAULT_DATA_SOURCE === 'collectoss' ? 'collectoss' : 'github') as 'github' | 'collectoss',
  // When a CollectOSS project's repo is missing/unreachable in CollectOSS, collect from GitHub instead of failing
  collectossFallbackToGithub: process.env.COLLECTOSS_FALLBACK_TO_GITHUB !== 'false',

  // GitHub (public repo data)
  githubToken: process.env.GITHUB_TOKEN || '',
  githubOrg: process.env.GITHUB_ORG || 'kubernetes',

  // GitHub org team sync (personal PAT with read:org)
  githubTeamToken: process.env.GITHUB_TEAM_TOKEN || process.env.GITHUB_TOKEN || '',
  // Comma-separated list of GitHub orgs to sync team members from (opt-in: leave empty to disable)
  githubTeamOrgs: (process.env.GITHUB_TEAM_ORG || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  // Org registry autoseed (opt-in): on startup, insert the orgs declared in
  // ORG_REGISTRY (collection config) into the orgs table so collection can
  // start without manual setup. Defaults to false — each deployment should
  // manage its own org list via the UI/API rather than inheriting the
  // registry defaults.
  orgRegistryAutoseed: process.env.ORG_REGISTRY_AUTOSEED === 'true',

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

  // Dev identity (used in development mode when no OAuth headers are present)
  devUserEmail: process.env.DEV_USER_EMAIL || '',
  devUserName: process.env.DEV_USER_NAME || '',

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
