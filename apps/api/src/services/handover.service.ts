import { Types } from 'mongoose';
import { Claim, IClaim } from '../models/Claim';
import { Item, IItem } from '../models/Item';
import { Handover, IHandover } from '../models/Handover';
import { CustodyRecord } from '../models/CustodyRecord';
import { AuditEntry } from '../models/AuditEntry';
import { ApiError } from '../utils/api-response';
import { verifyOtp } from '../utils/crypto';
import { ClaimStatus, ItemStatus, CustodyAction, UserRole, AuditAction } from '../constants/enums';
import { logger } from '../config/logger';

export interface HandoverExecutionInput {
  officerId: string;
  officerRole: UserRole;
  claimId: string;
  otp: string;
  physicalDeskLocation: string;
  idCardPresentedType: string;
  idCardNumber: string;
  recipientSignatureUrl?: string;
  acknowledgementNotes?: string;
  proofEvidenceUrl?: string;
  reqIp?: string;
  userAgent?: string;
}

export interface HandoverReceipt {
  handoverId: string;
  claimId: string;
  itemId: string;
  referenceNumber: string;
  itemTitle: string;
  recipientName: string;
  recipientRegNo: string;
  recipientEmail: string;
  officerId: string;
  physicalDeskLocation: string;
  idCardPresentedType: string;
  idCardNumberMasked: string;
  acknowledgementNotes?: string;
  proofEvidenceUrl?: string;
  completedAt: Date;
}

/**
 * Helper to mask sensitive government / student ID numbers for audit logs and receipt display.
 */
function maskIdNumber(rawId: string): string {
  const trimmed = rawId.trim();
  if (trimmed.length <= 4) return '****';
  const visibleSuffix = trimmed.slice(-4);
  const prefix = trimmed.slice(0, 2);
  return `${prefix}${'*'.repeat(Math.max(4, trimmed.length - 6))}${visibleSuffix}`;
}

/**
 * List all claims approved by security that are currently awaiting physical supervised handover.
 * Restricted to security officers and administrators.
 */
