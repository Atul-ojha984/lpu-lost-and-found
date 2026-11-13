"""Full-application settings for isolated MongoDB workflow integration tests.

This module is intentionally restricted to the local replica set on port 27018.
It does not read Atlas credentials or connect to Render/PostgreSQL. Set the
development database URL before importing project settings so an existing local
``.env`` value can never become the test database.
"""

import os
from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured

os.environ['DJANGO_ENV'] = 'test'
os.environ['DATABASE_URL'] = 'sqlite:///mongodb-workflow-settings-bootstrap.sqlite3'
os.environ.setdefault('SECRET_KEY', 'test-only-not-a-production-secret')
os.environ['DEBUG'] = 'True'

from config.settings import *  # noqa: E402,F403


MONGODB_TEST_URI = 'mongodb://127.0.0.1:27018/?replicaSet=lpu_phase3_rs'
parsed_uri = urlparse(MONGODB_TEST_URI)
if parsed_uri.scheme != 'mongodb' or parsed_uri.hostname != '127.0.0.1' or parsed_uri.port != 27018:
    raise ImproperlyConfigured('MongoDB workflow tests may only use the isolated loopback replica set.')

DATABASES = {
    'default': {
        'ENGINE': 'django_mongodb_backend',
        'HOST': MONGODB_TEST_URI,
        'NAME': 'lpu_phase3_full_workflow_test',
        'TEST': {'NAME': 'lpu_phase3_full_workflow_test'},
    },
}
DEFAULT_AUTO_FIELD = 'django_mongodb_backend.fields.ObjectIdAutoField'
MEDIA_ROOT = Path(__file__).resolve().parent.parent / '.mongo-test-media'
PRIVATE_EVIDENCE_ROOT = Path(__file__).resolve().parent.parent / '.mongo-test-private-evidence'
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
