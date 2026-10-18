import { Types } from 'mongoose';
import { Claim, IClaim } from '../models/Claim';
import { Item, IItem } from '../models/Item';
import { VerificationChallenge, IVerificationChallenge } from '../models/VerificationChallenge';
import { PrivateDetail } from '../models/PrivateDetail';
import { AuditEntry } from '../models/AuditEntry';
import { Handover } from '../models/Handover';
import { ApiError } from '../utils/api-response';
import { comparePassword, decryptField, generateSecureOtp, hashOtp, encryptField } from '../utils/crypto';
import { ClaimStatus, ItemStatus, AuditAction, UserRole } from '../constants/enums';
import { logger } from '../config/logger';

export interface SubmitClaimInput {
  itemId: string;
  statement: string;
  challengeAnswers?: Array<{
    challengeId: string;
    providedAnswer: string;
  }>;
  privateEvidenceProofUrls?: string[];
}

/**
 * Submit an ownership claim against a found item.
 * Supports competing claims: multiple claimants can file claims on the same item.
 * Evaluates verification challenges server-side without revealing answers.
 */
export async function submitClaim(
  claimantId: string,
  claimantRole: UserRole,
  input: SubmitClaimInput,
  reqIp: string = '127.0.0.1',
  userAgent: string = 'unknown'
): Promise<IClaim> {
  const item = await Item.findById(input.itemId);
  if (!item || item.isArchived) {
    throw ApiError.notFound('Campus item not found or is no longer active.');
  }

  // Prevent claims on already completed or disposed property
  if ([ItemStatus.HANDED_OVER, ItemStatus.DISPOSED].includes(item.status)) {
    throw ApiError.badRequest(`This item is in status '${item.status}' and is not eligible for new claims.`);
  }

  // Prevent reporter from claiming their own found item
  if (item.reportedBy.toString() === claimantId && item.itemType === 'FOUND') {
    throw ApiError.badRequest('You are listed as the finder of this property. You cannot submit an ownership claim against it.');
  }

  // Check if claimant already has an open claim on this item
  const existingClaim = await Claim.findOne({
    item: item._id,
    claimant: new Types.ObjectId(claimantId),
    claimStatus: { $in: [ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW, ClaimStatus.CHALLENGE_REQUIRED] },
  });

  if (existingClaim) {
    throw ApiError.conflict('You already have an active claim under review for this campus property.');
  }

  // Load active verification challenges for the item
  const challenges = await VerificationChallenge.find({
    item: item._id,
    isActive: true,
  }).select('+hashedAnswer');

  const evaluatedAnswers: Array<{
    challenge: Types.ObjectId;
    providedAnswer: string;
    isCorrect?: boolean;
  }> = [];

  let allChallengesPassed = challenges.length === 0;

  if (challenges.length > 0) {
    let passedCount = 0;

    for (const challenge of challenges) {
      const submittedAns = input.challengeAnswers?.find(
        (a) => a.challengeId === challenge._id.toString()
      );

      if (submittedAns && submittedAns.providedAnswer) {
        // Check challenge expiry
        const isExpired = challenge.expiresAt && challenge.expiresAt < new Date();
        if (isExpired) {
          evaluatedAnswers.push({
            challenge: challenge._id,
            providedAnswer: '[EXPIRED_CHALLENGE]',
            isCorrect: false,
          });
          continue;
        }

        // Compare answer using bcrypt against hashedAnswer
        const isMatch = await comparePassword(
          submittedAns.providedAnswer.trim().toLowerCase(),
          challenge.hashedAnswer
        );

        evaluatedAnswers.push({
          challenge: challenge._id,
          providedAnswer: submittedAns.providedAnswer.trim(),
          isCorrect: isMatch,
        });

        if (isMatch) {
          passedCount++;
        }

        // Log challenge evaluation without exposing the answer
        await AuditEntry.create({
          actor: new Types.ObjectId(claimantId),
          actorRole: claimantRole,
          action: 'VERIFICATION_CHALLENGE_EVALUATE',
          targetEntity: 'VerificationChallenge',
          targetId: challenge._id.toString(),
          ipAddress: reqIp,
          userAgent,
          metadata: {
            itemId: item._id.toString(),
            outcome: isMatch ? 'PASSED' : 'FAILED',
          },
        });
      }
    }

    allChallengesPassed = passedCount === challenges.length;
  }

  // Determine claim status based on verification outcome
  let initialStatus: ClaimStatus = ClaimStatus.SUBMITTED;
  if (challenges.length > 0) {
    initialStatus = allChallengesPassed ? ClaimStatus.UNDER_REVIEW : ClaimStatus.CHALLENGE_REQUIRED;
  } else {
    initialStatus = ClaimStatus.UNDER_REVIEW;
  }

  // Create the Claim document
  const claim = await Claim.create({
    item: item._id,
    claimant: new Types.ObjectId(claimantId),
    claimStatus: initialStatus,
    statement: input.statement.trim(),
    challengeAnswers: evaluatedAnswers,
    privateEvidenceProofUrls: input.privateEvidenceProofUrls || [],
    verificationAttemptsCount: evaluatedAnswers.length > 0 ? 1 : 0,
  });

  // Update item status to CLAIM_IN_REVIEW if currently in custody or reported
  if ([ItemStatus.IN_CUSTODY, ItemStatus.REPORTED].includes(item.status)) {
    item.status = ItemStatus.CLAIM_IN_REVIEW;
    await item.save();
  }

  // Audit log claim submission
  await AuditEntry.create({
    actor: new Types.ObjectId(claimantId),
    actorRole: claimantRole,
    action: AuditAction.CLAIM_SUBMIT,
    targetEntity: 'Claim',
    targetId: claim._id.toString(),
    ipAddress: reqIp,
    userAgent,
    metadata: {
      itemId: item._id.toString(),
      referenceNumber: item.referenceNumber,
      status: initialStatus,
    },
  });

  logger.info(
    { claimId: claim._id, claimantId, itemId: item._id, status: initialStatus },
    'New ownership claim successfully submitted'
  );

  return claim;
}

