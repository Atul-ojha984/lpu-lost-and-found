import { Request, Response, NextFunction } from 'express';
import { adminService, EscalationState } from '../services/admin.service';
import { ApiError, sendSuccess } from '../utils/api-response';
import { UserRole } from '../constants/enums';

function getAdminContext(req: Request) {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required.');
  }

  const reqIp =
    (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = (req.headers['user-agent'] as string) || 'unknown';

  return {
    userId: req.user.userId,
    role: req.user.role,
    registrationNumber: req.user.registrationNumber,
    reqIp,
    userAgent,
  };
}

/**
 * GET /api/v1/admin/analytics
 * Dashboard metrics calculated strictly from live database records.
 */
export async function getAnalytics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await adminService.getAnalyticsDashboard();
    sendSuccess(res, data, 200, 'Campus lost and found analytics calculated successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/retention/queue
 * Ageing queue with statutory retention tracking and escalation states.
 */
export async function getAgeingQueue(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { escalationState, search, category, page, limit } = req.query as {
      escalationState?: EscalationState | 'ALL';
      search?: string;
      category?: string;
      page?: string;
      limit?: string;
    };

    const data = await adminService.getAgeingQueue({
      escalationState,
      search,
      category,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    sendSuccess(res, data, 200, 'Retention ageing queue retrieved successfully.', {
      page: data.page,
      limit: data.limit,
      total: data.total,
      totalPages: data.totalPages,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/disposal/approve
 * Formal committee approval and execution of item disposal.
 */
export async function approveDisposal(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminContext = getAdminContext(req);
    const result = await adminService.approveDisposal(req.body, adminContext);

    sendSuccess(
      res,
      result,
      200,
      `Item disposal approved and logged with method: ${req.body.method}`
    );
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/users
 * Paginated campus user list with role and status management.
 */
export async function getUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { role, search, isActive, page, limit } = req.query as {
      role?: UserRole | 'ALL';
      search?: string;
      isActive?: string;
      page?: string;
      limit?: string;
    };

    const data = await adminService.listUsers({
      role,
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    sendSuccess(res, data.users, 200, 'Users retrieved successfully.', {
      page: data.page,
      limit: data.limit,
      total: data.total,
      totalPages: data.totalPages,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/users/:userId
 * Update user role, security post, and account status.
 */
export async function updateUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminContext = getAdminContext(req);
    const userId = req.params.userId as string;
    const user = await adminService.updateUser(userId, req.body, adminContext);

    sendSuccess(res, user, 200, 'User privileges updated successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/categories
 * Item categories with retention period configurations.
 */
export async function getCategories(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { includeInactive } = req.query as { includeInactive?: string };
    const categories = await adminService.listCategories(includeInactive === 'true');

    sendSuccess(res, categories, 200, 'Item categories retrieved successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/categories
 * Create new category with configured retention period.
 */
export async function createCategory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminContext = getAdminContext(req);
    const category = await adminService.createCategory(req.body, adminContext);

    sendSuccess(res, category, 201, 'Item category created successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/categories/:id
 * Update category details and retention period.
 */
export async function updateCategory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminContext = getAdminContext(req);
    const id = req.params.id as string;
    const category = await adminService.updateCategory(id, req.body, adminContext);

    sendSuccess(res, category, 200, 'Item category updated successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/locations
 * Campus locations list.
 */
export async function getLocations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { includeInactive } = req.query as { includeInactive?: string };
    const locations = await adminService.listLocations(includeInactive === 'true');

    sendSuccess(res, locations, 200, 'Campus locations retrieved successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/locations
 * Register new campus location.
 */
export async function createLocation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminContext = getAdminContext(req);
    const location = await adminService.createLocation(req.body, adminContext);

    sendSuccess(res, location, 201, 'Campus location created successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/locations/:id
 * Update existing campus location.
 */
export async function updateLocation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminContext = getAdminContext(req);
    const id = req.params.id as string;
    const location = await adminService.updateLocation(id, req.body, adminContext);

    sendSuccess(res, location, 200, 'Campus location updated successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/audit-logs
 * Authorized audit history search with filters and zero privacy leaks.
 */
export async function getAuditLogs(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { action, actorId, targetEntity, startDate, endDate, page, limit } = req.query as {
      action?: string;
      actorId?: string;
      targetEntity?: string;
      startDate?: string;
      endDate?: string;
      page?: string;
      limit?: string;
    };

    const data = await adminService.searchAuditLogs({
      action,
      actorId,
      targetEntity,
      startDate,
      endDate,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    sendSuccess(res, data.items, 200, 'Audit history logs retrieved successfully.', {
      page: data.page,
      limit: data.limit,
      total: data.total,
      totalPages: data.totalPages,
    });
  } catch (error) {
    next(error);
  }
}
