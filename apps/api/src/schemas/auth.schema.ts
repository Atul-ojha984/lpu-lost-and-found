import { z } from 'zod';
import { UserRole } from '../constants/enums';

export const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
    registrationNumber: z.string().min(4, 'Registration number is required').max(30),
    email: z
      .string()
      .email('Valid email is required')
      .refine(
        (val) => val.endsWith('@lpu.in') || val.endsWith('@lpu.co.in') || val.endsWith('@example.com'),
        'Email must belong to Lovely Professional University domain (@lpu.in)'
      ),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    confirmPassword: z.string(),
    department: z.string().optional(),
    role: z.nativeEnum(UserRole).default(UserRole.STUDENT_STAFF),
    securityPost: z.string().optional(),
    phone: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  emailOrRegNo: z.string().min(1, 'Email or registration number is required'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
