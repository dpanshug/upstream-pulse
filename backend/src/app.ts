import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config, validateConfig } from './shared/config/index.js';
import { logger } from './shared/utils/logger.js';
import { db } from './shared/database/client.js';
import { teamMembers, projects } from './shared/database/schema.js';
import { eq, sql } from 'drizzle-orm';

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
    await db.execute(sql`SELECT 1`);

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

// Add new project
app.post<{
  Body: {
    name: string;
    githubOrg: string;
    githubRepo: string;
    ecosystem?: string;
    primaryLanguage?: string;
    startCollection?: boolean;  // Start collecting immediately
    fullHistory?: boolean;      // Collect from day 0
  };
}>('/api/projects', async (request, reply) => {
  try {
    const { name, githubOrg, githubRepo, ecosystem, primaryLanguage, startCollection, fullHistory } = request.body;

    if (!name || !githubOrg || !githubRepo) {
      reply.status(400);
      return { error: 'name, githubOrg, and githubRepo are required' };
    }

    // Validate repo exists on GitHub
    const { fetchGitHubRepoCreatedAt } = await import('./shared/utils/github.js');
    const repoCreatedAt = await fetchGitHubRepoCreatedAt(githubOrg, githubRepo);

    if (!repoCreatedAt) {
      reply.status(404);
      return { error: `Repository ${githubOrg}/${githubRepo} not found on GitHub` };
    }

    // Insert project
    const [newProject] = await db.insert(projects).values({
      name,
      githubOrg,
      githubRepo,
      ecosystem: ecosystem || 'unknown',
      primaryLanguage,
      trackingEnabled: true,
    }).returning();

    logger.info(`Created project: ${name} (${githubOrg}/${githubRepo})`);

    let collectionJob = null;
    let governanceJob = null;

    // Import scheduler
    const { CollectionScheduler } = await import('./jobs/scheduler.js');
    const scheduler = new CollectionScheduler();

    // Always trigger governance collection for new projects (OWNERS files)
    governanceJob = await scheduler.triggerProjectGovernance(newProject.id, 'new_project');
    logger.info(`Started governance collection for ${name}`);

    // Optionally start contribution collection
    if (startCollection) {
      // For new projects, always collect from repo creation date (sensible default)
      // There's no existing data, so full history makes sense
      collectionJob = await scheduler.triggerProjectCollection(newProject.id, repoCreatedAt);

      logger.info(`Started contribution collection for ${name}`, {
        since: repoCreatedAt.toISOString(),
      });
    }

    return {
      success: true,
      project: newProject,
      repoCreatedAt: repoCreatedAt.toISOString(),
      collection: collectionJob ? {
        jobId: collectionJob.id,
        since: fullHistory ? repoCreatedAt.toISOString() : undefined,
      } : null,
      governance: {
        jobId: governanceJob.id,
      },
    };
  } catch (error) {
    logger.error('Error creating project', { error });

    // Handle duplicate repo
    if ((error as any).code === '23505') {
      reply.status(409);
      return { error: 'This repository is already being tracked' };
    }

    reply.status(500);
    return {
      error: 'Failed to create project',
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

// Add new team member
app.post<{
  Body: {
    name: string;
    primaryEmail: string;
    githubUsername?: string;
    department?: string;
    role?: string;
  };
}>('/api/team-members', async (request, reply) => {
  try {
    const { name, primaryEmail, githubUsername, department, role } = request.body;

    if (!name) {
      reply.status(400);
      return { error: 'name is required' };
    }

    // Require at least one identifier (email or GitHub username)
    if (!primaryEmail && !githubUsername) {
      reply.status(400);
      return { error: 'Either primaryEmail or githubUsername is required' };
    }

    // Auto-fetch GitHub user ID if username is provided (soft failure - don't block creation)
    let githubUserId: number | null = null;
    if (githubUsername) {
      try {
        const { fetchGitHubUserId } = await import('./shared/utils/github.js');
        githubUserId = await fetchGitHubUserId(githubUsername);
        if (githubUserId) {
          logger.info(`Fetched GitHub user ID for @${githubUsername}: ${githubUserId}`);
        } else {
          logger.warn(`GitHub user @${githubUsername} not found, continuing without ID`);
        }
      } catch (error) {
        logger.warn(`Failed to fetch GitHub ID for @${githubUsername}, continuing without it`, { error });
      }
    }

    const [newMember] = await db.insert(teamMembers).values({
      name,
      primaryEmail,
      githubUsername,
      githubUserId,
      department,
      role,
      isActive: true,
    }).returning();

    logger.info(`Created team member: ${name} (@${githubUsername})`);

    return {
      success: true,
      member: newMember,
    };
  } catch (error) {
    logger.error('Error creating team member', { error });
    
    // Handle duplicate email
    if ((error as any).code === '23505') {
      reply.status(409);
      return { error: 'A team member with this email already exists' };
    }

    reply.status(500);
    return {
      error: 'Failed to create team member',
      message: (error as Error).message,
    };
  }
});

// Collection jobs API
app.post<{
  Body: {
    projectId: string;
    since?: string;        // ISO date string - fetch from this date
    fullHistory?: boolean; // Fetch from repo creation date (day 0)
  };
}>('/api/admin/collect', async (request, reply) => {
  try {
    const { projectId, since, fullHistory } = request.body;

    if (!projectId) {
      reply.status(400);
      return { error: 'projectId is required' };
    }

    // Validate project exists
    const project = await db.query.projects.findFirst({
      where: (projects, { eq }) => eq(projects.id, projectId),
    });

    if (!project) {
      reply.status(404);
      return { error: 'Project not found' };
    }

    const { CollectionScheduler } = await import('./jobs/scheduler.js');
    const scheduler = new CollectionScheduler();

    let sinceDate: Date | undefined;

    if (fullHistory) {
      // Fetch repo creation date from GitHub
      const { fetchGitHubRepoCreatedAt } = await import('./shared/utils/github.js');
      const createdAt = await fetchGitHubRepoCreatedAt(project.githubOrg, project.githubRepo);
      if (createdAt) {
        sinceDate = createdAt;
        logger.info(`Full history sync from repo creation: ${createdAt.toISOString()}`);
      } else {
        reply.status(500);
        return { error: 'Failed to fetch repo creation date from GitHub' };
      }
    } else if (since) {
      const parsedDate = new Date(since);
      if (isNaN(parsedDate.getTime())) {
        reply.status(400);
        return { error: 'Invalid date format for "since" parameter' };
      }
      sinceDate = parsedDate;
    }

    const job = await scheduler.triggerProjectCollection(projectId, sinceDate);

    return {
      success: true,
      jobId: job.id,
      message: fullHistory
        ? `Full history collection queued from ${sinceDate?.toISOString().split('T')[0]}`
        : 'Collection job queued',
      since: sinceDate?.toISOString(),
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

// Trigger governance refresh (OWNERS files collection)
app.post<{
  Params: { projectId?: string };
}>('/api/governance/refresh/:projectId?', async (request, reply) => {
  try {
    const { projectId } = request.params;

    const { CollectionScheduler } = await import('./jobs/scheduler.js');
    const scheduler = new CollectionScheduler();

    let job;
    let message;

    if (projectId) {
      // Validate project exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });

      if (!project) {
        reply.status(404);
        return { error: 'Project not found' };
      }

      job = await scheduler.triggerProjectGovernance(projectId, 'manual');
      message = `Governance refresh queued for ${project.name}`;
      logger.info(message);
    } else {
      // Refresh all projects
      job = await scheduler.triggerGovernanceRefresh();
      message = 'Governance refresh queued for all projects';
      logger.info(message);
    }

    return {
      success: true,
      jobId: job.id,
      message,
    };
  } catch (error) {
    logger.error('Error triggering governance refresh', { error });
    reply.status(500);
    return {
      error: 'Failed to trigger governance refresh',
      message: (error as Error).message,
    };
  }
});

// Manual team sync from GitHub org
app.post('/api/admin/team-sync', async (request, reply) => {
  try {
    const { CollectionScheduler } = await import('./jobs/scheduler.js');
    const scheduler = new CollectionScheduler();

    const job = await scheduler.triggerTeamSync('manual');
    const message = `Team sync queued for GitHub org: ${config.githubTeamOrg}`;
    logger.info(message);

    return {
      success: true,
      jobId: job.id,
      org: config.githubTeamOrg,
      message,
    };
  } catch (error) {
    logger.error('Error triggering team sync', { error });
    reply.status(500);
    return {
      error: 'Failed to trigger team sync',
      message: (error as Error).message,
    };
  }
});

// Manual leadership refresh endpoint
app.post('/api/leadership/refresh', async (request, reply) => {
  try {
    const { CollectionScheduler } = await import('./jobs/scheduler.js');
    const scheduler = new CollectionScheduler();

    const job = await scheduler.triggerManualLeadershipRefresh();
    const message = 'Leadership refresh queued (steering committee, WG chairs/leads)';
    logger.info(message);

    return {
      success: true,
      jobId: job.id,
      message,
    };
  } catch (error) {
    logger.error('Error triggering leadership refresh', { error });
    reply.status(500);
    return {
      error: 'Failed to trigger leadership refresh',
      message: (error as Error).message,
    };
  }
});

// WebSocket endpoint for real-time updates
app.register(async function (fastify) {
  fastify.get('/ws/updates', { websocket: true }, (connection, req) => {
    logger.info('WebSocket connection established');

    connection.socket.on('message', (message: unknown) => {
      connection.socket.send(JSON.stringify({
        type: 'echo',
        data: String(message),
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
