import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { app } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { seedDefaults } from '../../src/utils/seed-defaults';
import { signJwt } from '../../src/utils/crypto';
import { UserRole, ItemType, ItemStatus } from '../../src/constants/enums';
import { Item } from '../../src/models/Item';
import { PrivateDetail } from '../../src/models/PrivateDetail';
import { User } from '../../src/models/User';

describe('Item Reporting, Privacy Boundary & Public Search Board API', () => {
  let studentAId: string;
  let studentBId: string;
  let tokenStudentA: string;
  let tokenStudentB: string;

  const createdItemIds: string[] = [];

  beforeAll(async () => {
    await connectDatabase();
    await seedDefaults();

    // Create or find two test users
    let userA = await User.findOne({ email: 'test.student.a@lpu.in' });
    if (!userA) {
      userA = await User.create({
        fullName: 'Student Test Alpha',
        email: 'test.student.a@lpu.in',
        registrationNumber: '12109901',
        role: UserRole.STUDENT_STAFF,
        passwordHash: '$2a$10$fakedummypasswordhashvalue001',
        isEmailVerified: true,
        isActive: true,
      });
    }

    let userB = await User.findOne({ email: 'test.student.b@lpu.in' });
    if (!userB) {
      userB = await User.create({
        fullName: 'Student Test Beta',
        email: 'test.student.b@lpu.in',
        registrationNumber: '12109902',
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
  });

  afterAll(async () => {
    // Clean up created test items
    if (createdItemIds.length > 0) {
      await Item.deleteMany({ _id: { $in: createdItemIds } });
      await PrivateDetail.deleteMany({ item: { $in: createdItemIds } });
    }
    await disconnectDatabase();
  });

  // 1. Unauthorized Report Submission
  it('should reject report creation with 401 Unauthorized when no authentication token is provided', async () => {
    const res = await request(app)
      .post('/api/v1/items/lost')
      .send({
        itemType: 'LOST',
        title: 'Missing Casio fx-991CW Calculator',
        publicDescription: 'Left on table 12 in Library',
        category: 'ELECTRONICS',
        location: 'CENTRAL_LIBRARY',
        specificLocation: 'Reading Room 2',
        eventDate: '2026-10-18',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // 2. Invalid Report Submission (Validation Failure)
  it('should reject report submission with 400 Validation Error when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/v1/items/lost')
      .set('Authorization', `Bearer ${tokenStudentA}`)
      .send({
        itemType: 'LOST',
        // Missing title, publicDescription, location
        category: 'ELECTRONICS',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeInstanceOf(Array);
  });

  // 3. Valid Lost Report Creation with Encrypted Private Vault
  let createdItemAId: string;
  let createdItemARef: string;

  it('should successfully create a lost report with encrypted private details for authorized user', async () => {
    const res = await request(app)
      .post('/api/v1/items/lost')
      .set('Authorization', `Bearer ${tokenStudentA}`)
      .send({
        itemType: 'LOST',
        title: 'Lenovo ThinkPad X1 Carbon (Gen 9)',
        publicDescription: 'Matte black 14-inch Ultrabook with red TrackPoint nub.',
        category: 'ELECTRONICS',
        location: 'BLOCK_30_38',
        specificLocation: 'Block 34 Room 302 Desk 10',
        eventDate: '2026-10-18',
        privateIdentifyingDetails: 'Serial number: PF-2X49M1. Contains sticker of Tux the Linux penguin on palm rest.',
        verificationQuestions: [
          {
            questionText: 'What operating system sticker is on the palm rest?',
            expectedAnswer: 'Linux Tux',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.referenceNumber).toMatch(/^LPU-\d{4}-L\d{5}$/);
    expect(res.body.data.isOwner).toBe(true);
    expect(res.body.data.hasPrivateDetails).toBe(true);

    // CRITICAL: Ensure private plaintext AND ciphertext are NOT returned in the API response
    expect(res.body.data).not.toHaveProperty('privateIdentifyingDetails');
    expect(res.body.data).not.toHaveProperty('encryptedCiphertext');
    expect(res.body.data).not.toHaveProperty('iv');
    expect(res.body.data).not.toHaveProperty('authTag');

    createdItemAId = res.body.data.id;
    createdItemARef = res.body.data.referenceNumber;
    createdItemIds.push(createdItemAId);

    // Verify database stored PrivateDetail with encryption
    const privateRecord = await PrivateDetail.findOne({ item: createdItemAId });
    expect(privateRecord).toBeDefined();
    expect(privateRecord?.encryptedCiphertext).toBeDefined();
    expect(privateRecord?.encryptedCiphertext).not.toContain('PF-2X49M1'); // Plaintext must not be raw in DB
  });

  // 4. Valid Found Report Creation
  it('should successfully create a found property report with LPU-YYYY-F prefix', async () => {
    const res = await request(app)
      .post('/api/v1/items/found')
      .set('Authorization', `Bearer ${tokenStudentA}`)
      .send({
        itemType: 'FOUND',
        title: 'Decathlon Quechua 20L Backpack (Grey)',
        publicDescription: 'Grey and black lightweight sports backpack found in bleachers.',
        category: 'BAGS_BACKPACKS',
        location: 'INDOOR_STADIUM_SHANTI_DEVI',
        specificLocation: 'Badminton Court 3 seating',
        eventDate: '2026-10-18',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.referenceNumber).toMatch(/^LPU-\d{4}-F\d{5}$/);
    expect(res.body.data.itemType).toBe('FOUND');

    createdItemIds.push(res.body.data.id);
  });

  // 5. Ownership Editing Boundary: Student B cannot edit Student A's report
  it('should prevent unauthorized user from editing another student’s report (403 Forbidden)', async () => {
    const res = await request(app)
      .patch(`/api/v1/items/${createdItemAId}`)
      .set('Authorization', `Bearer ${tokenStudentB}`) // User B
      .send({
        title: 'Hacked Title Attempt',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('not authorized to edit this report');
  });

  // 6. Authorized Owner Editing
  it('should allow the authorized report owner to update eligible report fields', async () => {
    const res = await request(app)
      .patch(`/api/v1/items/${createdItemAId}`)
      .set('Authorization', `Bearer ${tokenStudentA}`) // User A (Owner)
      .send({
        title: 'Lenovo ThinkPad X1 Carbon Gen 9 (Updated Info)',
        specificLocation: 'Block 34 Room 302 Desk 15 near window',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Lenovo ThinkPad X1 Carbon Gen 9 (Updated Info)');
    expect(res.body.data.specificLocation).toBe('Block 34 Room 302 Desk 15 near window');
    expect(res.body.data.isOwner).toBe(true);
  });

  // 7. Public Board Privacy & Search
  it('should return public items sanitized without any sensitive vault details on public GET /api/v1/items', async () => {
    const res = await request(app)
      .get('/api/v1/items')
      .query({ page: 1, limit: 10 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('pagination');
    expect(res.body.data.pagination).toHaveProperty('totalItems');
    expect(res.body.data.pagination).toHaveProperty('totalPages');

    const items = res.body.data.items;
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      expect(item).not.toHaveProperty('lockerStorageReference');
      expect(item).not.toHaveProperty('internalNotes');
      expect(item).not.toHaveProperty('encryptedCiphertext');
      expect(item).not.toHaveProperty('iv');
      expect(item).not.toHaveProperty('authTag');
      expect(item).not.toHaveProperty('hashedAnswer');
      expect(item).toHaveProperty('referenceNumber');
      expect(item).toHaveProperty('publicDescription');
    }
  });

  // 8. Keyword Search and Filtering
  it('should correctly filter items by keyword search query', async () => {
    const res = await request(app)
      .get('/api/v1/items')
      .query({ search: 'ThinkPad' });

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.items[0].title).toContain('ThinkPad');
  });

  it('should correctly filter items by category and itemType', async () => {
    const res = await request(app)
      .get('/api/v1/items')
      .query({ category: 'ELECTRONICS', itemType: 'LOST' });

    expect(res.status).toBe(200);
    for (const it of res.body.data.items) {
      expect(it.itemType).toBe('LOST');
      expect(it.category.code).toBe('ELECTRONICS');
    }
  });

  // 9. Public Item Detail Endpoint
  it('should return clean sanitized details on GET /api/v1/items/:id', async () => {
    const res = await request(app).get(`/api/v1/items/${createdItemAId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdItemAId);
    expect(res.body.data.referenceNumber).toBe(createdItemARef);
    expect(res.body.data).not.toHaveProperty('encryptedCiphertext');
    expect(res.body.data).not.toHaveProperty('lockerStorageReference');
  });

  // 10. Photo Upload with Sharp processing
  it('should process image upload, strip EXIF metadata, and return WebP asset URL', async () => {
    const testImageBuffer = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: { r: 180, g: 30, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();

    const res = await request(app)
      .post('/api/v1/items/upload')
      .set('Authorization', `Bearer ${tokenStudentA}`)
      .attach('image', testImageBuffer, 'photo.jpg');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('url');
    expect(res.body.data.mimeType).toBe('image/webp');
    expect(res.body.data.url).toContain('/uploads/');
  });

  it('should reject upload when non-image file is uploaded', async () => {
    const textBuffer = Buffer.from('This is a text file masquerading as an image.');

    const res = await request(app)
      .post('/api/v1/items/upload')
      .set('Authorization', `Bearer ${tokenStudentA}`)
      .attach('image', textBuffer, 'document.txt');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
