import { Request, Response, NextFunction } from 'express';
import {
  getSecurityDashboardStats,
  getAuditTrail,
} from '../services/security.service';
import { ApiError, sendSuccess } from '../utils/api-response';

/**
 * GET /api/v1/security/dashboard-stats
 * High-level counts for pending claims, handovers awaiting release, custody inventory, and recent events.
 */
export async function getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required.');
    }

    const stats = await getSecurityDashboardStats(req.user.role);
    sendSuccess(res, stats, 200, 'Security operations dashboard statistics retrieved.');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/security/audit-trail
 * Paginated compliance audit trail.
 */
export async function listAuditTrail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required.');
    }

    const { action, targetEntity, actorRole, page, limit } = req.query as {
      action?: string;
      targetEntity?: string;
      actorRole?: string;
      page?: string;
      limit?: string;
    };

    const result = await getAuditTrail(req.user.role, {
      action,
      targetEntity,
      actorRole,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    sendSuccess(res, result.entries, 200, 'Audit trail retrieved successfully.', {
      page: result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
      totalPages: result.pagination.totalPages,
    });
  } catch (error) {
    next(error);
  }
}
