"""Tests for safe first-administrator provisioning."""

from io import StringIO

import pytest
from django.core.management import call_command, CommandError
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole, UserType


ENV = {
    "INITIAL_ADMIN_REGISTRATION_NUMBER": "BOOT-ADMIN-001",
    "INITIAL_ADMIN_EMAIL": "initial.admin@lpu.in",
    "INITIAL_ADMIN_FULL_NAME": "Initial System Administrator",
    "INITIAL_ADMIN_PASSWORD": "Long-Test-Admin-Password!2026",
}


def set_admin_environment(monkeypatch, **overrides):
    for key, value in {**ENV, **overrides}.items():
        monkeypatch.setenv(key, value)


@pytest.mark.django_db
def test_provisions_system_admin_with_hashed_password_and_login(monkeypatch):
    set_admin_environment(monkeypatch)
    output = StringIO()

    call_command("provision_initial_admin", confirm=True, noinput=True, stdout=output)

    user = User.objects.get(registration_number=ENV["INITIAL_ADMIN_REGISTRATION_NUMBER"])
    assert user.role == UserRole.SYSTEM_ADMIN
    assert user.user_type == UserType.SYSTEM_ADMIN
    assert user.is_active and user.is_staff and user.is_superuser
    assert user.password != ENV["INITIAL_ADMIN_PASSWORD"]
    assert user.check_password(ENV["INITIAL_ADMIN_PASSWORD"])
    assert ENV["INITIAL_ADMIN_PASSWORD"] not in output.getvalue()

    response = APIClient().post(
        "/api/v1/auth/login/",
        {
            "registration_number": ENV["INITIAL_ADMIN_REGISTRATION_NUMBER"],
            "password": ENV["INITIAL_ADMIN_PASSWORD"],
        },
        format="json",
    )
    assert response.status_code == 200
    access_token = response.json()["data"]["accessToken"]
    assert access_token

    authenticated = APIClient()
    authenticated.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
    assert authenticated.get("/api/v1/auth/me/").status_code == 200


@pytest.mark.django_db
def test_rerun_is_idempotent_and_never_resets_existing_admin_password(monkeypatch):
    set_admin_environment(monkeypatch)
    call_command("provision_initial_admin", confirm=True, noinput=True, stdout=StringIO())
    user = User.objects.get(registration_number=ENV["INITIAL_ADMIN_REGISTRATION_NUMBER"])
    original_hash = user.password

    set_admin_environment(
        monkeypatch,
        INITIAL_ADMIN_PASSWORD="Another-Valid-Password!2026",
    )
    output = StringIO()
    call_command("provision_initial_admin", confirm=True, noinput=True, stdout=output)

    user.refresh_from_db()
    assert User.objects.count() == 1
    assert user.password == original_hash
    assert user.check_password(ENV["INITIAL_ADMIN_PASSWORD"])
    assert "no changes made" in output.getvalue().lower()


@pytest.mark.django_db
@pytest.mark.parametrize("collision", ["registration_number", "email"])
def test_refuses_to_overwrite_or_promote_existing_account(monkeypatch, collision):
    existing = User.objects.create_user(
        email="existing.user@lpu.in",
        registration_number="EXISTING-USER-001",
        full_name="Existing User",
        password="Existing-Password!2026",
        role=UserRole.STUDENT_STAFF,
        user_type=UserType.STUDENT,
    )
    overrides = {}
    if collision == "registration_number":
        overrides["INITIAL_ADMIN_REGISTRATION_NUMBER"] = existing.registration_number
    else:
        overrides["INITIAL_ADMIN_EMAIL"] = existing.email
    set_admin_environment(monkeypatch, **overrides)

    with pytest.raises(CommandError, match="account already uses"):
        call_command("provision_initial_admin", confirm=True, noinput=True, stdout=StringIO())

    existing.refresh_from_db()
    assert User.objects.count() == 1
    assert existing.role == UserRole.STUDENT_STAFF
    assert existing.is_superuser is False
    assert existing.check_password("Existing-Password!2026")


@pytest.mark.django_db
def test_refuses_to_create_a_second_administrator(monkeypatch):
    User.objects.create_superuser(
        email="existing.admin@lpu.in",
        registration_number="EXISTING-ADMIN-001",
        full_name="Existing Administrator",
        password="Existing-Admin-Password!2026",
    )
    set_admin_environment(monkeypatch)

    with pytest.raises(CommandError, match="administrator already exists"):
        call_command("provision_initial_admin", confirm=True, noinput=True, stdout=StringIO())

    assert User.objects.count() == 1


@pytest.mark.django_db
def test_requires_explicit_confirmation_before_database_changes(monkeypatch):
    set_admin_environment(monkeypatch)

    with pytest.raises(CommandError, match="rerun with --confirm"):
        call_command("provision_initial_admin", noinput=True, stdout=StringIO())

    assert User.objects.count() == 0
