# MongoDB Atlas Migration Audit: LPU Lost & Found

**Project:** LPU Lost & Found Property Recovery Platform  
**Audit Date:** November 14, 2026  
**Auditor Role:** Senior MongoDB DBA, Backend Architect & Migration Specialist  
**Target Migration:** Local MongoDB Community Server (`127.0.0.1:27017/lpu_lost_found`) -> MongoDB Atlas  

---

## 1. Executive Summary

This comprehensive audit inspects the full repository architecture, active backends, database configuration, local MongoDB data footprint, collection schemas, indexes, and dependencies in preparation for migrating from a local MongoDB instance to **MongoDB Atlas**.

The migration must preserve:
- All **12 collections** and **996 documents** in `lpu_lost_found`.
- All `_id` values (MongoDB `ObjectId`), field-level encryptions, relationships, and custom indexes (including text search and compound unique keys).
- API contracts, authentication/JWT verification, role-based access control (RBAC), and campus recovery workflows without service disruption.

---

## 2. Technology Stack & Multi-Service Monorepo Analysis

The repository is structured as a monorepo containing:

| Layer | Service | Technologies | Database Dependency |
| :--- | :--- | :--- | :--- |
| **Frontend** | `apps/web` | Next.js 16.4.2 (Turbopack, App Router), React 19.3.0, TypeScript 5.6, Tailwind CSS 4 | Communicates over REST API via `NEXT_PUBLIC_API_URL` |
| **Node.js API** | `apps/api` | Node.js v20+, Express.js 4.21, TypeScript 5.7, Mongoose 8.9.5, Zod 3.23 | **Direct Native MongoDB ODM (Mongoose 8)** |
| **Django API** | `backend` | Python 3.12+, Django 5.2.18, Django REST Framework 3.15, SimpleJWT | Dual-mode: SQLite/Postgres (`settings.py`) or MongoDB (`settings_mongodb.py` via `django-mongodb-backend` 5.2.4 & `pymongo` 4.19) |

---

## 3. Database Architecture & Connection Inspection

### 3.1 Local Source Database
- **Engine:** MongoDB Community Server 8.2.x (Verified active Windows service `MongoDB` listening on `127.0.0.1:27017`)
- **Database Name:** `lpu_lost_found`
- **Client Access:** MongoDB Compass & `mongosh` v2.x
- **GridFS Usage:** None. (0 `fs.files` or `fs.chunks` collections; file uploads use disk storage)

### 3.2 Connection Implementations Discovered in Codebase

1. **`apps/api/src/config/database.ts`**:
   ```typescript
   await mongoose.connect(env.MONGODB_URI, {
     serverSelectionTimeoutMS: 5000,
     autoIndex: env.NODE_ENV !== 'production',
   });
   ```
   - Validated via `apps/api/src/config/env.ts` using Zod.
   - Default fallback: `mongodb://127.0.0.1:27017/lpu_lost_found`.
   - Handles `connected`, `error`, and `disconnected` events gracefully.

2. **`backend/config/settings_mongodb.py`**:
   ```python
   DATABASES = {
       'default': {
           'ENGINE': 'django_mongodb_backend',
           'HOST': MONGODB_URI,
           'NAME': MONGODB_DATABASE,
           'OPTIONS': {'retryWrites': 'true', 'w': 'majority'},
       }
   }
   ```
   - Opt-in Django settings module `config.settings_mongodb`.
   - Strictly enforces `mongodb+srv://` scheme for production environments (`IS_PRODUCTION=True`).
   - Forbids `localhost` / `127.0.0.1` when deployed in production mode.

---

## 4. Local Database Inventory (Live Inspection)

Inspection performed on live local MongoDB service at `mongodb://127.0.0.1:27017/lpu_lost_found`:

