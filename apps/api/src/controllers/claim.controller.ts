import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import {
  submitClaim,
  submitChallengeAnswer,
  reviewClaim,
  viewPrivateVault,
  SubmitClaimInput,
} from '../services/claim.service';
import { Claim } from '../models/Claim';
import { VerificationChallenge } from '../models/VerificationChallenge';
import { toPublicItemDTO } from '../dtos/item.dto';
import { ApiError, sendSuccess } from '../utils/api-response';
import { decryptField } from '../utils/crypto';
import { UserRole, ClaimStatus } from '../constants/enums';

/**
 * POST /api/v1/claims
 * Submit a verified ownership claim against a found property.
 */
export async function createClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required to submit an ownership claim.');
    }

    const input = req.body as SubmitClaimInput;
    if (!input.itemId || !input.statement) {
      throw ApiError.badRequest('Item ID and Statement of Ownership are required.');
    }

    const claim = await submitClaim(
      req.user.userId,
      req.user.role,
      input,
      req.ip || '127.0.0.1',
      req.headers['user-agent'] || 'unknown'
    );

    const populatedClaim = await Claim.findById(claim._id)
      .populate('item', 'referenceNumber title publicDescription status primaryImageUrl location')
      .populate('claimant', 'fullName registrationNumber email');

    sendSuccess(res, populatedClaim, 201, 'Ownership claim successfully logged.');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/claims/:id/challenges/:challengeId/answer
 * Submit an answer to a challenge question for an active claim.
 */
export async function answerChallenge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required.');
    }

    const claimId = String(req.params.id);
    const challengeId = String(req.params.challengeId);
    const { answer } = req.body as { answer: string };

    if (!answer || !answer.trim()) {
      throw ApiError.badRequest('Challenge answer is required.');
    }

    const result = await submitChallengeAnswer(
      claimId,
      req.user.userId,
      challengeId,
      answer,
      req.ip || '127.0.0.1',
      req.headers['user-agent'] || 'unknown'
    );

    sendSuccess(res, result, 200, result.isCorrect ? 'Challenge verification passed.' : 'Answer does not match records.');
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/claims/:id/review
 * Security review endpoint to Approve or Reject a claim.
 * Enforces Anti-Self-Approval guard and resolves competing claims.
 */
export async function reviewClaimAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required.');
    }

    const claimId = String(req.params.id);
    const { action, reviewNotes, rejectionReason } = req.body as {
      action: 'APPROVE' | 'REJECT';
      reviewNotes?: string;
      rejectionReason?: string;
    };

    if (!['APPROVE', 'REJECT'].includes(action)) {
      throw ApiError.badRequest("Action must be either 'APPROVE' or 'REJECT'.");
    }

    const reviewed = await reviewClaim(
      req.user.userId,
      req.user.role,
      claimId,
      action,
      reviewNotes,
      rejectionReason,
      req.ip || '127.0.0.1',
      req.headers['user-agent'] || 'unknown'
    );

    const populated = await Claim.findById(reviewed._id)
      .populate('item', 'referenceNumber title status primaryImageUrl')
      .populate('claimant', 'fullName registrationNumber email')
      .populate('reviewedBy', 'fullName registrationNumber securityPost');

    sendSuccess(res, populated, 200, `Claim successfully ${action.toLowerCase()}d.`);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/claims/my-claims
 * Retrieve all claims filed by the currently authenticated user.
 */
