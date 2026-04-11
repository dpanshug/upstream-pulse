import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './client.js';
import { client } from './client.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Apply all pending database migrations.
 * Run via: npm run db:migrate
 */
export async function runMigrations() {
  console.log('Running database migrations...');

  // Idempotent patches for databases that predate Drizzle migrations
  // Only run if team_members table exists
  await client.unsafe(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'team_members') THEN
        ALTER TABLE team_members ADD COLUMN IF NOT EXISTS source varchar(50) DEFAULT 'manual';
      END IF;
    END $$;
  `);

  await migrate(db, {
    migrationsFolder: join(__dirname, 'migrations'),
  });

  console.log('Database migrations completed successfully.');
}
