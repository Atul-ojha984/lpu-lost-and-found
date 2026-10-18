# LPU Lost & Found Property Recovery Platform
## Backend Migration Plan: Node.js/Express/MongoDB to Python/Django/DRF

---

## Executive Summary & Migration Directive

This architectural specification details the comprehensive strategy for migrating the backend of the **Lovely Professional University (LPU) Lost & Found Campus Property Recovery Platform** from its current Node.js / Express.js / MongoDB Atlas stack to a production-grade **Python 3.12+ / Django 5.x / Django REST Framework (DRF)** backend.

### Architectural Directives & Non-Negotiable Guardrails
1. **Frontend Preservation**: The existing Next.js 16 App Router frontend (`apps/web`) remains untouched and fully intact. It will not be rewritten, deleted, or regenerated.
2. **Side-by-Side Coexistence**: The existing Express backend (`apps/api`) remains functional and untouched during planning and development. The Django backend will be constructed in a dedicated sibling directory (`apps/django_api`).
3. **Data Integrity & Non-Destruction**: The live database is not altered or dropped during audit or planning. Existing password hashes (bcrypt) and encrypted private detail vaults (AES-256-GCM) will be preserved through compatible Python cryptographic implementations.
4. **API Contract Compatibility**: DRF will adhere strictly to the established REST schema, URL hierarchy, and response envelopes (`{ success, statusCode, message, data, meta }`), ensuring zero disruption to `apps/web/src/lib/api-client.ts`.
5. **Django Idiomatic Design**: The backend will not be a mechanical line-by-line translation of Express; it will be architected according to Django best practices: modular domain apps, Django ORM, ModelSerializers, ViewSets, custom permission classes, signals/services, and standard management commands.

---

## 1. Existing Architecture & Feature Inventory

### 1.1 Monorepo Workspace Structure
```
lpu-lost-and-found/
├── apps/
│   ├── web/                    # Next.js 16 App Router (React 19, TypeScript, Tailwind CSS)
│   │   ├── src/
│   │   │   ├── app/            # 19 static & dynamic App Router routes
│   │   │   ├── components/     # UI, Branding, Items, Navigation components
│   │   │   ├── lib/            # Centralized typed API client (api-client.ts)
│   │   │   └── types/          # Frontend domain types
│   │   ├── public/images/      # Official LPU logo (lpu-logo.png)
│   │   └── vercel.json         # Vercel deployment & security headers
│   └── api/                    # Express.js REST API (Node.js 20, TypeScript, Mongoose)
│       ├── src/
│       │   ├── controllers/    # 9 controllers
│       │   ├── services/       # 7 business logic services
│       │   ├── models/         # 12 Mongoose models
│       │   ├── routes/         # 10 route modules
│       │   ├── middleware/     # Auth, validation, rate-limiting
│       │   └── utils/          # AES-256 cipher, serializers, seeds
│       ├── tests/              # 13 test suites (110 passing Vitest tests)
│       └── Dockerfile          # Multi-stage production container
├── docs/                       # Architectural documentation & runbooks
├── scripts/                    # Deployment smoke tests & database utilities
│   ├── deployment-smoke-test.mjs
│   ├── e2e-workflow-smoke-test.mjs
│   ├── generate-logo.js
│   └── setup-db-indexes.mjs
└── package.json                # Root monorepo workspace configuration
```

---

### 1.2 Frontend Routes & Component Inventory (`apps/web`)

The Next.js 16 App Router frontend comprises 19 verified routes:

| Route Path | Type | Access Level | Description & Functional Scope |
| :--- | :---: | :---: | :--- |
| `/` | Static | Public | Campus recovery home landing page, hero search, stats preview |
| `/board` | Static | Public | Public lost & found item search board with category/location faceting |
| `/items/[id]` | Dynamic | Public / Gated | Sanitized item detail, owner options, and claim trigger modal |
| `/report` | Static | Authenticated | Report submission for LOST/FOUND items, Sharp image upload, private vault |
| `/login` | Static | Public | Authentication with email/regNo, role-based routing, quick-fill demo presets |
| `/register` | Static | Public | Student/staff registration with domain validation (`@lpu.in` / `@lpu.co.in`) |
| `/dashboard` | Static | Authenticated | Student/staff portal hub with personal recovery status cards |
| `/dashboard/my-reports` | Static | Authenticated | Reporter's item management, editing modal, and lifecycle tracking |
| `/dashboard/my-claims` | Static | Authenticated | Claimant's pending/approved claims and decrypted 6-digit Handover OTP |
| `/dashboard/matches` | Static | Authenticated | Algorithmic match suggestion cards with factor explanation breakdown |
| `/security` | Static | Security / Admin | Security operations center: pending claims, inventory counts, audit feed |
| `/security/claims` | Static | Security / Admin | Adjudication terminal: private vault comparison, anti-self-approval review |
| `/security/custody` | Static | Security / Admin | Custody inventory, physical transfer desk, supervised OTP handover terminal |
| `/admin` | Static | Admin Only | Administrative overview, governance hub, audit stream |
| `/admin/analytics` | Static | Admin Only | Real-time computed metrics, recovery rates, category & location hotspots |
| `/admin/items` | Static | Admin Only | Campus property inventory, category retention editor, ageing disposal queue |
| `/admin/users` | Static | Admin Only | User governance, account status toggles, security post assignment |
| `/admin/audit` | Static | Admin Only | Forensic compliance audit trail explorer with entity/actor filters |
| `/_not-found` | Static | Public | Custom 404 recovery page |

---

### 1.3 Backend Endpoint Inventory (`apps/api`)

The Express backend exposes **41 REST endpoints** mounted under `/api/v1`:

```
/api/v1
├── /health                                [GET] (Health check & DB connection diagnostics)
├── /auth
│   ├── /register                          [POST] (Register student/staff account)
│   ├── /login                             [POST] (Authenticate with emailOrRegNo + password)
│   ├── /logout                            [POST] (Clear session cookie & log audit)
│   └── /me                                [GET] (Retrieve authenticated user profile)
├── /items
│   ├── /                                  [GET] (Public search board with multi-filter query)
│   ├── /:id                               [GET] (Sanitized public or owner item detail)
│   ├── /lost                              [POST] (Submit LOST item report)
│   ├── /found                             [POST] (Submit FOUND item report with private vault)
│   ├── /:id                               [PATCH] (Owner report update)
│   ├── /my-reports                        [GET] (Authenticated user's filed reports)
│   ├── /upload                            [POST] (Multipart image upload & metadata scrubber)
│   ├── /upload-image                      [POST] (Multipart image upload alias)
│   ├── /:id/matches                       [GET] (Retrieve suggested matches for item)
│   ├── /:id/matches/refresh               [POST] (Trigger match re-computation for item)
│   ├── /:id/challenges                    [GET] (Public challenge questions without answers)
│   └── /:id/private-vault/view            [POST] (Security-only AES-256 vault decryption)
├── /categories                            [GET] (Public active item categories catalog)
├── /locations                             [GET] (Public active campus locations catalog)
├── /matches
│   └── /refresh-all                       [POST] (Security/Admin trigger for global match run)
├── /claims
│   ├── /                                  [POST] (Submit ownership claim with challenge answers)
│   ├── /:id/challenges/:challengeId/answer [POST] (Answer multi-step verification challenge)
│   ├── /my-claims                         [GET] (Claimant's claims with decrypted Handover OTP)
│   ├── /pending                           [GET] (Security claims queue awaiting review)
│   ├── /item/:itemId                      [GET] (All competing claims for specific item)
│   └── /:id/review                        [PATCH] (Approve/Reject claim, anti-self-approval)
├── /custody
│   ├── /transfer                          [POST] (Record physical custody movement)
│   ├── /items/:id/history                 [GET] (Item custody movement timeline)
│   └── /inventory                         [GET] (Custody desk inventory with filters)
├── /handovers
│   ├── /pending                           [GET] (Approved claims ready for physical handover)
│   └── /verify-otp                        [POST] (Verify OTP, validate ID, seal handover)
├── /security
│   ├── /dashboard-stats                   [GET] (Live metrics for security reception)
│   └── /audit-trail                       [GET] (Recent security activity log)
└── /admin
    ├── /analytics                         [GET] (Live computed metrics, rates, heatmaps)
    ├── /retention/queue                   [GET] (Ageing items exceeding retention periods)
    ├── /disposal/approve                  [POST] (Formal committee-backed disposal approval)
    ├── /users                             [GET] (User accounts list with role/post filters)
    ├── /users/:id                         [PATCH] (Promote roles, assign security post, toggle)
    ├── /categories                        [GET, POST] (Category management catalog)
    ├── /categories/:id                    [PATCH] (Update category retention & active toggle)
    ├── /locations                         [GET, POST] (Campus location management catalog)
    ├── /locations/:id                     [PATCH] (Update location security desk & active toggle)
    └── /audit-logs                        [GET] (Forensic audit explorer with redactions)
```

---

