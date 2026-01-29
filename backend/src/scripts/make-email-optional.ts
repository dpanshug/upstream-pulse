/**
 * Migration script: Make primaryEmail optional
 */

import { db } from '../shared/database/client.js';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('Making primary_email column optional...');
  
  try {
    await db.execute(sql`ALTER TABLE team_members ALTER COLUMN primary_email DROP NOT NULL`);
    console.log('Successfully updated column - primary_email is now optional');
  } catch (error) {
    console.error('Error:', (error as Error).message);
  }
  
  process.exit(0);
}

migrate();
