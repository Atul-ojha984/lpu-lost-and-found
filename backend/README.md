# LPU Lost & Found Property Recovery Platform — Backend API

Enterprise-grade Django REST Framework backend powering the Lovely Professional University (LPU) Lost & Found Property Recovery Platform.

## 1. Overview & Architecture

- **Framework:** Python 3.14 / Django 5.2.18 / Django REST Framework 3.15.2
- **Database:** PostgreSQL 16 (production) / SQLite with WAL mode (local development & testing)
- **Authentication:** JWT (JSON Web Tokens via `djangorestframework-simplejwt`) with HTTP-only secure cookie support and Bcrypt password hashing
- **API Documentation:** OpenAPI 3.0 via `drf-spectacular` (interactive Swagger UI & Redoc)
- **Security & Cryptography:** 
  - Symmetric AES-128-CBC / Fernet field-level encryption for private item verification vaults
  - In-memory EXIF and GPS metadata stripping for uploaded property images via Pillow
  - Single-use 6-digit cryptographic OTPs for supervised physical item handovers
  - Anti-self-claim invariants and strict multi-role permission guards (`STUDENT_STAFF`, `SECURITY_OFFICER`, `ADMIN`)

---

## 2. Directory Structure

```text
backend/
├── config/                  # Django project configuration & settings
│   ├── settings.py          # Unified environment-driven settings (dj-database-url, CORS, JWT)
│   ├── urls.py              # Root API URL routing & OpenAPI schema endpoints
│   ├── wsgi.py              # WSGI entrypoint for production servers (Gunicorn)
│   └── asgi.py              # ASGI entrypoint
├── apps/                    # Modular Django domain apps
│   ├── accounts/            # User authentication, roles, registration & profiles
│   ├── items/               # Lost/Found property reporting, public board & search
│   ├── locations/           # Campus zones, buildings, blocks & drop points
│   ├── matching/            # Heuristic multi-factor matching engine
│   ├── claims/              # Ownership claims & challenge verification
│   ├── custody/             # Security officer property logging & custody logs
│   ├── handovers/           # Supervised handovers with OTP verification & audit receipts
│   ├── analytics/           # Campus resolution metrics & loss trends
│   └── audit/               # Immutable compliance audit log
├── tests/                   # Pytest automated test suite (54 test cases)
├── manage.py                # Django CLI entrypoint
├── requirements.txt         # Production & development Python dependencies
├── pytest.ini               # Pytest configuration
├── .env.example             # Sanitized environment configuration template
└── README.md                # Backend documentation
```

---

## 3. Prerequisites

- Python 3.12+ (tested up to Python 3.14.6)
- Git
- Virtual environment (`venv`)

---

## 4. Setup & Local Development

### 4.1 Create & Activate Virtual Environment

```bash
# Windows (PowerShell)
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Linux / macOS
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

### 4.2 Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4.3 Configure Environment Variables

Copy the sanitized template:

```bash
cp .env.example .env
```

Key environment settings:
- `DEBUG=True` (for local development)
- `SECRET_KEY`: Set to a random secret string.
- `DATABASE_URL`: Defaults to `sqlite:///db.sqlite3` for local development. Use `postgresql://user:pass@host:5432/dbname` in production.
- `JWT_SIGNING_KEY`: Minimum 32-character secret for JWT tokens.
- `FIELD_ENCRYPTION_KEY`: 64-hex-character (32-byte) key for private vault field encryption.

### 4.4 Run Database Migrations

```bash
python manage.py migrate
```

### 4.5 Seed Development Personas (Optional)

```bash
python manage.py seed_demo_data
```

Creates test accounts:
- Student: `student@lpu.co.in` / `StudentPass@2026`
- Security Officer: `security@lpu.co.in` / `SecurityPass@2026`
- Admin: `admin@lpu.co.in` / `AdminPass@2026`

### 4.6 Start Development Server

```bash
python manage.py runserver 127.0.0.1:8000
```

The API will be available at `http://127.0.0.1:8000/api/v1/`.

---

## 5. API Documentation

Interactive API explorers are accessible when the server is running:
- **Swagger UI:** `http://127.0.0.1:8000/api/schema/swagger-ui/`
- **ReDoc:** `http://127.0.0.1:8000/api/schema/redoc/`
- **OpenAPI Schema (YAML):** `http://127.0.0.1:8000/api/schema/`

---

## 6. Testing

The backend includes a comprehensive pytest suite covering model constraints, RBAC, JWT authentication, matching algorithms, cryptographic privacy vaults, and end-to-end multi-actor handovers:

```bash
# Run all tests
pytest tests/ -v

# Run via monorepo script from root
npm run test:django
```

System check:
```bash
python manage.py check
```
