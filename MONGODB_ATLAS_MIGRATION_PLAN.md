# MongoDB Atlas Migration Plan

## Status

Planning and compatibility assessment only. The active Django backend has **not** been migrated, tested, or deployed. This document is intentionally committed to the isolated `migration/mongodb-atlas` branch. The `main` branch is not changed.

## Current architecture

- Frontend: Next.js application in `apps/web`.
- Active API: Django 5.2 / Django REST Framework in `backend`.
- The frontend currently consumes the Django API. The legacy Express application in `apps/api` is not assumed to be a drop-in replacement.
- Existing Render configuration in `backend/render.yaml` is PostgreSQL-oriented and must not be deployed unchanged for an Atlas-only production database.

## Compatibility findings

The official MongoDB Django Backend has a Django 5.2-compatible release line. Its feature support is not equivalent to PostgreSQL:

- `select_for_update()` is unsupported.
- `prefetch_related()` is unsupported.
- `ForeignKey` is only partially supported; embedded documents are recommended where appropriate.
- MongoDB transactions require a replica set or sharded cluster. The backend's transaction API has limitations, including no nested savepoints / nested atomic blocks.
- AutoField / BigAutoField / SmallAutoField are unsupported; use the backend-supported ObjectId auto field where applicable.
- Some relational constraints and query patterns require redesign and verification.

These constraints are material because the current backend uses row locking, transaction blocks, relational references, and prefetching in critical workflows. A connection-string-only change is unsafe.

## Required migration work

### 1. Inventory and design
- Inventory every model, relationship, constraint, queryset operation, signal, task, management command, and migration.
- Classify each relation as an embedded document, referenced document, or independently queried collection.
- Define stable identifiers and reference semantics before changing model fields.
- Define indexes for high-selectivity lookups, uniqueness, status/date filtering, and geospatial donor/item searches as applicable.
- Decide retention and audit immutability requirements.

### 2. Rewrite concurrency-sensitive workflows
Replace SQL row-lock assumptions with MongoDB-safe conditional updates and/or supported transactions. Design and test at least:
- Claim approval and duplicate-claim prevention.
- Locker allocation and collision prevention.
- OTP attempt counting, expiry, and one-time consumption.
- Direct and claim-based handover exactly-once semantics.
- Custody transfers.
- Disposal approvals.
- Append-only audit events.

Every operation must be safe under concurrent requests, retries, and process restarts. Do not rely on a read-then-write sequence without an atomic guard.

### 3. Data migration
- Create a versioned export from the current PostgreSQL database.
- Transform relational records into the approved MongoDB document/reference model.
- Preserve primary identifiers, ownership, timestamps, statuses, and audit history.
- Validate record counts, references, uniqueness, required fields, and representative records.
- Run a dry-run import before any production cutover.
- Keep a documented rollback path; do not delete or overwrite the source database during validation.

### 4. Configuration and deployment
- Pin the Django MongoDB Backend release to the Django 5.2 line; verify the exact compatible patch version and Python version in CI.
- Configure the Django database engine and Atlas URI through environment variables only.
- Keep credentials out of source control, logs, build output, and frontend environment variables.
- Restrict Atlas network access to the backend's actual egress strategy; do not leave broad public access enabled as a permanent setting.
- Replace the PostgreSQL-specific Render blueprint only after the backend passes the migration test suite.
- Keep the frontend API base URL and API contract unchanged unless a separate, tested API change is required.

## Acceptance gates

Do not cut over production until all gates pass:

1. Dependency and configuration checks pass in a clean environment.
2. Django system checks and migration commands pass against a disposable Atlas test database.
3. Model CRUD, authentication, permissions, admin, uploads, and scheduled jobs are verified.
4. Concurrency tests prove no duplicate approvals, allocations, or handovers.
5. OTP replay, expiry, rate limiting, and retry tests pass.
6. Data import validation reports zero unexplained missing or orphaned records.
7. API contract tests pass for the existing Next.js frontend.
8. A rollback rehearsal is documented and completed.
9. Production secrets are configured directly in Render, never committed.

## Important operational notes

- Use a dedicated Atlas database user with least-privilege access.
- Rotate any database password that has been exposed in chat or source control.
- Store the replacement URI only as a Render secret (for example, `MONGODB_URI`); never paste it into repository files or frontend variables.
- The database name and variable names must be finalized in the settings implementation and deployment configuration together.
- Do not run the existing PostgreSQL-oriented Render blueprint for this migration.

## Next implementation phase

The next code change should be a compatibility-focused backend refactor on this branch, beginning with the model/relationship inventory and the highest-risk transactional workflows. Do not change production settings or remove PostgreSQL dependencies until the MongoDB implementation and its tests are ready.