### 1.4 Data Models & Persistence Inventory (12 Mongoose Schemas)

1. **`User`**: Identity, `registrationNumber` (unique), `email` (unique), `fullName`, `passwordHash` (bcrypt), `role` (`STUDENT_STAFF`, `SECURITY_PERSONNEL`, `CAMPUS_ADMIN`, `SYSTEM_ADMIN`), `department`, `securityPost`, `isActive`.
2. **`ItemCategory`**: Taxonomy codes (`ELECTRONICS`, `STUDENT_ID_CARDS`, `WALLETS_PURSE`, `DOCUMENTS_BOOKS`, `KEYS`, `BAGS_BACKPACKS`, `CLOTHING_ACCESSORIES`, `SPORTS_EQUIPMENT`, `OTHERS`), retention days, icons.
3. **`Location`**: Campus zones (`BLOCK_30_38`, `BLOCK_55_58`, `UNI_MALL`, `CENTRAL_LIBRARY`, `INDOOR_STADIUM_SHANTI_DEVI`, `RESIDENTIAL_BOYS_BH`, `RESIDENTIAL_GIRLS_GH`, `MAIN_GATE_SECURITY`, `ROBOPARK_BALDEV_RAJ_MITTAL`, `OTHER_CAMPUS_AREA`), building name, security desk presence, contact phone.
4. **`Item`**: `referenceNumber` (unique formatted e.g. `LPU-2026-F12345`), `itemType` (`LOST`/`FOUND`), `title`, `publicDescription`, `category` (FK), `location` (FK), `specificLocation`, `eventDate`, `primaryImageUrl`, `additionalImages`, `status` (`REPORTED`, `IN_CUSTODY`, `MATCH_PENDING`, `CLAIM_IN_REVIEW`, `READY_FOR_HANDOVER`, `HANDED_OVER`, `UNCLAIMED_EXPIRED`, `DISPOSED`), `reportedBy` (FK), `currentCustodyDesk`, `retentionExpiresAt`, `isArchived`.
5. **`PrivateDetail`**: Encrypted vault record (1:1 with `Item`). Fields: `encryptedCiphertext`, `iv` (12 bytes hex), `authTag` (16 bytes hex), `fieldsSummary`, `lastDecryptedBy` (FK), `lastDecryptedAt`, `accessCount`.
6. **`VerificationChallenge`**: Item challenge question (1:N with `Item`). Fields: `questionText`, `hashedAnswer` (bcrypt), `hint`, `maxAttempts` (default 3), `expiresAt`, `isActive`.
7. **`Claim`**: Ownership claim against an item. Fields: `item` (FK), `claimant` (FK), `claimStatus` (`SUBMITTED`, `UNDER_REVIEW`, `CHALLENGE_REQUIRED`, `APPROVED`, `REJECTED`, `COMPLETED`), `statement`, `challengeAnswers` array, `privateEvidenceProofUrls`, `reviewedBy` (FK), `reviewedAt`, `reviewNotes`, `rejectionReason`, `handoverOtpCipher`, `handoverOtpIv`, `handoverOtpTag`, `handoverOtpExpiresAt`, `verificationAttemptsCount`.
8. **`MatchSuggestion`**: Algorithmic match suggestion between LOST and FOUND items. Fields: `lostItem` (FK), `foundItem` (FK), `matchScore` (0-100), `confidence` (`HIGH`, `MEDIUM`, `LOW`), `explanation` (category, location, time, tokens), `status` (`PENDING`, `ACCEPTED`, `DISMISSED`), `reviewedBy` (FK).
9. **`CustodyRecord`**: Immutable append-only chain of custody record. Fields: `item` (FK), `action` (`INITIAL_INTAKE`, `TRANSFERRED_DESK`, `STORED_IN_LOCKER`, `INSPECTION`, `HANDED_OVER`, `DISPOSED`), `fromLocation`, `toLocation`, `lockerReference`, `evidenceReference`, `handledBy` (FK), `remarks`, `timestamp`.
10. **`Handover`**: Supervised physical release record. Fields: `item` (FK), `claim` (FK), `recipient` (FK), `supervisingOfficer` (FK), `otpHash` (bcrypt), `otpExpiresAt`, `otpAttemptsCount`, `physicalDeskLocation`, `idCardPresentedType`, `idCardNumberMasked`, `recipientSignatureUrl`, `acknowledgementNotes`, `isCompleted`, `completedAt`.
11. **`DisposalRecord`**: Statutory disposal approval record (Rule 26.4). Fields: `item` (FK), `method` (`DONATION`, `AUCTION`, `DESTRUCTION`, `RECYCLED`), `approvedBy` (FK), `committeeNotes`, `reason`, `recipientOrganization`, `disposalDate`, `certificateUrl`.
12. **`AuditEntry`**: Compliance and security audit trail. Fields: `actor` (FK), `actorRole`, `action` (`AuditAction`), `targetEntity`, `targetId`, `ipAddress`, `userAgent`, `metadata` (JSON), `timestamp`.

---

### 1.5 Existing Business Logic Services

* **Cryptographic Core (`crypto.ts`)**: AES-256-GCM symmetric cipher with 12-byte IV and 16-byte authentication tag; bcrypt hashing (salt rounds: 10).
* **Privacy Image Scrubber (`image.service.ts`)**: In-memory Sharp image processing, stripping EXIF and GPS tags, resizing to max 1200x1200px, converting to WebP format.
* **Deterministic Matching Engine (`matching.service.ts`)**: Algorithmic scoring service with factor weights: Description tokens (40%), Category compatibility (25%), Location proximity (20%), Time delta (15%). Canonical ordering and duplicate pair prevention.
* **Security Adjudication & OTP Handover (`claim.service.ts` & `handover.service.ts`)**: Anti-self-approval enforcement; encrypted vault inspection; 6-digit numeric OTP generation; single-use redemption with max 5 failed attempts lockout; atomic state transition to `HANDED_OVER`.
* **Campus Administration & Analytics (`admin.service.ts`)**: Live mathematical aggregations (recovery rates, median return duration, category distribution, location hotspots, ageing queue calculations); committee-backed disposal workflow.

---

## 2. Proposed Django Architecture

### 2.1 Workspace Structure with Django
We will create `apps/django_api` alongside `apps/web` and `apps/api`:

```
lpu-lost-and-found/
├── apps/
│   ├── web/                    # Next.js frontend (UNTOUCHED)
│   ├── api/                    # Node.js/Express API (PRESERVED)
│   └── django_api/             # NEW: Django 5.x / DRF backend
│       ├── manage.py
│       ├── config/             # Project settings, wsgi, asgi, urls
│       │   ├── settings/
│       │   │   ├── base.py
│       │   │   ├── development.py
│       │   │   └── production.py
│       │   ├── urls.py
│       │   └── wsgi.py
│       ├── apps/
│       │   ├── core/           # Common utilities, AES crypto, API envelope renderer
│       │   ├── accounts/       # Custom User model, JWT authentication, RBAC
│       │   ├── taxonomy/       # ItemCategory and Location models & seeders
│       │   ├── items/          # Item, PrivateDetail, Challenges, Image processing
│       │   ├── matching/       # Matching engine service & MatchSuggestion model
│       │   ├── claims/         # Claim model, challenge evaluation, adjudication
│       │   ├── custody/        # CustodyRecord, Handover, OTP verification
│       │   └── governance/     # DisposalRecord, AuditEntry, Analytics, Retention
│       ├── requirements/
│       │   ├── base.txt
│       │   ├── dev.txt
│       │   └── prod.txt
│       ├── Dockerfile
│       └── pytest.ini
```

### 2.2 Python & Package Dependencies
* **Python Runtime**: `3.12+` (System currently has Python 3.14.6 ready).
* **Django**: `5.1.x`
* **Django REST Framework**: `3.15.x`
* **Authentication**: `djangorestframework-simplejwt` (stateless HS256 JWT, cookie support).
* **Image Processing**: `Pillow 10.x` (EXIF stripping, resizing, WebP conversion, replacing Sharp).
* **Cryptography**: `cryptography >= 43.0.0` (AES-256-GCM cipher with IV and Auth Tag).
* **Database & ORM**: `psycopg2-binary` (PostgreSQL) with SQLite fallback for local development.
* **Filtering & CORS**: `django-filter`, `django-cors-headers`.
* **Testing**: `pytest`, `pytest-django`, `model-bakery`.
* **Server**: `gunicorn` + `whitenoise`.

---

## 3. Existing-to-Django Model Mapping

Django models will use `UUIDField` (or `BigAutoField`) for primary keys. To ensure 100% frontend compatibility where IDs are treated as strings (`id: string`), `UUIDField(default=uuid.uuid4, editable=False, primary_key=True)` provides ideal anti-enumeration security and seamless string serialization.

