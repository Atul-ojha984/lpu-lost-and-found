# Feature Audit

Status is based on the repository and local SQLite configuration inspected on 2026-11-03. “Working” means an existing implementation and supporting tests were verified in this environment; it does not imply production/PostgreSQL validation.

| Module | Status | Evidence and remaining gaps |
|---|---|---|
| Accounts and authentication | Partially Working | Custom Django user, JWT authentication, roles, and API tests exist. Django Groups/Permissions and production identity-provider integration are not verified. |
| Item reporting | Partially Working | Lost/found report API, item ownership, image processing, and private details exist. Production S3 storage and complete P09 privacy/retention validation are pending. |
| Categories and locations | Working | Existing category/location models and APIs are present with Django migrations. Hierarchy and tenant scoping are not verified. |
| Matching | Partially Working | Matching app and API exist. PostgreSQL full-text/`pg_trgm` and Celery refresh are missing. |
| Verification | Partially Working | Encrypted private-detail and challenge-answer flows exist. Production key management and full expiry/attempt policy validation remain pending. |
| Claims | Partially Working | Claim submission, challenge flow, reviewer authorization, OTP handover, and API tests exist. Existing local record state mismatch is documented in `PROJECT_PROGRESS.md`. |
| Custody and handover | Partially Working | Custody and OTP-supervised handover APIs/models/tests exist. Append-only guarantees and production concurrency behavior need PostgreSQL validation. |
| Disposal and retention | Partially Working | Disposal app and migrations exist; complete scheduled retention workflow is not verified. |
| Audit | Partially Working | Audit records are created for claim review and handover flows. Database-enforced immutability and complete coverage are not verified. |
| Analytics and administration | Partially Working | Admin and analytics endpoints have passing tests. Production role matrix and tenant-level reporting are pending. |
| Notifications and background jobs | Not Implemented | Celery, Celery Beat, and Redis are not present in the current backend dependency/configuration. |
| Production platform requirements | Not Implemented | PostgreSQL 16, S3-compatible storage, and Playwright E2E execution are not configured in the inspected checkout. |
