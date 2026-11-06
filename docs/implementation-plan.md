# LPU Lost & Found — Campus Property Recovery Platform
## Comprehensive System Architecture & Phased Implementation Plan

**Document Version:** 1.0.0  
**Target Environment:** Lovely Professional University (LPU) Campus  
**Status:** Approved Architectural Specification & Baseline Plan  

---

## 1. Executive Summary & Architectural Overview

The **LPU Lost & Found (Campus Property Recovery Platform)** is an enterprise-grade, privacy-first property recovery system tailored specifically to the operational scale, geographic layout, and security hierarchy of Lovely Professional University (LPU).

With tens of thousands of students, faculty, and administrative staff across a massive campus (comprising academic blocks such as Block 30–38, Uni-Mall, Central Library, Indoor Sports Complex, residential hostels, food courts, and transit points), items are frequently misplaced. Traditional social media posts or noticeboards lead to rampant fraud, exposure of private identification data, unverified claims, and zero custody accountability.

This platform bridges this gap through:
1. **Zero-Trust Information Segregation**: Public search boards display strictly redacted item details, while sensitive identifiers (IMEIs, serial numbers, wallet contents, security lock screens) are encrypted into a restricted Private Vault accessible only to verified security personnel during active claim resolution.
2. **Explainable AI/Algorithmic Matching Engine**: Generates deterministic, weighted match suggestions between Lost and Found reports with transparent scoring breakdowns (Category, Campus Zone Proximity, Time Horizon, Tag/Keyword similarity).
3. **Multi-Stage Ownership Verification**: Claimants must provide verifiable challenge responses and evidentiary proof without being fed leading details.
4. **Supervised Handover Protocol**: Double-verification handover powered by cryptographically secure, expiring Time-based/One-Time PINs (OTPs) or digital sign-offs, with atomic locking to eliminate double-claims.
5. **Append-Only Chain of Custody & Audit Trails**: Every state change, physical desk transfer, locker intake, and administrative action is indelibly recorded.
6. **Statutory Retention & Disposal Lifecycle**: Automated ageing pipelines and administrative review boards for auction, donation, or responsible destruction of unrecovered items.

---

## 2. Monorepo Architecture & Directory Topology

The project is structured as an npm/pnpm workspaces monorepo to guarantee tight typing synchronization, shared validation schemas, and isolated deployment targets.

```
lpu-lost-and-found/
├── apps/
│   ├── api/                           # Express.js REST API (TypeScript)
│   │   ├── src/
│   │   │   ├── config/                # Environment, DB, Cloudinary/S3, rate-limit configs
│   │   │   ├── constants/             # LPU Locations, Categories, Status Enums
│   │   │   ├── controllers/           # Auth, Items, Claims, Handovers, Admin, Analytics
│   │   │   ├── dtos/                  # Inbound & Outbound Allow-listed Data Transfer Objects
│   │   │   ├── middleware/            # Auth, RBAC, Rate-limiters, Error handler, Request logger
│   │   │   ├── models/                # Mongoose schemas (User, Item, Claim, Handover, Custody, Audit)
│   │   │   ├── routes/                # Express versioned routers (/api/v1/...)
│   │   │   ├── services/              # Matching engine, Encryption service, Image processor, Audit service
│   │   │   ├── utils/                 # Cryptography, Token generator, Logger (Pino/Winston)
│   │   │   └── app.ts                 # Express application initialization
│   │   │   └── server.ts              # HTTP server bootstrap & graceful shutdown
│   │   ├── tests/
│   │   │   ├── unit/                  # Matching engine, encryption, DTO tests
│   │   │   └── integration/           # Supertest API endpoint tests
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── web/                           # Next.js App Router (TypeScript, Tailwind CSS)
│       ├── public/
│       │   ├── images/
│       │   │   ├── lpu-logo.png       # Official LPU logo (or configured placeholder)
│       │   │   └── placeholder.png    # Sanitized item placeholder
│       │   └── favicon.ico
│       ├── src/
│       │   ├── app/                   # App Router pages & route handlers
│       │   │   ├── (auth)/            # Login, Register, Forgot Password
│       │   │   ├── (public)/          # Public Search Board, Browse, Item Details, About
│       │   │   ├── (student)/         # My Reports, My Claims, File Lost/Found Report
│       │   │   ├── (security)/        # Security Intake Desk, Claims Queue, Handover Verification
│       │   │   ├── (admin)/           # Analytics, Item Ageing & Disposal, User Role Management, Audit Logs
│       │   │   ├── layout.tsx         # Root layout with authentic LPU branding & disclaimer
│       │   │   └── page.tsx           # Hero landing & quick-search portal
│       │   ├── components/
│       │   │   ├── branding/          # LPULogo, DisclaimerBadge, CampusHeader
│       │   │   ├── items/             # ItemCard, ItemGrid, RedactedItemBadge, SearchBar, FilterSheet
│       │   │   ├── claims/            # ClaimModal, ChallengeVerificationForm, ClaimTimeline
│       │   │   ├── handover/          # OtpVerificationModal, HandoverReceipt
│       │   │   ├── ui/                # Accessible design system components (Button, Modal, Input, etc.)
│       │   │   └── navigation/        # TopNav, Sidebar, RoleBasedNav, Footer
│       │   ├── hooks/                 # Custom React hooks (useAuth, useItems, useDebounce)
│       │   ├── lib/                   # API client (Axios/Fetch with HttpOnly cookies), utils, formatters
│       │   └── types/                 # Frontend TypeScript interfaces mirroring shared DTOs
│       ├── tailwind.config.ts         # LPU brand color palette & styling tokens
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   └── shared/                        # Shared cross-cutting contracts
│       ├── src/
│       │   ├── schemas/               # Zod validation schemas for Items, Claims, Auth
│       │   ├── types/                 # Shared TypeScript models and enums
│       │   └── constants/             # LPU Campus zones, buildings, categories
│       ├── package.json
│       └── tsconfig.json
│
├── docs/                              # Project technical documentation
│   ├── architecture.md               # High-level architecture & sequence diagrams
│   ├── api-specification.md          # Complete REST API contracts
│   ├── data-model.md                 # Detailed Mongoose schemas & indexes
│   ├── rbac-matrix.md                # Role permissions & security policies
│   ├── privacy-and-security.md       # Cryptographic protocols & DTO allow-listing
│   ├── lpu-campus-taxonomy.md        # LPU Blocks, Hostels, and Security Posts
│   └── implementation-plan.md        # This implementation plan and checklist
│
├── .gitignore
├── package.json                       # Monorepo root workspace configuration
└── README.md
```