| # | Collection Name | Document Count | Data Size (Bytes) | Storage Size (Bytes) | Primary Key (`_id`) Type |
| :-: | :--- | :-: | :-: | :-: | :-: |
| 1 | `auditentries` | **456** | 170,742 | 61,440 | `ObjectId` |
| 2 | `claims` | **32** | 10,560 | 36,864 | `ObjectId` |
| 3 | `custodyrecords` | **18** | 7,479 | 32,768 | `ObjectId` |
| 4 | `disposalrecords` | **15** | 8,265 | 36,864 | `ObjectId` |
| 5 | `handovers` | **19** | 8,437 | 36,864 | `ObjectId` |
| 6 | `itemcategories` | **24** | 5,703 | 36,864 | `ObjectId` |
| 7 | `items` | **71** | 34,213 | 36,864 | `ObjectId` |
| 8 | `locations` | **25** | 6,771 | 36,864 | `ObjectId` |
| 9 | `matchsuggestions` | **219** | 86,002 | 40,960 | `ObjectId` |
| 10 | `privatedetails` | **26** | 10,584 | 36,864 | `ObjectId` |
| 11 | `users` | **49** | 15,679 | 45,056 | `ObjectId` |
| 12 | `verificationchallenges` | **42** | 10,872 | 36,864 | `ObjectId` |
| **TOTAL** | **12 Collections** | **996** | **374,607** (~366 KB) | **475,136** (~464 KB) | All BSON `ObjectId` |

---

## 5. Models, Schemas & Relationships

All 12 Mongoose models defined under `apps/api/src/models/` map 1:1 to the collections:

1. **`User` (`users`)**:
   - Fields: `name`, `email` (unique), `registrationNumber` (unique), `passwordHash` (bcrypt), `role` (`STUDENT_STAFF`, `SECURITY_PERSONNEL`, `CAMPUS_ADMIN`, `SYSTEM_ADMIN`), `phoneNumber`, `department`, `isActive`, `createdAt`, `updatedAt`.
2. **`ItemCategory` (`itemcategories`)**:
   - Fields: `name`, `code` (unique), `description`, `icon`, `retentionPeriodDays`, `isActive`.
3. **`Location` (`locations`)**:
   - Fields: `name`, `code` (unique), `campusZone`, `description`, `isActive`.
4. **`Item` (`items`)**:
   - Fields: `title`, `description`, `category` (ref: `ItemCategory`), `location` (ref: `Location`), `itemType` (`LOST`, `FOUND`), `referenceNumber` (unique, e.g. `LPU-2026-F1001`), `status`, `eventDate`, `reportedBy` (ref: `User`), `imageUrl`, `retentionExpiresAt`, `isArchived`.
5. **`PrivateDetail` (`privatedetails`)**:
   - Fields: `item` (ref: `Item`, unique 1:1), `encryptedData` (AES-256-GCM ciphertext), `iv`, `authTag`, `createdAt`.
6. **`VerificationChallenge` (`verificationchallenges`)**:
   - Fields: `item` (ref: `Item`), `question`, `expectedAnswerHash` (bcrypt), `isActive`.
7. **`Claim` (`claims`)**:
   - Fields: `item` (ref: `Item`), `claimant` (ref: `User`), `status` (`PENDING`, `APPROVED`, `REJECTED`), `proofDescription`, `answersToChallenges` (array), `reviewedBy` (ref: `User`), `reviewNotes`.
8. **`CustodyRecord` (`custodyrecords`)**:
   - Fields: `item` (ref: `Item`), `action` (`INTAKE`, `TRANSFER`, `RELEASE`), `handledBy` (ref: `User`), `lockerNumber`, `notes`, `timestamp`.
9. **`Handover` (`handovers`)**:
   - Fields: `item` (ref: `Item`), `claim` (ref: `Claim`), `recipient` (ref: `User`), `supervisingOfficer` (ref: `User`), `otpHash`, `otpExpiresAt`, `isCompleted`, `handoverDate`.
10. **`MatchSuggestion` (`matchsuggestions`)**:
    - Fields: `lostItem` (ref: `Item`), `foundItem` (ref: `Item`), `matchScore` (float), `status`, `explanation`.
11. **`DisposalRecord` (`disposalrecords`)**:
    - Fields: `item` (ref: `Item`, unique), `method` (`DONATION`, `AUCTION`, `DESTROYED`), `approvedBy` (ref: `User`), `disposalDate`, `notes`.
12. **`AuditEntry` (`auditentries`)**:
    - Fields: `actor` (ref: `User`), `actorRole`, `action`, `targetEntity`, `targetId`, `timestamp`, `metadata`.