/**
 * Submit an answer to a specific verification challenge on an existing claim.
 * Enforces attempt limits and challenge expiration.
 * Strictly avoids revealing correct answer in error messages.
 */
export async function submitChallengeAnswer(
  claimId: string,
  claimantId: string,
  challengeId: string,
  providedAnswer: string,
  reqIp: string = '127.0.0.1',
  userAgent: string = 'unknown'
): Promise<{ success: boolean; isCorrect: boolean; remainingAttempts: number; claimStatus: ClaimStatus }> {
  const claim = await Claim.findById(claimId);
  if (!claim) {
    throw ApiError.notFound('Claim record not found.');
  }

  if (claim.claimant.toString() !== claimantId) {
    throw ApiError.forbidden('You are not authorized to answer challenges for this claim.');
  }

  if (![ClaimStatus.CHALLENGE_REQUIRED, ClaimStatus.SUBMITTED].includes(claim.claimStatus)) {
    throw ApiError.badRequest('This claim is not currently awaiting challenge verification.');
  }

  const challenge = await VerificationChallenge.findById(challengeId).select('+hashedAnswer');
  if (!challenge || !challenge.isActive) {
    throw ApiError.notFound('Verification challenge not found or no longer active.');
  }

  // Check challenge expiry
  if (challenge.expiresAt && challenge.expiresAt < new Date()) {
    throw ApiError.badRequest('This verification challenge has expired. Please contact campus security.');
  }

  // Check attempt limit (max 3 attempts)
  const maxAttempts = challenge.maxAttempts || 3;
  const currentAttempts = claim.verificationAttemptsCount || 0;

  if (currentAttempts >= maxAttempts) {
    throw ApiError.badRequest('Maximum verification attempts exceeded for this challenge.');
  }

  // Evaluate answer on the server
  const isMatch = await comparePassword(
    providedAnswer.trim().toLowerCase(),
    challenge.hashedAnswer
  );

  claim.verificationAttemptsCount = currentAttempts + 1;

  // Record answer outcome
  const existingAnsIndex = claim.challengeAnswers.findIndex(
    (a) => a.challenge.toString() === challengeId
  );

  if (existingAnsIndex >= 0) {
    claim.challengeAnswers[existingAnsIndex].providedAnswer = providedAnswer.trim();
    claim.challengeAnswers[existingAnsIndex].isCorrect = isMatch;
  } else {
    claim.challengeAnswers.push({
      challenge: challenge._id,
      providedAnswer: providedAnswer.trim(),
      isCorrect: isMatch,
    });
  }

  // If answer matched, check if all item challenges are now passed
  const allItemChallenges = await VerificationChallenge.find({ item: claim.item, isActive: true });
  const allPassed = allItemChallenges.every((ch) => {
    const ans = claim.challengeAnswers.find((a) => a.challenge.toString() === ch._id.toString());
    return ans && ans.isCorrect === true;
  });

  if (allPassed) {
    claim.claimStatus = ClaimStatus.UNDER_REVIEW;
  }

  await claim.save();

  // Audit log evaluation without answer text
  await AuditEntry.create({
    actor: new Types.ObjectId(claimantId),
    actorRole: UserRole.STUDENT_STAFF,
    action: 'VERIFICATION_CHALLENGE_EVALUATE',
    targetEntity: 'VerificationChallenge',
    targetId: challenge._id.toString(),
    ipAddress: reqIp,
    userAgent,
    metadata: {
      claimId: claim._id.toString(),
      attemptNumber: claim.verificationAttemptsCount,
      outcome: isMatch ? 'PASSED' : 'FAILED',
    },
  });

  const remainingAttempts = Math.max(0, maxAttempts - claim.verificationAttemptsCount);

  return {
    success: true,
    isCorrect: isMatch,
    remainingAttempts,
    claimStatus: claim.claimStatus,
  };
}

