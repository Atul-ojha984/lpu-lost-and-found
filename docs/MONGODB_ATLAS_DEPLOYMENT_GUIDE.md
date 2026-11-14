# MongoDB Atlas Deployment Preparation

**Status:** Configuration guidance and local settings validation are complete. No Render/Vercel configuration, service, environment variable, Atlas cluster, import, production deployment, or traffic cutover was changed or created.

## Current and target architecture

The currently deployed system remains Next.js on Vercel → Django on Render → Render PostgreSQL. The MongoDB Django backend is opt-in through `DJANGO_SETTINGS_MODULE=config.settings_mongodb`; changing that variable on the live service would change the database used by the application and is not part of this preparation.

Use a distinct staging deployment and a dedicated non-production Atlas database for the first deployment rehearsal. Keep the current PostgreSQL service and its data as the source of truth. Do not point Vercel Production at a MongoDB-backed service until the migration, reconciliation, durable file storage, security, concurrency, backup, and rollback gates pass and cutover is explicitly approved.

## Render staging service

Do not reuse the existing `backend/render.yaml` as an Atlas cutover blueprint: it describes the current PostgreSQL service and includes a PostgreSQL database association. Do not edit that service or create a new Render resource without separate approval. For a manually approved staging service, use:

| Setting | Staging value |
|---|---|
| Repository branch | `migration/mongodb-atlas` |
| Root directory | `backend` |
| Runtime | Python 3.12 (tested locally with Python 3.12.14) |
| Build command | `pip install -r requirements.txt && python manage.py collectstatic --noinput` |
| Start command | `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 1` |
| Health check | `/api/v1/health` |
| Settings module | `config.settings_mongodb` |

Do not run `migrate` implicitly in the web process start command. After reviewing the staging target and taking a backup/snapshot where applicable, run the schema migration as a deliberate one-off operation:

    python manage.py migrate --noinput --settings=config.settings_mongodb

The command above must target only the dedicated staging database. The existing PostgreSQL-oriented start command runs migrations automatically; do not copy it blindly into a future cutover configuration. Use a non-production environment classification only for disposable/local development; a production-mode staging service must use an Atlas SRV URI and all production security settings.

### Render environment variables

Set secrets in the Render dashboard or approved secret-management workflow; never in Git, a command line, a build log, or this template.

| Variable | Requirement |
|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings_mongodb` on the isolated Mongo staging service only. |
| `DJANGO_ENV` | `production` for a deployed staging service; `development` only on a local machine. |
| `DEBUG` | `False`. |
| `MONGODB_URI` | Secret `mongodb+srv://` URI for the dedicated Atlas staging cluster. |
| `MONGODB_DATABASE` | Dedicated staging database name, distinct from production and PostgreSQL. |
| `SECRET_KEY` | Independent random Django secret. |
| `JWT_SIGNING_KEY` | Separate random JWT key; do not reuse `SECRET_KEY`. |
| `FIELD_ENCRYPTION_KEY` | Existing compatible 32-byte key encoded as accepted by the app; key continuity is required for encrypted fields. Do not rotate casually. |
| `ALLOWED_HOSTS` | Exact staging Render hostname(s), comma separated. |
| `CORS_ALLOWED_ORIGINS` | Exact Vercel Preview origin(s) used for staging, not a wildcard. |
| `CSRF_TRUSTED_ORIGINS` | Exact HTTPS staging frontend origin(s). |
| `SECURE_SSL_REDIRECT` | `True`. |
| `SESSION_COOKIE_SECURE` | `True`. |
| `CSRF_COOKIE_SECURE` | `True`. |
| `SECURE_HSTS_SECONDS` | Use the current reviewed policy; do not enable preload on a disposable hostname. |
| `MEDIA_ROOT` | Durable media mount only after approved storage is configured. |
| `PRIVATE_EVIDENCE_ROOT` | Durable private storage with access controls; never expose via public static serving. |

The Mongo settings no longer require a PostgreSQL `DATABASE_URL` when explicitly selected. The normal `config.settings` production path still requires PostgreSQL and fails closed if that URL is missing. This settings selection behavior has automated tests; it does not establish that an Atlas connection is reachable.