---

## 3. Technology Stack & Package Dependencies

### 3.1 Backend (`apps/api`)
| Capability | Library / Tool | Justification |
| :--- | :--- | :--- |
| **Runtime & Framework** | Node.js (v20+ LTS), Express.js 4.x, TypeScript 5.x | Robust, event-driven, battle-tested REST API architecture. |
| **Database ODM** | Mongoose 8.x + MongoDB Atlas | Document model suits polymorphic item details, audit trails, and geospatial/compound queries. |
| **Validation** | Zod 3.x | Runtime schema enforcement for all incoming headers, params, and bodies. |
| **Security & Headers** | Helmet 7.x, CORS 2.x, HPP (HTTP Parameter Pollution) | Hardened HTTP response headers and protection against common OWASP vulnerabilities. |
| **Authentication & Crypto** | `jsonwebtoken`, `bcryptjs`, Node.js native `crypto` | Secure JWT transmission via `HttpOnly`, `SameSite=Strict` cookies; AES-256-GCM for field-level encryption. |
| **Rate Limiting** | `express-rate-limit`, `rate-limit-mongo` | DoS and brute-force mitigation on authentication, OTP generation, and reporting endpoints. |
| **Image Processing** | `sharp` 0.33.x | High-performance server-side image compression, EXIF stripping, metadata sanitization, and thumbnailing. |
| **Cloud Storage** | `cloudinary` (or AWS S3 SDK `@aws-sdk/client-s3`) | Secure asset hosting with signed uploads and private asset URLs. |
| **Logging & Monitoring** | `pino` + `pino-http` (or `winston`) | Structured JSON logging with automated redaction of sensitive parameters. |
| **Testing** | `vitest` or `jest`, `supertest`, `mongodb-memory-server` | Fast unit testing and isolated in-memory integration testing. |

### 3.2 Frontend (`apps/web`)
| Capability | Library / Tool | Justification |
| :--- | :--- | :--- |
| **Framework** | Next.js 14+ (App Router), React 18/19, TypeScript | Server Components for SEO and fast first-contentful paint; client components for interactive search & forms. |
| **Styling** | Tailwind CSS 3.4+, PostCSS, Autoprefixer | Rapid, utility-first design system customized with authentic LPU brand palette. |
| **Icons & Visuals** | `lucide-react` | Clean, lightweight, tree-shakeable icon library. |
| **Form Handling** | `react-hook-form` + `@hookform/resolvers/zod` | Performant, type-safe form validation matching backend Zod contracts. |
| **State & Fetching** | TanStack Query (React Query) or SWR | Declarative caching, revalidation, optimistic updates, and background synchronization. |
| **Animation & UX** | `framer-motion` | Smooth micro-interactions for modal dialogues, status transitions, and card expansions. |
| **Testing** | Playwright (E2E), React Testing Library (Component tests) | Comprehensive browser automation and regression prevention. |

---

## 4. Environment Variables Specification

All configuration is strictly governed by environment variables validated on startup via a central `env.ts` powered by Zod.

