import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from '../../src/schemas/auth.schema';
import { UserRole } from '../../src/constants/enums';

describe('Validation Schemas', () => {
  describe('Registration Schema', () => {
    it('should pass with valid LPU student registration data', () => {
      const validPayload = {
        fullName: 'Aarav Sharma',
        registrationNumber: '12108492',
        email: 'aarav.sharma.12108@lpu.in',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
        department: 'School of Computer Science & Engineering',
        role: UserRole.STUDENT_STAFF,
      };

      const result = registerSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should reject email if not an official LPU domain', () => {
      const invalidEmailPayload = {
        fullName: 'Aarav Sharma',
        registrationNumber: '12108492',
        email: 'aarav@gmail.com', // disallowed domain
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      };

      const result = registerSchema.safeParse(invalidEmailPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Lovely Professional University domain');
      }
    });

    it('should reject when password and confirmPassword do not match', () => {
      const mismatchPayload = {
        fullName: 'Aarav Sharma',
        registrationNumber: '12108492',
        email: 'aarav.12108@lpu.in',
        password: 'Password123!',
        confirmPassword: 'DifferentPassword456!',
      };

      const result = registerSchema.safeParse(mismatchPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toEqual('Passwords do not match');
      }
    });
  });

  describe('Login Schema', () => {
    it('should accept valid email login query', () => {
      const result = loginSchema.safeParse({
        emailOrRegNo: 'student@lpu.in',
        password: 'Password123!',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid registration number login query', () => {
      const result = loginSchema.safeParse({
        emailOrRegNo: '12108492',
        password: 'Password123!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty fields', () => {
      const result = loginSchema.safeParse({
        emailOrRegNo: '',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });
});
