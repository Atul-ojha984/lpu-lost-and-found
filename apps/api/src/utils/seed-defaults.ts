import { ItemCategory } from '../models/ItemCategory';
import { Location } from '../models/Location';
import { Item } from '../models/Item';
import { User } from '../models/User';
import { PrivateDetail } from '../models/PrivateDetail';
import { ItemType, ItemStatus, UserRole } from '../constants/enums';
import { encryptField } from './crypto';
import { logger } from '../config/logger';

export const DEFAULT_CATEGORIES = [
  { code: 'ELECTRONICS', name: 'Electronics & Gadgets', description: 'Laptops, smartphones, smartwatches, calculators, earphones, chargers', icon: 'Laptop' },
  { code: 'STUDENT_ID_CARDS', name: 'Student ID Cards', description: 'LPU university identity cards, RFID access tags', icon: 'CreditCard' },
  { code: 'WALLETS_PURSE', name: 'Wallets & Purses', description: 'Wallets, purses, pouches with currency or payment cards', icon: 'Wallet' },
  { code: 'DOCUMENTS_BOOKS', name: 'Documents & Notebooks', description: 'Textbooks, lab registers, project binders, government certificates', icon: 'FileText' },
  { code: 'KEYS', name: 'Keys & Keychains', description: 'Room keys, bike/scooty keys, locker master keys', icon: 'Key' },
  { code: 'BAGS_BACKPACKS', name: 'Bags & Backpacks', description: 'College backpacks, gym duffels, side bags, laptop sleeves', icon: 'Backpack' },
  { code: 'CLOTHING_ACCESSORIES', name: 'Clothing & Wearables', description: 'Jackets, sweaters, caps, prescription glasses, watches', icon: 'Shirt' },
  { code: 'SPORTS_EQUIPMENT', name: 'Sports Equipment', description: 'Badminton rackets, basketballs, gym gloves, water bottles', icon: 'Dumbbell' },
  { code: 'OTHERS', name: 'Miscellaneous Items', description: 'Umbrellas, stationery kits, miscellaneous personal effects', icon: 'HelpCircle' },
];

export const DEFAULT_LOCATIONS = [
  { code: 'BLOCK_30_38', name: 'Block 30–38', campusZone: 'Engineering & Technology Academic Hub', buildingName: 'Block 34', hasSecurityDesk: true, securityContactPhone: '+91-1824-517034' },
  { code: 'BLOCK_55_58', name: 'Block 55–58', campusZone: 'Management & Applied Sciences', buildingName: 'Block 56', hasSecurityDesk: true, securityContactPhone: '+91-1824-517056' },
  { code: 'UNI_MALL', name: 'Uni-Mall', campusZone: 'Commercial Center & Student Food Court', buildingName: 'Uni-Mall Central', hasSecurityDesk: true, securityContactPhone: '+91-1824-517100' },
  { code: 'CENTRAL_LIBRARY', name: 'Central Library', campusZone: 'Reading Halls & Reference Wing', buildingName: 'Central Library Building', hasSecurityDesk: true, securityContactPhone: '+91-1824-517088' },
  { code: 'INDOOR_STADIUM_SHANTI_DEVI', name: 'Shanti Devi Sports Complex', campusZone: 'Indoor Stadium, Gym & Courts', buildingName: 'Sports Complex', hasSecurityDesk: true, securityContactPhone: '+91-1824-517099' },
  { code: 'RESIDENTIAL_BOYS_BH', name: 'Boys Hostels (BH-1 to BH-8)', campusZone: 'Residential Zone North', buildingName: 'BH-4 Warden Post', hasSecurityDesk: true, securityContactPhone: '+91-1824-517104' },
  { code: 'RESIDENTIAL_GIRLS_GH', name: 'Girls Hostels (GH-1 to GH-6)', campusZone: 'Residential Zone South', buildingName: 'GH-2 Warden Post', hasSecurityDesk: true, securityContactPhone: '+91-1824-517202' },
  { code: 'MAIN_GATE_SECURITY', name: 'Main Security Posts (Gate 1 & 2)', campusZone: 'Campus Transit Points', buildingName: 'Main Gate Security Office', hasSecurityDesk: true, securityContactPhone: '+91-1824-517001' },
  { code: 'ROBOPARK_BALDEV_RAJ_MITTAL', name: 'Baldev Raj Mittal Unipolis & Park', campusZone: 'Auditorium & Green Lawn', buildingName: 'Unipolis', hasSecurityDesk: false },
  { code: 'OTHER_CAMPUS_AREA', name: 'Other Campus Perimeter', campusZone: 'General Grounds & Walkways', buildingName: 'Campus Perimeter', hasSecurityDesk: false },
];

