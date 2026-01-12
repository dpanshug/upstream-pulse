import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/upstream_pulse';

// Create postgres client
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Export drizzle instance
export const db = drizzle(client, { schema });

// Export raw client for direct queries if needed
export { client };
