import { Router } from 'express';
import {
  listPendingHandovers,
  executeHandover,
} from '../controllers/handover.controller';
import { authenticate, requireRoles } from '../middleware/auth';
import { UserRole } from '../constants/enums';

const router = Router();

// Handover operations restricted to authorized security personnel and campus admins
router.use(authenticate);
router.use(requireRoles(UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN));

// GET /api/v1/handovers/pending
router.get('/pending', listPendingHandovers);

// POST /api/v1/handovers/verify-otp
router.post('/verify-otp', executeHandover);

export const handoverRoutes = router;
