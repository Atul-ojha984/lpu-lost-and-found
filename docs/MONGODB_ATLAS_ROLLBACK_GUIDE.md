# MongoDB Atlas Rollback & Disaster Recovery Guide

**System:** LPU Lost & Found Property Recovery Platform  
**Target:** Local MongoDB Community Server & MongoDB Atlas  

---

## 1. Rollback Overview

This guide defines standard operating procedures to roll back any migration attempt, recover data from offline backups, or restore local MongoDB state.

### Immutable Safety Principle
- The local MongoDB database (`lpu_lost_found`) is **never modified or deleted** during migration.
- The verified offline backup in `database-backups/local-mongodb/lpu_lost_found/` is **immutable** and serves as the disaster recovery baseline.

---

## 2. Scenario 1: Rollback During Data Transfer to Atlas

If the migration to MongoDB Atlas encounters network timeouts, authentication issues, or errors:
1. **No Impact on Source:** The local database (`127.0.0.1:27017/lpu_lost_found`) remains 100% intact and unaffected.
2. **Clean Target Atlas:**
   To reset or purge partially imported data on Atlas:
   ```powershell
   python scripts/migrate_to_atlas.py --target-uri "mongodb+srv://<USER>:<PASS>@<CLUSTER>.mongodb.net/?retryWrites=true&w=majority" --drop-target --dry-run
   ```
   Or drop the database directly in the MongoDB Atlas Web Console -> **Database** -> **Browse Collections** -> **Drop Database**.

---

## 3. Scenario 2: Restoring Local MongoDB from Offline Backup

If the local MongoDB Community Server database was accidentally altered or corrupted:

### Method: Automated Python Restore Script
Run the restore script:
```powershell
python scripts/restore_mongodb.py --target-uri "mongodb://127.0.0.1:27017/" --target-db "lpu_lost_found"
```

### Method: Official `mongorestore` CLI
```powershell
mongorestore --host=127.0.0.1:27017 --db=lpu_lost_found --drop "database-backups/local-mongodb/lpu_lost_found/"
```

---

## 4. Scenario 3: Backend Application Reversion

If the backend was switched to point to Atlas (`MONGODB_URI`) and you need to switch it back to local MongoDB:

### For Node.js Express API (`apps/api`)
1. Edit `apps/api/.env`:
   ```dotenv
   MONGODB_URI=mongodb://127.0.0.1:27017/lpu_lost_found
   MONGODB_DATABASE=lpu_lost_found
   ```
2. Restart the API:
   ```powershell
   npm --workspace=apps/api run dev
   ```

### For Django REST Framework (`backend`)
1. Revert `DJANGO_SETTINGS_MODULE` in `backend/.env` to default:
   ```dotenv
   # DJANGO_SETTINGS_MODULE=config.settings
   DATABASE_URL=sqlite:///db.sqlite3
   ```
2. Run system checks:
   ```powershell
   python manage.py check
   ```

---

## 5. Rollback Verification Checklist

- [ ] Confirm local database connection is active on `127.0.0.1:27017`.
- [ ] Confirm all 12 collections exist and document counts sum to **996**.
- [ ] Verify test login endpoint returns HTTP 200 with JWT token.
- [ ] Verify public board endpoint returns HTTP 200 with active listings.
