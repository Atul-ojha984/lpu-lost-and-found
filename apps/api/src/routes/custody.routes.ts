import { Router } from 'express';
import {
  listCustodyInventory,
  performCustodyTransfer,
  getCustodyHistory,
} from '../controllers/custody.controller';
import { authenticate, requireRoles } from '../middleware/auth';
import { UserRole } from '../constants/enums';

const router = Router();

// All custody endpoints are restricted to authorized security personnel and campus admins
router.use(authenticate);
router.use(requireRoles(UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN));

// GET /api/v1/custody/inventory
router.get('/inventory', listCustodyInventory);

// POST /api/v1/custody/transfer
router.post('/transfer', performCustodyTransfer);

// GET /api/v1/custody/items/:id/history
router.get('/items/:id/history', getCustodyHistory);

export const custodyRoutes = router;
