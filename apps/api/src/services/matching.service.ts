import { Types } from 'mongoose';
import { Item, IItem } from '../models/Item';
import { MatchSuggestion, IMatchSuggestion } from '../models/MatchSuggestion';
import { ItemStatus, ItemType } from '../constants/enums';
import { logger } from '../config/logger';

// 1. Common English and Campus Noise Stop Words
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'is', 'are', 'was', 'were', 'it', 'this', 'that', 'i', 'my', 'me', 'we', 'our', 'you', 'your',
  'left', 'found', 'lost', 'near', 'inside', 'outside', 'around', 'table', 'floor', 'room', 'desk',
  'bench', 'please', 'help', 'misplaced', 'color', 'colour', 'brand', 'item', 'lpu', 'campus', 'block'
]);

// 2. LPU Campus Zone Proximity Map
const CAMPUS_ZONE_ADJACENCY: Record<string, string[]> = {
  BLOCK_30_38: ['CENTRAL_LIBRARY', 'ROBOPARK_BALDEV_RAJ_MITTAL', 'OTHER_CAMPUS_AREA'],
  BLOCK_55_58: ['UNI_MALL', 'ROBOPARK_BALDEV_RAJ_MITTAL', 'OTHER_CAMPUS_AREA'],
  UNI_MALL: ['BLOCK_55_58', 'RESIDENTIAL_BOYS_BH', 'MAIN_GATE_SECURITY'],
  CENTRAL_LIBRARY: ['BLOCK_30_38', 'ROBOPARK_BALDEV_RAJ_MITTAL'],
  INDOOR_STADIUM_SHANTI_DEVI: ['RESIDENTIAL_GIRLS_GH', 'MAIN_GATE_SECURITY'],
  RESIDENTIAL_BOYS_BH: ['UNI_MALL', 'MAIN_GATE_SECURITY', 'OTHER_CAMPUS_AREA'],
  RESIDENTIAL_GIRLS_GH: ['INDOOR_STADIUM_SHANTI_DEVI', 'MAIN_GATE_SECURITY', 'OTHER_CAMPUS_AREA'],
  MAIN_GATE_SECURITY: ['UNI_MALL', 'RESIDENTIAL_BOYS_BH', 'RESIDENTIAL_GIRLS_GH', 'INDOOR_STADIUM_SHANTI_DEVI'],
  ROBOPARK_BALDEV_RAJ_MITTAL: ['BLOCK_30_38', 'BLOCK_55_58', 'CENTRAL_LIBRARY'],
  OTHER_CAMPUS_AREA: ['BLOCK_30_38', 'BLOCK_55_58', 'UNI_MALL', 'CENTRAL_LIBRARY'],
};

// 3. Compatible Category Overlaps
const COMPATIBLE_CATEGORIES: Record<string, string[]> = {
  BAGS_BACKPACKS: ['CLOTHING_ACCESSORIES', 'OTHERS'],
  CLOTHING_ACCESSORIES: ['BAGS_BACKPACKS', 'OTHERS'],
  DOCUMENTS_BOOKS: ['STUDENT_ID_CARDS', 'OTHERS'],
  STUDENT_ID_CARDS: ['DOCUMENTS_BOOKS', 'WALLETS_PURSE'],
  WALLETS_PURSE: ['STUDENT_ID_CARDS', 'OTHERS'],
  ELECTRONICS: ['OTHERS'],
};

export interface MatchScoreResult {
  matchScore: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation: {
    categoryMatch: string;
    locationProximity: string;
    timeDelta: string;
    matchingTokens: string[];
  };
  breakdown: {
    keywordScore: number;
    categoryScore: number;
    locationScore: number;
    timeScore: number;
  };
}

/**
 * Tokenize text into normalized significant keywords
 */