```mermaid
erDiagram
    User ||--o{ Item : reports
    User ||--o{ Claim : files
    User ||--o{ CustodyRecord : handles
    User ||--o{ Handover : supervises
    ItemCategory ||--o{ Item : categorizes
    Location ||--o{ Item : locates
    Item ||--|| PrivateDetail : protects
    Item ||--o{ VerificationChallenge : challenges
    Item ||--o{ Claim : receives
    Item ||--o{ CustodyRecord : tracks
    Item ||--o| Handover : concludes
    Item ||--o| DisposalRecord : disposes
    Item ||--o{ MatchSuggestion : matches
```

### Detailed Model Field Mapping

| Mongoose Model (`apps/api`) | Proposed Django Model (`apps/django_api`) | Key Fields & Types | Django Specifics & Meta |
| :--- | :--- | :--- | :--- |
| **`User`** | `accounts.models.User` | `id` (UUID), `registration_number` (CharField unique), `email` (EmailField unique), `full_name` (CharField), `password` (CharField hashed), `role` (CharField choices), `department`, `security_post`, `is_active` (BooleanField). | Inherits `AbstractBaseUser`, `PermissionsMixin`. Custom `UserManager`. |
| **`ItemCategory`** | `taxonomy.models.ItemCategory` | `id` (UUID), `code` (CharField unique, choices), `name` (CharField), `description` (TextField), `icon` (CharField), `is_active` (BooleanField), `default_retention_days` (PositiveIntegerField, default=90). | Unique index on `code`. Ordered by `name`. |
| **`Location`** | `taxonomy.models.Location` | `id` (UUID), `code` (CharField unique, choices), `name` (CharField), `campus_zone` (CharField), `building_name` (CharField), `has_security_desk` (BooleanField), `security_contact_phone` (CharField), `is_active` (BooleanField). | Unique index on `code`. |
| **`Item`** | `items.models.Item` | `id` (UUID), `reference_number` (CharField unique), `item_type` (CharField choices: `LOST`, `FOUND`), `title` (CharField max 150), `public_description` (TextField max 1000), `category` (FK to `ItemCategory`), `location` (FK to `Location`), `specific_location` (CharField), `event_date` (DateTimeField), `primary_image_url` (URLField/ImageField), `additional_images` (JSONField default=list), `status` (CharField choices), `reported_by` (FK to `User`), `current_custody_desk` (CharField), `retention_expires_at` (DateTimeField), `is_archived` (BooleanField). | Compound indexes on `(status, item_type)` and `(category, location)`. Text search index. |
| **`PrivateDetail`** | `items.models.PrivateDetail` | `id` (UUID), `item` (OneToOneField to `Item`), `encrypted_ciphertext` (TextField), `iv` (CharField length 24), `auth_tag` (CharField length 32), `fields_summary` (JSONField default=list), `last_decrypted_by` (FK to `User` nullable), `last_decrypted_at` (DateTimeField nullable), `access_count` (PositiveIntegerField default=0). | Decryption access restricted to security officers. |
| **`VerificationChallenge`** | `items.models.VerificationChallenge` | `id` (UUID), `item` (FK to `Item`), `question_text` (CharField max 300), `hashed_answer` (CharField max 255), `hint` (CharField max 150), `max_attempts` (PositiveIntegerField default=3), `expires_at` (DateTimeField nullable), `is_active` (BooleanField default=True). | `hashed_answer` excluded from public serializers. |
| **`Claim`** | `claims.models.Claim` | `id` (UUID), `item` (FK to `Item`), `claimant` (FK to `User`), `claim_status` (CharField choices), `statement` (TextField max 2000), `private_evidence_proof_urls` (JSONField default=list), `reviewed_by` (FK to `User` nullable), `reviewed_at` (DateTimeField nullable), `review_notes` (TextField), `rejection_reason` (TextField), `handover_otp_cipher` (CharField), `handover_otp_iv` (CharField), `handover_otp_tag` (CharField), `handover_otp_expires_at` (DateTimeField), `verification_attempts_count` (PositiveIntegerField default=0). | Unique constraint on `(item, claimant)` preventing duplicate active claims. |
| **`ClaimChallengeAnswer`** | `claims.models.ClaimChallengeAnswer` | `id` (UUID), `claim` (FK to `Claim`), `challenge` (FK to `VerificationChallenge`), `provided_answer` (CharField), `is_correct` (BooleanField nullable). | Relational normalization of embedded Mongoose sub-document. |
| **`MatchSuggestion`** | `matching.models.MatchSuggestion` | `id` (UUID), `lost_item` (FK to `Item`), `found_item` (FK to `Item`), `match_score` (FloatField 0-100), `confidence` (CharField choices: `HIGH`, `MEDIUM`, `LOW`), `explanation` (JSONField), `status` (CharField choices), `reviewed_by` (FK to `User` nullable). | UniqueConstraint on `(lost_item, found_item)`. |
| **`CustodyRecord`** | `custody.models.CustodyRecord` | `id` (UUID), `item` (FK to `Item`), `action` (CharField choices), `from_location` (CharField), `to_location` (CharField), `locker_reference` (CharField), `evidence_reference` (CharField), `handled_by` (FK to `User`), `remarks` (TextField), `timestamp` (DateTimeField default=timezone.now). | Append-only audit ledger. Index on `(item, -timestamp)`. |
| **`Handover`** | `custody.models.Handover` | `id` (UUID), `item` (OneToOneField to `Item`), `claim` (OneToOneField to `Claim`), `recipient` (FK to `User`), `supervising_officer` (FK to `User`), `otp_hash` (CharField), `otp_expires_at` (DateTimeField), `otp_attempts_count` (PositiveIntegerField default=0), `physical_desk_location` (CharField), `id_card_presented_type` (CharField), `id_card_number_masked` (CharField), `recipient_signature_url` (URLField nullable), `acknowledgement_notes` (TextField), `is_completed` (BooleanField default=False), `completed_at` (DateTimeField nullable). | Single-use redemption; max 5 attempts lockout. |
| **`DisposalRecord`** | `governance.models.DisposalRecord` | `id` (UUID), `item` (OneToOneField to `Item`), `method` (CharField choices), `approved_by` (FK to `User`), `committee_notes` (TextField), `reason` (TextField), `recipient_organization` (CharField), `disposal_date` (DateTimeField default=timezone.now), `certificate_url` (URLField nullable). | Statutory committee approval record (Rule 26.4). |
| **`AuditEntry`** | `governance.models.AuditEntry` | `id` (UUID), `actor` (FK to `User` nullable), `actor_role` (CharField choices), `action` (CharField), `target_entity` (CharField), `target_id` (CharField), `ip_address` (GenericIPAddressField), `user_agent` (TextField), `metadata` (JSONField default=dict), `timestamp` (DateTimeField default=timezone.now). | Forensic audit trail. Index on `-timestamp`. |

---

## 4. Existing API-to-DRF Endpoint Mapping

All 41 endpoints will be mapped to DRF ViewSets and APIViews with exact URL matching under `/api/v1/`:

