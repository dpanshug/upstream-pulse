import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger.js';

/**
 * Request bodies larger than this are not written to the audit log verbatim.
 * The roster bulk sync carries hundreds of people and their email addresses and
 * runs every two hours; dumping it would put PII in the logs and bury real
 * audit entries.
 */
const AUDIT_BODY_LIMIT = 2000;

export function auditBody(body: unknown): unknown {
  if (body == null) return undefined;

  let serialized: string;
  try {
    serialized = JSON.stringify(body) ?? '';
  } catch {
    return { omitted: true, reason: 'unserializable' };
  }

  if (serialized.length <= AUDIT_BODY_LIMIT) return body;

  const shapes = Object.entries(body as Record<string, unknown>)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => `${key}:${(value as unknown[]).length}`);

  return {
    omitted: true,
    bytes: serialized.length,
    arrays: shapes.length > 0 ? shapes.join(', ') : undefined,
  };
}

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
    body: request.method === 'POST' ? auditBody(request.body) : undefined,
  });
}
