# LPU Lost & Found — Backend REST API (`apps/api`)

The backend REST API for the **LPU Lost & Found (Campus Property Recovery Platform)**, built with Node.js, Express.js, TypeScript, Mongoose (MongoDB Atlas), and Zod.

---

## Architecture Overview

```
apps/api/
├── src/
│   ├── config/              # Env validation (Zod), MongoDB connection, Pino logger
│   ├── constants/           # Core enums (UserRole, ItemStatus, CustodyAction, etc.)
│   ├── controllers/         # Health & Auth controllers
│   ├── middleware/          # Auth (JWT/Cookie), RBAC, Validation (Zod), Rate limiting, Error handler
│   ├── models/              # 12 Mongoose Models (User, Item, PrivateDetail, Handover, etc.)
│   ├── routes/              # Express API versioned routes (/api/v1/...)
│   ├── schemas/             # Zod validation contracts
│   ├── utils/               # AES-256-GCM encryption, bcrypt hashing, OTP generator, ApiError
│   ├── app.ts               # Express application setup (CORS, Helmet, Parsers, Routes)
│   └── server.ts            # Server bootstrap & graceful shutdown
├── tests/
│   ├── unit/                # Crypto & Zod validation tests
│   └── integration/         # Health endpoint & Auth middleware tests
├── .env.example             # Template containing only placeholder configurations
├── tsconfig.json
└── package.json
```

---

## 12 Mongoose Domain Models

1. **`User`**: Account identity with role-based authorization (`STUDENT_STAFF`, `SECURITY_PERSONNEL`, `CAMPUS_ADMIN`, `SYSTEM_ADMIN`). Passwords hashed with bcrypt (10 rounds) and excluded from default queries.
2. **`Item`**: Public property records (Lost and Found) across campus blocks with retention expiry dates.
3. **`ItemCategory`**: Taxonomical categorization (Electronics, ID Cards, Wallets, Bags, etc.).
4. **`Location`**: Campus zone mapping (Block 30-38, Uni-Mall, Central Library, Hostels, etc.).
5. **`PrivateDetail`**: **Zero-Trust Private Vault**. Stored in a separate collection from public item listings. Encrypted at the application layer using **AES-256-GCM** (Ciphertext, IV, AuthTag).
6. **`MatchSuggestion`**: Explainable matching engine results with score breakdown and factor explanation.
7. **`Claim`**: Ownership recovery claims with private challenge questions and review states.
8. **`VerificationChallenge`**: Item-specific challenge questions with salted bcrypt-hashed expected answers.
9. **`CustodyRecord`**: Append-only physical custody ledger tracking lockers, intake, and station transfers.
10. **`Handover`**: Supervised collection protocol with expiring hashed 6-digit OTPs and physical ID inspection.
11. **`DisposalRecord`**: Statutory 90-day retention ageing and committee disposal board (Donation, Auction, Destruction).
12. **`AuditEntry`**: Append-only security audit trail recording all privileged actions without logging secrets.

---

## Security Safeguards

- **No Plaintext Passwords:** Hashed with bcrypt (10 rounds).
- **Application-Layer Encryption:** Sensitive item identifiers are encrypted using AES-256-GCM with a 32-byte secret key.
- **DTO Allow-Listing & toJSON Transformations:** `passwordHash`, `otpHash`, `hashedAnswer`, and `__v` are automatically stripped from outbound JSON serializations.
- **Strict Role-Based Authorization:** Endpoints enforce user permissions via `requireRoles()`.
- **Anti-Self-Approval Enforcement:** Security personnel cannot approve their own claims or items they ingested (`preventSelfApproval()`).
- **Sensitive-Data Log Redaction:** Structured logger automatically redacts passwords, tokens, cookies, OTPs, and private vault payloads.
- **Rate Limiting:** General API rate limiting (100 reqs/15m) and strict auth brute-force limiting (5 attempts/15m).

---

## Setup & Local Development

### Prerequisites
- Node.js (v20+ LTS)
- npm or pnpm
- MongoDB Atlas cluster URL or local MongoDB instance (`mongodb://127.0.0.1:27017/lpu_lost_found`)

### 1. Environment Configuration
Copy the template to `.env`:
```bash
cp .env.example .env
```
Update `.env` with your MongoDB connection string and generate secure secrets:
```bash
# Generate 32-byte hex key for AES-256-GCM field encryption:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Install Dependencies
From the monorepo root or `apps/api`:
```bash
npm install
```

### 3. Run Type-Check & Tests
```bash
# Run TypeScript compilation check
npm run typecheck

# Run unit and integration tests (Vitest)
npm run test
```

### 4. Start Development Server
```bash
npm run dev
```
The server will start on `http://localhost:5000/api/v1`.
- **Health Check:** `GET http://localhost:5000/api/v1/health`
- **Register:** `POST http://localhost:5000/api/v1/auth/register`
- **Login:** `POST http://localhost:5000/api/v1/auth/login`
- **Current User Profile:** `GET http://localhost:5000/api/v1/auth/me`
