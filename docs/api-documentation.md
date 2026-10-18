# API Documentation: LPU Lost & Found REST API

All API endpoints follow REST conventions and are served under the versioned prefix `/api/v1/`.

Interactive API Explorers:
- **Swagger UI:** `/api/schema/swagger-ui/`
- **ReDoc:** `/api/schema/redoc/`
- **Raw OpenAPI 3.0 Schema:** `/api/schema/`

---

## 1. Authentication & Security Model

Protected endpoints require a JWT Bearer token in the `Authorization` header:

```http
Authorization: Bearer <access_token>
```

### 1.1 Response Envelope Structure

Success responses:
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

Error responses:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided.",
    "details": { ... }
  }
}
```

---

## 2. API Endpoints Reference

### 2.1 Accounts & Authentication (`/api/v1/accounts/`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/accounts/register/` | Register new student/faculty account | No |
| `POST` | `/accounts/login/` | Authenticate and obtain JWT access & refresh tokens | No |
| `POST` | `/accounts/token/refresh/` | Refresh expired access token | No (Valid refresh token) |
| `GET` | `/accounts/profile/` | Retrieve current user profile and role | Yes (Any role) |
| `PATCH` | `/accounts/profile/` | Update profile information | Yes (Owner) |

### 2.2 Items & Public Search (`/api/v1/items/`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/items/` | Filterable public item catalog (Lost & Found) | No (Public sanitized) |
| `POST` | `/items/` | Report a new lost or found item | Yes (Student / Staff) |
| `GET` | `/items/{id}/` | Retrieve item details (Private fields redacted for non-owners) | No / Yes |
| `PATCH` | `/items/{id}/` | Update reported item details | Yes (Reporter or Admin) |
| `DELETE`| `/items/{id}/` | Cancel or withdraw item report | Yes (Reporter or Admin) |
| `GET` | `/items/categories/` | List campus item categories (Electronics, IDs, Bags, etc.) | No |
| `GET` | `/items/locations/` | List campus blocks, buildings, and drop points | No |

### 2.3 Automated Matching Engine (`/api/v1/matching/`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/matching/matches/` | Get potential matches for user's reported items | Yes (Reporter) |

### 2.4 Claims & Verification (`/api/v1/claims/`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/claims/` | List claims (User claims for students; all claims for Security) | Yes |
| `POST` | `/claims/` | Submit ownership claim with secret challenge answers | Yes (Student / Staff) |
| `GET` | `/claims/{id}/` | Retrieve claim details & status | Yes (Claimant or Security) |
| `POST` | `/claims/{id}/review/` | Approve or reject claim with justification | Yes (`SECURITY_OFFICER`, `ADMIN`) |
| `GET` | `/claims/{id}/otp/` | Retrieve 6-digit handover OTP for approved claim | Yes (Claimant only) |

### 2.5 Handovers & Custody Transfer (`/api/v1/handovers/`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/handovers/` | List completed handovers and custody records | Yes (`SECURITY_OFFICER`, `ADMIN`) |
| `POST` | `/handovers/verify-otp/` | Verify claimant OTP and execute item release | Yes (`SECURITY_OFFICER`, `ADMIN`) |

### 2.6 Physical Custody Logging (`/api/v1/custody/`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/custody/` | List physical storage lockers and custody intake logs | Yes (`SECURITY_OFFICER`, `ADMIN`) |
| `POST` | `/custody/` | Log item received into secure campus property locker | Yes (`SECURITY_OFFICER`, `ADMIN`) |

### 2.7 Campus Analytics (`/api/v1/analytics/`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/analytics/summary/` | Campus recovery rate, total items, resolution time | Yes (`ADMIN`) |
| `GET` | `/analytics/hotspots/` | High-frequency loss locations and category trends | Yes (`ADMIN`) |

### 2.8 Audit Trail (`/api/v1/audit/`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/audit/logs/` | Query immutable audit log with actor and action filters | Yes (`ADMIN`) |
