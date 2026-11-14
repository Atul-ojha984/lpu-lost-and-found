# MongoDB Atlas Migration Execution Tracker

**Repository:** `Atul-ojha984/lpu-lost-and-found`
**Target branch:** `migration/mongodb-atlas`
**Main baseline:** `d2d2187857b7584412efa4dfb43b0dc50347efd5`
**Production import/cutover/deployment approval:** Not granted.

## Current phase

**Phase 8 - Deployment preparation: IN PROGRESS.** Phase 5's importer is implemented but source PostgreSQL integration remains BLOCKED; Phases 6 and 7 are locally VERIFIED. No production import, deployment, or cutover has occurred.

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 - Repository initialization | COMPLETED | Audited repository/branch and preserved user changes; tracker committed. |
| 1 - Complete codebase audit | COMPLETED | Compatibility report committed as `c36fa5f`; baseline checks/tests recorded. |
| 2 - MongoDB database architecture | COMPLETED | Proposed reference-first document mapping and candidate indexes documented; Atlas-generated indexes and runtime behavior remain unverified. |
| 3 - Critical business logic redesign | VERIFIED | Backend-aware transactions, workflow mutexes, conflict retry, and Mongo call-site refactors pass real local replica-set integration and full application Mongo tests. Commit: `dad6edb`. Atlas staging and operation-specific concurrency stress remain release gates. |
| 4 - Backend database migration | COMPLETED | Opt-in Mongo settings, ObjectId contrib migration graph, domain snapshots, required schema adaptations, and pinned backend locally migrate and pass the application suite. PostgreSQL remains default; Atlas is not configured. |
| 5 - PostgreSQL-to-MongoDB data migration tool | BLOCKED | Importer implemented and focused tests pass. Actual PostgreSQL source, copy, resume, and reconciliation integration remains unverified; isolated PostgreSQL source and Atlas access are unavailable. |
| 6 - Automated testing | VERIFIED | Full local Mongo and SQLite backend suites, frontend unit/type/lint/build checks pass; exact results in `MONGODB_ATLAS_TEST_REPORT.md`. Atlas and PostgreSQL-source tests remain external gates. |
| 7 - Frontend/API regression | VERIFIED | Shared API client uses `NEXT_PUBLIC_API_URL`, preserves `/api/v1`, handles Bearer refresh/errors, and does not fall back to localhost outside development. Frontend checks/build and backend API suite pass; live production browser/API integration was not run. |
| 8 - Deployment preparation | IN PROGRESS | Prepare written Render/Vercel/Atlas instructions only. No service configuration, environment values, deployment, or paid infrastructure changes. |
| 9 - Rollback and recovery | NOT STARTED | Must address writes made after any future cutover. |
| 10 - Final production readiness review | NOT STARTED | Production cutover remains disabled pending explicit approval. |

## Phase 0 - Completed tasks

- Confirmed repository root: `C:/Users/kumar/Downloads/lpu-lost-and-found-main/lpu-lost-and-found-main`.
- Confirmed `main` was at `d2d2187857b7584412efa4dfb43b0dc50347efd5`; migration work is on `migration/mongodb-atlas`.
- Created the target branch at the unchanged main baseline; no remote migration branch existed at initialization.
- Reviewed the monorepo: active Next.js frontend at `apps/web`, active Django backend at `backend`, and legacy Express/Mongoose service at `apps/api`.
- Confirmed requested historical planning files were absent: root `MONGODB_ATLAS_MIGRATION_PLAN.md` and `docs/atlas-migration-implementation-audit.md`.
- Reviewed the nearest migration plan and existing Mongo-to-PostgreSQL report; they concern the reverse migration and are not implementation of PostgreSQL-to-Atlas.
- Recorded earlier legacy Mongo import risks (broken source references, unverified historical AES key, and separate media inventory). No import was run.
- Preserved all pre-existing uncommitted changes and did not include them in migration commits.
- Commit: `8db7bd0 chore: initialize MongoDB migration execution tracker`.

## Phase 1 - Completed codebase audit

### Completed tasks