/**
 * Adjudicate an ownership claim (Approve or Reject).
 * Enforces Anti-Self-Approval: Officers cannot approve their own claims.
 * Handles Competing Claims: When a claim is approved, other competing claims on the item are rejected.
 */
export async function reviewClaim(
  reviewerId: string,
  reviewerRole: UserRole,
  claimId: string,
  action: 'APPROVE' | 'REJECT',
  reviewNotes?: string,
  rejectionReason?: string,
  reqIp: string = '127.0.0.1',
  userAgent: string = 'unknown'
): Promise<IClaim> {
  // RBAC validation
  if (![UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN].includes(reviewerRole)) {
    throw ApiError.forbidden('Only security officers and campus administrators are authorized to review claims.');
  }

  const claim = await Claim.findById(claimId).populate('item');
  if (!claim) {
    throw ApiError.notFound('Claim not found.');
  }

  // CRITICAL SECURITY GUARD 1: Anti-Self-Approval (Claimant cannot approve own claim)
  if (claim.claimant.toString() === reviewerId) {
    throw ApiError.forbidden(
      'Security Policy Violation: Officers/Admins are strictly prohibited from adjudicating or approving their own claims.'
    );
  }

  // State Transition Guard: Disallow modifying already approved or completed claims
  if ([ClaimStatus.APPROVED, ClaimStatus.COMPLETED].includes(claim.claimStatus)) {
    throw ApiError.badRequest('This claim has already reached an approved/completed state and cannot be modified.');
  }

  const item = await Item.findById(claim.item);
  if (!item) {
    throw ApiError.notFound('Associated item not found.');
  }

  // CRITICAL SECURITY GUARD 2: Anti-Self-Approval (Finder/Reporter cannot approve claim on item they reported)
  if (item.reportedBy.toString() === reviewerId) {
    throw ApiError.forbidden(
      'Security Policy Violation: Officers/Admins are strictly prohibited from adjudicating claims on items they originally reported.'
    );
  }

  // Mandatory rejection reason validation
  if (action === 'REJECT' && (!rejectionReason || !rejectionReason.trim())) {
    throw ApiError.badRequest('A specific rejection reason is mandatory when declining an ownership claim.');
  }

  claim.reviewedBy = new Types.ObjectId(reviewerId);
  claim.reviewedAt = new Date();
  claim.reviewNotes = reviewNotes || undefined;

  if (action === 'APPROVE') {
    claim.claimStatus = ClaimStatus.APPROVED;

    // Cryptographic 6-digit handover OTP (never stored or logged in plaintext)
    const rawOtp = generateSecureOtp(6);
    const hashedOtp = await hashOtp(rawOtp);
    const encOtp = encryptField(rawOtp);

    claim.handoverOtpCipher = encOtp.ciphertext;
    claim.handoverOtpIv = encOtp.iv;
    claim.handoverOtpTag = encOtp.authTag;
    claim.handoverOtp = rawOtp; // returned in-memory in this response for initial notification
    claim.handoverOtpExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h TTL

    // Update item status to READY_FOR_HANDOVER
    item.status = ItemStatus.READY_FOR_HANDOVER;
    await item.save();

    // Create or update Handover record with hashed OTP and physical desk location
    const handover = await Handover.findOneAndUpdate(
      { claim: claim._id },
      {
        item: item._id,
        claim: claim._id,
        recipient: claim.claimant,
        supervisingOfficer: new Types.ObjectId(reviewerId),
        otpHash: hashedOtp,
        otpExpiresAt: claim.handoverOtpExpiresAt,
        otpAttemptsCount: 0,
        physicalDeskLocation: item.currentCustodyDesk || 'Central Security Post - Block 30',
        idCardPresentedType: 'PENDING_VERIFICATION',
        idCardNumberMasked: 'PENDING',
        isCompleted: false,
      },
      { upsert: true, new: true }
    );
    claim.handoverRecord = handover._id;

    // Competing Claims Resolution: Reject all other competing claims for this item
    await Claim.updateMany(
      {
        item: item._id,
        _id: { $ne: claim._id },
        claimStatus: { $in: [ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW, ClaimStatus.CHALLENGE_REQUIRED] },
      },
      {
        claimStatus: ClaimStatus.REJECTED,
        rejectionReason: 'Another claimant provided verifiable ownership proof accepted by security.',
        reviewedBy: new Types.ObjectId(reviewerId),
        reviewedAt: new Date(),
      }
    );

    // Audit log OTP generation without recording the raw OTP string
    await AuditEntry.create({
      actor: new Types.ObjectId(reviewerId),
      actorRole: reviewerRole,
      action: AuditAction.HANDOVER_OTP_GENERATE,
      targetEntity: 'Handover',
      targetId: handover._id.toString(),
      ipAddress: reqIp,
      userAgent,
      metadata: {
        claimId: claim._id.toString(),
        itemId: item._id.toString(),
        expiresAt: claim.handoverOtpExpiresAt,
      },
    });

    logger.info(
      { claimId: claim._id, itemId: item._id, reviewerId },
      'Claim APPROVED by officer. Competing claims resolved and encrypted handover OTP generated'
    );
  } else {
    claim.claimStatus = ClaimStatus.REJECTED;
    claim.rejectionReason = rejectionReason ? rejectionReason.trim() : 'Ownership claim declined by security.';

    // Check if any other open claims exist on item; if none, return item to IN_CUSTODY
    const remainingOpenClaims = await Claim.countDocuments({
      item: item._id,
      _id: { $ne: claim._id },
      claimStatus: { $in: [ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW, ClaimStatus.CHALLENGE_REQUIRED] },
    });

    if (remainingOpenClaims === 0 && item.status === ItemStatus.CLAIM_IN_REVIEW) {
      item.status = ItemStatus.IN_CUSTODY;
      await item.save();
    }
  }

  await claim.save();

  // Audit log claim decision
  await AuditEntry.create({
    actor: new Types.ObjectId(reviewerId),
    actorRole: reviewerRole,
    action: AuditAction.CLAIM_REVIEW,
    targetEntity: 'Claim',
    targetId: claim._id.toString(),
    ipAddress: reqIp,
    userAgent,
    metadata: {
      action,
      itemId: item._id.toString(),
      claimantId: claim.claimant.toString(),
      decisionNotes: reviewNotes,
    },
  });

  return claim;
}