export function extractSignificantTokens(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

/**
 * Deterministic scoring engine using strict specified weights:
 * - Description and keyword similarity: 40% (0.40)
 * - Category and compatible attributes: 25% (0.25)
 * - Campus location proximity: 20% (0.20)
 * - Event-time proximity: 15% (0.15)
 */
export function calculateItemMatchScore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itemA: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itemB: any
): MatchScoreResult {
  // --- 1. Keyword & Description Similarity (40%) ---
  const textA = `${itemA.title} ${itemA.publicDescription} ${itemA.specificLocation}`;
  const textB = `${itemB.title} ${itemB.publicDescription} ${itemB.specificLocation}`;

  const tokensA = new Set(extractSignificantTokens(textA));
  const tokensB = new Set(extractSignificantTokens(textB));

  const intersection: string[] = [];
  for (const t of tokensA) {
    if (tokensB.has(t)) {
      intersection.push(t);
    }
  }

  const union = new Set([...tokensA, ...tokensB]);
  let jaccard = union.size > 0 ? intersection.length / union.size : 0;

  // Title token match bonus (e.g., matching brand or model like ThinkPad, Casio)
  const titleTokensA = extractSignificantTokens(itemA.title);
  const titleTokensB = new Set(extractSignificantTokens(itemB.title));
  let titleBonus = 0;
  for (const tt of titleTokensA) {
    if (titleTokensB.has(tt)) {
      titleBonus += 0.25;
    }
  }

  const rawKeywordFactor = Math.min(1.0, jaccard * 1.5 + titleBonus);
  const keywordScore = Math.round(rawKeywordFactor * 40);

  // --- 2. Category & Compatible Attributes (25%) ---
  const catCodeA = itemA.category?.code || String(itemA.category);
  const catCodeB = itemB.category?.code || String(itemB.category);

  let rawCategoryFactor = 0;
  let categoryExplanation = 'Category mismatch';

  if (catCodeA === catCodeB) {
    rawCategoryFactor = 1.0;
    categoryExplanation = `Exact category match (${itemA.category?.name || catCodeA})`;
  } else if (COMPATIBLE_CATEGORIES[catCodeA]?.includes(catCodeB)) {
    rawCategoryFactor = 0.45;
    categoryExplanation = `Compatible category overlap (${catCodeA} vs ${catCodeB})`;
  }

  const categoryScore = Math.round(rawCategoryFactor * 25);

  // --- 3. Campus Location Proximity (20%) ---
  const locCodeA = itemA.location?.code || String(itemA.location);
  const locCodeB = itemB.location?.code || String(itemB.location);

  let rawLocationFactor = 0.1;
  let locationExplanation = `Different campus areas (${locCodeA} vs ${locCodeB})`;

  if (locCodeA === locCodeB) {
    rawLocationFactor = 1.0;
    locationExplanation = `Same campus location (${itemA.location?.name || locCodeA})`;
  } else if (CAMPUS_ZONE_ADJACENCY[locCodeA]?.includes(locCodeB)) {
    rawLocationFactor = 0.65;
    locationExplanation = `Adjacent campus zones (${locCodeA} & ${locCodeB})`;
  } else if (locCodeA === 'OTHER_CAMPUS_AREA' || locCodeB === 'OTHER_CAMPUS_AREA') {
    rawLocationFactor = 0.35;
    locationExplanation = 'Shared general campus perimeter';
  }

  const locationScore = Math.round(rawLocationFactor * 20);

  // --- 4. Event-Time Proximity (15%) ---
  const dateA = new Date(itemA.eventDate).getTime();
  const dateB = new Date(itemB.eventDate).getTime();
  const deltaHours = Math.abs(dateA - dateB) / (1000 * 60 * 60);

  let rawTimeFactor = 0.05;
  let timeExplanation = `Reports over 30 days apart (${Math.round(deltaHours / 24)} days)`;

  if (deltaHours <= 6) {
    rawTimeFactor = 1.0;
    timeExplanation = `Within 6 hours (${Math.round(deltaHours)}h delta)`;
  } else if (deltaHours <= 24) {
    rawTimeFactor = 0.85;
    timeExplanation = `Within 24 hours (same day)`;
  } else if (deltaHours <= 72) {
    rawTimeFactor = 0.65;
    timeExplanation = `Within 3 days (${Math.round(deltaHours / 24)}d delta)`;
  } else if (deltaHours <= 168) {
    rawTimeFactor = 0.45;
    timeExplanation = `Within 1 week (${Math.round(deltaHours / 24)}d delta)`;
  } else if (deltaHours <= 720) {
    rawTimeFactor = 0.25;
    timeExplanation = `Within 30 days (${Math.round(deltaHours / 24)}d delta)`;
  }

  const timeScore = Math.round(rawTimeFactor * 15);

  // Total Composite Score
  const totalScore = Math.min(100, keywordScore + categoryScore + locationScore + timeScore);

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (totalScore >= 75) {
    confidence = 'HIGH';
  } else if (totalScore >= 50) {
    confidence = 'MEDIUM';
  }

  return {
    matchScore: totalScore,
    confidence,
    explanation: {
      categoryMatch: categoryExplanation,
      locationProximity: locationExplanation,
      timeDelta: timeExplanation,
      matchingTokens: intersection,
    },
    breakdown: {
      keywordScore,
      categoryScore,
      locationScore,
      timeScore,
    },
  };
}

