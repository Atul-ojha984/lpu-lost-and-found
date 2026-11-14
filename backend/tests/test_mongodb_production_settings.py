import os
import subprocess
import sys
from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _production_settings_environment(module):
    env = os.environ.copy()
    env.update({
        "DJANGO_SETTINGS_MODULE": module,
        "DJANGO_ENV": "production",
        "DEBUG": "False",
        "SECRET_KEY": "test-only-secret-key-that-is-not-used-for-authentication",
        "ALLOWED_HOSTS": "settings-test.invalid",
        "JWT_SIGNING_KEY": "test-only-jwt-signing-key-that-is-not-used",
        "FIELD_ENCRYPTION_KEY": "1" * 64,
        "SECURE_SSL_REDIRECT": "True",
        "SESSION_COOKIE_SECURE": "True",
        "CSRF_COOKIE_SECURE": "True",
    })
    env.pop("DATABASE_URL", None)
    return env


@pytest.mark.parametrize("module", ["config.settings_mongodb"])
def test_production_mongodb_settings_load_without_postgresql_url(module):
    env = _production_settings_environment(module)
    env.update({
        "MONGODB_URI": "mongodb+srv://cluster.invalid/lpu",
        "MONGODB_DATABASE": "lpu_settings_test",
    })
    code = (
        "import django; django.setup(); "
        "from django.conf import settings; "
        "assert settings.DATABASES['default']['ENGINE'] == 'django_mongodb_backend'; "
        "assert settings.DATABASES['default']['NAME'] == 'lpu_settings_test'; "
        "print('mongodb production settings loaded')"
    )

    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "mongodb production settings loaded"
    assert "mongodb+srv://" not in result.stdout + result.stderr


def test_production_postgresql_settings_still_require_database_url():
    env = _production_settings_environment("config.settings")
    code = "from django.conf import settings; print(settings.DATABASES)"

    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )

    assert result.returncode != 0
    assert "DATABASE_URL is missing" in result.stderr
    assert "test-only-secret-key" not in result.stdout + result.stderr
