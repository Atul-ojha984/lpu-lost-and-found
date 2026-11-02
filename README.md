# LPU Lost & Found — Campus Property Recovery Platform

<p align="center">
  <img src="apps/web/public/images/lost-and-found-logo.png" alt="Lost & Found Management System Logo" width="260"/>
</p>

<p align="center">
  <strong>Enterprise Property Recovery, Chain-of-Custody &amp; Claims Management Platform</strong>
</p>

<p align="center">
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16_App_Router-black?logo=next.js" alt="Next.js 16"/></a>
  <a href="https://www.djangoproject.com/"><img src="https://img.shields.io/badge/Django-5.2-green?logo=django" alt="Django 5.2"/></a>
  <a href="https://www.django-rest-framework.org/"><img src="https://img.shields.io/badge/Django_REST_Framework-3.15-red" alt="DRF 3.15"/></a>
  <a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql" alt="PostgreSQL 16"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript" alt="TypeScript 5.6"/></a>
  <a href="https://pytest.org/"><img src="https://img.shields.io/badge/Pytest-62%2F62_Passing-brightgreen?logo=pytest" alt="Pytest Passing"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
</p>

---

## 1. Project Overview & Problem Statement

Across Lovely Professional University's 600+ acre campus serving over 35,000+ students and faculty members, personal belongings—including laptops, scientific calculators, student identification cards, textbooks, keys, and wallets—are frequently misplaced. Traditional lost-and-found processes relying on informal social media groups, physical notices, and uncoordinated security desks suffer from:
- Lack of centralized visibility across campus blocks and university zones.
- Privacy risks when posting serial numbers, identity cards, or phone lock screens publicly.
- High risk of fraudulent ownership claims due to lack of proof verification.
- Absence of an immutable chain-of-custody ledger during physical handovers.

The **LPU Lost & Found Property Recovery Platform** solves this by establishing a secure, unified digital infrastructure with role-separated workflows, privacy vaults, an automated heuristic matching engine, and supervised cryptographic handovers.

---

## 2. Main Features

- **Public Search & Discovery Board:** Real-time searchable and filterable board of lost and found campus property with automated zero-leakage redaction of sensitive identifiers.
- **Explainable Multi-Factor Matching Engine:** Automatic cross-matching between newly reported found items and existing lost reports based on category, location proximity, timestamps, and brand attributes.
- **Cryptographic Private Verification Vault:** Two-tier property privacy model encrypting high-risk identification details (serial numbers, device identifiers, engraving text) with Fernet (AES-128-CBC) symmetric encryption.
- **In-Memory EXIF & GPS Metadata Scrubber:** Automatic removal of location metadata and camera hardware identifiers from uploaded property images via Pillow before persistence.
- **Supervised Handover with Single-Use OTP:** Claim verification initiates a 15-minute expiring 6-digit OTP delivered exclusively to the verified claimant's dashboard. Physical item release is executed only upon security officer OTP verification.
- **Immutable Forensic Audit Trail:** Automatic auditing of item state transitions, claim reviews, OTP verifications, and user role actions.
- **Multi-Role Campus Dashboards:**
  - **Student / Staff:** File lost/found reports, track claim status, view potential matches, and retrieve handover OTPs.
  - **Security Officer:** Triage claims against decrypted vaults, manage secure storage lockers, and supervise physical handovers.
  - **Administrator:** Live recovery KPIs, category/location management, retention queue monitoring, and system compliance logs.

---

## 3. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5.6, Tailwind CSS, Lucide Icons |
| **Backend API** | Python 3.14 / 3.12, Django 5.2, Django REST Framework 3.15, `djangorestframework-simplejwt` |
| **Database** | PostgreSQL 16 (Production) / SQLite with WAL mode (Local Development & Testing) |
| **Security & Crypto**| Cryptography (Fernet / AES-128-CBC), Bcrypt password hashing, Pillow EXIF scrubber |
| **API Documentation**| OpenAPI 3.0 via `drf-spectacular` (Swagger UI & ReDoc) |
| **Testing** | Pytest 9.1 (`pytest-django`), TypeScript Compiler (`tsc --noEmit`), ESLint |
| **CI / CD** | GitHub Actions (`.github/workflows/ci.yml`), Vercel, Render / Docker |

---

## 4. Architecture & Monorepo Structure

