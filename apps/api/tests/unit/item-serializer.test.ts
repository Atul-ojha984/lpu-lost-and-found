import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { toPublicItemDTO, toOwnerItemDTO } from '../../src/dtos/item.dto';
import { ItemType, ItemStatus } from '../../src/constants/enums';

describe('Public Item Serializer Privacy Boundary', () => {
  const reporterUserId = new Types.ObjectId().toString();
  const strangerUserId = new Types.ObjectId().toString();

  const mockItemRaw = {
    _id: new Types.ObjectId(),
    referenceNumber: 'LPU-2026-F54109',
    itemType: ItemType.FOUND,
    title: 'Titan Fastrack Smartwatch (Black)',
    publicDescription: 'Found near central library 2nd floor staircase. Black rubber strap.',
    category: {
      _id: new Types.ObjectId(),
      code: 'ELECTRONICS',
      name: 'Electronics & Gadgets',
      icon: 'Laptop',
    },
    location: {
      _id: new Types.ObjectId(),
      code: 'CENTRAL_LIBRARY',
      name: 'Central Library',
      campusZone: 'Reading Halls & Reference Wing',
      hasSecurityDesk: true,
    },
    specificLocation: '2nd Floor Staircase Landings',
    eventDate: new Date('2026-10-18T10:00:00Z'),
    primaryImageUrl: '/uploads/sample.webp',
    additionalImages: ['/uploads/sample2.webp'],
    status: ItemStatus.IN_CUSTODY,
    reportedBy: new Types.ObjectId(reporterUserId),
    currentCustodyDesk: 'Central Library Security Desk',
    // SENSITIVE FIELDS THAT MUST NEVER LEAK:
    lockerStorageReference: 'LOCKER-B3-ROW4-SLOT12',
    internalNotes: 'Claimant attempted false claim earlier. Suspicious.',
    privateVaultCiphertext: '4a6b8c...encrypted...',
    iv: '1234567890abcdef12345678',
    authTag: 'abcdef0123456789abcdef0123456789',
    challengeAnswerHash: '$2a$10$encryptedHashValueHere',
    createdAt: new Date('2026-10-18T10:30:00Z'),
    updatedAt: new Date('2026-10-18T10:30:00Z'),
    retentionExpiresAt: new Date('2027-01-18T10:30:00Z'),
  };

  it('should include strictly allow-listed public fields in public DTO', () => {
    const publicDTO = toPublicItemDTO(mockItemRaw);

    expect(publicDTO).toHaveProperty('id', mockItemRaw._id.toString());
    expect(publicDTO).toHaveProperty('referenceNumber', 'LPU-2026-F54109');
    expect(publicDTO).toHaveProperty('itemType', ItemType.FOUND);
    expect(publicDTO).toHaveProperty('title', 'Titan Fastrack Smartwatch (Black)');
    expect(publicDTO).toHaveProperty('publicDescription');
    expect(publicDTO.category).toHaveProperty('code', 'ELECTRONICS');
    expect(publicDTO.location).toHaveProperty('code', 'CENTRAL_LIBRARY');
    expect(publicDTO).toHaveProperty('status', ItemStatus.IN_CUSTODY);
    expect(publicDTO).toHaveProperty('eventDate');
  });

  it('should strictly exclude private and internal fields from public DTO', () => {
    const publicDTO = toPublicItemDTO(mockItemRaw) as unknown as Record<string, unknown>;

    // Private vault / encryption details
    expect(publicDTO).not.toHaveProperty('lockerStorageReference');
    expect(publicDTO).not.toHaveProperty('internalNotes');
    expect(publicDTO).not.toHaveProperty('privateVaultCiphertext');
    expect(publicDTO).not.toHaveProperty('iv');
    expect(publicDTO).not.toHaveProperty('authTag');
    expect(publicDTO).not.toHaveProperty('challengeAnswerHash');
    expect(publicDTO).not.toHaveProperty('reportedBy');
    expect(publicDTO).not.toHaveProperty('passwordHash');
    expect(publicDTO).not.toHaveProperty('__v');
  });

  it('should verify privacy across all operational item statuses', () => {
    const allStatuses = Object.values(ItemStatus);

    for (const status of allStatuses) {
      const itemWithStatus = { ...mockItemRaw, status };
      const dto = toPublicItemDTO(itemWithStatus) as unknown as Record<string, unknown>;

      expect(dto).not.toHaveProperty('lockerStorageReference');
      expect(dto).not.toHaveProperty('internalNotes');
      expect(dto).not.toHaveProperty('privateVaultCiphertext');
      expect(dto).not.toHaveProperty('iv');
      expect(dto).not.toHaveProperty('authTag');
      expect(dto.status).toBe(status);
    }
  });

  it('should correctly flag isOwner: false for public/stranger viewers', () => {
    const publicDTO = toPublicItemDTO(mockItemRaw, strangerUserId);
    expect(publicDTO.isOwner).toBe(false);
  });

  it('should correctly flag isOwner: true when current user is the reporter', () => {
    const ownerPublicDTO = toPublicItemDTO(mockItemRaw, reporterUserId);
    expect(ownerPublicDTO.isOwner).toBe(true);
  });

  it('should populate owner-specific metadata in toOwnerItemDTO without leaking secrets', () => {
    const ownerDTO = toOwnerItemDTO(mockItemRaw, true, 2);

    expect(ownerDTO.isOwner).toBe(true);
    expect(ownerDTO.hasPrivateDetails).toBe(true);
    expect(ownerDTO.verificationQuestionsCount).toBe(2);
    expect(ownerDTO).toHaveProperty('retentionExpiresAt');

    // Still must not leak raw cipher or locker references
    const record = ownerDTO as unknown as Record<string, unknown>;
    expect(record).not.toHaveProperty('lockerStorageReference');
    expect(record).not.toHaveProperty('internalNotes');
    expect(record).not.toHaveProperty('privateVaultCiphertext');
  });
});
