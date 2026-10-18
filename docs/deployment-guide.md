# Production Deployment Guide: LPU Lost & Found

This guide details the steps to deploy the LPU Lost & Found Management System to production cloud infrastructure.

---

## 1. Architecture Overview

- **Frontend:** Next.js 16 deployed on **Vercel** with global CDN caching.
- **Backend:** Django 5 REST Framework deployed as a containerized web service on **Render** (or AWS ECS / DigitalOcean).
- **Database:** Managed **PostgreSQL 16** instance with automated daily snapshots.
- **Object Storage:** AWS S3 or Cloudinary for uploaded item photos with automated EXIF stripping.

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
| `ALLOWED_HOSTS` | `.onrender.com,api-lostfound.lpu.in` | Allowed host headers |
| `CORS_ALLOWED_ORIGINS` | `https://lpu-lost-found.vercel.app` | Allowed browser frontend origins |
| `CSRF_TRUSTED_ORIGINS` | `https://lpu-lost-found.vercel.app` | Trusted CSRF origins |
| `FIELD_ENCRYPTION_KEY` | *(64-hex-character string)* | 32-byte key for Fernet private detail vault |
| `SECURE_SSL_REDIRECT` | `True` | Enforce HTTPS redirect |
| `SESSION_COOKIE_SECURE`| `True` | Secure session cookies |
| `CSRF_COOKIE_SECURE` | `True` | Secure CSRF cookies |
| `SECURE_HSTS_SECONDS` | `31536000` | HTTP Strict Transport Security |

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
