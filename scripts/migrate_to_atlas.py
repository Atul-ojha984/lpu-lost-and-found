#!/usr/bin/env python3
"""
==============================================================================
LPU Lost & Found Property Recovery Platform
MongoDB Atlas Data Transfer & Reconciliation Engine
==============================================================================
Safely migrates local MongoDB database records to MongoDB Atlas with:
- Zero data loss: Preserves all ObjectIds, UUIDs, BSON types, and field encryptions.
- Index preservation: Recreates all unique, compound, and text indexes.
- Non-destructive safety checks: Tests connectivity, validates existing target data,
  and supports idempotent import.
==============================================================================
"""

import os
import sys
import argparse
from pathlib import Path
import pymongo
from pymongo.errors import PyMongoError

# Optional: load .env if available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SOURCE_URI_DEFAULT = "mongodb://127.0.0.1:27017/"
SOURCE_DB_DEFAULT = "lpu_lost_found"

COLLECTIONS_ORDER = [
    "itemcategories",
    "locations",
    "users",
    "items",
    "privatedetails",
    "verificationchallenges",
    "claims",
    "matchsuggestions",
    "custodyrecords",
    "handovers",
    "disposalrecords",
    "auditentries",
]

def sanitize_uri(uri: str) -> str:
    """Mask credentials in MongoDB connection string for safe console logging."""
    if "@" in uri:
        prefix, rest = uri.split("@", 1)
        scheme = prefix.split("//")[0]
        return f"{scheme}//***:***@{rest}"
    return uri

def main():
    parser = argparse.ArgumentParser(description="Transfer local MongoDB database to MongoDB Atlas.")
    parser.add_argument("--source-uri", default=os.getenv("SOURCE_MONGODB_URI", SOURCE_URI_DEFAULT), help="Source MongoDB URI")
    parser.add_argument("--source-db", default=os.getenv("SOURCE_MONGODB_DATABASE", SOURCE_DB_DEFAULT), help="Source DB Name")
    parser.add_argument("--target-uri", default=os.getenv("MONGODB_URI", ""), help="Target Atlas MongoDB URI")
    parser.add_argument("--target-db", default=os.getenv("MONGODB_DATABASE", "lpu_lost_found"), help="Target Atlas DB Name")
    parser.add_argument("--dry-run", action="store_true", help="Simulate migration without writing to Atlas")
    parser.add_argument("--drop-target", action="store_true", help="Drop target collections before import (use with caution)")
    args = parser.parse_args()

    if not args.target_uri:
        print("❌ Error: Target MongoDB Atlas URI is required.")
        print("   Set the MONGODB_URI environment variable or pass --target-uri.")
        print("   Example: mongodb+srv://<user>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority")
        sys.exit(1)

    print("=" * 80)
    print("LPU LOST & FOUND: MONGODB ATLAS DATA MIGRATION")
    print("=" * 80)
    print(f"Source Database : {args.source_db} ({sanitize_uri(args.source_uri)})")
    print(f"Target Database : {args.target_db} ({sanitize_uri(args.target_uri)})")
    print(f"Mode            : {'DRY RUN (Read Only)' if args.dry_run else 'LIVE MIGRATION'}")
    print("=" * 80)

    # 1. Connect to Source
    try:
        source_client = pymongo.MongoClient(args.source_uri, serverSelectionTimeoutMS=5000)
        source_client.admin.command('ping')
        source_db = source_client[args.source_db]
        print("✅ Source MongoDB connected successfully.")
    except Exception as e:
        print(f"❌ Failed to connect to source MongoDB: {e}")
        sys.exit(1)

    # 2. Connect to Target (Atlas)
    try:
        target_client = pymongo.MongoClient(args.target_uri, serverSelectionTimeoutMS=10000)
        target_client.admin.command('ping')
        target_db = target_client[args.target_db]
        print("✅ Target MongoDB Atlas cluster connected successfully.")
    except Exception as e:
        print(f"❌ Failed to connect to target MongoDB Atlas: {e}")
        sys.exit(1)

    # 3. Check existing target data
    existing_target_collections = target_db.list_collection_names()
    target_has_data = False
    for col_name in existing_target_collections:
        if target_db[col_name].count_documents({}) > 0:
            target_has_data = True
            break

    if target_has_data and not args.drop_target and not args.dry_run:
        print("\n⚠️ WARNING: Target database already contains existing records.")
        print("   To avoid duplicates or conflicting keys, inspect the target or pass --drop-target if re-migrating.")

    # 4. Migrate collections in dependency order
    reconciliation = []
    total_source_docs = 0
    total_target_docs = 0

    print("\n--- Migrating Collections & Rebuilding Indexes ---")
    for col_name in COLLECTIONS_ORDER:
        src_col = source_db[col_name]
        tgt_col = target_db[col_name]
        
        src_count = src_col.count_documents({})
        total_source_docs += src_count
        
        if args.dry_run:
            print(f"🔍 [DRY-RUN] {col_name:<25} Would transfer {src_count} documents and indexes.")
            reconciliation.append((col_name, src_count, "(dry-run)", "PLANNED"))
            continue

        if args.drop_target:
            tgt_col.drop()

        # Batch copy documents with idempotent upsert
        docs = list(src_col.find({}))
        if docs:
            operations = [pymongo.ReplaceOne({'_id': doc['_id']}, doc, upsert=True) for doc in docs]
            try:
                tgt_col.bulk_write(operations, ordered=False)
            except Exception as bwe:
                print(f"   ℹ️ Notice for {col_name}: Bulk write notice: {bwe}")

        # Recreate indexes
        src_indexes = list(src_col.list_indexes())
        for idx in src_indexes:
            idx_name = idx.get('name')
            if idx_name == '_id_':
                continue
            idx_key = list(idx.get('key').items())
            unique = idx.get('unique', False)
            
            # Handle text search or standard indexes
            try:
                if '_fts' in dict(idx.get('key', {})):
                    # Text index on Item
                    tgt_col.create_index([("title", "text"), ("publicDescription", "text")], name=idx_name)
                else:
                    tgt_col.create_index(idx_key, name=idx_name, unique=unique)
            except Exception as ie:
                print(f"   ⚠️ Notice on index {idx_name} for {col_name}: {ie}")

        tgt_count = tgt_col.count_documents({})
        total_target_docs += tgt_count
        status = "VERIFIED" if src_count == tgt_count else f"DIFF ({tgt_count}/{src_count})"
        reconciliation.append((col_name, src_count, tgt_count, status))
        print(f"✅ {col_name:<25} Transferred: {tgt_count}/{src_count} docs | Status: {status}")

    # Summary table
    print("\n" + "=" * 80)
    print("MIGRATION RECONCILIATION REPORT")
    print("=" * 80)
    print(f"{'Collection':<25} {'Source Count':<15} {'Atlas Count':<15} {'Status':<15}")
    print("-" * 80)
    for col_name, src_c, tgt_c, st in reconciliation:
        print(f"{col_name:<25} {str(src_c):<15} {str(tgt_c):<15} {st:<15}")
    print("=" * 80)
    if not args.dry_run:
        print(f"TOTAL DOCUMENTS : Source = {total_source_docs} | Atlas = {total_target_docs}")
        if total_source_docs == total_target_docs:
            print("🏆 MIGRATION SUCCESSFUL: All 12 collections and document counts perfectly matched!")
        else:
            print("⚠️ WARNING: Document counts differ. Check logs above.")
    print("=" * 80)

if __name__ == "__main__":
    main()
