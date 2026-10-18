# Automated Testing & Quality Assurance Guide: LPU Lost & Found

The platform maintains a robust test pyramid incorporating unit tests, integration tests, static typing, security constraint tests, and full-lifecycle end-to-end smoke tests.

---

## 1. Test Suite Summary

| Scope | Tool / Framework | Test Count | Execution Time | Coverage Highlights |
| :--- | :--- | :---: | :---: | :--- |
| **Backend Unit & Integration** | `pytest` + `pytest-django` | 54 tests | ~40-42s | Auth, RBAC, Claims, Handover OTP, Crypto, Analytics |
| **Frontend Static Typing** | TypeScript (`tsc --noEmit`) | 19 routes | ~2-3s | Strict types, null-checks, API response shapes |
| **Frontend Code Hygiene** | ESLint (`eslint src`) | Workspace | ~3-4s | React 19 hook invariants, import hygiene |
| **Frontend Production Build** | Next.js 16 (`next build`) | 19 routes | ~3s | Turbopack compilation & static prerendering |
| **API Smoke Verification** | Node.js test script | 7 checks | ~150ms | Live endpoint responses, CORS headers, 401 guardrails |
| **Multi-Actor E2E Workflow** | Node.js E2E test script | 8 stages | ~2-3s | Registration -> Claim -> Security Review -> OTP Handover |

---

## 2. Backend Automated Tests (Pytest)

### 2.1 Test Directory Structure

```text
backend/tests/
├── test_admin_and_analytics_api.py       # Administrative summaries, hotspots, and audit logs
├── test_auth.py                          # Registration, JWT login, token refresh, and Bcrypt validation
├── test_claims_and_handover_api.py       # Claim submission, security approval, OTP issue, physical release
├── test_cors_and_rbac.py                 # Multi-role access control, cross-origin security headers
├── test_docs_and_envelope.py             # OpenAPI 3.0 schema generation, REST response envelopes
├── test_final_integration_and_resilience.py # Edge cases, race condition guards, malformed requests
├── test_health.py                        # Service health, database connectivity checks
├── test_items_api.py                     # Item reporting, filtering, pagination, search
├── test_matching_api.py                  # Heuristic matching engine scoring
├── test_model_constraints.py             # Database constraints, anti-self-claim invariants
├── test_mongo_import.py                  # Historical legacy data compatibility
├── test_crypto.py                        # Fernet symmetric encryption & EXIF metadata scrubbing
└── test_rbac_and_ownership.py            # Object-level ownership protection
```

### 2.2 Running Backend Tests

```bash
# Run all tests with verbose output
cd backend
pytest tests/ -v

# Run a specific test module
pytest tests/test_claims_and_handover_api.py -v

# Run from workspace root via convenience script
npm run test:django
```

---

## 3. Frontend Quality & Static Checks

```bash
# Verify TypeScript compilation (0 errors allowed)
npm run typecheck:web

# Run ESLint rules (0 errors and 0 warnings allowed)
npm run lint

# Compile production build
npm run build:web
```

---

## 4. Live Deployment & E2E Smoke Tests

With both servers running (`backend` on `localhost:8000`, `web` on `localhost:3000`):

### 4.1 Deployment API Smoke Test

```bash
npm run smoke:api http://localhost:8000
```
Verifies:
1. Root welcome endpoint
2. Database health connectivity
3. Public search board sanitization
4. Categories endpoint
5. Locations endpoint
6. Unauthenticated guard on Security claims queue (HTTP 401)
7. Unauthenticated guard on Admin analytics (HTTP 401)

### 4.2 Multi-Actor E2E Workflow Smoke Test

```bash
npm run smoke:e2e http://localhost:8000/api/v1
```
Executes an automated multi-actor journey:
1. Registers a new student account (`STUDENT_STAFF`).
2. Authenticates and retrieves JWT tokens.
3. Files a found item with private vault details.
4. Audits the public board to ensure zero private detail leaks.
5. Files a claim from a peer student account.
6. Security Officer logs in, decrypts vault, and approves the claim.
7. Claimant retrieves the single-use 6-digit handover OTP.
8. Security Officer verifies OTP, executes physical release, verifies status `HANDED_OVER`, and verifies re-claim guard.
