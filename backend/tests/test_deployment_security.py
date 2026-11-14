from unittest.mock import patch

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.core.management.base import CommandError
from config.settings import _build_database_config


@pytest.mark.parametrize('database_url', [None, '', '   '])
def test_missing_production_database_url_has_actionable_error(database_url):
    with pytest.raises(ImproperlyConfigured, match='DATABASE_URL is missing') as exc_info:
        _build_database_config(database_url, is_production=True)

    assert 'Render backend service' in str(exc_info.value)
    assert 'Internal Database URL' in str(exc_info.value)


def test_production_rejects_sqlite_database_url():
    with pytest.raises(ImproperlyConfigured, match='Production deployments must use PostgreSQL'):
        _build_database_config('sqlite:///db.sqlite3', is_production=True)


def test_production_accepts_postgresql_url_without_connecting():
    config = _build_database_config(
        'postgresql://deploy_user:placeholder@db.example.invalid:5432/lpu_test',
        is_production=True,
    )

    assert config['ENGINE'] == 'django.db.backends.postgresql'
    assert config['NAME'] == 'lpu_test'


def test_malformed_database_url_has_actionable_error():
    with pytest.raises(ImproperlyConfigured, match='DATABASE_URL is invalid'):
        _build_database_config('postgresql://[malformed', is_production=True)


def test_local_development_uses_sqlite_when_url_is_unset():
    config = _build_database_config(None, is_production=False)

    assert config['ENGINE'] == 'django.db.backends.sqlite3'
    assert config['NAME'].endswith('backend/db.sqlite3')


@pytest.mark.django_db
def test_demo_seed_command_refuses_to_run_in_production():
    with patch('apps.core.management.commands.seed_demo_data.settings.IS_PRODUCTION', True):
        with pytest.raises(CommandError, match='disabled in production'):
            call_command('seed_demo_data')


def test_development_accounts_command_refuses_to_run_in_production():
    with patch('apps.accounts.management.commands.create_dev_accounts.settings.IS_PRODUCTION', True):
        with pytest.raises(CommandError, match='disabled in production'):
            call_command('create_dev_accounts')