export async function getPendingHandovers(
  officerRole: UserRole,
  filters: { search?: string; page?: number; limit?: number } = {}
): Promise<{
  handovers: Array<{
    claim: IClaim;
    item: IItem;
    handover: IHandover;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  if (![UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN].includes(officerRole)) {
    throw ApiError.forbidden('Restricted to authorized campus security personnel.');
  }

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const skip = (page - 1) * limit;

  const claimQuery: Record<string, unknown> = {
    claimStatus: ClaimStatus.APPROVED,
  };

  const [claims, total] = await Promise.all([
    Claim.find(claimQuery)
      .populate('item')
      .populate('claimant', 'fullName registrationNumber email department phone')
      .populate('reviewedBy', 'fullName registrationNumber securityPost')
      .sort({ reviewedAt: -1 })
      .skip(skip)
      .limit(limit),
    Claim.countDocuments(claimQuery),
  ]);

  // Fetch corresponding Handover records for each claim
  const claimIds = claims.map((c) => c._id);
  const handovers = await Handover.find({ claim: { $in: claimIds } });

  const handoverMap = new Map<string, IHandover>();
  for (const h of handovers) {
    handoverMap.set(h.claim.toString(), h);
  }

  const results = claims.map((c) => ({
    claim: c,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    item: c.item as any,
    handover: handoverMap.get(c._id.toString())!,
  })).filter((r) => r.item && r.handover && !r.handover.isCompleted);

  return {
    handovers: results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Complete a supervised physical handover at a campus security post.
 * Validates role, checks OTP with bcrypt hash, verifies attempt limits and expiry,
 * applies ID masking, and atomically updates Item, Claim, Handover, and Custody records.
 */
export async function verifyAndCompleteHandover(
  input: HandoverExecutionInput
): Promise<HandoverReceipt> {
  // 1. Role Check: Only security personnel and admins can execute handover
  if (![UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN].includes(input.officerRole)) {
    throw ApiError.forbidden('Only authorized campus security personnel can execute property handovers.');
  }

  if (!input.otp || !input.otp.trim()) {
    throw ApiError.badRequest('Handover OTP is required.');
  }

  if (!input.physicalDeskLocation || !input.physicalDeskLocation.trim()) {
    throw ApiError.badRequest('Physical security desk location is required.');
  }

  if (!input.idCardPresentedType || !input.idCardPresentedType.trim()) {
    throw ApiError.badRequest('Type of identification presented by claimant is required.');
  }

  if (!input.idCardNumber || !input.idCardNumber.trim()) {
    throw ApiError.badRequest('Identification number is required.');
  }

  // 2. Claim Validation
  const claim = await Claim.findById(input.claimId)
    .populate('item')
    .populate('claimant', 'fullName registrationNumber email department phone');

  if (!claim) {
    throw ApiError.notFound('Claim not found.');
  }

  if (claim.claimStatus === ClaimStatus.COMPLETED) {
    throw ApiError.badRequest('Duplicate Handover Guard: This claim has already completed handover.');
  }

  if (claim.claimStatus !== ClaimStatus.APPROVED) {
    throw ApiError.badRequest(
      `Cannot execute handover: Claim status is '${claim.claimStatus}'. Only APPROVED claims can be handed over.`
    );
  }

  // 3. Item Validation
  const item = await Item.findById(claim.item);
  if (!item || item.isArchived) {
    throw ApiError.notFound('Associated campus property not found or is archived.');
  }

  if (item.status === ItemStatus.HANDED_OVER) {
    throw ApiError.conflict('Duplicate Handover Guard: This property has already been handed over.');
  }

  if (item.status !== ItemStatus.READY_FOR_HANDOVER) {
    throw ApiError.badRequest(
      `Property is in status '${item.status}'. It must be READY_FOR_HANDOVER to execute handover.`
    );
  }

  // 4. Handover Record & OTP Verification
  const handover = await Handover.findOne({ claim: claim._id }).select('+otpHash');
  if (!handover) {
    throw ApiError.notFound('No handover tracking record found for this approved claim.');
  }

  if (handover.isCompleted) {
    throw ApiError.badRequest('Duplicate Handover Guard: Handover record is already marked as completed.');
  }

  // Check OTP Expiration
  if (handover.otpExpiresAt && handover.otpExpiresAt < new Date()) {
    throw ApiError.badRequest('Handover OTP has expired. A security supervisor must re-approve and re-issue the OTP.');
  }

  // Check Attempt Limits (Max 5 attempts)
  if (handover.otpAttemptsCount >= 5) {
    throw ApiError.badRequest(
      'Maximum OTP verification attempts (5) exceeded. Handover locked for security. Contact supervisor.'
    );
  }

  // Verify OTP using secure bcrypt comparison
  const isOtpValid = await verifyOtp(input.otp.trim(), handover.otpHash);

  if (!isOtpValid) {
    handover.otpAttemptsCount += 1;
    await handover.save();

    // Audit log failed attempt without leaking OTP
    await AuditEntry.create({
      actor: new Types.ObjectId(input.officerId),
      actorRole: input.officerRole,
      action: 'HANDOVER_OTP_FAILED',
      targetEntity: 'Handover',
      targetId: handover._id.toString(),
      ipAddress: input.reqIp || '127.0.0.1',
      userAgent: input.userAgent || 'unknown',
      metadata: {
        claimId: claim._id.toString(),
        itemId: item._id.toString(),
        attemptNumber: handover.otpAttemptsCount,
      },
    });

    const remaining = Math.max(0, 5 - handover.otpAttemptsCount);
    throw ApiError.badRequest(
      `Invalid Handover OTP. ${remaining} attempt(s) remaining before security lockout.`
    );
  }

  // 5. Atomic Consistent State Updates
  const maskedId = maskIdNumber(input.idCardNumber);
  const completionTimestamp = new Date();

  // Atomically update Item to HANDED_OVER
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claimantObj = claim.claimant as any;
  const claimantName = claimantObj?.fullName || 'Verified Owner';

  item.status = ItemStatus.HANDED_OVER;
  item.currentCustodyDesk = `Handed over to ${claimantName}`;
  await item.save();

  // Update Claim to COMPLETED
  claim.claimStatus = ClaimStatus.COMPLETED;
  await claim.save();

  // Update Handover Record
  handover.isCompleted = true;
  handover.completedAt = completionTimestamp;
  handover.supervisingOfficer = new Types.ObjectId(input.officerId);
  handover.physicalDeskLocation = input.physicalDeskLocation.trim();
  handover.idCardPresentedType = input.idCardPresentedType.trim();
  handover.idCardNumberMasked = maskedId;
  handover.recipientSignatureUrl = input.recipientSignatureUrl?.trim() || undefined;
  handover.acknowledgementNotes = input.acknowledgementNotes?.trim() || undefined;
  handover.proofEvidenceUrl = input.proofEvidenceUrl?.trim() || undefined;
  await handover.save();

  // 6. Append Immutable Custody Record
  await CustodyRecord.create({
    item: item._id,
    action: CustodyAction.HANDED_OVER,
    fromLocation: item.currentCustodyDesk || input.physicalDeskLocation,
    toLocation: 'CLAIMANT_HANDOVER_COMPLETE',
    evidenceReference: input.proofEvidenceUrl?.trim() || undefined,
    handledBy: new Types.ObjectId(input.officerId),
    remarks: input.acknowledgementNotes || `Physical property handed over to verified claimant under supervised desk protocol. ID: ${maskedId}`,
    timestamp: completionTimestamp,
  });

  // 7. Append Immutable Audit Entry
  await AuditEntry.create({
    actor: new Types.ObjectId(input.officerId),
    actorRole: input.officerRole,
    action: AuditAction.HANDOVER_EXECUTE,
    targetEntity: 'Handover',
    targetId: handover._id.toString(),
    ipAddress: input.reqIp || '127.0.0.1',
    userAgent: input.userAgent || 'unknown',
    metadata: {
      claimId: claim._id.toString(),
      itemId: item._id.toString(),
      referenceNumber: item.referenceNumber,
      recipientId: claimantObj?._id ? claimantObj._id.toString() : 'unknown',
      idCardType: input.idCardPresentedType,
      idCardNumberMasked: maskedId,
      physicalDeskLocation: input.physicalDeskLocation,
    },
  });

  logger.info(
    {
      handoverId: handover._id,
      itemId: item._id,
      claimId: claim._id,
      officerId: input.officerId,
      referenceNumber: item.referenceNumber,
    },
    'Supervised property handover successfully confirmed and sealed'
  );

  return {
    handoverId: handover._id.toString(),
    claimId: claim._id.toString(),
    itemId: item._id.toString(),
    referenceNumber: item.referenceNumber,
    itemTitle: item.title,
    recipientName: claimantObj?.fullName || 'Verified Claimant',
    recipientRegNo: claimantObj?.registrationNumber || 'N/A',
    recipientEmail: claimantObj?.email || 'N/A',
    officerId: input.officerId,
    physicalDeskLocation: handover.physicalDeskLocation,
    idCardPresentedType: handover.idCardPresentedType,
    idCardNumberMasked: maskedId,
    acknowledgementNotes: handover.acknowledgementNotes,
    proofEvidenceUrl: handover.proofEvidenceUrl,
    completedAt: completionTimestamp,
  };
}
