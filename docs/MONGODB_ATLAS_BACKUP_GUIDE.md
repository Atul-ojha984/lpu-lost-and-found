# MongoDB Atlas Backup Guide: LPU Lost & Found

**Project:** LPU Lost & Found Property Recovery Platform  
**Backup Date:** November 14, 2026  
**Source Database:** `lpu_lost_found` (Local MongoDB Community Server on `127.0.0.1:27017`)  
**Backup Status:** VERIFIED & COMPLETE (12 Collections, 996 Documents)  
**Storage Location:** `database-backups/local-mongodb/lpu_lost_found/`  

---

## 1. Backup Location & Security

The complete offline backup is saved to:
```text
C:\Users\kumar\Downloads\lpu-lost-and-found-main\database-backups\local-mongodb\lpu_lost_found\
```
- **Git Safety:** Excluded from version control via `.gitignore` (`database-backups/`, `*.bson`, `dump/`).
- **Backup Formats Generated:**
  - **Binary BSON (`.bson`):** Raw byte streams of all 996 documents preserving native MongoDB BSON types (`ObjectId`, `Date`, `Binary`, `Int64`, `Decimal128`).
  - **Index Metadata (`.metadata.json`):** Full index specifications, options, and compound keys. Fully compatible with `mongorestore`.
  - **Extended JSON (`.json`):** Formatted canonical JSON (via `bson.json_util`) for manual inspection or portable mongoimport.
  - **Manifest (`backup_manifest.json`):** Cryptographic verification log with exact document counts and byte sizes.

---

## 2. Collection Inventory & Verified Counts

| Collection Name | Live Count | Backup Count | BSON Size (Bytes) | Indexes Saved | Verification Status |
| :--- | :-: | :-: | :-: | :-: | :-: |
| `auditentries` | 456 | 456 | 170,742 | 10 | **Verified OK** |
| `claims` | 32 | 32 | 10,560 | 6 | **Verified OK** |
| `custodyrecords` | 18 | 18 | 7,479 | 7 | **Verified OK** |
| `disposalrecords` | 15 | 15 | 8,265 | 5 | **Verified OK** |
| `handovers` | 19 | 19 | 8,437 | 7 | **Verified OK** |
| `itemcategories` | 24 | 24 | 5,703 | 3 | **Verified OK** |
| `items` | 71 | 71 | 34,213 | 15 | **Verified OK** |
| `locations` | 25 | 25 | 6,771 | 4 | **Verified OK** |
| `matchsuggestions` | 219 | 219 | 86,002 | 7 | **Verified OK** |
| `privatedetails` | 26 | 26 | 10,584 | 2 | **Verified OK** |
| `users` | 49 | 49 | 15,679 | 4 | **Verified OK** |
| `verificationchallenges` | 42 | 42 | 10,872 | 3 | **Verified OK** |
| **TOTAL** | **996** | **996** | **374,607** | **68** | **100% Match** |

---

## 3. How to Restore Local Database (Rollback Reference)

If you ever need to restore the local database from this backup:

### Option A: Using the Automated Python Restore Script
Run the project migration restorer:
```bash
python scripts/restore_mongodb.py
```

### Option B: Using `mongorestore` (if MongoDB Database Tools is installed)
```bash
mongorestore --host=127.0.0.1:27017 --db=lpu_lost_found --drop database-backups/local-mongodb/lpu_lost_found/
```
*(The `--drop` flag clears existing collections before restoring).*

---

## 4. Integrity Validation Rule

Before running any write or restore operation against MongoDB Atlas, verify that `backup_manifest.json` exists and reports `all_collections_verified: true`. Never delete this backup directory.
