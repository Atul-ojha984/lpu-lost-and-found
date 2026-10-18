# Local Setup & Development Guide: LPU Lost & Found

This guide provides end-to-end instructions for configuring, running, and testing the LPU Lost & Found Management System locally on Windows, macOS, or Linux.

---

## 1. Prerequisites

Ensure you have the following installed on your machine:
- **Node.js:** v20.x or v22.x LTS ([Download](https://nodejs.org/))
- **npm:** v10.x+ (bundled with Node.js)
- **Python:** v3.12 to v3.14 ([Download](https://www.python.org/))
- **Git:** v2.30+ ([Download](https://git-scm.com/))

---

## 2. Clone the Repository

```bash
git clone <repository_url>
cd lpu-lost-and-found
```

---

## 3. Backend Setup (Django REST Framework)

### 3.1 Create Virtual Environment & Install Dependencies

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# Windows (CMD):
.\.venv\Scripts\activate.bat
# macOS / Linux:
source .venv/bin/activate

# Upgrade pip and install requirements
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 3.2 Configure Environment Variables

```bash
# In backend/ directory
cp .env.example .env
```

The default values in `.env.example` are pre-configured for instant local development with SQLite. No external database server is required for local testing.

### 3.3 Apply Migrations & Seed Demo Data

```bash
# Verify system integrity
python manage.py check

# Run migrations to build the SQLite database
python manage.py migrate

# Seed initial campus categories, locations, and demo personas
python manage.py seed_demo_data
```

Demo credentials created:
- **Student Persona:** `student@lpu.co.in` / `StudentPass@2026`
- **Security Officer Persona:** `security@lpu.co.in` / `SecurityPass@2026`
- **Administrator Persona:** `admin@lpu.co.in` / `AdminPass@2026`

### 3.4 Start Backend Server

```bash
python manage.py runserver 127.0.0.1:8000
```

The Django REST API is live at `http://127.0.0.1:8000/api/v1/`.

---

## 4. Frontend Setup (Next.js 16)

Open a new terminal window at the repository root.

### 4.1 Install Monorepo Dependencies

```bash
npm install
```

### 4.2 Configure Frontend Environment

```bash
# In apps/web/ directory
cp apps/web/.env.example apps/web/.env.local
```

Ensure `NEXT_PUBLIC_API_URL` points to your local Django server:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### 4.3 Start Next.js Development Server

```bash
npm run dev
# or: npm --workspace=apps/web run dev
```

The web application is now live at `http://localhost:3000`.

---

## 5. Verification Commands

Run the full project health check suite from the repository root:

```bash
# 1. Frontend TypeScript compiler check
npm run typecheck:web

# 2. Frontend ESLint code hygiene check
npm run lint

# 3. Frontend production build with Turbopack
npm run build:web

# 4. Django system check
npm run check:django

# 5. Full backend pytest suite (54 tests)
npm run test:django

# 6. Deployment API smoke test (requires backend running on :8000)
npm run smoke:api http://localhost:8000

# 7. End-to-end multi-actor workflow test
npm run smoke:e2e http://localhost:8000/api/v1
```
