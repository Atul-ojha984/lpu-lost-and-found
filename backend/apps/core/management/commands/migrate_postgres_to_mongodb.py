"""Safely copy PostgreSQL records into the explicitly selected MongoDB target.

Dry-run is the default. Imports are additive, checkpointed and idempotent;
conflicting destination rows are rejected rather than overwritten. This
command does not migrate file bytes, deploy, or switch production traffic.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import date, datetime, time
from pathlib import Path
from urllib.parse import urlsplit
import uuid

import dj_database_url
from bson import ObjectId
from django.apps import apps as target_apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction as django_transaction
from django.db.migrations.loader import MigrationLoader
from django.db.models import AutoField, BigAutoField, SmallAutoField
from django.test.utils import override_settings

from apps.core.db_transactions import transaction
from apps.audit.models import sanitize_audit_metadata
from apps.core.workflow_concurrency import retry_transient_mongo_transaction


SOURCE_ALIAS = "postgres_source"
TARGET_ALIAS = "default"
CHECKPOINT_VERSION = 1
EXCLUDED_MODEL_LABELS = {"core.workflowmutex", "sessions.session"}
POSTGRES_MIGRATION_MODULES = {
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


def deterministic_object_id(model_label, source_pk):
    """Return a stable ObjectId mapping for a SQL auto-increment key."""
    source = f"{model_label.lower()}:{source_pk}".encode("utf-8")
    return ObjectId(hashlib.blake2b(source, digest_size=12).digest())


def target_primary_key(source_model, target_model, source_pk):
    source_pk_field = source_model._meta.pk
    target_pk_field = target_model._meta.pk
    target_type = target_pk_field.get_internal_type()
    if isinstance(source_pk_field, (AutoField, BigAutoField, SmallAutoField)):
        if target_type != "ObjectIdAutoField":
            raise CommandError(f"Primary-key strategy mismatch for {source_model._meta.label}.")
        return deterministic_object_id(source_model._meta.label_lower, source_pk)
    if target_type == "ObjectIdAutoField":
        return deterministic_object_id(source_model._meta.label_lower, source_pk)
    if target_type == "UUIDField":
        try:
            return source_pk if isinstance(source_pk, uuid.UUID) else uuid.UUID(str(source_pk))
        except (TypeError, ValueError, AttributeError) as exc:
            raise CommandError(f"Invalid UUID primary key in {source_model._meta.label}.") from exc
    return source_pk


def _safe_record_key(model_label, source_pk):
    return hashlib.sha256(f"{model_label}:{source_pk}".encode()).hexdigest()[:16]


def _normalize(value):
    if isinstance(value, datetime):
        value = value.replace(microsecond=(value.microsecond // 1000) * 1000)
        return {"datetime": value.isoformat()}
    if isinstance(value, date):
        return {"date": value.isoformat()}
    if isinstance(value, time):
        return {"time": value.isoformat()}
    if isinstance(value, uuid.UUID):
        return {"uuid": str(value)}
    if isinstance(value, ObjectId):
        return {"object_id": str(value)}
    if isinstance(value, dict):
        return {str(key): _normalize(value[key]) for key in sorted(value, key=str)}
    if isinstance(value, (list, tuple)):
        return [_normalize(part) for part in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _fingerprint(values):
    payload = json.dumps(_normalize(values), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def _label(model):
    return model._meta.label_lower


def _order_source_models(source_models):
    """Place referenced source models before models containing their FKs."""
    by_label = {_label(model): model for model in source_models}
    dependencies = {label: set() for label in by_label}
    for label, model in by_label.items():
        for field in model._meta.concrete_fields:
            remote = getattr(getattr(field, "remote_field", None), "model", None)
            if remote is not None and _label(remote) == label:
                raise CommandError(
                    f"Self-referential relationship in {label}.{field.name} needs an explicit two-pass mapping."
                )
            if remote is not None and _label(remote) in by_label:
                dependencies[label].add(_label(remote))
    ordered, temporary, permanent = [], set(), set()

    def visit(label):
        if label in permanent:
            return
        if label in temporary:
            cycle = ", ".join(sorted(temporary | {label}))
            raise CommandError(f"Source FK dependency cycle needs an explicit import map: {cycle}.")
        temporary.add(label)
        for dependency in sorted(dependencies[label]):
            visit(dependency)
        temporary.remove(label)
        permanent.add(label)
        ordered.append(by_label[label])

    for model_label in sorted(by_label):
        visit(model_label)
    return ordered


def _source_state(connection):
    # Use the PostgreSQL migration graph, not the Mongo target snapshots.
    with override_settings(MIGRATION_MODULES=POSTGRES_MIGRATION_MODULES):
        loader = MigrationLoader(connection, ignore_no_migrations=True)
        loader.check_consistent_history(connection)
        if loader.detect_conflicts():
            raise CommandError("Resolve conflicting PostgreSQL migrations before migration.")
        applied = set(loader.applied_migrations)
        return loader.project_state(applied).apps, applied


def _model_pairs(source_apps):
    targets = {
        _label(model): model
        for model in target_apps.get_models(include_auto_created=True)
        if not model._meta.proxy and model._meta.managed
    }
    sources = [
        model for model in source_apps.get_models(include_auto_created=True)
        if not model._meta.proxy
        and model._meta.managed
        and _label(model) not in EXCLUDED_MODEL_LABELS
    ]
    missing = sorted({_label(model) for model in sources} - set(targets))
    if missing:
        raise CommandError("Source models have no Mongo target mapping: " + ", ".join(missing))
    return _order_source_models(sources), targets


def _check_fields(source_model, target_model):
    source_fields = {field.name for field in source_model._meta.concrete_fields}
    target_fields = {field.name: field for field in target_model._meta.concrete_fields}
    removed = source_fields - set(target_fields)
    if removed:
        raise CommandError(
            f"{source_model._meta.label} has unmapped source fields: "
            + ", ".join(sorted(removed))
        )
    for name, field in target_fields.items():
        if name in source_fields or name == "name_key":
            continue
        if not (field.has_default() or field.null or field.auto_created):
            raise CommandError(f"Target field {target_model._meta.label}.{name} has no mapping/default.")


def _natural_instance(target_model, values):
    manager = target_model._base_manager.using(TARGET_ALIAS)
    label = _label(target_model)
    if label == "contenttypes.contenttype":
        return manager.filter(app_label=values["app_label"], model=values["model"]).first()
    if label == "auth.permission":
        return manager.filter(
            content_type_id=values["content_type_id"], codename=values["codename"]
        ).first()
    if label == "auth.group":
        return manager.filter(name=values["name"]).first()
    return None


def _mapped_fk(source_field, source_value, targets_by_label, id_map):
    if source_value is None:
        return None
    source_remote = source_field.remote_field.model
    target_remote = targets_by_label.get(_label(source_remote))
    if target_remote is None:
        raise CommandError(f"Missing target for relationship {_label(source_field.model)}.{source_field.name}.")
    key = (_label(source_remote), str(source_value))
    if key in id_map:
        mapped = id_map[key]
    elif target_remote._meta.pk.get_internal_type() == "ObjectIdAutoField":
        if key[0] in {"contenttypes.contenttype", "auth.permission", "auth.group"}:
            raise CommandError(f"Missing natural-key dependency mapping for {key[0]}.")
        mapped = deterministic_object_id(key[0], source_value)
    elif target_remote._meta.pk.get_internal_type() == "UUIDField":
        try:
            mapped = source_value if isinstance(source_value, uuid.UUID) else uuid.UUID(str(source_value))
        except (TypeError, ValueError, AttributeError) as exc:
            raise CommandError(f"Invalid UUID foreign key in {key[0]}.") from exc
    else:
        mapped = source_value
    if _label(source_remote) != _label(source_field.model) and not target_remote._base_manager.using(
        TARGET_ALIAS
    ).filter(pk=mapped).exists():
        raise CommandError(
            f"Missing referenced destination row for {_label(source_remote)} "
            f"record {_safe_record_key(key[0], source_value)}."
        )
    return mapped


def _convert_values(source_obj, source_model, target_model, targets_by_label, id_map):
    _check_fields(source_model, target_model)
    source_fields = {field.name: field for field in source_model._meta.concrete_fields}
    values = {}
    for target_field in target_model._meta.concrete_fields:
        source_field = source_fields.get(target_field.name)
        if target_field.primary_key:
            values[target_field.attname] = target_primary_key(source_model, target_model, source_obj.pk)
            continue
        if target_field.name == "name_key" and source_field is None:
            values[target_field.attname] = (getattr(source_obj, "name", "") or "").strip().lower()
            continue
        if source_field is None:
            values[target_field.attname] = target_field.get_default() if target_field.has_default() else None
            continue
        value = getattr(source_obj, source_field.attname)
        if target_field.is_relation and (target_field.many_to_one or target_field.one_to_one):
            value = _mapped_fk(source_field, value, targets_by_label, id_map)
        elif _label(source_model) == "audit.auditentry" and target_field.name == "metadata":
            value = sanitize_audit_metadata(value or {})
        values[target_field.attname] = value
    return values


def _natural_target_pk(source_model, target_model, source_pk, values):
    natural = _natural_instance(target_model, values)
    if natural is not None:
        return natural.pk, natural
    return target_primary_key(source_model, target_model, source_pk), None


def _values_by_name(values, model):
    return {field.name: values[field.attname] for field in model._meta.concrete_fields if not field.primary_key}


def _instance_values(instance, model):
    return {field.name: getattr(instance, field.attname) for field in model._meta.concrete_fields if not field.primary_key}


def _copy_one(source_obj, source_model, target_model, targets_by_label, id_map):
    values = _convert_values(source_obj, source_model, target_model, targets_by_label, id_map)
    target_pk, natural = _natural_target_pk(source_model, target_model, source_obj.pk, values)
    values[target_model._meta.pk.attname] = target_pk
    manager = target_model._base_manager.using(TARGET_ALIAS)
    existing = natural or manager.filter(pk=target_pk).first()
    if existing is not None:
        if _fingerprint(_instance_values(existing, target_model)) != _fingerprint(_values_by_name(values, target_model)):
            raise CommandError(
                f"Conflicting existing data for {_label(target_model)} record "
                f"{_safe_record_key(_label(source_model), source_obj.pk)}; destination unchanged."
            )
        return existing.pk, "matched"
    try:
        instance = target_model(**values)
        # bulk_create intentionally bypasses model save hooks and post_save
        # signals. The required derived values are mapped above; replaying
        # audit/notification signals during an import would create duplicate
        # user-facing side effects.
        manager.bulk_create([instance], batch_size=1)
    except Exception as exc:
        # Driver errors can contain query data or connection details.
        raise CommandError(
            f"Insert failed for {_label(target_model)} record "
            f"{_safe_record_key(_label(source_model), source_obj.pk)}; inspect protected logs."
        ) from exc
    return instance.pk, "inserted"


def _iter_batches(queryset, batch_size):
    batch = []
    for row in queryset.order_by("pk").iterator(chunk_size=batch_size):
        batch.append(row)
        if len(batch) == batch_size:
            yield batch
            batch = []
    if batch:
        yield batch


def _write_json_file(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent,
            prefix=f".{path.name}.", suffix=".tmp", delete=False,
        ) as stream:
            temp_name = stream.name
            json.dump(data, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        if os.name != "nt":
            os.chmod(temp_name, 0o600)
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def _load_checkpoint(path, resume):
    if not path.exists():
        if resume:
            raise CommandError("--resume requires an existing checkpoint file.")
        return {"format_version": CHECKPOINT_VERSION, "models": {}}
    if not resume:
        raise CommandError("Checkpoint exists; pass --resume or choose a new path.")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CommandError("Checkpoint is unreadable or invalid JSON.") from exc
    if data.get("format_version") != CHECKPOINT_VERSION:
        raise CommandError("Checkpoint version is incompatible with this command.")
    return data


def _is_loopback(host):
    return not host or host.lower() in {"localhost", "127.0.0.1", "::1"}


def _database_identity_hash(vendor, host, port, database):
    """Bind checkpoints to endpoints without persisting hosts or credentials."""
    identity = "|".join(str(value or "") for value in (vendor, host, port, database))
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


class Command(BaseCommand):
    help = "Copy PostgreSQL records to MongoDB; defaults to a read-only dry run."

    def add_arguments(self, parser):
        modes = parser.add_mutually_exclusive_group()
        modes.add_argument("--dry-run", action="store_true", help="Read-only inventory/preflight; this is the default.")
        modes.add_argument("--validate-only", action="store_true", help="Compare source records, documents and counts.")
        modes.add_argument("--import", dest="import_data", action="store_true", help="Write an additive, resumable import.")
        parser.add_argument("--resume", action="store_true")
        parser.add_argument("--checkpoint-file", help="Private checkpoint path; required for --import.")
        parser.add_argument("--report-file", help="Optional sanitized JSON summary path.")
        parser.add_argument("--batch-size", type=int, default=100)
        parser.add_argument("--source-environment", choices=("local", "staging", "production"))
        parser.add_argument("--target-environment", choices=("local", "staging", "production"))
        parser.add_argument(
            "--allow-production-data", action="store_true",
            help="Acknowledge production DB access; does not deploy or cut over traffic.",
        )

    def handle(self, *args, **options):
        mode = "import" if options["import_data"] else "validate" if options["validate_only"] else "dry-run"
        if not 1 <= options["batch_size"] <= 1000:
            raise CommandError("--batch-size must be between 1 and 1000.")
        if options["resume"] and mode != "import":
            raise CommandError("--resume can only be combined with --import.")
        if mode == "import" and not options.get("checkpoint_file"):
            raise CommandError("--import requires --checkpoint-file.")

        source_url = os.getenv("POSTGRES_SOURCE_URL", "").strip()
        if not source_url:
            raise CommandError("POSTGRES_SOURCE_URL is required; its value is never logged.")
        mongo_uri = getattr(settings, "MONGODB_URI", "").strip()
        if connections[TARGET_ALIAS].vendor != "mongodb" or not mongo_uri:
            raise CommandError("Select DJANGO_SETTINGS_MODULE=config.settings_mongodb for the Mongo target.")

        source_host = urlsplit(source_url).hostname or ""
        target_host = urlsplit(mongo_uri).hostname or ""
        if not _is_loopback(source_host) and not options.get("source_environment"):
            raise CommandError("Classify a remote source with --source-environment.")
        if not _is_loopback(target_host) and not options.get("target_environment"):
            raise CommandError("Classify a remote target with --target-environment.")
        if not _is_loopback(source_host) and options.get("source_environment") == "local":
            raise CommandError("A remote PostgreSQL source cannot be classified as local.")
        if not _is_loopback(target_host) and options.get("target_environment") == "local":
            raise CommandError("A remote MongoDB target cannot be classified as local.")
        is_production = (
            options.get("source_environment") == "production"
            or options.get("target_environment") == "production"
        )
        if is_production and not options.get("allow_production_data"):
            raise CommandError("Production DB access requires --allow-production-data.")

        try:
            source_config = dj_database_url.parse(
                source_url, conn_max_age=0, conn_health_checks=True
            )
        except (TypeError, ValueError, KeyError, IndexError) as exc:
            raise CommandError("POSTGRES_SOURCE_URL is invalid.") from exc
        if source_config.get("ENGINE") != "django.db.backends.postgresql":
            raise CommandError("POSTGRES_SOURCE_URL must use PostgreSQL.")
        connections.databases[SOURCE_ALIAS] = source_config
        source_connection = connections[SOURCE_ALIAS]
        if source_connection.vendor != "postgresql":
            raise CommandError("The source connection is not PostgreSQL.")

        # Keep every source query on one read-only PostgreSQL snapshot so concurrent
        # source writes cannot be skipped between model batches.
        with django_transaction.atomic(using=SOURCE_ALIAS):
            with source_connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            self._run_source_snapshot(source_connection, source_config, mongo_uri, options, mode)

    def _run_source_snapshot(self, source_connection, source_config, mongo_uri, options, mode):
        source_apps, applied = _source_state(source_connection)
        source_models, targets_by_label = _model_pairs(source_apps)
        for source_model in source_models:
            _check_fields(source_model, targets_by_label[_label(source_model)])

        source_db_name = source_connection.settings_dict.get("NAME", "")
        target_db_name = settings.MONGODB_DATABASE
        target_uri = urlsplit(mongo_uri)
        source_endpoint_hash = _database_identity_hash(
            "postgresql",
            source_config.get("HOST"),
            source_config.get("PORT"),
            source_db_name,
        )
        target_endpoint_hash = _database_identity_hash(
            "mongodb",
            target_uri.hostname,
            target_uri.port,
            target_db_name,
        )
        migration_text = "\n".join(f"{app}.{name}" for app, name in sorted(applied))
        migration_hash = hashlib.sha256(migration_text.encode()).hexdigest()
        checkpoint_path = (
            Path(options["checkpoint_file"]).expanduser().resolve()
            if options.get("checkpoint_file") else None
        )
        checkpoint_data = None
        if mode == "import":
            checkpoint_data = _load_checkpoint(checkpoint_path, options["resume"])
            identity = {
                "source_database": source_db_name,
                "target_database": target_db_name,
                "source_endpoint_sha256": source_endpoint_hash,
                "target_endpoint_sha256": target_endpoint_hash,
                "source_migrations_sha256": migration_hash,
            }
            if options["resume"]:
                if any(checkpoint_data.get(key) != value for key, value in identity.items()):
                    raise CommandError("Checkpoint does not match source, target, and source migration state.")
            else:
                checkpoint_data.update(identity)
                checkpoint_data["models"] = {}
                _write_json_file(checkpoint_path, checkpoint_data)

        report = {
            "mode": mode, "source_database": source_db_name,
            "target_database": target_db_name, "models": {}, "status": "PASS",
        }
        global_id_map = {}

        for source_model in source_models:
            label = _label(source_model)
            target_model = targets_by_label[label]
            source_manager = source_model._base_manager.using(SOURCE_ALIAS)
            target_manager = target_model._base_manager.using(TARGET_ALIAS)
            source_count = source_manager.count()
            target_before = target_manager.count()
            result = {
                "source_count": source_count, "target_count_before": target_before,
                "inserted": 0, "matched": 0, "mismatches": 0,
            }
            model_cp = (checkpoint_data or {}).get("models", {}).get(label, {})

            if mode == "dry-run":
                self.stdout.write(f"{label}: source={source_count}, target={target_before}")
                report["models"][label] = result
                continue

            resume_upto = model_cp.get("last_pk") if mode == "import" and options["resume"] else None
            if resume_upto:
                parsed_last_pk = source_model._meta.pk.to_python(resume_upto)
                prior_rows = source_manager.filter(pk__lte=parsed_last_pk).order_by("pk")
                for prior in prior_rows.iterator(chunk_size=options["batch_size"]):
                    values = _convert_values(prior, source_model, target_model, targets_by_label, global_id_map)
                    mapped_pk, natural = _natural_target_pk(source_model, target_model, prior.pk, values)
                    existing = natural or target_manager.filter(pk=mapped_pk).first()
                    if existing is not None:
                        global_id_map[(label, str(prior.pk))] = existing.pk

            if mode == "validate":
                for batch in _iter_batches(source_manager.all(), options["batch_size"]):
                    for source_obj in batch:
                        try:
                            values = _convert_values(source_obj, source_model, target_model, targets_by_label, global_id_map)
                            mapped_pk, natural = _natural_target_pk(source_model, target_model, source_obj.pk, values)
                            existing = natural or target_manager.filter(pk=mapped_pk).first()
                            if existing is None or _fingerprint(_instance_values(existing, target_model)) != _fingerprint(_values_by_name(values, target_model)):
                                result["mismatches"] += 1
                            else:
                                result["matched"] += 1
                                global_id_map[(label, str(source_obj.pk))] = existing.pk
                        except CommandError:
                            result["mismatches"] += 1
                result["target_count_after"] = target_manager.count()
                if result["mismatches"] or result["matched"] != source_count or result["target_count_after"] != source_count:
                    report["status"] = "FAIL"
                report["models"][label] = result
                continue

            if model_cp.get("completed"):
                for batch in _iter_batches(source_manager.all(), options["batch_size"]):
                    for source_obj in batch:
                        values = _convert_values(source_obj, source_model, target_model, targets_by_label, global_id_map)
                        mapped_pk, natural = _natural_target_pk(source_model, target_model, source_obj.pk, values)
                        existing = natural or target_manager.filter(pk=mapped_pk).first()
                        if existing is None or _fingerprint(_instance_values(existing, target_model)) != _fingerprint(_values_by_name(values, target_model)):
                            raise CommandError(f"Completed checkpoint conflicts with {label}; destination unchanged.")
                        global_id_map[(label, str(source_obj.pk))] = existing.pk
                        result["matched"] += 1
                result["target_count_after"] = target_manager.count()
                report["models"][label] = result
                continue

            queryset = source_manager.all()
            if resume_upto:
                queryset = queryset.filter(pk__gt=source_model._meta.pk.to_python(resume_upto))
            processed = int(model_cp.get("processed", 0))
            last_pk = model_cp.get("last_pk")
            for batch in _iter_batches(queryset, options["batch_size"]):
                @retry_transient_mongo_transaction()
                def copy_batch():
                    local_ids = dict(global_id_map)
                    outcomes = []
                    with transaction.atomic(using=TARGET_ALIAS):
                        for source_obj in batch:
                            mapped_pk, outcome = _copy_one(
                                source_obj, source_model, target_model, targets_by_label, local_ids
                            )
                            local_ids[(label, str(source_obj.pk))] = mapped_pk
                            outcomes.append(outcome)
                    return local_ids, outcomes

                global_id_map, outcomes = copy_batch()
                result["inserted"] += outcomes.count("inserted")
                result["matched"] += outcomes.count("matched")
                processed += len(batch)
                last_pk = str(batch[-1].pk)
                checkpoint_data["models"][label] = {
                    "last_pk": last_pk, "processed": processed, "completed": False,
                }
                _write_json_file(checkpoint_path, checkpoint_data)

            result["target_count_after"] = target_manager.count()
            checkpoint_data["models"][label] = {
                "last_pk": last_pk,
                "processed": processed, "completed": True,
                "source_count": source_count, "target_count_after": result["target_count_after"],
            }
            _write_json_file(checkpoint_path, checkpoint_data)
            report["models"][label] = result
            self.stdout.write(
                f"{label}: source={source_count}, inserted={result['inserted']}, "
                f"matched={result['matched']}, target={result['target_count_after']}"
            )

        if mode == "validate":
            self.stdout.write("Validation result: " + report["status"])
        elif mode == "dry-run":
            self.stdout.write("Read-only dry run complete; no destination writes were made.")
        else:
            checkpoint_data["completed_at"] = datetime.now().astimezone().isoformat()
            _write_json_file(checkpoint_path, checkpoint_data)
            self.stdout.write("Import finished. Run --validate-only before considering cutover.")
        if options.get("report_file"):
            _write_json_file(Path(options["report_file"]).expanduser().resolve(), report)
        if report["status"] != "PASS":
            raise CommandError("Reconciliation found missing or differing records.")