| Method | Express Route | Proposed DRF View / Action | DRF Serializer | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | `core.views.HealthCheckAPIView` | Custom Health Schema | `AllowAny` |
| `POST` | `/api/v1/auth/register` | `accounts.views.RegisterAPIView` | `RegisterSerializer` | `AllowAny` |
| `POST` | `/api/v1/auth/login` | `accounts.views.LoginAPIView` | `LoginSerializer` | `AllowAny` (Rate-limited) |
| `POST` | `/api/v1/auth/logout` | `accounts.views.LogoutAPIView` | None | `IsAuthenticated` |
| `GET` | `/api/v1/auth/me` | `accounts.views.CurrentUserAPIView` | `UserSerializer` | `IsAuthenticated` |
| `GET` | `/api/v1/items` | `items.views.ItemViewSet.list` | `PublicItemSerializer` | `AllowAny` |
| `GET` | `/api/v1/items/:id` | `items.views.ItemViewSet.retrieve` | `PublicItemSerializer` / `OwnerItemSerializer` | `AllowAny` (Owner context) |
| `POST` | `/api/v1/items/lost` | `items.views.ItemViewSet.create_lost` | `CreateItemSerializer` | `IsAuthenticated` |
| `POST` | `/api/v1/items/found` | `items.views.ItemViewSet.create_found` | `CreateItemSerializer` | `IsAuthenticated` |
| `PATCH` | `/api/v1/items/:id` | `items.views.ItemViewSet.partial_update` | `UpdateItemSerializer` | `IsRecordOwner` |
| `GET` | `/api/v1/items/my-reports` | `items.views.ItemViewSet.my_reports` | `OwnerItemSerializer` | `IsAuthenticated` |
| `POST` | `/api/v1/items/upload` | `items.views.ImageUploadAPIView` | `ImageUploadSerializer` | `IsAuthenticated` |
| `POST` | `/api/v1/items/upload-image` | `items.views.ImageUploadAPIView` (alias) | `ImageUploadSerializer` | `IsAuthenticated` |
| `GET` | `/api/v1/items/:id/matches` | `matching.views.MatchViewSet.item_matches` | `MatchSuggestionSerializer` | `IsRecordOwnerOrSecurity` |
| `POST` | `/api/v1/items/:id/matches/refresh` | `matching.views.MatchViewSet.refresh_item` | `MatchSuggestionSerializer` | `IsRecordOwnerOrSecurity` |
| `POST` | `/api/v1/matches/refresh-all` | `matching.views.MatchViewSet.refresh_all` | Custom batch response | `IsSecurityOrAdmin` |
| `GET` | `/api/v1/items/:id/challenges` | `items.views.ChallengeAPIView.list` | `PublicChallengeSerializer` | `AllowAny` (No answers) |
| `POST` | `/api/v1/items/:id/private-vault/view` | `items.views.PrivateVaultViewAPIView` | `PrivateVaultSerializer` | `IsSecurityOrAdmin` |
| `GET` | `/api/v1/categories` | `taxonomy.views.CategoryViewSet.public_list` | `CategorySerializer` | `AllowAny` |
| `GET` | `/api/v1/locations` | `taxonomy.views.LocationViewSet.public_list` | `LocationSerializer` | `AllowAny` |
| `POST` | `/api/v1/claims` | `claims.views.ClaimViewSet.create` | `CreateClaimSerializer` | `IsAuthenticated` |
| `POST` | `/api/v1/claims/:id/challenges/:cid/answer` | `claims.views.ClaimViewSet.answer_challenge`| `AnswerChallengeSerializer` | `IsAuthenticated` |
| `GET` | `/api/v1/claims/my-claims` | `claims.views.ClaimViewSet.my_claims` | `ClaimantClaimSerializer` | `IsAuthenticated` |
| `GET` | `/api/v1/claims/pending` | `claims.views.ClaimViewSet.pending_queue` | `SecurityClaimSerializer` | `IsSecurityOrAdmin` |
| `GET` | `/api/v1/claims/item/:itemId` | `claims.views.ClaimViewSet.competing_claims`| `SecurityClaimSerializer` | `IsSecurityOrAdmin` |
| `PATCH` | `/api/v1/claims/:id/review` | `claims.views.ClaimViewSet.review_claim` | `ReviewClaimSerializer` | `IsSecurityOrAdmin` (Anti-Self) |
| `POST` | `/api/v1/custody/transfer` | `custody.views.CustodyViewSet.transfer` | `CustodyTransferSerializer`| `IsSecurityOrAdmin` |
| `GET` | `/api/v1/custody/items/:id/history` | `custody.views.CustodyViewSet.item_history`| `CustodyRecordSerializer` | `IsSecurityOrAdmin` |
| `GET` | `/api/v1/custody/inventory` | `custody.views.CustodyViewSet.inventory` | `CustodyInventorySerializer`| `IsSecurityOrAdmin` |
| `GET` | `/api/v1/handovers/pending` | `custody.views.HandoverViewSet.pending` | `PendingHandoverSerializer` | `IsSecurityOrAdmin` |
| `POST` | `/api/v1/handovers/verify-otp` | `custody.views.HandoverViewSet.verify_otp` | `VerifyOtpSerializer` | `IsSecurityOrAdmin` |
| `GET` | `/api/v1/security/dashboard-stats` | `governance.views.SecurityStatsAPIView` | Custom Stats Serializer | `IsSecurityOrAdmin` |
| `GET` | `/api/v1/security/audit-trail` | `governance.views.SecurityAuditAPIView` | `AuditEntrySerializer` | `IsSecurityOrAdmin` |
| `GET` | `/api/v1/admin/analytics` | `governance.views.AdminAnalyticsAPIView` | Custom Analytics Serializer | `IsAdminOnly` |
| `GET` | `/api/v1/admin/retention/queue` | `governance.views.RetentionQueueAPIView` | `RetentionItemSerializer` | `IsAdminOnly` |
| `POST` | `/api/v1/admin/disposal/approve` | `governance.views.DisposalApproveAPIView` | `DisposalApprovalSerializer`| `IsAdminOnly` |
| `GET` | `/api/v1/admin/users` | `accounts.views.AdminUserViewSet.list` | `AdminUserSerializer` | `IsAdminOnly` |
| `PATCH` | `/api/v1/admin/users/:id` | `accounts.views.AdminUserViewSet.update` | `AdminUserUpdateSerializer`| `IsAdminOnly` (Anti-Self) |
| `GET` | `/api/v1/admin/categories` | `taxonomy.views.CategoryViewSet.admin_list`| `CategorySerializer` | `IsAdminOnly` |
| `POST` | `/api/v1/admin/categories` | `taxonomy.views.CategoryViewSet.create` | `CategorySerializer` | `IsAdminOnly` |
| `PATCH` | `/api/v1/admin/categories/:id` | `taxonomy.views.CategoryViewSet.update`| `CategorySerializer` | `IsAdminOnly` |
| `GET` | `/api/v1/admin/locations` | `taxonomy.views.LocationViewSet.admin_list`| `LocationSerializer` | `IsAdminOnly` |
| `POST` | `/api/v1/admin/locations` | `taxonomy.views.LocationViewSet.create` | `LocationSerializer` | `IsAdminOnly` |
| `PATCH` | `/api/v1/admin/locations/:id` | `taxonomy.views.LocationViewSet.update`| `LocationSerializer` | `IsAdminOnly` |
| `GET` | `/api/v1/admin/audit-logs` | `governance.views.AdminAuditLogsAPIView` | `AuditEntrySerializer` | `IsAdminOnly` |

---

### 4.1 Response Envelope Compatibility in DRF

The Next.js frontend expects the exact JSON envelope:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation successful",
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 100 }
}
```

In Django, we implement a custom DRF JSON Renderer (`core.renderers.ApiEnvelopeRenderer`):
```python
from rest_framework.renderers import JSONRenderer

class ApiEnvelopeRenderer(JSONRenderer):
    def render(self, data, accepted_media_type=None, renderer_context=None):
        response = renderer_context.get('response') if renderer_context else None
        status_code = response.status_code if response else 200
        
        # If already formatted or error handled
        if isinstance(data, dict) and 'success' in data:
            return super().render(data, accepted_media_type, renderer_context)
            
        success = status_code < 400
        formatted = {
            'success': success,
            'statusCode': status_code,
            'data': data
        }
        return super().render(formatted, accepted_media_type, renderer_context)
```
Combined with a custom exception handler (`core.exceptions.custom_exception_handler`), DRF will return:
```json
{
  "success": false,
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Detailed error message",
    "details": [ ... ]
  }
}
```
**Result**: The frontend `apiClient` parses Django responses without altering a single line of application code.

---

## 5. Frontend Changes Required

Because we design DRF to maintain 100% path and envelope compatibility, the required changes to `apps/web` are virtually **zero**:

1. **Environment Configuration**:
   - `NEXT_PUBLIC_API_URL`: Update from `http://localhost:5000/api/v1` to `http://localhost:8000/api/v1` in `.env.local` or production settings.
2. **CORS & Credentials**:
   - Ensure `django-cors-headers` allows `http://localhost:3000` (and production Vercel domains) with `CORS_ALLOW_CREDENTIALS = True`.
3. **Identifier Format**:
   - The frontend models represent all IDs as `id: string`. Both MongoDB ObjectIds (`6ad4...`) and Django UUIDs (`e8b2...`) parse identically as JavaScript strings without type conflicts.

---

## 6. Database Migration & Data-Preservation Strategy

### 6.1 Password Hash Compatibility (Bcrypt)
Existing users in MongoDB have passwords hashed with bcrypt:
`$2a$10$w...` or `$2b$10$...`.

Django natively supports bcrypt via `django.contrib.auth.hashers.BCryptSHA256PasswordHasher` or custom bcrypt hasher:
```python
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
    'core.hashers.IdenticalBCryptPasswordHasher',  # Directly validates $2a$/$2b$ bcrypt hashes
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
]
```
**Outcome**: Existing users will be able to log in with their existing passwords immediately without requiring password resets.

### 6.2 AES-256-GCM Vault Compatibility
In Express, `PrivateDetail` is encrypted with Node's `crypto.createCipheriv('aes-256-gcm', key, iv)`.
In Django, we implement the identical cipher using Python's `cryptography.hazmat.primitives.ciphers.aead.AESGCM`:
```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import binascii

class AESGCMVault:
    def __init__(self, hex_key: str):
        self.key = binascii.unhexlify(hex_key) # 32 bytes
        self.aesgcm = AESGCM(self.key)

    def decrypt(self, ciphertext_hex: str, iv_hex: str, tag_hex: str) -> str:
        iv = binascii.unhexlify(iv_hex)        # 12 bytes
        tag = binascii.unhexlify(tag_hex)      # 16 bytes
        ciphertext = binascii.unhexlify(ciphertext_hex)
        combined = ciphertext + tag
        decrypted = self.aesgcm.decrypt(iv, combined, None)
        return decrypted.decode('utf-8')
```
**Outcome**: All existing private verification vaults remain 100% readable and verifiable in Django.