### 4.1 Backend (`apps/api/.env`)
```bash
# Server Runtime
NODE_ENV=development                 # 'development' | 'production' | 'test'
PORT=5000
API_PREFIX=/api/v1
CORS_ORIGIN=http://localhost:3000     # Production: set the actual Vercel origin after deployment

# Database
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/lpu_lost_found?retryWrites=true&w=majority

# Authentication & Sessions
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
JWT_EXPIRES_IN=7d
COOKIE_SECRET=cookie_signing_secret_random_32_bytes
REFRESH_TOKEN_SECRET=refresh_token_secret_random_32_bytes
REFRESH_TOKEN_EXPIRES_IN=30d

# Cryptographic Field Encryption (Vault for sensitive details)
# Must be a 32-byte hex string (64 characters) for AES-256-GCM
FIELD_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Media Storage (Cloudinary)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_FOLDER=lpu_lost_found

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000          # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100          # General endpoints
AUTH_RATE_LIMIT_MAX=5                # Failed login / OTP attempts

# Operational Retention Defaults
RETENTION_PERIOD_DAYS=90             # Days before unclaimed found items enter Ageing/Disposal queue
OTP_EXPIRY_MINUTES=15                # Valid duration for handover verification OTPs
```

### 4.2 Frontend (`apps/web/.env.local`)
```bash
# Public API URL
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_APP_NAME="LPU Lost & Found"
NEXT_PUBLIC_CAMPUS_NAME="Lovely Professional University"

# Feature Flags
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_AUTO_SUGGESTIONS=true
```

---

## 5. Domain Models & Database Schemas (Mongoose)

### 5.1 Enums & LPU Constants
- **UserRole**: `STUDENT_STAFF`, `SECURITY_PERSONNEL`, `CAMPUS_ADMIN`, `SYSTEM_ADMIN`
- **ItemType**: `LOST`, `FOUND`
- **ItemCategory**: `ELECTRONICS`, `STUDENT_ID_CARDS`, `WALLETS_PURSE`, `DOCUMENTS_BOOKS`, `KEYS`, `BAGS_BACKPACKS`, `CLOTHING_ACCESSORIES`, `SPORTS_EQUIPMENT`, `OTHERS`
- **ItemStatus**: 
  - `REPORTED` (Initial submission)
  - `IN_CUSTODY` (Physical item handed over to security post / locker)
  - `MATCH_PENDING` (Possible match identified by engine)
  - `CLAIM_IN_REVIEW` (Claim filed by user, security reviewing evidence)
  - `READY_FOR_HANDOVER` (Claim approved, OTP generated for physical desk collection)
  - `HANDED_OVER` (Verified and returned to legitimate owner)
  - `UNCLAIMED_EXPIRED` (Surpassed retention period, awaiting disposal)
  - `DISPOSED` (Auctioned, donated to campus welfare, or safely destroyed)
- **ClaimStatus**: `SUBMITTED`, `UNDER_REVIEW`, `CHALLENGE_REQUIRED`, `APPROVED`, `REJECTED`, `WITHDRAWN`, `COMPLETED`
- **LPUCampusZone**:
  - `BLOCK_30_38` (Academic - Engineering & Technology)
  - `BLOCK_55_58` (Academic - Management & Sciences)
  - `UNI_MALL` (Commercial Hub & Student Food Court)
  - `CENTRAL_LIBRARY` (Reading Halls & Digital Resource Labs)
  - `INDOOR_STADIUM_SHANTI_DEVI` (Sports Complex & Gymnasium)
  - `RESIDENTIAL_BOYS_BH` (BH-1 through BH-8)
  - `RESIDENTIAL_GIRLS_GH` (GH-1 through GH-6)
  - `MAIN_GATE_SECURITY` (Gate 1 & Gate 2 Transit Posts)
  - `ROBOPARK_BALDEV_RAJ_MITTAL` (Auditorium & Green Parks)
  - `OTHER_CAMPUS_AREA`

---

### 5.2 Schemas Definition

#### 1. `User` Schema
```typescript
interface IUser {
  _id: Types.ObjectId;
  registrationNumber: string;         // Unique (e.g., 12109845 for student or EMP-1092)
  fullName: string;
  email: string;                      // Must end with @lpu.in or @lpu.co.in (with override for temp security)
  passwordHash: string;
  role: 'STUDENT_STAFF' | 'SECURITY_PERSONNEL' | 'CAMPUS_ADMIN' | 'SYSTEM_ADMIN';
  phone?: string;
  departmentOrSchool?: string;
  securityPostLocation?: string;      // Mandatory if role === SECURITY_PERSONNEL (e.g., "Uni-Mall Desk")
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

#### 2. `Item` Schema (Redacted Public Data + Encrypted Private Vault Reference)
```typescript
interface IItem {
  _id: Types.ObjectId;
  referenceNumber: string;            // E.g., "LPU-2026-F0981"
  itemType: 'LOST' | 'FOUND';
  category: ItemCategory;
  title: string;                      // E.g., "Black HP Pavilion Laptop"
  publicDescription: string;          // Generalized sanitized description
  primaryImageUrl?: string;           // Sharp-processed, sanitised image (blurred sensitive areas)
  additionalImages: string[];
  