- Inspected active Django settings, app/model metadata, model relationships, serializers, views, service functions, permissions, auth/JWT paths, URL routes, migrations, middleware/signals, management commands, and tests.
- Inspected Next.js app routes, central API client, API base URL, token storage/refresh behavior, and role-specific student/security/admin pages.
- Verified the existing app currently uses PostgreSQL in production and SQLite locally/tests; production settings reject non-PostgreSQL databases.
- Verified that most domain models use UUID IDs, while Django contrib auth/admin/session models use AutoField/BigAutoField identifiers.
- Counted 35 `select_for_update()` references, 29 `transaction.atomic` references, 7 `prefetch_related()` references, and 48 `select_related()` references in active backend app code.
- Identified database-level PostgreSQL audit triggers, partial/functional uniqueness rules, JSON-field queries, joins/aggregates, filesystem media/evidence, and HTTP-polled notifications.
- Checked version-specific official Django MongoDB Backend v5.2 limitations and compatibility references.
- Produced `docs/MONGODB_ATLAS_COMPATIBILITY_REPORT.md` with source-to-feature mapping, required actions, risks, and workflow-specific findings.
- No Django, frontend, migration, database, API, production, or legacy `apps/api` code was changed.

### Files created or modified

- Created `docs/MONGODB_ATLAS_COMPATIBILITY_REPORT.md`.
- Updated this execution tracker.
- Phase 0 and Phase 1 documentation commits are recorded below.

### Tests and validation

| Command | Result |
|---|---|
| `backend/.venv/Scripts/python.exe manage.py check` | PASS - no issues (0 silenced). |
| `backend/.venv/Scripts/python.exe manage.py makemigrations --check --dry-run` | PASS - no changes detected. |
| `backend/.venv/Scripts/python.exe -m pytest` | PASS - 170 passed, 1 skipped in 160.15s. |
| `npm run test:web` | PASS - 11 passed, 0 failed. |
| MongoDB backend/Atlas connectivity/integration | NOT RUN - `django-mongodb-backend` and an isolated MongoDB replica set are not configured in this environment. |

### Commit

- `c36fa5f docs: complete MongoDB compatibility audit`

### Known issues and risks

- `select_for_update()` is unsupported by the target backend and guards high-risk business transitions.
- Django native `transaction.atomic()` is unsupported; the backend's transaction API has no nested savepoints and needs a replica set or sharded cluster.
- `prefetch_related()` is unsupported; current code has seven usages.
- Django contrib AutoField/BigAutoField models need a Mongo-compatible migration strategy.
- PostgreSQL audit immutability trigger cannot be carried over; replacement is not yet verified.
- Exact support for current functional/conditional unique constraints must be verified on the pinned backend and Atlas.
- `ForeignKey` joins, JSON queries, DRF, django-filter, analytics aggregates, migration operations, and notification commit callbacks require integration testing.
- Item photographs/private evidence are stored on local filesystem paths; a database migration does not move file bytes. Durable storage must be separately selected and tested.
- No MongoDB backend package or Atlas URI is configured locally; no live Mongo test was possible.
- Phase 1 confirms a current security issue relevant to cutover design: `Claim.handover_otp` stores active OTP plaintext while encrypted companion fields also exist. Phase 3 must define a tested encrypted read/verification path and prevent plaintext exposure before importing active OTP state.
- Existing worktree changes listed below remain uncommitted user work and were not edited or staged.

## Phase 2 - MongoDB database architecture

### Completed tasks

- Defined one-collection-per-concrete-model and reference-first persistence for domain records; kept workflow/history records separate and bounded JSON/list values with their existing parent.
- Documented UUID preservation for domain models and the required ObjectId-based strategy for Django framework models that use AutoField/BigAutoField.
- Mapped all current domain models, framework auth/content-type/group/permission data, session policy, relationship load order, file-storage handling, and reconciliation gates.
- Proposed model/query-driven indexes, explicitly marking partial and conditional uniqueness as unverified until Atlas index creation and concurrent write tests pass.
- Recorded replica-set requirements, transaction boundaries, audit-log least-privilege requirement, and the prohibition on production cutover/import without approval.
- Flagged the current plaintext active OTP field and required a compatible encrypted path as a Phase 3 security gate.
- No application code, database, migration, API, frontend, Render service, or production data was changed.

### Files created or modified

- Created `docs/MONGODB_ATLAS_ARCHITECTURE.md`.
- Created `docs/MONGODB_ATLAS_DATA_MAPPING.md`.
- Created `docs/MONGODB_ATLAS_INDEX_STRATEGY.md`.
- Updated this execution tracker.

### Tests and validation

