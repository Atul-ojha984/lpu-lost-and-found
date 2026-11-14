# MongoDB to Render PostgreSQL Migration Preparation

**Inspection date:** 2026-11-09  
**Status:** PREPARED, NOT IMPORTED  
**Production writes:** None  
**MongoDB source writes:** None

## Findings

The current Django backend does not use MongoDB as its ORM database. Its active models, migrations, and API are Django ORM based. The repository also contains a legacy Express/Mongoose service under `apps/api/`; its `database.ts` and Mongoose models correspond to the local MongoDB database `lpu_lost_found`. The locally available records therefore match the legacy Mongoose application, not direct writes by Django.

The local MongoDB server at `mongodb://127.0.0.1:27017` was reachable. Inspection used collection listing, counts, and read-only `find` operations. No MongoDB documents were changed. Render PostgreSQL was also inspected through read-only SQL; the application tables exist and the mapped data tables currently have zero rows. No production rows were created, updated, or deleted.

### Local MongoDB inventory

Other databases present were `admin`, `config`, `last_mile_delivery`, `lastmile`, and `local`. The LPU application database is `lpu_lost_found`:

| Collection | Documents | Main record / references |
|---|---:|---|
| `users` | 49 | account identifiers, role, active status, password hash |
| `items` | 71 | lost/found reports, reporter, category, location, status, image URLs |
| `itemcategories` | 24 | category code and retention settings |
| `locations` | 25 | campus location and security-desk metadata |
| `privatedetails` | 26 | encrypted identifying details and access history |
| `verificationchallenges` | 42 | item-linked questions and bcrypt answer hashes |
| `claims` | 32 | item, claimant, review status, evidence references, encrypted OTP fields, embedded challenge answers |
| `matchsuggestions` | 219 | lost-item/found-item matching data |
| `custodyrecords` | 18 | item custody movements and handler |
| `handovers` | 19 | claim/item/recipient, OTP hash metadata, ID/handover fields |
| `disposalrecords` | 15 | item disposal and approving officer |
| `auditentries` | 456 | actor, action, target, timestamp, metadata |

Observed user role counts: `STUDENT_STAFF` 23, `SECURITY_PERSONNEL` 21, `CAMPUS_ADMIN` 4, `SYSTEM_ADMIN` 1. All 49 stored password hashes use a bcrypt `$2a$` prefix. Item records include LOST 17 and FOUND 54. Claims include 3 `COMPLETED`; handovers include 3 completed and 16 pending. These counts are inventory only; no record values or credential hashes are included here.

The source collection fields are consistent with the schemas in `apps/api/src/models/`. Photo fields are URL strings; no GridFS collection was found. Any underlying image/document bytes stored by an external provider need a separate storage inventory and copy plan.

## Source-to-target mapping

| Mongo collection | Django target | Transformations / constraints |
|---|---|---|
| `itemcategories` | `apps.items.ItemCategory` | `code` is the natural key; same-code seeded rows can be reused with the explicit reference option. Existing destination configuration is preserved. |
| `locations` | `apps.locations.Location` | `code` is the natural key; same-code seeded rows can be reused with the explicit reference option. |
| `users` | `apps.accounts.User` | `registrationNumber` → `registration_number`; `email` is normalized lowercase; legacy role is preserved; student/staff ambiguity maps to `UserType.UNSPECIFIED`; Django admin flags are not inferred. Unique email/registration collisions stop the run. |
| `items` | `apps.items.Item` | Mongo item/category/location/reporter references become Django FKs; image URLs remain URLs; `lockerStorageReference` remains legacy text because no source locker IDs or locker collection exist. |
| `privatedetails` | `apps.verification.PrivateDetail` | Item and optional user references become FKs; AES-256-GCM data is decrypted in memory with the legacy source key and re-encrypted with the current Django key. |
| `verificationchallenges` | `apps.verification.VerificationChallenge` | Item FK and bcrypt answer hash are preserved; unresolved item references block import. |
| `claims` | `apps.claims.Claim` and `ClaimChallengeAnswer` | Claim/item/claimant/reviewer references are resolved; embedded challenge answers become rows; encrypted OTP fields are re-encrypted. Legacy plaintext OTP field is never imported. |
| `matchsuggestions` | `apps.matching.MatchSuggestion` | Lost/found item references become FKs; no arbitrary fallback match is created. |
| `custodyrecords` | `apps.custody.CustodyRecord` | Item and handler references become FKs; legacy location/locker snapshots are retained as text. |
| `handovers` | `apps.handovers.Handover` | Claim/item/recipient/officer references become FKs; OTP hash and handover details are preserved without importing plaintext OTP. Missing claim/item references block import. |
| `disposalrecords` | `apps.disposal.DisposalRecord` | Item and approving officer references become FKs. |
| `auditentries` | `apps.audit.AuditEntry` | Actor/action/target/timestamp map to audit fields; known sensitive metadata keys are redacted; historical notification signals are suppressed. |

