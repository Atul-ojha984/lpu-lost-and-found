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
  try {
    mongoose.set('strictQuery', true);

    mongoose.connection.on('connected', () => {
      logger.info(
        { host: mongoose.connection.host, db: mongoose.connection.name },
        'MongoDB connection established successfully'
      );
    });

    mongoose.connection.on('error', (err) => {
      logger.error({ errorName: err.name }, 'MongoDB connection error encountered');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB connection lost/disconnected');
    });

    logger.info(
      { database: env.MONGODB_DATABASE, environment: env.NODE_ENV },
      'Connecting to MongoDB database...'
    );

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

    if (env.NODE_ENV === 'production') {
      logger.fatal(
        { errorName: error instanceof Error ? error.name : 'UnknownError' },
        'MongoDB connection is required in production; refusing to start without database access.'
      );
      throw new Error('Required MongoDB connection failed. Check Atlas network access, database credentials, and environment variables.');
    }

    logger.warn(
      { errorName: error instanceof Error ? error.name : 'UnknownError' },
      'MongoDB connection failed during startup. The API is running without database connectivity; configure MONGODB_URI before using database-backed routes.'
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
