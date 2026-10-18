import { Request, Response, NextFunction } from 'express';
import {
  getCustodyInventory,
  transferCustody,
  getItemCustodyHistory,
} from '../services/custody.service';
import { ApiError, sendSuccess } from '../utils/api-response';
import { CustodyAction, ItemStatus } from '../constants/enums';

/**
 * GET /api/v1/custody/inventory
 * List items currently in security custody / lockers.
 */
export async function listCustodyInventory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required.');
    }

    const { search, category, campusZone, status, desk, page, limit } = req.query as {
      search?: string;
      category?: string;
      campusZone?: string;
      status?: ItemStatus;
      desk?: string;
      page?: string;
      limit?: string;
    };

    const result = await getCustodyInventory(req.user.role, {
      search,
      category,
      campusZone,
      status,
      desk,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    sendSuccess(res, result.items, 200, 'Custody inventory retrieved successfully.', {
      page: result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
      totalPages: result.pagination.totalPages,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/custody/transfer
 * Log physical custody movement, locker storage, or inspection.
 */
export async function performCustodyTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required.');
    }

    const { itemId, toLocation, lockerReference, action, remarks, evidenceReference } = req.body as {
      itemId: string;
      toLocation: string;
      lockerReference?: string;
      action?: CustodyAction;
      remarks?: string;
      evidenceReference?: string;
    };

    if (!itemId) {
      throw ApiError.badRequest('Item ID is required.');
    }

    if (!toLocation || !toLocation.trim()) {
      throw ApiError.badRequest('Destination location / custody desk is required.');
    }

    const result = await transferCustody({
      itemId,
      officerId: req.user.userId,
      officerRole: req.user.role,
      toLocation,
      lockerReference,
      action: action || CustodyAction.TRANSFERRED_DESK,
      remarks,
      evidenceReference,
      reqIp: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    sendSuccess(res, result, 200, 'Custody transfer recorded successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/custody/items/:id/history
 * Chronological append-only custody movement history.
 */
export async function getCustodyHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required.');
    }

    const itemId = String(req.params.id);
    const history = await getItemCustodyHistory(req.user.role, itemId);

    sendSuccess(res, history, 200, 'Custody history retrieved successfully.');
  } catch (error) {
    next(error);
  }
}