/**
 * View decrypted Private Vault details for official verification.
 * Restricted strictly to SECURITY_PERSONNEL and CAMPUS_ADMIN.
 * Logs immutable AuditEntry.
 */
export async function viewPrivateVault(
  officerId: string,
  officerRole: UserRole,
  itemId: string,
  reqIp: string = '127.0.0.1',
  userAgent: string = 'unknown'
): Promise<{ fieldsSummary: string[]; decryptedContent: string; accessCount: number }> {
  if (![UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN].includes(officerRole)) {
    throw ApiError.forbidden('Access to private encrypted vault is restricted to authorized campus security.');
  }

  const vault = await PrivateDetail.findOne({ item: new Types.ObjectId(itemId) });
  if (!vault) {
    throw ApiError.notFound('No private vault details on record for this item.');
  }

  const decryptedContent = decryptField(
    vault.encryptedCiphertext,
    vault.iv,
    vault.authTag
  );

  vault.accessCount += 1;
  vault.lastDecryptedBy = new Types.ObjectId(officerId);
  vault.lastDecryptedAt = new Date();
  await vault.save();

  // Audit log private vault access
  await AuditEntry.create({
    actor: new Types.ObjectId(officerId),
    actorRole: officerRole,
    action: AuditAction.PRIVATE_VAULT_VIEW,
    targetEntity: 'PrivateDetail',
    targetId: vault._id.toString(),
    ipAddress: reqIp,
    userAgent,
    metadata: { itemId },
  });

  return {
    fieldsSummary: vault.fieldsSummary,
    decryptedContent,
    accessCount: vault.accessCount,
  };
}
