import { describe, it, expect } from 'vitest';
import {
  encryptField,
  decryptField,
  hashPassword,
  comparePassword,
  generateSecureOtp,
  hashOtp,
  verifyOtp,
  signJwt,
  verifyJwt,
} from '../../src/utils/crypto';
import { UserRole } from '../../src/constants/enums';

describe('Cryptography Utilities', () => {
  describe('AES-256-GCM Field-Level Encryption', () => {
    it('should successfully encrypt and decrypt private identifying details', () => {
      const sensitiveIdentifier = 'Serial No: C02XG109 • iPhone IMEI: 354890123456789';
      const encrypted = encryptField(sensitiveIdentifier);

      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');
      expect(encrypted.ciphertext).not.toEqual(sensitiveIdentifier);

      const decrypted = decryptField(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
      expect(decrypted).toEqual(sensitiveIdentifier);
    });

    it('should fail decryption if the authentication tag is tampered with', () => {
      const sensitive = 'Confidential wallet cash: 3500 INR';
      const encrypted = encryptField(sensitive);

      // Tamper with auth tag
      const tamperedTag = encrypted.authTag.slice(0, -2) + '00';

      expect(() => {
        decryptField(encrypted.ciphertext, encrypted.iv, tamperedTag);
      }).toThrow();
    });
  });

  describe('Password Hashing (bcrypt)', () => {
    it('should hash password and verify correct password', async () => {
      const plaintext = 'SuperSecretLPU2026!';
      const hash = await hashPassword(plaintext);

      expect(hash).not.toEqual(plaintext);
      expect(hash.startsWith('$2')).toBe(true);

      const isValid = await comparePassword(plaintext, hash);
      expect(isValid).toBe(true);

      const isInvalid = await comparePassword('WrongPassword', hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Cryptographic OTP Handling', () => {
    it('should generate a 6-digit numeric OTP', () => {
      const otp = generateSecureOtp(6);
      expect(otp).toHaveLength(6);
      expect(/^\d{6}$/.test(otp)).toBe(true);
    });

    it('should hash and verify OTP correctly', async () => {
      const otp = '849102';
      const hash = await hashOtp(otp);

      const isValid = await verifyOtp(otp, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyOtp('000000', hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe('JWT Session Management', () => {
    it('should sign and verify JWT payload', () => {
      const payload = {
        userId: 'user-12345',
        email: 'student@lpu.in',
        role: UserRole.STUDENT_STAFF,
        registrationNumber: '12108492',
      };

      const token = signJwt(payload, '1h');
      expect(typeof token).toBe('string');

      const decoded = verifyJwt<typeof payload>(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });
  });
});