/**
 * Generate match suggestions for an item against opposite candidates.
 * Prevents duplicate match pairs using upsert.
 * A suggested match NEVER automatically establishes ownership.
 */
export async function generateMatchSuggestionsForItem(
  itemId: string | Types.ObjectId,
  thresholdScore: number = 35
): Promise<IMatchSuggestion[]> {
  const currentItem = await Item.findById(itemId)
    .populate('category', 'code name')
    .populate('location', 'code name campusZone');

  if (!currentItem || currentItem.isArchived) {
    return [];
  }

  // Determine opposite item type (LOST matches FOUND, FOUND matches LOST)
  const targetType = currentItem.itemType === ItemType.LOST ? ItemType.FOUND : ItemType.LOST;

  // Find candidate items that are active and not archived
  const candidates = await Item.find({
    itemType: targetType,
    isArchived: false,
    status: { $in: [ItemStatus.REPORTED, ItemStatus.IN_CUSTODY, ItemStatus.MATCH_PENDING] },
    _id: { $ne: currentItem._id },
  })
    .populate('category', 'code name')
    .populate('location', 'code name campusZone');

  const createdOrUpdated: IMatchSuggestion[] = [];
  let hasHighConfidenceMatch = false;

  for (const candidate of candidates) {
    const scoring = calculateItemMatchScore(currentItem, candidate);

    if (scoring.matchScore >= thresholdScore) {
      if (scoring.confidence === 'HIGH') {
        hasHighConfidenceMatch = true;
      }

      // Canonical pair ordering: lostItem is always the LOST item, foundItem is FOUND item
      const lostId = currentItem.itemType === ItemType.LOST ? currentItem._id : candidate._id;
      const foundId = currentItem.itemType === ItemType.FOUND ? currentItem._id : candidate._id;

      // Upsert to strictly prevent duplicate pairs
      const suggestion = await MatchSuggestion.findOneAndUpdate(
        { lostItem: lostId, foundItem: foundId },
        {
          matchScore: scoring.matchScore,
          confidence: scoring.confidence,
          explanation: scoring.explanation,
          status: 'PENDING',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      createdOrUpdated.push(suggestion);
    }
  }

  // If a high-confidence match is detected and item is still in initial REPORTED status,
  // update item status to MATCH_PENDING (alerting users without establishing ownership)
  if (hasHighConfidenceMatch && currentItem.status === ItemStatus.REPORTED) {
    currentItem.status = ItemStatus.MATCH_PENDING;
    await currentItem.save();
  }

  logger.info(
    { itemId, count: createdOrUpdated.length },
    'Deterministic matching suggestions refreshed'
  );

  return createdOrUpdated;
}

/**
 * Idempotent batch refresh job: refreshes match suggestions for all active items
 */
export async function refreshAllMatchSuggestions(): Promise<number> {
  const activeItems = await Item.find({
    isArchived: false,
    status: { $in: [ItemStatus.REPORTED, ItemStatus.IN_CUSTODY, ItemStatus.MATCH_PENDING] },
  }).select('_id');

  let totalSuggestions = 0;
  for (const item of activeItems) {
    const suggestions = await generateMatchSuggestionsForItem(item._id);
    totalSuggestions += suggestions.length;
  }

  return totalSuggestions;
}