```text
lpu-lost-and-found/
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI (Typecheck, Lint, Build, Pytest)
├── apps/
│   ├── web/                    # Next.js 16 App Router Frontend
│   │   ├── public/
│   │   │   └── images/
│   │   │       └── lpu-logo.png # Authentic LPU campus logo
│   │   ├── src/
│   │   │   ├── app/            # 19 App Router pages (public, student, security, admin)
│   │   │   ├── components/     # UI design system, modals, navigation, cards
│   │   │   ├── lib/            # Typed API client, session context, storage helpers
│   │   │   └── types/          # Shared frontend data models
│   │   ├── package.json
│   │   ├── .env.example        # Frontend environment template
│   │   └── README.md           # Frontend-specific documentation
│   └── api/                    # Legacy Node.js Express backend (offline baseline reference)
├── backend/                    # Django REST Framework Backend
│   ├── apps/
│   │   ├── accounts/           # User auth, roles (STUDENT_STAFF, SECURITY_OFFICER, ADMIN)
│   │   ├── items/              # Item catalog, public board, image upload pipeline
│   │   ├── locations/          # Campus blocks, buildings, and drop points
│   │   ├── matching/           # Algorithmic multi-factor matching engine
│   │   ├── claims/             # Ownership claims & anti-self-claim verification
│   │   ├── custody/            # Security locker intake & custody logging
│   │   ├── handovers/          # Supervised single-use OTP handovers & receipts
│   │   ├── analytics/          # Campus recovery KPIs and hotspot metrics
│   │   ├── audit/              # Forensic compliance audit trail
│   │   └── core/               # Response envelopes, exceptions, and seed commands
│   ├── config/                 # Django settings, routing, and WSGI/ASGI entrypoints
│   ├── tests/                  # 54 Pytest automated test suites
│   ├── manage.py               # Django CLI entrypoint
│   ├── requirements.txt        # Python dependencies
│   ├── pytest.ini              # Pytest configuration
│   ├── .env.example            # Backend environment template
│   └── README.md               # Backend-specific documentation
├── docs/                       # Project Documentation & Architecture Guides
│   ├── architecture.md         # Detailed component and dataflow architecture
│   ├── api-documentation.md    # REST API endpoints, schemas, and auth contracts
│   ├── database-design.md      # Relational schema, ERD, and integrity constraints
│   ├── setup-guide.md          # Comprehensive local setup instructions
│   ├── testing-guide.md        # Test suite execution, coverage, and smoke tests
│   ├── deployment-guide.md     # Production deployment to Vercel and Render
│   ├── cleanup-report.md       # Repository audit and dead-code removal log
│   └── openapi-schema.yaml     # OpenAPI 3.0 specification
├── scripts/                    # Automation and deployment test scripts
│   ├── deployment-smoke-test.mjs   # 7-point live deployment smoke test
│   ├── e2e-workflow-smoke-test.mjs # 8-stage multi-actor lifecycle test
│   ├── run-django-manage.mjs       # Cross-platform Django management launcher
│   └── run-django-tests.mjs        # Cross-platform Pytest launcher
├── .gitignore                  # Safe git exclusions for secrets, caches, and media
├── package.json                # Monorepo workspaces and unified npm scripts
├── LICENSE                     # MIT License
└── README.md                   # Root project guide
```

---

## 5. Quick Start & Local Development

### Prerequisites
- **Node.js:** v20.x or v22.x LTS
- **Python:** v3.12 to v3.14
- **Git**

### Step 1: Clone the Repository
```bash
git clone <repository_url>
cd lpu-lost-and-found
```

### Step 2: Backend Setup (Django REST Framework)
```bash
# Navigate to backend directory and create virtual environment
cd backend
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate

# Install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env

# Apply database migrations
python manage.py migrate

# Seed campus demo personas and baseline categories/locations
python manage.py seed_demo_data

# Start Django development server (http://localhost:8000)
python manage.py runserver 127.0.0.1:8000
```

### Step 3: Frontend Setup (Next.js 16)
In a new terminal at the repository root:
```bash
# Install monorepo dependencies
npm install

# Configure frontend environment variables
cp apps/web/.env.example apps/web/.env.local

# Start Next.js development server (http://localhost:3000)
npm run dev
# or: npm run dev:web
```

Visit `http://localhost:3000` to interact with the platform.

---

## 6. Demo Accounts & Seed Personas

Running `python backend/manage.py seed_demo_data` pre-populates authenticated accounts matching the UI quick-fill logins:

