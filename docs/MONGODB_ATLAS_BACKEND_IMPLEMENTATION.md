# MongoDB Backend Implementation

**Scope:** Active Django backend only. The existing PostgreSQL settings remain the default; this implementation is an explicit opt-in path for isolated migration testing and future staging.

## Version and settings selection

- Django is constrained to `>=5.2,<5.3` and the official `django-mongodb-backend` is pinned to `5.2.4`.
- Python 3.12 is the tested runtime for this migration work.
- MongoDB settings are selected explicitly with `DJANGO_SETTINGS_MODULE=config.settings_mongodb`.
- The Mongo settings require `MONGODB_URI` and `MONGODB_DATABASE`; the production mode requires an Atlas `mongodb+srv://` URI and rejects localhost. Values are never logged.
- The default `config.settings` continues to use PostgreSQL and its existing migration history. This change does not switch Render or production traffic.

## Schema and migration strategy

The Mongo settings use separate `MIGRATION_MODULES` for Django admin, auth, contenttypes, and each domain app. This gives MongoDB a clean schema graph without executing PostgreSQL-only historical DDL. Domain UUID primary keys are preserved. Django contrib integer auto fields use the official `ObjectIdAutoField` app configs and Mongo-specific initial migrations.

Mongo migrations are schema/index setup only; they do not copy production data. The independent PostgreSQL-to-Mongo importer is a later phase and must remain explicit, dry-run-first, resumable, and reconciliation-gated.

Compatibility model changes retained in the regular model state:

- `CustodyLocation.name_key` materializes normalized case-insensitive uniqueness in place of the unsupported functional `Lower(name)` constraint. The existing SQL migration checks for colliding names before backfill and aborts without merging records.
- Redundant explicit indexes duplicating unique or `db_index=True` field indexes were removed from user/category/location models. The remaining query indexes are preserved.
- Existing audit notification uniqueness remains unconditional. The MongoDB backend emits a type-filtered unique index so SQL's distinct-NULL semantics are preserved without an unsupported `isnull` partial-filter expression.

## Transaction and workflow compatibility

Application writes use `apps.core.db_transactions` and `apps.core.workflow_concurrency`. PostgreSQL continues to use Django transactions/row locks. MongoDB uses the official backend transaction API and a shared `WorkflowMutex` record per workflow aggregate. Transactions require a replica set or sharded deployment; nested savepoints are not available. The facade aborts the outer Mongo transaction if a nested block fails and the exception is caught by application code.

Only errors bearing the MongoDB `TransientTransactionError` label are eligible for bounded whole-operation retry. Unknown commit results are not replayed. Scope rows are created before the transaction, then revision increments and domain writes commit or abort together. Real local replica-set tests exercise commit, rollback, callback suppression, nested-failure handling, and competing transactions; full application tests also exercise the API workflows under MongoDB.

## Validation performed

On Python 3.12.14, Django 5.2.19, Django MongoDB Backend 5.2.4, and a dedicated local MongoDB 8.2.2 replica set:

- `manage.py check --settings=config.settings_mongodb`: passed.
- `makemigrations --check --dry-run --settings=config.settings_mongodb`: passed.
- A fresh isolated database completed the full Mongo migration graph; `showmigrations --plan` showed every migration applied.
- Full backend suite under MongoDB: **176 passed, 1 skipped**. The skipped test explicitly requires PostgreSQL row-lock behavior.
- Full default SQLite regression suite: **171 passed, 6 skipped**. Skips are backend-specific Mongo transaction tests and the PostgreSQL row-lock test.
- The Mongo backend migration checks do not connect to Atlas or Render; only the local isolated replica set was used.

The full repository test and frontend validation results are recorded in the execution tracker. No Atlas import, production migration, deployment, or cutover was performed.

## Remaining gates

- Connect only to a separately provisioned Atlas staging cluster, apply indexes, and rerun the compatibility/integration/concurrency suite before any production decision.
- Keep PostgreSQL as the production/source system until data export/import, reconciliation, media-file handling, backup, rollback, and cutover gates are complete and explicitly approved.
- Select and validate durable private media/evidence storage independently; MongoDB schema migration does not move file contents.
- Review backend-specific limitations for every new ORM query and migration. In particular, `select_for_update`, `prefetch_related`, nested savepoints, and Django `dumpdata`/`loaddata` are not supported by this backend release.

## Official references

- [Django MongoDB Backend v5.2 compatibility limitations](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/limitations-upcoming/)
- [Django MongoDB Backend compatibility matrix](https://www.mongodb.com/docs/drivers/compatibility/?driver-language=python&python-driver-framework=django)
- [Django MongoDB Backend migration guidance](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/integrations/djongo-migration/)
- [Django MongoDB Backend connection settings](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/connect/)
