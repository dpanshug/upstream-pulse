/**
 * Vitest global setup — runs once before all test files.
 *
 * Creates the test database (if needed), applies migrations, and seeds
 * deterministic fixture data so integration tests can assert exact values.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { join } from 'path';
import { seedTestData } from './seed.js';

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL
  ?? 'postgresql://postgres:password@localhost:5433/postgres';
const TEST_DB = 'upstream_pulse_test';
const TEST_URL = process.env.TEST_DATABASE_URL
  ?? `postgresql://postgres:password@localhost:5433/${TEST_DB}`;

export async function setup() {
  // 1. Create the test database (idempotent)
  const admin = postgres(ADMIN_URL, { max: 1 });
  const exists = await admin`
    SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}
  `;
  if (exists.length === 0) {
    await admin.unsafe(`CREATE DATABASE ${TEST_DB}`);
  }
  await admin.end();

  // 2. Apply migrations
  const client = postgres(TEST_URL, { max: 2 });
  const db = drizzle(client);

  // process.cwd() is always the backend/ directory when vitest runs
  const migrationsFolder = join(process.cwd(), 'src/shared/database/migrations');

  // Idempotent patch matching run-migrate.ts
  await client.unsafe(`
    ALTER TABLE IF EXISTS team_members ADD COLUMN IF NOT EXISTS source varchar(50) DEFAULT 'manual';
  `);

  await migrate(db, { migrationsFolder });

  // Migrations 0004 and 0005 are not tracked in the drizzle journal
  // (they were added manually). Apply them idempotently here.
  await client.unsafe(`
    ALTER TABLE "maintainer_status" ADD COLUMN IF NOT EXISTS "scope" varchar(20) DEFAULT 'root';
    CREATE INDEX IF NOT EXISTS "maintainer_scope_idx" ON "maintainer_status" ("scope");
    DO $$ BEGIN ALTER TABLE "maintainer_status" ALTER COLUMN "notes" TYPE varchar(5000); EXCEPTION WHEN OTHERS THEN NULL; END $$;

    ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "source_org" varchar(255);
    CREATE INDEX IF NOT EXISTS "team_members_source_org_idx" ON "team_members" ("source_org");
  `);

  // 3. Seed deterministic test data
  await seedTestData(client);

  await client.end();

  // 4. Export the URL for test processes
  process.env.DATABASE_URL = TEST_URL;
}

export async function teardown() {
  // Leave the DB around for debugging. CI containers are ephemeral.
}