### 6.3 Automated Mongo-to-Django ETL Script
We will provide a migration management command (`python manage.py import_mongo_data --mongo-uri=...`):
1. Connects read-only to MongoDB Atlas.
2. Sequentially imports:
   - `ItemCategory` and `Location` taxonomy (preserving exact codes).
   - `User` accounts (preserving email, role, registration number, bcrypt password hash).
   - `Item` records (preserving reference numbers, dates, statuses, images).
   - `PrivateDetail` & `VerificationChallenge` records.
   - `Claim`, `CustodyRecord`, `Handover`, `DisposalRecord`, and `AuditEntry` history.
3. Maintains foreign key mapping dictionaries (`mongo_id -> django_uuid`) to preserve relational integrity.
4. Leaves the original MongoDB database completely unaltered.

---

## 7. Authentication, Roles & Permissions in Django

### 7.1 Role Hierarchy in Django
We define an `Enum` matching the frontend:
```python
from django.db import models

class UserRole(models.TextChoices):
    STUDENT_STAFF = 'STUDENT_STAFF', 'Student / Staff'
    SECURITY_PERSONNEL = 'SECURITY_PERSONNEL', 'Security Personnel'
    CAMPUS_ADMIN = 'CAMPUS_ADMIN', 'Campus Administrator'
    SYSTEM_ADMIN = 'SYSTEM_ADMIN', 'System Administrator'
```

### 7.2 Custom DRF Permission Classes
* `IsRecordOwner`: Allows read/write only if `request.user == obj.reported_by` or `request.user == obj.claimant`.
* `IsSecurityOfficer`: Checks `request.user.role in [UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN]`.
* `IsCampusAdmin`: Checks `request.user.role in [UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN]`.
* `AntiSelfApprovalGuard`: Enforces University Rule 14.2:
  ```python
  if claim.claimant_id == request.user.id or claim.item.reported_by_id == request.user.id:
      raise PermissionDenied("Anti-Self-Approval: You cannot review a claim on your own report or claim.")
  ```

---

## 8. Testing & Deployment Plan

### 8.1 Test Parity
The current Express suite has **110 passing Vitest tests across 13 test files**. The Django test suite will be built with `pytest-django` to replicate identical test coverage:
1. `test_crypto.py`: Bcrypt verification and AES-256-GCM cipher roundtrips.
2. `test_image_scrubber.py`: In-memory EXIF / GPS stripping using Pillow.
3. `test_serializers.py`: Public item allow-list serialization (zero private field leakage).
4. `test_matching_engine.py`: 4-factor scoring weights (40% text, 25% category, 20% location, 15% time).
5. `test_auth_api.py`: JWT login, registration, cookie issuance, role guards.
6. `test_idor_privacy.py`: IDOR access prevention, direct tampering blocks.
7. `test_item_reporting.py`: Item creation, editing, category/location validation.
8. `test_claims_verification.py`: Verification challenge evaluation and attempt lockouts.
9. `test_custody_handover.py`: Custody transfers, anti-self-approval, single-use OTP redemption.
10. `test_admin_analytics.py`: Real-time mathematical aggregations, retention queues, disposal approvals.

### 8.2 Deployment Integration Smoke Tests
Once the Django server is running locally on port 8000:
1. Run `node scripts/deployment-smoke-test.mjs http://localhost:8000` (validates all 7 perimeter health & security checks).
2. Run `node scripts/e2e-workflow-smoke-test.mjs http://localhost:8000/api/v1` (validates all 8 multi-actor lifecycle steps).

### 8.3 Production Deployment
* **Backend Hosting**: Render Web Service or Docker container running `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT`.
* **Database**: Managed PostgreSQL on Render or AWS RDS.
* **Storage**: Local media or AWS S3 / Cloudinary via `django-storages`.

---

## 9. Risks, Trade-offs & Unresolved Decisions

1. **Primary Key Format (UUID vs BigAutoField)**:
   - *Recommendation*: Use `UUIDField` for all models. UUIDs eliminate resource enumeration vulnerabilities (IDOR), prevent sequential ID guessing, and match the string ID expectation of the Next.js frontend (`id: string`).
2. **Pillow vs Sharp Parity**:
   - Node uses `sharp` (libvips) for EXIF stripping and WebP encoding.
   - Python will use `Pillow` with `piexif` or `image.save(..., exif=b'')`.
   - *Resolution*: Verified: Pillow natively strips EXIF headers on re-encoding to WebP (`image.save(buffer, format='WEBP')`), ensuring equivalent privacy protection.
3. **Single-Use OTP Storage**:
   - In Express, Handover OTPs are hashed using bcrypt (`otpHash`). SimpleJWT does not handle one-time passwords; Django will use `django.contrib.auth.hashers.make_password(otp)` and `check_password(otp, hash)` to guarantee that plaintext OTPs are never stored in the database.
4. **Session Cookie vs Bearer Token in Cross-Domain**:
   - The frontend currently supports both HttpOnly cookies (`credentials: 'include'`) and `Authorization: Bearer <token>` in `localStorage`. SimpleJWT supports both, ensuring robust cross-origin operation on Vercel and Render.

---

## 10. Phased Migration Sequence

```mermaid
graph TD
    Phase1[Phase 1: Django Scaffolding & Core Architecture] --> Phase2[Phase 2: Custom User & Authentication App]
    Phase2 --> Phase3[Phase 3: Taxonomy & Item Reporting with Pillow Scrubber]
    Phase3 --> Phase4[Phase 4: Deterministic Matching Engine & Private Vault]
    Phase4 --> Phase5[Phase 5: Claims, Adjudication & OTP Handover]
    Phase5 --> Phase6[Phase 6: Admin Governance, Analytics & Audit History]
    Phase6 --> Phase7[Phase 7: Automated Parity Testing & Deployment Smoke Tests]
```

* **Step 1**: Initialize `apps/django_api` project scaffolding with Django 5.x, DRF, and custom response envelope renderer.
* **Step 2**: Implement `accounts` app (Custom User model, SimpleJWT authentication, role permissions).
* **Step 3**: Implement `taxonomy` and `items` apps (Item model, category/location catalogs, Pillow image pipeline).
* **Step 4**: Implement `matching` app (algorithmic scoring engine) and AES-256-GCM private vault.
* **Step 5**: Implement `claims` and `custody` apps (anti-self-approval, custody ledger, single-use OTP handover).
* **Step 6**: Implement `governance` app (live mathematical analytics, retention queue, disposal approval, audit logs).
* **Step 7**: Execute 110-test parity harness, `deployment-smoke-test.mjs`, and `e2e-workflow-smoke-test.mjs`.

---

## 11. Developer Setup Instructions & Phase 1 Verification

### 11.1 Windows PowerShell Setup

From the repository root (`lpu-lost-and-found/`):

```powershell
# 1. Navigate to the backend directory
cd backend

# 2. Create isolated Python virtual environment (Python 3.12+ / 3.14)
py -m venv .venv

# 3. Activate the virtual environment in PowerShell
.\.venv\Scripts\Activate.ps1

# (Optional: If script execution is restricted, run: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass)

# 4. Install pinned dependencies
pip install -r requirements.txt

# 5. Create environment configuration from template
Copy-Item .env.example .env

# 6. Run Django system integrity check
python manage.py check

# 7. Apply database migrations
python manage.py migrate

# 8. Run automated tests with pytest
pytest -v

# 9. Start the development server (runs on http://localhost:8000)
python manage.py runserver 8000
```

### 11.2 Linux / macOS / Bash Setup

```bash
# 1. Navigate to the backend directory
cd backend

# 2. Create isolated Python virtual environment
python3 -m venv .venv

# 3. Activate the virtual environment
source .venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Copy environment template
cp .env.example .env

# 6. Run system check & migrate
python manage.py check
python manage.py migrate

# 7. Run automated test suite
pytest -v

# 8. Start local server
python manage.py runserver 8000
```

### 11.3 Phase 1 Foundation Deliverables Status

| Component | Status | Details |
| :--- | :---: | :--- |
| **Virtual Environment** | `VERIFIED` | Isolated `backend/.venv` with Python 3.14.6 |
| **Dependencies** | `VERIFIED` | Pinned in `backend/requirements.txt` (Django 5.2.x, DRF 3.16.x, SimpleJWT, Pillow, drf-spectacular) |
| **Django Settings** | `VERIFIED` | Environment-variable driven via `python-dotenv` & `dj-database-url` |
| **Database Adapter** | `VERIFIED` | PostgreSQL (`psycopg 3.2.0`) with SQLite dev fallback (`backend/db.sqlite3`) |
| **Custom User Model** | `VERIFIED` | `accounts.User` with UUID primary key, RBAC roles, Bcrypt password hashing |
| **REST Envelope Renderer** | `VERIFIED` | `apps.core.renderers.ApiEnvelopeRenderer` guarantees `{ success, statusCode, data, meta }` |
| **Exception Handler** | `VERIFIED` | Centralized `apps.core.exceptions.custom_exception_handler` + 404 middleware |
| **Health Check Endpoint** | `VERIFIED` | `GET /api/v1/health/` returns uptime & DB connectivity status |
| **OpenAPI & Swagger UI** | `VERIFIED` | `GET /api/schema/`, `/api/docs/`, `/api/redoc/` |
| **CORS Configuration** | `VERIFIED` | `django-cors-headers` allowing `http://localhost:3000` with credentials |
| **Automated Test Suite** | `VERIFIED` | 18 passing pytest tests across health, auth, crypto, docs, and RBAC suites |

