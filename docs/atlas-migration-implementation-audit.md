# Atlas Migration: Backend Compatibility Audit

## Audit status

This is a source-level compatibility audit on `migration/mongodb-atlas`. It is not a completed database migration. No production database, Render service, or Vercel project was changed.

## Verified active stack

- Active frontend: `apps/web` (Next.js).
- Active API: `backend` (Django 5.2 / DRF).
- The frontend is configured to consume the Django API under `/api/v1`.
- `apps/api` is a separate legacy Express/Mongoose service. It must not be substituted without a feature-parity and API-contract review.
- Current production Django settings and Render configuration are PostgreSQL-oriented.

## Repository scan findings

The repository's existing progress record reports the following scan totals:

| Pattern / model feature | Occurrences |
|---|---:|
| `select_for_update()` | 32 |
| `transaction.atomic()` | 28 |
| `prefetch_related()` | 7 |
| Explicit uniqueness constraints | 8 |
| ForeignKey fields | 32 |
| OneToOne fields | 4 |
| `BigAutoField` defaults | Present |

Representative high-risk call sites confirmed during this review:

- `backend/apps/claims/services.py`: item and claim row locks during claim submission/adjudication.
- `backend/apps/claims/views.py`: item/claim lock ordering during claim review and related actions.
- `backend/apps/handovers/otp_services.py`: item/direct-recovery locks during OTP renewal.
- `backend/apps/handovers/views.py`: item/claim lock ordering during OTP verification and handover.
- `backend/apps/handovers/direct_recovery.py`: item/direct-recovery lock ordering.
- `backend/apps/custody/views.py`: custody location and locker locking.
- `backend/apps/items/services.py`: item locks during lifecycle processing.
- `backend/apps/items/views.py`: item and user locks around report workflows.
- `backend/apps/analytics/views.py`: user locking around admin governance.

These operations protect invariants against concurrent requests. Replacing `select_for_update()` with a no-op would introduce race conditions.

## Official backend compatibility

The official MongoDB Django Backend 5.2 release line matches Django 5.2 and supports Python 3.12. The backend's documented limitations include:

- `select_for_update()` is unsupported.
- `prefetch_related()` is unsupported.
- `AutoField`, `BigAutoField`, and `SmallAutoField` are unsupported; use `ObjectIdAutoField` where applicable.
- `ForeignKey` is only partially supported; embedded models are recommended where suitable.
- Transactions use the backend's custom transaction API. Nested atomic blocks/savepoints are not supported.
- Transactions require an Atlas replica set or sharded cluster.
- Some migration operations and cross-collection update/delete patterns are partially supported or unsupported.

The backend is not a drop-in replacement for the current PostgreSQL configuration.

## Migration design decisions required before application code changes

### Concurrency and consistency

For each critical operation, define a single-document atomic state transition or a transaction with explicit retry/error handling. Use conditional filters on expected prior state, version counters, or unique idempotency keys to prevent duplicate effects. Do not use a read-then-write sequence as a substitute for a row lock.

The following workflows need dedicated concurrency tests:

1. Claim submission and duplicate active-claim prevention.
2. Claim approval/rejection and competing claim resolution.
3. Locker assignment and reassignment.
4. OTP attempts, expiry, renewal, replay prevention, and one-time redemption.
5. Direct recovery and supervised handover.
6. Custody transfer and append-only custody history.
7. Disposal approval and duplicate prevention.
8. Last-super-admin protection and append-only audit writes.

### Data model strategy

Do not mechanically convert every relational model into an embedded document. Decide per relation whether it should be embedded or referenced, considering:
- independent lifecycle and write frequency;
- document growth and MongoDB's 16 MB document limit;
- query and pagination patterns;
- uniqueness and concurrency invariants;
- audit retention and immutability;
- ownership and access-control boundaries.

### Migration and rollback

1. Keep PostgreSQL as the source of truth while developing the Atlas-compatible backend.
2. Create a versioned export and deterministic transformation pipeline.
3. Import into a non-production Atlas database.
4. Validate document counts, identifiers, references, unique keys, timestamps, statuses, and audit continuity.
5. Run API contract, authorization, and concurrency tests against Atlas.
6. Rehearse rollback before any production cutover.
7. Do not drop, truncate, or disable the PostgreSQL source during the migration window.

## Deployment configuration still pending

The existing `backend/config/settings.py`, `backend/requirements.txt`, and `backend/render.yaml` remain PostgreSQL-oriented. They must be updated together only after the model and workflow compatibility work is complete. Atlas credentials must be injected as Render secrets; no URI or password belongs in this repository or in frontend environment variables.

## Acceptance criteria

- Clean install with pinned Django 5.2 and Django MongoDB Backend 5.2 versions.
- Django system checks and migration commands succeed against a disposable Atlas replica-set database.
- All API contract tests pass without frontend changes.
- Critical workflow concurrency tests pass under parallel requests.
- Import validation has no unexplained missing or orphaned records.
- Auth, permissions, OTP, private evidence, media, scheduled tasks, and audit behavior are verified.
- Rollback is documented and rehearsed.

## Sources

- MongoDB Django Backend 5.2 feature compatibility: https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/limitations-upcoming/
- MongoDB Django Backend compatibility matrix: https://www.mongodb.com/docs/drivers/compatibility/?driver-language=python&python-driver-framework=django
- MongoDB Django Backend 5.2 release notes: https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/reference/release-notes/


## Selected implementation path (confirmed)

The project owner selected **Option 1: preserve the active Django 5.2 / DRF backend and migrate it to MongoDB Atlas using the official Django MongoDB Backend 5.2 release line**.

Non-negotiable boundaries:
- Keep `apps/web` unchanged unless API contract tests identify a necessary compatibility fix.
- Keep the current Django API as the active API; preserve endpoint paths, authentication semantics, permissions, and response envelopes.
- Keep `apps/api` (legacy Express/Mongoose) untouched and do not switch traffic to it.
- Keep `main` unchanged while work is performed on `migration/mongodb-atlas`.
- Do not configure production to use Atlas until the refactor, import rehearsal, and acceptance gates pass.

Implementation sequence:
1. Pin the exact Django MongoDB Backend 5.2 patch release and verify its dependency constraints against the repository's installed Django/Python versions.
2. Create a disposable Atlas test database / replica-set test target; never use production data for the initial proof of concept.
3. Build a minimal compatibility spike for the custom user model, UUID primary keys, authentication, representative relations, indexes, and API serialization.
4. Refactor high-risk state transitions to MongoDB-supported atomic conditional writes and/or the backend's supported transaction API. Add concurrency and retry tests before changing the database setting.
5. Refactor unsupported queryset operations and audit all constraints, migrations, serializers, admin, filters, background jobs, and management commands.
6. Implement a repeatable PostgreSQL export → transformation → Atlas import command with dry-run, validation report, idempotency, and rollback instructions.
7. Update settings, dependencies, Render configuration, and environment documentation only after test gates pass.

No runtime dependency, settings, model, or service code has been switched yet. The migration remains in the assessment/refactor phase.
