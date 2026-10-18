import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { seedDefaults } from '../../src/utils/seed-defaults';
import { signJwt, hashPassword, encryptField } from '../../src/utils/crypto';
import { UserRole, ItemType, ItemStatus, ClaimStatus } from '../../src/constants/enums';
import { Item } from '../../src/models/Item';
import { Claim } from '../../src/models/Claim';
import { VerificationChallenge } from '../../src/models/VerificationChallenge';
import { PrivateDetail } from '../../src/models/PrivateDetail';
import { User } from '../../src/models/User';
import { ItemCategory } from '../../src/models/ItemCategory';
import { Location } from '../../src/models/Location';

describe('Private Verification Challenges & Claim Adjudication API', () => {
  let studentAId: string;
  let studentBId: string;
  let officerId: string;

  let tokenStudentA: string;
  let tokenStudentB: string;
  let tokenOfficer: string;

  let testFoundItemId: string;
  let challengeId: string;
  let expiredChallengeItemId: string;
  let expiredChallengeId: string;

  beforeAll(async () => {
    await connectDatabase();
    await seedDefaults();

    // Create test users
    let studentA = await User.findOne({ email: 'claim.student.a@lpu.in' });
    if (!studentA) {
      studentA = await User.create({
        fullName: 'Claimant Student Alpha',
        email: 'claim.student.a@lpu.in',
        registrationNumber: '12107701',
        role: UserRole.STUDENT_STAFF,
        passwordHash: '$2a$10$fakedummypasswordhash001',
        isEmailVerified: true,
        isActive: true,
      });
    }

    let studentB = await User.findOne({ email: 'claim.student.b@lpu.in' });
    if (!studentB) {
      studentB = await User.create({
        fullName: 'Claimant Student Beta',
        email: 'claim.student.b@lpu.in',
        registrationNumber: '12107702',
        role: UserRole.STUDENT_STAFF,
        passwordHash: '$2a$10$fakedummypasswordhash002',
        isEmailVerified: true,
        isActive: true,
      });
    }

    let officer = await User.findOne({ email: 'claim.officer@lpu.in' });
    if (!officer) {
      officer = await User.create({
        fullName: 'Security Officer Vikram Singh',
        email: 'claim.officer@lpu.in',
        registrationNumber: 'SEC-4412',
        role: UserRole.SECURITY_PERSONNEL,
        passwordHash: '$2a$10$fakedummypasswordhash003',
        securityPost: 'Central Library Post',
        isEmailVerified: true,
        isActive: true,
      });
    }

    studentAId = studentA._id.toString();
    studentBId = studentB._id.toString();
    officerId = officer._id.toString();

    tokenStudentA = signJwt({
      userId: studentAId,
      email: studentA.email,
      role: studentA.role,
      registrationNumber: studentA.registrationNumber,
    });

    tokenStudentB = signJwt({
      userId: studentBId,
      email: studentB.email,
      role: studentB.role,
      registrationNumber: studentB.registrationNumber,
    });

    tokenOfficer = signJwt({
      userId: officerId,
      email: officer.email,
      role: officer.role,
      registrationNumber: officer.registrationNumber,
    });

    const elecCat = await ItemCategory.findOne({ code: 'ELECTRONICS' });
    const libLoc = await Location.findOne({ code: 'CENTRAL_LIBRARY' });

    let finder = await User.findOne({ email: 'finder.staff@lpu.in' });
    if (!finder) {
      finder = await User.create({
        fullName: 'Finder Staff Ramesh',
        email: 'finder.staff@lpu.in',
        registrationNumber: 'STAFF-1092',
        role: UserRole.STUDENT_STAFF,
        passwordHash: '$2a$10$fakedummypasswordhash004',
        isEmailVerified: true,
        isActive: true,
      });
    }

    // 1. Create Found Item with Private Vault & Verification Challenge
    const foundItem = await Item.create({
      referenceNumber: 'LPU-2026-F9901',
      itemType: ItemType.FOUND,
      title: 'Sony WH-1000XM4 Noise Canceling Headphones (Silver)',
      publicDescription: 'Silver over-ear wireless headphones found in library study carrel.',
      category: elecCat!._id,
      location: libLoc!._id,
      specificLocation: 'Central Library 4th Floor Carrel 8',
      eventDate: new Date('2026-10-18T14:00:00Z'),
      status: ItemStatus.IN_CUSTODY,
      reportedBy: finder._id,
      currentCustodyDesk: 'Central Library Security Desk',
      retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
    });
    testFoundItemId = foundItem._id.toString();

    // Create encrypted private detail
    const encrypted = encryptField('Serial: S01-492104-M. Inside case has miniature blue guitar keychain.');
    await PrivateDetail.create({
      item: foundItem._id,
      encryptedCiphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      fieldsSummary: ['serialNumber', 'caseKeychain'],
    });

    // Create Verification Challenge: expected answer is "guitar"
    const hashed = await hashPassword('guitar');
    const challenge = await VerificationChallenge.create({
      item: foundItem._id,
      questionText: 'What miniature keychain or charm is attached inside the headphone travel case?',
      hashedAnswer: hashed,
      hint: 'A musical instrument',
      maxAttempts: 3,
      isActive: true,
    });
    challengeId = challenge._id.toString();

    // 2. Create another item with an already-expired challenge
    const expiredItem = await Item.create({
      referenceNumber: 'LPU-2026-F9902',
      itemType: ItemType.FOUND,
      title: 'Casio Vintage Digital Watch (Gold)',
      publicDescription: 'Gold metal digital watch found in hallway.',
      category: elecCat!._id,
      location: libLoc!._id,
      specificLocation: 'Block 34 hallway',
      eventDate: new Date('2026-10-01T10:00:00Z'),
      status: ItemStatus.IN_CUSTODY,
      reportedBy: officer._id,
      retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
    });
    expiredChallengeItemId = expiredItem._id.toString();

    const expiredChallenge = await VerificationChallenge.create({
      item: expiredItem._id,
      questionText: 'What year is engraved on the back clasp?',
      hashedAnswer: await hashPassword('1998'),
      maxAttempts: 3,
      expiresAt: new Date(Date.now() - 3600 * 1000), // Expired 1 hour ago
      isActive: true,
    });
    expiredChallengeId = expiredChallenge._id.toString();
  });

  afterAll(async () => {
    await Claim.deleteMany({ item: { $in: [testFoundItemId, expiredChallengeItemId] } });
    await VerificationChallenge.deleteMany({ item: { $in: [testFoundItemId, expiredChallengeItemId] } });
    await PrivateDetail.deleteMany({ item: { $in: [testFoundItemId, expiredChallengeItemId] } });
    await Item.deleteMany({ _id: { $in: [testFoundItemId, expiredChallengeItemId] } });
    await disconnectDatabase();
  });

  // 1. Public Item Verification Challenges Endpoint (Zero Leakage)
  it('should return challenge question text and hints on GET /api/v1/items/:id/challenges without leaking hashedAnswer or expected answer', async () => {
    const res = await request(app).get(`/api/v1/items/${testFoundItemId}/challenges`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);

    const ch = res.body.data[0];
    expect(ch.id).toBe(challengeId);
    expect(ch.questionText).toContain('keychain or charm');
    expect(ch.hint).toBe('A musical instrument');
    expect(ch.maxAttempts).toBe(3);

    // CRITICAL PRIVACY LEAK PREVENTION
    expect(ch).not.toHaveProperty('hashedAnswer');
    expect(ch).not.toHaveProperty('expectedAnswer');
    expect(ch).not.toHaveProperty('answer');
  });

  // 2. Claim Submission with Correct Challenge Answer
  let claimStudentAId: string;

  it('should evaluate correct challenge answer on server and transition claim to UNDER_REVIEW', async () => {
    const res = await request(app)
      .post('/api/v1/claims')
      .set('Authorization', `Bearer ${tokenStudentA}`)
      .send({
        itemId: testFoundItemId,
        statement: 'I forgot my silver Sony XM4 headphones after working on my project in carrel 8.',
        challengeAnswers: [
          {
            challengeId,
            providedAnswer: 'guitar', // Correct answer
          },
        ],
        privateEvidenceProofUrls: ['https://example.com/receipt-xm4.jpg'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.claimStatus).toBe(ClaimStatus.UNDER_REVIEW);
    expect(res.body.data.challengeAnswers[0].isCorrect).toBe(true);

    claimStudentAId = res.body.data._id;
  });

  // 3. Competing Claim Submission with Incorrect Challenge Answer
  let claimStudentBId: string;

  it('should accept a competing claim from Student B on the same found item and mark CHALLENGE_REQUIRED on wrong answer without leaking correct answer', async () => {
    const res = await request(app)
      .post('/api/v1/claims')
      .set('Authorization', `Bearer ${tokenStudentB}`)
      .send({
        itemId: testFoundItemId,
        statement: 'These headphones are mine, I left them in carrel 8 on Sunday.',
        challengeAnswers: [
          {
            challengeId,
            providedAnswer: 'piano', // Incorrect answer!
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // Student B got the challenge wrong, so status is CHALLENGE_REQUIRED
    expect(res.body.data.claimStatus).toBe(ClaimStatus.CHALLENGE_REQUIRED);
    expect(res.body.data.challengeAnswers[0].isCorrect).toBe(false);

    // Ensure error or body does not leak the correct answer "guitar"
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('guitar');

    claimStudentBId = res.body.data._id;
  });

  // 4. Challenge Attempt Limits
  it('should enforce maximum attempt limits (3 attempts) on challenge answers', async () => {
    // Attempt 2 (wrong)
    const resAttempt2 = await request(app)
      .post(`/api/v1/claims/${claimStudentBId}/challenges/${challengeId}/answer`)
      .set('Authorization', `Bearer ${tokenStudentB}`)
      .send({ answer: 'violin' });

    expect(resAttempt2.status).toBe(200);
    expect(resAttempt2.body.data.isCorrect).toBe(false);
    expect(resAttempt2.body.data.remainingAttempts).toBe(1);

    // Attempt 3 (wrong - last allowed attempt)
    const resAttempt3 = await request(app)
      .post(`/api/v1/claims/${claimStudentBId}/challenges/${challengeId}/answer`)
      .set('Authorization', `Bearer ${tokenStudentB}`)
      .send({ answer: 'drum' });

    expect(resAttempt3.status).toBe(200);
    expect(resAttempt3.body.data.isCorrect).toBe(false);
    expect(resAttempt3.body.data.remainingAttempts).toBe(0);

    // Attempt 4 (exceeds limit -> 400 Bad Request)
    const resAttempt4 = await request(app)
      .post(`/api/v1/claims/${claimStudentBId}/challenges/${challengeId}/answer`)
      .set('Authorization', `Bearer ${tokenStudentB}`)
      .send({ answer: 'guitar' });

    expect(resAttempt4.status).toBe(400);
    expect(resAttempt4.body.success).toBe(false);
    expect(resAttempt4.body.error.message).toContain('Maximum verification attempts exceeded');
  });

  // 5. Expired Challenges Handling
  it('should reject challenge answer attempt if the challenge has expired', async () => {
    // Student A attempts to answer an expired challenge
    const resClaim = await request(app)
      .post('/api/v1/claims')
      .set('Authorization', `Bearer ${tokenStudentA}`)
      .send({
        itemId: expiredChallengeItemId,
        statement: 'I lost my gold Casio watch.',
      });

    const expiredClaimId = resClaim.body.data._id;

    const resAnswer = await request(app)
      .post(`/api/v1/claims/${expiredClaimId}/challenges/${expiredChallengeId}/answer`)
      .set('Authorization', `Bearer ${tokenStudentA}`)
      .send({ answer: '1998' });

    expect(resAnswer.status).toBe(400);
    expect(resAnswer.body.success).toBe(false);
    expect(resAnswer.body.error.message).toContain('verification challenge has expired');
  });

  // 6. Security Review: Anti-Self-Approval Guard
  it('should reject officer attempting to approve their own claim with 403 Forbidden', async () => {
    // Create an item reported by studentA (so officer is not the reporter)
    const elecCat = await ItemCategory.findOne({ code: 'ELECTRONICS' });
    const libLoc = await Location.findOne({ code: 'CENTRAL_LIBRARY' });

    const itemByStudent = await Item.create({
      referenceNumber: 'LPU-2026-F9999',
      itemType: ItemType.FOUND,
      title: 'Found Keys on Bench',
      publicDescription: 'Set of brass keys found on bench.',
      category: elecCat!._id,
      location: libLoc!._id,
      specificLocation: 'Central Library outside bench',
      eventDate: new Date('2026-10-18T10:00:00Z'),
      status: ItemStatus.IN_CUSTODY,
      reportedBy: studentAId,
      retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
    });

    // Officer files a claim on this item
    const resClaim = await request(app)
      .post('/api/v1/claims')
      .set('Authorization', `Bearer ${tokenOfficer}`)
      .send({
        itemId: itemByStudent._id.toString(),
        statement: 'Officer personal claim statement for testing.',
      });

    expect(resClaim.status).toBe(201);
    const officerClaimId = resClaim.body.data._id;

    // Officer attempts to approve their own claim -> MUST be blocked by anti-self-approval rule
    const resReview = await request(app)
      .patch(`/api/v1/claims/${officerClaimId}/review`)
      .set('Authorization', `Bearer ${tokenOfficer}`)
      .send({ action: 'APPROVE' });

    expect(resReview.status).toBe(403);
    expect(resReview.body.success).toBe(false);
    expect(resReview.body.error.message).toContain('prohibited from adjudicating or approving their own claims');

    await Claim.deleteOne({ _id: officerClaimId });
    await Item.deleteOne({ _id: itemByStudent._id });
  });

  // 7. Security Review: Approval, Handover OTP Generation, and Competing Claims Resolution
  it('should approve Student A’s claim, generate 6-digit handover OTP, set item READY_FOR_HANDOVER, and reject competing claim of Student B', async () => {
    const res = await request(app)
      .patch(`/api/v1/claims/${claimStudentAId}/review`)
      .set('Authorization', `Bearer ${tokenOfficer}`)
      .send({
        action: 'APPROVE',
        reviewNotes: 'Verified receipt matches Sony XM4 serial and challenge answer was correct.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.claimStatus).toBe(ClaimStatus.APPROVED);
    expect(res.body.data.handoverOtp).toMatch(/^\d{6}$/); // 6-digit numeric OTP

    // Verify found item transitioned to READY_FOR_HANDOVER
    const updatedItem = await Item.findById(testFoundItemId);
    expect(updatedItem?.status).toBe(ItemStatus.READY_FOR_HANDOVER);

    // Verify Student B's competing claim was automatically resolved and marked REJECTED
    const competingClaimB = await Claim.findById(claimStudentBId);
    expect(competingClaimB?.claimStatus).toBe(ClaimStatus.REJECTED);
    expect(competingClaimB?.rejectionReason).toContain('Another claimant provided verifiable ownership proof');
  });

  // 8. Private Vault Inspection (Role Restricted)
  it('should forbid student from accessing private vault (403 Forbidden)', async () => {
    const res = await request(app)
      .post(`/api/v1/items/${testFoundItemId}/private-vault/view`)
      .set('Authorization', `Bearer ${tokenStudentA}`);

    expect(res.status).toBe(403);
  });

  it('should permit authorized security officer to decrypt and view private vault for adjudication', async () => {
    const res = await request(app)
      .post(`/api/v1/items/${testFoundItemId}/private-vault/view`)
      .set('Authorization', `Bearer ${tokenOfficer}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.decryptedContent).toContain('miniature blue guitar keychain');
    expect(res.body.data.fieldsSummary).toContain('serialNumber');
  });
});
