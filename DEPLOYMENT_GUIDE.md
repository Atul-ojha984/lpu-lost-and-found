# LPU Lost & Found Deployment Guide

Last inspected: 2026-11-06. This guide describes the repository as it exists; it does not claim that cloud services have been created or deployed.

## Deployment readiness report

| Area | Verified state |
|---|---|
| Frontend | `apps/web`: Next.js 16.4.2, React 19.3.0, TypeScript, npm workspace; production build succeeds. |
| Active backend | `backend`: Django 5.2.18 / Django REST Framework; frontend API client targets `/api/v1`. |
| Legacy API | `apps/api`: Express 4 and Mongoose 8 with a MongoDB configuration template. The current frontend does not use this service; it is not a verified replacement for the Django API. |
| Local database | SQLite fallback, used by the local automated test suite. |
| Current production database contract | PostgreSQL only. Production settings reject a non-PostgreSQL `DATABASE_URL`. `backend/render.yaml` currently defines a Render PostgreSQL 16 database. |
| Render | WSGI/Gunicorn, health endpoint `/api/v1/health`, persistent media/evidence disk, and hourly report-expiry cron are configured. No deployment was created. |
| Vercel | Next.js App Router; no custom rewrite or `vercel.json` is needed for the current routes. |
| Background/realtime | Current app uses HTTP polling for dashboard updates and a Render cron command for report expiry. Django Channels, Redis, and Celery are not configured in the active Django service. |
| Secrets and local data | No tracked `.env` files were found. Local `.env`, SQLite, media, and private evidence paths are ignored by Git. |

### MongoDB Atlas blocker

