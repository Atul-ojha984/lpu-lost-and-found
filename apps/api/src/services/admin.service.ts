import { Types } from 'mongoose';
import { Item, IItem } from '../models/Item';
import { Claim, IClaim } from '../models/Claim';
import { ItemCategory, IItemCategory } from '../models/ItemCategory';
import { Location, ILocation } from '../models/Location';
import { User, IUser } from '../models/User';
import { DisposalRecord, IDisposalRecord } from '../models/DisposalRecord';
import { CustodyRecord } from '../models/CustodyRecord';
import { AuditEntry } from '../models/AuditEntry';
import {
  ItemType,
  ItemStatus,
  ClaimStatus,
  CustodyAction,
  DisposalMethod,
  AuditAction,
  UserRole,
} from '../constants/enums';
import { ApiError } from '../utils/api-response';
import { logger } from '../config/logger';
import {
  DisposalApprovalInput,
  UpdateUserAdminInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateLocationInput,
  UpdateLocationInput,
  AuditQueryInput,
} from '../schemas/admin.schema';

export interface AdminContext {
  userId: string;
  role: UserRole;
  registrationNumber: string;
  reqIp?: string;
  userAgent?: string;
}

export type EscalationState = 'IN_RETENTION' | 'NOTICE_PERIOD' | 'DISPOSAL_PENDING' | 'DISPOSED';

