# Project Progress

## Project overview

Existing LPU Lost and Found application with a Next.js/React frontend and a Django REST Framework backend. A legacy Express/Mongoose API is also present. The frontend and its current visual design were not changed for the ownership-claim fix.

## Master task Phase 1 — admin-only account provisioning (2026-11-04)

- **Status:** COMPLETED and verified before starting Phase 2.
- **Root cause:** `/auth/register/` was public and created a `STUDENT_STAFF` account plus login tokens. The existing admin directory could list, change roles, and activate/deactivate users, but had no account creation operation or UI. The existing access role also combined students and staff, so it could not represent the account types required by the master task.
- **Changes:** Public registration now returns HTTP 403; the `/register` page explains administrator provisioning and the login link no longer offers self-registration. The existing admin user API can create active/inactive Student, Staff, and Security Officer accounts with an admin-supplied initial password, audit the creation, and filter/list the resulting account type. Admin role/status management remains in the existing screen, including the self-demotion/deactivation guards. Account-type updates submitted through profile APIs are not accepted; `UserSerializer.role` remains read-only.
- **Account classification:** Added `User.user_type` while keeping the existing `role` RBAC field unchanged. New account creation requires an explicit type. Existing `STUDENT_STAFF` rows migrate to `UNSPECIFIED` because their student/staff identity cannot be inferred safely; the migration derives security/admin account types from their existing unambiguous roles. `createsuperuser` continues to provision `SYSTEM_ADMIN`; the migration does not change passwords, roles, active state, or delete accounts.
- **Files modified:** `backend/apps/accounts/models.py`, `backend/apps/accounts/serializers.py`, `backend/apps/accounts/views.py`, `backend/apps/accounts/management/commands/create_dev_accounts.py`, `backend/apps/accounts/migrations/0002_user_user_type.py`, `backend/apps/analytics/serializers.py`, `backend/apps/analytics/views.py`, `backend/tests/test_auth.py`, `backend/tests/test_admin_and_analytics_api.py`, `apps/web/src/types/index.ts`, `apps/web/src/lib/api-client.ts`, `apps/web/src/app/register/page.tsx`, `apps/web/src/app/login/page.tsx`, `apps/web/src/app/admin/users/page.tsx`, and this file.
- **Database:** Applied `accounts.0002_user_user_type` to local SQLite. Existing user count remained 5 before/after; one active campus/system administrator remains. No PostgreSQL service is configured in this checkout.
- **Verification:** `tests/test_auth.py` and `tests/test_admin_and_analytics_api.py` passed; the full Django suite passed. `manage.py check` passed and `makemigrations --check --dry-run` reported no changes. Frontend typecheck and production build passed. Lint passed with one existing warning in the login session-expiry effect. Tests cover disabled public registration, admin creation of Student/Staff/Security Officer, credentials and activation, admin activation/deactivation, list filtering, role/activation protection, non-admin denials, and profile role-update rejection.

## Master task Phase 2 — student daily lost-report limit (2026-11-04)

- **Status:** COMPLETED for implementation and SQLite-backed verification; PostgreSQL concurrency execution remains an environment limitation.
- **Root cause:** The report-creation API had no daily lost-report cap, and the existing report form had no allowance display. Django is configured with `USE_TZ=True` and `TIME_ZONE='Asia/Kolkata'`; the new count uses timezone-aware local-day boundaries and the existing `created_at` timestamp.
- **Counting rule:** Count the authenticated, explicitly classified Student's non-archived LOST reports created between local midnight and the next local midnight. Withdrawn/archived reports and terminal `HANDED_OVER`, `UNCLAIMED_EXPIRED`, and `DISPOSED` records do not count. Found reports and staff accounts are excluded. Legacy `UNSPECIFIED` student/staff accounts remain uncapped until an administrator classifies them rather than being guessed to be students.
- **Implementation:** Added a shared allowance calculation and authenticated `GET /api/v1/items/daily-lost-report-limit/`. Lost-report creation locks the authenticated user's row inside its existing atomic transaction before counting and creating, so PostgreSQL serializes simultaneous requests for the same student. The fourth qualifying report is rejected with HTTP 429. The existing report form displays the remaining allowance and disables only lost-report submission at zero; found reporting remains enabled.
- **Files modified:** `backend/apps/items/services.py`, `backend/apps/items/views.py`, `backend/apps/items/urls.py`, `backend/tests/test_items_api.py`, `apps/web/src/lib/api-client.ts`, `apps/web/src/app/report/page.tsx`, and this file.
- **Database:** No model or migration changes. Daily counts use the existing `Item.created_at`, `item_type`, `status`, and `is_archived` fields.
- **Verification:** `tests/test_items_api.py` passed 22 tests; the PostgreSQL concurrency test is skipped because this environment has SQLite and no PostgreSQL client/server. The full Django suite passed. `manage.py check` passed, `makemigrations --check --dry-run` found no drift, frontend typecheck and production build passed, and lint passed with one pre-existing warning in `apps/web/src/app/login/page.tsx`. Tests cover three accepted submissions, fourth rejected, local-midnight reset, archived/terminal exclusions, staff exemption, and found-report exemption.
- **Remaining verification limitation:** The row-lock concurrency test is present but requires PostgreSQL to execute; the actual PostgreSQL integration is not available in this checkout.

