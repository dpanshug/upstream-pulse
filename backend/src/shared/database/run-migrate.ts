import '../config/index.js';
import { runMigrations } from './migrate.js';

try {
  await runMigrations();
  console.log('Migrations applied successfully.');
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
