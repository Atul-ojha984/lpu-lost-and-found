# MongoDB Atlas Migration Rollback and Recovery Plan

**Current state:** No PostgreSQL-to-Atlas production import, production database change, or traffic cutover has occurred. PostgreSQL remains the deployed source of truth. The procedures below are planning guidance; a rollback rehearsal has not been performed.

## Decision rule

Before any cutover, PostgreSQL remains the rollback source. After MongoDB accepts business writes that PostgreSQL has not received, simply changing `DJANGO_SETTINGS_MODULE` or `NEXT_PUBLIC_API_URL` back to PostgreSQL is unsafe: those Mongo-only writes would disappear from the live application. The current migration tool is one-way from PostgreSQL to MongoDB and does not synchronize post-cutover writes back to PostgreSQL. Do not declare a post-write rollback safe until a tested reverse migration/reconciliation or controlled write freeze and reconciliation plan exists.

## Recovery states

| State | Data writes | Safe response |
|---|---|---|
| Development or staging only | Test data is isolated from production | Stop the staging service or restore the staging Atlas snapshot. The live PostgreSQL service and frontend remain unchanged. |
| Production deployment prepared, before routing/write cutover | Production application still reads/writes PostgreSQL | Roll back the candidate Render deployment/configuration to the last known PostgreSQL release. Keep the PostgreSQL database and its backups unchanged. |
| Traffic switched to MongoDB, verified no business writes accepted | No Mongo-only writes occurred | Restore the prior PostgreSQL-backed backend release and its existing PostgreSQL `DATABASE_URL`; restore the Vercel Production API URL if it changed. Verify health and login before reopening writes. |
| MongoDB has accepted one or more business writes | MongoDB contains the live source of truth for those writes | Do not point users at the stale PostgreSQL copy. Keep MongoDB active, enter a controlled maintenance/write-freeze window, preserve snapshots, then run an independently tested reverse synchronization/reconciliation. If no safe reverse path is available, fix forward on MongoDB. |
| MongoDB corruption or suspected security incident | State and scope are uncertain | Stop writes through a reviewed maintenance mechanism, preserve logs and snapshots, identify the last known good backup, and rehearse recovery in an isolated cluster before restoring production. Do not overwrite PostgreSQL or Atlas evidence. |

## Pre-cutover safeguards

1. Keep the existing Render PostgreSQL database, backups, and service intact. Do not rename, delete, repoint, or repurpose the production database.
2. Record the PostgreSQL backup/snapshot identifier, backup time, PostgreSQL migration level, application commit, Vercel deployment identifier, current API URL, and Render deployment identifier in a restricted change record. Do not place credentials or private user data in that record.
3. Make a dedicated Atlas backup/snapshot before any import rehearsal. Verify restore capability on a disposable target; a backup configuration without a restore test is not a verified recovery point.
4. Capture source and target counts, importer checkpoint/report hashes, model-level reconciliation results, and referenced media checksums in access-controlled storage.
5. Prove the application version and both settings paths in isolated staging. Confirm that the PostgreSQL release can still be deployed and connects to the retained PostgreSQL database.
6. Keep `SECRET_KEY`, `JWT_SIGNING_KEY`, and `FIELD_ENCRYPTION_KEY` stable across a planned data cutover if their existing compatibility and security review allows it. Never print, copy to frontend variables, or rotate these incidentally. If any key must change, plan token invalidation and encrypted-field re-encryption explicitly.
7. Identify and resolve pending claim, OTP, custody, locker, handover, disposal, audit, and notification work before the cutover window. Never migrate or expose plaintext OTP values in logs or reports.
8. Agree on a write freeze, maximum freeze duration, decision owner, abort deadline, and restoration operators before any production cutover approval.

## Pre-write rollback procedure

Only use this procedure if the candidate backend has not accepted production business writes on MongoDB:

