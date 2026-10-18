import { Item } from '../models/Item';
import { Claim } from '../models/Claim';
import { AuditEntry, IAuditEntry } from '../models/AuditEntry';
import { ApiError } from '../utils/api-response';
import { ClaimStatus, ItemStatus, UserRole } from '../constants/enums';

export interface SecurityDashboardStats {
  pendingClaimsCount: number;
  approvedAwaitingHandoverCount: number;
  custodyInventoryCount: number;
  completedHandoversCount: number;
  recentAuditEvents: IAuditEntry[];
}

export interface AuditTrailFilters {
  action?: string;
  targetEntity?: string;
  actorRole?: string;
  page?: number;
  limit?: number;
}

/**
 * Retrieve high-level operational statistics and real-time security events.
 * Restricted strictly to campus security personnel, campus admins, and system admins.
 */
export async function getSecurityDashboardStats(officerRole: UserRole): Promise<SecurityDashboardStats> {
  if (![UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN].includes(officerRole)) {
    throw ApiError.forbidden('Restricted to authorized campus security personnel.');
  }

  const [
    pendingClaimsCount,
    approvedAwaitingHandoverCount,
    custodyInventoryCount,
    completedHandoversCount,
    recentAuditEvents,
  ] = await Promise.all([
    Claim.countDocuments({
      claimStatus: { $in: [ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW, ClaimStatus.CHALLENGE_REQUIRED] },
    }),
    Claim.countDocuments({
      claimStatus: ClaimStatus.APPROVED,
    }),
    Item.countDocuments({
      isArchived: false,
      status: { $in: [ItemStatus.IN_CUSTODY, ItemStatus.READY_FOR_HANDOVER, ItemStatus.CLAIM_IN_REVIEW] },
    }),
    Item.countDocuments({
      isArchived: false,
      status: ItemStatus.HANDED_OVER,
    }),
    AuditEntry.find()
      .populate('actor', 'fullName registrationNumber role securityPost email')
      .sort({ timestamp: -1 })
      .limit(25),
  ]);

  return {
    pendingClaimsCount,
    approvedAwaitingHandoverCount,
    custodyInventoryCount,
    completedHandoversCount,
    recentAuditEvents,
  };
}

/**
 * Retrieve full paginated audit trail for campus compliance and security investigations.
 */
export async function getAuditTrail(
  officerRole: UserRole,
  filters: AuditTrailFilters = {}
): Promise<{
  entries: IAuditEntry[];
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
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 25));
  const skip = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  if (filters.action) {
    query.action = filters.action;
  }

  if (filters.targetEntity) {
    query.targetEntity = filters.targetEntity;
  }

  if (filters.actorRole) {
    query.actorRole = filters.actorRole;
  }

  const [entries, total] = await Promise.all([
    AuditEntry.find(query)
      .populate('actor', 'fullName registrationNumber role securityPost email')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit),
    AuditEntry.countDocuments(query),
  ]);

  return {
    entries,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}