| Command | Result |
|---|---|
| `backend/.venv/Scripts/python.exe manage.py check` (run from `backend/`) | PASS - no issues (0 silenced). |
| `backend/.venv/Scripts/python.exe manage.py makemigrations --check --dry-run` (run from `backend/`) | PASS - no model changes detected. |
| `backend/.venv/Scripts/python.exe -m pytest` (run from `backend/`) | PASS - 170 passed, 1 skipped in 159.17s. An initial invocation from repository root failed collection because pytest did not load backend settings; rerun from `backend/` succeeded. |
| `npm run test:web` | PASS - 11 passed, 0 failed. |
| MongoDB Atlas index creation/explain/concurrency validation | NOT RUN in Atlas; local replica-set validation was performed in Phase 3/4. |

### Known issues and risks

- All conditional/functional uniqueness candidates require exact backend migration and Atlas verification; candidate indexes are not proof of enforcement.
- `Claim.handover_otp` currently contains plaintext OTP material. It is not to be logged or exported in reports; a compatible encrypted operational path must be proven before migration.
- Mapping collection names and framework ObjectId migration behavior require Phase 4 verification with the pinned backend.
- Phase 3 must prove concurrency semantics using a real isolated MongoDB replica set before migration implementation can claim the required safety guarantees.

### Commit

- `3fa1615 docs: define MongoDB Atlas architecture and data mapping`.

## Existing uncommitted user changes preserved

- `PROJECT_PROGRESS.md`
- `backend/apps/core/management/commands/import_mongo_data.py`
- `backend/requirements.txt`
- `backend/tests/test_mongo_import.py`
- `MONGODB_TO_POSTGRESQL_MIGRATION_REPORT.md`
- `backend/apps/accounts/management/commands/provision_initial_admin.py`
- `backend/tests/test_bootstrap_admin_command.py`

These were present before this migration implementation and must not be discarded. The migration implementation only made compatibility edits needed for the configured Mongo test path; later commits must stage only intentional task files and preserve the rest of each file's existing content.

## Architectural decisions

- Keep the Next.js frontend and Django API active; do not switch to Express.
- Do not modify `apps/api`.
- Use only the official Django MongoDB Backend 5.2 release line compatible with Django 5.2.
- Keep PostgreSQL as an available migration source and rollback reference.
- Preserve existing UUID domain identifiers and API string formats where feasible.
- Do not change the production database default, import production data, deploy, or cut over traffic without separate explicit approval.
- A setting-only engine swap is unsafe; critical concurrency and append-only guarantees require the implemented workflow coordination, then Atlas staging tests before any cutover.

## Phase 3 - Critical business logic redesign

### Completed tasks

- Added `WorkflowMutex` records and shared item, user, custody, and administrator aggregate scopes. Existing PostgreSQL paths continue to use Django transactions/row locks.
- Added a transaction facade for PostgreSQL and the official Mongo transaction API, including explicit rollback and safe abort behavior when nested Mongo atomic blocks fail and their exceptions are caught by callers.
- Added bounded retries for labeled transient Mongo transaction errors only. Unknown commit outcomes are not replayed.
- Refactored claim, direct recovery, OTP/handover, locker/custody, reporting quota/expiry, disposal, matching, notifications, and administrator-sensitive operations to use common workflow scopes and reread state in their transaction.
- Kept the existing public API and frontend workflows. No UI files were modified.
- Added real replica-set tests for transaction commit, rollback, `on_commit`, nested-failure abort, and competing transactions on shared scopes.

### Tests and results

| Validation | Result |
|---|---|
| Mongo transaction primitive suite on local replica set | PASS - 5 tests, including a real two-thread Mongo transaction conflict/retry. |
| Full backend suite under `config.settings_mongodb`, Python 3.12.14, Django 5.2.19, backend 5.2.4 | PASS - 176 passed, 1 PostgreSQL-only row-lock test skipped. |
| Full default SQLite regression suite under Python 3.12.14 | PASS - 171 passed, 6 backend-specific tests skipped. |

### Limits

- Full endpoint workflow tests run against MongoDB; simultaneous endpoint stress is currently represented by the real shared-scope concurrency test plus API-level workflow coverage. Run explicit per-endpoint race tests on isolated Atlas staging before production cutover.
- The current local replica set is disposable local infrastructure. No Atlas or production data was used.

### Commit

- `dad6edb refactor: implement Mongo-safe workflow coordination`.

## Phase 4 - Backend database migration

### Completed tasks

