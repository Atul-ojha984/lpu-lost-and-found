"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Django REST Framework Backend Settings
==============================================================================
"""

import os
import sys
from datetime import timedelta
from pathlib import Path
import dj_database_url
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Add apps directory to sys.path so apps can be imported cleanly
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / 'apps'))

# Load local environment variables during development. Production values must
# come from the hosting platform's environment, never a bundled local .env file.
if os.getenv('DJANGO_ENV', '').strip().lower() != 'production':
    load_dotenv(BASE_DIR / '.env')

# Core Security Settings
DJANGO_ENV = os.getenv('DJANGO_ENV', 'development').strip().lower()
IS_PRODUCTION = DJANGO_ENV == 'production'
# The opt-in Mongo settings import this module for shared application/security
# configuration, then replace DATABASES with the MongoDB Backend. Do not make
# the PostgreSQL production guard require a PostgreSQL URL in that mode.
MONGODB_SETTINGS_SELECTED = (
    os.getenv('DJANGO_SETTINGS_MODULE', '').strip() == 'config.settings_mongodb'
)


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in ('true', '1', 'yes', 'on')


SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    if IS_PRODUCTION:
        raise ImproperlyConfigured('SECRET_KEY must be supplied through the production environment.')
    SECRET_KEY = 'django-insecure-lpu-lost-found-dev-fallback-key-32-chars-long'
elif IS_PRODUCTION and SECRET_KEY.startswith('django-insecure-'):
    raise ImproperlyConfigured('Production SECRET_KEY must not use Django development placeholder values.')

DEBUG = _env_bool('DEBUG', default=not IS_PRODUCTION)
if IS_PRODUCTION and DEBUG:
    raise ImproperlyConfigured('DEBUG must be False when DJANGO_ENV=production.')

_allowed_hosts = os.getenv('ALLOWED_HOSTS', '')
if IS_PRODUCTION and not _allowed_hosts.strip():
    raise ImproperlyConfigured('ALLOWED_HOSTS must be explicitly configured in production.')
ALLOWED_HOSTS = [h.strip() for h in (_allowed_hosts or 'localhost,127.0.0.1,0.0.0.0').split(',') if h.strip()]
if IS_PRODUCTION and not ALLOWED_HOSTS:
    raise ImproperlyConfigured('ALLOWED_HOSTS must contain at least one production hostname.')
if not IS_PRODUCTION and 'testserver' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('testserver')

# Application definition
INSTALLED_APPS = [
    # Django Built-in Apps
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-Party Packages
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    'drf_spectacular',

    # Domain Applications
    'apps.core.apps.CoreConfig',
    'apps.accounts.apps.AccountsConfig',
    'apps.items.apps.ItemsConfig',
    'apps.locations.apps.LocationsConfig',
    'apps.matching.apps.MatchingConfig',
    'apps.claims.apps.ClaimsConfig',
    'apps.verification.apps.VerificationConfig',
    'apps.custody.apps.CustodyConfig',
    'apps.handovers.apps.HandoversConfig',
    'apps.disposal.apps.DisposalConfig',
    'apps.analytics.apps.AnalyticsConfig',
    'apps.audit.apps.AuditConfig',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'apps.core.middleware.ApiErrorEnvelopeMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# Database Setup (SQLite is a local-development fallback only)
DEFAULT_SQLITE_PATH = (BASE_DIR / 'db.sqlite3').resolve()


def _build_database_config(database_url: str | None, *, is_production: bool) -> dict:
    """Parse the configured database URL and fail closed for production."""
    configured_url = (database_url or '').strip()
    if not configured_url:
        if is_production:
            raise ImproperlyConfigured(
                'DATABASE_URL is missing. Set it in the Render backend service to the '
                'Internal Database URL for the existing Render PostgreSQL database.'
            )
        configured_url = f'sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}'

    try:
        db_config = dj_database_url.parse(
            configured_url,
            conn_max_age=600,
            conn_health_checks=True,
        )
    except (TypeError, ValueError, KeyError, IndexError) as exc:
        raise ImproperlyConfigured(
            'DATABASE_URL is invalid. Use a PostgreSQL connection URL for production '
            'or an explicitly configured local database URL for development.'
        ) from exc

    if db_config.get('ENGINE') == 'django.db.backends.sqlite3':
        db_name = db_config.get('NAME')
        if not db_name or not os.path.isabs(str(db_name)):
            db_config['NAME'] = str(
                DEFAULT_SQLITE_PATH
                if not db_name or db_name == 'db.sqlite3'
                else (BASE_DIR / db_name).resolve()
            )

    if is_production and db_config.get('ENGINE') != 'django.db.backends.postgresql':
        raise ImproperlyConfigured(
            'Production deployments must use PostgreSQL. Set DATABASE_URL to the '
            'Internal Database URL for the existing Render PostgreSQL database.'
        )
    return db_config


DATABASE_URL = os.getenv('DATABASE_URL')
if MONGODB_SETTINGS_SELECTED:
    # Temporary bootstrap value only: config.settings_mongodb replaces this
    # before Django initializes. Mongo production settings validate their own
    # Atlas URI/database and never connect through this SQLite placeholder.
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': ':memory:',
        }
    }
else:
    _db_config = _build_database_config(DATABASE_URL, is_production=IS_PRODUCTION)
    DATABASES = {'default': _db_config}

# Custom User Model
AUTH_USER_MODEL = 'accounts.User'

# Password validation & Hashers (Supporting Bcrypt compatibility with Express backend)
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
    # Verify raw bcrypt hashes imported from the previous Express system.
    # Successful login upgrades these to BCryptSHA256 automatically.
    'django.contrib.auth.hashers.BCryptPasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
    'django.contrib.auth.hashers.Argon2PasswordHasher',
]

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

# Static & Media Files
STATIC_URL = '/static/'
MEDIA_URL = '/media/'


def _configured_path(name: str, default: Path) -> Path:
    value = os.getenv(name)
    configured = Path(value) if value else default
    return configured if configured.is_absolute() else (BASE_DIR / configured).resolve()


STATIC_ROOT = _configured_path('STATIC_ROOT', BASE_DIR / 'staticfiles')
MEDIA_ROOT = _configured_path('MEDIA_ROOT', BASE_DIR / 'media')
PRIVATE_EVIDENCE_ROOT = _configured_path('PRIVATE_EVIDENCE_ROOT', BASE_DIR / 'private_evidence')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Django REST Framework Settings
REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'apps.core.renderers.ApiEnvelopeRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.accounts.authentication.CookieOrHeaderJWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.StandardResultsSetPagination',
    'PAGE_SIZE': 20,
    'EXCEPTION_HANDLER': 'apps.core.exceptions.custom_exception_handler',
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# SimpleJWT Configuration
JWT_SIGNING_KEY = os.getenv('JWT_SIGNING_KEY', SECRET_KEY)
if IS_PRODUCTION and not os.getenv('JWT_SIGNING_KEY'):
    raise ImproperlyConfigured('JWT_SIGNING_KEY must be set independently in production.')
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=int(os.getenv('JWT_ACCESS_TOKEN_LIFETIME_DAYS', 7))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=int(os.getenv('JWT_REFRESH_TOKEN_LIFETIME_DAYS', 30))),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': JWT_SIGNING_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'userId',
}

# OpenAPI / Swagger Documentation (drf-spectacular)
SPECTACULAR_SETTINGS = {
    'TITLE': 'LPU Lost & Found Property Recovery API',
    'DESCRIPTION': 'Comprehensive REST API documentation for Lovely Professional University campus lost and found management platform.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
    'TAGS': [
        {'name': 'Health', 'description': 'Service diagnostics and health check'},
        {'name': 'Authentication', 'description': 'Student & Staff authentication and session profile'},
        {'name': 'Items', 'description': 'Lost and found item registry, image ingestion, public board'},
        {'name': 'Taxonomy', 'description': 'Campus locations and item categories'},
        {'name': 'Matching', 'description': 'Algorithmic multi-factor lost and found matching engine'},
        {'name': 'Claims', 'description': 'Private verification challenges and ownership adjudication'},
        {'name': 'Custody', 'description': 'Physical chain of custody tracking and supervised OTP handover'},
        {'name': 'Governance', 'description': 'Administrative analytics, statutory retention, and audit logs'},
    ],
}

# CORS & CSRF Configuration
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(',')
    if origin.strip()
]
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv('CSRF_TRUSTED_ORIGINS', os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000')).split(',')
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# Production Security & SSL/Cookie Hardening
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = _env_bool('SECURE_SSL_REDIRECT', default=IS_PRODUCTION)
SESSION_COOKIE_SECURE = _env_bool('SESSION_COOKIE_SECURE', default=IS_PRODUCTION)
CSRF_COOKIE_SECURE = _env_bool('CSRF_COOKIE_SECURE', default=IS_PRODUCTION)
if IS_PRODUCTION and not all((SECURE_SSL_REDIRECT, SESSION_COOKIE_SECURE, CSRF_COOKIE_SECURE)):
    raise ImproperlyConfigured('HTTPS redirects and secure session/CSRF cookies are required in production.')
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = os.getenv('SESSION_COOKIE_SAMESITE', 'Lax')
CSRF_COOKIE_SAMESITE = os.getenv('CSRF_COOKIE_SAMESITE', 'Lax')
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '0'))
if SECURE_HSTS_SECONDS > 0:
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# AES-256 Field Encryption Key for Private Detail Vault (64 hex characters)
FIELD_ENCRYPTION_KEY = os.getenv('FIELD_ENCRYPTION_KEY')
if IS_PRODUCTION and not FIELD_ENCRYPTION_KEY:
    raise ImproperlyConfigured('FIELD_ENCRYPTION_KEY must be set in production.')
FIELD_ENCRYPTION_KEY = FIELD_ENCRYPTION_KEY or '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

# Logging Configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} [{name}:{lineno}] {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django.request': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
