import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const generalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: {
    success: false,
    statusCode: 429,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded. Please retry after 15 minutes.',
    },
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'development' ? 100 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: {
    success: false,
    statusCode: 429,
    error: {
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
      message: 'Too many authentication attempts. Your IP has been temporarily rate-limited for 15 minutes.',
    },
  },
});
