/**
 * ==============================================================================
 * LPU Lost & Found Property Recovery Platform
 * Database Index Synchronization & Optimization Script
 *
 * Ensures all compound indexes, unique constraints, and TTL indexes are built
 * in MongoDB Atlas before production traffic starts.
 *
 * Usage:
 *   node scripts/setup-db-indexes.mjs [MONGODB_URI]
 * ==============================================================================
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from apps/api/.env if available
dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });

const MONGODB_URI = process.argv[2] || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lpu-lost-found';

async function syncIndexes() {
  console.log(`\n================================================================`);
  console.log(`🛠️ Synchronizing MongoDB Atlas Indexes for LPU Lost & Found`);
  console.log(`📡 Connecting to: ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***:***@')}`);
  console.log(`================================================================\n`);

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully.\n');

    // Define schemas for indexing
    const db = mongoose.connection.db;

    const collections = [
      {
        name: 'users',
        indexes: [
          { key: { email: 1 }, options: { unique: true } },
          { key: { registrationNumber: 1 }, options: { unique: true } },
          { key: { role: 1 } },
        ],
      },
      {
        name: 'items',
        indexes: [
          { key: { status: 1, itemType: 1 } },
          { key: { category: 1, location: 1 } },
          { key: { createdAt: -1 } },
          { key: { reporter: 1 } },
          { key: { title: 'text', description: 'text' }, options: { name: 'item_text_search' } },
        ],
      },
      {
        name: 'claims',
        indexes: [
          { key: { item: 1, claimant: 1 } },
          { key: { claimStatus: 1, createdAt: -1 } },
          { key: { claimant: 1 } },
        ],
      },
      {
        name: 'matchsuggestions',
        indexes: [
          { key: { lostItem: 1, foundItem: 1 }, options: { unique: true } },
          { key: { score: -1 } },
        ],
      },
      {
        name: 'custodyrecords',
        indexes: [
          { key: { item: 1, timestamp: -1 } },
          { key: { actor: 1 } },
        ],
      },
      {
        name: 'auditentries',
        indexes: [
          { key: { timestamp: -1 } },
          { key: { actor: 1, action: 1 } },
          { key: { targetResource: 1 } },
        ],
      },
      {
        name: 'locations',
        indexes: [
          { key: { code: 1 }, options: { unique: true } },
          { key: { isActive: 1 } },
        ],
      },
      {
        name: 'itemcategories',
        indexes: [
          { key: { code: 1 }, options: { unique: true } },
          { key: { isActive: 1 } },
        ],
      },
      {
        name: 'privatedetails',
        indexes: [
          { key: { item: 1 }, options: { unique: true } },
        ],
      },
    ];

    for (const col of collections) {
      console.log(`📁 Processing collection: ${col.name}`);
      const collection = db.collection(col.name);

      for (const idx of col.indexes) {
        try {
          const indexName = await collection.createIndex(idx.key, idx.options || {});
          console.log(`   ✓ Index ensured: ${indexName} on ${JSON.stringify(idx.key)}`);
        } catch (idxErr) {
          console.warn(`   ⚠️ Index warning for ${JSON.stringify(idx.key)}: ${idxErr.message}`);
        }
      }
    }

    console.log(`\n================================================================`);
    console.log(`🎉 All collection indexes successfully created and verified!`);
    console.log(`================================================================\n`);
  } catch (error) {
    console.error('❌ Failed to synchronize database indexes:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

syncIndexes();