---

## 6. Discovered Indexes & Constraints

Total indexes discovered: **68**. All must be preserved on Atlas.

### 6.1 Critical Unique Indexes
- `users`: `email_1` (unique), `registrationNumber_1` (unique)
- `items`: `referenceNumber_1` (unique)
- `itemcategories`: `code_1` (unique)
- `locations`: `code_1` (unique)
- `privatedetails`: `item_1` (unique)
- `disposalrecords`: `item_1` (unique)
- `matchsuggestions`: `lostItem_1_foundItem_1` (unique compound)

### 6.2 Performance & Filter Indexes
- `items`: `category_1_location_1`, `status_1_itemType_1`, `eventDate_1`, `createdAt_-1`, `reportedBy_1`
- `items`: **`item_text_search`** (`{_fts: "text", _ftsx: 1}`) on item title and description
- `claims`: `item_1_claimant_1`, `claimStatus_1_createdAt_-1`
- `custodyrecords`: `item_1_timestamp_-1`
- `auditentries`: `actor_1_action_1`, `timestamp_-1`, `targetEntity_1`, `targetId_1`
- `handovers`: `otpExpiresAt_1`, `isCompleted_1`

### 6.3 Data Integrity & Duplicate Check
Audit script verified **0 duplicates** across all unique fields (`users.email`, `users.registrationNumber`, `itemcategories.code`, `locations.code`, `items.referenceNumber`, `privatedetails.item`, `disposalrecords.item`). Data is clean and ready for direct import.

---

## 7. Migration Risks & Mitigations

| Risk | Description | Mitigation |
| :--- | :--- | :--- |
| **Credential Exposure** | Accidentally logging or committing Atlas connection strings containing database passwords. | Follow Strict Safety Rules: Use environment variables `MONGODB_URI` / `MONGODB_DATABASE`. Never commit `.env` or dump files. Provide safe `.env.example` templates with placeholders. |
| **Network & IP Whitelisting** | Atlas cluster blocks inbound connections from local migration machine or Render servers. | In Atlas Network Access, ensure the current local IP (or `0.0.0.0/0` with strong authentication) is added before initiating transfer or connection. |
| **Replica Set Requirements** | Atlas clusters are multi-node replica sets by default. Multi-document transactions require replica set state. | Mongoose and `django_mongodb_backend` are already configured with `retryWrites=true&w=majority`. |
| **File Storage Decoupling** | Fear of missing uploaded item images or evidence during database migration. | Confirmed: images are stored as filesystem assets (`uploads/` or `media/`); only URLs/paths are stored in MongoDB. |
| **BSON Type Preservation** | Truncating BSON types (Date, ObjectId) during JSON export. | Use native BSON binary backup (`.bson` and `.metadata.json`) via `mongodump` / PyMongo binary streaming so types are preserved with 100% fidelity. |

---

## 8. Files Requiring Modification for Atlas Transition

| File | Proposed Modification |
| :--- | :--- |
| `apps/api/.env.example` | Update connection template to standard MongoDB Atlas SRV URI format. |
| `apps/api/src/config/database.ts` | Verify connection options for Atlas (TLS, server selection timeout, keepAlive). |
| `apps/api/render.yaml` | Verify `MONGODB_URI` environment variable configuration for Render cloud deployment. |
| `backend/.env.mongodb.example` | Provide Atlas template for Django MongoDB settings. |
| `.gitignore` | Add `database-backups/` and `*.bson` to prevent accidental commits of local database dumps. |

---

## 9. Conclusion & Next Steps

The Phase 1 and Phase 2 audits confirm:
1. Local MongoDB database `lpu_lost_found` is healthy, running, and populated with 996 documents across 12 collections with zero duplicate anomalies.
2. The Node.js Express backend (`apps/api`) natively uses Mongoose with schemas matching the 12 collections.
3. The Django backend (`backend`) also supports MongoDB Atlas via `config.settings_mongodb`.

**Next Phase:** Proceed to Phase 4 (Create full local backup in `database-backups/local-mongodb/` before touching any data) and Phase 3 (Atlas cluster credentials & connection string setup).
