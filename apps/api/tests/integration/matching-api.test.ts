import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { seedDefaults } from '../../src/utils/seed-defaults';
import { signJwt } from '../../src/utils/crypto';
import { UserRole, ItemType, ItemStatus } from '../../src/constants/enums';
import { Item } from '../../src/models/Item';
import { MatchSuggestion } from '../../src/models/MatchSuggestion';
import { User } from '../../src/models/User';
import { ItemCategory } from '../../src/models/ItemCategory';
import { Location } from '../../src/models/Location';

describe('Deterministic Matching API & Idempotent Refresh', () => {
  let studentAId: string;
  let studentBId: string;
  let tokenStudentA: string;
  let tokenStudentB: string;

  let lostItemId: string;
  let foundItemId: string;

  beforeAll(async () => {
    await connectDatabase();
    await seedDefaults();

    // Setup two test users
    let userA = await User.findOne({ email: 'match.student.a@lpu.in' });
    if (!userA) {
      userA = await User.create({
        fullName: 'Match Student A',
        email: 'match.student.a@lpu.in',
        registrationNumber: '12210001',
        role: UserRole.STUDENT_STAFF,
        passwordHash: '$2a$10$fakedummypasswordhashvalue001',
        isEmailVerified: true,
        isActive: true,
      });
    }

    let userB = await User.findOne({ email: 'match.student.b@lpu.in' });
    if (!userB) {
      userB = await User.create({
        fullName: 'Match Student B',
        email: 'match.student.b@lpu.in',
        registrationNumber: '12210002',
        role: UserRole.STUDENT_STAFF,
        passwordHash: '$2a$10$fakedummypasswordhashvalue002',
        isEmailVerified: true,
        isActive: true,
      });
    }

    studentAId = userA._id.toString();
    studentBId = userB._id.toString();

    tokenStudentA = signJwt({
      userId: studentAId,
      email: userA.email,
      role: userA.role,
      registrationNumber: userA.registrationNumber,
    });

    tokenStudentB = signJwt({
      userId: studentBId,
      email: userB.email,
      role: userB.role,
      registrationNumber: userB.registrationNumber,
    });

    const elecCat = await ItemCategory.findOne({ code: 'ELECTRONICS' });
    const libLoc = await Location.findOne({ code: 'CENTRAL_LIBRARY' });

    // Create Lost Item reported by Student A
    const lostItem = await Item.create({
      referenceNumber: 'LPU-2026-L8801',
      itemType: ItemType.LOST,
      title: 'Apple MacBook Pro 14 M2 (Space Grey)',
      publicDescription: 'Space grey Apple MacBook Pro laptop with magnetic MagSafe cable left in library.',
      category: elecCat!._id,
      location: libLoc!._id,
      specificLocation: 'Central Library 3rd Floor Quiet Study Table 5',
      eventDate: new Date('2026-10-18T09:00:00Z'),
      status: ItemStatus.REPORTED,
      reportedBy: userA._id,
      retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
    });
    lostItemId = lostItem._id.toString();

    // Create Found Item reported by finder
    const foundItem = await Item.create({
      referenceNumber: 'LPU-2026-F8802',
      itemType: ItemType.FOUND,
      title: 'Found Apple MacBook Laptop (Grey)',
      publicDescription: 'Grey MacBook laptop found unattended on study table 5 in library.',
      category: elecCat!._id,
      location: libLoc!._id,
      specificLocation: 'Central Library 3rd Floor Table 5',
      eventDate: new Date('2026-10-18T11:00:00Z'), // 2 hours later
      status: ItemStatus.IN_CUSTODY,
      reportedBy: userB._id,
      currentCustodyDesk: 'Central Library Security Desk',
      retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
    });
    foundItemId = foundItem._id.toString();
  });

  afterAll(async () => {
    await MatchSuggestion.deleteMany({
      $or: [{ lostItem: lostItemId }, { foundItem: foundItemId }],
    });
    await Item.deleteMany({ _id: { $in: [lostItemId, foundItemId] } });
    await disconnectDatabase();
  });

  it('should refresh match suggestions on POST /api/v1/items/:id/matches/refresh without creating duplicate pairs', async () => {
    // Run refresh first time
    const res1 = await request(app)
      .post(`/api/v1/items/${lostItemId}/matches/refresh`)
      .set('Authorization', `Bearer ${tokenStudentA}`);

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);

    const count1 = await MatchSuggestion.countDocuments({
      lostItem: lostItemId,
      foundItem: foundItemId,
    });
    expect(count1).toBe(1);

    // Run refresh second time (idempotency check)
    const res2 = await request(app)
      .post(`/api/v1/items/${lostItemId}/matches/refresh`)
      .set('Authorization', `Bearer ${tokenStudentA}`);

    expect(res2.status).toBe(200);

    const count2 = await MatchSuggestion.countDocuments({
      lostItem: lostItemId,
      foundItem: foundItemId,
    });
    // Count MUST remain 1, proving no duplicate pairs are created
    expect(count2).toBe(1);
  });

  it('should retrieve match suggestions with explainable factor breakdown on GET /api/v1/items/:id/matches', async () => {
    const res = await request(app)
      .get(`/api/v1/items/${lostItemId}/matches`)
      .set('Authorization', `Bearer ${tokenStudentA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const suggestion = res.body.data[0];
    expect(suggestion.matchScore).toBeGreaterThanOrEqual(70);
    expect(['HIGH', 'MEDIUM']).toContain(suggestion.confidence);
    expect(suggestion.explanation).toHaveProperty('categoryMatch');
    expect(suggestion.explanation).toHaveProperty('locationProximity');
    expect(suggestion.explanation).toHaveProperty('timeDelta');
    expect(suggestion.explanation).toHaveProperty('matchingTokens');
    expect(suggestion.explanation.matchingTokens).toContain('macbook');

    // CRITICAL SPEC REQUIREMENT: Suggestion must NEVER automatically establish ownership
    // Item status must not be 'HANDED_OVER'
    const currentItem = await Item.findById(lostItemId);
    expect(currentItem?.status).not.toBe(ItemStatus.HANDED_OVER);
    expect(currentItem?.status).not.toBe(ItemStatus.READY_FOR_HANDOVER);
  });

  it('should reject unauthorized viewer attempting to inspect another user’s match suggestions (403 Forbidden)', async () => {
    // Student B attempts to view Student A's lost item suggestions
    const res = await request(app)
      .get(`/api/v1/items/${lostItemId}/matches`)
      .set('Authorization', `Bearer ${tokenStudentB}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('not authorized to view match suggestions');
  });
});