## Master task Phase 3 — expire eligible student lost reports (2026-11-04)

- **Status:** COMPLETED for implementation and SQLite-backed verification.
- **Root cause:** No scheduled expiry task or distinct lost-report expiry status existed. The current `UNCLAIMED_EXPIRED` state is for found-item retention and was not reused for lost reports. Existing active/public lists already use `is_archived` to hide archived records.
- **Implementation:** Added `ItemStatus.EXPIRED` to the existing status field. `expire_overdue_student_lost_reports()` uses the original `created_at` and a 30-day aware timestamp cutoff, only for explicitly classified student LOST reports in safe `REPORTED` or `MATCH_PENDING` states. It locks and rechecks each item, then atomically archives it, sets `EXPIRED`, and writes an audit event containing `Report expired after 30 days without recovery.` Active/reviewed/approved/completed claims, any handover, custody history, accepted matches, recovered reports, found reports, staff reports, withdrawn reports, and other security workflow states are preserved. Existing public board, My Reports, matching, and claim eligibility filters already exclude archived items; the claim service also explicitly rejects `EXPIRED`.
- **Scheduling:** Celery/Redis is not configured. Added the `expire_student_lost_reports` Django management command and an hourly Render cron service in the existing backend Blueprint, connected to the existing PostgreSQL 16 database. Render cron expressions use UTC; expiration itself uses aware timestamps and the original `created_at`.
- **Historical data:** No item, claim, handover, custody, or evidence rows are deleted. Expiry action and timestamp are retained in the existing audit log. No separate history page was added because the current UI has no lost-report history view.
- **Files modified/created:** `backend/apps/items/models.py`, `backend/apps/items/services.py`, `backend/apps/items/management/__init__.py`, `backend/apps/items/management/commands/__init__.py`, `backend/apps/items/management/commands/expire_student_lost_reports.py`, `backend/apps/items/migrations/0002_alter_item_status.py`, `backend/apps/audit/models.py`, `backend/apps/audit/migrations/0003_alter_auditentry_action.py`, `backend/apps/claims/services.py`, `backend/render.yaml`, `backend/tests/test_items_api.py`, and this file.
- **Database:** Applied migrations `items.0002_alter_item_status` and `audit.0003_alter_auditentry_action` to local SQLite. These add status/action choices only; they do not rewrite or delete existing records. No further migration drift remains.
- **Verification:** Three targeted expiry tests passed, covering the 29/30-day boundary, student LOST-only eligibility, recovered/staff/found exclusions, active claim/approved release/pending handover/custody/accepted-match protection, removal from public/My Reports, rejection of a new claim, preserved records/audit, and idempotent command runs. The full Django suite passed. `manage.py check`, `makemigrations --check --dry-run`, and Render Blueprint YAML parse/cron command checks passed. No frontend code changed in this phase.
- **Remaining environment limitation:** The expiry command was tested against SQLite; the Render/PostgreSQL cron service cannot be executed locally. The Phase 2 PostgreSQL row-lock concurrency test remains skipped for the same environment reason.

## Student/staff report withdrawal (2026-11-04)