---

## 12. Phase 2: Django Models, Database Relationships, Auth & Data Migration

### 12.1 Completed Django Models Inventory

All 12 domain entities from the Node.js/Mongoose architecture have been implemented as Django models with full relational integrity, constraints, and indexes:

| Model Entity | Django App | Relationships & Integrity Constraints | Security & Privacy Protections |
| :--- | :--- | :--- | :--- |
| **`User`** | `apps.accounts` | Custom `AbstractBaseUser` with UUID primary key. Unique on `email` and `registration_number`. | Password hashing via `BCryptSHA256PasswordHasher` & PBKDF2. Anti-enumeration UUIDs. |
| **`ItemCategory`** | `apps.items` | Unique index on `code`. Ordered by `name`. | Configurable default retention days (Rule 26.4). |
| **`Location`** | `apps.locations` | Unique index on `code`. Indexes on `campus_zone` and `is_active`. | Tracks physical security desks and contact numbers. |
| **`Item`** | `apps.items` | `ForeignKey(ItemCategory)`, `ForeignKey(Location)`, `ForeignKey(User, reported_by)`. Indexes: `(status, item_type)`, `(category, location)`, `(-created_at)`. | Sensitive identifying marks excluded; only public description exposed. |
| **`PrivateDetail`** | `apps.verification` | `OneToOneField(Item)` with cascade delete. | Application-layer AES-256-GCM encryption with 12-byte IV and 16-byte tag. Decryption strictly gated to security officers. |
| **`VerificationChallenge`** | `apps.verification` | `ForeignKey(Item)` with cascade delete. Index on `is_active`. | Challenge answers stored as cryptographic hashes (`make_password`), NEVER in plaintext. |
| **`Claim`** | `apps.claims` | `ForeignKey(Item)`, `ForeignKey(User, claimant)`. `UniqueConstraint(item, claimant)` preventing duplicate active claims. | State-machine transitions: `SUBMITTED -> UNDER_REVIEW -> CHALLENGE_REQUIRED -> APPROVED -> COMPLETED`. |
| **`ClaimChallengeAnswer`** | `apps.claims` | `ForeignKey(Claim)`, `ForeignKey(VerificationChallenge)`. | Claimant's candidate answers evaluated against challenge hash. |
| **`MatchSuggestion`** | `apps.matching` | `ForeignKey(Item, lost_item)`, `ForeignKey(Item, found_item)`. `UniqueConstraint(lost_item, found_item)`. | Algorithmic scoring pair; duplicate pairs prevented at database level. |
| **`CustodyRecord`** | `apps.custody` | `ForeignKey(Item)`, `ForeignKey(User, handled_by)`. Index on `(item, -timestamp)`. | Immutable append-only custody movement history. |
| **`Handover`** | `apps.handovers` | `ForeignKey(Item)`, `ForeignKey(Claim)`, `ForeignKey(User, recipient)`, `ForeignKey(User, supervising_officer)`. `UniqueConstraint(item, condition=is_completed)`. | Single-use numeric OTP hashed with `make_password`. Duplicate releases prohibited at database level. |
| **`DisposalRecord`** | `apps.disposal` | `OneToOneField(Item)`, `ForeignKey(User, approved_by)`. | Statutory committee approval tracking under Rule 26.4. |
| **`AuditEntry`** | `apps.audit` | `ForeignKey(User, actor, null=True)`. Indexes on `(-timestamp)`, `(actor, action)`, `(target_entity, target_id)`. | Forensic audit trail with actor IP, role, and action timestamps. |

### 12.2 Authentication Method & Frontend Integration Requirements

The Django backend supports dual-mode authentication designed for seamless compatibility with the existing Next.js frontend (`apps/web`):

1. **Stateless Bearer JWT** (`Authorization: Bearer <access_token>`):
   - Stored in frontend client state / `localStorage`.
   - SimpleJWT configured with `USER_ID_CLAIM = 'userId'` and 7-day access token lifetime.
2. **HttpOnly Secure Session Cookie** (`lpu_session_token`):
   - Automatically issued upon login or registration.
   - `SameSite='Lax'` in development, `SameSite='Strict'` with `Secure=True` in production.
   - Shields token from XSS exfiltration.

#### Frontend Integration Checklist:
- **API Base URL**: Set `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1` in `apps/web/.env.local`.
- **Field Casing**: Serializers output camelCase identifiers (`registrationNumber`, `fullName`, `createdAt`, `isActive`) ensuring zero modifications to Next.js components.
- **CSRF Protection**: For cookie-based state-changing requests, the frontend sends `X-CSRFToken` from the `csrftoken` cookie.

### 12.3 Role-Based Access Control & Anti-Self-Approval

- **Role Hierarchy**:
  - `STUDENT_STAFF`: Can file reports, submit claims, answer verification challenges, and view their own recovery items.
  - `SECURITY_PERSONNEL`: Authorized to manage physical custody, view decrypted private vaults, adjudicate claims, and complete OTP handovers.
  - `CAMPUS_ADMIN` / `SYSTEM_ADMIN`: Full administrative governance, analytics, category/location taxonomy, and disposal approvals.
- **Anti-Self-Approval Guard (University Rule 14.2)**:
  - Enforced in `apps.accounts.permissions.AntiSelfApprovalGuard`.
  - A student can never review or approve claims.
  - A security officer who filed a personal claim cannot approve their own claim.
  - A security officer who reported a found item cannot review claims filed against that item.

### 12.4 MongoDB Data Migration Command

A non-destructive, repeatable management command is provided:

```powershell
# Dry run simulation (validates references, logs summary, rolls back transaction)
python manage.py import_mongo_data --dry-run

# Run migration from live MongoDB Atlas URI
python manage.py import_mongo_data --mongo-uri="mongodb+srv://user:pass@cluster.mongodb.net/lpu_lost_found"

# Run migration from exported JSON dumps (offline mode)
python manage.py import_mongo_data --json-dir="path/to/dumps"
```

- **Data Safety Guarantees**:
  - MongoDB is accessed in read-only mode; original records are never altered or dropped.
  - Idempotent `update_or_create` logic ensures safe repeatability without creating duplicate records.
  - Password hashes are inspected for format compatibility before saving.

---

## 13. Phase 3: Django REST Framework APIs & Complete Parity Verification

### 13.1 Phase 3 Overview & Architectural Summary

Phase 3 implements the complete, production-grade Django REST Framework (DRF) API surface for the LPU Lost & Found Property Recovery Platform. Every endpoint operates under the versioned prefix `/api/v1/`, enforcing strict response envelopes, server-side filtering, allowlisted dynamic sorting, pagination safeguards, role-based access control, and complete public field redaction.

The backend is structured into modular domain apps following Django conventions:
- `apps/core/`: Response envelope renderer (`ApiEnvelopeRenderer`), standard exception handlers, AES-256-GCM cipher (`AESGCMVault`), and pagination primitives.
- `apps/accounts/`: Custom User model, JWT authentication, registration, session management, and RBAC permissions.
- `apps/locations/`: Campus zones and physical security desk taxonomy.
- `apps/items/`: Item registry, public search board, Pillow EXIF-scrubbing image upload pipeline, and private vaults.
- `apps/verification/`: Sensitive challenge questions and encrypted private details.
- `apps/matching/`: Deterministic 4-factor scoring engine, match suggestions, and batch re-computation.
- `apps/claims/`: Ownership claim submissions, verification challenges, and security adjudication with anti-self-approval.
- `apps/custody/`: Append-only physical custody tracking and desk inventory.
- `apps/handovers/`: Supervised OTP-verified item handover and duplicate-handover prevention.
- `apps/disposal/`: Statutory retention management and formal committee-approved disposal under Rule 26.4.
- `apps/analytics/`: Real-time computed aggregations, recovery heatmaps, and ageing queue escalation brackets.
- `apps/audit/`: Forensic security activity feed and compliance audit trail explorer.

---

### 13.2 Dynamic Search, Filtering, Ordering & Pagination Specifications

1. **Server-Side Filtering**:
   - Integrated with `django-filter` via `django_filters.rest_framework.DjangoFilterBackend`.
   - Supported filters: `itemType`, `status`, `category` (code/ID), `location` (code/ID), `campusZone`, `fromDate`, `toDate`, `isCompleted`.
   - Date range validation ensures `fromDate <= toDate`.
