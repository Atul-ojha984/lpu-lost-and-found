import { IItem } from '../models/Item';
import { IItemCategory } from '../models/ItemCategory';
import { ILocation } from '../models/Location';
import { ItemType, ItemStatus } from '../constants/enums';

export interface PublicCategoryDTO {
  id: string;
  code: string;
  name: string;
  icon?: string;
}

export interface PublicLocationDTO {
  id: string;
  code: string;
  name: string;
  campusZone: string;
  hasSecurityDesk?: boolean;
}

export interface PublicItemDTO {
  id: string;
  referenceNumber: string;
  itemType: ItemType;
  title: string;
  publicDescription: string;
  category: PublicCategoryDTO;
  location: PublicLocationDTO;
  campusZone: string;
  specificLocation: string;
  eventDate: string;
  primaryImageUrl?: string;
  additionalImages: string[];
  status: ItemStatus;
  currentCustodyDesk?: string;
  createdAt: string;
  updatedAt: string;
  isOwner?: boolean;
}

export interface OwnerItemDTO extends PublicItemDTO {
  isOwner: true;
  hasPrivateDetails: boolean;
  retentionExpiresAt: string;
  verificationQuestionsCount: number;
}

/**
 * Strict allow-list serializer for public item responses.
 * Guarantees that raw Mongoose documents, internal fields, locker storage codes,
 * and private encrypted vault details are never exposed.
 */
export function toPublicItemDTO(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any,
  currentUserId?: string
): PublicItemDTO {
  const isPopulatedCategory = item.category && typeof item.category === 'object' && 'code' in item.category;
  const isPopulatedLocation = item.location && typeof item.location === 'object' && 'code' in item.location;

  const categoryObj: PublicCategoryDTO = isPopulatedCategory
    ? {
        id: item.category._id ? item.category._id.toString() : String(item.category),
        code: (item.category as IItemCategory).code,
        name: (item.category as IItemCategory).name,
        icon: (item.category as IItemCategory).icon,
      }
    : {
        id: item.category ? item.category.toString() : '',
        code: 'GENERAL',
        name: 'General Item',
      };

  const locationObj: PublicLocationDTO = isPopulatedLocation
    ? {
        id: item.location._id ? item.location._id.toString() : String(item.location),
        code: (item.location as ILocation).code,
        name: (item.location as ILocation).name,
        campusZone: (item.location as ILocation).campusZone,
        hasSecurityDesk: (item.location as ILocation).hasSecurityDesk,
      }
    : {
        id: item.location ? item.location.toString() : '',
        code: 'CAMPUS',
        name: 'LPU Campus',
        campusZone: 'General Campus Area',
      };

  const reporterId = item.reportedBy
    ? typeof item.reportedBy === 'object' && '_id' in item.reportedBy
      ? item.reportedBy._id.toString()
      : item.reportedBy.toString()
    : null;

  const isOwner = Boolean(currentUserId && reporterId && currentUserId === reporterId);

  return {
    id: item._id ? item._id.toString() : item.id,
    referenceNumber: item.referenceNumber,
    itemType: item.itemType,
    title: item.title,
    publicDescription: item.publicDescription,
    category: categoryObj,
    location: locationObj,
    campusZone: locationObj.code || locationObj.campusZone,
    specificLocation: item.specificLocation,
    eventDate: item.eventDate instanceof Date ? item.eventDate.toISOString() : new Date(item.eventDate).toISOString(),
    primaryImageUrl: item.primaryImageUrl || undefined,
    additionalImages: Array.isArray(item.additionalImages) ? item.additionalImages : [],
    status: item.status,
    currentCustodyDesk: item.currentCustodyDesk || undefined,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : new Date(item.createdAt).toISOString(),
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : new Date(item.updatedAt).toISOString(),
    isOwner,
  };
}

/**
 * Owner-specific serializer containing report status, ownership marker, and metadata
 * without exposing internal keys or raw database properties.
 */
export function toOwnerItemDTO(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any,
  hasPrivateDetails: boolean = false,
  verificationQuestionsCount: number = 0
): OwnerItemDTO {
  const publicDTO = toPublicItemDTO(item, item.reportedBy ? (item.reportedBy._id || item.reportedBy).toString() : undefined);

  return {
    ...publicDTO,
    isOwner: true,
    hasPrivateDetails,
    retentionExpiresAt: item.retentionExpiresAt instanceof Date
      ? item.retentionExpiresAt.toISOString()
      : new Date(item.retentionExpiresAt || Date.now() + 90 * 86400000).toISOString(),
    verificationQuestionsCount,
  };
}
