# MongoDB Atlas Compatibility Audit

**Audit phase:** Phase 1 — complete codebase audit
**Audited branch:** `migration/mongodb-atlas`
**Result:** Audit completed; the application is not ready for a database-engine switch. Critical workflow redesign and backend integration gates remain.

## Scope and verified starting state

- Active frontend: `apps/web/`, Next.js 16.4.2, React 19.3.0, TypeScript.
- Active API/backend: `backend/`, Django 5.2.18 and Django REST Framework, `/api/v1`.
- Current backend database configuration is PostgreSQL in production (`DATABASE_URL`) and SQLite for local/test use. Production settings explicitly reject a non-PostgreSQL engine.
- The official `django-mongodb-backend` package is not installed in the current virtual environment. No MongoDB backend configuration is active.
- Legacy Express/Mongoose code is in `apps/api/`; it is not the active Next.js API and was not modified.
- The audit used source inspection, Django model metadata initialized without querying an application database, endpoint/consumer searches, and official Django MongoDB Backend v5.2 documentation. It did not connect to Render PostgreSQL or Atlas, alter either database, or import data.
- The worktree contains pre-existing, uncommitted user changes in `PROJECT_PROGRESS.md`, Mongo-to-PostgreSQL import files, and the initial-admin command/tests. They remain untouched and are listed in the execution tracker.

## Application inventory

### Django apps and domain models

The active domain apps are `accounts`, `items`, `locations`, `matching`, `claims`, `verification`, `custody`, `handovers`, `disposal`, `analytics`, `audit`, and `core`. They define 17 domain models:

| Domain | Models and key links |
|---|---|
| Accounts | `User` uses a UUID primary key, unique registration number and email, role/user-type fields, `PermissionsMixin`, and Django groups/permission relations. |
| Reports | `ItemCategory`, `Item`, `Location`; an item references category, campus location, and reporting user. Item images are URL/string fields and an image list JSON field. |
| Matching | `MatchSuggestion` references lost and found `Item` rows and has a unique lost/found pair. |
| Claims | `Claim` references item, claimant, and reviewer; `ClaimChallengeAnswer` references claim and verification challenge. An active-claim partial uniqueness rule prevents duplicate active claims for the same claimant/item. |
| Verification | `PrivateDetail` is one-to-one with an item; `VerificationChallenge` references an item. Private details are application-encrypted ciphertext/IV/tag fields. |
| Custody | `CustodyLocation`, `Locker`, `CustodyRecord`; a locker references a location and has a one-to-one current item; custody history retains movement snapshots and operator references. |
| Handovers | `Handover` references item, claim, recipient and supervising officer; `DirectRecovery` references item, recipient, intake custody record and officers. Both preserve OTP and completion state. |
| Disposal | `DisposalRecord` is one-to-one with an item and records its approving administrator. |
| Audit/notifications | `AuditEntry` references the actor and stores action/target/metadata; `Notification` references a recipient and source audit entry. |

The domain models predominantly use UUID primary keys. Django built-in `admin.LogEntry`, `auth.Permission`, `auth.Group`, `contenttypes.ContentType`, and database sessions use implicit `AutoField` primary keys (the project sets `DEFAULT_AUTO_FIELD = BigAutoField`). Those built-in fields are a migration blocker because the MongoDB backend does not support `AutoField`, `BigAutoField`, or `SmallAutoField`.

### Django APIs and workflows

`backend/config/urls.py` mounts health/root/docs and these `/api/v1` areas: authentication; categories and campus locations; item reporting, public board, report lifecycle, uploads, private verification and matches; claims and evidence; custody locations, lockers, inventory and movement history; normal and direct handovers, OTP verification, slips and recovery history; notifications; security dashboard/audit views; and admin analytics, user, inventory, disposal and audit functions.

