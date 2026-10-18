import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypt sensitive plaintext using AES-256-GCM.
 */
export function encryptField(plaintext: string): EncryptedPayload {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'hex');

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt AES-256-GCM ciphertext with integrity verification.
 */
export function decryptField(ciphertext: string, ivHex: string, authTagHex: string): string {
  const key = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Password hashing with bcrypt (10 rounds).
 */
export async function hashPassword(plaintext: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plaintext, salt);
}

/**
 * Password comparison.
 */
export async function comparePassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Cryptographically random 6-digit numeric OTP generator.
 */
export function generateSecureOtp(digits: number = 6): string {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return crypto.randomInt(min, max + 1).toString();
}

/**
 * Salted hash for OTP storage.
 */
export async function hashOtp(otp: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otp, salt);
}

/**
 * Compare OTP with stored hash.
 */
export async function verifyOtp(providedOtp: string, hashedOtp: string): Promise<boolean> {
  return bcrypt.compare(providedOtp, hashedOtp);
}

/**
 * Sign JWT session token.
 */
export function signJwt(payload: Record<string, unknown>, expiresIn: string = env.JWT_EXPIRES_IN): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn,
    issuer: 'lpu-lost-and-found-api',
  } as jwt.SignOptions);
}

/**
 * Verify JWT session token.
 */
export function verifyJwt<T = Record<string, unknown>>(token: string): T {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: 'lpu-lost-and-found-api',
  }) as T;
}
