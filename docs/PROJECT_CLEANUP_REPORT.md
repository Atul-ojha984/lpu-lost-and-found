# Project Cleanup and Production Readiness Report

**Date:** 2026-11-14

**Branch:** `migration/mongodb-atlas`
**Status:** Partially completed; MongoDB Atlas production readiness remains blocked.

## Scope and starting state

This supplemental work was performed on the existing Next.js/Django repository as part of the MongoDB Atlas migration. The active frontend is `apps/web`; the active API is `backend`; `apps/api` is a legacy Express/Mongoose workspace and was left untouched. PostgreSQL remains the production database. No database import, production service change, deployment, or traffic switch was performed.

The working tree already contained user changes in `PROJECT_PROGRESS.md`, the Mongo import command and tests, and `MONGODB_TO_POSTGRESQL_MIGRATION_REPORT.md`. Those files were preserved and are not part of the cleanup change set.

## Confirmed issues corrected

### Dashboard API failures represented as real empty data

Student, administrator, and security overview pages previously rendered zero statistics or empty recent activity after one or more API requests failed. They now retain the distinction between loaded values and unavailable values, display an error state, and only show a genuine zero/empty result after a successful response. Existing APIs, authorization, routes, and dashboard layout styling were preserved.

The Admin retention queue also contained three hardcoded example property records used when its API failed, along with fabricated counts and default campus/custody labels. These records were removed. The queue now shows an error/retry state and unavailable counts instead of invented inventory. Admin user management and analytics now distinguish an API failure from a successfully loaded empty list or zero-valued metric.

### Profile pages contained seeded or unsupported controls

Student and security profile pages contained example identities and/or activity counts and presented controls that had no persistence contract. They now load identity from the authenticated profile API, show report/recovery counts from existing endpoints where available, and persist only the supported contact-phone update. Unsupported editable name, notification preference, and station-extension controls were removed; the existing security role and backend permissions are unchanged. The phone UI uses the existing Indian-mobile normalizer and reports failed saves instead of showing a false success.

### Development account management was not production guarded

`create_dev_accounts` could be invoked in production even though it exists to create local development accounts. It now refuses when `IS_PRODUCTION` is enabled. A test covers the guard. No account was created or modified.

### Unused generated branding files

The generated `lpu-logo.png` and its generator were confirmed unused by active code; the shared component uses the application's own `lost-and-found-logo.svg`. The generated university-style image and generator were removed. The README and asset documentation now identify the actual application logo. No logo placement or page design was changed.

## Files modified or removed

Modified:

- `README.md`
- `apps/web/public/images/README.md`
- `apps/web/src/app/admin/page.tsx`
- `apps/web/src/app/admin/analytics/page.tsx`
- `apps/web/src/app/admin/items/page.tsx`
- `apps/web/src/app/admin/users/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/dashboard/profile/page.tsx`
- `apps/web/src/app/security/page.tsx`
- `apps/web/src/app/security/profile/page.tsx`
- `backend/apps/accounts/management/commands/create_dev_accounts.py`
- `backend/tests/test_deployment_security.py`
- `docs/cleanup-report.md` (marked historical and superseded)
- `scripts/frontend-unit-test.mjs`
- `docs/MONGODB_ATLAS_EXECUTION_TRACKER.md`

Added:

- `docs/PROJECT_CLEANUP_REPORT.md`

Removed after reference checks:

- `apps/web/public/images/lpu-logo.png`
- `scripts/generate-logo.js`

No dependencies, model fields, migrations, API endpoints, routes, authentication rules, or database configuration were changed.

## Files retained and rationale

- Django migrations remain intact because they define the existing schema and migration graph.
- Root and frontend lockfiles remain because the root is an npm workspace monorepo and the frontend can also be deployed from `apps/web`.
- `scripts/check-nesting.js` remains as a useful manual audit utility despite no package-script reference.
- Development seed commands and fixtures remain for local/test use; account creation is production-guarded and demo seeding already has a production guard.
- The application-owned SVG and PNG logo assets remain; only the unused generated university-style substitute was removed.
- Legacy `apps/api` remains unchanged under the existing migration boundary.

## Findings not changed

- `npm audit` reports seven moderate advisories in the frontend development lint toolchain and one high-severity Mongoose advisory in the legacy Express workspace. The web production dependency audit reports zero vulnerabilities. A non-mutating npm remediation preview proposed an ESLint 10/toolchain change with peer override warnings, so it was not applied. The `apps/api` Mongoose issue is recorded for separate maintenance because this migration's boundary keeps that service untouched.
- No committed live secrets were identified in the scanned tracked environment/configuration paths. The only tracked `.env*` files are sanitized examples; credential-like values were limited to test/example/documentation fixtures. No secret values were printed.
- `docs/cleanup-report.md` contained old verification statements and a prior date. It is explicitly historical; use this report and the migration tracker for current status.
- The repository's architecture is already separated into frontend/backend apps and shared service modules. No broad restructure was justified by this focused audit; a rewrite would add regression risk without evidence of a specific defect.

## Verification results

| Validation | Result |
|---|---|
| `npm run test:web` | PASS - 17 passed, 0 failed. |
| `npm run typecheck:web` | PASS. |
| `npm run lint` | PASS - zero errors; one pre-existing login-page hook warning remains at `apps/web/src/app/login/page.tsx:37`. |
| `npm run build:web` | PASS - Next.js 16.4.2 production build, all 27 routes generated. |
| Focused Django tests: deployment security and auth | PASS - 26 tests. |
| Full Django pytest suite with local SQLite | PASS - 184 passed, 6 skipped. No production database was used. |
| `manage.py check` | PASS. |
| `manage.py makemigrations --check --dry-run` | PASS - no migration drift. |
| `pip check` | PASS - no broken requirements. |
| `git diff --check` | PASS. |
| `npm audit` | FINDINGS as noted above; no unsafe or force upgrade applied. |
| MongoDB Atlas persistence/concurrency or production workflows | NOT VERIFIED in this cleanup run. Atlas readiness remains blocked in the migration tracker. |
| Browser screenshot comparison and desktop/tablet/mobile checks | NOT RUN. Source styling was not changed. |
| Render/Vercel deploy and live health checks | NOT RUN; no deployment was authorized. |

## Deployment readiness

The frontend builds locally and the backend passes local Django checks and the SQLite test suite. This does not establish production readiness. The MongoDB migration's Phase 10 remains BLOCKED: no isolated PostgreSQL source/Atlas staging pair was available for importer reconciliation; active OTP data handling, audit immutability on MongoDB, durable evidence storage, Atlas indexes/backup restore, full concurrency verification, and safe post-write rollback are still release gates. Keep PostgreSQL live and do not cut over.

## Remaining work

- Address the high-severity Mongoose advisory in `apps/api` in a separately authorized legacy-service maintenance task.
- Resolve the frontend lint-toolchain moderate audit findings with a compatible, tested dependency update.
- Run browser visual checks at desktop/tablet/mobile sizes and exercise profile/dashboard flows against an isolated backend.
- Complete the MongoDB Atlas migration release gates in `MONGODB_ATLAS_EXECUTION_TRACKER.md` before any staging sign-off or production cutover.
- No changes from this report have been deployed.
