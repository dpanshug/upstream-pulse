import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface UserIdentity {
  username: string;
  email: string;
  groups: string[];
  isAdmin: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    identity: UserIdentity;
  }
}

const DEV_IDENTITY: UserIdentity = {
  username: 'dev-user',
  email: 'dev@localhost',
  groups: [],
  isAdmin: true,
};

function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function checkAdmin(username: string, email: string, groups: string[]): boolean {
  const adminUsers = parseCommaSeparated(config.adminUsers);
  const adminGroups = parseCommaSeparated(config.adminGroups);

  if (adminUsers.length === 0 && adminGroups.length === 0) {
    return false;
  }

  if (adminUsers.some(u => u === username || u === email)) {
    return true;
  }

  if (adminGroups.length > 0 && groups.some(g => adminGroups.includes(g))) {
    return true;
  }

  return false;
}

export function registerIdentityMiddleware(app: FastifyInstance): void {
  app.decorateRequest('identity', null as unknown as UserIdentity);

  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    const username = request.headers['x-forwarded-user'] as string | undefined;
    const email = request.headers['x-forwarded-email'] as string | undefined;
    const groupsHeader = request.headers['x-forwarded-groups'] as string | undefined;

    if (username || email) {
      const groups = groupsHeader ? parseCommaSeparated(groupsHeader) : [];
      const resolvedUsername = username || email || 'unknown';
      const resolvedEmail = email || '';

      request.identity = {
        username: resolvedUsername,
        email: resolvedEmail,
        groups,
        isAdmin: checkAdmin(resolvedUsername, resolvedEmail, groups),
      };
      return;
    }

    if (config.nodeEnv === 'development') {
      request.identity = DEV_IDENTITY;
      return;
    }

    request.identity = {
      username: 'anonymous',
      email: '',
      groups: [],
      isAdmin: false,
    };
  });
}
