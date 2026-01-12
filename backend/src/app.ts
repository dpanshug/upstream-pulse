import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config, validateConfig } from './shared/config/index.js';
import { logger } from './shared/utils/logger.js';
import { db } from './shared/database/client.js';

// Validate configuration on startup
try {
  validateConfig();
} catch (error) {
  logger.error('Configuration validation failed', { error });
  process.exit(1);
}

// Create Fastify instance
const app = Fastify({
  logger: {
    level: config.logLevel,
  },
  requestIdHeader: 'x-request-id',
  disableRequestLogging: false,
});

// Register plugins
await app.register(cors, {
  origin: true, // Allow all origins in development
  credentials: true,
});

await app.register(websocket);

// Health check endpoint
app.get('/health', async (request, reply) => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
});

// Ready check (includes database)
app.get('/ready', async (request, reply) => {
  try {
    // Check database connection
    await db.execute('SELECT 1');

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      database: 'connected',
    };
  } catch (error) {
    reply.status(503);
    return {
      status: 'not ready',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: (error as Error).message,
    };
  }
});

// Register API routes
import { metricsRoutes } from './modules/api/routes/metrics.js';
await app.register(metricsRoutes);

// Projects API
app.get('/api/projects', async (request, reply) => {
  try {
    const projectsList = await db.query.projects.findMany({
      where: (projects, { eq }) => eq(projects.trackingEnabled, true),
      limit: 50,
    });

    return {
      projects: projectsList,
      total: projectsList.length,
    };
  } catch (error) {
    logger.error('Error fetching projects', { error });
    reply.status(500);
    return {
      error: 'Failed to fetch projects',
      message: (error as Error).message,
    };
  }
});

// Team members API
app.get('/api/team-members', async (request, reply) => {
  try {
    const members = await db.query.teamMembers.findMany({
      where: (teamMembers, { eq }) => eq(teamMembers.isActive, true),
      limit: 100,
    });

    return {
      members,
      total: members.length,
    };
  } catch (error) {
    logger.error('Error fetching team members', { error });
    reply.status(500);
    return {
      error: 'Failed to fetch team members',
      message: (error as Error).message,
    };
  }
});

// Collection jobs API
app.post<{
  Body: { projectId: string };
}>('/api/admin/collect', async (request, reply) => {
  try {
    const { CollectionScheduler } = await import('./jobs/scheduler.js');
    const scheduler = new CollectionScheduler();

    const job = await scheduler.triggerProjectCollection(request.body.projectId);

    return {
      success: true,
      jobId: job.id,
      message: 'Collection job queued',
    };
  } catch (error) {
    logger.error('Error triggering collection', { error });
    reply.status(500);
    return {
      error: 'Failed to trigger collection',
      message: (error as Error).message,
    };
  }
});

// WebSocket endpoint for real-time updates
app.register(async function (fastify) {
  fastify.get('/ws/updates', { websocket: true }, (connection, req) => {
    logger.info('WebSocket connection established');

    connection.socket.on('message', (message) => {
      // Echo back for now
      connection.socket.send(JSON.stringify({
        type: 'echo',
        data: message.toString(),
        timestamp: new Date().toISOString(),
      }));
    });

    connection.socket.on('close', () => {
      logger.info('WebSocket connection closed');
    });

    // Send initial message
    connection.socket.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to upstream-pulse',
      timestamp: new Date().toISOString(),
    }));
  });
});

// Error handler
app.setErrorHandler((error, request, reply) => {
  logger.error('Request error', {
    error,
    method: request.method,
    url: request.url,
  });

  reply.status(error.statusCode || 500).send({
    error: error.message || 'Internal Server Error',
    statusCode: error.statusCode || 500,
  });
});

// Start server
const start = async () => {
  try {
    await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    logger.info(`Server listening on port ${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`Health check: http://localhost:${config.port}/health`);

  } catch (error) {
    logger.error('Error starting server', { error });
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await app.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await app.close();
  process.exit(0);
});

start();
