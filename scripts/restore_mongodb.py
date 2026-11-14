#!/usr/bin/env python3
"""
==============================================================================
LPU Lost & Found Property Recovery Platform
MongoDB Backup Restore & Disaster Recovery Tool
==============================================================================
Restores verified collections from binary BSON & metadata backups into any
target MongoDB instance (local MongoDB or MongoDB Atlas).
==============================================================================
"""

import os
import sys
import json
import argparse
from pathlib import Path
import bson
import pymongo

BACKUP_DIR_DEFAULT = Path(r"C:\Users\kumar\Downloads\lpu-lost-and-found-main\database-backups\local-mongodb\lpu_lost_found")

def main():
    parser = argparse.ArgumentParser(description="Restore MongoDB database from local backup.")
    parser.add_argument("--backup-dir", default=str(BACKUP_DIR_DEFAULT), help="Directory containing backup files")
    parser.add_argument("--target-uri", default=os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017/"), help="Target MongoDB connection URI")
    parser.add_argument("--target-db", default=os.getenv("MONGODB_DATABASE", "lpu_lost_found"), help="Target database name")
    parser.add_argument("--drop", action="store_true", help="Drop target collections before restoring")
    args = parser.parse_args()

    backup_dir = Path(args.backup_dir)
    if not backup_dir.exists():
        print(f"❌ Backup directory not found: {backup_dir}")
        sys.exit(1)

    print("=" * 80)
    print("MONGODB DATABASE RESTORE UTILITY")
    print("=" * 80)
    print(f"Backup Directory: {backup_dir}")
    print(f"Target Database : {args.target_db}")
    print("=" * 80)

    try:
        client = pymongo.MongoClient(args.target_uri, serverSelectionTimeoutMS=8000)
        client.admin.command('ping')
        target_db = client[args.target_db]
        print("✅ Target MongoDB connection established.")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        sys.exit(1)

    bson_files = sorted(list(backup_dir.glob("*.bson")))
    if not bson_files:
        print(f"❌ No .bson files found in {backup_dir}")
        sys.exit(1)

    total_restored = 0

    for bson_file in bson_files:
        col_name = bson_file.stem
        tgt_col = target_db[col_name]
        
        if args.drop:
            tgt_col.drop()

        # Read binary BSON documents
        docs = []
        with open(bson_file, "rb") as f:
            data = f.read()
            offset = 0
            while offset < len(data):
                doc_len = int.from_bytes(data[offset:offset+4], byteorder='little')
                doc_bytes = data[offset:offset+doc_len]
                doc = bson.decode(doc_bytes)
                docs.append(doc)
                offset += doc_len

        if docs:
            try:
                tgt_col.insert_many(docs, ordered=False)
            except pymongo.errors.BulkWriteError as bwe:
                pass

        # Recreate indexes from metadata.json if present
        meta_file = backup_dir / f"{col_name}.metadata.json"
        if meta_file.exists():
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
                for idx in meta.get("indexes", []):
                    idx_name = idx.get("name")
                    if idx_name == "_id_":
                        continue
                    key = list(idx.get("key", {}).items())
                    unique = idx.get("unique", False)
                    try:
                        tgt_col.create_index(key, name=idx_name, unique=unique)
                    except Exception as ie:
                        pass

        count = tgt_col.count_documents({})
        total_restored += len(docs)
        print(f"✅ {col_name:<25} Restored: {len(docs):<5} docs | Current in DB: {count}")

    print("=" * 80)
    print(f"RESTORE COMPLETED. Total documents processed: {total_restored}")
    print("=" * 80)

if __name__ == "__main__":
    main()
