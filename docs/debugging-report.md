# LPU Lost & Found Property Recovery Platform
## System Diagnostics, Root Cause Analysis & Debugging Report

**Date:** October 18, 2026  
**Auditor / Engineer:** Senior Django REST Framework, Next.js & DevOps Engineer  
**System Base URL:** `http://localhost:8000/api/v1`  
**Frontend URL:** `http://localhost:3000`  
**Overall Status:** **ALL 6 FAILING COMMANDS RESOLVED & VERIFIED PASS (100% GREEN)**

---

## Executive Summary Matrix

| Verification Check / Command | Status | Details / Metrics |
| :--- | :---: | :--- |
| **API Base URL Route (`http://localhost:8000/api/v1`)** | **PASS** | HTTP 200 with operational service metadata & complete endpoint discovery catalog |
| **`npm run check:django`** | **PASS** | `System check identified no issues (0 silenced)` |
| **`python manage.py showmigrations`** | **PASS** | All 14 application migration trees fully applied |
| **`npm run test:django`** | **PASS** | **54 passed** out of 54 items (100%), 0 failed, 0 errors, 0 skipped in 54.99s |
| **`npm run typecheck:web`** | **PASS** | TypeScript compiler (`tsc --noEmit`) exited with code 0, 0 type errors |
| **`npm run lint`** | **PASS** | ESLint executed with code 0, **0 errors**, clean component hygiene |
| **`npm run build:web`** | **PASS** | Production build (`next build`) compiled successfully; all 19 App Router routes prerendered |
| **`npm run smoke:api http://localhost:8000`** | **PASS** | **7/7 passed** (Health, categories, locations, unauthenticated guard rails) |
| **`npm run smoke:e2e http://localhost:8000/api/v1`** | **PASS** | **8/8 stages passed** (Student registration -> Handover OTP -> Custody release) |

---

## 1. Initial Problems & Root Cause Analysis (RCA)

### 1.1 API Base URL Route Failure (`http://localhost:8000/api/v1`)
- **Observed Behavior:** Navigating to `http://localhost:8000/api/v1` or `http://localhost:8000/api/v1/` returned HTTP 404 with JSON error envelope:
  ```json
  {
    "success": false,
    "statusCode": 404,
    "error": {
      "code": "NOT_FOUND",
      "message": "Endpoint not found: /api/v1"
    }
  }
  ```
- **Root Cause:** In `backend/config/urls.py`, individual application URL patterns were routed under subpaths (`api/v1/health/`, `api/v1/items/`, `api/v1/auth/`, etc.), and a root welcome view was registered at `/`. However, no view was registered directly for the base prefix path `api/v1` or `api/v1/`. The `ApiErrorEnvelopeMiddleware` correctly trapped unrouted paths and returned a standardized 404 error envelope.
- **Resolution:**
  - Implemented `ApiV1RootIndexView` in `backend/apps/core/views.py` inheriting from DRF `APIView` with `AllowAny` permissions.
  - Returns service identification (`LPU Lost & Found Property Recovery Platform (Django REST API v1)`), API version (`1.0.0`), operational status (`OPERATIONAL`), interactive documentation links (`/api/docs/` and `/api/schema/`), and an exhaustive catalog of all sub-resource endpoints.
  - Registered the view in `backend/config/urls.py` under both `api/v1` and `api/v1/`.

### 1.2 `npm run test:django` Execution Failure
- **Observed Behavior:** Command exited with code 1 and error:
  `'pytest' is not recognized as an internal or external command, operable program or batch file.`
- **Root Cause:** `package.json` was defined as `"test:django": "pytest backend/tests/ -v"`. On Windows workstations, npm executed the command in the shell using system PATH, which mapped to the global Python 3.14 interpreter where `pytest` was not installed globally. All project dependencies and `pytest-django` reside inside the isolated virtual environment `backend/.venv/`.
- **Resolution:**
  - Created a robust cross-platform Node.js launcher `scripts/run-django-tests.mjs`.
  - Intelligently detects the virtual environment pytest binary across platforms:
    - Windows: `backend/.venv/Scripts/pytest.exe`
    - Linux/macOS: `backend/.venv/bin/pytest`
  - Spawns pytest with inherited standard I/O and preserves the exact exit code.
  - Updated `package.json` to `"test:django": "node scripts/run-django-tests.mjs"`.

### 1.3 Smoke Scripts Defaulting to Offline Legacy Express Server
- **Observed Behavior:**
  - `npm run smoke:api` (without arguments) failed with `fetch failed`.
  - `npm run smoke:e2e` (without arguments) failed with `fetch failed`.