export async function getMyClaims(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required.');
    }

    const claims = await Claim.find({ claimant: new Types.ObjectId(req.user.userId) })
      .populate('item')
      .populate('reviewedBy', 'fullName securityPost')
      .sort({ createdAt: -1 });

    const formatted = claims.map((c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawItem = c.item as any;
      let displayOtp = c.handoverOtp;
      if (!displayOtp && c.handoverOtpCipher && c.handoverOtpIv && c.handoverOtpTag) {
        try {
          displayOtp = decryptField(c.handoverOtpCipher, c.handoverOtpIv, c.handoverOtpTag);
        } catch {
          displayOtp = undefined;
        }
      }
      return {
        id: c._id.toString(),
        itemId: rawItem?._id?.toString() || '',
        itemTitle: rawItem?.title || 'Unknown Property',
        itemReference: rawItem?.referenceNumber || '',
        itemType: rawItem?.itemType || 'FOUND',
        claimStatus: c.claimStatus,
        statement: c.statement,
        challengeAnswersCount: c.challengeAnswers.length,
        verificationAttemptsCount: c.verificationAttemptsCount,
        handoverOtp: c.claimStatus === ClaimStatus.APPROVED ? displayOtp : undefined,
        handoverOtpExpiresAt: c.claimStatus === ClaimStatus.APPROVED ? c.handoverOtpExpiresAt : undefined,
        reviewedBy: (c.reviewedBy as { fullName?: string })?.fullName,
        reviewedAt: c.reviewedAt,
        rejectionReason: c.rejectionReason,
        submittedAt: c.createdAt,
      };
    });

    sendSuccess(res, formatted);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/claims/pending
 * Retrieve pending claims queue for campus security review.
 * Restricted to SECURITY_PERSONNEL and CAMPUS_ADMIN.
 */
export async function getPendingClaimsQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || ![UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN].includes(req.user.role)) {
      throw ApiError.forbidden('Restricted to authorized campus security personnel.');
    }

    const claims = await Claim.find({
      claimStatus: { $in: [ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW, ClaimStatus.CHALLENGE_REQUIRED] },
    })
      .populate('item')
      .populate('claimant', 'fullName registrationNumber email department phone')
      .sort({ createdAt: 1 }); // FIFO queue

    const formatted = claims.map((c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawItem = c.item as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const claimant = c.claimant as any;

      return {
        id: c._id.toString(),
        item: rawItem ? toPublicItemDTO(rawItem) : null,
        claimant: claimant
          ? {
              id: claimant._id.toString(),
              fullName: claimant.fullName,
              registrationNumber: claimant.registrationNumber,
              email: claimant.email,
              department: claimant.department,
              phone: claimant.phone,
            }
          : null,
        claimStatus: c.claimStatus,
        statement: c.statement,
        challengeAnswers: c.challengeAnswers.map((a) => ({
          challengeId: a.challenge.toString(),
          providedAnswer: a.providedAnswer,
          isCorrect: a.isCorrect,
        })),
        verificationAttemptsCount: c.verificationAttemptsCount,
        submittedAt: c.createdAt,
      };
    });

    sendSuccess(res, formatted);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/claims/item/:itemId
 * Retrieve all competing claims filed against a specific found property.
 * Enables officers to review competing claims side-by-side.
 */
export async function getItemClaims(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || ![UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN].includes(req.user.role)) {
      throw ApiError.forbidden('Restricted to authorized campus security personnel.');
    }

    const itemId = String(req.params.itemId);
    const claims = await Claim.find({ item: new Types.ObjectId(itemId) })
      .populate('claimant', 'fullName registrationNumber email department phone')
      .sort({ createdAt: 1 });

    sendSuccess(res, claims);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/items/:id/challenges
 * Retrieve active verification questions for an item without revealing answers.
 * Clean public privacy guarantee: hashedAnswer is completely excluded.
 */
export async function getItemChallenges(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = String(req.params.id);
    const challenges = await VerificationChallenge.find({
      item: new Types.ObjectId(rawId),
      isActive: true,
    }).select('-hashedAnswer');

    const formatted = challenges.map((ch) => ({
      id: ch._id.toString(),
      questionText: ch.questionText,
      hint: ch.hint,
      maxAttempts: ch.maxAttempts || 3,
      expiresAt: ch.expiresAt,
    }));

    sendSuccess(res, formatted);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/items/:id/private-vault/view
 * Official decryption endpoint for security personnel to inspect sensitive marks.
 * Restricted strictly to SECURITY_PERSONNEL and CAMPUS_ADMIN with immutable audit logging.
 */
export async function viewPrivateVaultHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required.');
    }

    const itemId = String(req.params.id);
    const result = await viewPrivateVault(
      req.user.userId,
      req.user.role,
      itemId,
      req.ip || '127.0.0.1',
      req.headers['user-agent'] || 'unknown'
    );

    sendSuccess(res, result, 200, 'Private vault records decrypted for official adjudication.');
  } catch (error) {
    next(error);
  }
}