  // Location & Time
  campusZone: LPUCampusZone;
  specificLocationDetail: string;     // E.g., "Block 34, 3rd Floor, Lab 304"
  eventDate: Date;                    // Approximate date/time when lost or found
  
  // Reporter details
  reportedBy: Types.ObjectId;         // Ref: User
  reporterRole: UserRole;
  isReportedAnonymously: boolean;     // If true, public card hides name
  
  // Physical Custody
  status: ItemStatus;
  currentCustodyDesk?: string;        // E.g., "Security Post Gate 2"
  lockerStorageReference?: string;    // E.g., "Shelf B-4" (visible only to security)
  
  // Private Identifying Details (Encrypted Subdocument or separate vault)
  privateVault: {
    encryptedData: string;            // AES-256-GCM ciphertext
    iv: string;                       // Initialization vector (hex)
    authTag: string;                  // GCM auth tag (hex)
    fieldsEncryptedSummary: string[]; // List of fields enclosed (e.g., ["serialNumber", "engravings", "lockscreen_wallpaper"])
  };
  
  // Verification Challenges Configured by Reporter / Security
  verificationQuestions: {
    questionText: string;             // E.g., "What sticker is on the laptop lid?"
    hashedAnswer: string;             // Salted bcrypt hash of expected answer
  }[];

  // Lifecycle
  retentionExpiresAt: Date;           // Defaults to eventDate + RETENTION_PERIOD_DAYS
  createdAt: Date;
  updatedAt: Date;
}
```

#### 3. `Claim` Schema (Ownership Claims)
```typescript
interface IClaim {
  _id: Types.ObjectId;
  item: Types.ObjectId;               // Ref: Item
  claimant: Types.ObjectId;           // Ref: User
  claimStatus: ClaimStatus;
  
  // Private Proof Submitted by Claimant
  statementOfOwnership: string;
  challengeAnswers: {
    questionText: string;
    providedAnswer: string;           // Encrypted at rest
    isMatchedBySystem?: boolean;
  }[];
  privateEvidenceProofUrls: string[]; // Purchase invoice, serial receipt, IMEI box photos (Restricted access)
  
  // Reviewer Lifecycle
  reviewedBy?: Types.ObjectId;        // Ref: User (Must NOT be claimant or reporter)
  reviewedAt?: Date;
  reviewDecisionNotes?: string;       // Restricted to Security/Admin
  rejectionReason?: string;           // Sanitized reason returned to student
  
  // Verification Handover Link
  handoverRecord?: Types.ObjectId;    // Ref: Handover
  createdAt: Date;
  updatedAt: Date;
}
```

#### 4. `Handover` Schema (Supervised Physical Collection)
```typescript
interface IHandover {
  _id: Types.ObjectId;
  item: Types.ObjectId;               // Ref: Item
  claim: Types.ObjectId;              // Ref: Claim
  recipientUser: Types.ObjectId;      // Ref: User (The verified owner)
  supervisingOfficer: Types.ObjectId; // Ref: User (Security Personnel on duty)
  
  // Cryptographic OTP Verification
  otpHash: string;                    // 6-digit cryptographically random OTP hashed with bcrypt
  otpExpiresAt: Date;                 // 15-minute expiration
  otpAttemptsCount: number;           // Max 3 attempts before invalidation
  
  // Physical Verification Checklist
  physicalDeskLocation: string;       // E.g., "Block 38 Security Booth"
  recipientIdTypePresented: string;   // E.g., "LPU Student ID Card"
  recipientIdNumberRecorded: string;  // Masked (e.g., "1210****")
  recipientSignatureUrl?: string;     // Digital canvas signature or scanned signature
  
