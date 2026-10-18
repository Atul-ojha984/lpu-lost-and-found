import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Item } from '../models/Item';
import { MatchSuggestion } from '../models/MatchSuggestion';
import { generateMatchSuggestionsForItem, refreshAllMatchSuggestions } from '../services/matching.service';
import { toPublicItemDTO } from '../dtos/item.dto';
import { ApiError, sendSuccess } from '../utils/api-response';
import { UserRole } from '../constants/enums';

/**
 * GET /api/v1/items/:id/matches
 * Returns explainable match suggestions for a specific lost or found item.
 * Restricted to the item's reporter or authorized campus security personnel.
 */
export async function getMatchesForItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required to view match suggestions.');
    }

    const rawId = String(req.params.id);
    const item = await Item.findById(rawId);

    if (!item || item.isArchived) {
      throw ApiError.notFound('Item not found.');
    }

    // Access control: User must be reporter or security/admin
    const isReporter = item.reportedBy.toString() === req.user.userId;
    const isStaffOrSecurity = [UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN].includes(req.user.role);

    if (!isReporter && !isStaffOrSecurity) {
      throw ApiError.forbidden('You are not authorized to view match suggestions for this item.');
    }

    const suggestions = await MatchSuggestion.find({
      $or: [{ lostItem: item._id }, { foundItem: item._id }],
      status: { $ne: 'DISMISSED' },
    })
      .populate({
        path: 'lostItem',
        populate: [{ path: 'category', select: 'code name' }, { path: 'location', select: 'code name campusZone' }],
      })
      .populate({
        path: 'foundItem',
        populate: [{ path: 'category', select: 'code name' }, { path: 'location', select: 'code name campusZone' }],
      })
      .sort({ matchScore: -1 });

    const formatted = suggestions.map((s) => ({
      id: s._id.toString(),
      matchScore: s.matchScore,
      confidence: s.confidence,
      explanation: s.explanation,
      status: s.status,
      lostItem: toPublicItemDTO(s.lostItem, req.user?.userId),
      foundItem: toPublicItemDTO(s.foundItem, req.user?.userId),
      createdAt: s.createdAt,
    }));

    sendSuccess(res, formatted);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/items/:id/matches/refresh
 * Triggers an on-demand idempotent refresh of deterministic match suggestions for an item.
 */
export async function refreshMatchesForItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required to refresh match suggestions.');
    }

    const rawId = String(req.params.id);
    const suggestions = await generateMatchSuggestionsForItem(rawId);

    sendSuccess(res, { count: suggestions.length }, 200, 'Match suggestions refreshed successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/matches/refresh-all
 * Batch job to refresh match suggestions across all active campus records.
 */
export async function refreshAllMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await refreshAllMatchSuggestions();
    sendSuccess(res, { count }, 200, 'All campus match suggestions refreshed.');
  } catch (error) {
    next(error);
  }
}
