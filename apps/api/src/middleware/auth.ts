import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../constants/enums';
import { verifyJwt } from '../utils/crypto';
import { ApiError } from '../utils/api-response';

export interface AuthUserPayload {
  userId: string;
  email: string;
  role: UserRole;
  registrationNumber: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

/**
 * Authentication middleware verifying HttpOnly JWT cookie or Bearer token header.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    let token: string | undefined;

    // Check signed/unsigned cookie first (preferred strategy)
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw ApiError.unauthorized('Authentication required. Missing token.');
    }

    const payload = verifyJwt<AuthUserPayload>(token);
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(ApiError.unauthorized('Invalid or expired authentication session.'));
    }
  }
}

/**
 * Role-Based Access Control (RBAC) middleware.
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication required.'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(
        ApiError.forbidden(
          `Access forbidden. Requires one of roles: [${allowedRoles.join(', ')}]. Current role: ${req.user.role}`
        )
      );
      return;
    }

    next();
  };
}

/**
 * Anti-Self-Approval guard: Prevents users from approving their own claims
 * or verifying items where they are the reporter or claimant.
 */
export function preventSelfApproval(getClaimantId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication required.'));
      return;
    }

    const claimantId = getClaimantId(req);
    if (claimantId && req.user.userId === claimantId) {
      next(
        ApiError.forbidden(
          'Security Policy Violation: Officers/Admins are prohibited from adjudicating or approving their own claims.'
        )
      );
      return;
    }

    next();
  };
}
