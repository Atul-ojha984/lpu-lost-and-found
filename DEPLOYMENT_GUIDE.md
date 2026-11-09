# LPU Lost & Found Deployment Guide

Last inspected: 2026-11-09. This guide describes the repository configuration and local verification; it does not claim that the latest Render deployment has succeeded.

## Deployment readiness report

| Area | Verified state |
|---|---|
| Frontend | `apps/web`: Next.js 16.4.2, React 19.3.0, TypeScript, npm workspace; production build succeeds. |
| Active backend | `backend`: Django 5.2.18 / Django REST Framework; frontend API client targets `/api/v1`. |
| Legacy API | `apps/api`: Express 4 and Mongoose 8 with a MongoDB configuration template. The current frontend does not use this service; it is not a verified replacement for the Django API. |
| Local database | SQLite is used for local development and tests when `DATABASE_URL` is unset outside production. |
| Production database | PostgreSQL only. Production settings fail closed unless `DATABASE_URL` parses as PostgreSQL. `backend/render.yaml` requires `DATABASE_URL` to be entered manually (`sync: false`) and does not create or link a database. |
| Render | Django web service runs in Oregon on the free plan; health endpoint is `/api/v1/health`. Current Blueprint uses temporary `/tmp` media paths and has no cron service or persistent disk. The latest deployment is not verified by this guide. |
| Vercel | Next.js App Router; no custom rewrite or `vercel.json` is needed for the current routes. |
| Background/realtime | Current app uses HTTP polling for dashboard updates. Report expiry has a management command but no scheduled Render job in the current Blueprint. Django Channels, Redis, and Celery are not configured in the active Django service. |
| Secrets and local data | No tracked `.env` files were found. Local `.env`, SQLite, media, and private evidence paths are ignored by Git. |

### Database configuration

The active Django backend uses Django ORM and PostgreSQL in production. MongoDB configuration under `apps/api` belongs to a separate legacy Express service and does not configure this backend. The existing Render PostgreSQL database is the required production database; do not change the database engine or create a replacement database for this deployment.

The reported Render failure is caused by the backend service starting without `DATABASE_URL`. Django intentionally refuses to start in production without a PostgreSQL URL. Add the existing database's **Internal Database URL** to the Render web service as `DATABASE_URL`. The current `backend/render.yaml` marks this value `sync: false`, so Render requires it to be entered in the service's Environment page or when syncing the Blueprint; it does not link/create a database. A Render internal URL can be used as provided when the service and database share an account and region; for an external PostgreSQL URL, require TLS with `sslmode=require`.

The `KeyError: 'collectstatic'` is secondary: Django's command lookup imports settings during app discovery, and settings raise when the production database URL is missing. Render build logs for the latest failed deployment show both the `KeyError` and the `ImproperlyConfigured` database error. The source has `django.contrib.staticfiles` installed and WhiteNoise configured. Production now skips loading a local `.env` file, so Render environment variables are authoritative. If a collectstatic error remains after `DATABASE_URL` is set, inspect the subsequent traceback separately.

## Vercel frontend

1. Import the existing GitHub repository as a Vercel project.
2. Set the project Root Directory to `apps/web`, framework preset to **Next.js**, and use the npm workspace/lockfile detected from the repository. The frontend build command is `npm run build` in `apps/web` (`next build`); leave output directory at the Next.js default.
3. Set `NEXT_PUBLIC_API_URL` to `https://lpu-lost-found-backend-django-zf75.onrender.com/api/v1` for the current backend service. The code uses localhost only in development and gives an explicit configuration error if the production value is absent.
4. Add the exact Vercel production origin (and any deliberately supported preview origins) to Django `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`. Do not use broad wildcard CORS origins.
5. Vercel handles Next.js routing; no `vercel.json` rewrite is required for this App Router project. The monorepo root lockfile is `package-lock.json`.

No Vercel project or deployment was created. Vercel's monorepo setup uses a project root directory for each app; verify the workspace install from the imported repository before promoting a deployment. [Vercel monorepo docs](https://vercel.com/docs/monorepos), [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build).

## Render backend (current PostgreSQL configuration only)

The existing blueprint is `backend/render.yaml`. When creating the Blueprint in Render, set **Blueprint Path** to `backend/render.yaml` (Render otherwise defaults to a root-level `render.yaml`).

- Root directory: `backend`
- Runtime: Python 3.12.5
- Plan/region: free / Oregon
- Build: `pip install -r requirements.txt && python manage.py collectstatic --noinput`
- Start: `python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 1`
- Health check: `/api/v1/health`
- Upload paths: `MEDIA_ROOT=/tmp/media` and `PRIVATE_EVIDENCE_ROOT=/tmp/private_evidence` (ephemeral; not production-durable)
- Database: `DATABASE_URL` is `sync: false` and must be entered manually; no database resource or cron service is defined in this Blueprint

For the current service, the backend hostname is `lpu-lost-found-backend-django-zf75.onrender.com`; include it in `ALLOWED_HOSTS` and use the API base URL `https://lpu-lost-found-backend-django-zf75.onrender.com/api/v1` in Vercel. Add the exact deployed Vercel origin to both CORS and CSRF variables.

The current Blueprint does not create or link a database resource; set `DATABASE_URL` to the already-existing Render PostgreSQL instance. It runs `migrate` in the single web process's start command before Gunicorn. The free web service has one instance. The report-expiry management command is not scheduled by the current Blueprint because its cron service was removed.

