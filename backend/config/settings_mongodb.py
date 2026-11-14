"""Opt-in settings for local/staging MongoDB migration work.

The production default remains the existing PostgreSQL settings module. To use
this module, explicitly set DJANGO_SETTINGS_MODULE=config.settings_mongodb.
"""

import os
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured

from .settings import *  # noqa: F403


MONGODB_URI = os.getenv('MONGODB_URI', '').strip()
MONGODB_DATABASE = os.getenv('MONGODB_DATABASE', '').strip()

if not MONGODB_URI:
    raise ImproperlyConfigured(
        'MONGODB_URI is required when using config.settings_mongodb.'
    )
if not MONGODB_DATABASE:
    raise ImproperlyConfigured(
        'MONGODB_DATABASE is required when using config.settings_mongodb.'
    )

try:
    _mongo_uri = urlsplit(MONGODB_URI)
except ValueError as exc:
    raise ImproperlyConfigured('MONGODB_URI is not a valid MongoDB URI.') from exc

if _mongo_uri.scheme not in {'mongodb', 'mongodb+srv'} or not _mongo_uri.hostname:
    raise ImproperlyConfigured(
        'MONGODB_URI must use mongodb:// or mongodb+srv:// and include a host.'
    )
if IS_PRODUCTION and _mongo_uri.scheme != 'mongodb+srv':
    raise ImproperlyConfigured(
        'Production MongoDB configuration must use an Atlas mongodb+srv:// URI.'
    )
if IS_PRODUCTION and _mongo_uri.hostname.lower() in {'localhost', '127.0.0.1', '::1'}:
    raise ImproperlyConfigured('Production MongoDB configuration cannot use localhost.')

DATABASES = {
    'default': {
        'ENGINE': 'django_mongodb_backend',
        'HOST': MONGODB_URI,
        'NAME': MONGODB_DATABASE,
        'OPTIONS': {'retryWrites': 'true', 'w': 'majority'},
    }
}

INSTALLED_APPS = [  # noqa: F405
    'config.mongodb_apps.MongoAdminConfig',
    'config.mongodb_apps.MongoAuthConfig',
    'config.mongodb_apps.MongoContentTypesConfig',
    *[app for app in INSTALLED_APPS if app not in {  # noqa: F405
        'django.contrib.admin',
        'django.contrib.auth',
        'django.contrib.contenttypes',
    }],
    'django_mongodb_backend',
]

# The official backend project template uses separate Mongo-compatible
# migrations for these contrib apps because their standard migrations create
# unsupported integer AutoField primary keys.
MIGRATION_MODULES = {
    **globals().get('MIGRATION_MODULES', {}),
    'admin': 'mongo_migrations.admin',
    'auth': 'mongo_migrations.auth',
    'contenttypes': 'mongo_migrations.contenttypes',
    # MongoDB gets a clean schema history generated from the current models.
    # PostgreSQL's historical migration graph (including PostgreSQL-only DDL)
    # remains unchanged and continues to serve the production/source database.
    'accounts': 'mongo_migrations.accounts',
    'analytics': 'mongo_migrations.analytics',
    'audit': 'mongo_migrations.audit',
    'claims': 'mongo_migrations.claims',
    'core': 'mongo_migrations.core',
    'custody': 'mongo_migrations.custody',
    'disposal': 'mongo_migrations.disposal',
    'handovers': 'mongo_migrations.handovers',
    'items': 'mongo_migrations.items',
    'locations': 'mongo_migrations.locations',
    'matching': 'mongo_migrations.matching',
    'verification': 'mongo_migrations.verification',
}