- **Status:** COMPLETED for the implemented workflow and SQLite-backed verification.
- **Implementation:** Added an authenticated `DELETE /api/v1/items/{id}/withdraw/` endpoint restricted to the existing student/staff role. Ownership is determined from `request.user` and the item's `reported_by` relationship; request-supplied user IDs are not trusted. Eligible `REPORTED` reports and `MATCH_PENDING` reports without an accepted match are soft archived. Existing status, reporter, creation timestamp, and historical rows are retained, and an audit entry records the actor and withdrawal time. Repeated withdrawal is idempotent and does not duplicate the audit entry.
- **Workflow protections:** Withdrawal is rejected with a clear conflict response if the item has an active or approved claim, handover record, custody history, accepted match, or a status outside the safe withdrawal states. Claims and security custody intake now lock the item inside their transaction before checking its state, preventing those workflows from racing a withdrawal. Archived items are excluded from active matching results as well as the existing public, detail, My Reports, and custody inventory queries.
- **Frontend:** Added a Remove Report action for owner reports in the existing My Reports view, using the existing modal styling and confirmation copy, loading/error/success states, and list refresh/removal. No routes, form fields, or existing security/admin controls were changed.
- **Files changed:** `backend/apps/items/views.py`, `backend/apps/items/urls.py`, `backend/apps/claims/services.py`, `backend/apps/custody/views.py`, `backend/apps/matching/views.py`, `backend/apps/audit/models.py`, `backend/apps/audit/migrations/0002_alter_auditentry_action.py`, `backend/tests/test_items_api.py`, `apps/web/src/lib/api-client.ts`, and `apps/web/src/app/dashboard/my-reports/page.tsx`.
- **Database:** Applied the audit action-choice migration `audit.0002_alter_auditentry_action` to the local SQLite database. No report rows were deleted or rewritten. `makemigrations --check --dry-run` reports no ungenerated migrations.
- **Verification:** `pytest tests/test_items_api.py -q` passed all 18 tests. The full Django `pytest -q` suite passed. `manage.py check` passed and migration drift check was clean. Frontend typecheck and production build passed; lint passed with the previously noted unrelated login-page warning. `npm run test:web` was run and fails at its existing hard-coded navy palette assertion (`scripts/frontend-unit-test.mjs` test 2), before it reaches withdrawal assertions; that assertion is unrelated to this feature and was not altered. PostgreSQL concurrency semantics and a browser-based Playwright flow remain unverified because this checkout uses SQLite and has no configured PostgreSQL service.

## Automatic recovery history transition (2026-11-04)

- **Status:** COMPLETED for the existing Django/Next.js workflow and SQLite-backed verification.
- **Root cause:** the supervised OTP handover transaction already marked the claim `COMPLETED` and stored `Handover.completed_at`. The My Claims API still returned completed claims, while Recovery History inferred success from `APPROVED`/`RESOLVED` claims and generated placeholder dates, locations, officers, and random receipt values. The evidence upload endpoint also lacked a completed-recovery guard.
- **Backend changes:** My Claims now excludes `COMPLETED` claims and claims with completed handovers. Added authenticated `GET /api/v1/handovers/my-recovery-history/`, which returns only completed handovers whose recipient and claim belong to the current student/staff user. Results use persisted claim, item, and handover details. Evidence uploads lock the item and claim in the same order as OTP handover, reject completed claims or handovers with HTTP 409, and retain historical evidence. This serializes uploads against handover completion and prevents late uploads from changing the completed record.
- **Frontend changes:** Recovery History now loads real API records, displays persisted recovery and handover details in the existing page, and polls while visible so a security-completed handover appears without a manual refresh. My Claims uses the same visible-page refresh behavior and its completed entries disappear when the backend transition is observed. The dashboard's returned count now uses completed recovery records instead of counting merely approved claims. Recovery details show the closed-evidence notice; stale completed claim UI also hides the upload control.
- **Files modified:** `backend/apps/claims/views.py`, `backend/apps/handovers/views.py`, `backend/apps/handovers/urls.py`, `backend/tests/test_claims_and_handover_api.py`, `apps/web/src/lib/api-client.ts`, `apps/web/src/app/dashboard/my-claims/page.tsx`, `apps/web/src/app/dashboard/history/page.tsx`, `apps/web/src/app/dashboard/page.tsx`, and this progress file.
- **Database:** No migration required. The existing `ClaimStatus.COMPLETED` and `Handover.completed_at` fields are the source of truth. Historical evidence, claims, and completed handovers are retained. `makemigrations --check --dry-run` reports no model changes.
- **Verification:** `tests/test_claims_and_handover_api.py` passed after adding coverage for the active-to-completed transition, required physical handover confirmation, recovery history persistence and owner isolation, post-recovery direct evidence-upload rejection, and incorrect/expired OTP claims remaining active. The full Django suite passed. `manage.py check` passed; frontend typecheck, production build, and lint passed. Lint retains one unrelated warning in `apps/web/src/app/login/page.tsx`. The local database is SQLite; PostgreSQL row-lock concurrency and Playwright/browser interaction remain unverified in this checkout.