export class AdminService {
  /**
   * Calculate campus lost & found metrics strictly from database records.
   * Definitions are transparently documented to avoid hardcoded totals.
   */
  async getAnalyticsDashboard() {
    const now = new Date();

    // 1. Report counts
    const [totalLost, totalFound, totalReports] = await Promise.all([
      Item.countDocuments({ itemType: ItemType.LOST }),
      Item.countDocuments({ itemType: ItemType.FOUND }),
      Item.countDocuments({}),
    ]);

    // 2. Returns and Return Rate
    // Return Rate: percentage of found items handed over to verified claimants
    const itemsReturned = await Item.countDocuments({ status: ItemStatus.HANDED_OVER });
    const returnRatePercent =
      totalFound > 0 ? Number(((itemsReturned / totalFound) * 100).toFixed(1)) : 0;

    // 3. Median Time to Return (calculated from completed handed-over items)
    const returnedItems = await Item.find(
      { status: ItemStatus.HANDED_OVER },
      { createdAt: 1, updatedAt: 1 }
    ).lean();

    let medianTimeToReturnHours = 0;
    if (returnedItems.length > 0) {
      const durations = returnedItems
        .map((item) => {
          const diffMs = new Date(item.updatedAt).getTime() - new Date(item.createdAt).getTime();
          return Math.max(0, diffMs / (1000 * 60 * 60)); // in hours
        })
        .sort((a, b) => a - b);

      const mid = Math.floor(durations.length / 2);
      if (durations.length % 2 === 0) {
        medianTimeToReturnHours = Number(((durations[mid - 1] + durations[mid]) / 2).toFixed(1));
      } else {
        medianTimeToReturnHours = Number(durations[mid].toFixed(1));
      }
    }
    const medianTimeToReturnDays = Number((medianTimeToReturnHours / 24).toFixed(1));

    // 4. Pending Claims and Verification Failures
    const [
      pendingClaims,
      failedChallengesCount,
      failedHandoverOtpsCount,
      rejectedClaimsCount,
    ] = await Promise.all([
      Claim.countDocuments({
        status: {
          $in: [
            ClaimStatus.SUBMITTED,
            ClaimStatus.UNDER_REVIEW,
            ClaimStatus.CHALLENGE_REQUIRED,
            ClaimStatus.APPROVED,
          ],
        },
      }),
      AuditEntry.countDocuments({
        action: 'VERIFICATION_CHALLENGE_EVALUATE',
        'metadata.outcome': 'FAILED',
      }),
      AuditEntry.countDocuments({ action: 'HANDOVER_OTP_FAILED' }),
      Claim.countDocuments({ status: ClaimStatus.REJECTED }),
    ]);

    const totalVerificationFailures =
      failedChallengesCount + failedHandoverOtpsCount + rejectedClaimsCount;

    // 5. Inventory by Custody Location (Items currently in physical custody)
    const custodyInventoryRaw = await Item.aggregate([
      {
        $match: {
          status: { $in: [ItemStatus.IN_CUSTODY, ItemStatus.READY_FOR_HANDOVER] },
        },
      },
      {
        $group: {
          _id: { $ifNull: ['$currentCustodyDesk', 'Central Security Repository'] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const inventoryByCustodyLocation = custodyInventoryRaw.map((entry) => ({
      desk: entry._id as string,
      count: entry.count as number,
    }));

    // 6. Category Distribution
    const categoryDistRaw = await Item.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'itemcategories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoryDoc',
        },
      },
      { $unwind: { path: '$categoryDoc', preserveNullAndEmptyArrays: true } },
      { $sort: { count: -1 } },
    ]);

    const categoryDistribution = categoryDistRaw.map((entry) => {
      const count = entry.count as number;
      const pct = totalReports > 0 ? Number(((count / totalReports) * 100).toFixed(1)) : 0;
      return {
        categoryId: entry._id ? entry._id.toString() : 'unknown',
        categoryCode: entry.categoryDoc?.code || 'OTHER',
        categoryName: entry.categoryDoc?.name || 'Uncategorized',
        count,
        percentage: pct,
      };
    });

    // 7. Campus Location and Time Hotspots
    const locationHotspotsRaw = await Item.aggregate([
      {
        $group: {
          _id: '$location',
          totalCount: { $sum: 1 },
          lostCount: {
            $sum: { $cond: [{ $eq: ['$itemType', ItemType.LOST] }, 1, 0] },
          },
          foundCount: {
            $sum: { $cond: [{ $eq: ['$itemType', ItemType.FOUND] }, 1, 0] },
          },
        },
      },
      {
        $lookup: {
          from: 'locations',
          localField: '_id',
          foreignField: '_id',
          as: 'locationDoc',
        },
      },
      { $unwind: { path: '$locationDoc', preserveNullAndEmptyArrays: true } },
      { $sort: { totalCount: -1 } },
      { $limit: 10 },
    ]);

    const locationHotspots = locationHotspotsRaw.map((entry) => ({
      locationId: entry._id ? entry._id.toString() : 'unknown',
      name: entry.locationDoc?.name || 'Campus Unknown',
      campusZone: entry.locationDoc?.campusZone || 'Central Zone',
      buildingName: entry.locationDoc?.buildingName || '',
      totalCount: entry.totalCount as number,
      lostCount: entry.lostCount as number,
      foundCount: entry.foundCount as number,
    }));

    // Time hotspots: group by hour of day (0-23) based on eventDate
    const timeHotspotsRaw = await Item.aggregate([
      {
        $project: {
          hour: { $hour: '$eventDate' },
        },
      },
      {
        $group: {
          _id: '$hour',
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const timeHotspots = Array.from({ length: 24 }, (_, h) => {
      const match = timeHotspotsRaw.find((entry) => entry._id === h);
      return { hour: h, count: match ? match.count : 0 };
    });

    // 8. Unclaimed Item Volume and Ageing Brackets
    // Ageing brackets for items currently held:
    // 0-30 days, 31-60 days, 61-90 days, >90 days (Statutory Overdue)
    const unclaimedFoundItems = await Item.find({
      itemType: ItemType.FOUND,
      status: {
        $in: [ItemStatus.IN_CUSTODY, ItemStatus.MATCH_PENDING, ItemStatus.UNCLAIMED_EXPIRED],
      },
    }).select('eventDate createdAt retentionExpiresAt status');

    const ageingBrackets = {
      under30Days: 0,
      from31To60Days: 0,
      from61To90Days: 0,
      over90Days: 0,
    };

    let totalUnclaimedInCustody = 0;
    unclaimedFoundItems.forEach((item) => {
      totalUnclaimedInCustody++;
      const ageDays = Math.floor(
        (now.getTime() - new Date(item.eventDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (ageDays <= 30) {
        ageingBrackets.under30Days++;
      } else if (ageDays <= 60) {
        ageingBrackets.from31To60Days++;
      } else if (ageDays <= 90) {
        ageingBrackets.from61To90Days++;
      } else {
        ageingBrackets.over90Days++;
      }
    });

    // 9. Return metric calculations with definitions
    return {
      overview: {
        totalReports,
        totalLost,
        totalFound,
        itemsReturned,
        returnRatePercent,
        pendingClaims,
        totalVerificationFailures,
        totalUnclaimedInCustody,
      },
      returnMetrics: {
        itemsReturned,
        returnRatePercent,
        returnRateDefinition:
          'Percentage of reported found items successfully verified and handed over to rightful claimants: (itemsReturned / totalFound) * 100.',
        medianTimeToReturnHours,
        medianTimeToReturnDays,
        medianTimeToReturnDefinition:
          'Median elapsed duration between report creation and verified physical custody handover across all returned items.',
      },
      verificationMetrics: {
        pendingClaims,
        totalVerificationFailures,
        failedChallengesCount,
        failedHandoverOtpsCount,
        rejectedClaimsCount,
        failureDefinition:
          'Sum of failed private ownership challenge attempts, failed OTP handovers, and claims rejected after security review.',
      },
      custodyInventory: {
        totalInCustody: totalUnclaimedInCustody,
        byLocation: inventoryByCustodyLocation,
      },
      categoryDistribution,
      hotspots: {
        locations: locationHotspots,
        hourly: timeHotspots,
      },
      ageing: {
        brackets: ageingBrackets,
        statutoryRetentionPeriodDays: 90,
        ageingDefinition:
          'Distribution of unclaimed items by age from event date. Items exceeding category retention threshold require administrative committee approval before disposal.',
      },
    };
  }

  /**
   * Get Ageing Queue with escalation states for campus custody items.
   * Escalation states:
   * - IN_RETENTION: > 15 days until statutory expiry
   * - NOTICE_PERIOD: Within 15 days before or after retention expiry
   * - DISPOSAL_PENDING: > 15 days overdue past retention, awaiting administrative committee review
   * - DISPOSED: Item has undergone formal approved disposal
   */
  async getAgeingQueue(params: {
    escalationState?: EscalationState | 'ALL';
    search?: string;
    category?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const now = new Date();

    const query: Record<string, unknown> = {
      itemType: ItemType.FOUND,
      status: {
        $in: [
          ItemStatus.IN_CUSTODY,
          ItemStatus.MATCH_PENDING,
          ItemStatus.UNCLAIMED_EXPIRED,
          ItemStatus.DISPOSED,
        ],
      },
    };

    if (params.category) {
      query.category = new Types.ObjectId(params.category);
    }

    if (params.search) {
      query.$or = [
        { referenceNumber: { $regex: params.search, $options: 'i' } },
        { title: { $regex: params.search, $options: 'i' } },
        { currentCustodyDesk: { $regex: params.search, $options: 'i' } },
      ];
    }

    // Query candidate items
    const rawItems = await Item.find(query)
      .populate('category', 'code name defaultRetentionDays')
      .populate('location', 'code name campusZone')
      .populate('reportedBy', 'fullName email registrationNumber')
      .sort({ eventDate: 1 })
      .lean();

    // Map each item with computed ageing metrics and escalation state
    const processedItems = rawItems.map((item) => {
      const eventDate = new Date(item.eventDate);
      const retentionExpiresAt = new Date(item.retentionExpiresAt);
      const daysElapsed = Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysUntilExpiry = Math.ceil(
        (retentionExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      const isRetentionExpired = retentionExpiresAt.getTime() <= now.getTime();

      let escalationState: EscalationState = 'IN_RETENTION';
      if (item.status === ItemStatus.DISPOSED) {
        escalationState = 'DISPOSED';
      } else if (daysUntilExpiry > 15) {
        escalationState = 'IN_RETENTION';
      } else if (daysUntilExpiry <= 15 && daysUntilExpiry >= -15) {
        escalationState = 'NOTICE_PERIOD';
      } else {
        escalationState = 'DISPOSAL_PENDING';
      }

      return {
        ...item,
        daysElapsed,
        daysUntilExpiry,
        isRetentionExpired,
        escalationState,
      };
    });

    // Filter by escalationState if specified
    const filtered =
      params.escalationState && params.escalationState !== 'ALL'
        ? processedItems.filter((i) => i.escalationState === params.escalationState)
        : processedItems;

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginatedItems = filtered.slice((page - 1) * limit, page * limit);

    return {
      items: paginatedItems,
      total,
      page,
      limit,
      totalPages,
      countsByState: {
        inRetention: processedItems.filter((i) => i.escalationState === 'IN_RETENTION').length,
        noticePeriod: processedItems.filter((i) => i.escalationState === 'NOTICE_PERIOD').length,
        disposalPending: processedItems.filter((i) => i.escalationState === 'DISPOSAL_PENDING').length,
        disposed: processedItems.filter((i) => i.escalationState === 'DISPOSED').length,
      },
    };
  }

  /**
   * Formal Administrative Disposal Approval.
   * Statutory Rule: Never automatically dispose of an item merely because it is old.
   * Requires human administrative signoff with committee notes, disposal method, and certificate reference.
   */
  async approveDisposal(input: DisposalApprovalInput, adminContext: AdminContext) {
    if (
      adminContext.role !== UserRole.CAMPUS_ADMIN &&
      adminContext.role !== UserRole.SYSTEM_ADMIN
    ) {
      throw ApiError.forbidden(
        'Privileged Operation: Only CAMPUS_ADMIN or SYSTEM_ADMIN may approve item disposal.'
      );
    }

    const item = await Item.findById(input.itemId);
    if (!item) {
      throw ApiError.notFound('Item not found for disposal approval.');
    }

    if (item.status === ItemStatus.DISPOSED) {
      throw ApiError.badRequest('Item has already been disposed.');
    }

    if (item.status === ItemStatus.HANDED_OVER) {
      throw ApiError.badRequest('Item was already handed over to a claimant and cannot be disposed.');
    }

    // Create DisposalRecord with committee reason, approver, date and evidence reference
    const disposalRecord = await DisposalRecord.create({
      item: item._id,
      method: input.method,
      approvedBy: new Types.ObjectId(adminContext.userId),
      committeeNotes: input.reason.trim(),
      reason: input.reason.trim(),
      recipientOrganization: input.recipientOrganization?.trim() || undefined,
      disposalDate: new Date(),
      certificateUrl: input.certificateUrl?.trim() || undefined,
      evidenceReference: input.certificateUrl?.trim() || undefined,
    });

    // Update Item status
    const previousStatus = item.status;
    item.status = ItemStatus.DISPOSED;
    item.isArchived = true;
    await item.save();

    // Append-only CustodyRecord
    await CustodyRecord.create({
      item: item._id,
      action: CustodyAction.DISPOSED,
      fromLocation: item.currentCustodyDesk || 'Central Security Repository',
      toLocation: input.recipientOrganization || input.method,
      handledBy: new Types.ObjectId(adminContext.userId),
      evidenceReference: input.certificateUrl?.trim() || undefined,
      remarks: `Disposal authorized by administrative committee via ${input.method}. Reason: ${input.reason}`,
      timestamp: new Date(),
    });

    // Immutable AuditEntry log for privileged action
    await AuditEntry.create({
      actor: new Types.ObjectId(adminContext.userId),
      actorRole: adminContext.role,
      action: AuditAction.ITEM_DISPOSE,
      targetEntity: 'Item',
      targetId: item._id.toString(),
      ipAddress: adminContext.reqIp || '127.0.0.1',
      userAgent: adminContext.userAgent || 'unknown',
      metadata: {
        referenceNumber: item.referenceNumber,
        title: item.title,
        previousStatus,
        method: input.method,
        reason: input.reason,
        recipientOrganization: input.recipientOrganization,
        disposalRecordId: disposalRecord._id.toString(),
      },
    });

    logger.info(
      {
        itemId: item._id,
        referenceNumber: item.referenceNumber,
        method: input.method,
        approvedBy: adminContext.userId,
      },
      'Item disposal formally executed and logged to audit trail'
    );

    return {
      item,
      disposalRecord,
    };
  }

  /**
   * User Administration: List campus users with filter and pagination
   */
  async listUsers(params: {
    role?: UserRole | 'ALL';
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));

    const query: Record<string, unknown> = {};

    if (params.role && params.role !== 'ALL') {
      query.role = params.role;
    }

    if (params.isActive !== undefined) {
      query.isActive = params.isActive;
    }

    if (params.search) {
      query.$or = [
        { fullName: { $regex: params.search, $options: 'i' } },
        { email: { $regex: params.search, $options: 'i' } },
        { registrationNumber: { $regex: params.search, $options: 'i' } },
        { securityPost: { $regex: params.search, $options: 'i' } },
      ];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(query),
      User.find(query)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * User Administration: Update user role, security post, and account status
   */
  async updateUser(
    userId: string,
    input: UpdateUserAdminInput,
    adminContext: AdminContext
  ) {
    if (
      adminContext.role !== UserRole.CAMPUS_ADMIN &&
      adminContext.role !== UserRole.SYSTEM_ADMIN
    ) {
      throw ApiError.forbidden('Only administrators may manage user privileges and accounts.');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('Target user not found.');
    }

    // Safety guard: prevent self-deactivation or demotion of current admin
    if (adminContext.userId === user._id.toString()) {
      if (input.isActive === false) {
        throw ApiError.badRequest('Administrators cannot deactivate their own active account.');
      }
      if (input.role && input.role !== adminContext.role) {
        throw ApiError.badRequest('Administrators cannot demote their own active role.');
      }
    }

    const previousRole = user.role;
    const previousActive = user.isActive;
    const previousSecurityPost = user.securityPost;

    if (input.role !== undefined) user.role = input.role;
    if (input.securityPost !== undefined) user.securityPost = input.securityPost.trim();
    if (input.department !== undefined) user.department = input.department.trim();
    if (input.phone !== undefined) user.phone = input.phone.trim();
    if (input.isActive !== undefined) user.isActive = input.isActive;

    await user.save();

    // Audit trail logging
    await AuditEntry.create({
      actor: new Types.ObjectId(adminContext.userId),
      actorRole: adminContext.role,
      action: AuditAction.ROLE_UPDATE,
      targetEntity: 'User',
      targetId: user._id.toString(),
      ipAddress: adminContext.reqIp || '127.0.0.1',
      userAgent: adminContext.userAgent || 'unknown',
      metadata: {
        targetUserEmail: user.email,
        targetRegistrationNumber: user.registrationNumber,
        previousRole,
        newRole: user.role,
        previousActive,
        newActive: user.isActive,
        previousSecurityPost,
        newSecurityPost: user.securityPost,
      },
    });

    return user;
  }

  /**
   * Category Administration: List all item categories
   */
  async listCategories(includeInactive = false) {
    const filter = includeInactive ? {} : { isActive: true };
    return ItemCategory.find(filter).sort({ name: 1 }).lean();
  }

  /**
   * Category Administration: Create new category with configured retention period
   */
  async createCategory(input: CreateCategoryInput, adminContext: AdminContext) {
    const existing = await ItemCategory.findOne({ code: input.code.toUpperCase() });
    if (existing) {
      throw ApiError.conflict(`Category code '${input.code}' already exists.`);
    }

    const category = await ItemCategory.create({
      code: input.code.toUpperCase().trim(),
      name: input.name.trim(),
      description: input.description?.trim(),
      icon: input.icon?.trim(),
      defaultRetentionDays: input.defaultRetentionDays || 90,
      isActive: input.isActive !== undefined ? input.isActive : true,
    });

    await AuditEntry.create({
      actor: new Types.ObjectId(adminContext.userId),
      actorRole: adminContext.role,
      action: AuditAction.CATEGORY_MANAGE,
      targetEntity: 'ItemCategory',
      targetId: category._id.toString(),
      ipAddress: adminContext.reqIp || '127.0.0.1',
      userAgent: adminContext.userAgent || 'unknown',
      metadata: {
        actionType: 'CREATE',
        code: category.code,
        name: category.name,
        defaultRetentionDays: category.defaultRetentionDays,
      },
    });

    return category;
  }

  /**
   * Category Administration: Update existing category
   */
  async updateCategory(
    categoryId: string,
    input: UpdateCategoryInput,
    adminContext: AdminContext
  ) {
    const category = await ItemCategory.findById(categoryId);
    if (!category) {
      throw ApiError.notFound('Category not found.');
    }

    if (input.name !== undefined) category.name = input.name.trim();
    if (input.description !== undefined) category.description = input.description.trim();
    if (input.icon !== undefined) category.icon = input.icon.trim();
    if (input.defaultRetentionDays !== undefined)
      category.defaultRetentionDays = input.defaultRetentionDays;
    if (input.isActive !== undefined) category.isActive = input.isActive;

    await category.save();

    await AuditEntry.create({
      actor: new Types.ObjectId(adminContext.userId),
      actorRole: adminContext.role,
      action: AuditAction.CATEGORY_MANAGE,
      targetEntity: 'ItemCategory',
      targetId: category._id.toString(),
      ipAddress: adminContext.reqIp || '127.0.0.1',
      userAgent: adminContext.userAgent || 'unknown',
      metadata: {
        actionType: 'UPDATE',
        code: category.code,
        name: category.name,
        defaultRetentionDays: category.defaultRetentionDays,
        isActive: category.isActive,
      },
    });

    return category;
  }

  /**
   * Location Administration: List campus locations
   */
  async listLocations(includeInactive = false) {
    const filter = includeInactive ? {} : { isActive: true };
    return Location.find(filter).sort({ campusZone: 1, name: 1 }).lean();
  }

  /**
   * Location Administration: Create new location
   */
  async createLocation(input: CreateLocationInput, adminContext: AdminContext) {
    const existing = await Location.findOne({ code: input.code.toUpperCase() });
    if (existing) {
      throw ApiError.conflict(`Location code '${input.code}' already exists.`);
    }

    const location = await Location.create({
      code: input.code.toUpperCase().trim(),
      name: input.name.trim(),
      campusZone: input.campusZone.trim(),
      buildingName: input.buildingName?.trim(),
      hasSecurityDesk: input.hasSecurityDesk || false,
      securityContactPhone: input.securityContactPhone?.trim(),
      isActive: input.isActive !== undefined ? input.isActive : true,
    });

    await AuditEntry.create({
      actor: new Types.ObjectId(adminContext.userId),
      actorRole: adminContext.role,
      action: AuditAction.LOCATION_MANAGE,
      targetEntity: 'Location',
      targetId: location._id.toString(),
      ipAddress: adminContext.reqIp || '127.0.0.1',
      userAgent: adminContext.userAgent || 'unknown',
      metadata: {
        actionType: 'CREATE',
        code: location.code,
        name: location.name,
        campusZone: location.campusZone,
      },
    });

    return location;
  }

  /**
   * Location Administration: Update existing location
   */
  async updateLocation(
    locationId: string,
    input: UpdateLocationInput,
    adminContext: AdminContext
  ) {
    const location = await Location.findById(locationId);
    if (!location) {
      throw ApiError.notFound('Location not found.');
    }

    if (input.name !== undefined) location.name = input.name.trim();
    if (input.campusZone !== undefined) location.campusZone = input.campusZone.trim();
    if (input.buildingName !== undefined) location.buildingName = input.buildingName.trim();
    if (input.hasSecurityDesk !== undefined) location.hasSecurityDesk = input.hasSecurityDesk;
    if (input.securityContactPhone !== undefined)
      location.securityContactPhone = input.securityContactPhone.trim();
    if (input.isActive !== undefined) location.isActive = input.isActive;

    await location.save();

    await AuditEntry.create({
      actor: new Types.ObjectId(adminContext.userId),
      actorRole: adminContext.role,
      action: AuditAction.LOCATION_MANAGE,
      targetEntity: 'Location',
      targetId: location._id.toString(),
      ipAddress: adminContext.reqIp || '127.0.0.1',
      userAgent: adminContext.userAgent || 'unknown',
      metadata: {
        actionType: 'UPDATE',
        code: location.code,
        name: location.name,
        campusZone: location.campusZone,
        isActive: location.isActive,
      },
    });

    return location;
  }

  /**
   * Audit History Search with Privacy Protections.
   * STRICT GUARANTEE: Never exposes passwords, OTPs, raw secrets or private verification answers.
   */
  async searchAuditLogs(params: AuditQueryInput) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));

    const filter: Record<string, unknown> = {};

    if (params.action) {
      filter.action = params.action;
    }

    if (params.targetEntity) {
      filter.targetEntity = params.targetEntity;
    }

    if (params.actorId) {
      if (Types.ObjectId.isValid(params.actorId)) {
        filter.actor = new Types.ObjectId(params.actorId);
      }
    }

    if (params.startDate || params.endDate) {
      const timeFilter: Record<string, Date> = {};
      if (params.startDate) timeFilter.$gte = new Date(params.startDate);
      if (params.endDate) timeFilter.$lte = new Date(params.endDate);
      filter.timestamp = timeFilter;
    }

    const [total, rawEntries] = await Promise.all([
      AuditEntry.countDocuments(filter),
      AuditEntry.find(filter)
        .populate('actor', 'fullName email registrationNumber role')
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    // Redaction and sanitization pass: ensure zero sensitive info is exposed
    const sanitizedEntries = rawEntries.map((entry) => {
      const metadata = entry.metadata ? { ...entry.metadata } : {};

      // Strip sensitive keys
      const sensitiveKeys = [
        'password',
        'passwordHash',
        'otp',
        'otpSecret',
        'expectedAnswer',
        'privateIdentifyingDetails',
        'token',
      ];
      for (const key of sensitiveKeys) {
        if (key in metadata) {
          metadata[key] = '[REDACTED]';
        }
      }

      return {
        _id: entry._id,
        actor: entry.actor,
        actorRole: entry.actorRole,
        action: entry.action,
        targetEntity: entry.targetEntity,
        targetId: entry.targetId,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        metadata,
        timestamp: entry.timestamp,
      };
    });

    return {
      items: sanitizedEntries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}

export const adminService = new AdminService();
