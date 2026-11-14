"""Minimal, loopback-only settings for MongoDB transaction integration tests.

This module deliberately cannot connect to Atlas, Render, production, or the
existing standalone MongoDB service on port 27017. It uses only the isolated
local replica set reserved for migration tests.
"""

from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured


MONGODB_TEST_URI = 'mongodb://127.0.0.1:27018/?replicaSet=lpu_phase3_rs'
parsed_uri = urlparse(MONGODB_TEST_URI)
if parsed_uri.scheme != 'mongodb' or parsed_uri.hostname != '127.0.0.1' or parsed_uri.port != 27018:
    raise ImproperlyConfigured('MongoDB integration tests are restricted to the isolated loopback replica set.')

SECRET_KEY = 'test-only-not-a-production-secret'
DEBUG = True
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django_mongodb_backend.fields.ObjectIdAutoField'
INSTALLED_APPS = [
    'django_mongodb_backend',
    'apps.core.apps.CoreConfig',
]
DATABASES = {
    'default': {
        'ENGINE': 'django_mongodb_backend',
        'HOST': MONGODB_TEST_URI,
        'NAME': 'lpu_phase3_workflow_test',
        'TEST': {
            'NAME': 'lpu_phase3_workflow_test',
        },
    },
}
MIGRATION_MODULES = {'core': None}
