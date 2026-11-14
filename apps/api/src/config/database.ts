import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

export interface DatabaseStatus {
  isConnected: boolean;
  readyState: number;
  host?: string;
  name?: string;
}

export function getDatabaseStatus(): DatabaseStatus {
  const readyState = mongoose.connection.readyState;
  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  return {
    isConnected: readyState === 1,
    readyState,
    host: mongoose.connection.host || undefined,
    name: mongoose.connection.name || undefined,
  };
}

export async function connectDatabase(): Promise<boolean> {
  // If in test mode and no custom URI specified, we allow running without MongoDB or using memory server
  try {
    mongoose.set('strictQuery', true);

    mongoose.connection.on('connected', () => {
      logger.info(
        { host: mongoose.connection.host, db: mongoose.connection.name },
        '✅ MongoDB connection established successfully'
      );
    });

    mongoose.connection.on('error', (err) => {
      logger.error({ err: err.message }, '⚠️ MongoDB connection error encountered');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ MongoDB connection lost/disconnected');
    });

    logger.info('Connecting to MongoDB database...');
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DATABASE,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 20,
      minPoolSize: 2,
      autoIndex: env.NODE_ENV !== 'production',
    });

    return true;
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.warn(
      { error: errMessage },
      '⚠️ MongoDB connection failed on initial bootstrap. The server will remain active for health checks and non-persisted routes. Configure MONGODB_URI in .env to connect to your MongoDB Atlas cluster.'
    );
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB connection closed gracefully');
  }
}
