import { Response } from 'express';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, errorCode: string = 'API_ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, errorCode: string = 'BAD_REQUEST', details?: unknown): ApiError {
    return new ApiError(400, message, errorCode, details);
  }

  static unauthorized(message: string = 'Authentication required', errorCode: string = 'UNAUTHORIZED'): ApiError {
    return new ApiError(401, message, errorCode);
  }

  static forbidden(message: string = 'Access denied', errorCode: string = 'FORBIDDEN'): ApiError {
    return new ApiError(403, message, errorCode);
  }

  static notFound(message: string = 'Resource not found', errorCode: string = 'NOT_FOUND'): ApiError {
    return new ApiError(404, message, errorCode);
  }

  static conflict(message: string, errorCode: string = 'CONFLICT'): ApiError {
    return new ApiError(409, message, errorCode);
  }

  static internal(message: string = 'Internal server error', errorCode: string = 'INTERNAL_ERROR'): ApiError {
    return new ApiError(500, message, errorCode);
  }
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message?: string;
  data?: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    [key: string]: unknown;
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  message?: string,
  meta?: ApiResponse['meta']
): Response {
  const body: ApiResponse<T> = {
    success: true,
    statusCode,
    message,
    data,
    meta,
  };
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  message: string,
  statusCode: number = 500,
  errorCode: string = 'INTERNAL_ERROR',
  details?: unknown
): Response {
  return res.status(statusCode).json({
    success: false,
    statusCode,
    error: {
      code: errorCode,
      message,
      details,
    },
  });
}
