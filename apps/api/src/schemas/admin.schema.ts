import { z } from 'zod';
import { UserRole, DisposalMethod } from '../constants/enums';

export const disposalApprovalSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  method: z.nativeEnum(DisposalMethod, {
    errorMap: () => ({ message: 'Valid disposal method is required (DONATION, AUCTION, DESTRUCTION, RECYCLED)' }),
  }),
  reason: z.string().min(5, 'Disposal justification/reason must be at least 5 characters').max(1000),
  recipientOrganization: z.string().max(200).optional(),
  certificateUrl: z.string().optional(),
});

export const updateUserAdminSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  securityPost: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
});

export const createCategorySchema = z.object({
  code: z.string().min(2).max(50).toUpperCase(),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  defaultRetentionDays: z.coerce.number().min(1).max(3650).default(90),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  defaultRetentionDays: z.coerce.number().min(1).max(3650).optional(),
  isActive: z.boolean().optional(),
});

export const createLocationSchema = z.object({
  code: z.string().min(2).max(50).toUpperCase(),
  name: z.string().min(2).max(100),
  campusZone: z.string().min(2).max(100),
  buildingName: z.string().max(100).optional(),
  hasSecurityDesk: z.boolean().default(false),
  securityContactPhone: z.string().max(20).optional(),
  isActive: z.boolean().default(true),
});

export const updateLocationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  campusZone: z.string().min(2).max(100).optional(),
  buildingName: z.string().max(100).optional(),
  hasSecurityDesk: z.boolean().optional(),
  securityContactPhone: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
});

export const auditQuerySchema = z.object({
  action: z.string().optional(),
  actorId: z.string().optional(),
  targetEntity: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type DisposalApprovalInput = z.infer<typeof disposalApprovalSchema>;
export type UpdateUserAdminInput = z.infer<typeof updateUserAdminSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export interface AuditQueryInput {
  action?: string;
  actorId?: string;
  targetEntity?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}
