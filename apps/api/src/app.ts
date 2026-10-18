import path from 'path';
import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { generalRateLimiter } from './middleware/rate-limiter';
import { apiRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

export function createApp(): Application {
  const app = express();

  // 1. Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // 2. CORS configuration (allowing credentials for HttpOnly cookies)
  const configuredOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: [...new Set([...configuredOrigins, 'http://localhost:3000', 'http://127.0.0.1:3000'])],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // 3. Request Parsers with Size Limits
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser(env.COOKIE_SECRET));

  // 4. Request Logging with Redaction (skip in test environment)
  if (env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignore: (req) => req.url === `${env.API_PREFIX}/health`,
        },
      })
    );
  }

  // 5. Rate Limiter
  app.use(generalRateLimiter);

  // Serve processed upload photographs statically
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

  // 6. Mount API Routes
  app.use(env.API_PREFIX, apiRoutes);

  // Root welcome check
  app.get('/', (req, res) => {
    res.json({
      service: 'LPU Lost & Found Property Recovery API',
      version: '1.0.0',
      health: `${env.API_PREFIX}/health`,
      documentation: '/docs',
    });
  });

  // 7. Error Handling & 404
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