**Atlas is not a safe database drop-in for the current Django backend. No MongoDB engine change was made.** The active backend's transaction and concurrency correctness depends on `select_for_update()` throughout claims, locker allocation, report limits, OTP generation/verification, and both handover workflows. The code also uses `prefetch_related()` in API querysets, one-to-one/foreign-key relationships, partial/conditional uniqueness constraints, a case-insensitive functional unique constraint, and Django's default `BigAutoField` for framework tables. The official Django MongoDB Backend currently documents `select_for_update()` and `prefetch_related()` as unsupported, `AutoField`/`BigAutoField` as unsupported, partial migration support, and a custom transaction API with no savepoints/nested atomic blocks. Those differences affect security and record integrity, not just configuration. [MongoDB Django compatibility and limitations](https://www.mongodb.com/docs/languages/python/django-mongodb/current/limitations-upcoming/), [MongoDB Django transactions](https://www.mongodb.com/docs/languages/python/django-mongodb/v5.2/interact-data/transactions/).

The present `apps/api` Mongoose service is a separate legacy implementation; its presence and `MONGODB_URI` template do not connect the Django app to Atlas or establish feature parity. **Do not deploy the current Render Blueprint if Atlas is a hard requirement:** it provisions PostgreSQL, and the Django production settings intentionally reject Atlas URLs.

Safest immediate production architecture is the verified Django + PostgreSQL path already represented in the source. If Atlas is mandatory, first create a separate migration/prototype branch and choose one of these deliberate approaches:

1. Adapt the Django project to the supported MongoDB backend, replacing row-lock assumptions with Mongo-safe atomic/idempotent state transitions, redesigning incompatible keys/constraints/relationships, updating migrations, and running concurrency and full-workflow tests against an Atlas replica set; or
2. Port the active Django API and its role, claim, inventory, custody, OTP, handover, and audit behavior to a Mongo-native service, with contract-parity and authorization tests before cutover.

Neither approach is a deploy-time settings change. Keep PostgreSQL as the source of truth until one path passes those tests. Do not dual-write or migrate production records as part of this deployment-preparation task.

## Vercel frontend

1. Import the existing GitHub repository as a Vercel project.
2. Set the project Root Directory to `apps/web`, framework preset to **Next.js**, and use the npm workspace/lockfile detected from the repository. The frontend build command is `npm run build` in `apps/web` (`next build`); leave output directory at the Next.js default.
3. Set the production environment variable `NEXT_PUBLIC_API_URL` to `https://<actual-render-hostname>/api/v1` after the backend has a real URL. Do not copy a guessed hostname. The code now uses localhost only in development and gives an explicit configuration error if the production value is absent.
4. Add the exact Vercel production origin (and any deliberately supported preview origins) to Django `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`. Do not use broad wildcard CORS origins.
5. Vercel handles Next.js routing; no `vercel.json` rewrite is required for this App Router project. The monorepo root lockfile is `package-lock.json`.

No Vercel project or deployment was created. Vercel's monorepo setup uses a project root directory for each app; verify the workspace install from the imported repository before promoting a deployment. [Vercel monorepo docs](https://vercel.com/docs/monorepos), [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build).

## Render backend (current PostgreSQL configuration only)

The existing blueprint is `backend/render.yaml`. When creating the Blueprint in Render, set **Blueprint Path** to `backend/render.yaml` (Render otherwise defaults to a root-level `render.yaml`).

- Root directory: `backend`
- Runtime: Python 3.12.5
- Build: `pip install -r requirements.txt && python manage.py collectstatic --noinput`
- Pre-deploy migration: `python manage.py migrate --noinput`
- Start: `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 3`
- Health check: `/api/v1/health`
- Durable uploads: disk mounted at `/var/data`, with `MEDIA_ROOT=/var/data/media` and `PRIVATE_EVIDENCE_ROOT=/var/data/private_evidence`
- Scheduled job: hourly `python manage.py expire_student_lost_reports`

The Blueprint's database and scheduled job currently depend on Render PostgreSQL. It is provided as a reference for the verified PostgreSQL architecture only; do not apply it for an Atlas deployment. A pre-deploy migration command is preferable to running schema migrations in the build phase; Render documents pre-deploy commands for database migrations. [Render deploys](https://render.com/docs/deploys), [Render Blueprint reference](https://render.com/docs/blueprint-spec).

The persistent disk is runtime-only and attaches to one service instance; Render notes that a disk prevents scaling that service to multiple instances and disables zero-downtime deploys. Keep one instance while storing uploads on this disk, or move uploads to a durable object-storage service before horizontal scaling. [Render persistent disks](https://render.com/docs/disks).

The Django login flow sets a secure `HttpOnly` cookie with `SameSite=Strict` in production, while the frontend also sends its existing bearer token. The default Vercel and Render hostnames are cross-site, so browser cookie fallback is not guaranteed between them. Prefer the configured first-party custom domain pair after DNS/TLS are established, and verify login, token refresh, logout, and CSRF behavior in a real browser after deployment. Local integration tests do not verify browser cookie policy across two cloud origins.

### Backend environment variables

Set values in the Render dashboard/Blueprint secret store, never in frontend variables or Git:

| Variable | Production requirement |
|---|---|
| `DJANGO_ENV` | `production` |
| `DEBUG` | `False` |
| `SECRET_KEY` | Unique high-entropy Django secret; keep stable across deploys. |
| `JWT_SIGNING_KEY` | Separate stable high-entropy signing key. |
| `FIELD_ENCRYPTION_KEY` | Stable key in the format accepted by `backend/apps/core/crypto.py`; losing it can make protected identifying details unreadable. |
| `DATABASE_URL` | Current Django code requires PostgreSQL. It does not accept the Atlas URI. |
| `ALLOWED_HOSTS` | Actual Render hostname plus any configured backend custom domain. |
| `CORS_ALLOWED_ORIGINS` | Exact deployed frontend origins, comma-separated. |
| `CSRF_TRUSTED_ORIGINS` | Exact HTTPS frontend origins used for trusted unsafe requests. |
| `SECURE_SSL_REDIRECT` | `True` |
| `SESSION_COOKIE_SECURE` | `True` |
| `CSRF_COOKIE_SECURE` | `True` |
| `SECURE_HSTS_SECONDS` | `31536000` after HTTPS and domain setup are confirmed. |
| `MEDIA_ROOT` | `/var/data/media` for the configured disk. |
| `PRIVATE_EVIDENCE_ROOT` | `/var/data/private_evidence` for the configured disk. |

`REDIS_URL`, `EMAIL_HOST`, SMS credentials, and Celery variables are not consumed by the active Django configuration found in this checkout. Do not add them unless those services are intentionally implemented and deployed. `MONGODB_URI` belongs to the legacy `apps/api` template only and does not configure Django.

## Local setup and verification

Use the existing service-specific templates, not a shared root `.env` (Django loads `backend/.env`; Next.js reads `apps/web/.env.local`):

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item apps/web/.env.example apps/web/.env.local
npm ci
npm run check:django
npm run test
npm run typecheck:web
npm run lint
npm run build:web
```

Set the real production API URL only in Vercel. `backend/.env.example` is local-development configuration and its placeholder keys are not production secrets.

### Controlled schema migration

For the current Render/PostgreSQL Blueprint, the migration command is configured as `preDeployCommand`; review its output and ensure a database backup exists before each production schema change. For a database migration to MongoDB, do not run the current Django migrations against Atlas: the active ORM model and query behavior have not been made compatible.

## GitHub repository preparation

- `.gitignore` excludes `.env` files, Python/Node caches, SQLite databases, build output, uploaded media, and private evidence while allowing sanitized `*.env.example` templates.
- `git ls-files` found no tracked `.env` files. A secret-pattern scan found no tracked private-key blocks, common provider tokens, or credential-bearing database URLs; URL-shaped hits were documentation examples with placeholders.
- The root README previously listed local demo passwords. They have been removed. The development seed command still has demo defaults for local test personas, and now refuses to run when `DJANGO_ENV=production`.
- Demo credential strings were present in committed development documentation/history before this cleanup. Git history was not rewritten. If any of those values were ever reused for a real account, rotate that account's password and any associated secrets; removing a value from the latest file does not remove it from prior commits.
- The worktree already contains substantial uncommitted changes from prior feature work. Review `git status` and each diff before staging; this task did not commit, reset, or push those changes.

After reviewing and staging the intended repository contents, the manual first-upload commands are:

```powershell
git status --short
git diff --check
git diff --cached
git commit -m "Prepare LPU Lost and Found for deployment"
git push origin main
```

Confirm the correct GitHub remote and branch before pushing. No GitHub authentication was used and no push was performed.

## MongoDB Atlas setup requirements (blocked pending backend compatibility work)

Atlas account-level setup can be done separately, but do not point this Django application at it yet:

1. Create the Atlas project/cluster and a database user with only the application database's required privileges.
2. Restrict Network Access to the Render service's verified outbound addresses or an approved private connectivity path; do not use unrestricted `0.0.0.0/0` for production.
3. Store the Atlas connection string only as a backend secret. Never place it in `NEXT_PUBLIC_*`, source control, build logs, or screenshots.
4. Configure backups and retention before importing production data.
5. Complete the compatibility migration/prototype described above, verify indexes and transaction semantics, and reconcile record counts/references before any cutover. Retain a tested PostgreSQL rollback snapshot until acceptance.

The legacy Express/Mongoose service has an Atlas-style environment template but is disconnected from the current Next.js API client. It must not be treated as the migration target without feature, identity, authorization, OTP, custody, handover, and audit parity tests.

## Deployment checklist

- [ ] Decide whether PostgreSQL remains the production database or fund/approve a separate Atlas compatibility project.
- [ ] Do not apply `backend/render.yaml` while Atlas remains mandatory; it provisions PostgreSQL.
- [ ] Review all pending worktree changes and confirm the GitHub branch/remote.
- [ ] Configure Vercel `NEXT_PUBLIC_API_URL` from the actual Render service URL.
- [ ] Configure exact backend CORS/CSRF origins and stable production secrets.
- [ ] Back up the database and media/evidence before first production migration.
- [ ] Verify health, authentication, role boundaries, uploads, claims, OTP, direct handover, receipts, audit, and recovery history against the deployed database.
- [ ] Confirm whether the persistent disk's single-instance limit is acceptable.

## Rollback

For an application-only release, redeploy the previous Git commit. For a PostgreSQL schema release, use the tested migration rollback or restore the pre-deploy database backup before restoring the matching application version. Restore uploaded media/evidence from its independent backup. No MongoDB migration or cloud-resource rollback has been performed because no Atlas migration or deployment occurred.
