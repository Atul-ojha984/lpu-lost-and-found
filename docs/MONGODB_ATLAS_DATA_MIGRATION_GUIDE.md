# PostgreSQL to MongoDB Data Migration Guide

**Status:** Import tooling implemented; PostgreSQL-source integration and Atlas validation are blocked until an isolated PostgreSQL source and MongoDB target are available. No production import or cutover has been run.

## Safety model

- `migrate_postgres_to_mongodb` defaults to a read-only dry run. It requires an explicit PostgreSQL source URL and an explicitly selected `config.settings_mongodb` target.
- The source is read through one PostgreSQL `REPEATABLE READ, READ ONLY` snapshot so writes occurring during a run do not cause records to be skipped across batches. Long runs retain a PostgreSQL snapshot and can delay vacuum cleanup; schedule and monitor large runs accordingly.
- The importer opens one Mongo transaction per batch. A replica set or sharded MongoDB deployment is required. A committed batch is never rolled back by a later-batch failure; the checkpoint supports resuming and the target is never cleared.
- A destination row is matched by deterministic mapped ID, or by framework natural key for content types, permissions, and groups. Identical rows are treated as already imported; different rows are rejected rather than overwritten.
- Checkpoints contain database names, hashed endpoint identities, migration fingerprint, per-model progress, and last source primary keys. Store checkpoint/report files in access-restricted storage; do not commit them.
- Audit metadata is passed through the existing sensitive-key sanitizer. Migration uses `bulk_create` to avoid firing application post-save notification/audit side effects. Computed `CustodyLocation.name_key` values are derived explicitly.
- Django session rows and transient `WorkflowMutex` coordination rows are intentionally excluded. Users will need fresh sessions after a future cutover; workflow mutex revisions are not business history.
- Database migration copies file paths/URLs only. It does not transfer or checksum image, evidence, signature, or certificate bytes.

## Configuration

Use an isolated PostgreSQL copy and a dedicated disposable Mongo replica set for the first rehearsal. Do not put connection strings into source files, shell command arguments, reports, or Git. Supply them via a protected process environment or a secret manager.

Set these environment variables in the process environment:

| Variable | Purpose |
|---|---|
| `DJANGO_SETTINGS_MODULE=config.settings_mongodb` | Selects the opt-in Mongo target; PostgreSQL remains the normal application default. |
| `MONGODB_URI` | Explicit MongoDB replica-set or Atlas URI. Never print this value. |
| `MONGODB_DATABASE` | Explicit target database name. |
| `POSTGRES_SOURCE_URL` | PostgreSQL source URL. Never print this value. |

The Mongo backend settings enforce Atlas `mongodb+srv://` URIs in production mode. An Atlas/staging URI and credentials were not available during local verification.

## Commands

Run from `backend/` with the project Python environment. The first run should be a read-only preflight:

```text
python manage.py check --settings=config.settings_mongodb
python manage.py migrate_postgres_to_mongodb --dry-run --batch-size 100
```

The dry run reports database names and per-model source/destination counts; it does not copy row contents or write to either database. It also checks that source migration-state models have a target model and compatible fields.

After a separately reviewed isolated rehearsal has populated the destination, compare every retained model with:

```text
python manage.py migrate_postgres_to_mongodb --validate-only --batch-size 100
```

Validation fails if a source row differs or is missing, or if a target collection has a different record count. Run it only against the dedicated migration target, because existing independent target records intentionally cause a reconciliation failure.

Import is an explicit, separately authorized operation and requires a protected checkpoint path:

```text
python manage.py migrate_postgres_to_mongodb --import --checkpoint-file <private-path> --batch-size 100
python manage.py migrate_postgres_to_mongodb --import --resume --checkpoint-file <same-private-path> --batch-size 100
python manage.py migrate_postgres_to_mongodb --validate-only --batch-size 100
```

`--resume` uses the same checkpoint and source/target endpoint fingerprints. It rechecks already completed models and continues an interrupted model after its last committed source primary key. If the source data changes between runs, final validation is required and must pass before any cutover decision.

Remote endpoints require explicit `--source-environment` and `--target-environment` classification. Production-labelled endpoints additionally require `--allow-production-data`; that flag is a safety gate, not a substitute for explicit human approval. No production import is authorized by this guide.

An optional sanitized report can be written with `--report-file <private-path>`. Reports contain counts and model labels only; still treat them and checkpoint files as operational artifacts.

## Reconciliation and exit criteria

1. Confirm the source schema/migration state is the intended one and the source is stable for the rehearsal.
2. Review dry-run counts and field compatibility output.
3. Confirm the destination is a dedicated empty/test database with Mongo schema migrations already applied.
4. Import only after explicit approval of the exact source and target environments.
5. Run `--validate-only`; resolve every mismatch and unresolved-reference error. Do not cut over on a partial import.
6. Independently verify UUID relationships, auth roles/groups/permissions, claim and handover history, locker occupancy, audit records, and encrypted OTP fields without displaying their values.
7. Migrate and checksum referenced media/evidence separately; verify private access controls.
8. Run Atlas index, API, endpoint-concurrency, frontend, backup, and rollback gates from the remaining phase documents.

## Known blockers

- No local PostgreSQL server/source database is available in this environment, so source connection, actual cross-database copy, source-snapshot semantics, batch rollback/retry, and end-to-end reconciliation are not yet integration-verified.
- No Atlas URI/cluster access is available. Atlas schema/index creation and transaction/concurrency behavior remain unverified.
- PostgreSQL is still the deployed/default database. The importer does not change application settings, services, routes, or traffic.
- File bytes, deployment, production data import, and production cutover are explicitly out of scope until their separate approval and verification gates pass.
