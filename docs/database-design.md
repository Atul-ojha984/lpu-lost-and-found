# Database Design & Entity Relationships: LPU Lost & Found

The relational schema is engineered for data integrity, multi-actor role separation, privacy vaults, and complete auditability.

## 1. Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    USER ||--o{ ITEM : "reports"
    USER ||--o{ CLAIM : "submits"
    USER ||--o{ CLAIM : "reviews (security)"
    USER ||--o{ HANDOVER : "verifies (security)"
    USER ||--o{ CUSTODY_LOG : "logs (security)"
    USER ||--o{ AUDIT_LOG : "triggers"

    CATEGORY ||--o{ ITEM : "classifies"
    LOCATION ||--o{ ITEM : "located at"

    ITEM ||--o{ CLAIM : "has claims"
    ITEM ||--o| HANDOVER : "resolved by"
    ITEM ||--o{ CUSTODY_LOG : "custody tracked by"

    CLAIM ||--o| HANDOVER : "authorizes"

    USER {
        uuid id PK
        string email UK
        string username UK
        string role "STUDENT_STAFF | SECURITY_OFFICER | ADMIN"
        string registration_number
        string phone_number
        string department
        boolean is_active
        timestamp created_at
    }

    CATEGORY {
        uuid id PK
        string name UK
        string slug UK
        string description
        string icon
    }

    LOCATION {
        uuid id PK
        string name
        string block "e.g. Block 34, Central Library, UniMall"
        string floor
        string campus_zone
        boolean is_active
    }

    ITEM {
        uuid id PK
        string reference_number UK "e.g. LPU-2026-F14664"
        string title
        string item_type "LOST | FOUND"
        string status "REPORTED | IN_CUSTODY | CLAIM_PENDING | HANDED_OVER | DISPOSED"
        uuid category_id FK
        uuid location_id FK
        string specific_location
        date date_lost_found
        uuid reporter_id FK
        string primary_image
        text encrypted_private_details "Fernet encrypted vault"
        text verification_question
        timestamp created_at
        timestamp updated_at
    }

    CLAIM {
        uuid id PK
        uuid item_id FK
        uuid claimant_id FK
        string status "UNDER_REVIEW | APPROVED | REJECTED | HANDED_OVER"
        text verification_answers
        string proof_image
        text rejection_reason
        uuid reviewed_by_id FK
        timestamp reviewed_at
        timestamp created_at
    }

    HANDOVER {
        uuid id PK
        uuid item_id UK, FK
        uuid claim_id UK, FK
        uuid claimant_id FK
        uuid verified_by_id FK
        string otp_hash
        timestamp otp_expires_at
        boolean is_completed
        text handover_notes
        timestamp completed_at
    }

    CUSTODY_LOG {
        uuid id PK
        uuid item_id FK
        uuid logged_by_id FK
        string locker_number
        string property_condition
        timestamp intake_date
        timestamp released_date
    }

    AUDIT_LOG {
        uuid id PK
        uuid actor_id FK
        string action
        string entity_type
        string entity_id
        string ip_address
        json details
        timestamp timestamp
    }
```

---

## 2. Integrity Constraints & Invariants

1. **Anti-Self-Claim Invariant:** A user cannot submit an ownership claim against an item they reported (`reporter_id != claimant_id`). Enforced at model validation and serializer layer.
2. **Duplicate Active Claim Prevention:** A user may not open multiple concurrent active claims on the same item.
3. **Single Handover Constraint:** Each item can only be handed over once via an `OneToOneField` relationship between `Item` and `Handover`.
4. **Encrypted Private Vault:** High-risk identifying attributes (serial numbers, laptop MAC addresses, phone lock wallpapers) are encrypted with Fernet (AES-128-CBC) prior to storage.
5. **Single-Use Handover OTP:** The 6-digit OTP is cryptographically hashed, expires after 15 minutes, and is marked completed in an atomic database transaction upon verification.
