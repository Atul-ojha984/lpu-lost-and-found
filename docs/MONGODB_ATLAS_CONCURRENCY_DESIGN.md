# MongoDB Atlas Workflow Concurrency Design

**Phase:** 3 - Critical business logic redesign
**Status:** VERIFIED against the full application test suite on a local MongoDB replica set. Atlas staging validation remains pending.
**Scope:** Active Django backend only. PostgreSQL remains the production database and source of truth.

## Design constraints

- Django MongoDB Backend 5.2 does not support `select_for_update()` or Django's native `transaction.atomic()` API. The backend transaction API requires a replica set or sharded cluster.
- Backend 5.2 nested atomic blocks do not create savepoints. Application code must not catch an inner transaction error and then commit an outer transaction as if the inner work rolled back.
- Critical transitions are guarded by shared workflow mutexes, in-transaction state re-reads, and applicable unique indexes. Exact Mongo index support remains a Phase 4/6 verification gate.
- Retry only errors labeled `TransientTransactionError`, and rerun the full idempotent database operation. Do not replay unknown commit results.
- Notifications use the backend-aware commit callback. Database retry wrappers are limited to operations whose database writes can be safely replayed; evidence file writes remain outside an automatic retry wrapper.

## Implemented serialization primitive

`WorkflowMutex` is a private coordination record with a stable string primary key, monotonically increasing revision, and update timestamp. IDs are normalized to canonical UUID strings before creating scopes.

- `item:<uuid>` serializes claims, direct recovery, item edits/withdrawal/expiry, matching, OTP/handover, disposal, and item custody transitions.
- `user:<uuid>` serializes report creation for that user and protects the daily student lost-report cap.
- `admin:system-administrators` serializes user creation, role/status changes, deletions, and first-admin provisioning before the active-admin set is read.
- `custody:inventory` serializes locker assignment/movement/release, location/locker configuration, and physical handover.

The global custody scope is intentionally conservative. Current locker state can change between a pre-read and entry into a transaction, so one shared scope avoids a dynamic old/new locker-scope race. It may reduce throughput; narrower per-locker/location scopes require separate contention and stale-lock-set tests before adoption.

Scope records are ensured before the business transaction. Then all requested scopes are incremented in stable sorted order inside the transaction. MongoDB updates use an atomic `F('revision') + 1` operation on the coordination document, so competing transactions conflict on the same aggregate gate. PostgreSQL uses a row lock and increment behind the same service API. Scope data contains no user details, credentials, OTPs, or evidence.

## Workflow guard map

| Workflow | Shared scope(s) | In-transaction behavior | Required outcome |
|---|---|---|---|
| Claim submission and direct intake | Item; direct intake also custody | Re-read item state, active claims, direct recovery, custody state | No incompatible workflow starts concurrently. |
| Challenge answer and claim review | Item | Re-read claimant/status/attempts and update answer or review state | Attempts and approval decisions serialize; competing claims are rejected by the existing transition logic. |
| Evidence upload | Item | Re-read claim and completion state before appending evidence reference | Completion cannot race an upload; filesystem cleanup runs if the database operation fails. |
| Normal OTP/handover | Item + custody | Re-read claim/item/handover, validate OTP, release occupied locker, update claim/item/handover/custody/audit atomically | At most one completion and one custody release. |
| Direct recovery intake/review/OTP/handover | Item + custody | Re-read item/recovery/recipient, revalidate configured custody location, validate OTP, release locker and persist all completion history | At most one direct recovery completion; intake/reviewer/handover actors stay distinct. |
| Locker assignment/move and custody transfer | Item + custody | Re-read item and current/requested locker, validate occupancy/location, write movement history with allocation | Single-occupancy checks and historical movement records remain consistent. |
| Locker/location configuration | Custody | Re-read current config and active assignments before update/delete/archive | In-use locations cannot become unavailable under an assignment. |
| Student daily lost-report cap | User | Count qualifying local-day reports and create the report inside the same user scope | Concurrent submissions cannot exceed the configured limit. |
| Lost-report expiration/withdrawal/edit | Item | Recheck age/status/claim/handover/custody eligibility while holding the item gate | A protected item cannot be withdrawn/expired/edited across a concurrent workflow transition. |
| Disposal | Item + custody | Recheck terminal item state, release any locker, create disposal/custody/audit records atomically | One authorized disposal without racing handover or leaving a locker occupied. |
| Last active system administrator | Global admin + target user | Recompute active system-admin set only after acquiring the global admin gate | Concurrent changes cannot remove the final active system administrator. |

## Backend-aware transaction and retry behavior

- `apps.core.db_transactions` routes PostgreSQL to Django transactions and MongoDB to the official backend transaction API. Caught nested exceptions mark the outer Mongo transaction rollback-only; they do not emulate savepoints.
- `workflow_transaction` increments all shared scopes inside one transaction.
- `retry_transient_mongo_transaction` recognizes MongoDB's `TransientTransactionError` label in wrapped driver exceptions and retries a bounded number of times. It does not retry `UnknownTransactionCommitResult`.
- `audit.signals` registers notification delivery with the configured backend's `on_commit` callback.
- The initial-admin command now uses the same global admin scope instead of PostgreSQL-only advisory SQL and unsupported row locks.

## Verification evidence and remaining limits

- A separate local replica set runs at `127.0.0.1:27018` with MongoDB `8.2.2`. The existing standalone Mongo service at `127.0.0.1:27017` was only inspected and left untouched. MongoDB's compatibility table treats the 8.0 major column as compatible with its minor/patch releases; Atlas still requires its own staging verification.
- Django MongoDB Backend `5.2.4` and Django `5.2.19` were exercised in a temporary Python `3.12.14` environment. The standard `config.settings` continues to use PostgreSQL; no production setting was switched.
- The focused real replica-set transaction/concurrency primitive suite passed **5 tests**, including commit callbacks, explicit and exception rollback, nested-failure abort, and two competing transactions that acquire the same scopes in opposite input order.
- The full application suite under `config.settings_mongodb` passed **176 tests, 1 skipped**. The skip is the test that specifically requires PostgreSQL row locks. This suite covered claims, OTP/handover, direct recovery, custody/lockers, reporting limits/expiry, disposal, administration, and API permissions on MongoDB.
- The full default SQLite regression suite passed **171 tests, 6 skipped**. Skips were backend-specific Mongo transaction tests and the PostgreSQL row-lock test.
- Django Mongo system checks, migration drift check, and a clean full Mongo migration graph passed. The contrib AutoField and functional custody-name constraint blockers were resolved with separate migration modules, ObjectId app configs, and a normalized unique field.
- These tests use a local replica set, not the user's Atlas project. They verify transaction/index behavior of the pinned backend locally but do not validate Atlas credentials, network rules, Atlas tier, or production data.
- The transaction primitive test demonstrates real concurrent writes through the common mutex; API workflow tests currently verify full individual transitions under Mongo. Operation-specific simultaneous endpoint stress for every workflow remains a pre-production acceptance test and should be run against isolated Atlas staging before cutover.

## Official references

- [Django MongoDB Backend v5.2 transactions and sessions](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/interact-data/transactions/)
- [Django MongoDB Backend v5.2 compatibility limitations](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/limitations-upcoming/)
- [Django MongoDB Backend and MongoDB/Python compatibility matrix](https://www.mongodb.com/docs/drivers/compatibility/?driver-language=python&python-driver-framework=django)
