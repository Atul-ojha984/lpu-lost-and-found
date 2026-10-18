import { Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { UserRole } from '../constants/enums';
import {
  getAnalytics,
  getAgeingQueue,
  approveDisposal,
  getUsers,
  updateUser,
  getCategories,
  createCategory,
  updateCategory,
  getLocations,
  createLocation,
  updateLocation,
  getAuditLogs,
} from '../controllers/admin.controller';
import {
  disposalApprovalSchema,
  updateUserAdminSchema,
  createCategorySchema,
  updateCategorySchema,
  createLocationSchema,
  updateLocationSchema,
  auditQuerySchema,
} from '../schemas/admin.schema';

const router = Router();

// Enforce authentication and strict administrative role check across ALL admin endpoints
router.use(authenticate, requireRoles(UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN));

// Analytics Engine
router.get('/analytics', getAnalytics);

// Retention & Ageing Queue
router.get('/retention/queue', getAgeingQueue);

// Disposal Approval
router.post('/disposal/approve', validate({ body: disposalApprovalSchema }), approveDisposal);

// User Governance & Security Assignments
router.get('/users', getUsers);
router.patch('/users/:userId', validate({ body: updateUserAdminSchema }), updateUser);

// Category Configuration & Retention Periods
router.get('/categories', getCategories);
router.post('/categories', validate({ body: createCategorySchema }), createCategory);
router.patch('/categories/:id', validate({ body: updateCategorySchema }), updateCategory);

// Campus Locations Management
router.get('/locations', getLocations);
router.post('/locations', validate({ body: createLocationSchema }), createLocation);
router.patch('/locations/:id', validate({ body: updateLocationSchema }), updateLocation);

// Authorized Audit History Search
router.get('/audit-logs', validate({ query: auditQuerySchema }), getAuditLogs);

export const adminRoutes = router;
