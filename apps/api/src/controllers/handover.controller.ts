import { Request, Response, NextFunction } from 'express';
import {
  getPendingHandovers,
  verifyAndCompleteHandover,
} from '../services/handover.service';
import { ApiError, sendSuccess } from '../utils/api-response';

/**
 * GET /api/v1/handovers/pending
 * Retrieve list of approved claims awaiting physical handover.
 */
export async function listPendingHandovers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required.');
    }

    const { search, page, limit } = req.query as { search?: string; page?: string; limit?: string };
    const result = await getPendingHandovers(req.user.role, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    sendSuccess(res, result.handovers, 200, 'Pending handovers retrieved successfully.', {
      page: result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
      totalPages: result.pagination.totalPages,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/handovers/verify-otp
 * Verify 6-digit OTP presented by claimant and complete supervised property handover.
 */
export async function executeHandover(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required.');
    }

    const {
      claimId,
      otp,
      physicalDeskLocation,
      idCardPresentedType,
      idCardNumber,
      recipientSignatureUrl,
      acknowledgementNotes,
      proofEvidenceUrl,
    } = req.body as {
      claimId: string;
      otp: string;
      physicalDeskLocation: string;
      idCardPresentedType: string;
      idCardNumber: string;
      recipientSignatureUrl?: string;
      acknowledgementNotes?: string;
      proofEvidenceUrl?: string;
    };

    if (!claimId) {
      throw ApiError.badRequest('Claim ID is required.');
    }

    const receipt = await verifyAndCompleteHandover({
      officerId: req.user.userId,
      officerRole: req.user.role,
      claimId,
      otp,
      physicalDeskLocation,
      idCardPresentedType,
      idCardNumber,
      recipientSignatureUrl,
      acknowledgementNotes,
      proofEvidenceUrl,
      reqIp: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    sendSuccess(res, receipt, 200, 'Supervised handover successfully completed and property released.');
  } catch (error) {
    next(error);
  }
}
