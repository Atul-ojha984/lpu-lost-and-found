# MongoDB Atlas Migration Guide: LPU Lost & Found

**Platform:** LPU Lost & Found Property Recovery Platform  
**Target:** Local MongoDB Community (`lpu_lost_found`) -> MongoDB Atlas  
**Engine:** Node.js/Mongoose (`apps/api`) & Python/Django (`backend`)  

---

## 1. Migration Overview & Safeguards

This step-by-step guide walks you through migrating the verified local MongoDB database to MongoDB Atlas without data loss, downtime, or service degradation.

### Core Safeguards Implemented
1. **Zero Data Loss:** Preserves all 996 documents across 12 collections.
2. **Native BSON Fidelity:** Preserves all `ObjectId` identifiers, Date timestamps, and AES-256 encrypted vault payloads.
3. **Index Reconstruction:** Automates replication of all 68 indexes including compound keys and full-text search.
4. **Idempotent Execution:** Can be rerun safely without corrupting unique keys.
5. **Verified Offline Backup:** Complete binary BSON and metadata backup stored safely in `database-backups/local-mongodb/lpu_lost_found/`.

---

## 2. Step 1: Prepare MongoDB Atlas Cluster (User Configuration)

In your MongoDB Atlas Dashboard:
1. **Create/Select a Cluster:**
   - A free **M0 Sandbox** (512 MB storage, shared RAM) or higher tier (M10+) in AWS/Azure/GCP.
2. **Configure Database User:**
   - Under **Database Access**, create a user (e.g. `lpu_db_admin`).
   - Assign built-in role: `readWriteAnyDatabase` or `readWrite@lpu_lost_found`.
   - Set a strong password (keep this secure; never share in chat).
3. **Configure Network IP Access:**
   - Under **Network Access**, click **Add IP Address**.
   - Add your **current public IP address** (for local migration).
   - For cloud backends (Render), add `0.0.0.0/0` (Allow Access from Anywhere) protected by user authentication.
4. **Obtain Connection String (SRV URI):**
   - Click **Connect** -> **Drivers** -> **Node.js** (or **Python**).
   - Copy the SRV string format:
     ```text
     mongodb+srv://<username>:<password>@<cluster-name>.mongodb.net/lpu_lost_found?retryWrites=true&w=majority
     ```

---

## 3. Step 2: Execute Live Data Migration

We provide a dedicated migration engine [`scripts/migrate_to_atlas.py`](file:///c:/Users/kumar/Downloads/lpu-lost-and-found-main/lpu-lost-and-found-main/scripts/migrate_to_atlas.py).

### Option A: Dry Run (Validate connectivity & plan without writing)
```powershell
python scripts/migrate_to_atlas.py --target-uri "mongodb+srv://<USER>:<PASS>@<CLUSTER>.mongodb.net/?retryWrites=true&w=majority" --dry-run
```

### Option B: Execute Data Migration to Atlas
```powershell
python scripts/migrate_to_atlas.py --target-uri "mongodb+srv://<USER>:<PASS>@<CLUSTER>.mongodb.net/?retryWrites=true&w=majority"
```

The script will:
- Connect to local MongoDB (`127.0.0.1:27017/lpu_lost_found`).
- Connect to your target Atlas cluster with TLS.
- Transfer each collection in dependency order (`itemcategories` -> `locations` -> `users` -> `items` -> `privatedetails` -> `verificationchallenges` -> `claims` -> `matchsuggestions` -> `custodyrecords` -> `handovers` -> `disposalrecords` -> `auditentries`).
- Recreate all unique, compound, and text search indexes.
- Output a comprehensive reconciliation table comparing source counts vs Atlas counts.

---

## 4. Step 3: Switch Backend Connection to Atlas

### For Node.js Express API (`apps/api`)
1. Create or update `apps/api/.env`:
   ```dotenv
   MONGODB_URI=mongodb+srv://<USER>:<PASSWORD>@<CLUSTER>.mongodb.net/lpu_lost_found?retryWrites=true&w=majority
   MONGODB_DATABASE=lpu_lost_found
   ```
2. Start the API:
   ```powershell
   npm --workspace=apps/api run dev
   ```
3. Check startup logs:
   ```text
   [INFO] Connecting to MongoDB database...
   [INFO] ✅ MongoDB connection established successfully (db: lpu_lost_found)
   ```

### For Django REST Framework (`backend`)
1. If using the opt-in MongoDB settings:
   ```dotenv
   DJANGO_SETTINGS_MODULE=config.settings_mongodb
   MONGODB_URI=mongodb+srv://<USER>:<PASSWORD>@<CLUSTER>.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DATABASE=lpu_lost_found
   ```
2. Run database checks:
   ```powershell
   python manage.py check
   ```

---

## 5. Step 4: Post-Migration Verification Checklist

- [ ] Confirm all 12 collections exist in MongoDB Atlas via **MongoDB Atlas UI / Compass**.
- [ ] Confirm total document count matches **996 documents**.
- [ ] Verify test login with seeded user accounts (`aarav.sharma.12108@lpu.in` / `DemoStudent2026!`).
- [ ] Verify item listing board on frontend (`http://localhost:3000/board`).
- [ ] Verify claim submission and OTP handover flow.
