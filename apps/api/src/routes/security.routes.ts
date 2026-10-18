import { Router } from 'express';
import { getStats, listAuditTrail } from '../controllers/security.controller';
import { authenticate, requireRoles } from '../middleware/auth';
import { UserRole } from '../constants/enums';

const router = Router();

// Security operations dashboard restricted to security personnel and admins
router.use(authenticate);
router.use(requireRoles(UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN));

// GET /api/v1/security/dashboard-stats
router.get('/dashboard-stats', getStats);

// GET /api/v1/security/audit-trail
router.get('/audit-trail', listAuditTrail);

export const securityRoutes = router;
