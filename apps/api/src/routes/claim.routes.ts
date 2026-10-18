import { Router } from 'express';
import {
  createClaim,
  answerChallenge,
  reviewClaimAction,
  getMyClaims,
  getPendingClaimsQueue,
  getItemClaims,
  getItemChallenges,
  viewPrivateVaultHandler,
} from '../controllers/claim.controller';
import { authenticate, requireRoles } from '../middleware/auth';
import { UserRole } from '../constants/enums';

const router = Router();

// 1. Public Item Verification Challenges (Question text and hints only, never answers)
router.get('/items/:id/challenges', getItemChallenges);

// 2. Claimant Actions
router.post('/claims', authenticate, createClaim);
router.post('/claims/:id/challenges/:challengeId/answer', authenticate, answerChallenge);
router.get('/claims/my-claims', authenticate, getMyClaims);

// 3. Security Personnel Adjudication & Private Vault
router.get(
  '/claims/pending',
  authenticate,
  requireRoles(UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN),
  getPendingClaimsQueue
);

router.get(
  '/claims/item/:itemId',
  authenticate,
  requireRoles(UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN),
  getItemClaims
);

router.patch(
  '/claims/:id/review',
  authenticate,
  requireRoles(UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN),
  reviewClaimAction
);

router.post(
  '/items/:id/private-vault/view',
  authenticate,
  requireRoles(UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN),
  viewPrivateVaultHandler
);

export const claimRoutes = router;