The service currently stores public media and private evidence under `/tmp`, which is ephemeral and can be lost on restart or redeploy. Treat durable media/evidence storage as a production blocker before collecting real user uploads; configure a persistent disk or object storage on a paid/compatible service plan. Render persistent disks attach to one service instance and affect scaling/deploy behavior. [Render persistent disks](https://render.com/docs/disks).

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
| `DATABASE_URL` | **Required.** Internal connection URL for the existing Render PostgreSQL database. Set in the Render service environment; never put it in GitHub, `.env.example`, or frontend variables. |
| `ALLOWED_HOSTS` | **Required.** `lpu-lost-found-backend-django-zf75.onrender.com` plus any configured backend custom domain. |
| `CORS_ALLOWED_ORIGINS` | **Required.** Exact deployed Vercel frontend origin(s), comma-separated. |
| `CSRF_TRUSTED_ORIGINS` | **Required.** Exact HTTPS frontend origin(s) used for trusted unsafe requests. |
| `SECURE_SSL_REDIRECT` | `True` |
| `SESSION_COOKIE_SECURE` | `True` |
| `CSRF_COOKIE_SECURE` | `True` |
| `SECURE_HSTS_SECONDS` | `31536000` after HTTPS and domain setup are confirmed. |
| `MEDIA_ROOT` | `/tmp/media` in the current Blueprint; ephemeral until durable storage is configured. |
| `PRIVATE_EVIDENCE_ROOT` | `/tmp/private_evidence` in the current Blueprint; ephemeral until durable storage is configured. |

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

The current Blueprint runs `python manage.py migrate --noinput` in the single web instance's start command. Verify migrations against a backup before production releases, and never run production migrations against a local or unintended database URL.

## GitHub repository preparation

- `.gitignore` excludes `.env` files, Python/Node caches, SQLite databases, build output, uploaded media, and private evidence while allowing sanitized `*.env.example` templates.
- `git ls-files` found no tracked `.env` files. A secret-pattern scan found no tracked private-key blocks, common provider tokens, or credential-bearing database URLs; URL-shaped hits were documentation examples with placeholders.
- The root README previously listed local demo passwords. They have been removed. The development seed command still has demo defaults for local test personas, and now refuses to run when `DJANGO_ENV=production`.
- Demo credential strings were present in committed development documentation/history before this cleanup. Git history was not rewritten. If any of those values were ever reused for a real account, rotate that account's password and any associated secrets; removing a value from the latest file does not remove it from prior commits.
- Review `git status` before staging each release. Deployment fixes should be committed separately from unrelated work and pushed only after the intended diff is reviewed.

The existing GitHub repository is `Atul-ojha984/lpu-lost-and-found` on `main`. For a verified update, stage only the reviewed files and use the commit/push commands for that change; never include `.env`, local databases, or user uploads.

```powershell
git status --short
git diff --check
git diff
git add DEPLOYMENT_GUIDE.md PROJECT_PROGRESS.md backend/.env.example backend/config/settings.py backend/tests/test_deployment_security.py
git diff --cached
git commit -m "fix: resolve Django production deployment configuration"
git push origin main
```

Confirm the configured GitHub remote and branch before pushing.

## Existing Render PostgreSQL database

Use the existing Render PostgreSQL database. The current Blueprint does not create a database resource. Do not create a duplicate database or change Django's database engine for this deployment.

1. In the Render dashboard, open the existing database and copy its **Internal Database URL** from the Connect page. Confirm it is in the same account and region as the Oregon web service.
2. Open the backend web service's Environment page and set `DATABASE_URL` to that value. The current Blueprint uses `sync: false`, so the database URL is intentionally entered manually rather than linked or provisioned by the Blueprint.
3. Keep the URL only in Render's environment store. Never place it in GitHub, `.env.example`, frontend variables, logs, or screenshots.
4. For services in the same region, use the internal URL as provided. If an external PostgreSQL URL is intentionally used, include `sslmode=require`.
5. Back up PostgreSQL and any configured durable media/evidence storage before production migrations or storage changes.

The legacy Express/Mongoose service is separate from the active Next.js-to-Django API path. Its MongoDB template does not configure Django and is not part of this Render deployment.

## Deployment checklist

- [ ] Confirm the existing Render PostgreSQL resource and that the backend service uses its same-region internal URL as `DATABASE_URL`.
- [ ] Review the intended GitHub diff and confirm the `main` branch and remote.
- [ ] Set Vercel `NEXT_PUBLIC_API_URL` to the current Render API base URL.
- [ ] Set the exact production `ALLOWED_HOSTS`, CORS/CSRF origins, and stable Django/JWT/encryption secrets in Render.
- [ ] Confirm database plan/expiry and restrict its IP allowlist to required sources.
- [ ] Configure durable storage for public media and private evidence before accepting real user uploads.
- [ ] Restore the report-expiry schedule if automatic expiry is a production requirement.
- [ ] Back up PostgreSQL and media/evidence before a production migration or storage change.
- [ ] Verify the deployed health endpoint and test authentication, role boundaries, uploads, claims, OTP, direct handover, receipts, audit, and Recovery History.
- [ ] If using a Render persistent disk for uploads, confirm its single-instance limit is acceptable.

## Rollback

For an application-only release, redeploy the previous Git commit. For a PostgreSQL schema release, use the tested migration rollback or restore the pre-deploy database backup before restoring the matching application version. Restore uploaded media/evidence from its independent backup.