## OTP expiration investigation and fix (2026-11-03)

- **Root cause:** the security navigation's `/security/handovers` route was a demo-only verifier. It loaded hard-coded sample handovers when real pending claims were absent, compared entered values with demo OTPs (including accepted fixed values), and never submitted the claim ID and OTP to Django. The real supervised release endpoint and required ID inspection fields already exist at `/security/custody?tab=handover`. The handovers route now redirects to that existing terminal.
- **Database evidence:** the configured local database is SQLite. At inspection time it contained two approved claims and two handover rows. Each claim had exactly one handover, matching item and claimant/recipient relationships, matching claim/handover expiry timestamps, timezone-aware expiry values, and expirations in the future about 48 hours after issuance. No OTP expiry failure reproduced against those records; no existing rows or OTP values were rewritten.
- **Related defect found:** invalid OTP submissions referenced a nonexistent `AuditAction.HANDOVER_OTP_FAILED` attribute and could return HTTP 500. The endpoint now records the established string action and returns the existing invalid-code response.
- **Files inspected:** claim approval and serialization, handover model/serializer/views/URLs, Django timezone and logging settings, security custody and handover pages, sidebar navigation, API client requests, tests, and approved claim/handover database relationships.
- **Files modified:** `backend/apps/claims/services.py`, `backend/apps/handovers/models.py`, `backend/apps/handovers/views.py`, `backend/apps/handovers/migrations/0002_handover_unique_handover_per_claim.py`, `backend/tests/test_claims_and_handover_api.py`, and `apps/web/src/app/security/handovers/page.tsx`.
- **Changes:** issue OTPs using `secrets` and one timezone-aware UTC instant; retain the configured 48-hour lifetime; compare expiration with `timezone.now()` and reject at the exact expiry boundary; serialize verification under item/claim/handover row locks in a transaction; validate the claim, item, and recipient relationship; enforce one handover row per claim; keep failed-attempt counting/auditing transactional; log creation, request time, expiry check, and result without logging OTP values; and preserve the pre-release custody desk in the custody ledger.
- **Database change:** migration `handovers.0002_handover_unique_handover_per_claim` was applied to local SQLite. Existing rows were checked for duplicate claims before migration; none existed. The migration adds a uniqueness constraint and changes no row data.
- **Verification:** targeted claim/handover pytest suite passed; the final full Django pytest suite passed; `manage.py check` passed; `makemigrations --check --dry-run` reported no missing migrations; frontend TypeScript check and production build passed; frontend lint passed with one unrelated existing warning in `apps/web/src/app/login/page.tsx`; production-server HTTP check confirmed `/security/handovers` returns a 307 to `/security/custody?tab=handover`. Tests cover approval-to-OTP delivery through My Claims, the pending-handover feed, valid immediate verification and custody receipt, expired OTP rejection, wrong OTP, cross-claim OTP rejection, mismatched claimant/recipient rejection, duplicate use, and absence of OTP values in logs.
- **Limit:** SQLite does not exercise PostgreSQL row-lock behavior. The verification path now uses `select_for_update()` with the same item → claim → handover lock order as approval, but simultaneous redemption still needs a PostgreSQL 16 integration run.

## Actual stack and environment

- Frontend: Next.js 16 / React 19.
- Django backend: Django 5.2.18, DRF, custom UUID user model, SimpleJWT.
- Local database used for this session: SQLite (`backend/db.sqlite3`). PostgreSQL is not configured in this checkout, so PostgreSQL behavior is not verified.
- Test interpreter: Python 3.14.6 in `backend/.venv` (the P09 target is Python 3.12).
- Django apps present: accounts, analytics, audit, claims, core, custody, disposal, handovers, items, locations, matching, verification.

## Completed phases