### Atlas network and database setup

For staging, provision a dedicated Atlas replica set or sharded cluster capable of the multi-document transaction behavior required by the workflows. Create a least-privilege database user limited to the staging database. Restrict the Atlas IP access list to the staging service's verified outbound IP ranges or a controlled private-network path. Do not use `0.0.0.0/0` as a convenience. Keep the connection string only in Render's secret environment configuration. Enable backups/point-in-time recovery according to the selected Atlas tier and verify a restore procedure before any data rehearsal.

Apply Mongo migrations explicitly and verify indexes against `docs/MONGODB_ATLAS_INDEX_STRATEGY.md`. Run the application and concurrency suites against that Atlas staging cluster before considering any migration rehearsal. A local replica set is useful evidence, not a substitute for Atlas validation.

## Vercel staging frontend

Keep the existing Next.js app and API client unchanged. For a Preview deployment of this branch:

| Setting | Value |
|---|---|
| Framework | Next.js |
| Root directory | `apps/web` |
| Include files outside root directory | Enabled, because npm workspaces and the lockfile are at repository root. |
| Install command | `cd ../.. && npm ci` |
| Build command | `cd ../.. && npm run build:web` |
| Output directory | Next.js default; do not override `.next`. |
| API environment variable | `NEXT_PUBLIC_API_URL=https://<approved-staging-api-host>/api/v1` |

Set `NEXT_PUBLIC_API_URL` separately for Preview and Production. `NEXT_PUBLIC_*` values are embedded in browser output and are public; only the API base URL belongs there. Never set `MONGODB_URI`, Django/JWT/encryption keys, email credentials, or private storage credentials in Vercel. Keep Production pointed at the current service until a separately approved cutover.

The current frontend notification updates use HTTP polling. The active Django settings do not configure Channels, Redis, or Celery, so this migration does not require a new WebSocket service or worker. No live Vercel→Render/Atlas browser flow has been tested.

## Files and private media

The current Render blueprint uses `/tmp/media` and `/tmp/private_evidence`, which are ephemeral. A database migration copies file references only; it does not transfer or verify image/evidence bytes. Durable public media and private evidence storage must be chosen, access-controlled, migrated, and checksum-verified separately before any staging workflow requiring uploads can be accepted. Do not expose private evidence through a public bucket or static URL.

## Safe staging sequence

1. Keep the current Production Vercel and Render services unchanged.
2. Obtain approval before creating paid or additional cloud resources. Create a separate staging Atlas cluster/database and a separate Render staging service only after approval.
3. Set the environment variables above through secure dashboards. Do not copy production secrets unless a security review establishes that exact need; use separate staging secrets.
4. Deploy only the migration branch to staging. Confirm the health endpoint, settings module, database name, and Atlas cluster identity without logging the URI.
5. Run Django checks, Mongo migrations, index inspection, full backend and concurrency tests, frontend checks, and API/browser integration tests.
6. Provision an isolated PostgreSQL source copy and validate the importer with dry-run and reconciliation first. Production import remains separately approval-gated.
7. Complete durable media/evidence migration and verify checksums and private access.
8. Complete Phase 10 readiness gates and rollback rehearsal. Keep Vercel Production and the live Render service on PostgreSQL until explicit cutover approval.

## Existing deployment files

- `backend/render.yaml` remains the live PostgreSQL-oriented blueprint and was not modified.
- `apps/web/vercel.json` remains unchanged; no rewrite is needed for the Next App Router.
- `backend/.env.example` remains the local PostgreSQL/SQLite example.
- `backend/.env.mongodb.example` is a separate sanitized local-development template. Its values are placeholders only.
- No Render service, Vercel project, environment variable, Atlas cluster, database, or deployment was created or edited.

## Official platform references

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render health checks](https://render.com/docs/health-checks)
- [Render environment variables](https://render.com/docs/configure-environment-variables)
- [Render PostgreSQL connection strings](https://render.com/tutorials/postgres-on-render/connection-strings)
- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [MongoDB Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/add-ip-address-to-list/)
- [Django MongoDB Backend v5.2 transaction guidance](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/interact-data/transactions/)