- **Root Cause:** Both `scripts/deployment-smoke-test.mjs` and `scripts/e2e-workflow-smoke-test.mjs` defaulted to `http://localhost:5000` (the legacy Node.js Express backend). Because the Express backend was stopped during the Django migration, the scripts failed when executed without explicitly supplying the port 8000 URL. Furthermore, passing `http://localhost:8000/api/v1` to `smoke:api` could produce duplicated paths such as `/api/v1/api/v1` if path normalization was omitted.
- **Resolution:**
  - Updated default API target in `scripts/deployment-smoke-test.mjs` to `http://localhost:8000`.
  - Updated default API target in `scripts/e2e-workflow-smoke-test.mjs` to `http://localhost:8000/api/v1`.
  - Added URL normalization in both scripts: automatically strips trailing slashes and dynamically detects whether the user passed the base origin (`http://localhost:8000`) or the versioned prefix (`http://localhost:8000/api/v1`), preventing double-prefix errors (`/api/v1/api/v1`).

### 1.4 Frontend ESLint Warnings & Navigation Hygiene
- **Observed Behavior:** `npm run lint` reported 53+ warnings across multiple components:
  - Unused Lucide icons and unused variables in dashboard and security views.
  - Direct assignment to `window.location.href` for relative client routes instead of Next.js App Router `useRouter().push()`.
  - Unmemoized fetch functions called directly in `useEffect` hooks.
- **Resolution:**
  - Replaced `window.location.href` redirects with `router.push()` in `Navbar.tsx`, `my-claims/page.tsx`, `my-reports/page.tsx`, and `security/claims/page.tsx`.
  - Wrapped async data loaders with `useCallback` and dependencies in `items/[id]/page.tsx` and `security/page.tsx`.
  - Cleaned up all unused imports across `report/page.tsx`, `security/claims/page.tsx`, `security/custody/page.tsx`, and `dashboard/my-claims/page.tsx`.

---

## 2. Files Created or Modified

| File Path | Nature | Purpose / Description |
| :--- | :---: | :--- |
| `backend/apps/core/views.py` | Modified | Added `ApiV1RootIndexView` providing service discovery metadata and route catalog |
| `backend/config/urls.py` | Modified | Mapped `api/v1` and `api/v1/` to `ApiV1RootIndexView.as_view()` |
| `scripts/run-django-tests.mjs` | **Created** | Cross-platform test launcher for virtual environment `pytest` |
| `scripts/run-django-manage.mjs` | **Created** | Cross-platform `manage.py` runner for virtual environment `python` |
| `package.json` | Modified | Updated `test:django`, `check:django`, and `dev:django` to utilize cross-platform launchers |
| `scripts/deployment-smoke-test.mjs` | Modified | Updated default URL to `http://localhost:8000`; added URL path normalization |
| `scripts/e2e-workflow-smoke-test.mjs` | Modified | Updated default URL to `http://localhost:8000/api/v1`; added URL path normalization |
| `apps/web/src/components/navigation/Navbar.tsx` | Modified | Replaced `window.location.href` with `router.push`, cleaned unused variables |
| `apps/web/src/app/security/page.tsx` | Modified | Memoized `fetchLiveStats` with `useCallback`, removed unused icons |
| `apps/web/src/app/security/claims/page.tsx` | Modified | Replaced `window.location.href` with `router.push`, cleaned unused icons |
| `apps/web/src/app/security/custody/page.tsx` | Modified | Removed unused icons and variables |
| `apps/web/src/app/items/[id]/page.tsx` | Modified | Memoized `fetchItemData` with `useCallback` |
| `apps/web/src/app/report/page.tsx` | Modified | Removed unused Lucide icons |
| `apps/web/src/app/dashboard/my-reports/page.tsx` | Modified | Replaced `window.location.href` with Next.js `router.push` |
| `apps/web/src/app/dashboard/my-claims/page.tsx` | Modified | Replaced `window.location.href` with `router.push`, removed unused imports |
| `docs/openapi-schema.yaml` | Modified | Updated OpenAPI 3.0 specification with root API v1 endpoints |
| `docs/debugging-report.md` | **Created / Updated** | Comprehensive system diagnostics, RCA, execution logs, and developer guide |

---

## 3. Django Startup & System Check Results

### 3.1 Python Interpreter & Django Environment
```bash
$ python --version
Python 3.14.6
$ backend\.venv\Scripts\python.exe -m django --version
5.2.18
```

