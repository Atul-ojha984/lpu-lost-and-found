import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { seedDefaults } from '../../src/utils/seed-defaults';
import { User } from '../../src/models/User';
import { Item } from '../../src/models/Item';
import { ItemCategory } from '../../src/models/ItemCategory';
import { Location } from '../../src/models/Location';
import { Claim } from '../../src/models/Claim';
import { VerificationChallenge } from '../../src/models/VerificationChallenge';
import { PrivateDetail } from '../../src/models/PrivateDetail';
import { UserRole, ItemType, ItemStatus, ClaimStatus } from '../../src/constants/enums';
import { signJwt, encryptField } from '../../src/utils/crypto';

describe('Production Readiness: Authentication, Authorization (IDOR) & Privacy Leak Audit', () => {
  let studentAId: string;
  let studentBId: string;
  let officerId: string;

  let tokenStudentA: string;
  let tokenStudentB: string;
  let tokenOfficer: string;

  let itemReportedByA: string;
  let itemReportedByOfficer: string;
  let claimByStudentA: string;
  let challengeId: string;

  beforeAll(async () => {
    await connectDatabase();
    await seedDefaults();

    // 1. Setup Student A
    let userA = await User.findOne({ email: 'sec.student.a@lpu.in' });
    if (!userA) {
      userA = await User.create({
        fullName: 'Security Student Alpha',
        email: 'sec.student.a@lpu.in',
        registrationNumber: `REG-${Date.now().toString().slice(-6)}-1`,
        role: UserRole.STUDENT_STAFF,
        passwordHash: '$2a$10$fakedummypasswordhash001',
        isActive: true,
      });
    }
    studentAId = userA._id.toString();

    // 2. Setup Student B
    let userB = await User.findOne({ email: 'sec.student.b@lpu.in' });
    if (!userB) {
      userB = await User.create({
        fullName: 'Security Student Beta',
        email: 'sec.student.b@lpu.in',
        registrationNumber: `REG-${Date.now().toString().slice(-6)}-2`,
        role: UserRole.STUDENT_STAFF,
        passwordHash: '$2a$10$fakedummypasswordhash002',
        isActive: true,
      });
    }
    studentBId = userB._id.toString();

    // 3. Setup Officer
    let officer = await User.findOne({ email: 'sec.officer.audit@lpu.in' });
    if (!officer) {
      officer = await User.create({
        fullName: 'Security Officer Audit',
        email: 'sec.officer.audit@lpu.in',
        registrationNumber: `SEC-${Date.now().toString().slice(-6)}-3`,
        role: UserRole.SECURITY_PERSONNEL,
        passwordHash: '$2a$10$fakedummypasswordhash003',
        securityPost: 'Uni-Mall Security Post',
        isActive: true,
      });
    }
    officerId = officer._id.toString();

    tokenStudentA = signJwt({
      userId: studentAId,
      email: userA.email,
      role: UserRole.STUDENT_STAFF,
      registrationNumber: userA.registrationNumber,
    });
    tokenStudentB = signJwt({
      userId: studentBId,
      email: userB.email,
      role: UserRole.STUDENT_STAFF,
      registrationNumber: userB.registrationNumber,
    });
    tokenOfficer = signJwt({
      userId: officerId,
      email: officer.email,
      role: UserRole.SECURITY_PERSONNEL,
      registrationNumber: officer.registrationNumber,
    });

    const category = await ItemCategory.findOne();
    const location = await Location.findOne();

    // Item reported by Student A
    const itemA = await Item.create({
      referenceNumber: `LPU-SEC-A-${Date.now().toString().slice(-5)}`,
      itemType: ItemType.LOST,
      title: 'Confidential Notebook of Student A',
      publicDescription: 'A blue spiral notebook with project plans',
      category: category!._id,
      location: location!._id,
      specificLocation: 'Central Library Floor 2',
      eventDate: new Date(),
      status: ItemStatus.REPORTED,
      reportedBy: userA._id,
      retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
    });
    itemReportedByA = itemA._id.toString();

    const encryptedVault = encryptField('Confidential serial: 99881122 and student phone: 9876543210');

    // Encrypted private vault for Item A
    await PrivateDetail.create({
      item: itemA._id,
      encryptedCiphertext: encryptedVault.ciphertext,
      iv: encryptedVault.iv,
      authTag: encryptedVault.authTag,
      fieldsSummary: ['secret serial number', 'student phone number'],
    });

    // Verification challenge for Item A
    const challenge = await VerificationChallenge.create({
      item: itemA._id,
      questionText: 'What is written on the front cover sticker?',
      hint: 'A two-digit number',
      hashedAnswer: '$2a$10$fakedummypasswordhash001',
      maxAttempts: 3,
    });
    challengeId = challenge._id.toString();

    // Claim filed by Student A
    const claimA = await Claim.create({
      item: itemA._id,
      claimant: userA._id,
      claimStatus: ClaimStatus.CHALLENGE_REQUIRED,
      statement: 'This is my notebook left on the reading desk.',
      challengeAnswers: [],
    });
    claimByStudentA = claimA._id.toString();

    // Item reported by Officer
    const itemOfficer = await Item.create({
      referenceNumber: `LPU-SEC-OFF-${Date.now().toString().slice(-5)}`,
      itemType: ItemType.FOUND,
      title: 'Found Keys by Officer',
      publicDescription: 'Bike key with red keychain',
      category: category!._id,
      location: location!._id,
      specificLocation: 'Uni-Mall Gate',
      eventDate: new Date(),
      status: ItemStatus.IN_CUSTODY,
      reportedBy: officer._id,
      retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
    });
    itemReportedByOfficer = itemOfficer._id.toString();
  });

  describe('1. IDOR & Broken Object-Level Authorization Guards', () => {
    it('should reject Student B attempt to edit Student A report (IDOR)', async () => {
      const res = await request(app)
        .patch(`/api/v1/items/${itemReportedByA}`)
        .set('Authorization', `Bearer ${tokenStudentB}`)
        .send({ title: 'Malicious title hijack by Student B' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject Student B attempt to submit answers on Student A claim (IDOR)', async () => {
      const res = await request(app)
        .post(`/api/v1/claims/${claimByStudentA}/challenges/${challengeId}/answer`)
        .set('Authorization', `Bearer ${tokenStudentB}`)
        .send({ answer: '42' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should isolate user claims on GET /claims/my-claims (no leakage of other users claims)', async () => {
      const res = await request(app)
        .get('/api/v1/claims/my-claims')
        .set('Authorization', `Bearer ${tokenStudentB}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Student B must not see Student A's claim
      const hasStudentAClaim = res.body.data.some(
        (c: { id: string }) => c.id === claimByStudentA
      );
      expect(hasStudentAClaim).toBe(false);
    });
  });

  describe('2. Role-Based Privilege & Direct API Tampering Protection', () => {
    it('should prevent student from accessing pending claims queue via direct API call', async () => {
      const res = await request(app)
        .get('/api/v1/claims/pending')
        .set('Authorization', `Bearer ${tokenStudentA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should prevent student from approving claims via direct API call', async () => {
      const res = await request(app)
        .patch(`/api/v1/claims/${claimByStudentA}/review`)
        .set('Authorization', `Bearer ${tokenStudentA}`)
        .send({ action: 'APPROVE', reviewNotes: 'Self approval attempt' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should prevent student from viewing decrypted private vault via direct API call', async () => {
      const res = await request(app)
        .post(`/api/v1/items/${itemReportedByA}/private-vault/view`)
        .set('Authorization', `Bearer ${tokenStudentA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should prevent student from executing handover verification via direct API call', async () => {
      const res = await request(app)
        .post('/api/v1/handovers/verify-otp')
        .set('Authorization', `Bearer ${tokenStudentA}`)
        .send({
          claimId: claimByStudentA,
          otp: '123456',
          physicalDeskLocation: 'Uni-Mall Post',
          idCardPresentedType: 'STUDENT_ID',
          idCardNumber: '12107701',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should prevent student from transferring custody desk via direct API call', async () => {
      const res = await request(app)
        .post('/api/v1/custody/transfer')
        .set('Authorization', `Bearer ${tokenStudentA}`)
        .send({
          itemId: itemReportedByA,
          toLocation: 'Stolen Location',
          action: 'TRANSFERRED_DESK',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should prevent security officer from approving claims on items they reported (Anti-Self-Approval)', async () => {
      // Create a claim by Student B on the officer's reported item
      const claimOnOfficerItem = await Claim.create({
        item: itemReportedByOfficer,
        claimant: studentBId,
        claimStatus: ClaimStatus.UNDER_REVIEW,
        statement: 'Claiming keys reported by officer',
      });

      const res = await request(app)
        .patch(`/api/v1/claims/${claimOnOfficerItem._id}/review`)
        .set('Authorization', `Bearer ${tokenOfficer}`) // Officer who reported the item!
        .send({ action: 'APPROVE', reviewNotes: 'Unauthorized approval of own find' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('prohibited from adjudicating claims on items they originally reported');
    });
  });

  describe('3. Public Response Allow-List & Privacy Leak Audit', () => {
    it('should ensure public GET /api/v1/items never leaks passwords, vault cipher, or expected challenge answers', async () => {
      const res = await request(app).get('/api/v1/items');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const itemsList = res.body.data.items || res.body.data;
      expect(Array.isArray(itemsList)).toBe(true);

      itemsList.forEach((item: Record<string, unknown>) => {
        // Assert absence of private/sensitive properties
        expect(item.passwordHash).toBeUndefined();
        expect(item.privateVault).toBeUndefined();
        expect(item.encryptedDetails).toBeUndefined();
        expect(item.encryptionIv).toBeUndefined();
        expect(item.encryptionTag).toBeUndefined();
        expect(item.keyDerivationSalt).toBeUndefined();
        expect(item.handoverOtp).toBeUndefined();
        expect(item.handoverOtpHash).toBeUndefined();
        expect(item.handoverOtpCipher).toBeUndefined();
        expect(item.expectedAnswer).toBeUndefined();
        expect(item.hashedAnswer).toBeUndefined();
      });
    });

    it('should ensure public item detail GET /api/v1/items/:id never leaks private vault or answers', async () => {
      const res = await request(app).get(`/api/v1/items/${itemReportedByA}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const item = res.body.data;
      expect(item.passwordHash).toBeUndefined();
      expect(item.encryptedDetails).toBeUndefined();
      expect(item.encryptionTag).toBeUndefined();
      expect(item.hashedAnswer).toBeUndefined();
      expect(item.expectedAnswer).toBeUndefined();
      expect(item.handoverOtp).toBeUndefined();
      expect(item.handoverOtpHash).toBeUndefined();
    });

    it('should ensure challenge questions endpoint GET /api/v1/items/:id/challenges only exposes question text and hints', async () => {
      const res = await request(app).get(`/api/v1/items/${itemReportedByA}/challenges`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      res.body.data.forEach((ch: Record<string, unknown>) => {
        expect(ch.questionText).toBeDefined();
        // Sensitive answer fields MUST be completely absent
        expect(ch.hashedAnswer).toBeUndefined();
        expect(ch.expectedAnswer).toBeUndefined();
        expect(ch.answer).toBeUndefined();
      });
    });

    it('should reject new claims on items in HANDED_OVER status (Workflow Integrity)', async () => {
      // Set Item A to HANDED_OVER
      await Item.findByIdAndUpdate(itemReportedByA, { status: ItemStatus.HANDED_OVER });

      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${tokenStudentB}`)
        .send({
          itemId: itemReportedByA,
          statement: 'Attempting to claim already handed-over item',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not eligible for new claims');
    });

    it('should reject new claims on items in DISPOSED status (Workflow Integrity)', async () => {
      // Set Item A to DISPOSED
      await Item.findByIdAndUpdate(itemReportedByA, { status: ItemStatus.DISPOSED });

      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${tokenStudentB}`)
        .send({
          itemId: itemReportedByA,
          statement: 'Attempting to claim already disposed item',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not eligible for new claims');
    });
  });
});
