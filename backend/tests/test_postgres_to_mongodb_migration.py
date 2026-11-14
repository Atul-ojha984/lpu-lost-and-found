from types import SimpleNamespace
import uuid

import pytest
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.apps import apps
from django.db import connections, models
from django.test.utils import override_settings
from django_mongodb_backend.fields import ObjectIdAutoField
from django.utils import timezone

from apps.core.management.commands.migrate_postgres_to_mongodb import (
    _copy_one,
    _fingerprint,
    _label,
    _model_pairs,
    _normalize,
    _write_json_file,
    deterministic_object_id,
    target_primary_key,
)
from apps.audit.models import AuditEntry, Notification
from apps.accounts.models import UserRole


def _model(label, pk_field):
    return SimpleNamespace(
        _meta=SimpleNamespace(
            label=label,
            label_lower=label.lower(),
            pk=pk_field,
        )
    )


def test_sql_auto_primary_keys_map_to_stable_target_object_ids():
    source = _model("auth.Group", models.AutoField(primary_key=True))
    target = _model("auth.Group", ObjectIdAutoField(primary_key=True))

    mapped = target_primary_key(source, target, 42)

    assert mapped == deterministic_object_id("auth.group", 42)
    assert mapped == target_primary_key(source, target, 42)
    assert mapped != deterministic_object_id("auth.permission", 42)


def test_uuid_primary_keys_are_preserved():
    identifier = uuid.UUID("ad428b41-6f42-4b5c-8a14-8e46d8fdfc88")
    source = _model("accounts.User", models.UUIDField(primary_key=True))
    target = _model("accounts.User", models.UUIDField(primary_key=True))

    assert target_primary_key(source, target, identifier) == identifier


def test_fingerprint_normalizes_mongodb_datetime_millisecond_precision():
    from datetime import datetime, timezone

    first = datetime(2026, 1, 1, 12, 0, 0, 123456, tzinfo=timezone.utc)
    second = datetime(2026, 1, 1, 12, 0, 0, 123999, tzinfo=timezone.utc)

    assert _normalize(first) == _normalize(second)
    assert _fingerprint({"created_at": first}) == _fingerprint({"created_at": second})


def test_checkpoint_write_is_atomic_json_and_contains_only_given_metadata(tmp_path):
    path = tmp_path / "migration-checkpoint.json"
    payload = {"format_version": 1, "models": {"items.item": {"processed": 3}}}

    _write_json_file(path, payload)

    assert path.exists()
    assert path.read_text(encoding="utf-8").endswith("\n")
    assert not list(tmp_path.glob("*.tmp"))


def test_migration_command_requires_source_url_and_does_not_print_secrets(monkeypatch):
    monkeypatch.delenv("POSTGRES_SOURCE_URL", raising=False)

    with pytest.raises(CommandError, match="POSTGRES_SOURCE_URL is required"):
        call_command("migrate_postgres_to_mongodb", stdout=None)


def test_latest_postgresql_migration_state_maps_all_models_without_cycles():
    from django.db.migrations.loader import MigrationLoader

    postgres_migration_modules = {
        "accounts": "apps.accounts.migrations",
        "analytics": "apps.analytics.migrations",
        "audit": "apps.audit.migrations",
        "claims": "apps.claims.migrations",
        "core": "apps.core.migrations",
        "custody": "apps.custody.migrations",
        "disposal": "apps.disposal.migrations",
        "handovers": "apps.handovers.migrations",
        "items": "apps.items.migrations",
        "locations": "apps.locations.migrations",
        "matching": "apps.matching.migrations",
        "verification": "apps.verification.migrations",
        "admin": "django.contrib.admin.migrations",
        "auth": "django.contrib.auth.migrations",
        "contenttypes": "django.contrib.contenttypes.migrations",
    }
    with override_settings(MIGRATION_MODULES=postgres_migration_modules):
        loader = MigrationLoader(None, ignore_no_migrations=True)
        source_apps = loader.project_state(loader.graph.leaf_nodes()).apps
        ordered, targets = _model_pairs(source_apps)

    assert len(ordered) == 24
    assert "sessions.session" not in {_label(model) for model in ordered}
    assert "core.workflowmutex" not in {_label(model) for model in ordered}
    for source_model in ordered:
        assert _label(source_model) in targets


@pytest.mark.django_db(transaction=True)
def test_audit_import_redacts_sensitive_metadata_without_replaying_notifications():
    targets_by_label = {
        _label(model): model
        for model in apps.get_models(include_auto_created=True)
        if not model._meta.proxy and model._meta.managed
    }
    source = AuditEntry(
        actor_role=UserRole.STUDENT_STAFF,
        action="HANDOVER_EXECUTE",
        target_entity="Handover",
        target_id="migration-fixture",
        ip_address="127.0.0.1",
        metadata={"otp": "must-not-copy", "safe": {"result": "completed"}},
        timestamp=timezone.now(),
    )

    imported_pk, outcome = _copy_one(
        source, AuditEntry, AuditEntry, targets_by_label, {}
    )

    imported = AuditEntry.objects.get(pk=imported_pk)
    assert outcome == "inserted"
    assert imported.metadata == {
        "otp": "[REDACTED]",
        "safe": {"result": "completed"},
    }
    assert Notification.objects.count() == 0


def test_database_endpoint_hash_does_not_store_endpoint_text():
    from apps.core.management.commands.migrate_postgres_to_mongodb import (
        _database_identity_hash,
    )

    identity = _database_identity_hash("postgresql", "db.example.invalid", 5432, "app")

    assert len(identity) == 64
    assert "db.example.invalid" not in identity


def test_remote_endpoint_cannot_be_mislabeled_local(monkeypatch, tmp_path):
    monkeypatch.setenv(
        "POSTGRES_SOURCE_URL",
        "postgresql://migration_user:private-value@db.example.invalid/app",
    )
    monkeypatch.setattr(
        settings,
        "MONGODB_URI",
        "mongodb+srv://migration_user:private-value@cluster.example.invalid/app",
        raising=False,
    )
    monkeypatch.setattr(type(connections["default"]), "vendor", "mongodb")

    with pytest.raises(CommandError, match="remote PostgreSQL source cannot be classified as local") as exc:
        call_command(
            "migrate_postgres_to_mongodb",
            import_data=True,
            checkpoint_file=tmp_path / "checkpoint.json",
            source_environment="local",
            target_environment="staging",
        )

    assert "private-value" not in str(exc.value)


def test_production_data_requires_separate_explicit_guard(monkeypatch, tmp_path):
    monkeypatch.setenv(
        "POSTGRES_SOURCE_URL",
        "postgresql://migration_user:private-value@db.example.invalid/app",
    )
    monkeypatch.setattr(
        settings,
        "MONGODB_URI",
        "mongodb+srv://migration_user:private-value@cluster.example.invalid/app",
        raising=False,
    )
    monkeypatch.setattr(type(connections["default"]), "vendor", "mongodb")

    with pytest.raises(CommandError, match="requires --allow-production-data") as exc:
        call_command(
            "migrate_postgres_to_mongodb",
            import_data=True,
            checkpoint_file=tmp_path / "checkpoint.json",
            source_environment="production",
            target_environment="staging",
        )

    assert "private-value" not in str(exc.value)
