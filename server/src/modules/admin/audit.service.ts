import type { Request } from 'express';
import { logger } from '../../config/logger.js';
import { AuditLog } from './audit.model.js';

/**
 * Audit trail for privileged actions.
 *
 * Failure to write an audit row is logged but never fails the request: losing
 * the audit entry is bad, but failing a legitimate admin action because the
 * logging collection hiccupped is worse. The log line ensures the gap is at
 * least visible.
 */

export interface AuditInput {
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export async function recordAudit(req: Request, input: AuditInput): Promise<void> {
  try {
    await AuditLog.create({
      actorId: req.auth?.user._id ?? null,
      actorEmail: req.auth?.user.email ?? null,
      actorRole: req.auth?.role ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      summary: input.summary,
      before: input.before ?? null,
      after: input.after ?? null,
      ip: req.ip ?? null,
    });
  } catch (error) {
    logger.error({ err: error, action: input.action }, 'Failed to write audit log entry');
  }
}
