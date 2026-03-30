import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger.js';

/**
 * Fastify preHandler that rejects requests from non-admin users.
 * Logs an audit entry for every admin action (allowed or denied).
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { identity } = request;
  const action = `${request.method}:${request.url}`;

  if (!identity || !identity.isAdmin) {
    logger.warn('[AUDIT] Admin access denied', {
      user: identity?.username || 'unknown',
      action,
    });
    reply.status(403).send({
      error: 'Forbidden',
      message: 'Admin privileges required for this action',
      statusCode: 403,
    });
    return;
  }

  logger.info('[AUDIT] Admin action', {
    user: identity.username,
    action,
    body: request.method === 'POST' ? request.body : undefined,
  });
}
