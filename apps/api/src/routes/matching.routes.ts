import { Router } from 'express';
import {
  getMatchesForItem,
  refreshMatchesForItem,
  refreshAllMatches,
} from '../controllers/matching.controller';
import { authenticate, requireRoles } from '../middleware/auth';
import { UserRole } from '../constants/enums';

const router = Router();

// Retrieve match suggestions for a specific item (reporter or security)
router.get('/items/:id/matches', authenticate, getMatchesForItem);

// Refresh match suggestions for a specific item
router.post('/items/:id/matches/refresh', authenticate, refreshMatchesForItem);

// Refresh all suggestions across the campus registry (Admins/Security)
router.post(
  '/matches/refresh-all',
  authenticate,
  requireRoles(UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN),
  refreshAllMatches
);

export const matchingRoutes = router;
