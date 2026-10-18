import { z } from 'zod';
import { ItemType, ItemStatus } from '../constants/enums';

export const createItemSchema = z.object({
  itemType: z.nativeEnum(ItemType),
  title: z.string().min(3, 'Title must be at least 3 characters').max(150, 'Title cannot exceed 150 characters'),
  publicDescription: z.string().min(5, 'Public description must be at least 5 characters').max(1000, 'Description cannot exceed 1000 characters'),
  category: z.string().min(1, 'Category is required'),
  location: z.string().min(1, 'Campus location is required'),
  specificLocation: z.string().min(2, 'Specific location is required').max(200),
  eventDate: z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'Event date must be a valid date format (e.g. YYYY-MM-DD)' }
  ),
  primaryImageUrl: z.string().optional().nullable(),
  additionalImages: z.array(z.string()).optional(),
  // Private identifying details to be encrypted in PrivateDetail
  privateIdentifyingDetails: z.string().max(2000).optional().nullable(),
  // Verification challenge questions
  verificationQuestions: z
    .array(
      z.object({
        questionText: z.string().min(3).max(300),
        expectedAnswer: z.string().min(1).max(200),
      })
    )
    .optional(),
});

export const updateItemSchema = z.object({
  title: z.string().min(3).max(150).optional(),
  publicDescription: z.string().min(5).max(1000).optional(),
  category: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  specificLocation: z.string().min(2).max(200).optional(),
  eventDate: z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'Event date must be a valid date format (e.g. YYYY-MM-DD)' }
  ).optional(),
  primaryImageUrl: z.string().optional().nullable(),
  additionalImages: z.array(z.string()).optional(),
  privateIdentifyingDetails: z.string().max(2000).optional().nullable(),
});

export const queryItemsSchema = z.object({
  itemType: z.enum(['LOST', 'FOUND', 'ALL']).optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  campusZone: z.string().optional(),
  status: z.nativeEnum(ItemStatus).or(z.literal('ALL')).optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(12),
  sortBy: z.enum(['createdAt', 'eventDate', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type QueryItemsInput = z.infer<typeof queryItemsSchema>;
