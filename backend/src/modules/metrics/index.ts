/**
 * Metrics Module
 * 
 * On-demand metrics calculation from raw contributions data.
 * 
 * Usage:
 *   import { metricsService } from './modules/metrics';
 *   
 *   const dashboard = await metricsService.getDashboardMetrics({ days: 30 });
 * 
 * Extending:
 *   1. Add new types to types.ts
 *   2. Add new methods to MetricsService class
 *   3. Add new API endpoints in routes/metrics.ts
 */

export * from './types.js';
export * from './metrics-service.js';