Mongo `_id` values are not copied into UUID columns. The importer derives stable UUIDv5 IDs from source database, collection, and Mongo `_id`, so repeat imports are idempotent. Source dates are parsed as timezone-aware values. No separate collection exists for `DirectRecovery`, `Locker`, `CustodyLocation`, or `Notification`; the source item locker reference is text only and cannot safely populate current locker/location relations.

## PostgreSQL inspection

Render database `lpu_lost_and_found` is PostgreSQL 18. The expected Django tables and migrations exist, including users, items, categories, locations, claims, challenge answers, matching, private details, verification challenges, custody, handovers, disposal, and audit. Read-only counts were zero for the mapped application tables at inspection time. No migration was applied during this task.

The current local development SQLite database is not a safe stand-in for production: it contains seeded categories and user data. The importer correctly stops on an existing unique user identity rather than merging accounts. It can reuse same-code category/location rows only when requested; differences are preserved as target configuration and reported.

## Import blockers discovered

The local source database has broken references. The importer now performs a preflight and fails before opening its write transaction if a reference cannot resolve. Read-only inspection found:

- 22 `verificationchallenges.item` references to missing `items` rows.
- 189 `matchsuggestions.lostItem` references and 43 `matchsuggestions.foundItem` references to missing `items` rows (232 broken references across 219 suggestions).
- 16 handovers with a missing `claim` reference and 16 with a missing `item` reference; those are the 16 pending handovers.
- 286 unresolved relationship references total across those fields.

These rows must be reconciled against source backups/audit provenance or explicitly dispositioned by the data owner before a complete import can pass. The importer does not drop them, invent parent rows, or convert them to unrelated records. The production PostgreSQL currently has no rows, so this conflict is isolated to source integrity and the populated local development database.

Encrypted private details and claim OTP ciphertext require the actual historical `MONGO_FIELD_ENCRYPTION_KEY`. The legacy source code contains a default, but `apps/api/.env` is absent and an environment override at the time of data creation cannot be ruled out. The Django local key differs. The live dry run stops at referential-integrity preflight before decryption, so compatibility with the true historical key is **not yet verified**. Do not put the key in Git, this report, command output, or the frontend.

## Password compatibility

The 49 source password hashes are bcrypt `$2a$`, not plaintext. Django's importer wraps raw bcrypt using the legacy bcrypt-compatible format supported by the existing Django login compatibility code. A regression test imports a source-format hash, successfully authenticates through the API, and verifies the password upgrades to the preferred Django hasher after successful login. Unknown and plaintext-looking formats are rejected. Legacy claim OTP plaintext is ignored; only an encrypted OTP payload can be migrated.

This test validates code compatibility using isolated fixtures; it does not prove that any particular source account's password is known or valid.

## Prepared importer and usage

Created/updated `backend/apps/core/management/commands/import_mongo_data.py`. It supports MongoDB read-only source access or a directory of Extended JSON exports; requires all 12 collection files for exports; detects duplicate source keys; resolves relationships; uses stable IDs; wraps all writes in a Django transaction; rolls back by default; reports counts; sanitizes sensitive audit metadata; and suppresses historical notification replay.

Example read-only dry run against a live local MongoDB source (set secrets only in the process environment):

```powershell
# Provide MONGO_FIELD_ENCRYPTION_KEY to this process through a secure environment secret.
python manage.py import_mongo_data --mongo-uri 'mongodb://127.0.0.1:27017' --database lpu_lost_found --dry-run --reuse-existing-references
```

The dry run currently exits before mapping because of the 286 broken source references. After those source records are repaired or dispositioned and the source key is verified, re-run dry run against an isolated/staging PostgreSQL copy. Only after explicit approval should the destination write command be used:

```powershell
python manage.py import_mongo_data --input-dir '<complete-extended-json-export>' --import
```

PostgreSQL destination writes require both `--allow-production` and `--confirm-production "MIGRATE LPU_LOST_FOUND"` when production is configured. Those flags are intentionally absent from this preparation. Use a backup and a maintenance window before any approved production import.

## Files changed and verification

- `backend/apps/core/management/commands/import_mongo_data.py`
- `backend/requirements.txt` (`pymongo>=4.8.0,<5.0.0`)
- `backend/tests/test_mongo_import.py`
- `MONGODB_TO_POSTGRESQL_MIGRATION_REPORT.md`
- `PROJECT_PROGRESS.md`

The importer tests cover Extended JSON, all mappings, rollback, idempotency, bcrypt login/upgrade, encrypted-field re-encryption, OTP plaintext exclusion, audit redaction, reference reuse/conflict behavior, relationship preflight, missing source keys, incomplete exports, and PostgreSQL write guards. See `PROJECT_PROGRESS.md` for the final test run status.

## Operational risks

- No production data was imported.
- Source referential-integrity remediation is required before a complete import.
- The historical AES key must be verified before migrating encrypted fields.
- Image/document bytes may require an independent storage migration.
- Render metadata showed the current free PostgreSQL instance has an expiry date of 2026-12-09 and a broad IP allowlist (`0.0.0.0/0`). Review plan continuity and restrict network access before relying on production data migration.
