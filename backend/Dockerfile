# ==============================================================================
# LPU Lost & Found Property Recovery Platform
# Django REST Framework Backend Production Containerfile
# ==============================================================================

FROM python:3.12-slim-bookworm AS base

# System dependencies for building cryptography and Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libjpeg-dev \
    zlib1g-dev \
    libwebp-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy project source code
COPY . .

# Environment defaults
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    DJANGO_ENV=production

# Collect static files into staticfiles/
RUN python manage.py collectstatic --noinput || true

# Run as non-privileged security user
RUN addgroup --system --gid 1001 django && \
    adduser --system --uid 1001 --gid 1001 --no-create-home djangouser && \
    chown -R djangouser:django /app

USER djangouser

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Production WSGI server
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]
