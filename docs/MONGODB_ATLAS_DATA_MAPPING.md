# PostgreSQL to MongoDB Atlas Data Mapping

**Status:** Proposed mapping for the active Django schema; requires source/destination integration verification before import.
**Source:** Current Django/PostgreSQL schema.
**Target:** One collection per concrete Django model in MongoDB Atlas.

## Mapping rules

1. Preserve each domain UUID primary key as the target document identifier. Preserve its Python UUID/BSON representation consistently; the importer must test equality/lookups before data loading.
2. Store Django relations as UUID references to the target collection. Every reference must resolve before a dependent document is committed. MongoDB references are not database-enforced foreign keys.
3. Preserve enum/status strings exactly, including case. Do not infer or recompute statuses during migration.
4. Preserve password hash strings exactly. Never export or import plaintext passwords. Existing Django/bcrypt compatibility remains handled by the authentication code.
5. Store datetimes as BSON Date (millisecond precision). Preserve timezone-aware UTC instants; record the expected microsecond truncation in the reconciliation report and always use a deterministic ID tie-breaker for time ordering.
6. Preserve JSON values as BSON arrays/objects without converting missing, empty, and null values into each other. Validate nested JSON queries separately because backend v5.2 has documented null/query caveats.
7. Preserve encrypted vault/OTP ciphertext, IV, auth tag, and password hashes exactly. Do not log their values or expose them in the migration summary.
8. File bytes are outside the database migration. Migrate public images and private evidence separately to durable storage, verify checksums and permissions, and then validate every referenced path/URL.
9. Do not import until the source and destination are explicitly configured; dry-run and validation-only must not write to the destination.

## Domain collection map

Collection names below follow the current Django `app_model` table-name convention. Confirm the actual Mongo collection names produced by the pinned backend in Phase 4 before using them in a production importer.

| PostgreSQL model/table | Mongo collection | Identifier and references | Transform/preservation rules |
|---|---|---|---|
| `accounts.User` / `accounts_user` | `accounts_user` | Preserve `id` UUID. No user ID is regenerated. | Preserve normalized email/registration number, role, user type, active/staff/superuser flags, token version, department/security post, timestamps, and encoded password hash. Never change roles or activate accounts as an import side effect. |
| `items.ItemCategory` / `items_itemcategory` | `items_itemcategory` | Preserve UUID `id`; unique `code`. | Preserve active state, retention days and timestamps. Validate category codes before importing item references. |
| `locations.Location` / `locations_location` | `locations_location` | Preserve UUID `id`; unique `code`. | Preserve campus zone, building, desk/contact data, active state and timestamps. |
| `items.Item` / `items_item` | `items_item` | Preserve UUID `id`; references `category_id`, `location_id`, `reported_by_id`. | Preserve reference number, type/status, description, private/public separation, event/retention timestamps, archive state, locker/custody display values and image URL strings. `additional_images` stays a bounded string array. Validate all 3 references and associated media files. |
| `matching.MatchSuggestion` / `matching_matchsuggestion` | `matching_matchsuggestion` | Preserve UUID `id`; references `lost_item_id`, `found_item_id`, optional `reviewed_by_id`. | Preserve score/confidence/status/timestamps and JSON `explanation`. Require a unique lost/found pair and validate item types/IDs. |
| `verification.PrivateDetail` / `verification_privatedetail` | `verification_privatedetail` | Preserve UUID `id`; unique reference `item_id`; optional `last_decrypted_by_id`. | Copy ciphertext, IV, auth tag, summary, access count and timestamps exactly. Never decrypt during export/import or log values. |
| `verification.VerificationChallenge` / `verification_verificationchallenge` | `verification_verificationchallenge` | Preserve UUID `id`; reference `item_id`. | Preserve question, hashed answer, hint, retry limit, expiration, active state and timestamps. Do not export plaintext answers. |
| `claims.Claim` / `claims_claim` | `claims_claim` | Preserve UUID `id`; references `item_id`, `claimant_id`, optional `reviewed_by_id`. | Preserve status, statement, review data, evidence URL array, OTP hashes/ciphertext, attempts and timestamps. **The current model also stores an active OTP in the plaintext `handover_otp` field and exposes it through a serializer.** Treat this as a cutover security blocker: Phase 3 must define and test a compatible encrypted-OTP read path (the model has cipher/IV/tag fields) before deciding how active OTP records are transferred. Never print or expose OTP material in migration logs/reports. Validate all foreign references and active-claim uniqueness. |
| `claims.ClaimChallengeAnswer` / `claims_claimchallengeanswer` | `claims_claimchallengeanswer` | Preserve UUID `id`; references `claim_id`, `challenge_id`. | Preserve provided answer only in restricted storage, correctness/result and timestamp. No answer may enter public docs, audit text, or import logs. |
| `custody.CustodyLocation` / `custody_custodylocation` | `custody_custodylocation` | Preserve UUID `id`; optional `created_by_id` and `updated_by_id`. | Preserve code/name/description/active state and actor/timestamps. Add a canonical lowercase comparison key for the existing case-insensitive name uniqueness if Mongo cannot enforce the current `Lower(name)` expression directly. |
| `custody.Locker` / `custody_locker` | `custody_locker` | Preserve UUID `id`; reference `custody_location_id`, optional unique `current_item_id`, optional `updated_by_id`. | Preserve locker number, legacy location label, active state and timestamps. Enforce single occupancy and one locker per item with verified unique/partial indexes and conditional updates. |
| `custody.CustodyRecord` / `custody_custodyrecord` | `custody_custodyrecord` | Preserve UUID `id`; references `item_id`, `handled_by_id`. | Append-only movement record. Preserve `from_location`, `to_location`, current/previous locker snapshot, evidence reference, remarks and timestamp; do not recalculate old location labels from mutable current records. |
| `handovers.Handover` / `handovers_handover` | `handovers_handover` | Preserve UUID `id`; references `item_id`, `claim_id`, `recipient_id`, `supervising_officer_id`. | Preserve OTP hash/expiry/attempt state, masked ID details, physical desk, acknowledgement, completion flag/time and URLs. Never migrate plaintext OTPs or present an incomplete record as completed. Include the locker/location snapshot from immediately before release after Phase 3 defines the final fields. |
| `handovers.DirectRecovery` / `handovers_directrecovery` | `handovers_directrecovery` | Preserve UUID `id`; references `item_id`, `recipient_id`, unique intake `custody_record_id`, `intake_officer_id`, optional reviewer/completer IDs. | Preserve direct-recovery status, evidence/verification arrays and notes, OTP cipher/hash/expiry/attempts, masked ID, handover details, and completion data. Keep this distinct from claim-based recovery; do not fabricate claims or found reports. |
| `disposal.DisposalRecord` / `disposal_disposalrecord` | `disposal_disposalrecord` | Preserve UUID `id`; one-to-one `item_id`; reference `approved_by_id`. | Preserve method, committee notes, reason, organization, disposal date, certificate/evidence references and timestamps. Retain item and audit history. |
| `audit.AuditEntry` / `audit_auditentry` | `audit_auditentry` | Preserve UUID `id`; optional `actor_id`. | Preserve actor role/name snapshots, action, target type/id, description, IP/user agent and sanitized JSON metadata. Keep append-only. Do not include secrets, tokens, OTP plaintext, or private answers. |
| `audit.Notification` / `audit_notification` | `audit_notification` | Preserve UUID `id`; references `recipient_id` and optional `source_audit_entry_id`. | Preserve audience, event type, message, target path, created/read timestamps and the existing recipient/source uniqueness guarantee. Verify recipient scoping. |

