import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { hashPassword, comparePassword, signJwt } from '../utils/crypto';
import { sendSuccess, sendError, ApiError } from '../utils/api-response';
import { env } from '../config/env';
import { RegisterInput, LoginInput } from '../schemas/auth.schema';
import { AuditEntry } from '../models/AuditEntry';
import { AuditAction, UserRole } from '../constants/enums';

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as RegisterInput;

    // Check existing email
    const existingEmail = await User.findOne({ email: input.email.toLowerCase() });
    if (existingEmail) {
      throw ApiError.conflict('An account with this email address already exists.');
    }

    // Check existing registration number
    const existingReg = await User.findOne({ registrationNumber: input.registrationNumber.toUpperCase() });
    if (existingReg) {
      throw ApiError.conflict('An account with this registration number already exists.');
    }

    // Hash password securely
    const passwordHash = await hashPassword(input.password);

    // Create user
    const newUser = await User.create({
      fullName: input.fullName,
      registrationNumber: input.registrationNumber.toUpperCase(),
      email: input.email.toLowerCase(),
      passwordHash,
      department: input.department,
      role: input.role || UserRole.STUDENT_STAFF,
      securityPost: input.securityPost,
      phone: input.phone,
    });

    // Generate JWT token
    const token = signJwt({
      userId: newUser._id.toString(),
      email: newUser.email,
      role: newUser.role,
      registrationNumber: newUser.registrationNumber,
    });

    // Set secure HttpOnly cookie
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: COOKIE_MAX_AGE,
    });

    // Log audit entry asynchronously
    AuditEntry.create({
      actor: newUser._id,
      actorRole: newUser.role,
      action: AuditAction.USER_REGISTER,
      targetEntity: 'USER',
      targetId: newUser._id.toString(),
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'],
      metadata: { email: newUser.email, regNo: newUser.registrationNumber },
    }).catch(() => {
      // Non-blocking audit failure
    });

    sendSuccess(
      res,
      {
        user: newUser.toJSON(),
        token, // Also provided in payload for clients preferring Bearer auth
      },
      201,
      'Account successfully registered.'
    );
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { emailOrRegNo, password } = req.body as LoginInput;

    const query = emailOrRegNo.includes('@')
      ? { email: emailOrRegNo.toLowerCase() }
      : { registrationNumber: emailOrRegNo.toUpperCase() };

    const user = await User.findOne(query).select('+passwordHash');
    if (!user) {
      throw ApiError.unauthorized('Invalid login credentials provided.');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('This campus account is currently suspended. Contact security administration.');
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      throw ApiError.unauthorized('Invalid login credentials provided.');
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Generate JWT token
    const token = signJwt({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      registrationNumber: user.registrationNumber,
    });

    // Set secure cookie
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: COOKIE_MAX_AGE,
    });

    // Log audit entry asynchronously
    AuditEntry.create({
      actor: user._id,
      actorRole: user.role,
      action: AuditAction.USER_LOGIN,
      targetEntity: 'USER',
      targetId: user._id.toString(),
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'],
    }).catch(() => {});

    sendSuccess(
      res,
      {
        user: user.toJSON(),
        token,
      },
      200,
      'Login successful.'
    );
  } catch (error) {
    next(error);
  }
}

export function logout(req: Request, res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
  });

  if (req.user) {
    AuditEntry.create({
      actor: req.user.userId,
      actorRole: req.user.role,
      action: AuditAction.USER_LOGOUT,
      targetEntity: 'USER',
      targetId: req.user.userId,
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'],
    }).catch(() => {});
  }

  sendSuccess(res, null, 200, 'Successfully logged out.');
}

export async function getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized();
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      throw ApiError.notFound('User profile not found.');
    }

    sendSuccess(res, user.toJSON(), 200);
  } catch (error) {
    next(error);
  }
}
