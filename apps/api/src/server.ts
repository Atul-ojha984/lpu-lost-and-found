import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './config/database';
import { seedDefaults } from './utils/seed-defaults';

async function bootstrap() {
  logger.info({ environment: env.NODE_ENV, port: env.PORT }, 'Initializing LPU Lost & Found API Server...');

  // Connect database with safe failure handling
  const isConnected = await connectDatabase();
  if (isConnected) {
    await seedDefaults();
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 Server listening on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`👉 Health Check: http://localhost:${env.PORT}${env.API_PREFIX}/health`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down server gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('HTTP server closed. Process terminating cleanly.');
      process.exit(0);
    });

    // Force close if graceful shutdown exceeds 10s
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled Promise Rejection detected');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught Exception detected! Terminating process');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err: err.message }, 'Bootstrap failure');
  process.exit(1);
});