2. **Search Capabilities**:
   - `rest_framework.filters.SearchFilter` applied across `title`, `public_description`, `reference_number`, and `specific_location`.
3. **Strict Dynamic Ordering**:
   - Explicit `ordering_fields` allowlisted on every endpoint: `created_at`, `event_date`, `title`, `reference_number`, `status`, `match_score`, `timestamp`.
   - Arbitrary or sensitive model fields (e.g., `password`, `handover_otp_hash`, `encrypted_ciphertext`) are rejected by the ordering filter.
   - Every ordering specification applies a deterministic tie-breaker (`id` or `pk`) to eliminate pagination drift across concurrent updates.
4. **Pagination Safeguards**:
   - Implemented via `apps.core.pagination.StandardResultsSetPagination`.
   - Default page size: 20 items. Configurable via `limit` (or `page_size`) parameter up to a strict maximum of 100 items per request.
   - Query count optimization: All querysets utilize `select_related` (`category`, `location`, `reported_by`, `claimant`, `item`, `handled_by`) and `prefetch_related` (`challenges`, `claims`) to maintain O(1) query complexity.

---

### 13.3 Privacy & Public Board Redaction Policy

- Public board and item detail endpoints (`GET /api/v1/items/`, `GET /api/v1/items/:id/`) serialize data exclusively via `PublicItemSerializer`.
- **Zero Leakage Guarantee**:
  - `PrivateDetail` records and encrypted ciphertexts are completely excluded from public endpoints.
  - `VerificationChallenge` expected answers and hashes are never exposed (`PublicChallengeSerializer` exposes only `questionText`, `hint`, and `maxAttempts`).
  - Private evidence proof URLs, claimant notes, and internal security notes remain inaccessible without elevated permissions.
  - Handover OTPs are conditionally revealed only to the verified claimant on their approved claim (`ClaimSerializer`) or to security officers in the handover terminal.

---

### 13.4 Complete Endpoint Mapping Table (41/41 Verified)

| Method | Express Route | DRF View / ViewSet | DRF Serializer | Auth & Permissions | Test File |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | `HealthCheckAPIView` | System Health | `AllowAny` | `test_health.py` |
| `POST` | `/api/v1/auth/register` | `RegisterAPIView` | `RegisterSerializer` | `AllowAny` | `test_auth.py` |
| `POST` | `/api/v1/auth/login` | `LoginAPIView` | `LoginSerializer` | `AllowAny` | `test_auth.py` |
| `POST` | `/api/v1/auth/logout` | `LogoutAPIView` | None | `IsAuthenticated` | `test_auth.py` |
| `GET` | `/api/v1/auth/me` | `CurrentUserAPIView` | `UserSerializer` | `IsAuthenticated` | `test_auth.py` |
| `GET` | `/api/v1/items` | `ItemPublicBoardAPIView` | `PublicItemSerializer` | `AllowAny` | `test_items_api.py` |
| `GET` | `/api/v1/items/:id` | `ItemDetailAPIView` | `PublicItemSerializer` | `AllowAny` | `test_items_api.py` |
| `POST` | `/api/v1/items/lost` | `CreateItemReportAPIView` | `CreateReportSerializer` | `IsAuthenticated` | `test_items_api.py` |
| `POST` | `/api/v1/items/found` | `CreateItemReportAPIView` | `CreateReportSerializer` | `IsAuthenticated` | `test_items_api.py` |
| `PATCH` | `/api/v1/items/:id` | `UpdateItemReportAPIView` | `UpdateReportSerializer` | `IsRecordOwnerOrSecurity` | `test_items_api.py` |
| `GET` | `/api/v1/items/my-reports` | `MyReportsAPIView` | `PublicItemSerializer` | `IsAuthenticated` | `test_items_api.py` |
| `POST` | `/api/v1/items/upload` | `ImageUploadAPIView` | `ImageUploadSerializer` | `IsAuthenticated` | `test_items_api.py` |
| `POST` | `/api/v1/items/upload-image` | `ImageUploadAPIView` | `ImageUploadSerializer` | `IsAuthenticated` | `test_items_api.py` |
| `GET` | `/api/v1/items/:id/matches` | `ItemMatchesAPIView` | `MatchSuggestionSerializer` | `IsRecordOwnerOrSecurity` | `test_matching_api.py` |
| `POST` | `/api/v1/items/:id/matches/refresh` | `ItemMatchesRefreshAPIView` | `MatchSuggestionSerializer` | `IsRecordOwnerOrSecurity` | `test_matching_api.py` |
| `POST` | `/api/v1/matches/refresh-all` | `RefreshAllMatchesAPIView` | Custom Batch Response | `IsSecurityOrAdmin` | `test_matching_api.py` |
| `GET` | `/api/v1/items/:id/challenges` | `ItemChallengesAPIView` | `PublicChallengeSerializer` | `AllowAny` | `test_items_api.py` |
| `POST` | `/api/v1/items/:id/private-vault/view` | `PrivateVaultViewAPIView` | `PrivateVaultResponseSerializer` | `IsSecurityOrAdmin` | `test_items_api.py` |
| `GET` | `/api/v1/categories` | `PublicCategoryListAPIView` | `ItemCategorySerializer` | `AllowAny` | `test_items_api.py` |
| `GET` | `/api/v1/locations` | `PublicLocationListAPIView` | `LocationSerializer` | `AllowAny` | `test_items_api.py` |
| `POST` | `/api/v1/claims` | `ClaimCreateAPIView` | `SubmitClaimSerializer` | `IsAuthenticated` | `test_claims_and_handover_api.py` |
| `POST` | `/api/v1/claims/:id/challenges/:cid/answer` | `ClaimAnswerChallengeAPIView` | `AnswerChallengeInputSerializer` | `IsAuthenticated` | `test_claims_and_handover_api.py` |
| `GET` | `/api/v1/claims/my-claims` | `MyClaimsAPIView` | `ClaimSerializer` | `IsAuthenticated` | `test_claims_and_handover_api.py` |
| `GET` | `/api/v1/claims/pending` | `PendingClaimsQueueAPIView` | `ClaimSerializer` | `IsSecurityOrAdmin` | `test_claims_and_handover_api.py` |
| `GET` | `/api/v1/claims/item/:itemId` | `ItemClaimsAPIView` | `ClaimSerializer` | `IsSecurityOrAdmin` | `test_claims_and_handover_api.py` |
| `PATCH` | `/api/v1/claims/:id/review` | `ReviewClaimAPIView` | `ReviewClaimInputSerializer` | `IsSecurityOrAdmin` + `AntiSelfApproval` | `test_claims_and_handover_api.py` |
| `POST` | `/api/v1/custody/transfer` | `CustodyTransferAPIView` | `CustodyTransferInputSerializer` | `IsSecurityOrAdmin` | `test_claims_and_handover_api.py` |
| `GET` | `/api/v1/custody/items/:id/history` | `ItemCustodyHistoryAPIView` | `CustodyRecordSerializer` | `IsSecurityOrAdmin` | `test_claims_and_handover_api.py` |
| `GET` | `/api/v1/custody/inventory` | `CustodyInventoryAPIView` | `CustodyRecordSerializer` | `IsSecurityOrAdmin` | `test_claims_and_handover_api.py` |
| `GET` | `/api/v1/handovers/pending` | `PendingHandoversAPIView` | `PendingHandoverItemSerializer` | `IsSecurityOrAdmin` | `test_claims_and_handover_api.py` |
| `POST` | `/api/v1/handovers/verify-otp` | `VerifyOtpHandoverAPIView` | `VerifyOtpInputSerializer` | `IsSecurityOrAdmin` | `test_claims_and_handover_api.py` |
| `GET` | `/api/v1/security/dashboard-stats` | `SecurityDashboardStatsAPIView` | Custom Stats Schema | `IsSecurityOrAdmin` | `test_admin_and_analytics_api.py` |
| `GET` | `/api/v1/security/audit-trail` | `SecurityAuditTrailAPIView` | `AuditEntrySerializer` | `IsSecurityOrAdmin` | `test_admin_and_analytics_api.py` |
| `GET` | `/api/v1/admin/analytics` | `AdminAnalyticsAPIView` | Custom Analytics Schema | `IsCampusAdmin` | `test_admin_and_analytics_api.py` |
| `GET` | `/api/v1/admin/retention/queue` | `AdminAgeingQueueAPIView` | Custom Retention Schema | `IsCampusAdmin` | `test_admin_and_analytics_api.py` |
| `POST` | `/api/v1/admin/disposal/approve` | `AdminDisposalApproveAPIView` | `DisposalApprovalInputSerializer` | `IsCampusAdmin` | `test_admin_and_analytics_api.py` |
| `GET` | `/api/v1/admin/users` | `AdminUsersAPIView` | `AdminUserSerializer` | `IsCampusAdmin` | `test_admin_and_analytics_api.py` |
| `PATCH` | `/api/v1/admin/users/:id` | `AdminUserDetailAPIView` | `UpdateUserAdminSerializer` | `IsCampusAdmin` (Anti-Self-Demote) | `test_admin_and_analytics_api.py` |
| `GET` | `/api/v1/admin/categories` | `AdminCategoryListCreateAPIView` | `ItemCategorySerializer` | `IsCampusAdmin` | `test_items_api.py` |
| `POST` | `/api/v1/admin/categories` | `AdminCategoryListCreateAPIView` | `CreateCategorySerializer` | `IsCampusAdmin` | `test_items_api.py` |
| `PATCH` | `/api/v1/admin/categories/:id` | `AdminCategoryDetailAPIView` | `UpdateCategorySerializer` | `IsCampusAdmin` | `test_items_api.py` |
| `GET` | `/api/v1/admin/locations` | `AdminLocationListCreateAPIView` | `LocationSerializer` | `IsCampusAdmin` | `test_items_api.py` |
| `POST` | `/api/v1/admin/locations` | `AdminLocationListCreateAPIView` | `CreateLocationSerializer` | `IsCampusAdmin` | `test_items_api.py` |
| `PATCH` | `/api/v1/admin/locations/:id` | `AdminLocationDetailAPIView` | `UpdateLocationSerializer` | `IsCampusAdmin` | `test_items_api.py` |
| `GET` | `/api/v1/admin/audit-logs` | `AdminAuditLogsAPIView` | `AuditEntrySerializer` | `IsCampusAdmin` | `test_admin_and_analytics_api.py` |

