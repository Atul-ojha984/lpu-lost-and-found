import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { connectDatabase } from '../../src/config/database';
import { seedDefaults } from '../../src/utils/seed-defaults';
import { User } from '../../src/models/User';
import { Item } from '../../src/models/Item';
import { ItemCategory } from '../../src/models/ItemCategory';
import { Location } from '../../src/models/Location';
import { Claim } from '../../src/models/Claim';
import { Handover } from '../../src/models/Handover';
import { CustodyRecord } from '../../src/models/CustodyRecord';
import { AuditEntry } from '../../src/models/AuditEntry';
import { UserRole, ItemType, ItemStatus, ClaimStatus, CustodyAction, AuditAction } from '../../src/constants/enums';
import { signJwt, generateSecureOtp, hashOtp, encryptField } from '../../src/utils/crypto';

describe('Phase 5: Security Personnel Workflows, Custody Tracking & Handover', () => {
  let tokenStudent: string;
  let tokenOfficer: string;
  let tokenAdmin: string;

  let studentId: string;
  let officerId: string;
  let adminId: string;

  let testItemId: string;
  let testClaimId: string;
  let correctRawOtp: string;

  beforeAll(async () => {
    await connectDatabase();
    await seedDefaults();

    // 1. Setup Student User
    let student = await User.findOne({ email: 'phase5.student@lpu.in' });
    if (!student) {
      student = await User.create({
        fullName: 'Phase5 Student Claimant',
        email: 'phase5.student@lpu.in',
        registrationNumber: '12108899',
        role: UserRole.STUDENT_STAFF,
        passwordHash: '$2a$10$fakedummypasswordhash001',
        isEmailVerified: true,
        isActive: true,
      });
    }
    studentId = student._id.toString();

    // 2. Setup Security Officer User
    let officer = await User.findOne({ email: 'phase5.officer@lpu.in' });
    if (!officer) {
      officer = await User.create({
        fullName: 'Security Officer Harpreet Kaur',
        email: 'phase5.officer@lpu.in',
        registrationNumber: 'SEC-8812',
        role: UserRole.SECURITY_PERSONNEL,
        passwordHash: '$2a$10$fakedummypasswordhash002',
        securityPost: 'Uni-Mall Security Post',
        isEmailVerified: true,
        isActive: true,
      });
    }
    officerId = officer._id.toString();

    // 3. Setup Campus Admin User
    let admin = await User.findOne({ email: 'phase5.admin@lpu.in' });
    if (!admin) {
      admin = await User.create({
        fullName: 'Admin Rajiv Sharma',
        email: 'phase5.admin@lpu.in',
        registrationNumber: 'ADM-9001',
        role: UserRole.CAMPUS_ADMIN,
        passwordHash: '$2a$10$fakedummypasswordhash003',
        isEmailVerified: true,
        isActive: true,
      });
    }
    adminId = admin._id.toString();

    tokenStudent = signJwt({
      userId: studentId,
      email: student.email,
      role: student.role,
      registrationNumber: student.registrationNumber,
    });

    tokenOfficer = signJwt({
      userId: officerId,
      email: officer.email,
      role: officer.role,
      registrationNumber: officer.registrationNumber,
    });

    tokenAdmin = signJwt({
      userId: adminId,
      email: admin.email,
      role: admin.role,
      registrationNumber: admin.registrationNumber,
    });

    // 4. Setup Seed Category and Location
    const category = await ItemCategory.findOne({ code: 'ELECTRONICS' });
    const location = await Location.findOne({ code: 'UNI_MALL' });

    // 5. Setup Found Item in Custody
    const item = await Item.create({
      referenceNumber: 'LPU-2026-F5001',
      itemType: ItemType.FOUND,
      title: 'Apple iPad Air (Blue) with Magnetic Keyboard',
      publicDescription: 'Blue iPad Air found in Uni-Mall Food Court seating area.',
      category: category!._id,
      location: location!._id,
      specificLocation: 'Uni-Mall 3rd Floor Food Court Table 14',
      eventDate: new Date('2026-10-18T12:00:00Z'),
      status: ItemStatus.READY_FOR_HANDOVER,
      reportedBy: admin._id, // reported by admin, so officer can adjudicate without self-approval conflict
      currentCustodyDesk: 'Uni-Mall Security Post - Ground Floor',
      lockerStorageReference: 'LOCKER-U34',
      retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
    });
    testItemId = item._id.toString();

    // 6. Generate 6-digit OTP and setup Approved Claim with Handover
    correctRawOtp = generateSecureOtp(6);
    const hashedOtp = await hashOtp(correctRawOtp);
    const encOtp = encryptField(correctRawOtp);

    const claim = await Claim.create({
      item: item._id,
      claimant: student._id,
      claimStatus: ClaimStatus.APPROVED,
      statement: 'I mislaid my blue iPad with the keyboard case while having lunch at the food court.',
      reviewedBy: officer._id,
      reviewedAt: new Date(),
      reviewNotes: 'Verified matching purchase invoice with Apple Store serial number.',
      handoverOtpCipher: encOtp.ciphertext,
      handoverOtpIv: encOtp.iv,
      handoverOtpTag: encOtp.authTag,
      handoverOtpExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h TTL
    });
    testClaimId = claim._id.toString();

    const handover = await Handover.create({
      item: item._id,
      claim: claim._id,
      recipient: student._id,
      supervisingOfficer: officer._id,
      otpHash: hashedOtp,
      otpExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      otpAttemptsCount: 0,
      physicalDeskLocation: 'Uni-Mall Security Post - Ground Floor',
      idCardPresentedType: 'PENDING_VERIFICATION',
      idCardNumberMasked: 'PENDING',
      isCompleted: false,
    });

    claim.handoverRecord = handover._id;
    await claim.save();
  });

  afterAll(async () => {
    await CustodyRecord.deleteMany({ item: testItemId });
    await Handover.deleteMany({ item: testItemId });
    await Claim.deleteMany({ item: testItemId });
    await Item.deleteOne({ _id: testItemId });
  });

  // 1. Role Restrictions Guard
  describe('RBAC & Role Security Restrictions', () => {
    it('should forbid regular student from accessing custody inventory (403)', async () => {
      const res = await request(app)
        .get('/api/v1/custody/inventory')
        .set('Authorization', `Bearer ${tokenStudent}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should forbid regular student from executing custody transfer (403)', async () => {
      const res = await request(app)
        .post('/api/v1/custody/transfer')
        .set('Authorization', `Bearer ${tokenStudent}`)
        .send({
          itemId: testItemId,
          toLocation: 'Security Central Post',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should forbid regular student from viewing pending handovers queue (403)', async () => {
      const res = await request(app)
        .get('/api/v1/handovers/pending')
        .set('Authorization', `Bearer ${tokenStudent}`);

      expect(res.status).toBe(403);
    });

    it('should forbid regular student from executing handover (403)', async () => {
      const res = await request(app)
        .post('/api/v1/handovers/verify-otp')
        .set('Authorization', `Bearer ${tokenStudent}`)
        .send({
          claimId: testClaimId,
          otp: correctRawOtp,
          physicalDeskLocation: 'Main Desk',
          idCardPresentedType: 'STUDENT_ID',
          idCardNumber: '12108899',
        });

      expect(res.status).toBe(403);
    });

    it('should forbid regular student from viewing security dashboard stats (403)', async () => {
      const res = await request(app)
        .get('/api/v1/security/dashboard-stats')
        .set('Authorization', `Bearer ${tokenStudent}`);

      expect(res.status).toBe(403);
    });
  });

  // 2. Custody Inventory & Movement Tracking
  describe('Custody Management & Append-Only History', () => {
    it('should allow security officer to retrieve custody inventory', async () => {
      const res = await request(app)
        .get('/api/v1/custody/inventory')
        .set('Authorization', `Bearer ${tokenOfficer}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const foundItem = res.body.data.find((i: { _id: string }) => i._id === testItemId);
      expect(foundItem).toBeDefined();
      expect(foundItem.currentCustodyDesk).toBe('Uni-Mall Security Post - Ground Floor');
    });

    it('should log physical custody transfer and append an immutable CustodyRecord', async () => {
      const res = await request(app)
        .post('/api/v1/custody/transfer')
        .set('Authorization', `Bearer ${tokenOfficer}`)
        .send({
          itemId: testItemId,
          toLocation: 'Main Security Vault - Block 30',
          lockerReference: 'SAFE-VAULT-4B',
          action: CustodyAction.STORED_IN_LOCKER,
          remarks: 'Moved high-value Apple tablet to high-security reinforced locker safe.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.item.currentCustodyDesk).toBe('Main Security Vault - Block 30');
      expect(res.body.data.item.lockerStorageReference).toBe('SAFE-VAULT-4B');
      expect(res.body.data.custodyRecord.action).toBe(CustodyAction.STORED_IN_LOCKER);
      expect(res.body.data.custodyRecord.fromLocation).toBe('Uni-Mall Security Post - Ground Floor');
      expect(res.body.data.custodyRecord.toLocation).toBe('Main Security Vault - Block 30');
    });

    it('should retrieve chronological custody movement history for the item', async () => {
      const res = await request(app)
        .get(`/api/v1/custody/items/${testItemId}/history`)
        .set('Authorization', `Bearer ${tokenOfficer}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const record = res.body.data[res.body.data.length - 1];
      expect(record.toLocation).toBe('Main Security Vault - Block 30');
      expect(record.handledBy.fullName).toContain('Harpreet Kaur');
    });
  });

  // 3. Pending Handover Queue & OTP Verification Guardrails
  describe('Supervised Handover Verification & Guardrails', () => {
    it('should list approved claim in pending handovers queue', async () => {
      const res = await request(app)
        .get('/api/v1/handovers/pending')
        .set('Authorization', `Bearer ${tokenOfficer}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const pending = res.body.data.find(
        (h: { claim: { _id: string } }) => h.claim._id === testClaimId
      );
      expect(pending).toBeDefined();
      expect(pending.item.title).toContain('iPad');
    });

    it('should reject handover attempt with invalid OTP and decrement remaining attempts', async () => {
      const res = await request(app)
        .post('/api/v1/handovers/verify-otp')
        .set('Authorization', `Bearer ${tokenOfficer}`)
        .send({
          claimId: testClaimId,
          otp: '000000', // Incorrect OTP
          physicalDeskLocation: 'Main Security Vault - Block 30',
          idCardPresentedType: 'LPU_STUDENT_ID',
          idCardNumber: '12108899',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid Handover OTP');
      expect(res.body.error.message).toContain('attempt(s) remaining');

      // Verify attempts counter incremented in DB
      const handover = await Handover.findOne({ claim: testClaimId });
      expect(handover?.otpAttemptsCount).toBe(1);
    });

    it('should reject handover when OTP has expired', async () => {
      // Temporarily set handover OTP expiration in the past
      await Handover.updateOne({ claim: testClaimId }, { otpExpiresAt: new Date(Date.now() - 3600000) });

      const res = await request(app)
        .post('/api/v1/handovers/verify-otp')
        .set('Authorization', `Bearer ${tokenOfficer}`)
        .send({
          claimId: testClaimId,
          otp: correctRawOtp,
          physicalDeskLocation: 'Main Security Vault - Block 30',
          idCardPresentedType: 'LPU_STUDENT_ID',
          idCardNumber: '12108899',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Handover OTP has expired');

      // Restore valid expiration
      await Handover.updateOne(
        { claim: testClaimId },
        { otpExpiresAt: new Date(Date.now() + 48 * 3600000) }
      );
    });

    it('should reject handover if claim is not in APPROVED state', async () => {
      // Create temporary rejected claim
      const unapprovedClaim = await Claim.create({
        item: testItemId,
        claimant: studentId,
        claimStatus: ClaimStatus.UNDER_REVIEW,
        statement: 'Under review claim test',
      });

      const res = await request(app)
        .post('/api/v1/handovers/verify-otp')
        .set('Authorization', `Bearer ${tokenOfficer}`)
        .send({
          claimId: unapprovedClaim._id.toString(),
          otp: correctRawOtp,
          physicalDeskLocation: 'Main Desk',
          idCardPresentedType: 'LPU_STUDENT_ID',
          idCardNumber: '12108899',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("Only APPROVED claims can be handed over");

      await Claim.deleteOne({ _id: unapprovedClaim._id });
    });

    it('should successfully complete handover with correct OTP, mask ID, update records, and generate audit trail', async () => {
      const res = await request(app)
        .post('/api/v1/handovers/verify-otp')
        .set('Authorization', `Bearer ${tokenOfficer}`)
        .send({
          claimId: testClaimId,
          otp: correctRawOtp,
          physicalDeskLocation: 'Main Security Vault - Block 30',
          idCardPresentedType: 'LPU_STUDENT_ID_CARD',
          idCardNumber: '12108899',
          recipientSignatureUrl: 'https://storage.lpu-recovery.in/signatures/claim-8899.png',
          acknowledgementNotes: 'Student verified serial number matches and tested device power before signoff.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.referenceNumber).toBe('LPU-2026-F5001');
      expect(res.body.data.recipientName).toContain('Student Claimant');
      expect(res.body.data.idCardNumberMasked).toContain('****8899');
      expect(res.body.data.completedAt).toBeDefined();

      // Verify Item updated to HANDED_OVER
      const updatedItem = await Item.findById(testItemId);
      expect(updatedItem?.status).toBe(ItemStatus.HANDED_OVER);

      // Verify Claim updated to COMPLETED
      const updatedClaim = await Claim.findById(testClaimId);
      expect(updatedClaim?.claimStatus).toBe(ClaimStatus.COMPLETED);

      // Verify Handover record marked completed
      const updatedHandover = await Handover.findOne({ claim: testClaimId });
      expect(updatedHandover?.isCompleted).toBe(true);
      expect(updatedHandover?.idCardNumberMasked).toBe('12****8899');

      // Verify Custody append-only record created for handover
      const custodyRecord = await CustodyRecord.findOne({
        item: testItemId,
        action: CustodyAction.HANDED_OVER,
      });
      expect(custodyRecord).toBeDefined();
      expect(custodyRecord?.toLocation).toBe('CLAIMANT_HANDOVER_COMPLETE');

      // Verify AuditEntry created
      const auditLog = await AuditEntry.findOne({
        targetEntity: 'Handover',
        action: AuditAction.HANDOVER_EXECUTE,
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.actor?.toString()).toBe(officerId);
    });

    it('should block duplicate handover attempts on already completed claim/item (Duplicate Handover Guard)', async () => {
      const resDuplicate = await request(app)
        .post('/api/v1/handovers/verify-otp')
        .set('Authorization', `Bearer ${tokenOfficer}`)
        .send({
          claimId: testClaimId,
          otp: correctRawOtp,
          physicalDeskLocation: 'Main Security Vault - Block 30',
          idCardPresentedType: 'LPU_STUDENT_ID_CARD',
          idCardNumber: '12108899',
        });

      // Must be rejected with 400 Bad Request
      expect(resDuplicate.status).toBe(400);
      expect(resDuplicate.body.success).toBe(false);
      expect(resDuplicate.body.error.message).toContain('Duplicate Handover Guard');
    });
  });

  // 4. Security Operations Dashboard & Audit Trail
  describe('Security Operations Dashboard & Audit Trail Endpoints', () => {
    it('should retrieve security operations dashboard metrics', async () => {
      const res = await request(app)
        .get('/api/v1/security/dashboard-stats')
        .set('Authorization', `Bearer ${tokenOfficer}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.custodyInventoryCount).toBeGreaterThanOrEqual(0);
      expect(res.body.data.completedHandoversCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.data.recentAuditEvents)).toBe(true);
      expect(res.body.data.recentAuditEvents.length).toBeGreaterThan(0);
    });

    it('should retrieve compliance audit trail with action filtering', async () => {
      const res = await request(app)
        .get('/api/v1/security/audit-trail?action=HANDOVER_EXECUTE')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].action).toBe(AuditAction.HANDOVER_EXECUTE);
    });
  });
});
