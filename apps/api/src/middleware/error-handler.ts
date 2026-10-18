import { Request, Response, NextFunction } from 'express';
import { ApiError, sendError } from '../utils/api-response';
import { logger } from '../config/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // Known ApiError instance
  if (err instanceof ApiError) {
    logger.warn(
      {
        path: req.originalUrl,
        method: req.method,
        statusCode: err.statusCode,
        errorCode: err.errorCode,
        message: err.message,
      },
      'Operational API warning handled'
    );
    sendError(res, err.message, err.statusCode, err.errorCode, err.details);
    return;
  }

  // Multer File Upload Errors
  if (err.name === 'MulterError') {
    const multerErr = err as unknown as { code: string; message: string };
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      sendError(res, 'File size limit exceeded. Maximum image size is 5MB.', 400, 'FILE_TOO_LARGE');
      return;
    }
    sendError(res, `Upload error: ${multerErr.message}`, 400, 'UPLOAD_ERROR');
    return;
  }

  // Mongoose duplicate key error (code 11000)
  if ('code' in err && (err as { code: unknown }).code === 11000) {
    const duplicateKeyErr = err as { keyValue?: Record<string, unknown> };
    const field = duplicateKeyErr.keyValue ? Object.keys(duplicateKeyErr.keyValue)[0] : 'field';
    sendError(
      res,
      `A resource with this ${field} already exists in the system.`,
      409,
      'DUPLICATE_RESOURCE'
    );
    return;
  }

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    sendError(res, err.message, 400, 'MONGOOSE_VALIDATION_ERROR');
    return;
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    sendError(res, 'Invalid authentication token signature', 401, 'INVALID_TOKEN');
    return;
  }
  if (err.name === 'TokenExpiredError') {
    sendError(res, 'Authentication token has expired', 401, 'TOKEN_EXPIRED');
    return;
  }

  // Unhandled internal server error
  logger.error(
    {
      err: err.message,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
    },
    'Unhandled server error occurred'
  );

  sendError(
    res,
    process.env.NODE_ENV === 'production' ? 'An unexpected internal error occurred.' : err.message,
    500,
    'INTERNAL_SERVER_ERROR'
  );
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND');
}
