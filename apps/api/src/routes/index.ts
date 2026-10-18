import { Router } from 'express';
import { healthRoutes } from './health.routes';
import { authRoutes } from './auth.routes';
import { itemRoutes } from './item.routes';
import { matchingRoutes } from './matching.routes';
import { claimRoutes } from './claim.routes';
import { custodyRoutes } from './custody.routes';
import { handoverRoutes } from './handover.routes';
import { securityRoutes } from './security.routes';
import { adminRoutes } from './admin.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/', itemRoutes);
router.use('/', matchingRoutes);
router.use('/', claimRoutes);
router.use('/custody', custodyRoutes);
router.use('/handovers', handoverRoutes);
router.use('/security', securityRoutes);
router.use('/admin', adminRoutes);

export const apiRoutes = router;