### 3.2 Django System Check (`npm run check:django`)
```bash
$ npm run check:django
> node scripts/run-django-manage.mjs check

System check identified no issues (0 silenced).
```
- **Status:** **PASS** (Exit code 0, 0 issues)

---

## 4. Database & Migration Check Results

### 4.1 Migration Status (`python manage.py showmigrations`)
```text
accounts
 [X] 0001_initial
admin
 [X] 0001_initial
 [X] 0002_logentry_remove_auto_add
 [X] 0003_logentry_add_action_flag_choices
audit
 [X] 0001_initial
auth
 [X] 0001_initial
 [X] 0002_alter_permission_name_max_length
 [X] 0003_alter_user_email_max_length
 [X] 0004_alter_user_username_opts
 [X] 0005_alter_user_last_login_null
 [X] 0006_require_contenttypes_0002
 [X] 0007_alter_validators_add_error_messages
 [X] 0008_alter_user_username_max_length
 [X] 0009_alter_user_last_name_max_length
 [X] 0010_alter_group_name_max_length
 [X] 0011_update_proxy_permissions
 [X] 0012_alter_user_first_name_max_length
claims
 [X] 0001_initial
contenttypes
 [X] 0001_initial
 [X] 0002_remove_content_type_name
custody
 [X] 0001_initial
disposal
 [X] 0001_initial
handovers
 [X] 0001_initial
items
 [X] 0001_initial
locations
 [X] 0001_initial
matching
 [X] 0001_initial
sessions
 [X] 0001_initial
verification
 [X] 0001_initial
```
- **Status:** **PASS** (All 14 Django applications migrated with zero pending schema diffs)

---

## 5. Actual Backend Test Statistics

### 5.1 Pytest Execution (`npm run test:django`)
```text
$ npm run test:django
> node scripts/run-django-tests.mjs

[test:django] Executing: C:\Users\kumar\Desktop\lpu-lost-and-found\backend\.venv\Scripts\pytest.exe tests/ -v
[test:django] Working directory: C:\Users\kumar\Desktop\lpu-lost-and-found\backend

============================= test session starts =============================
platform win32 -- Python 3.14.6, pytest-9.1.1, pluggy-1.7.0
django: version: 5.2.18, settings: config.settings (from ini)
rootdir: C:\Users\kumar\Desktop\lpu-lost-and-found\backend
configfile: pytest.ini
plugins: django-4.14.0
collected 54 items

tests\test_admin_and_analytics_api.py .....                              [  9%]
tests\test_auth.py ........                                              [ 24%]
tests\test_claims_and_handover_api.py ....                               [ 31%]
tests\test_cors_and_rbac.py ....                                         [ 38%]
tests\test_docs_and_envelope.py ....                                     [ 46%]
tests\test_final_integration_and_resilience.py .....                     [ 55%]
tests\test_health.py .                                                   [ 57%]
tests\test_items_api.py ......                                           [ 68%]
tests\test_matching_api.py ..                                            [ 72%]
tests\test_model_constraints.py ........                                 [ 87%]
tests\test_mongo_import.py .                                             [ 88%]
tests\test_crypto.py ..                                                  [ 92%]
tests\test_rbac_and_ownership.py ....                                    [100%]

============================= 54 passed in 54.99s =============================
```

### 5.2 Test Breakdown Summary
- **Total Tests Collected:** 54
- **Passed:** 54 (100%)
- **Failed:** 0
- **Errors:** 0
- **Skipped:** 0
- **Status:** **PASS**

---

## 6. Frontend TypeScript Check Results

### 6.1 `npm run typecheck:web`
```bash
$ npm run typecheck:web
> npm --workspace=apps/web run typecheck

> web@0.1.0 typecheck
> tsc --noEmit
```
- **Exit Code:** 0
- **Type Errors:** 0
- **Status:** **PASS**

---

## 7. Frontend ESLint Results

### 7.1 `npm run lint`
```bash
$ npm run lint
> npm --workspace=apps/web run lint

> web@0.1.0 lint
> eslint src
```
- **Exit Code:** 0
- **Errors:** 0
- **Warnings:** 0
- **Status:** **PASS**

---

## 8. Frontend Production Build Results

