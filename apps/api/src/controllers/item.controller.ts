import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Item } from '../models/Item';
import { ItemCategory } from '../models/ItemCategory';
import { Location } from '../models/Location';
import { PrivateDetail } from '../models/PrivateDetail';
import { VerificationChallenge } from '../models/VerificationChallenge';
import { AuditEntry } from '../models/AuditEntry';
import { ApiError, sendSuccess } from '../utils/api-response';
import { toPublicItemDTO, toOwnerItemDTO } from '../dtos/item.dto';
import { encryptField, hashPassword } from '../utils/crypto';
import { processAndStoreImage } from '../services/image.service';
import { ItemType, ItemStatus, AuditAction, UserRole } from '../constants/enums';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { CreateItemInput, UpdateItemInput, QueryItemsInput } from '../schemas/item.schema';
import { generateMatchSuggestionsForItem } from '../services/matching.service';

/**
 * Helper to resolve Category ID whether passed as ObjectId or Category Code (e.g. 'ELECTRONICS')
 */
async function resolveCategoryId(input: string): Promise<Types.ObjectId> {
  if (Types.ObjectId.isValid(input)) {
    const existing = await ItemCategory.findById(input);
    if (existing) return existing._id;
  }
  const byCode = await ItemCategory.findOne({ code: input.toUpperCase().trim() });
  if (byCode) return byCode._id;

  throw ApiError.badRequest(`Category not recognized: '${input}'. Please provide a valid category ID or code.`);
}

/**
 * Helper to resolve Location ID whether passed as ObjectId or Location Code (e.g. 'BLOCK_30_38')
 */
async function resolveLocationId(input: string): Promise<Types.ObjectId> {
  if (Types.ObjectId.isValid(input)) {
    const existing = await Location.findById(input);
    if (existing) return existing._id;
  }
  const byCode = await Location.findOne({ code: input.toUpperCase().trim() });
  if (byCode) return byCode._id;

  throw ApiError.badRequest(`Campus location not recognized: '${input}'. Please provide a valid location ID or code.`);
}

/**
 * Generate unique campus tracking reference number (e.g., LPU-2026-L54109 or LPU-2026-F98214)
 */
async function generateReferenceNumber(type: ItemType): Promise<string> {
  const prefix = type === ItemType.LOST ? 'L' : 'F';
  const year = new Date().getFullYear();
  let attempts = 0;

  while (attempts < 10) {
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    const candidate = `LPU-${year}-${prefix}${randomDigits}`;
    const exists = await Item.exists({ referenceNumber: candidate });
    if (!exists) {
      return candidate;
    }
    attempts++;
  }

  return `LPU-${year}-${prefix}${Date.now().toString().slice(-5)}`;
}

/**
 * POST /api/v1/items/lost or /api/v1/items/found or /api/v1/items
 * Create a new lost or found property report (requires authentication)
 */
export async function createReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required to file a report.');
    }

    const body = req.body as CreateItemInput;
    const categoryId = await resolveCategoryId(body.category);
    const locationId = await resolveLocationId(body.location);
    const referenceNumber = await generateReferenceNumber(body.itemType);

    const retentionExpiresAt = new Date(
      Date.now() + (env.RETENTION_PERIOD_DAYS || 90) * 24 * 60 * 60 * 1000
    );

    // 1. Create main public Item document
    const newItem = await Item.create({
      referenceNumber,
      itemType: body.itemType,
      title: body.title,
      publicDescription: body.publicDescription,
      category: categoryId,
      location: locationId,
      specificLocation: body.specificLocation,
      eventDate: new Date(body.eventDate),
      primaryImageUrl: body.primaryImageUrl || undefined,
      additionalImages: body.additionalImages || [],
      status: ItemStatus.REPORTED,
      reportedBy: new Types.ObjectId(req.user.userId),
      retentionExpiresAt,
      isArchived: false,
    });

    // 2. Encrypted Private Vault Detail (if sensitive marks or private contents provided)
    let hasPrivateDetails = false;
    if (body.privateIdentifyingDetails && body.privateIdentifyingDetails.trim()) {
      const encrypted = encryptField(body.privateIdentifyingDetails.trim());
      await PrivateDetail.create({
        item: newItem._id,
        encryptedCiphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        fieldsSummary: ['identifyingMarks', 'serialNumbers'],
      });
      hasPrivateDetails = true;
    }

    // 3. Ownership Verification Questions (if provided)
    let questionCount = 0;
    if (Array.isArray(body.verificationQuestions) && body.verificationQuestions.length > 0) {
      for (const q of body.verificationQuestions) {
        if (q.questionText && q.expectedAnswer) {
          const hashedAnswer = await hashPassword(q.expectedAnswer.trim().toLowerCase());
          await VerificationChallenge.create({
            item: newItem._id,
            questionText: q.questionText.trim(),
            hashedAnswer,
            isActive: true,
          });
          questionCount++;
        }
      }
    }

    // 4. Audit Log Entry
    await AuditEntry.create({
      actor: new Types.ObjectId(req.user.userId),
      actorRole: req.user.role,
      action: body.itemType === ItemType.LOST ? AuditAction.ITEM_REPORT_LOST : AuditAction.ITEM_REPORT_FOUND,
      targetEntity: 'Item',
      targetId: newItem._id.toString(),
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'unknown',
      metadata: { referenceNumber, title: newItem.title },
    });

    // Populate references for clean DTO
    const populatedItem = await Item.findById(newItem._id)
      .populate('category', 'code name icon')
      .populate('location', 'code name campusZone hasSecurityDesk');

    const ownerDTO = toOwnerItemDTO(populatedItem, hasPrivateDetails, questionCount);

    logger.info(
      { referenceNumber, itemType: body.itemType, user: req.user.email },
      'New campus property report successfully filed'
    );

    // Trigger asynchronous matching suggestions generation
    generateMatchSuggestionsForItem(newItem._id).catch(() => {});

    sendSuccess(res, ownerDTO, 201, 'Report successfully filed.');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/items
 * Public search board endpoint with keyword search, filters, pagination, and stable sorting.
 * Strictly guarantees that raw Mongoose documents and private vault fields are never returned.
 */