The security-sensitive paths use role permissions and object ownership checks. Authentication uses a custom UUID `accounts.User`; login accepts registration number/email aliases while `USERNAME_FIELD` remains email; account creation uses `create_user()`/Django password hashing; a compatibility verifier handles imported bcrypt hashes; JWTs are created by SimpleJWT, with cookie/header authentication and refresh/version checks. This audit found no need to change the frontend/API contract for the database migration.

### Frontend inventory

The Next.js App Router includes public landing, login/register, board, report, item detail; student dashboard, reports, claims, recovery history and profile; security dashboard, claims, custody, handovers, history and profile; and admin dashboard, analytics, audit, claims, items, locations, officers, settings and users.

`apps/web/src/lib/api-client.ts` centralizes `/api/v1` requests, uses `NEXT_PUBLIC_API_URL`, normalizes responses, refreshes JWTs and applies authorization headers. The frontend stores token values in browser local storage while the backend also issues an HttpOnly auth cookie. Its existing API consumer surface includes all of the workflows listed above; this audit did not change frontend code. Notifications are persisted and fetched through HTTP polling; no Django Channels, Celery, or Redis application integration was found in the active backend configuration.

### Data, migrations, and storage

- The domain uses UUIDs, foreign keys/one-to-one links, inherited auth many-to-many relations, JSON fields, timestamps, ordinary and compound indexes, and unique constraints.
- Unique constraints identified include unique match pairs, active claims per claimant/item, case-insensitive custody-location names (`UniqueConstraint(Lower("name"))`), one handover per claim, completed handover per item, active/completed direct recovery per item, and one notification per recipient/audit entry. Several are conditionally unique.
- Data migrations backfill user types, custody locations/lockers, OTP-generated timestamps, and audit descriptions. The audit migration also issues PostgreSQL PL/pgSQL to install update/delete triggers for append-only protection.
- No Django `FileField`/`ImageField`, PostgreSQL full-text search, `pg_trgm`, PostgreSQL array field, or runtime raw-SQL query was found. Item photographs are stored as filesystem WebP files and item URL strings; private evidence is written beneath `PRIVATE_EVIDENCE_ROOT` and referenced by URL/path metadata. A database copy alone will not move those bytes. The current Render configuration uses `/tmp` paths, which are ephemeral unless separately backed by persistent storage. Atlas GridFS is not an available solution through the v5.2 backend.
- Runtime search primarily uses ordinary filters and string pattern lookups; admin analytics also use joins, `.values()`, `Count`, filtered aggregates, and JSON metadata lookup. These paths need API-level parity and performance tests.

## MongoDB compatibility matrix

Compatibility below is based on the official backend v5.2 documentation and the implementation present in this checkout. “Supported” does not mean this project’s specific query shape has passed integration tests.