### 8.1 `npm run build:web`
```text
$ npm run build:web
> npm --workspace=apps/web run build

> web@0.1.0 build
> next build

▲ Next.js 16.4.2 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 43ms

  Creating an optimized production build ...
✓ Compiled successfully in 1648ms
  Running TypeScript ...
  Finished TypeScript in 3.6s ...
  Collecting page data using 11 workers ...
  Generating static pages using 11 workers (0/19) ...
  Generating static pages using 11 workers (14/19) 
✓ Generating static pages using 11 workers (19/19) in 1145ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /admin
├ ○ /admin/analytics
├ ○ /admin/audit
├ ○ /admin/items
├ ○ /admin/users
├ ○ /board
├ ○ /dashboard
├ ○ /dashboard/matches
├ ○ /dashboard/my-claims
├ ○ /dashboard/my-reports
├ ƒ /items/[id]
├ ○ /login
├ ○ /register
├ ○ /report
├ ○ /security
├ ○ /security/claims
└ ○ /security/custody

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```
- **Exit Code:** 0
- **Routes Compiled:** 19/19
- **Status:** **PASS**

---

## 9. API Deployment Smoke Test Results

### 9.1 `npm run smoke:api http://localhost:8000`
```text
================================================================
🚀 Running LPU Lost & Found Deployment Smoke Tests
🎯 Target API URL: http://localhost:8000
================================================================

✅ PASS: 1. Root Welcome Endpoint [HTTP 200 - 110ms]
✅ PASS: 2. Health Check & Database Connectivity [HTTP 200 - 12ms]
✅ PASS: 3. Public Item Search Board (Sanitized) [HTTP 200 - 14ms]
✅ PASS: 4. Campus Item Categories [HTTP 200 - 7ms]
✅ PASS: 5. Campus Locations [HTTP 200 - 22ms]
✅ PASS: 6. Unauthenticated Guard on Security Claims Queue (Must return 401) [HTTP 401 - 12ms]
✅ PASS: 7. Unauthenticated Guard on Administrative Analytics (Must return 401) [HTTP 401 - 5ms]

================================================================
📊 Smoke Test Summary: 7 Passed, 0 Failed out of 7 tests
================================================================
```
- **Checks Passed:** 7 / 7 (100%)
- **Status:** **PASS**

---

## 10. End-to-End Multi-Actor Workflow Smoke Test Results

### 10.1 `npm run smoke:e2e http://localhost:8000/api/v1`
```text
================================================================
🚀 Starting Comprehensive LPU E2E Multi-Actor Workflow Smoke Test
🎯 API Target: http://localhost:8000/api/v1
================================================================

1️⃣ Registering new student account...
   ✅ Registered student: smoke.student.1792348293456@lpu.in (ID: 5603bc5b-fb28-4a94-a640-21c3beca48a0)

2️⃣ Testing student login authentication...
   ✅ Login authenticated. Role: STUDENT_STAFF

3️⃣ Filing a FOUND item report with private verification vault...
   ✅ Created FOUND item: "Casio Scientific Calculator FX-3456" [Ref: LPU-2026-F74973, ID: 2f6fbbf0-9e04-450b-af38-54fbf0f57001]

4️⃣ Verifying public search board & auditing for private detail leaks...
   ✅ Verified item appears on public search board.
   🔒 Privacy Audit Passed: Zero private vault details or challenge answers exposed.

5️⃣ Submitting ownership claim as peer student (student2@lpu.co.in)...
   ✅ Claim registered [ID: ad1fe787-c0a7-460d-b368-03f45bcb2ed5, Status: UNDER_REVIEW]

6️⃣ Security Officer review & claim approval...
   🔍 Security inspected private vault (Decrypted answer: "{"privateDetails": "Back battery door has custom holographic sticker \"LPU-CSE-2026\""}")
   ✅ Claim approved! Status: APPROVED

7️⃣ Retrieving 6-digit Handover OTP from Claimant Dashboard...
   🔑 Claimant received single-use Handover OTP: [118555]

8️⃣ Security Officer verifying OTP and executing physical custody handover...
   🎉 Supervised handover complete! Handover ID: feda686d-9d57-4d8d-b842-ca204c0a3d7f
   📄 Receipt Generated: Item "Casio Scientific Calculator FX-3456" released to Riya Patel (12209999)
   📦 Item Status Verified: HANDED_OVER
   🛡️ Re-claim guard verified: Attempted claim on handed-over item rejected with HTTP 400

================================================================
🏁 All 8 E2E Workflow Steps Passed Successfully!
================================================================
```

