import { Types } from 'mongoose';
import { Item, IItem } from '../models/Item';
import { CustodyRecord, ICustodyRecord } from '../models/CustodyRecord';
import { AuditEntry } from '../models/AuditEntry';
import { ApiError } from '../utils/api-response';
import { CustodyAction, ItemStatus, UserRole, AuditAction } from '../constants/enums';
import { logger } from '../config/logger';

export interface CustodyInventoryFilters {
  search?: string;
  category?: string;
  campusZone?: string;
  status?: ItemStatus;
  desk?: string;
  page?: number;
  limit?: number;
}

export interface CustodyTransferInput {
  itemId: string;
  officerId: string;
  officerRole: UserRole;
  toLocation: string;
  lockerReference?: string;
  action: CustodyAction;
  remarks?: string;
  evidenceReference?: string;
  reqIp?: string;
  userAgent?: string;
}

/**
 * Retrieve items currently held in security custody or ready for supervised handover.
 * Restricted to authorized campus security personnel and administrators.
 */
export async function getCustodyInventory(
  officerRole: UserRole,
  filters: CustodyInventoryFilters = {}
): Promise<{
  items: IItem[];
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {
    isArchived: false,
    status: filters.status
      ? filters.status
      : { $in: [ItemStatus.IN_CUSTODY, ItemStatus.READY_FOR_HANDOVER, ItemStatus.CLAIM_IN_REVIEW, ItemStatus.MATCH_PENDING] },
  };

  if (filters.search && filters.search.trim()) {
    const escaped = filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { referenceNumber: { $regex: escaped, $options: 'i' } },
      { specificLocation: { $regex: escaped, $options: 'i' } },
      { currentCustodyDesk: { $regex: escaped, $options: 'i' } },
      { lockerStorageReference: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (filters.category) {
    query.category = new Types.ObjectId(filters.category);
  }

  if (filters.desk) {
    query.currentCustodyDesk = filters.desk;
  }

  const [items, total] = await Promise.all([
    Item.find(query)
      .populate('category', 'code name icon')
      .populate('location', 'code name campusZone')
      .populate('reportedBy', 'fullName registrationNumber email role')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit),
    Item.countDocuments(query),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Log a custody movement or intake in the append-only CustodyRecord chain.
 * Updates the item's active custody desk and locker reference.
 */
export async function transferCustody(input: CustodyTransferInput): Promise<{
  item: IItem;
  custodyRecord: ICustodyRecord;
}> {
  if (![UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN].includes(input.officerRole)) {
    throw ApiError.forbidden('Only security officers and campus administrators can perform custody transfers.');
  }

  if (!input.toLocation || !input.toLocation.trim()) {
    throw ApiError.badRequest('Destination custody desk/location is mandatory.');
  }

  const item = await Item.findById(input.itemId);
  if (!item || item.isArchived) {
    throw ApiError.notFound('Campus item not found or is no longer active.');
  }

  if (item.status === ItemStatus.HANDED_OVER) {
    throw ApiError.badRequest('Cannot transfer custody of an item that has already been handed over.');
  }

  if (item.status === ItemStatus.DISPOSED) {
    throw ApiError.badRequest('Cannot transfer custody of an item marked as disposed.');
  }

  const fromLocation = item.currentCustodyDesk || item.specificLocation || 'Initial Intake Desk';
  const toLocation = input.toLocation.trim();

  // If item was previously just REPORTED, transition to IN_CUSTODY upon formal desk check-in
  if (item.status === ItemStatus.REPORTED) {
    item.status = ItemStatus.IN_CUSTODY;
  }

  item.currentCustodyDesk = toLocation;
  if (input.lockerReference !== undefined) {
    item.lockerStorageReference = input.lockerReference.trim() || undefined;
  }
  await item.save();

  // Append immutable CustodyRecord
  const custodyRecord = await CustodyRecord.create({
    item: item._id,
    action: input.action || CustodyAction.TRANSFERRED_DESK,
    fromLocation,
    toLocation,
    lockerReference: input.lockerReference?.trim() || undefined,
    evidenceReference: input.evidenceReference?.trim() || undefined,
    handledBy: new Types.ObjectId(input.officerId),
    remarks: input.remarks?.trim() || undefined,
    timestamp: new Date(),
  });

  // Append immutable AuditEntry
  await AuditEntry.create({
    actor: new Types.ObjectId(input.officerId),
    actorRole: input.officerRole,
    action: input.action === CustodyAction.INITIAL_INTAKE ? AuditAction.CUSTODY_INTAKE : AuditAction.CUSTODY_TRANSFER,
    targetEntity: 'Item',
    targetId: item._id.toString(),
    ipAddress: input.reqIp || '127.0.0.1',
    userAgent: input.userAgent || 'unknown',
    metadata: {
      fromLocation,
      toLocation,
      lockerReference: input.lockerReference,
      custodyRecordId: custodyRecord._id.toString(),
      remarks: input.remarks,
    },
  });

  logger.info(
    { itemId: item._id, action: input.action, fromLocation, toLocation, officerId: input.officerId },
    'Custody movement recorded in append-only ledger'
  );

  return { item, custodyRecord };
}

/**
 * Retrieve the full chronological append-only custody movement history for an item.
 * Restricted to security and admin roles.
 */
export async function getItemCustodyHistory(
  officerRole: UserRole,
  itemId: string
): Promise<ICustodyRecord[]> {
  if (![UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN].includes(officerRole)) {
    throw ApiError.forbidden('Restricted to authorized campus security personnel.');
  }

  const history = await CustodyRecord.find({ item: new Types.ObjectId(itemId) })
    .populate('handledBy', 'fullName registrationNumber securityPost email role')
    .sort({ timestamp: 1 });

  return history;
}