| Feature | Existing implementation | MongoDB compatibility | Required action | Risk |
|---|---|---|---|---|
| Engine/configuration | PostgreSQL parser in `config/settings.py`; production rejects any engine except PostgreSQL | Not configured; current production settings will fail closed for MongoDB | Add a separately selectable Atlas settings path and preserve PostgreSQL source config; do not switch production default before gates | Critical |
| Django contrib primary keys | Admin/auth/contenttypes/session use `AutoField`/`BigAutoField` | Unsupported by v5.2 | Configure `ObjectIdAutoField` or the version-appropriate Mongo contrib migration strategy; preserve domain UUIDs and test auth/admin/session migrations | High |
| Domain UUID identifiers | UUID PKs on all 17 domain models; API serializes them as strings | `UUIDField` is supported | Preserve UUID values and verify FK/JWT/URL serialization against the backend | Medium |
| ForeignKey/OneToOne | Extensive cross-model references, including claims, item ownership, lockers, custody, handovers and audit | Partially supported; joins use `$lookup` and can be slower; `CASCADE` across collections is less performant | Retain references where audit/ownership semantics require them; selectively embed immutable snapshots only after access-pattern review; validate delete behavior and API query plans | High |
| Many-to-many/auth permissions | `PermissionsMixin` supplies groups and user-permission M2M relations | Django authentication is supported, but actual auth M2M/migration behavior needs Mongo integration verification | Exercise groups, permissions, admin login and permission checks on replica-set test DB | High |
| `select_for_update()` | 35 references; used in claim decisions, OTP generation/verification, handovers, locker assignment/movement, admin account safety and report limits | Unsupported | Replace row locks with single-document conditional updates/version checks, unique indexes, and narrowly scoped Mongo transactions with retry handling; prove races with real MongoDB | Critical |
| `transaction.atomic()` | 29 references across claims, items, custody, handovers, OTP, admin, seed/import utilities | Django’s native transaction API is unsupported; the backend supplies a custom API. Mongo transactions require replica set/sharded deployment; nested atomic blocks have no savepoints | Inventory transaction boundaries and nesting; introduce a backend transaction adapter and explicitly structure outermost transactions; use Atlas replica-set integration tests | Critical |
| `prefetch_related()` | 7 uses in claims, direct recovery, custody serializers and location views | Unsupported | Replace with explicit bounded/batched queries or an appropriate embedded read model; ensure query count and access-scope parity | High |
| `select_related()` | 48 uses across related report, claim, audit, custody and handover reads | Foreign-key joins are available through `$lookup`, with documented performance limitations | Benchmark current list/detail queues; reduce hot-path joins or embed stable display snapshots where safe | High |
| Unique constraints/indexes | Field uniqueness, compound uniqueness, conditional constraints and a functional `Lower(name)` uniqueness rule | Single/compound/partial/unique indexes are documented; v5.2 docs do not document this exact functional `Lower()` constraint or guarantee each conditional constraint shape | Test generated indexes against Atlas; normalize the name into a uniquely indexed value if expression constraint support is not available; preserve partial active-state guarantees | High |
| JSONField | Item image arrays, claim evidence URLs, match explanations, direct-recovery verification metadata, audit metadata; analytics filters metadata subkeys | Partially supported; JSON-vs-SQL null and some nested `Q` lookups have caveats | Test every nested lookup/update and missing/null distinction; avoid relying on ambiguous null queries | High |
| Query/aggregation | Search/filter/pagination, `Count`, filtered aggregates, joins, `.values()`, ordering and `distinct()` | Standard query API is broad but aggregation support is partial; `$expr` and `$lookup` can be slow | Add integration tests for each actual ORM query and measure API latency with representative data and indexes | High |
| String search | `icontains`, exact and prefix filters across item/category/location/locker names | Pattern lookups are supported on string fields; no current trigram/full-text PostgreSQL implementation found | Create Mongo indexes appropriate to exact filters; if Mongo Search is selected, retain existing response order/filter behavior and test availability/index readiness | Medium |
| PostgreSQL audit trigger | Migration 0006 creates PL/pgSQL trigger preventing audit updates/deletes; model manager also rejects ordinary queryset mutation | PostgreSQL trigger cannot run on MongoDB; backend v5.2 does not provide a database-trigger substitute | Preserve append-only checks in application; design least-privilege roles/collection write paths and test all mutation routes. Do not claim database-level immutability until a replacement is verified | Critical |
| Data migrations | `RunPython` backfills plus vendor-specific cursor SQL in audit migration | DDL transactions are unsupported; `RunPython`/schema behavior and custom operations need backend verification | Review and adapt each migration; separate schema/index creation from idempotent backfills; test fresh DB and upgrade paths on Mongo | High |
| Raw database access | No raw query in ordinary request handlers; audit migration and pre-existing uncommitted admin command use cursors/SQL; legacy Mongo importer uses PyMongo as source | Django `.raw()` is unsupported; backend exposes raw Mongo client/aggregation instead | Keep importer distinct; replace PostgreSQL advisory-lock SQL in the uncommitted bootstrap command before using it against Mongo | High |
| Files and evidence | Filesystem writes under media/private-evidence roots; DB stores references | Backend v5.2 does not support GridFS | Choose durable external object storage or persistent disk, migrate file bytes separately, preserve private authorization and URL contracts | High |
| DRF and filtering | DRF serializers/APIViews plus `django-filter`, pagination, SearchFilter and OrderingFilter | MongoDB lists Django REST Framework and `django-filter` support as partial | Run all API contract/permission/filter/pagination tests on Mongo; patch only demonstrated incompatibilities | High |
| Audit/notification delivery | Signals schedule notification work with `transaction.on_commit()`; notifications use persisted audit/user relations and polling | Mongo transaction callback behavior must be validated; no Channels/Celery dependency detected | Verify callbacks only run after commit and are not lost/duplicated on retry; preserve recipient scoping | High |
| Operational migrations/fixtures | Django migration runner and custom ORM commands; legacy importer directly reads source MongoDB | v5.2 does not support `dumpdata`, `loaddata`, or `inspectdb`; index migrations are partially supported | Use the project’s explicit migration utility for PG→Mongo; do not rely on fixture round-trips; validate index migrations on the pinned backend | Medium |