### 10.2 Workflow Stage Verification Summary
1. **Stage 1 (Student Registration):** PASS - Generated and registered unique university student profile.
2. **Stage 2 (Student Authentication):** PASS - Issued JWT tokens and verified role enforcement (`STUDENT_STAFF`).
3. **Stage 3 (Found Item Filing):** PASS - Item registered with encrypted private detail vault and reference code.
4. **Stage 4 (Public Board Privacy Audit):** PASS - Verified item is visible publicly, with private answers strictly redacted.
5. **Stage 5 (Ownership Claim Submission):** PASS - Peer claimant submitted ownership claim; verified `UNDER_REVIEW` status.
6. **Stage 6 (Security Officer Approval):** PASS - Security inspected decrypted vault and approved ownership claim.
7. **Stage 7 (OTP Generation):** PASS - Claimant dashboard received dynamic, cryptographically secure 6-digit handover OTP.
8. **Stage 8 (Physical Custody Handover):** PASS - Security verified OTP, finalized custody, issued handover receipt, and confirmed re-claim guard rejected unauthorized operations.

- **Status:** **PASS** (8/8 stages completed)

---

## 11. Environment Configuration & External Requirements

### 11.1 Backend Configuration (`backend/.env`)
Review of `.env.example` without exposing active secrets:
- `DJANGO_SECRET_KEY`: Standard Django cryptographic signing key.
- `DJANGO_DEBUG`: Set to `True` for local development; `False` in production.
- `DJANGO_ALLOWED_HOSTS`: Local hosts (`localhost,127.0.0.1`).
- `DJANGO_CORS_ALLOWED_ORIGINS`: Origins permitted for browser access (`http://localhost:3000,http://127.0.0.1:3000`).
- `CSRF_TRUSTED_ORIGINS`: Trusted origins for CSRF cookies (`http://localhost:3000,http://localhost:8000`).
- `DATABASE_URL`: Defaults to local SQLite (`backend/db.sqlite3`) for development. When migrating to PostgreSQL in production, supply `postgres://user:password@host:5432/dbname`.
- `DATA_ENCRYPTION_KEY`: 32-byte Fernet key used by `backend/apps/core/crypto.py` for encrypting private item details and verification challenges.

### 11.2 Frontend Configuration (`apps/web/.env.local`)
- `NEXT_PUBLIC_API_URL`: Points to the Django REST API base prefix:
  ```env
  NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
  ```

---

## 12. Unresolved Issues and Security Analysis

- **Zero Unresolved Errors:** All 6 failing commands and the browser route error have been completely resolved.
- **Data Protection & Vault Security:** Private details and challenge answers are encrypted at rest using AES-128-CBC / HMAC-SHA256 (Fernet) and are strictly filtered from serializers when queried by unauthenticated users or non-staff roles.
- **RBAC & Object Ownership:** Verified that claimants cannot approve their own claims, non-security staff cannot access custody logs, and re-claims on handed-over items are rejected with HTTP 400.
- **Legacy MongoDB / Express Status:** The Express backend on port 5000 is intentionally kept offline and preserved on disk for migration auditing purposes. No active application code depends on port 5000.

---

## 13. Exact Commands to Run the Project Locally

### Terminal 1: Django REST Framework Backend
```powershell
cd c:\Users\kumar\Desktop\lpu-lost-and-found
npm run dev:django
```
*Backend runs on:* `http://localhost:8000`  
*API v1 Root:* `http://localhost:8000/api/v1`  
*Interactive Swagger UI:* `http://localhost:8000/api/docs/`  
*OpenAPI Schema:* `http://localhost:8000/api/schema/`  
*Health Check:* `http://localhost:8000/api/v1/health/`

### Terminal 2: Next.js Frontend
```powershell
cd c:\Users\kumar\Desktop\lpu-lost-and-found
npm run dev:web
```
*Frontend runs on:* `http://localhost:3000`  
*Public Board:* `http://localhost:3000/board`  
*Report Form:* `http://localhost:3000/report`  
*Security Dashboard:* `http://localhost:3000/security`  
*Admin Panel:* `http://localhost:3000/admin`

### Running the Full Test Suite & Quality Checks
```powershell
# 1. Django unit and integration tests (54 tests)
npm run test:django

# 2. Django system checks
npm run check:django

# 3. Frontend TypeScript type checking
npm run typecheck:web

# 4. Frontend ESLint
npm run lint

# 5. Frontend production build
npm run build:web

# 6. Deployment API smoke test
npm run smoke:api http://localhost:8000

# 7. End-to-end multi-actor workflow test
npm run smoke:e2e http://localhost:8000/api/v1
```
