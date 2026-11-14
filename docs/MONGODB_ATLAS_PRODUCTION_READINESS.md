# MongoDB Atlas Migration - Production Readiness Review

**Review date:** 2026-11-14

**Branch:** `migration/mongodb-atlas`

**Decision:** **BLOCKED for Atlas staging sign-off and production cutover. Ready for local development testing only.**
**Production database / traffic:** PostgreSQL remains the source of truth. No production import, settings switch, deployment, or traffic cutover was performed.

This review distinguishes local test evidence from provider/database integration evidence. The local Mongo replica-set suite is valuable implementation validation, but it is not proof that the user's Atlas cluster, Render networking, Vercel environment, production records, or provider backups work.

## Readiness matrix

| Area | Status | Evidence and remaining action |
|---|---|---|
| Active architecture | VERIFIED | Next.js 16/React 19 in `apps/web`, Django 5.2/DRF in `backend`, current Render PostgreSQL deployment, and legacy Express code in `apps/api`. The legacy API was not changed. |
| MongoDB backend version/settings | PASSED locally | Official Django MongoDB Backend 5.2.4 with Django 5.2.19 was exercised on Python 3.12.14. `config.settings_mongodb` is opt-in; `config.settings` remains PostgreSQL and fails closed without its required production `DATABASE_URL`. |
| Fresh Mongo schema/migrations | PASSED locally | Phase 4 records a clean migration of the Mongo-specific graph on a disposable local replica set and no migration drift. The latest settings change passed the standard-settings migration drift check using local SQLite. A current Mongo `makemigrations --check` attempt was blocked because no local `rs0` primary was listening. |
| Model/API compatibility | PASSED locally; Atlas NOT TESTED | Full Mongo suite covered model, serializer, API, authentication, permissions, and `/api/v1` contracts. Actual Atlas-generated indexes, query plans, null semantics, and aggregation performance remain unverified. |
| Authentication/authorization | PASSED locally; production data NOT TESTED | Local full-suite role/auth tests passed; JWT signing and password hashers remain in the existing Django architecture. No production user/table query or live role-specific login was performed in this migration work. Imported user/group/permission reconciliation remains part of the blocked source/target rehearsal. |
| Claims and recovery workflows | PASSED locally; Atlas NOT TESTED | Local Mongo suite covers claim submission/review and lifecycle behavior. Competing transaction primitives passed on a real local replica set. Atlas-specific endpoint race tests are not run. |
| OTP and handover | BLOCKED for cutover | Local individual workflow tests pass, but `Claim.handover_otp` remains a plaintext field and the claimant serializer can read it. A reviewed encrypted-only storage/read/verification path, compatibility strategy for active OTPs, and tests must precede data import/cutover. Never include OTP values in migration output. |
| Custody and locker consistency | PASSED locally; Atlas NOT TESTED | Local Mongo suite and shared custody mutex tests cover moves and occupancy. Atlas index creation and simultaneous operation-level contention remain release gates. |
| Disposal and administrator protections | PASSED locally; Atlas NOT TESTED | Local API/workflow tests cover authorization, state transitions, and serialized administrator changes. Atlas conflict/index behavior remains unverified. |
| Audit immutability | BLOCKED for cutover | Model/manager-level append-only checks are present and Mongo app tests pass. The PostgreSQL PL/pgSQL update/delete trigger does not migrate to MongoDB. A least-privilege Atlas runtime role and effective protection against direct update/delete must be designed and tested; application checks alone are not database-level immutability. |
| PostgreSQL-to-Atlas migration | BLOCKED | The importer is dry-run-first, additive, resumable, and has unit/focused tests, but there is no isolated PostgreSQL source or Atlas target for actual rows, restart/resume, relationship checks, or reconciliation. No data was imported. |
| File and private evidence storage | BLOCKED | Importer copies references only. Current Render `/tmp/media` and `/tmp/private_evidence` are ephemeral. Select durable storage, preserve private evidence authorization, copy bytes, checksum, and test access before staging acceptance. |
| Frontend compatibility | PASSED locally; deployed integration NOT TESTED | Frontend uses the existing `NEXT_PUBLIC_API_URL` and `/api/v1` contract. Unit tests, TypeScript, lint (one existing warning), and Next.js build passed. No live Vercel Preview → Mongo-backed Render request or browser workflow ran. |
| Render/Vercel/Atlas deployment | NOT TESTED | Phase 8 documentation is committed, but no staging service, Atlas cluster, environment value, or deployment was created or changed. Keep current production services untouched. |
| Backup and restore | NOT TESTED | Atlas backup policy, point-in-time restore, PostgreSQL recovery point, and restore drill were not accessed or exercised. |
| Rollback | BLOCKED after Mongo writes | The pre-write PostgreSQL rollback is planned but not rehearsed. Once Mongo accepts writes absent from PostgreSQL, switching back is unsafe. There is no verified reverse importer, CDC, or dual-write path. Fix-forward or implement and rehearse reverse reconciliation first. |
| Production cutover | BLOCKED / NOT AUTHORIZED | Requires explicit approval and completion of every critical gate above. |