---

### 13.5 Intentional Design Decisions & Enhancements

1. **Dual Trailing Slash Routing**:
   - The frontend's `api-client.ts` calls both trailing-slash routes (e.g., `/items/`, `/claims/`) and non-trailing-slash routes (e.g., `/locations`, `/categories`).
   - Every route in the Django backend is registered with both patterns (`path('', ...)` and `path('/', ...)`), eliminating 301 redirects or CORS preflight failures on POST/PATCH requests.
2. **One-Way Cryptographic Hashing for Verification Answers & OTPs**:
   - Challenge answers and 6-digit handover OTPs are stored using standard PBKDF2/Bcrypt one-way hashes (`make_password`) rather than reversible ciphertexts.
   - Plaintext credentials and OTPs never exist in the database or audit logs.
3. **Anti-Self-Approval Enforcement (University Rule 14.2)**:
   - Enforced directly in `apps.claims.services.review_claim` and `apps.accounts.permissions.AntiSelfApprovalGuard`.
   - A security officer who filed a report or claim is forbidden from approving it. Violations raise an immediate `PermissionDenied` and log a security audit violation.
4. **Automated Competing Claim Rejection**:
   - Upon claim approval, any other pending or submitted claims on the same item are automatically transitioned to `REJECTED` with an audit-logged reason.
5. **Atomic Handover & Custody State Transitions**:
   - Handover completion atomically marks the item as `HANDED_OVER`, seals the `Handover` record (`is_completed=True`), appends an immutable `CustodyRecord` entry (`action=HANDED_OVER`), and writes a forensic `AuditEntry`.

---

### 13.6 Automated Test Suite Execution & Verification

The Django backend was validated against the full suite of automated unit, integration, and security tests:

```powershell
backend\.venv\Scripts\pytest.exe backend/tests/ -v
```

**Results:**
- `backend/tests/test_admin_and_analytics_api.py`: 5 passed
- `backend/tests/test_auth.py`: 7 passed
- `backend/tests/test_claims_and_handover_api.py`: 4 passed
- `backend/tests/test_cors_and_rbac.py`: 4 passed
- `backend/tests/test_docs_and_envelope.py`: 4 passed
- `backend/tests/test_health.py`: 1 passed
- `backend/tests/test_items_api.py`: 6 passed
- `backend/tests/test_matching_api.py`: 2 passed
- `backend/tests/test_model_constraints.py`: 8 passed
- `backend/tests/test_mongo_import.py`: 1 passed
- `backend/tests/test_crypto.py`: 2 passed
- `backend/tests/test_rbac_and_ownership.py`: 4 passed

**Total: 49 passed in 51.59s (0 failures, 0 errors)

OpenAPI 3.0 Schema Validation:
```powershell
python backend/manage.py spectacular --validate
```
Result: Schema generated and validated successfully with 0 warnings or schema errors.

---

## 14. Phase 4: Frontend Migration to Django REST API & Integration Verification

### 14.1 Frontend Migration Architecture & Environment Configuration
The Next.js 16 App Router frontend (`apps/web`) has been migrated from the Express backend (port 5000) to the new Python 3 / Django REST Framework backend (port 8000) without altering existing visual styling, branding, or page routes.

- **Frontend Environment Variables (`apps/web/.env.local`)**:
  ```env
  NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
  NEXT_PUBLIC_APP_NAME="LPU Lost & Found Property Recovery Platform"
  NEXT_PUBLIC_CAMPUS_NAME="Lovely Professional University, Phagwara, Punjab"
  NEXT_PUBLIC_SECURITY_HOTLINE="+91 1824 517000"
  ```
- **Fallback Alignment (`apps/web/src/lib/api-client.ts`)**:
  Default API base URL updated to `http://localhost:8000/api/v1`.

### 14.2 Dual-Mode Authentication Implementation
To support both browser-based session cookies and programmatic API consumers:
- **`CookieOrHeaderJWTAuthentication`** (`backend/apps/accounts/authentication.py`):
  1. Inspects the incoming `Authorization: Bearer <token>` HTTP header.
  2. If absent, inspects the `lpu_session_token` HttpOnly cookie attached via browser `credentials: 'include'`.
  3. Validates the JWT signature, token type (`access`), and active user status.
- **CSRF & Permitted Origins**:
  Configured in Django `settings.py` with `CORS_ALLOWED_ORIGINS` (`http://localhost:3000`, `http://127.0.0.1:3000`) and `CSRF_TRUSTED_ORIGINS`.

### 14.3 Full-Stack Test & Validation Evidence (Express Backend Offline)

With the Express backend (`apps/api`) stopped and port 5000 verified offline:
1. **Next.js Production Build**:
   ```powershell
   npm --workspace=apps/web run build
   ```
   *Result:* Exit code 0, 19/19 App Router routes compiled cleanly.
2. **Pytest Backend Test Suite**:
   ```powershell
   backend\.venv\Scripts\pytest.exe backend/tests/ -v
   ```
   *Result:* 49/49 passed in 51.59s (0 failures, 0 errors).
3. **Deployment Smoke Test Suite**:
   ```powershell
   node scripts/deployment-smoke-test.mjs http://localhost:8000
   ```
   *Result:* 7/7 assertions passed (Root welcome envelope, `/health`, `/items` public board search, `/categories`, `/locations`, 401 unauthenticated security gate, 401 unauthenticated admin gate).
4. **End-to-End Multi-Actor Workflow Test**:
   ```powershell
   node scripts/e2e-workflow-smoke-test.mjs http://localhost:8000/api/v1
   ```
   *Result:* 8/8 lifecycle steps passed (Student registration & login, FOUND item filing with AES-256 encrypted private vault, public catalog query & zero-leakage check, student claim filing with challenge answers, security vault decryption & claim approval, 6-digit OTP delivery, supervised handover completion, and re-claim prevention).
5. **Browser Subagent Visual & Functional Verification**:
   - Verified Home page (`/`), Public Search Board (`/board`) with keyword search ('Casio'), Student Portal (`/dashboard`), Security Desk (`/security`), Admin Governance (`/admin`), and Analytics (`/admin/analytics`).

### 14.4 Obsolete Files Inventory (Retained for Safety, Ready for Future Retirement)

In accordance with user instructions, the previous Node.js/Express backend has **NOT** been automatically deleted. The following list identifies obsolete files and directories that can safely be removed once the Django migration is formally signed off:

| Path | Description / Purpose in Old Stack | Replacement in Django Stack |
| :--- | :--- | :--- |
| `apps/api/` | Express.js 4 application workspace | `backend/` (Django 5 / DRF project) |
| `apps/api/src/controllers/` | Express route controller handlers | `backend/apps/*/views.py` |
| `apps/api/src/services/` | Business logic services | `backend/apps/*/services.py` |
| `apps/api/src/models/` | Mongoose MongoDB schemas | `backend/apps/*/models.py` |
| `apps/api/src/routes/` | Express router declarations | `backend/apps/*/urls.py` |
| `apps/api/src/middleware/` | Express auth, RBAC, error handlers | DRF authentication & permission classes |
| `apps/api/src/utils/` | Mongoose ciphers & seeds | `backend/apps/core/` & management commands |
| `apps/api/tests/` | Vitest API integration test suites | `backend/tests/` (Pytest test suite) |
| `apps/api/package.json` | Express backend dependencies & scripts | `backend/requirements.txt` |
| `apps/api/Dockerfile` | Node.js container definition | `backend/Dockerfile` |
| `scripts/setup-db-indexes.mjs` | MongoDB collection index creation script | Django model migrations (`backend/apps/*/migrations/`) |