export async function getItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as QueryItemsInput;

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    // Build MongoDB query filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {
      isArchived: false,
    };

    // Status Filter: default to excluding archived/disposed items unless specifically requested
    if (query.status && query.status !== 'ALL') {
      filter.status = query.status;
    } else {
      filter.status = { $ne: ItemStatus.DISPOSED };
    }

    // Item Type Filter
    if (query.itemType && query.itemType !== 'ALL') {
      filter.itemType = query.itemType;
    }

    // Category Filter (accepts ObjectId or Category Code)
    if (query.category && query.category !== 'ALL') {
      if (Types.ObjectId.isValid(query.category)) {
        filter.category = new Types.ObjectId(query.category);
      } else {
        const cat = await ItemCategory.findOne({ code: query.category.toUpperCase().trim() });
        if (cat) {
          filter.category = cat._id;
        }
      }
    }

    // Campus Zone or Location Filter
    if (query.location && query.location !== 'ALL') {
      if (Types.ObjectId.isValid(query.location)) {
        filter.location = new Types.ObjectId(query.location);
      } else {
        const loc = await Location.findOne({ code: query.location.toUpperCase().trim() });
        if (loc) {
          filter.location = loc._id;
        }
      }
    } else if (query.campusZone && query.campusZone !== 'ALL') {
      const locs = await Location.find({
        $or: [
          { code: query.campusZone.toUpperCase().trim() },
          { campusZone: { $regex: query.campusZone, $options: 'i' } },
        ],
      }).select('_id');
      if (locs.length > 0) {
        filter.location = { $in: locs.map((l) => l._id) };
      }
    }

    // Date Range Filter
    if (query.startDate || query.endDate) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dateQuery: Record<string, any> = {};
      if (query.startDate) dateQuery.$gte = new Date(query.startDate);
      if (query.endDate) dateQuery.$lte = new Date(query.endDate);
      filter.eventDate = dateQuery;
    }

    // Keyword Search across title, referenceNumber, publicDescription, and specificLocation
    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { title: { $regex: regex } },
        { referenceNumber: { $regex: regex } },
        { publicDescription: { $regex: regex } },
        { specificLocation: { $regex: regex } },
      ];
    }

    // Execute Count & Query with Stable Sorting
    const [totalItems, items] = await Promise.all([
      Item.countDocuments(filter),
      Item.find(filter)
        .populate('category', 'code name icon')
        .populate('location', 'code name campusZone hasSecurityDesk')
        .sort({ [sortBy]: sortOrder, _id: -1 }) // Stable compound sort
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;
    const currentUserId = req.user?.userId;

    // Strict sanitization via Public DTO allow-list
    const serializedItems = items.map((item) => toPublicItemDTO(item, currentUserId));

    sendSuccess(res, {
      items: serializedItems,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/items/:id
 * Retrieve a single item by MongoDB ObjectId or Reference Number
 */
export async function getItemById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = String(req.params.id);

    let item = null;
    if (Types.ObjectId.isValid(rawId)) {
      item = await Item.findById(rawId)
        .populate('category', 'code name icon')
        .populate('location', 'code name campusZone hasSecurityDesk');
    } else {
      item = await Item.findOne({ referenceNumber: rawId.toUpperCase().trim() })
        .populate('category', 'code name icon')
        .populate('location', 'code name campusZone hasSecurityDesk');
    }

    if (!item || item.isArchived) {
      throw ApiError.notFound('Item listing not found.');
    }

    const currentUserId = req.user?.userId;
    const isOwner = Boolean(currentUserId && item.reportedBy && item.reportedBy.toString() === currentUserId);

    if (isOwner) {
      const hasPrivate = await PrivateDetail.exists({ item: item._id });
      const challengeCount = await VerificationChallenge.countDocuments({ item: item._id });
      sendSuccess(res, toOwnerItemDTO(item, Boolean(hasPrivate), challengeCount));
      return;
    }

    // Public requester receives sanitized allow-list DTO
    sendSuccess(res, toPublicItemDTO(item, currentUserId));
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/items/:id
 * Edit an existing report (permitted only for the authorized owner or administrator, while eligible)
 */
export async function updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required to modify a report.');
    }

    const rawId = String(req.params.id);
    const item = await Item.findById(rawId);

    if (!item || item.isArchived) {
      throw ApiError.notFound('Item report not found.');
    }

    // Authorization check: User must be report owner or admin
    const isOwner = item.reportedBy.toString() === req.user.userId;
    const isAdmin = [UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      throw ApiError.forbidden('You are not authorized to edit this report.');
    }

    // Status check: items in HANDED_OVER or DISPOSED cannot be edited
    if ([ItemStatus.HANDED_OVER, ItemStatus.DISPOSED].includes(item.status)) {
      throw ApiError.badRequest('This property report has already reached final completion and can no longer be edited.');
    }

    const body = req.body as UpdateItemInput;

    if (body.title) item.title = body.title.trim();
    if (body.publicDescription) item.publicDescription = body.publicDescription.trim();
    if (body.specificLocation) item.specificLocation = body.specificLocation.trim();
    if (body.eventDate) item.eventDate = new Date(body.eventDate);
    if (body.primaryImageUrl !== undefined) item.primaryImageUrl = body.primaryImageUrl || undefined;
    if (body.additionalImages) item.additionalImages = body.additionalImages;

    if (body.category) {
      item.category = await resolveCategoryId(body.category);
    }
    if (body.location) {
      item.location = await resolveLocationId(body.location);
    }

    await item.save();

    // If private identifying details were updated
    let hasPrivate = false;
    if (body.privateIdentifyingDetails !== undefined) {
      if (body.privateIdentifyingDetails && body.privateIdentifyingDetails.trim()) {
        const encrypted = encryptField(body.privateIdentifyingDetails.trim());
        await PrivateDetail.findOneAndUpdate(
          { item: item._id },
          {
            encryptedCiphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            fieldsSummary: ['identifyingMarks', 'serialNumbers'],
          },
          { upsert: true }
        );
        hasPrivate = true;
      } else {
        await PrivateDetail.deleteOne({ item: item._id });
      }
    } else {
      hasPrivate = Boolean(await PrivateDetail.exists({ item: item._id }));
    }

    const updatedPopulated = await Item.findById(item._id)
      .populate('category', 'code name icon')
      .populate('location', 'code name campusZone hasSecurityDesk');

    // Refresh match suggestions for updated item
    generateMatchSuggestionsForItem(item._id).catch(() => {});

    sendSuccess(res, toOwnerItemDTO(updatedPopulated, hasPrivate), 200, 'Report updated successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/items/my-reports
 * List all items filed by the authenticated user
 */
export async function getMyReports(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required to view your reports.');
    }

    const items = await Item.find({ reportedBy: new Types.ObjectId(req.user.userId), isArchived: false })
      .populate('category', 'code name icon')
      .populate('location', 'code name campusZone hasSecurityDesk')
      .sort({ createdAt: -1 });

    const ownerReports = await Promise.all(
      items.map(async (item) => {
        const hasPrivate = Boolean(await PrivateDetail.exists({ item: item._id }));
        const challengeCount = await VerificationChallenge.countDocuments({ item: item._id });
        return toOwnerItemDTO(item, hasPrivate, challengeCount);
      })
    );

    sendSuccess(res, ownerReports);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/items/upload
 * Process photograph via Sharp: resize, strip metadata, convert to WebP, save to storage
 */
export async function uploadImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      throw ApiError.badRequest('No image file uploaded.');
    }

    // Base URL for image reference
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const result = await processAndStoreImage(req.file.buffer, req.file.originalname, baseUrl);

    sendSuccess(res, result, 201, 'Image processed and uploaded successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/categories
 * Public reference endpoint returning list of item categories
 */
export async function getCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await ItemCategory.find({ isActive: true }).sort({ name: 1 });
    sendSuccess(res, categories);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/locations
 * Public reference endpoint returning list of campus locations
 */
export async function getLocations(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const locations = await Location.find().sort({ code: 1 });
    sendSuccess(res, locations);
  } catch (error) {
    next(error);
  }
}
