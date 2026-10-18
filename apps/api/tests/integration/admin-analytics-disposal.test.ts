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
import { DisposalRecord } from '../../src/models/DisposalRecord';
import { CustodyRecord } from '../../src/models/CustodyRecord';
import { AuditEntry } from '../../src/models/AuditEntry';
import {
  UserRole,
  ItemType,
  ItemStatus,
  ClaimStatus,
  CustodyAction,
  DisposalMethod,
  AuditAction,
} from '../../src/constants/enums';
import { signJwt } from '../../src/utils/crypto';

describe('Phase 6: Campus Administration, Analytics, Retention & Disposal', () => {
  let tokenStudent: string;
  let tokenOfficer: string;
  let tokenCampusAdmin: string;
  let tokenSystemAdmin: string;

  let studentId: string;
  let officerId: string;
  let campusAdminId: string;
  let systemAdminId: string;

  let testCategoryId: string;
  let testLocationId: string;
  let ageingItemId: string;
  let handedOverItemId: string;

  beforeAll(async () => {
    await connectDatabase();
    await seedDefaults();

    // 1. Setup Student User
    let student = await User.findOne({ email: 'phase6.student@lpu.in' });
    if (!student) {
      student = await User.create({
        fullName: 'Phase6 Student User',
        email: 'phase6.student@lpu.in',
        registrationNumber: '12109988',
        role: UserRole.STUDENT_STAFF,
        passwordHash: '$2a$10$fakedummypasswordhash001',
        isActive: true,
      });
    }
    studentId = student._id.toString();

    // 2. Setup Security Officer
    let officer = await User.findOne({ email: 'phase6.officer@lpu.in' });
    if (!officer) {
      officer = await User.create({
        fullName: 'Phase6 Security Guard',
        email: 'phase6.officer@lpu.in',
        registrationNumber: 'SEC-9922',
        role: UserRole.SECURITY_PERSONNEL,
        passwordHash: '$2a$10$fakedummypasswordhash002',
        securityPost: 'Main Gate Security Post',
        isActive: true,
      });
    }
    officerId = officer._id.toString();

    // 3. Setup Campus Admin
    let campusAdmin = await User.findOne({ email: 'phase6.campusadmin@lpu.in' });
    if (!campusAdmin) {
      campusAdmin = await User.create({
        fullName: 'Dean of Student Affairs',
        email: 'phase6.campusadmin@lpu.in',
        registrationNumber: 'ADM-1001',
        role: UserRole.CAMPUS_ADMIN,
        passwordHash: '$2a$10$fakedummypasswordhash003',
        department: 'Division of Student Welfare',
        isActive: true,
      });
    }
    campusAdminId = campusAdmin._id.toString();

    // 4. Setup System Admin
    let systemAdmin = await User.findOne({ email: 'phase6.sysadmin@lpu.in' });
    if (!systemAdmin) {
      systemAdmin = await User.create({
        fullName: 'IT Infrastructure Lead',
        email: 'phase6.sysadmin@lpu.in',
        registrationNumber: 'SYS-2001',
        role: UserRole.SYSTEM_ADMIN,
        passwordHash: '$2a$10$fakedummypasswordhash004',
        department: 'Centre for University Information Technology',
        isActive: true,
      });
    }
    systemAdminId = systemAdmin._id.toString();

    // Generate tokens
    tokenStudent = signJwt({
      userId: studentId,
      email: student.email,
      role: UserRole.STUDENT_STAFF,
      registrationNumber: student.registrationNumber,
    });
    tokenOfficer = signJwt({
      userId: officerId,
      email: officer.email,
      role: UserRole.SECURITY_PERSONNEL,
      registrationNumber: officer.registrationNumber,
    });
    tokenCampusAdmin = signJwt({
      userId: campusAdminId,
      email: campusAdmin.email,
      role: UserRole.CAMPUS_ADMIN,
      registrationNumber: campusAdmin.registrationNumber,
    });
    tokenSystemAdmin = signJwt({
      userId: systemAdminId,
      email: systemAdmin.email,
      role: UserRole.SYSTEM_ADMIN,
      registrationNumber: systemAdmin.registrationNumber,
    });

    const category = await ItemCategory.findOne();
    testCategoryId = category!._id.toString();

    const location = await Location.findOne();
    testLocationId = location!._id.toString();

    // Create a handed-over item for median time-to-return test
    const handedOverItem = await Item.create({
      referenceNumber: `LPU-P6-RET-${Date.now().toString().slice(-6)}`,
      itemType: ItemType.FOUND,
      title: 'Phase6 Returned Calculator',
      publicDescription: 'Scientific calculator found and handed back',
      category: testCategoryId,
      location: testLocationId,
      specificLocation: 'Block 34, Room 201',
      eventDate: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
      status: ItemStatus.HANDED_OVER,
      reportedBy: campusAdminId,
      currentCustodyDesk: 'Block 34 Security Desk',
      retentionExpiresAt: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000),
      isArchived: false,
    });
    handedOverItemId = handedOverItem._id.toString();

    // Create an ageing item (100 days old, past 90-day retention)
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const ageingItem = await Item.create({
      referenceNumber: `LPU-P6-AGE-${Date.now().toString().slice(-6)}`,
      itemType: ItemType.FOUND,
      title: 'Phase6 Overdue Sports Kit Bag',
      publicDescription: 'Unclaimed badminton gear in campus locker room',
      category: testCategoryId,
      location: testLocationId,
      specificLocation: 'Indoor Stadium Court 2',
      eventDate: hundredDaysAgo,
      status: ItemStatus.IN_CUSTODY,
      reportedBy: officerId,
      currentCustodyDesk: 'Indoor Stadium Security Desk',
      retentionExpiresAt: tenDaysAgo, // expired 10 days ago
      isArchived: false,
    });
    ageingItemId = ageingItem._id.toString();
  });

  describe('1. Role-Based Access Control (RBAC)', () => {
    it('should reject unauthenticated access to /admin/analytics with 401', async () => {
      const res = await request(app).get('/api/v1/admin/analytics');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject STUDENT_STAFF access to /admin/analytics with 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${tokenStudent}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject SECURITY_PERSONNEL access to /admin/analytics with 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${tokenOfficer}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should permit CAMPUS_ADMIN access to /admin/analytics with 200', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${tokenCampusAdmin}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should permit SYSTEM_ADMIN access to /admin/analytics with 200', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${tokenSystemAdmin}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('2. Live Database Metrics & Analytics Engine', () => {
    it('should compute valid totals and definitions without hardcoding', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${tokenCampusAdmin}`);

      expect(res.status).toBe(200);
      const data = res.body.data;

      // 1. Overview counts
      expect(data.overview.totalReports).toBeGreaterThanOrEqual(1);
      expect(data.overview.totalFound).toBeGreaterThanOrEqual(1);
      expect(data.overview.itemsReturned).toBeGreaterThanOrEqual(1);
      expect(typeof data.overview.returnRatePercent).toBe('number');

      // 2. Return metrics & clear documented definitions
      expect(data.returnMetrics).toBeDefined();
      expect(data.returnMetrics.returnRateDefinition).toContain('Percentage of reported found items');
      expect(data.returnMetrics.medianTimeToReturnDefinition).toContain('Median elapsed duration');
      expect(typeof data.returnMetrics.medianTimeToReturnHours).toBe('number');
      expect(typeof data.returnMetrics.medianTimeToReturnDays).toBe('number');

      // 3. Verification failure breakdown
      expect(data.verificationMetrics).toBeDefined();
      expect(data.verificationMetrics.failureDefinition).toContain('failed private ownership');
      expect(typeof data.verificationMetrics.totalVerificationFailures).toBe('number');

      // 4. Custody inventory distribution
      expect(Array.isArray(data.custodyInventory.byLocation)).toBe(true);
      if (data.custodyInventory.byLocation.length > 0) {
        expect(data.custodyInventory.byLocation[0]).toHaveProperty('desk');
        expect(data.custodyInventory.byLocation[0]).toHaveProperty('count');
      }

      // 5. Category distribution
      expect(Array.isArray(data.categoryDistribution)).toBe(true);
      expect(data.categoryDistribution.length).toBeGreaterThan(0);
      expect(data.categoryDistribution[0]).toHaveProperty('categoryName');
      expect(data.categoryDistribution[0]).toHaveProperty('percentage');

      // 6. Location and Hourly hotspots
      expect(Array.isArray(data.hotspots.locations)).toBe(true);
      expect(Array.isArray(data.hotspots.hourly)).toBe(true);
      expect(data.hotspots.hourly.length).toBe(24);

      // 7. Ageing brackets
      expect(data.ageing.statutoryRetentionPeriodDays).toBe(90);
      expect(data.ageing.brackets).toHaveProperty('over90Days');
      expect(data.ageing.brackets.over90Days).toBeGreaterThanOrEqual(1); // our 100-day-old item
    });
  });

  describe('3. Retention and Ageing Queue', () => {
    it('should retrieve items categorized by escalation state', async () => {
      const res = await request(app)
        .get('/api/v1/admin/retention/queue')
        .set('Authorization', `Bearer ${tokenCampusAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      expect(data.countsByState).toBeDefined();
      expect(data.countsByState).toHaveProperty('inRetention');
      expect(data.countsByState).toHaveProperty('noticePeriod');
      expect(data.countsByState).toHaveProperty('disposalPending');

      const foundAgeingItem = data.items.find(
        (i: { _id: string }) => i._id === ageingItemId
      );
      expect(foundAgeingItem).toBeDefined();
      expect(foundAgeingItem.daysElapsed).toBeGreaterThanOrEqual(99);
      expect(foundAgeingItem.isRetentionExpired).toBe(true);
    });

    it('should NEVER automatically dispose of an item merely because it is old', async () => {
      // Check that even though retentionExpired is true, status remains IN_CUSTODY until approved
      const item = await Item.findById(ageingItemId);
      expect(item).not.toBeNull();
      expect(item!.status).toBe(ItemStatus.IN_CUSTODY);
      expect(item!.isArchived).toBe(false);
    });
  });

  describe('4. Formal Administrative Disposal Approval', () => {
    it('should reject disposal approval from non-administrators with 403', async () => {
      const res = await request(app)
        .post('/api/v1/admin/disposal/approve')
        .set('Authorization', `Bearer ${tokenOfficer}`)
        .send({
          itemId: ageingItemId,
          method: DisposalMethod.DONATION,
          reason: 'Attempted officer unauthorized disposal',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should require valid reason and disposal method', async () => {
      const res = await request(app)
        .post('/api/v1/admin/disposal/approve')
        .set('Authorization', `Bearer ${tokenCampusAdmin}`)
        .send({
          itemId: ageingItemId,
          method: 'INVALID_METHOD',
          reason: 'tiny',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should approve item disposal, create DisposalRecord, CustodyRecord and AuditEntry', async () => {
      const res = await request(app)
        .post('/api/v1/admin/disposal/approve')
        .set('Authorization', `Bearer ${tokenCampusAdmin}`)
        .send({
          itemId: ageingItemId,
          method: DisposalMethod.DONATION,
          reason: 'Statutory 90-day retention expired without claimant. Donated to campus sports NGO.',
          recipientOrganization: 'Goonj Campus Charity Drive',
          certificateUrl: 'https://docs.lpu.in/certificates/disp-2026-004.pdf',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.item.status).toBe(ItemStatus.DISPOSED);

      // Verify DisposalRecord was created
      const disposalRecord = await DisposalRecord.findOne({ item: ageingItemId });
      expect(disposalRecord).not.toBeNull();
      expect(disposalRecord!.method).toBe(DisposalMethod.DONATION);
      expect(disposalRecord!.approvedBy.toString()).toBe(campusAdminId);
      expect(disposalRecord!.recipientOrganization).toBe('Goonj Campus Charity Drive');
      expect(disposalRecord!.certificateUrl).toBe('https://docs.lpu.in/certificates/disp-2026-004.pdf');

      // Verify append-only CustodyRecord
      const custodyRecord = await CustodyRecord.findOne({
        item: ageingItemId,
        action: CustodyAction.DISPOSED,
      });
      expect(custodyRecord).not.toBeNull();
      expect(custodyRecord!.handledBy.toString()).toBe(campusAdminId);

      // Verify AuditEntry
      const audit = await AuditEntry.findOne({
        action: AuditAction.ITEM_DISPOSE,
        targetId: ageingItemId,
      });
      expect(audit).not.toBeNull();
      expect(audit!.actorRole).toBe(UserRole.CAMPUS_ADMIN);
    });

    it('should prevent duplicate disposal of already disposed items', async () => {
      const res = await request(app)
        .post('/api/v1/admin/disposal/approve')
        .set('Authorization', `Bearer ${tokenCampusAdmin}`)
        .send({
          itemId: ageingItemId,
          method: DisposalMethod.DESTRUCTION,
          reason: 'Attempted duplicate disposal request',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('already been disposed');
    });

    it('should prevent disposal of items that were already handed over to a claimant', async () => {
      const res = await request(app)
        .post('/api/v1/admin/disposal/approve')
        .set('Authorization', `Bearer ${tokenCampusAdmin}`)
        .send({
          itemId: handedOverItemId,
          method: DisposalMethod.AUCTION,
          reason: 'Attempted disposal of handed over property',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('already handed over');
    });
  });

  describe('5. Category and Campus Location Administration', () => {
    let createdCategoryCode: string;
    let createdCategoryId: string;
    let createdLocationCode: string;
    let createdLocationId: string;

    it('should create a new item category with custom retention period', async () => {
      createdCategoryCode = `CAT_${Date.now().toString().slice(-4)}`;
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${tokenCampusAdmin}`)
        .send({
          code: createdCategoryCode,
          name: 'Perishable Lab Samples',
          description: 'Special bio samples with 7-day retention period',
          icon: 'flask',
          defaultRetentionDays: 7,
          isActive: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.defaultRetentionDays).toBe(7);
      createdCategoryId = res.body.data._id;
    });

    it('should update item category retention period and properties', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/categories/${createdCategoryId}`)
        .set('Authorization', `Bearer ${tokenCampusAdmin}`)
        .send({
          defaultRetentionDays: 14,
          name: 'Perishable Chemistry Samples',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.defaultRetentionDays).toBe(14);
      expect(res.body.data.name).toBe('Perishable Chemistry Samples');
    });

    it('should create a new campus location', async () => {
      createdLocationCode = `LOC_${Date.now().toString().slice(-4)}`;
      const res = await request(app)
        .post('/api/v1/admin/locations')
        .set('Authorization', `Bearer ${tokenCampusAdmin}`)
        .send({
          code: createdLocationCode,
          name: 'Robotics Innovation Hub',
          campusZone: 'North Academic Sector',
          buildingName: 'Innovation Block 40',
          hasSecurityDesk: true,
          securityContactPhone: '+91 1824 517888',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.hasSecurityDesk).toBe(true);
      createdLocationId = res.body.data._id;
    });

    it('should update campus location attributes', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/locations/${createdLocationId}`)
        .set('Authorization', `Bearer ${tokenCampusAdmin}`)
        .send({
          buildingName: 'Innovation Block 40, Annex B',
          hasSecurityDesk: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.buildingName).toBe('Innovation Block 40, Annex B');
    });
  });

  describe('6. Security User Assignments & Status Management', () => {
    let testGovernedUserId: string;

    beforeAll(async () => {
      const user = await User.create({
        fullName: 'Candidate Security Guard',
        email: `guard.${Date.now()}@lpu.in`,
        registrationNumber: `REG-${Date.now().toString().slice(-5)}`,
        role: UserRole.STUDENT_STAFF,
        passwordHash: '$2a$10$fakedummypasswordhash005',
        isActive: true,
      });
      testGovernedUserId = user._id.toString();
    });

    it('should list campus users with role filter', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users?role=SECURITY_PERSONNEL')
        .set('Authorization', `Bearer ${tokenCampusAdmin}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('should promote user to SECURITY_PERSONNEL and assign securityPost', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${testGovernedUserId}`)
        .set('Authorization', `Bearer ${tokenCampusAdmin}`)
        .send({
          role: UserRole.SECURITY_PERSONNEL,
          securityPost: 'Uni-Hospital Security Gate 3',
          department: 'Campus Safety & Protocol',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe(UserRole.SECURITY_PERSONNEL);
      expect(res.body.data.securityPost).toBe('Uni-Hospital Security Gate 3');

      // Verify audit trail logged ROLE_UPDATE
      const audit = await AuditEntry.findOne({
        action: AuditAction.ROLE_UPDATE,
        targetId: testGovernedUserId,
      });
      expect(audit).not.toBeNull();
      expect(audit!.metadata?.newRole).toBe(UserRole.SECURITY_PERSONNEL);
    });

    it('should prevent admin from deactivating their own active account', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${campusAdminId}`)
        .set('Authorization', `Bearer ${tokenCampusAdmin}`)
        .send({
          isActive: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('cannot deactivate their own');
    });
  });

  describe('7. Authorized Audit History Search & Privacy Guarantees', () => {
    it('should search audit logs with filters', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs?action=ITEM_DISPOSE')
        .set('Authorization', `Bearer ${tokenCampusAdmin}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].action).toBe(AuditAction.ITEM_DISPOSE);
    });

    it('should strictly redact and NEVER expose passwords, OTPs, or verification secrets', async () => {
      // Log an audit entry with sensitive mock payload to ensure redactor works
      await AuditEntry.create({
        actor: campusAdminId,
        actorRole: UserRole.CAMPUS_ADMIN,
        action: 'TEST_SENSITIVE_AUDIT',
        targetEntity: 'Item',
        targetId: ageingItemId,
        ipAddress: '127.0.0.1',
        metadata: {
          passwordHash: '$2a$10$supersecretneverleak',
          otp: '998877',
          otpSecret: 'base32secretkey',
          expectedAnswer: 'Blue leather purse',
          publicRemark: 'Demonstration log',
        },
      });

      const res = await request(app)
        .get('/api/v1/admin/audit-logs?action=TEST_SENSITIVE_AUDIT')
        .set('Authorization', `Bearer ${tokenCampusAdmin}`);

      expect(res.status).toBe(200);
      const entry = res.body.data.find(
        (e: { action: string }) => e.action === 'TEST_SENSITIVE_AUDIT'
      );
      expect(entry).toBeDefined();

      // Verify privacy guarantees: sensitive fields must be [REDACTED]
      expect(entry.metadata.passwordHash).toBe('[REDACTED]');
      expect(entry.metadata.otp).toBe('[REDACTED]');
      expect(entry.metadata.otpSecret).toBe('[REDACTED]');
      expect(entry.metadata.expectedAnswer).toBe('[REDACTED]');
      expect(entry.metadata.publicRemark).toBe('Demonstration log');
    });
  });
});