export async function seedDefaults(): Promise<void> {
  try {
    // 1. Seed Categories if none exist
    const categoryCount = await ItemCategory.countDocuments();
    if (categoryCount === 0) {
      await ItemCategory.insertMany(DEFAULT_CATEGORIES);
      logger.info('✅ Seeded default LPU item categories');
    }

    // 2. Seed Locations if none exist
    const locationCount = await Location.countDocuments();
    if (locationCount === 0) {
      await Location.insertMany(DEFAULT_LOCATIONS);
      logger.info('✅ Seeded default LPU campus locations');
    }

    // 3. Seed initial demo student & demo items if database has zero items
    const itemCount = await Item.countDocuments();
    if (itemCount === 0) {
      // Find or create a demo reporter user
      let demoUser = await User.findOne({ email: 'student.demo@lpu.in' });
      if (!demoUser) {
        demoUser = await User.create({
          fullName: 'Aarav Sharma',
          email: 'student.demo@lpu.in',
          registrationNumber: '12204561',
          phoneNumber: '+91-9876543210',
          role: UserRole.STUDENT_STAFF,
          passwordHash: '$2a$10$wT0XqM5xO97G0Z0X3Q4i0eL7yUoA7bT4a2yV3x4zW5uP6y7r8s9t0', // Fictional test hash
          isEmailVerified: true,
          isActive: true,
        });
      }

      const elecCat = await ItemCategory.findOne({ code: 'ELECTRONICS' });
      const idCat = await ItemCategory.findOne({ code: 'STUDENT_ID_CARDS' });
      const walletCat = await ItemCategory.findOne({ code: 'WALLETS_PURSE' });
      const booksCat = await ItemCategory.findOne({ code: 'DOCUMENTS_BOOKS' });
      const keysCat = await ItemCategory.findOne({ code: 'KEYS' });

      const libLoc = await Location.findOne({ code: 'CENTRAL_LIBRARY' });
      const b34Loc = await Location.findOne({ code: 'BLOCK_30_38' });
      const mallLoc = await Location.findOne({ code: 'UNI_MALL' });
      const gateLoc = await Location.findOne({ code: 'MAIN_GATE_SECURITY' });
      const sportLoc = await Location.findOne({ code: 'INDOOR_STADIUM_SHANTI_DEVI' });

      if (elecCat && libLoc && b34Loc && mallLoc) {
        // Fictional sample items (all non-sensitive public details)
        const demoItemsData = [
          {
            referenceNumber: 'LPU-2026-F1001',
            itemType: ItemType.FOUND,
            title: 'Scientific Calculator fx-991EX',
            publicDescription: 'Black casing Casio scientific calculator found on desk 14 on 2nd floor reference section.',
            category: elecCat._id,
            location: libLoc._id,
            specificLocation: 'Central Library 2nd Floor Reference Section Table 14',
            eventDate: new Date('2026-10-17T14:30:00Z'),
            status: ItemStatus.IN_CUSTODY,
            reportedBy: demoUser._id,
            currentCustodyDesk: 'Central Library Security Desk',
            retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
            privateNote: 'Back panel has slight scratch and student initials A.K.',
          },
          {
            referenceNumber: 'LPU-2026-L1002',
            itemType: ItemType.LOST,
            title: 'Navy Blue Dell Laptop Charger (65W Type-C)',
            publicDescription: 'Dell 65W USB-C barrel power adapter misplaced during evening lab session.',
            category: elecCat._id,
            location: b34Loc._id,
            specificLocation: 'Block 34 Room 308 Computer Lab 4',
            eventDate: new Date('2026-10-18T10:15:00Z'),
            status: ItemStatus.REPORTED,
            reportedBy: demoUser._id,
            retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
            privateNote: 'Serial CN-0JNKWD with white electric tape wrap near connector',
          },
          {
            referenceNumber: 'LPU-2026-F1003',
            itemType: ItemType.FOUND,
            title: 'LPU Student RFID Identity Card & Lanyard',
            publicDescription: 'Standard blue LPU student ID card on university-branded red woven neck ribbon.',
            category: idCat ? idCat._id : elecCat._id,
            location: gateLoc ? gateLoc._id : mallLoc._id,
            specificLocation: 'Main Gate 1 Turnstile Entrance Lane 2',
            eventDate: new Date('2026-10-18T08:45:00Z'),
            status: ItemStatus.READY_FOR_HANDOVER,
            reportedBy: demoUser._id,
            currentCustodyDesk: 'Main Gate Security Post 1',
            retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
            privateNote: 'Name on card: Rohan Verma, Reg No: 12108842, School of Computer Science',
          },
          {
            referenceNumber: 'LPU-2026-F1004',
            itemType: ItemType.FOUND,
            title: 'Brown Leather Bi-Fold Wallet',
            publicDescription: 'Brown stitched leather wallet left near seating area of 1st floor food court.',
            category: walletCat ? walletCat._id : elecCat._id,
            location: mallLoc._id,
            specificLocation: 'Uni-Mall 1st Floor Food Court Booth 8',
            eventDate: new Date('2026-10-16T19:20:00Z'),
            status: ItemStatus.IN_CUSTODY,
            reportedBy: demoUser._id,
            currentCustodyDesk: 'Uni-Mall Security Desk',
            retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
            privateNote: 'Contains 3 currency notes (Rs 500, Rs 100, Rs 50) and a PNB metro card',
          },
          {
            referenceNumber: 'LPU-2026-L1005',
            itemType: ItemType.LOST,
            title: 'Spiral Bound Data Structures Lab Notebook',
            publicDescription: '200-page ruled lab journal with yellow cover and handwriting on first few pages.',
            category: booksCat ? booksCat._id : elecCat._id,
            location: b34Loc._id,
            specificLocation: 'Block 33 Ground Floor Staircase Bench',
            eventDate: new Date('2026-10-17T16:00:00Z'),
            status: ItemStatus.REPORTED,
            reportedBy: demoUser._id,
            retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
            privateNote: 'Roll number on index page written in red ink',
          },
          {
            referenceNumber: 'LPU-2026-F1006',
            itemType: ItemType.FOUND,
            title: 'Pair of Bike & Room Keys with Brass Ring',
            publicDescription: 'Two silver keys attached to a brass circular ring with a small black rubber fob.',
            category: keysCat ? keysCat._id : elecCat._id,
            location: sportLoc ? sportLoc._id : mallLoc._id,
            specificLocation: 'Shanti Devi Sports Complex Badminton Court Bleachers',
            eventDate: new Date('2026-10-18T07:30:00Z'),
            status: ItemStatus.IN_CUSTODY,
            reportedBy: demoUser._id,
            currentCustodyDesk: 'Sports Complex Office',
            retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
            privateNote: 'Key code engraved: M-4109 on shorter key',
          },
        ];

        for (const itemData of demoItemsData) {
          const { privateNote, ...publicFields } = itemData;
          const created = await Item.create(publicFields);

          // Encrypt private note in PrivateDetail collection
          if (privateNote) {
            const encrypted = encryptField(privateNote);
            await PrivateDetail.create({
              item: created._id,
              encryptedCiphertext: encrypted.ciphertext,
              iv: encrypted.iv,
              authTag: encrypted.authTag,
              fieldsSummary: ['identifyingMarks', 'serialNumbers'],
            });
          }
        }

        logger.info('✅ Seeded 6 realistic fictional demo campus property records with encrypted private vaults');
      }
    }
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Default seeding skipped or encountered issue');
  }
}