  isCompleted: boolean;
  completedAt?: Date;
  createdAt: Date;
}
```

#### 5. `CustodyLog` Schema (Append-Only Physical Custody Chain)
```typescript
interface ICustodyLog {
  _id: Types.ObjectId;
  item: Types.ObjectId;               // Ref: Item
  action: 'INITIAL_INTAKE' | 'TRANSFERRED_DESK' | 'STORED_IN_LOCKER' | 'INSPECTION' | 'HANDED_OVER' | 'DISPOSED';
  fromLocation?: string;
  toLocation: string;
  handledBy: Types.ObjectId;          // Ref: User
  remarks?: string;
  timestamp: Date;
}
```

#### 6. `AuditLog` Schema (Administrative Security Audit)
```typescript
interface IAuditLog {
  _id: Types.ObjectId;
  actor: Types.ObjectId;              // Ref: User
  actorRole: UserRole;
  ipAddress: string;
  userAgent: string;
  action: string;                     // E.g., "VIEW_PRIVATE_VAULT", "APPROVE_CLAIM", "DISPOSE_ITEM", "UPDATE_ROLE"
  targetEntity: 'USER' | 'ITEM' | 'CLAIM' | 'HANDOVER' | 'SYSTEM';
  targetId?: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  timestamp: Date;
}
```

---

## 6. Role-Based Access Control (RBAC) Matrix

| Resource / Endpoint | Student / Staff | Security Personnel | Campus Administrator | System Administrator |
| :--- | :---: | :---: | :---: | :---: |
| **Public Search Board (Redacted Item DTOs)** | ✅ Read Only | ✅ Read Only | ✅ Read Only | ✅ Read Only |
| **Report Lost Item** | ✅ Self | ✅ On behalf | ✅ On behalf | ✅ Full |
| **Report Found Item** | ✅ Self | ✅ Desk Intake | ✅ Desk Intake | ✅ Full |
| **View Unredacted Private Vault** | ❌ Forbidden | ✅ In Review Only | ✅ Authorized Audit | ✅ Audit |
| **Submit Ownership Claim** | ✅ For any Found item | ❌ Prohibited on duty | ❌ Prohibited on duty | ❌ Prohibited on duty |
| **Review & Approve/Reject Claims** | ❌ Forbidden | ✅ (No Self-Approval) | ✅ (Escalations) | ✅ (Escalations) |
| **Generate & Verify Handover OTP** | ❌ (Own OTP view only) | ✅ Validate & Handover | ✅ Supervise | ✅ Supervise |
| **Update Custody / Locker Location** | ❌ Forbidden | ✅ Assigned Desk | ✅ Any Desk | ✅ Full |
| **Access Disposal & Retention Queue** | ❌ Forbidden | ❌ Read Only | ✅ Approve Disposal | ✅ Configure Policy |
| **View System Audit Logs** | ❌ Forbidden | ❌ Forbidden | ✅ Read Only | ✅ Full |
| **User Role Assignment & Configuration** | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden | ✅ Full |

### 6.1 Conflict-of-Interest & Anti-Self-Approval Rules
- A security officer who originally reported finding an item **CANNOT** review claims submitted for that same item.
- No user (regardless of role) can approve an ownership claim submitted by their own account.
- Handover transactions require an active, logged-in `SECURITY_PERSONNEL` officer and an OTP supplied strictly to the verified claimant.

---

## 7. Security Architecture & Privacy Safeguards

### 7.1 Field-Level Encryption for Private Vault
- Sensitive identifiers (IMEI, device serial numbers, wallet currency amounts, engraved text, ID card numbers) are **never** stored in plaintext.
- Implementation: AES-256-GCM authenticated encryption using a dedicated 256-bit server key (`FIELD_ENCRYPTION_KEY`).
- Each encrypted payload contains an initialization vector (IV), the encrypted ciphertext, and an authentication tag (Auth Tag) ensuring integrity.

```
Plaintext JSON -> AES-256-GCM (IV + Key) -> { encryptedData, iv, authTag }
```

### 7.2 Strict Allow-Listed Data Transfer Objects (DTOs)
To prevent accidental over-fetching and data leaks:
- `PublicItemResponseDTO`: Only contains `_id`, `referenceNumber`, `itemType`, `category`, `title`, `publicDescription`, `primaryImageUrl`, `campusZone`, `eventDate`, `status`, `createdAt`.
- `verificationQuestions` are stripped of `hashedAnswer`.
- Claimant contacts, reporter identification (if anonymous), reviewer notes, and internal evidence URLs are completely absent from all public search and feed endpoints.

### 7.3 Image Privacy & Processing Pipeline
- Raw images uploaded by students or security are passed through `sharp`:
  1. Metadata and EXIF geo-tags are completely stripped.
  2. Dimensions normalized (max 1200x1200px) and converted to optimized WebP.
  3. Sensitive images (e.g., student ID cards, confidential papers) are flagged for blurring before public exposure.

---

## 8. Explainable Matching Engine

When a Lost or Found item is reported, an asynchronous matching engine evaluates candidate matches and calculates a normalized compatibility score ($0\% - 100\%$):

$$S_{\text{total}} = W_{\text{category}} \cdot S_{\text{cat}} + W_{\text{zone}} \cdot S_{\text{zone}} + W_{\text{time}} \cdot S_{\text{time}} + W_{\text{text}} \cdot S_{\text{text}}$$

### 8.1 Weighting Factors
1. **Category Compatibility ($W_{\text{cat}} = 0.35$)**:
   - Exact category match = $1.0$
   - Mismatched category = $0.0$ (immediate disqualification threshold)
2. **Campus Zone Proximity ($W_{\text{zone}} = 0.25$)**:
   - Exact campus zone match (e.g., both Block 34) = $1.0$
   - Adjacent zones (e.g., Block 30-38 Cluster vs Uni-Mall) = $0.7$
   - Different ends of campus = $0.2$
3. **Temporal Horizon ($W_{\text{time}} = 0.20$)**:
   - Found event occurred 0–24 hours after Lost event = $1.0$
   - 24–72 hours after = $0.75$
   - 3–7 days after = $0.50$
   - Found event occurred before Lost event = $0.0$ (logical impossibility)
4. **Keyword & Attribute Similarity ($W_{\text{text}} = 0.20$)**:
   - N-gram and token intersection of sanitized titles, colors, and brands (e.g., "HP", "blue", "Dell", "Titan").

### 8.2 Explainable Score Breakdown
Every suggestion returns a transparent summary for security personnel:
```json
{
  "matchScore": 86,
  "confidence": "HIGH",
  "explanation": {
    "categoryMatch": "Exact match (Electronics)",
    "locationProximity": "High (Block 34 vs Central Library)",
    "timeDeltaHours": 4.5,
    "matchingTokens": ["hp", "pavilion", "black"]
  }
}
```

---

## 9. Phased Implementation Roadmap & Master Checklist

### Phase 1: Workspace Initialization, Monorepo & Tooling Setup
- [x] Initialize monorepo workspace configuration (`package.json` with `workspaces: ["apps/*", "packages/*"]`).
- [x] Initialize `packages/shared` / types for TypeScript types and LPU constants.
- [x] Initialize `apps/api` with TypeScript, tsconfig paths, Express scaffolding, and dependencies.
- [x] Initialize `apps/web` with Next.js App Router, Tailwind CSS, Lucide icons, and dependencies.
- [x] Setup LPU brand design tokens in `apps/web`.
- [x] Create official LPU logo asset placeholder at `apps/web/public/images/lpu-logo.png` with documentation.
- [x] Setup Git ignore, environment templates (`.env.example`), and commit guidelines.

### Phase 2: Backend Core, Data Models & Security Foundations
- [x] Setup MongoDB Atlas connection via Mongoose with resilient retry logic and index verification.
- [x] Implement 12 Mongoose models: `User`, `Item`, `ItemCategory`, `Location`, `PrivateDetail`, `MatchSuggestion`, `Claim`, `VerificationChallenge`, `CustodyRecord`, `Handover`, `DisposalRecord`, `AuditEntry`.
- [x] Implement AES-256-GCM encryption/decryption utilities for the Private Vault.
- [x] Implement secure password hashing with `bcryptjs`.
- [x] Implement JWT / HttpOnly cookie session management and CSRF safeguards.
- [x] Implement RBAC middleware with permission checking and self-approval guards.
- [x] Implement centralized error handling middleware and structured JSON logger (Pino).
- [x] Implement rate-limiting middleware (`express-rate-limit`) for public, auth, and OTP endpoints.

### Phase 3: Item Ingestion, Redacted DTOs & Search Board API
- [x] Build Sharp image processing pipeline (EXIF/GPS stripping, resizing to 1200x1200px max, WebP conversion).
- [x] Build image upload service with safe local storage (`/uploads`) and resilient fallback.
- [x] Implement `POST /api/v1/items/lost` and `POST /api/v1/items/found` endpoints with Zod validation.
- [x] Implement `PATCH /api/v1/items/:id` allowing authorized owners to edit their eligible reports (403 for unauthorized users).
- [x] Implement Public Item DTO serializer with explicit allow-list ensuring zero leakage of private vault details.
- [x] Implement `GET /api/v1/items` with multi-filter search (category, campusZone, dateRange, status, keyword search) and server-side pagination.
- [x] Implement `GET /api/v1/items/:id` accessible detail endpoint returning sanitized public view or owner view.
- [x] Connect Next.js frontend to Express API via centralized typed API client (`apiClient`) and environment-based URL.
- [x] Integrate accessible item detail page (`/items/[id]`) with authentication-gated claim trigger.
- [x] Integrate report page (`/report`) with Sharp photo upload, client/server validation, and encrypted vault submission.
- [x] Integrate dashboard reports (`/dashboard/my-reports`) with report status tracking and owner editing modal.
- [x] 42 automated tests covering report creation, validation, unauthorized edits, upload failures, privacy boundary, and search.

### Phase 4: Matching Engine & Ownership Verification System
- [x] Build deterministic algorithmic matching service (`calculateMatchScore`) with explainable factor breakdown: Description (40%), Category (25%), Location Proximity (20%), Time Delta (15%).
- [x] Implement `GET /api/v1/items/:id/matches`, `POST /api/v1/items/:id/matches/refresh`, and `POST /api/v1/matches/refresh-all` (Restricted to item reporter & security, duplicate prevention, canonical ordering).
- [x] Implement Private Verification Challenge system (`VerificationChallenge` & `PrivateDetail` encrypted with AES-256-GCM, zero browser answer leaks, server bcrypt evaluation, max attempt limits, challenge expiry).
- [x] Implement `POST /api/v1/claims` for students to submit claims with challenge question answers and ownership statements.
- [x] Implement `POST /api/v1/claims/:id/challenges/:challengeId/answer` for multi-step challenge verification with attempt tracking.
- [x] Build Security Claims Review Queue (`GET /api/v1/claims/pending` and `/security/claims`) with private vault inspection (`POST /api/v1/items/:id/private-vault/view`).
- [x] Implement `PATCH /api/v1/claims/:id/review` (Approve with 48h Handover OTP generation, Reject with reason, auto-resolution of competing claims, anti-self-approval enforcement).
- [x] Implement immutable audit logging (`AuditEntry`) on all claim reviews and private vault decryptions.
- [x] Build Claimant Dashboard (`/dashboard/my-claims`) and Match Suggestions Board (`/dashboard/matches`) with explainable factor cards and refresh triggers.
- [x] 58 automated tests passing across 10 test suites (covering scoring weights, token overlap, answer verification, attempt locks, expired challenges, duplicate matches, anti-self-approval, competing claims, and zero privacy leaks).

### Phase 5: Supervised Handover, Chain of Custody & Disposal
- [x] Implement secure non-plaintext OTP system (6-digit numeric OTP, bcrypt `otpHash` for verification, AES-256-GCM cipher on claim for claimant view, zero plaintext OTP storage or logging).
- [x] Implement Handover verification endpoint (`POST /api/v1/handovers/verify-otp`) with attempt limits (5 max), expiry checking (48h TTL), physical ID verification, masked ID numbers, digital acknowledgement, and atomic consistent state updates (`HANDED_OVER`, `COMPLETED`, `isCompleted: true`).
- [x] Implement Duplicate Handover Guard preventing already handed over properties/claims from being processed a second time.
- [x] Implement append-only `CustodyRecord` ledger (`POST /api/v1/custody/transfer` and `GET /api/v1/custody/items/:id/history`) tracking actor, previous location, new location, locker reference, timestamp, remarks, and evidence reference.
- [x] Build Custody Inventory endpoint (`GET /api/v1/custody/inventory`) with search, category, location, and status filtering.
- [x] Build Security Operations Dashboard endpoints (`GET /api/v1/security/dashboard-stats` and `GET /api/v1/security/audit-trail`) providing live metrics and compliance event explorer.
- [x] Implement Security Frontend:
  - Security Reception Overview (`/security`) with live stat cards and recent audit activity.
  - Custody Inventory & Physical Movement Desk (`/security/custody`) with search, transfer modal, and timeline modal.
  - Supervised Handover Terminal (`/security/custody?tab=handover`) with pending handover queue, OTP verification, ID selector, certification, and printable Handover Receipt voucher.
  - Claims Adjudication Queue (`/security/claims`) with private vault inspection and anti-self-approval enforcement.
- [x] 74 automated tests passing across 11 test suites (covering role restrictions, failed OTP attempts, attempt lockout, expired OTPs, unapproved claim rejection, duplicate handover prevention, and custody audit logging).

### Phase 6: Campus Administration, Analytics, Retention & Disposal
- [x] Administrative Governance & RBAC:
  - Enforce role permissions across every administrative API (`CAMPUS_ADMIN`, `SYSTEM_ADMIN` allowed; `STUDENT_STAFF` and `SECURITY_PERSONNEL` strictly rejected with 403).
  - Manage item categories and campus locations with active toggles and configurable retention periods.
  - Manage campus user accounts, promote/assign `SECURITY_PERSONNEL` roles, assign station posts (`securityPost`), and toggle `isActive` statuses with anti-self-deactivation protections.
- [x] Analytics Engine:
  - Compute all metrics from live database records using clearly documented, non-hardcoded definitions.
  - Total lost and found reports (`totalLost`, `totalFound`, `totalReports`).
  - Items returned and verified return rate: `(itemsReturned / totalFound) * 100` with transparent formula documentation.
  - Median time to return: mathematically computed median duration from report creation to verified physical custody handover across handed-over items.
  - Pending claims and verification failure breakdown (failed challenges, failed OTP handovers, and rejected claims).
  - Inventory distribution by physical custody security desk.
  - Category distribution with percentage share.
  - Campus location hotspots (top 10 campus locations with lost vs found breakdown) and 24-hour hourly incident hotspots.
  - Unclaimed item volume and 4 ageing brackets: 0–30 days, 31–60 days, 61–90 days, and >90 days overdue.
- [x] Statutory Retention and Disposal:
  - Identify items exceeding configured category retention periods (default 90 days).
  - Ageing queue with computed escalation states: `IN_RETENTION`, `NOTICE_PERIOD`, `DISPOSAL_PENDING`, `DISPOSED`.
  - Enforce University Rule 26.4: **Never automatically dispose of an item merely because it is old.** Committee approval strictly required.
  - Formal disposal approval endpoint (`POST /api/v1/admin/disposal/approve`) creating `DisposalRecord` with committee justification/reason, approver ID, date, method (`DONATION`, `AUCTION`, `DESTRUCTION`, `RECYCLED`), and certificate/evidence reference URL.
  - Atomic item status transition to `DISPOSED`, append-only `CustodyRecord` with `CustodyAction.DISPOSED`, and immutable `AuditEntry` logging.
- [x] Authorized Compliance Audit History Explorer:
  - Authorized audit search endpoint (`GET /api/v1/admin/audit-logs`) with filters for action, actor, target entity, date range, and pagination.
  - Zero-exposure privacy guarantee: strict automated redaction stripping passwords, password hashes, OTP secrets, cryptographic tokens, and private verification challenge answers.
- [x] Frontend Implementation:
  - Campus Administration Overview (`/admin`) with live stat cards, navigation hubs, and recent audit stream.
  - Operational Analytics Dashboard (`/admin/analytics`) with interactive category distribution bars, custody desk inventory, location hotspots, 24h hourly distribution, and documented definitions.
  - Campus Property Inventory & Ageing Queue (`/admin/items`) with escalation state tabs, category retention editor, and formal Disposal Approval Modal.
  - User Permissions & Role Governance (`/admin/users`) with search, role filters, promotion modal, and security post station assignment.
  - Compliance Audit Trail Explorer (`/admin/audit`) with action/entity filters, date range inputs, pagination, and JSON metadata inspector.
- [x] 96 automated tests passing across 12 test suites (including 22 dedicated integration tests verifying RBAC, metric computations, escalation queues, disposal approvals, user role management, and audit redactor).

### Phase 7: Automated Testing, Documentation & Production Readiness Review
- [x] Backend Unit & Integration Tests (110 tests passing across 13 test suites):
  - Encryption/decryption integrity tests (`crypto.test.ts`).
  - Matching engine scoring accuracy tests (`matching-engine.test.ts`).
  - DTO leak protection and public allow-lists (`item-serializer.test.ts` & `security-idor-privacy.test.ts`).
  - RBAC, record ownership, IDOR prevention, and anti-self-approval security tests.
  - Handover OTP expiration, single-use redemption, and duplicate prevention (`custody-handover.test.ts`).
- [x] Frontend Build & Code Quality:
  - TypeScript zero-error typecheck (`tsc --noEmit`).
  - Next.js 16 App Router production build (`npm run build:web`, 19/19 routes compiled cleanly).
  - ESLint verification with React 19 standards (`npm run lint`).
  - Fixed variable hoisting and state synchronization warnings.
- [x] Live Deployment Smoke Tests:
  - Automated 7-point live production smoke testing harness (`scripts/deployment-smoke-test.mjs`).
  - Validates root greeting, healthcheck schema, sanitized public feeds, catalog endpoints, and unauthenticated 401 boundary guards.
- [x] Deployment Configurations:
  - Multi-stage Dockerfile with Sharp libvips and unprivileged user (`apps/api/Dockerfile`).
  - Render Infrastructure-as-Code blueprint (`apps/api/render.yaml`).
  - Vercel Next.js deployment configuration with strict security headers (`apps/web/vercel.json`).
  - Environment variable templates (`.env.example` for both apps).
  - Comprehensive root `.gitignore` shielding credentials and uploaded media.
  - MongoDB Atlas index synchronizer (`scripts/setup-db-indexes.mjs`).
- [x] Complete System Documentation:
  - Root `README.md` covering architecture, demo accounts, verification suites, and features.
  - `docs/deployment-and-operations.md` covering topologies, variables, Atlas backup/recovery, and smoke testing.
  - `docs/implementation-plan.md` phase milestones.

---

## 10. Architectural Validation & Guarantees

1. **Information Leakage Prevention**: Verified through automated Supertest specs asserting that fields `privateVault`, `passwordHash`, `verificationQuestions.hashedAnswer`, and `otpHash` are never present in public DTO serializations.
2. **Race-Condition Safe Handovers**: Handover execution utilizes MongoDB atomic transactions (`session.withTransaction`) or atomic `findOneAndUpdate({ _id, status: 'READY_FOR_HANDOVER' })` preventing concurrent duplicate redemptions.
3. **Auditability**: All actions that read encrypted private data or change item custody generate immutable `AuditLog` and `CustodyLog` records with actor IDs, IP addresses, and timestamps.
4. **Campus Tailoring**: Specific LPU campus zones and security posts ensure zero ambiguity regarding physical item disposition.
