import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { User } from '../models/User';
import { ItemCategory } from '../models/ItemCategory';
import { Location } from '../models/Location';
import { Item } from '../models/Item';
import { UserRole, ItemType, ItemStatus } from '../constants/enums';
import { DEFAULT_CATEGORIES, DEFAULT_LOCATIONS } from '../utils/seed-defaults';

export async function runSeed(): Promise<void> {
  console.log('🌱 Starting LPU Lost & Found Seed Script...');
  console.log(`Connecting to: ${env.MONGODB_URI.replace(/\/\/[^@]*@/, '//***:***@')}`);

  await mongoose.connect(env.MONGODB_URI);
  console.log('✅ Connected to MongoDB.');

  // 1. Categories
  for (const cat of DEFAULT_CATEGORIES) {
    await ItemCategory.findOneAndUpdate(
      { code: cat.code },
      { $set: cat },
      { upsert: true, new: true }
    );
  }
  console.log(`✅ Seeded ${DEFAULT_CATEGORIES.length} campus item categories.`);

  // 2. Locations
  for (const loc of DEFAULT_LOCATIONS) {
    await Location.findOneAndUpdate(
      { code: loc.code },
      { $set: loc },
      { upsert: true, new: true }
    );
  }
  console.log(`✅ Seeded ${DEFAULT_LOCATIONS.length} campus locations.`);

  // 3. Demo Users
  const studentHash = await bcrypt.hash('Student@12345', 10);
  const securityHash = await bcrypt.hash('Security@12345', 10);
  const adminHash = await bcrypt.hash('Admin@12345', 10);

  const quickStudentHash = await bcrypt.hash('DemoStudent2026!', 10);
  const quickSecurityHash = await bcrypt.hash('DemoSecurity2026!', 10);
  const quickAdminHash = await bcrypt.hash('DemoAdmin2026!', 10);

  const demoUsers = [
    // Documented Standard Demo Personas
    {
      fullName: 'Aman Deep Singh',
      email: 'student@lpu.co.in',
      registrationNumber: '12101234',
      phoneNumber: '+91-9876543201',
      role: UserRole.STUDENT_STAFF,
      passwordHash: studentHash,
      isEmailVerified: true,
      isActive: true,
    },
    {
      fullName: 'Priya Sharma',
      email: 'student2@lpu.co.in',
      registrationNumber: '12105678',
      phoneNumber: '+91-9876543202',
      role: UserRole.STUDENT_STAFF,
      passwordHash: studentHash,
      isEmailVerified: true,
      isActive: true,
    },
    {
      fullName: 'Inspector Harjit Singh',
      email: 'security@lpu.co.in',
      registrationNumber: 'LPU-SEC-001',
      phoneNumber: '+91-9876543203',
      role: UserRole.SECURITY_PERSONNEL,
      securityPost: 'Gate 1 Main Post',
      passwordHash: securityHash,
      isEmailVerified: true,
      isActive: true,
    },
    {
      fullName: 'Dr. Ramesh Kumar (DSW Admin)',
      email: 'admin@lpu.co.in',
      registrationNumber: 'LPU-ADM-001',
      phoneNumber: '+91-9876543204',
      role: UserRole.CAMPUS_ADMIN,
      passwordHash: adminHash,
      isEmailVerified: true,
      isActive: true,
    },
    // Quick-Fill Demo Personas from Web Login UI
    {
      fullName: 'Aarav Sharma (CSE)',
      email: 'aarav.sharma.12108@lpu.in',
      registrationNumber: '12108001',
      phoneNumber: '+91-9876543205',
      role: UserRole.STUDENT_STAFF,
      passwordHash: quickStudentHash,
      isEmailVerified: true,
      isActive: true,
    },
    {
      fullName: 'Officer Rajesh Verma',
      email: 'rajesh.verma.sec@lpu.in',
      registrationNumber: 'SEC-1092',
      phoneNumber: '+91-9876543206',
      role: UserRole.SECURITY_PERSONNEL,
      securityPost: 'Block 34 Central Desk',
      passwordHash: quickSecurityHash,
      isEmailVerified: true,
      isActive: true,
    },
    {
      fullName: 'Administrator Sunita Sharma',
      email: 'sunita.admin@lpu.in',
      registrationNumber: 'ADM-8801',
      phoneNumber: '+91-9876543207',
      role: UserRole.CAMPUS_ADMIN,
      passwordHash: quickAdminHash,
      isEmailVerified: true,
      isActive: true,
    },
  ];

  for (const u of demoUsers) {
    await User.findOneAndUpdate(
      { email: u.email },
      { $set: u },
      { upsert: true, new: true }
    );
  }
  console.log(`✅ Seeded ${demoUsers.length} verified demo users with active bcrypt hashes.`);

  // 4. Seed baseline active items if none exist
  const existingItemsCount = await Item.countDocuments();
  if (existingItemsCount < 3) {
    const studentUser = await User.findOne({ email: 'student@lpu.co.in' });
    const secOfficer = await User.findOne({ email: 'security@lpu.co.in' });
    const elecCat = await ItemCategory.findOne({ code: 'ELECTRONICS' });
    const b34Loc = await Location.findOne({ code: 'BLOCK_30_38' });
    const libLoc = await Location.findOne({ code: 'CENTRAL_LIBRARY' });

    if (studentUser && secOfficer && elecCat && b34Loc && libLoc) {
      await Item.create([
        {
          referenceNumber: 'LPU-2026-F2001',
          itemType: ItemType.FOUND,
          title: 'Casio Scientific Calculator FX-991EX',
          publicDescription: 'Found black casing scientific calculator on desk in Block 34 Room 304.',
          category: elecCat._id,
          location: b34Loc._id,
          specificLocation: 'Block 34, 3rd Floor Room 304',
          eventDate: new Date(),
          status: ItemStatus.IN_CUSTODY,
          reportedBy: secOfficer._id,
          currentCustodyDesk: 'Block 34 Central Desk',
          retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
        },
        {
          referenceNumber: 'LPU-2026-L2002',
          itemType: ItemType.LOST,
          title: 'HP Wireless Mouse (Black)',
          publicDescription: 'Lost black HP optical wireless mouse with USB receiver near Central Library reading hall.',
          category: elecCat._id,
          location: libLoc._id,
          specificLocation: 'Central Library 1st Floor Study Cubicle',
          eventDate: new Date(),
          status: ItemStatus.REPORTED,
          reportedBy: studentUser._id,
          retentionExpiresAt: new Date(Date.now() + 90 * 86400000),
        },
      ]);
      console.log('✅ Seeded baseline public items for demonstration.');
    }
  }

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB. Seed complete!');
}

if (process.argv[1]?.includes('seed.ts') || process.argv[1]?.includes('seed.js')) {
  runSeed().catch((err) => {
    console.error('❌ Seed script error:', err);
    process.exit(1);
  });
}