## Django framework models

The custom domain user is UUID-based, but Django contrib framework models and implicit M2M through models currently rely on AutoField/BigAutoField. The MongoDB Backend v5.2 does not support those field types; use the officially supported `ObjectIdAutoField` strategy and Mongo-compatible contrib migrations for the Mongo target.

| Framework model/data | Target policy | Migration notes |
|---|---|---|
| `auth.Group` | Preserve group names and permissions; ObjectId primary key in target. | Map references by unique group name, not old integer PK. |
| `auth.Permission` | Recreate/map by `(content_type app_label, model, codename)`. | Permission IDs are internal; verify codename and object-level permission behavior after migration. |
| `contenttypes.ContentType` | Recreate/map by `(app_label, model)`. | Do not carry old integer PK as an ObjectId; resolve all group/user permission relations by natural key. |
| `admin.LogEntry` | Preserve only if Django admin history is in operational scope; otherwise retain/export separately with documented policy. | It references content type and user. Migrate after both references are mapped. It is not the application's append-only `AuditEntry`. |
| `django_session` | Do not assume sessions can be copied. Plan controlled session invalidation at cutover unless session values are explicitly migrated and verified. | JWT sessions and Django admin sessions have separate behavior; user account records and tokens must not be copied from a live browser. |
| Automatic M2M junctions | Recreate using Mongo backend-supported generated identifiers/relationships. | Resolve users/groups/permissions through natural keys and test both `groups` and `user_permissions`; no role escalation. |
| `django_migrations` / migration state | Use backend-specific migration modules/state. | MongoDB does not support all standard SQL migration assumptions; do not rely on `dumpdata`, `loaddata`, or `inspectdb` for this transfer. |

## Source-to-target relationship load order

1. Django framework `ContentType`, `Permission`, and `Group` mapping, plus domain `User`, `ItemCategory`, `Location`, and `CustodyLocation`.
2. `Item`, then `PrivateDetail` and `VerificationChallenge`.
3. `MatchSuggestion`, `Claim`, and `Locker`.
4. `ClaimChallengeAnswer` and `CustodyRecord`.
5. Normal `Handover`, `DirectRecovery`, and `DisposalRecord`.
6. `AuditEntry`, `Notification`, framework `LogEntry`, and optional retained operational sessions after all target references resolve.
7. Auth group/user/permission M2M relations after natural-key mapping is confirmed.

The final loader must compute actual source FK relationships rather than relying solely on this conceptual order. It must support cycles through two-phase inserts only where needed: first insert a record without deferred references, then set validated references in a controlled second pass.

## Reconciliation rules

For every collection/model, record source count, target count, rejected count, duplicate count and unresolved-reference count. A successful validation requires:

- Every retained source primary key maps to exactly one target document.
- Every required FK/O2O reference resolves to the expected UUID.
- All existing uniqueness invariants hold, including case-insensitive location names, active claim uniqueness, locker/item occupancy and completed handover uniqueness.
- Status, actor, recipient, timestamps and audit target data match the source.
- Ciphertext/hash strings match exactly without disclosure; media byte checksums match their source files.
- No import is considered complete if any rejected/unresolved record remains unexplained and explicitly waived by a reviewed policy.

## Known limitations and explicit non-mappings

- This mapping does not import legacy MongoDB Compass records. That older path is a separate Mongo-to-PostgreSQL dataset and has its own unresolved-reference/encryption-key risks.
- This mapping does not include database credentials, actual user secrets, private URLs, OTP values or password data in reports.
- No data was imported and no source/production database was modified.
- A file path/URL is metadata, not proof the file bytes have moved or remain accessible.

## Official references

- [Django MongoDB Backend v5.2 model relationships](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/model-data/relationships/)
- [Django MongoDB Backend v5.2 model fields](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/model-data/models/)
- [Django MongoDB Backend v5.2 feature limitations](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/limitations-upcoming/)
