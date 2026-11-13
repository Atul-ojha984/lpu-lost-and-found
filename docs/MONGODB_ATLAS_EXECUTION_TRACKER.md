# MongoDB Atlas Migration Execution Tracker

**Repository:** `Atul-ojha984/lpu-lost-and-found`
**Target branch:** `migration/mongodb-atlas`
**Main baseline:** `d2d2187857b7584412efa4dfb43b0dc50347efd5`
**Production import/cutover/deployment approval:** Not granted.

## Current phase

**Phase 3 - Critical business logic redesign: NOT STARTED**

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 - Repository initialization | COMPLETED | Audited repository/branch and preserved user changes; tracker committed. |
| 1 - Complete codebase audit | COMPLETED | Compatibility report committed as `c36fa5f`; baseline checks/tests recorded. |
| 2 - MongoDB database architecture | COMPLETED | Proposed reference-first document mapping and candidate indexes documented; Atlas-generated indexes and runtime behavior remain unverified. |
| 3 - Critical business logic redesign | NOT STARTED | Must replace row locks while proving claim, OTP, handover, locker, custody and admin guarantees. |
| 4 - Backend database migration | NOT STARTED | No Mongo engine configuration or application-code changes made. |
| 5 - PostgreSQL-to-MongoDB data migration tool | NOT STARTED | Imports must remain explicit and guarded; production data must remain unchanged. |
| 6 - Automated testing | NOT STARTED | Requires isolated MongoDB replica-set integration/concurrency environment. |
| 7 - Frontend/API regression | NOT STARTED | Preserve `/api/v1` contracts and current UI. |
| 8 - Deployment preparation | NOT STARTED | No Render/Vercel service or environment changes made. |
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
| MongoDB Atlas index creation/explain/concurrency validation | NOT RUN - no isolated MongoDB replica set or Atlas connection configured. |

### Known issues and risks

- All conditional/functional uniqueness candidates require exact backend migration and Atlas verification; candidate indexes are not proof of enforcement.
- `Claim.handover_otp` currently contains plaintext OTP material. It is not to be logged or exported in reports; a compatible encrypted operational path must be proven before migration.
- Mapping collection names and framework ObjectId migration behavior require Phase 4 verification with the pinned backend.
- Phase 3 must prove concurrency semantics using a real isolated MongoDB replica set before migration implementation can claim the required safety guarantees.

### Commit

- Pending final review and commit for Phase 2.

## Existing uncommitted user changes preserved

- `PROJECT_PROGRESS.md`
- `backend/apps/core/management/commands/import_mongo_data.py`
- `backend/requirements.txt`
- `backend/tests/test_mongo_import.py`
- `MONGODB_TO_POSTGRESQL_MIGRATION_REPORT.md`
- `backend/apps/accounts/management/commands/provision_initial_admin.py`
- `backend/tests/test_bootstrap_admin_command.py`

These include prior Mongo-to-PostgreSQL work and initial-admin provisioning work. They must not be mistaken for PostgreSQL-to-MongoDB migration implementation.

## Architectural decisions

- Keep the Next.js frontend and Django API active; do not switch to Express.
- Do not modify `apps/api`.
- Use only the official Django MongoDB Backend 5.2 release line compatible with Django 5.2.
- Keep PostgreSQL as an available migration source and rollback reference.
- Preserve existing UUID domain identifiers and API string formats where feasible.
- Do not change the production database default, import production data, deploy, or cut over traffic without separate explicit approval.
- A setting-only engine swap is unsafe; critical concurrency and append-only guarantees require redesign and real Atlas tests first.

## Next action

Start Phase 3: redesign and test Mongo-safe claim, OTP, handover, locker, custody, disposal, and administrator concurrency guarantees before changing the database backend.