1. Put the candidate service into the approved maintenance/read-only state, if it has received any traffic.
2. Confirm via restricted operational telemetry that no production mutation was committed to MongoDB. Do not infer this only from frontend analytics.
3. Restore the last known PostgreSQL-backed Render deployment and the existing PostgreSQL settings selection/`DATABASE_URL` from the protected service configuration. Never place the URL in a command, Git, or report.
4. Restore the prior Vercel deployment/API configuration if Production was changed. `NEXT_PUBLIC_API_URL` is a public build-time value; issue a new deployment or promote a verified prior deployment with the correct production API target.
5. Verify the PostgreSQL health endpoint, registration-number login using a dedicated authorized test account, role-specific authorization, claim/OTP/handover read paths, and a representative read/write transaction before removing the maintenance state.
6. Keep the candidate Atlas database and logs intact for diagnosis. Do not drop it as part of rollback.

## Post-write recovery requirement

No simple post-write rollback is currently approved. The importer `migrate_postgres_to_mongodb` is one-way; it does not map Mongo-only updates back to PostgreSQL, preserve all backend-specific semantics in reverse, or provide bidirectional conflict resolution. Before any production Mongo write traffic is enabled, choose and rehearse one of these plans:

- **Fix forward:** retain MongoDB as the source of truth, restore the last known-good Mongo-compatible application release, and repair the application without switching the database back.
- **Write freeze plus reverse reconciliation:** freeze all mutations, take consistent snapshots, compare MongoDB with the pre-cutover PostgreSQL baseline, export and map only post-cutover writes, resolve ID/constraint/conflict differences, import into a separate PostgreSQL recovery copy, run full validation and business workflow tests, then obtain a new explicit approval before routing traffic to that reconciled PostgreSQL copy. The reverse importer and this runbook must be implemented and tested before relying on this option.
- **Preplanned change capture/dual-write:** only if separately designed, consistency-tested, monitored, and approved before cutover. No such change-capture or dual-write mechanism is currently implemented; ad hoc dual writes are not acceptable.

Never overwrite the preserved pre-cutover PostgreSQL backup. Keep the original immutable recovery point and create a separate reconciled database for any reverse import. Preserve MongoDB snapshots, PostgreSQL snapshots, checkpoints, model counts, and audit evidence until incident review closes.

## Code and service rollback

- Keep work on `migration/mongodb-atlas`; do not alter `main`.
- Prefer the hosting provider's deployment history to redeploy a known-good release. For repository changes, make a reviewed revert commit on the migration branch rather than resetting or force-pushing shared history.
- The existing `backend/render.yaml` is PostgreSQL-oriented and was intentionally left unchanged. Do not point it to Atlas by changing only its database URL or blindly reusing its automatic startup migration command.
- The current Vercel Production project must retain its production API URL. Preview and staging variables must be environment-scoped and point only at staging services.
- Do not delete services, databases, volumes, secrets, or backups during rollback.

## Recovery verification checklist

- [ ] Incident/change identifier and decision owner recorded.
- [ ] Writes paused or definitively absent, as applicable.
- [ ] PostgreSQL and Atlas recovery points identified and preserved.
- [ ] Correct application commit and settings module deployed.
- [ ] Health endpoint responds without authentication.
- [ ] Login, JWT persistence, role authorization, and logout verified with isolated accounts.
- [ ] Claims, active OTP expiration/use, handover idempotency, custody/locker history, and Recovery History reconciled.
- [ ] Public and private media/evidence availability and access controls verified.
- [ ] Counts, relationships, indexes, and audit history reconciled.
- [ ] Frontend production API URL verified without exposing database credentials.
- [ ] Maintenance state removed only after an authorized go/no-go decision.
- [ ] Follow-up actions and remaining data divergence documented.

## Current rollback readiness

- Pre-cutover rollback to PostgreSQL: **PLANNED, NOT REHEARSED**. PostgreSQL remains live and unchanged, so no database reversal is currently necessary.
- Post-write MongoDB-to-PostgreSQL rollback: **BLOCKED**. No reverse importer, CDC, or dual-write protocol exists or has passed verification.
- Production backup/restore: **NOT VERIFIED** for either platform in this work session.
- Production cutover: **NOT AUTHORIZED / NOT PERFORMED**.