- Existing React UI and shared Lost and Found logo work from the previous session are present; no UI files were modified in this phase.
- Recovered claim identity flow: item reports assign `reported_by=request.user`; claim submissions assign `claimant=user`; the reviewer comes from authenticated `request.user`, not a request-body ID.
- Reproduced the anti-self-approval denial through `PATCH /api/v1/claims/{id}/review/` against the current SQLite record without writing to it (403). The item reporter is a security account, while the claimant is a different student; the guard correctly denies that reporter and an independent security officer can review.
- Hardened claim review by locking the item then claim within one transaction, rejecting approvals before `UNDER_REVIEW`, and retaining the reporter/claimant self-review guards.
- Added regression coverage for reporter denial/independent approval, claimant denial, student denial, verification-state gating, duplicate approval/OTP, and supervised handover.

## In-progress phase

- Continue completing and validating the Django Track P implementation against the P09 specification while preserving existing UI and records.

## Pending modules and infrastructure

- PostgreSQL 16 deployment and validation; PostgreSQL full-text search and `pg_trgm`.
- Celery/Celery Beat and Redis integration for scheduled/background tasks.
- S3-compatible production media/evidence storage.
- Institution/tenant isolation and Django Groups/Permissions coverage required by the specification.
- Playwright end-to-end coverage.
- Remaining P09 privacy, append-only audit/custody, and production deployment validation.
- The legacy Express/Mongoose service remains in the repository; migration/retirement has not been verified.

## Known issues and blockers

- Current local data has one claim in `UNDER_REVIEW` whose item is `READY_FOR_HANDOVER`, while the claim has no reviewer, OTP, or handover record. This state mismatch predates the claim fix and was left untouched pending provenance review.
- The security officer associated with that item's `reported_by` foreign key cannot approve its claim by design. A different authorized security officer must adjudicate it.
- No item-level audit entry exists for that item, so the database cannot independently establish whether the linked security account was the original human reporter or whether the row came from seeded/imported data.
- The full set of Git commits and prior-session diffs cannot be checked because this workspace has no `.git` directory.
- `npm run test:web` fails at its existing stale assertion that requires the former navy palette. It was run during report-withdrawal verification and fails before reaching feature-specific checks; no UI palette change was made to satisfy it.

## Database and migration status

- All migrations, including `audit.0002_alter_auditentry_action`, are applied to the local SQLite database.
- `makemigrations --check --dry-run`: no changes detected after the withdrawal migration.
- The audit action-choice migration was required; no report records were deleted or rewritten.

## Test results

- OTP history: `tests/test_claims_and_handover_api.py` passed 11 tests; the prior full Django suite passed 74 tests.
- Report withdrawal: `tests/test_items_api.py -q` passed all 18 tests; the full Django suite passed after the implementation.
- `manage.py check`: no issues. `npm run typecheck:web` and `npm run build:web` passed. `npm run lint` passed with one unrelated existing warning. `npm run test:web` failed on its stale palette assertion.
- Local PostgreSQL and concurrent locking behavior have not been integration-tested.

## Phase 4: Immediate Security Desk review visibility (2026-11-04)

- **Status:** COMPLETED for the implemented workflow and SQLite-backed verification.
- **Root cause:** New reports were correctly saved with their reporter and initial `REPORTED` status, but the Security Desk inventory only listed reports already in custody or later workflow statuses. No security-only submission review queue existed.
- **Implementation:** Added `GET /api/v1/security/reports/` (and its existing no-trailing-slash style alias) for authorized security/admin users. It returns active student/staff reports in `REPORTED` or `MATCH_PENDING`, supports the existing LOST/FOUND and search filters, and includes a minimal reporter summary alongside the item details. New reports remain `REPORTED`; queue retrieval does not approve, verify, or transfer custody.
- **Frontend:** Added a “Submitted Reports” tab to the existing Security Desk custody page, with refresh, search, filtering, pagination, report details, and a link to the existing item detail route. Added a shortcut from the existing Security dashboard. No report submission form, approval workflow, route, or role permission was replaced.
- **Files changed:** `backend/apps/items/serializers.py`, `backend/apps/audit/views.py`, `backend/apps/audit/urls_security.py`, `backend/tests/test_items_api.py`, `apps/web/src/lib/api-client.ts`, `apps/web/src/app/security/custody/page.tsx`, `apps/web/src/app/security/page.tsx`, and this file.
- **Database:** No schema changes or migrations required. `makemigrations --check --dry-run` reports no changes.
- **Verification:** Focused queue tests passed for student/staff LOST and FOUND submissions, reporter identity, filters, inactive/expired report exclusion, and rejection of unauthenticated/student access. Full backend pytest suite passed with one existing environment-dependent skip. `manage.py check`, migration-drift check, web typecheck, and production build passed. Web lint has one pre-existing warning in `apps/web/src/app/login/page.tsx:38`; no Phase 4 lint errors.
- **Limitations:** Local backend tests use SQLite, not PostgreSQL. The workspace has no `.git` directory, so Git history/diff verification is unavailable. The existing item detail page is linked as the review detail view; report submission does not create a new approval/verification state transition.