## Workflow verification summary

| Workflow | Local evidence | Atlas/production evidence |
|---|---|---|
| User login, JWT, role authorization | Full Mongo and SQLite backend suite passed in Phase 6. | Live production/Mongo-backed login: NOT TESTED. User migration/import: BLOCKED. |
| Lost/found reports, search, quota, expiry | Full Mongo application suite passed locally. | Atlas indexes/query performance: NOT TESTED. |
| Claim submit/review | Full Mongo application suite passed locally. | Atlas unique-index and concurrent claim endpoint tests: NOT TESTED. |
| OTP approval/verification and handover | Local workflow coverage passed. | Plaintext active-OTP exposure remains a security blocker; Atlas concurrency not tested. |
| Inventory, lockers, custody movements | Local workflow and shared-scope concurrency coverage passed. | Atlas index and endpoint contention tests: NOT TESTED. |
| Disposal and audit/notifications | Local suite passed. | Atlas audit collection permissions and trigger replacement: BLOCKED. |
| Public/private uploads | Local API/model tests are part of application suite. | Durable file migration/checksum/private storage on Render/Atlas staging: NOT TESTED. |
| Frontend dashboard and API contracts | 11 frontend tests, typecheck, lint, production build, and backend contract suites passed locally. | Live browser, auth persistence, file upload, and Vercel Preview integration: NOT TESTED. |

## Evidence reviewed

- `docs/MONGODB_ATLAS_COMPATIBILITY_REPORT.md`
- `docs/MONGODB_ATLAS_ARCHITECTURE.md`
- `docs/MONGODB_ATLAS_DATA_MAPPING.md`
- `docs/MONGODB_ATLAS_INDEX_STRATEGY.md`
- `docs/MONGODB_ATLAS_CONCURRENCY_DESIGN.md`
- `docs/MONGODB_ATLAS_BACKEND_IMPLEMENTATION.md`
- `docs/MONGODB_ATLAS_DATA_MIGRATION_GUIDE.md`
- `docs/MONGODB_ATLAS_TEST_REPORT.md`
- `docs/MONGODB_ATLAS_DEPLOYMENT_GUIDE.md`
- `docs/MONGODB_ATLAS_ROLLBACK_PLAN.md`
- The current Django settings, custom user, claim/OTP serializer and services, audit model/migration, custody workflow, migration importer, Render Blueprint, Vercel config/API client, and test files.

## Production readiness gates

Do not enable Atlas production traffic until all of these are complete:

1. Provide an isolated PostgreSQL copy and an Atlas staging replica set; run importer dry-run, explicit import rehearsal, resume, and full reconciliation.
2. Resolve plaintext active-OTP exposure and define whether active OTPs are invalidated/regenerated or securely migrated; retain expiry, recipient binding, and one-time use.
3. Verify all model/index constraints and full workflow/concurrency tests against the actual Atlas staging tier.
4. Replace PostgreSQL-trigger audit immutability with a tested least-privilege Atlas data-access design.
5. Select and test durable storage for public images and private evidence, including checksums and authorization.
6. Deploy a separate Render staging service and Vercel Preview configuration; test login, role boundaries, uploads, claims, direct/normal OTP handovers, Recovery History, and admin/security operations end to end.
7. Configure Atlas backup/monitoring and perform a restore drill.
8. Implement/rehearse a write-freeze and post-write recovery strategy. The current one-way importer cannot safely reconcile Mongo-only writes back to PostgreSQL.
9. Complete a formal go/no-go review and obtain explicit approval before production data import, environment changes, deployment, or routing changes.

## Test totals and known issues

The detailed test report records:

- Backend Mongo suite: **186 passed, 1 skipped**.
- Backend SQLite regression suite: **181 passed, 6 skipped**.
- Focused PostgreSQL→Mongo importer/custody-order tests: **11 passed on each settings path**.
- Frontend unit/contract tests: **11 passed**.
- TypeScript: **passed**.
- ESLint: **passed with one pre-existing warning** at `apps/web/src/app/login/page.tsx:37`.
- Next.js production build: **passed**, 27 routes.
- Atlas, actual PostgreSQL-source migration, live frontend/API integration, uploads on durable storage, and restore/rollback drills: **not tested or blocked** as listed above.

The deployment settings regression added in Phase 8 passed **2 tests**. Default and Mongo settings checks passed. The current local Mongo schema drift command could not connect because the configured local replica set had no primary; Phase 4's earlier local replica migration/drift evidence remains valid but does not replace Atlas testing.

## Final recommendation

**Ready for local development testing. Not ready for staging sign-off or production cutover.** Current PostgreSQL remains the production database. Preserve this state until the external staging and security gates above are completed and a separate production change is explicitly approved.
