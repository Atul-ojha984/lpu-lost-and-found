import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { authenticate, requireRoles, preventSelfApproval } from '../../src/middleware/auth';
import { errorHandler } from '../../src/middleware/error-handler';
import { signJwt } from '../../src/utils/crypto';
import { UserRole } from '../../src/constants/enums';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser('test-cookie-secret'));

  // Protected route requiring login
  app.get('/protected', authenticate, (req, res) => {
    res.json({ success: true, user: req.user });
  });

  // Security officer only route
  app.get(
    '/security-only',
    authenticate,
    requireRoles(UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN),
    (req, res) => {
      res.json({ success: true, authorized: true });
    }
  );

  // Claim approval endpoint with anti-self-approval rule
  app.post(
    '/claims/:claimantId/approve',
    authenticate,
    requireRoles(UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN),
    preventSelfApproval((req) => String(req.params.claimantId)),
    (req, res) => {
      res.json({ success: true, approved: true });
    }
  );

  app.use(errorHandler);
  return app;
}

describe('Authentication & Authorization Middlewares', () => {
  const testApp = createTestApp();

  it('should return 401 Unauthorized when no authentication token is provided', async () => {
    const res = await request(testApp).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should allow access when a valid JWT is provided in Authorization Bearer header', async () => {
    const token = signJwt({
      userId: 'user-student-1',
      email: 'student@lpu.in',
      role: UserRole.STUDENT_STAFF,
      registrationNumber: '12108492',
    });

    const res = await request(testApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.userId).toBe('user-student-1');
  });

  it('should allow access when a valid JWT is provided in an HttpOnly cookie', async () => {
    const token = signJwt({
      userId: 'user-student-1',
      email: 'student@lpu.in',
      role: UserRole.STUDENT_STAFF,
      registrationNumber: '12108492',
    });

    const res = await request(testApp)
      .get('/protected')
      .set('Cookie', [`token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe(UserRole.STUDENT_STAFF);
  });

  it('should return 403 Forbidden if user role is not authorized', async () => {
    // Student token attempting to access security endpoint
    const studentToken = signJwt({
      userId: 'user-student-1',
      email: 'student@lpu.in',
      role: UserRole.STUDENT_STAFF,
      registrationNumber: '12108492',
    });

    const res = await request(testApp)
      .get('/security-only')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should permit access to security route if user is SECURITY_PERSONNEL', async () => {
    const securityToken = signJwt({
      userId: 'user-sec-1',
      email: 'sec@lpu.in',
      role: UserRole.SECURITY_PERSONNEL,
      registrationNumber: 'SEC-8910',
    });

    const res = await request(testApp)
      .get('/security-only')
      .set('Authorization', `Bearer ${securityToken}`);

    expect(res.status).toBe(200);
    expect(res.body.authorized).toBe(true);
  });

  it('should block self-approval when officer tries to approve their own claim', async () => {
    const officerToken = signJwt({
      userId: 'officer-99',
      email: 'officer@lpu.in',
      role: UserRole.SECURITY_PERSONNEL,
      registrationNumber: 'SEC-99',
    });

    // Officer attempting to approve claim where claimantId === 'officer-99'
    const res = await request(testApp)
      .post('/claims/officer-99/approve')
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('prohibited from adjudicating or approving their own claims');
  });

  it('should permit approval when officer is approving another student’s claim', async () => {
    const officerToken = signJwt({
      userId: 'officer-99',
      email: 'officer@lpu.in',
      role: UserRole.SECURITY_PERSONNEL,
      registrationNumber: 'SEC-99',
    });

    // Officer approving student claim where claimantId !== 'officer-99'
    const res = await request(testApp)
      .post('/claims/student-12108492/approve')
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(true);
  });
});
