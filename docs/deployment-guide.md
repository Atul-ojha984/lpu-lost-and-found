# Production Deployment Guide: LPU Lost & Found

This guide details the steps to deploy the LPU Lost & Found Management System to production cloud infrastructure.

---

## 1. Architecture Overview

- **Frontend:** Next.js 16 deployed on **Vercel** with global CDN caching.
- **Backend:** Django 5 REST Framework deployed as a containerized web service on **Render** (or AWS ECS / DigitalOcean).
- **Database:** Managed **PostgreSQL 16** instance with automated daily snapshots.
- **Upload Storage:** A persistent Render disk for item photographs and private claim evidence; other hosting platforms must provide equivalent durable storage.

---

## 2. Backend Deployment (Render / Cloud Container)

### 2.1 Build & Start Commands
- **Root Directory:** `backend`
- **Environment:** Python 3.12+
- **Build Command:**
  ```bash
  pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate
  ```
- **Start Command:**
  ```bash
  gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 3 --timeout 60
  ```

### 2.2 Production Environment Variables

| Variable | Recommended Production Value | Description |
| :--- | :--- | :--- |
| `DJANGO_ENV` | `production` | Enables production mode |
| `DEBUG` | `False` | Disables debug tracebacks |
| `SECRET_KEY` | *(50+ random characters)* | Core Django cryptographic key |
| `JWT_SIGNING_KEY` | *(32+ random characters)* | Key for signing HS256 auth tokens |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname?sslmode=require` | Managed PostgreSQL connection string |
| `ALLOWED_HOSTS` | Actual Render hostname and configured backend custom domain | Allowed host headers |
| `CORS_ALLOWED_ORIGINS` | Actual Vercel production origin(s) | Allowed browser frontend origins |
| `CSRF_TRUSTED_ORIGINS` | Actual HTTPS frontend origin(s) | Trusted CSRF origins |
| `FIELD_ENCRYPTION_KEY` | *(64 hex characters or base64-encoded 32-byte key)* | Stable AES-256-GCM key for the private detail vault |
| `MEDIA_ROOT` | `/var/data/media` on Render | Durable location for uploaded item photographs |
| `PRIVATE_EVIDENCE_ROOT` | `/var/data/private_evidence` on Render | Durable private claim-evidence location |
| `SECURE_SSL_REDIRECT` | `True` | Enforce HTTPS redirect |
| `SESSION_COOKIE_SECURE`| `True` | Secure session cookies |
| `CSRF_COOKIE_SECURE` | `True` | Secure CSRF cookies |
| `SECURE_HSTS_SECONDS` | `31536000` | HTTP Strict Transport Security |

The Render Blueprint attaches a persistent disk at `/var/data` for both upload directories. Sanitized item photographs are served from `/media/`; private evidence uses the authenticated download API and is kept outside that media root. Render disks add cost and disable zero-downtime deploys for the attached service. Back up and copy any existing `media/` and `private_evidence/` files into the mounted directories before enabling the new mount; the application does not migrate uploaded files automatically. For Docker or other hosts, mount equivalent durable storage and set both path variables. WhiteNoise serves collected static files; it is not used for user uploads. The current media route is suitable for the existing single-service deployment; move public images to a CDN/object store before scaling file traffic or web instances.

---

## 3. Frontend Deployment (Vercel)

### 3.1 Project Configuration
1. Import repository on Vercel.
2. Set **Root Directory** to `apps/web`.
3. Set **Framework Preset** to Next.js.
4. Build command will default to `next build` (or `npm run build`).

### 3.2 Frontend Environment Variables

| Variable | Production Value | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `https://<backend-domain>/api/v1` | Public URL to the Django REST API |
| `NEXT_PUBLIC_APP_NAME` | `LPU Lost & Found Platform` | Display title |
| `NEXT_PUBLIC_CAMPUS_NAME`| `Lovely Professional University` | University campus location |

---

## 4. Post-Deployment Verification

Once deployed, run the deployment smoke tests against your live endpoints:

```bash
# Verify API health and endpoints
node scripts/deployment-smoke-test.mjs https://<backend-domain>

# Verify end-to-end multi-actor workflow
node scripts/e2e-workflow-smoke-test.mjs https://<backend-domain>/api/v1
```