| Role | Email Address | Password | Campus ID | Scope & Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Student (Reporter)** | `aarav.sharma.12108@lpu.in` | `DemoStudent2026!` | `12108801` | Report items, view matches, manage claims, retrieve OTP |
| **Student (Peer Claimant)**| `student2@lpu.co.in` | `Student@12345` | `12105678` | Independent claimant persona for competing claims |
| **Security Officer** | `rajesh.verma.sec@lpu.in` | `DemoSecurity2026!` | `LPU-SEC-001` | Review claims, decrypt vault proof, verify OTP, log custody |
| **System Administrator** | `sunita.admin@lpu.in` | `DemoAdmin2026!` | `LPU-ADM-001` | Campus recovery analytics, user governance, audit trail |

---

## 7. Command Reference

All primary commands can be executed from the workspace root:

| Command | Action |
| :--- | :--- |
| `npm run dev:web` | Start Next.js frontend development server (`:3000`) |
| `npm run dev:django` | Start Django REST Framework development server (`:8000`) |
| `npm run typecheck:web`| Run TypeScript static type check across frontend |
| `npm run lint` | Run ESLint across frontend components |
| `npm run build:web` | Compile Next.js production build (19 App Router pages) |
| `npm run check:django` | Run Django system and model integrity checks |
| `npm run test:django` | Run complete backend Pytest suite (54 tests) |
| `npm run smoke:api` | Run 7-point live deployment API smoke check |
| `npm run smoke:e2e` | Run 8-stage multi-actor end-to-end workflow check |

---

## 8. Verification & Quality Assurance

The codebase passes 100% of automated checks:

- **Frontend TypeScript (`npm run typecheck:web`):** Code 0, 0 type errors.
- **Frontend ESLint (`npm run lint`):** Code 0, 0 errors, 0 warnings.
- **Frontend Production Build (`npm run build:web`):** Code 0, all 28 App Router routes compiled via Turbopack.
- **Django System Check (`npm run check:django`):** Code 0, no issues identified.
- **Backend Pytest Suite (`npm run test:django`):** Code 0, **62 passed in ~57s**.
- **Authentication Smoke Tests (`npm run smoke:auth`):** Code 0, **13/13 passed** (Student, Security, Admin credentials).
- **API Smoke Tests (`npm run smoke:api`):** Code 0, **7/7 passed**.
- **End-to-End Workflow (`npm run smoke:e2e`):** Code 0, **8/8 stages passed**.

For detailed test coverage documentation, see [`docs/testing-guide.md`](docs/testing-guide.md).

---

## 9. Security & Privacy Considerations

1. **Zero-Leakage Privacy Vault:** Sensitive identifying information is encrypted at rest using Fernet (AES-128-CBC with HMAC-SHA256) and never returned to unauthenticated or unauthorized users.
2. **Metadata Scrubbing:** Uploaded item images are sanitized in-memory using Pillow to strip camera EXIF data and GPS coordinates.
3. **Anti-Self-Claim Invariant:** Users cannot file claims against items they reported, preventing identity spoofing.
4. **Single-Use Handover OTP:** Handovers require a cryptographically generated 6-digit OTP valid for 15 minutes, verified within an atomic database transaction.
5. **Strict RBAC & Ownership:** Custom DRF permission classes enforce separation between students, security officers, and administrators.

---

## 10. Documentation Index

- [Architecture Guide](docs/architecture.md)
- [REST API Documentation](docs/api-documentation.md)
- [Database Design & ERD](docs/database-design.md)
- [Local Setup & Runbook](docs/setup-guide.md)
- [Testing & Quality Guide](docs/testing-guide.md)
- [Production Deployment Guide](docs/deployment-guide.md)
- [Repository Cleanup Report](docs/cleanup-report.md)

---

## 11. Known Limitations & Future Roadmap

- **Facial Redaction:** Currently, images have GPS/EXIF metadata stripped; future iterations could introduce automated face-blurring for photos accidentally showing bystanders.
- **Push Notifications:** Handover OTPs and status changes are currently surfaced via the real-time web dashboard; integrating WhatsApp Business API or SMS gateway (Twilio) for campus mobile alerts is planned.
- **Campus Card RFID Integration:** Future phases could support scanning student RFID identity cards directly at campus security desks during physical handovers.

---

## 12. License & University Policy

Distributed under the [MIT License](LICENSE).  
The Lovely Professional University logo and campus branding are used solely for educational and administrative property recovery operations within the institution.