## Last completed task

Made newly submitted student/staff LOST and FOUND reports immediately visible to authorized Security Desk users without changing their submitted status or auto-approving them.

## Exact next task

Complete Phase 5: after successful OTP verification and confirmed physical handover, remove completed claims from active Approved/Handover views and ensure they persist in Recovery History with evidence uploads blocked.

## Phase 5: Recovery completion and active-portal cleanup (2026-11-04)

- **Status:** COMPLETED for implementation and SQLite-backed verification.
- **Root cause/status on inspection:** The core lifecycle was already implemented: successful OTP verification with the required physical handover details atomically sets claim status to `COMPLETED`, item status to `HANDED_OVER`, stamps the handover, and records custody and audit history. My Claims already excludes completed claims, Recovery History reads persisted completed handovers for the authenticated claimant, and the evidence endpoint rejects uploads for completed claims. Two synchronization gaps remained: the pending-handover API trusted only `is_completed`, and an already-open security claims register/handover selector could retain stale claim data after a handover.
- **Changes:** Pending handovers now require an incomplete handover, an `APPROVED` claim, and an item in `READY_FOR_HANDOVER`. The security claims register refreshes its current filter every 20 seconds while visible. After the pending handover list refreshes, the terminal retains a still-pending selection, selects another available claim, or clears the selection when none remain. Existing My Claims and Recovery History refresh intervals were retained.
- **Lifecycle and security verified:** Invalid/expired OTP or missing physical handover data leaves the claim active. Successful verification performs all completion writes atomically. Completed claims disappear from My Claims, Approved Claims, and Pending Handover queries; they remain in the owner's persisted Recovery History. A different user's history does not reveal the record. Post-completion evidence uploads are rejected by the backend while prior evidence remains unchanged. Duplicate redemption and OTP regeneration are blocked.
- **Files modified in this phase:** `backend/apps/handovers/views.py`, `backend/tests/test_claims_and_handover_api.py`, `apps/web/src/app/security/claims/page.tsx`, `apps/web/src/app/security/custody/page.tsx`, and this file. The core handover, history, and evidence protections were present before this phase and were inspected rather than rewritten.
- **Database:** No model/schema changes or migrations. All relevant local migrations are applied. Read-only consistency check against local SQLite found 2 handovers: 1 completed handover consistent with a completed claim and handed-over item, 1 approved pending handover, and 0 incomplete handovers attached to completed claims.
- **Verification:** `tests/test_claims_and_handover_api.py` passed all 12 tests, including the full approve → OTP → confirmed handover → Recovery History sequence and the newly added Approved/Pending portal assertions. Full backend pytest suite passed with one environment-dependent skip. `manage.py check` passed; `makemigrations --check --dry-run` found no drift; web typecheck and production build passed. Lint has one pre-existing warning in `apps/web/src/app/login/page.tsx:38` and no errors in changed files.
- **Limitations:** Backend tests use SQLite, so PostgreSQL row-lock/concurrent OTP behavior was not integration-tested. This checkout has no configured Playwright E2E suite and no Git metadata; browser E2E and Git diff/history checks were unavailable. The UI was compiled and typechecked, while workflow behavior was verified through Django API integration tests.

## Master task status

- Phases 1–5: COMPLETED and sequentially verified in this workspace. Per-phase findings and test details are recorded above.
- No additional migrations were introduced by Phases 4–5. PostgreSQL/production scheduler and PostgreSQL locking verification remain deployment-level checks.
- **Exact next task:** None for this five-phase request. Run PostgreSQL 16 and browser E2E verification when those services are available.