- Added pinned Django MongoDB Backend 5.2.4 and constrained Django to the matching 5.2 minor line.
- Added opt-in `config.settings_mongodb`; PostgreSQL remains the default and production setting. Mongo settings require environment-supplied URI/database and reject localhost in production mode.
- Added Mongo-specific app configs for Django admin/auth/contenttypes using `ObjectIdAutoField`, plus isolated migration modules for contrib and domain apps. Domain UUID IDs remain UUIDs.
- Replaced the functional custody-location lower-case uniqueness constraint with a normalized `name_key`; the relational migration checks for collisions and preserves existing records.
- Removed redundant duplicate field indexes and kept the existing query indexes/unique fields.
- Preserved existing API shapes; implemented the exact lookup/write changes required for Mongo-compatible claim search and notification idempotency.
- Added docs at `docs/MONGODB_ATLAS_BACKEND_IMPLEMENTATION.md`.

### Tests and results

| Validation | Result |
|---|---|
| Mongo-configured Django system check | PASS - 0 issues. |
| Mongo `makemigrations --check --dry-run` | PASS - no model drift. |
| Fresh Mongo schema migration | PASS - all contrib and domain migrations applied to disposable local database `lpu_phase4_migrate02`. |
| Full Mongo backend suite | PASS - 176 passed, 1 PostgreSQL row-lock-only skip. |
| Full default SQLite suite | PASS - 171 passed, 6 expected backend-specific skips. |
| Frontend unit/contract suite | PASS - 11 passed. |
| Frontend TypeScript | PASS. |
| Frontend ESLint | PASS with one existing `react-hooks/set-state-in-effect` warning at `apps/web/src/app/login/page.tsx:37`; no errors. |
| Frontend production build | PASS - Next.js generated all 27 pages/routes. |

### Risks and limits

- Mongo migrations/indexes and workflows have not yet been applied or verified on Atlas. No Atlas URI or Atlas staging access was used.
- PostgreSQL remains source of truth; migration import, reconciliation, Atlas index checks, media/evidence storage, deployment, and rollback are still pending.
- Do not select `config.settings_mongodb` for Render or production before later phases and explicit approval.

### Commit

- `f7610c8 feat: configure opt-in Django MongoDB backend`.

## Phase 5 - PostgreSQL-to-MongoDB data migration tool

### Implemented

- Added `migrate_postgres_to_mongodb`, a separate command that does not replace or modify the prior MongoDB-to-PostgreSQL importer.
- Dry-run is read-only by default; validation-only compares row fingerprints and collection counts; import is explicit, additive, idempotent, per-batch transactional, and resumable through an atomically written checkpoint.
- Uses the PostgreSQL migration history to build source-side model state, maps UUID IDs directly and SQL auto IDs deterministically to Mongo ObjectIds, resolves Django content types/permissions/groups by natural keys, and checks foreign references before dependent inserts.
- Reads the PostgreSQL side from one repeatable-read, read-only snapshot. Each Mongo batch commits separately; partial imports are retained and resumed, never cleared.
- Endpoint fingerprints in the checkpoint are hashes. Credentials and row contents are not written to reports. Sensitive audit metadata is sanitized, and bulk inserts avoid firing notification/audit post-save signals.
- Session documents and transient workflow mutexes are intentionally excluded. Media/evidence bytes are not copied by this command.
- Production-labelled endpoints require the explicit production guard; remote endpoints require environment classification. No import was executed.
- Added `docs/MONGODB_ATLAS_DATA_MIGRATION_GUIDE.md`.

### Files added or modified for Phase 5

- Added `backend/apps/core/management/commands/migrate_postgres_to_mongodb.py`.
- Added `backend/tests/test_postgres_to_mongodb_migration.py`.
- Added `docs/MONGODB_ATLAS_DATA_MIGRATION_GUIDE.md`.
- Updated this tracker and `docs/MONGODB_ATLAS_DATA_MAPPING.md`.

### Verification

| Validation | Result |
|---|---|
| Python 3.12 `py_compile` for importer and tests | PASS. |
| Mongo-configured `manage.py check` | PASS - 0 issues. |
| Importer command help/argument registration | PASS. |
| `tests/test_postgres_to_mongodb_migration.py` on disposable local Mongo replica set | PASS - 10 passed. Includes model graph/field mapping, ObjectId determinism, UUID preservation, audit redaction/no signal side effects, checkpoint atomicity, required source URL, and remote/production guard checks. |
| Mongo `makemigrations --check --dry-run` | PASS - no changes detected. |
| `git diff --check` | PASS; only Git line-ending notices for unrelated pre-existing files. |
| PostgreSQL-source connection, import/resume, target reconciliation | BLOCKED - no isolated PostgreSQL source is installed/configured. |
| Atlas schema/index/transaction validation | BLOCKED - no Atlas staging URI/access. |

