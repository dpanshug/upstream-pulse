/**
 * Vitest per-file setup — runs before each test file.
 *
 * Points the shared DB client at the test database so the real
 * MetricsService operates against seeded test data.
 */

const TEST_URL = process.env.TEST_DATABASE_URL
  ?? 'postgresql://postgres:password@localhost:5433/upstream_pulse_test';

// Must be set before any app module is imported
process.env.DATABASE_URL = TEST_URL;

// Suppress noisy log output during tests
process.env.LOG_LEVEL = 'error';
