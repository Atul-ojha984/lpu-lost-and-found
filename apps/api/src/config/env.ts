import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/lpu_lost_found'),
  MONGODB_DATABASE: z.string().default('lpu_lost_found'),
  JWT_SECRET: z.string().min(16).default('lpu_lost_found_dev_secret_key_minimum_32_characters_long!'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECRET: z.string().min(16).default('lpu_cookie_signing_dev_secret_32_chars!'),
  // 32-byte (64 hex characters) key for AES-256-GCM field encryption
  FIELD_ENCRYPTION_KEY: z.string().length(64).default(
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  ),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 mins
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RETENTION_PERIOD_DAYS: z.coerce.number().default(90),
  OTP_EXPIRY_MINUTES: z.coerce.number().default(15),
});

export type EnvConfig = z.infer<typeof envSchema>;

function parseEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.format();
    console.error('❌ Environment validation failed on startup:', JSON.stringify(errorDetails, null, 2));
    throw new Error('Environment configuration error. Please review your .env variables.');
  }
  return result.data;
}

export const env = parseEnv();
