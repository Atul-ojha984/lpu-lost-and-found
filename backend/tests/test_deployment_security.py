from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError


@pytest.mark.django_db
def test_demo_seed_command_refuses_to_run_in_production():
    with patch('apps.core.management.commands.seed_demo_data.settings.IS_PRODUCTION', True):
        with pytest.raises(CommandError, match='disabled in production'):
            call_command('seed_demo_data')