### Known risks and next action

- A real source-to-target rehearsal is still required before this tool can be marked VERIFIED. Run it on an isolated PostgreSQL copy and dedicated Atlas staging database, then validate every retained model and related workflow.
- The source snapshot is held for the full run; long imports may retain PostgreSQL MVCC history, so operational duration must be monitored.
- Active claim approval OTP remains in the legacy plaintext `Claim.handover_otp` field in the current application model. The importer never logs it, but encryption-path compatibility and a separately reviewed handling policy remain cutover security gates.
- Reconciliation expects the destination model collections to contain exactly the corresponding source records; independent destination rows must be reviewed, not silently merged.

## Phase 6 - Automated testing

### Verification completed

- Full backend Mongo settings suite on the dedicated local replica set: **186 passed, 1 skipped**. The one skip explicitly requires PostgreSQL row-lock semantics.
- Full default SQLite suite: **181 passed, 6 skipped**. The skips are the PostgreSQL row-lock case and five Mongo transaction tests requiring the Mongo settings.
- Focused importer/custody-order tests after final test updates: **11 passed** under Mongo settings and **11 passed** under SQLite.
- Frontend unit/contract checks: **11 passed**; TypeScript passed; ESLint passed with one pre-existing React effect warning in `apps/web/src/app/login/page.tsx:37`; Next.js production build passed and emitted all 27 routes.
- Mongo settings `manage.py check`: 0 issues; `makemigrations --check --dry-run`: no changes detected.
- The initial SQLite run exposed two test portability assumptions and a timestamp-tie race in an existing test. The focused rerun and complete SQLite rerun both passed after correction. The application workflow and UI were not changed for this test-only fix.
- Created `docs/MONGODB_ATLAS_TEST_REPORT.md` with pass/fail/skip/not-tested separation and external gates.

### Files added or modified for Phase 6

- Added `docs/MONGODB_ATLAS_TEST_REPORT.md`.
- Updated `backend/tests/test_postgres_to_mongodb_migration.py` so environment-guard coverage works under both database settings.
- Updated `backend/tests/test_model_constraints.py` to make the custody timeline test deterministic across timestamp precision differences.
- Updated this tracker.

### Limits

- PostgreSQL-specific locking test remains skipped on non-PostgreSQL backends; it has not been run against a live PostgreSQL source in this environment.
- Atlas-specific integration, production browser/API checks, migration reconciliation, and cutover are not tested.
- Phase 5 remains blocked at the actual cross-database source integration gate.

### Commit

- `f78f313 test: add MongoDB migration verification report`.

## Phase 7 - Frontend/API regression

### Verification completed

- Reviewed the active Next.js API client at `apps/web/src/lib/api-client.ts`. It keeps the existing Django `/api/v1` route structure, consumes `NEXT_PUBLIC_API_URL`, only uses `http://localhost:8000/api/v1` when `NODE_ENV` is development, preserves Bearer access-token handling and refresh behavior, includes cookies for existing session support, and returns a clear configuration error when the production API variable is missing.
- The current frontend API client, pages, role dashboards, and response contracts were not changed for the migration.
- Frontend contract/unit checks: **11 passed**. TypeScript passed. ESLint passed with one pre-existing warning at the login page. Next production build passed and enumerated all 27 application routes.
- The complete backend Mongo suite passed **186 tests**, and the default SQLite suite passed **181 tests**, providing local endpoint/serializer/authentication/permission coverage against the unchanged `/api/v1` contract.
- No localhost fallback is used in a non-development production build. The local `.env.local` file was not read or printed.

### Limits

- This is local source/build and backend API regression verification. No live Vercel-to-Render request, production login, browser session, or file upload was performed.
- The production API and frontend environment must be configured separately in Vercel/Render; environment changes are not made here.

### Commit

- Phase 7 verification record is pending review and commit.

## Current outstanding work and next action

Prepare Phase 8 Render/Vercel/Atlas deployment documentation only. Do not modify service configuration, environment variables, production database settings, or traffic until staging verification and explicit approval.
