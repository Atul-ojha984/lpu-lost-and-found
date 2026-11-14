# MongoDB Atlas Migration Test Report

**Scope:** Local verification for the `migration/mongodb-atlas` branch. This report does not certify Atlas, Render, production PostgreSQL, migration import, media migration, or production cutover.

## Results summary

| Area | Result | Evidence / limitation |
|---|---|---|
| Django under official MongoDB Backend 5.2.4 | PASS | Full backend suite: **186 passed, 1 skipped** on the dedicated local MongoDB 8.2.2 replica set. |
| Django default SQLite regression | PASS | Full backend suite: **181 passed, 6 skipped**. The six skips are the PostgreSQL row-lock test and five Mongo transaction tests that require the Mongo settings/replica set. |
| Importer-focused regression after final test updates | PASS | **11 passed** under both Mongo-configured and SQLite settings (10 importer tests plus custody timeline ordering). |
| MongoDB workflow transactions | PASS locally | The full Mongo suite includes replica-set commit, rollback, callback, and competing-workflow transaction coverage. This is not Atlas validation. |
| Django configured system check | PASS | Mongo settings: 0 issues. |
| Migration drift check | PASS | Mongo settings: no changes detected. |
| Frontend unit/contract checks | PASS | 11 passed, 0 failed. |
| Frontend TypeScript | PASS | `npm run typecheck:web`. |
| Frontend lint | PASS with warning | No errors; one existing `react-hooks/set-state-in-effect` warning at `apps/web/src/app/login/page.tsx:37`. |
| Frontend production build | PASS | Next.js 16.4.2 generated all 27 routes. |
| PostgreSQL source / cross-database importer | BLOCKED | No isolated PostgreSQL source was available; no PostgreSQL data was read or copied. |
| MongoDB Atlas / production integration | NOT TESTED | No Atlas connection or credential was configured. |

## Covered behavior

The Mongo/SQLite backend suites cover authentication, role permissions, reporting, claim state changes, ownership verification, OTP and handover flows, custody and locker operations, disposal, audit/notifications, and API contracts. The focused migration-command tests cover:

- Stable ObjectId mapping for SQL auto-increment identifiers and UUID preservation.
- Source migration-state model/field mapping and dependency ordering.
- MongoDB datetime millisecond-precision comparison.
- Atomic checkpoint-file writing and endpoint hash privacy.
- Sensitive audit metadata redaction and avoiding post-save notification replay.
- Missing source configuration and remote/production classification guards.
- Deterministic custody timeline ordering using explicit timestamps.

The importer has not yet been exercised with actual PostgreSQL rows, real cross-database foreign-key resolution, resume after a committed batch, or final collection reconciliation.

## Failures found and repaired during verification

The first complete default SQLite run reported **178 passed, 6 skipped, 3 failed**:

1. The existing custody timeline test depended on two rapidly generated default timestamps being distinct. It now supplies two explicit timestamps one second apart. This changes the test fixture only; the application workflow is unchanged.
2. Two newly added importer guard tests assumed `MONGODB_URI` existed under the default SQLite settings. They now set the test-only settings attribute and mock the database vendor so the guard can be tested without a Mongo connection.

The focused tests then passed under SQLite and Mongo settings, and the full SQLite rerun passed with **181 passed, 6 skipped**. No test failure remains in the rerun.

## Not run / external gates

- Importer dry-run, validation-only against populated source/target, import, checkpoint resume, and reconciliation require an isolated PostgreSQL source database. The command rejects a missing source URL; it was not pointed at production.
- Atlas migration/index initialization and Atlas-specific unique-index/transaction/concurrency tests require an Atlas staging cluster and are not run.
- Production API/browser testing, file storage migration/checksum checks, live authentication, and role-specific deployed workflows require authorized staging accounts and deployed integration resources.
- Production data import, production database configuration change, deployment, and traffic cutover have not been performed or approved.

## Security observations that remain release blockers

- The legacy claim model has a plaintext `handover_otp` field alongside encrypted fields, and the claimant-facing serializer reads the plaintext value. The migration command does not print OTP material, but a reviewed encrypted operational path is still required before production cutover.
- Local replica-set concurrency tests do not prove Atlas cluster configuration, indexes, or production contention behavior.
- Public/private media and evidence bytes are not in the database importer and require a separate durable-storage migration and authorization check.

## Recommendation

**Ready for local development testing. Not ready for staging sign-off or production cutover.** First obtain a sanitized PostgreSQL copy and dedicated Atlas staging cluster, run importer dry-run/import/reconciliation, verify media and active OTP handling, then complete Atlas-specific workflow, permission, backup, and rollback gates.