## Critical workflows identified for Phase 3

1. **Claims:** `claims/services.py` and `claims/views.py` lock item/claim rows around submission, review, verification and transitions. The existing database uniqueness constraint is important but cannot alone serialize every state transition. Replace locks with a conditional item/claim version/state update and retry/conflict handling, plus a verified unique constraint.
2. **OTP/handover:** normal and direct paths in `handovers/otp_services.py`, `handovers/views.py`, and `handovers/direct_recovery.py` lock records and make multi-record updates to OTP state, item state, locker, custody history, handover/recovery, and audit. Require one atomic outcome and duplicate-submit prevention under concurrent requests.
3. **Locker/custody:** `custody/views.py` locks locations, lockers and items while checking active occupancy and writing history. Use uniqueness/conditional updates to guarantee one item per locker and one locker per item, then transaction/retry for movement history consistency.
4. **Admin/user safety:** `analytics/views.py` locks the active super-admin set to protect the last administrator. Must replace this with a concurrency-safe design; ordinary request checks are insufficient.
5. **Notifications:** `audit/signals.py` uses commit callbacks. Ensure notification dispatch is tied to committed state and idempotent if transaction retries occur.

No business logic was changed during Phase 1. The exact query and race test plan belongs in Phase 3; real MongoDB concurrency evidence requires an isolated MongoDB replica set and cannot be established using SQLite or mocks.

## Official version-specific references

- [Django MongoDB Backend v5.2 compatibility limitations](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/limitations-upcoming/)
- [Django MongoDB Backend v5.2 transaction API](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/interact-data/transactions/)
- [Django MongoDB Backend v5.2 model fields and UUID support](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/model-data/models/)
- [Django MongoDB Backend v5.2 indexes](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/model-data/indexes/)
- [Django MongoDB Backend compatibility matrix](https://www.mongodb.com/docs/drivers/compatibility/?driver-language=python&python-driver-framework=django)
- [Django MongoDB Backend v5.2 release notes](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/reference/release-notes/)

The official compatibility matrix pairs backend major/minor 5.2 with Django 5.2; the v5.2 documentation reports Python compatibility through 3.14 and MongoDB Server 6.0–9.0. The current local interpreter is Python 3.14.6, so the version line is compatible on paper; the backend package is not installed here and no live MongoDB connection has been tested.

## Phase 1 conclusion and next gate

The migration is technically possible only with material backend refactoring and integration testing. A `DATABASES` change alone is unsafe. The top blockers are row-lock removal/replacement, use of the custom Mongo transaction API, unsupported `prefetch_related`, contrib AutoField migrations, PostgreSQL audit trigger replacement, conditional/functional uniqueness verification, and durable media/evidence storage.

**Next action:** design collections, reference/embedding boundaries, ID policy, index map and read models in Phase 2. Do not change the active database default, run production migration/import, deploy, or cut over traffic.
