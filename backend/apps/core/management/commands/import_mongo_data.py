"""Safely migrate the legacy MongoDB collections into the Django ORM.

This command never writes to MongoDB. It reads either MongoDB Extended JSON
exports or a MongoDB source database and writes only to Django's configured
database. Dry-run is the default; ``--import`` is required to persist rows.
"""

from __future__ import annotations

import base64
from contextlib import contextmanager
import json
import os
import re
import uuid
from datetime import datetime, timezone as datetime_timezone
from pathlib import Path

from bson import json_util
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, connection
from django.db.models.signals import post_save
from django.utils import timezone
from pymongo import MongoClient

from apps.accounts.models import User, UserRole, UserType
from apps.audit.models import AuditEntry
from apps.audit.signals import schedule_audit_notifications, schedule_match_notifications
from apps.claims.models import Claim, ClaimChallengeAnswer
from apps.core.crypto import encrypt_field, get_encryption_key
from apps.core.db_transactions import transaction
from apps.custody.models import CustodyRecord
from apps.disposal.models import DisposalRecord
from apps.handovers.models import Handover
from apps.items.models import Item, ItemCategory
from apps.locations.models import Location
from apps.matching.models import MatchSuggestion
from apps.verification.models import PrivateDetail, VerificationChallenge


SOURCE_COLLECTIONS = (
    "itemcategories",
    "locations",
    "users",
    "items",
    "privatedetails",
    "verificationchallenges",
    "claims",
    "matchsuggestions",
    "custodyrecords",
    "handovers",
    "disposalrecords",
    "auditentries",
)

FILE_ALIASES = {
    "itemcategories": ("itemcategories", "categories"),
    "locations": ("locations",),
    "users": ("users",),
    "items": ("items",),
    "privatedetails": ("privatedetails", "privateDetails"),
    "verificationchallenges": ("verificationchallenges", "challenges"),
    "claims": ("claims",),
    "matchsuggestions": ("matchsuggestions", "matchSuggestions", "matching"),
    "custodyrecords": ("custodyrecords", "custodyRecords", "custody"),
    "handovers": ("handovers",),
    "disposalrecords": ("disposalrecords", "disposalRecords", "disposal"),
    "auditentries": ("auditentries", "auditEntries", "audit"),
}

TARGET_MODELS = {
    "itemcategories": ItemCategory,
    "locations": Location,
    "users": User,
    "items": Item,
    "privatedetails": PrivateDetail,
    "verificationchallenges": VerificationChallenge,
    "claims": Claim,
    "matchsuggestions": MatchSuggestion,
    "custodyrecords": CustodyRecord,
    "handovers": Handover,
    "disposalrecords": DisposalRecord,
    "auditentries": AuditEntry,
}

COUNT_MODELS = {
    **TARGET_MODELS,
    "claim_challenge_answers": ClaimChallengeAnswer,
}


class SourceDataError(Exception):
    """A safe-to-report source or mapping validation error."""


@contextmanager
def _suppress_historical_notification_signals():
    """Do not replay old event notifications while importing historical rows."""
    post_save.disconnect(sender=AuditEntry, dispatch_uid="audit_entry_portal_notifications")
    post_save.disconnect(sender=MatchSuggestion, dispatch_uid="new_match_portal_notifications")
    try:
        yield
    finally:
        post_save.connect(
            schedule_audit_notifications,
            sender=AuditEntry,
            dispatch_uid="audit_entry_portal_notifications",
        )
        post_save.connect(
            schedule_match_notifications,
            sender=MatchSuggestion,
            dispatch_uid="new_match_portal_notifications",
        )


def _source_id(document: dict) -> str:
    source_id = document.get("_id")
    if source_id is None:
        raise SourceDataError("document is missing its MongoDB _id")
    return str(source_id)


def _reference_id(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, dict):
        if "$oid" in value:
            return str(value["$oid"])
        if "_id" in value:
            return _reference_id(value["_id"])
    return str(value)


def _stable_pk(database: str, collection: str, source_id: str) -> uuid.UUID:
    """Use a stable UUID so a repeated migration is idempotent without new columns."""
    return uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"lpu-lost-found-mongo:{database}:{collection}:{source_id}",
    )


def _as_datetime(value, *, required: bool = False) -> datetime | None:
    if value in (None, ""):
        if required:
            raise SourceDataError("required timestamp is missing")
        return None

    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, (int, float)):
        # Raw BSON epoch values are milliseconds since Unix epoch.
        parsed = datetime.fromtimestamp(float(value) / 1000, tz=datetime_timezone.utc)
    elif isinstance(value, str):
        text = value.strip()
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError as exc:
            raise SourceDataError("timestamp is not valid ISO-8601") from exc
    else:
        raise SourceDataError("timestamp has an unsupported type")

    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, datetime_timezone.utc)
    return parsed


def _json_safe(value):
    """Convert BSON values into data accepted by Django JSONField."""
    if isinstance(value, datetime):
        return _as_datetime(value).isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, dict):
        if value.get("_bsontype") == "ObjectId":
            return str(value)
        return {str(key): _json_safe(nested) for key, nested in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(nested) for nested in value]
    if hasattr(value, "to_decimal"):
        return float(value.to_decimal())
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    # BSON ObjectId and other scalar wrappers stringify safely, without logging
    # their values elsewhere in this command.
    if value.__class__.__name__ == "ObjectId":
        return str(value)
    raise SourceDataError("JSON metadata contains an unsupported BSON value")


def _bcrypt_compatible_hash(encoded: str, field_name: str) -> str:
    """Wrap legacy raw bcrypt in Django's supported hasher marker."""
    if not isinstance(encoded, str) or not encoded:
        raise SourceDataError(f"{field_name} is missing")
    if encoded.startswith(("$2a$", "$2b$", "$2y$")):
        return f"bcrypt${encoded}"
    if encoded.startswith(("bcrypt$", "bcrypt_sha256$", "pbkdf2_sha256$", "argon2$", "scrypt$")):
        return encoded
    raise SourceDataError(f"{field_name} uses an unsupported password-hash format")


def _decode_aes_key(value: str | None) -> bytes | None:
    if not value:
        return None
    value = value.strip()
    if re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return bytes.fromhex(value)
    try:
        decoded = base64.b64decode(value.encode("ascii"), altchars=b"-_", validate=True)
    except (ValueError, UnicodeEncodeError) as exc:
        raise SourceDataError("source field-encryption key is not valid hex/base64") from exc
    if len(decoded) != 32:
        raise SourceDataError("source field-encryption key must encode 32 bytes")
    return decoded


def _encrypt_from_source(ciphertext: str, iv: str, auth_tag: str, source_key: bytes | None) -> dict:
    """Re-encrypt a legacy AES-256-GCM payload using the active Django key."""
    if not ciphertext and not iv and not auth_tag:
        return {"ciphertext": "", "iv": "", "auth_tag": ""}
    if not ciphertext or not iv or not auth_tag:
        raise SourceDataError("encrypted payload is incomplete")
    if source_key is None:
        raise SourceDataError(
            "encrypted source data requires MONGO_FIELD_ENCRYPTION_KEY; no encrypted values were imported"
        )
    try:
        source_ciphertext = bytes.fromhex(ciphertext)
        source_iv = bytes.fromhex(iv)
        source_tag = bytes.fromhex(auth_tag)
        plaintext = AESGCM(source_key).decrypt(source_iv, source_ciphertext + source_tag, None)
        target_key = get_encryption_key()
        if source_key == target_key:
            return {"ciphertext": ciphertext, "iv": iv, "auth_tag": auth_tag}
        target_encrypted = encrypt_field(plaintext.decode("utf-8"))
        return {
            "ciphertext": target_encrypted["ciphertext"],
            "iv": target_encrypted["iv"],
            "auth_tag": target_encrypted["authTag"],
        }
    except SourceDataError:
        raise
    except Exception as exc:
        raise SourceDataError(
            "encrypted source payload could not be verified; check the source key and ciphertext"
        ) from exc


class Command(BaseCommand):
    help = "Dry-run or import legacy LPU MongoDB records into the configured Django database."

    def add_arguments(self, parser):
        source = parser.add_mutually_exclusive_group(required=True)
        source.add_argument(
            "--input-dir",
            type=Path,
            help="Directory containing one MongoDB Extended JSON file per collection.",
        )
        source.add_argument(
            "--mongo-uri",
            type=str,
            help="Read-only source MongoDB URI. The URI is never printed or logged.",
        )
        parser.add_argument(
            "--database",
            default="lpu_lost_found",
            help="Source MongoDB database name (default: lpu_lost_found).",
        )
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument(
            "--dry-run",
            dest="dry_run",
            action="store_true",
            help="Validate inside a transaction and roll back. This is the default.",
        )
        mode.add_argument(
            "--import",
            dest="do_import",
            action="store_true",
            help="Persist the import. Without this flag, the command always rolls back.",
        )
        parser.add_argument(
            "--allow-production",
            action="store_true",
            help="Required for an approved import when DJANGO_ENV=production.",
        )
        parser.add_argument(
            "--confirm-production",
            default="",
            help="Production confirmation phrase: MIGRATE LPU_LOST_FOUND.",
        )
        parser.add_argument(
            "--reuse-existing-references",
            action="store_true",
            help=(
                "Map category/location rows to same-code destination rows and preserve "
                "destination configuration when non-key fields differ."
            ),
        )
        parser.add_argument(
            "--skip-orphans",
            action="store_true",
            help="Skip legacy records with dangling references rather than failing the entire import.",
        )
        parser.add_argument(
            "--batch-transactions",
            action="store_true",
            help="Commit in batches of 25 to avoid MongoDB Atlas 60-second transaction timeouts.",
        )

    def handle(self, *args, **options):
        do_import = bool(options["do_import"])
        dry_run = not do_import
        if (settings.IS_PRODUCTION or connection.vendor == "postgresql") and do_import:
            if not options["allow_production"] or options["confirm_production"] != "MIGRATE LPU_LOST_FOUND":
                raise CommandError(
                    "Production/PostgreSQL writes are disabled unless --allow-production and "
                    "--confirm-production 'MIGRATE LPU_LOST_FOUND' are supplied after approval."
                )

        database = options["database"].strip()
        if not database:
            raise CommandError("A source MongoDB database name is required.")
        self.reuse_existing_references = options["reuse_existing_references"]
        self.skip_orphans = options.get("skip_orphans", False)
        self.dry_run = dry_run
        self.reference_warnings = []

        if options["input_dir"]:
            data = self._load_input_dir(options["input_dir"])
            source_description = f"Extended JSON directory: {options['input_dir']}"
        else:
            data = self._load_mongo(options["mongo_uri"], database)
            source_description = f"MongoDB database: {database} (read-only queries)"

        source_counts = {name: len(data[name]) for name in SOURCE_COLLECTIONS}
        source_counts["claim_challenge_answers"] = sum(
            len(document.get("challengeAnswers") or []) for document in data["claims"]
        )
        self._validate_source_documents(data)
        self._validate_source_relationships(data)

        encrypted_rows = sum(
            bool(document.get("encryptedCiphertext"))
            for document in data["privatedetails"]
        ) + sum(
            bool(document.get("handoverOtpCipher"))
            for document in data["claims"]
        )
        source_key = None
        if encrypted_rows:
            try:
                source_key = _decode_aes_key(os.getenv("MONGO_FIELD_ENCRYPTION_KEY"))
            except SourceDataError as exc:
                raise CommandError(str(exc)) from None
            if source_key is None:
                raise CommandError(
                    f"Source contains {encrypted_rows} encrypted record(s). Set "
                    "MONGO_FIELD_ENCRYPTION_KEY to the legacy LPU AES-256-GCM key. "
                    "The key value is never printed."
                )

        self._validate_unique_source_keys(data)
        before = self._destination_counts()
        stats = {
            collection: {
                "created": 0,
                "already_imported": 0,
                "matched_existing": 0,
                "reference_conflicts_preserved": 0,
                "skipped": 0,
            }
            for collection in SOURCE_COLLECTIONS
        }
        stats["claim_challenge_answers"] = {
            "created": 0,
            "already_imported": 0,
            "matched_existing": 0,
            "reference_conflicts_preserved": 0,
            "skipped": 0,
        }
        self.stdout.write(self.style.MIGRATE_HEADING("MongoDB to Django/PostgreSQL migration preparation"))
        self.stdout.write(f"Source: {source_description}")
        self.stdout.write(f"Destination engine: {connection.vendor}")
        self.stdout.write("Source database is read-only; no MongoDB write operations are used.")
        self.stdout.write(
            self.style.WARNING(
                "Mode: DRY RUN (transaction will be rolled back)."
                if dry_run
                else "Mode: IMPORT (Django destination records will be written)."
            )
        )

        id_maps = {collection: {} for collection in SOURCE_COLLECTIONS}
        try:
            with _suppress_historical_notification_signals():
                if options.get("batch_transactions"):
                    self._import_all_batched(data, database, source_key, id_maps, stats, dry_run=dry_run)
                else:
                    with transaction.atomic():
                        self._import_all(data, database, source_key, id_maps, stats)
                        if dry_run:
                            transaction.set_rollback(True)
        except CommandError:
            raise
        except Exception as exc:
            # Never print document content, passwords, OTPs, URIs or database values.
            raise CommandError(
                f"Migration transaction failed ({type(exc).__name__}); all destination "
                "changes were rolled back. Review source/destination constraints and retry."
            ) from None

        after = self._destination_counts()
        self._print_summary(source_counts, before, after, stats, dry_run)

    def _load_input_dir(self, input_dir: Path) -> dict[str, list[dict]]:
        if not input_dir.is_dir():
            raise CommandError("--input-dir must name an existing directory.")

        by_name = {path.stem.casefold(): path for path in input_dir.glob("*.json") if path.is_file()}
        data = {}
        missing = []
        for collection in SOURCE_COLLECTIONS:
            candidate = next(
                (by_name[alias.casefold()] for alias in FILE_ALIASES[collection] if alias.casefold() in by_name),
                None,
            )
            if candidate is None:
                missing.append(collection)
                continue
            try:
                content = candidate.read_text(encoding="utf-8-sig").strip()
                if not content:
                    documents = []
                else:
                    try:
                        parsed = json_util.loads(content)
                        documents = parsed if isinstance(parsed, list) else [parsed]
                    except Exception:
                        # mongoexport's default output is newline-delimited JSON.
                        documents = [
                            json_util.loads(line)
                            for line in content.splitlines()
                            if line.strip()
                        ]
                if any(not isinstance(document, dict) for document in documents):
                    raise SourceDataError("export contains a non-document value")
                data[collection] = documents
            except Exception as exc:
                if isinstance(exc, SourceDataError):
                    detail = str(exc)
                else:
                    detail = "JSON/Extended JSON parsing failed"
                raise CommandError(f"Could not read {candidate.name}: {detail}.") from None

        if missing:
            raise CommandError(
                "The export is incomplete. Required source collection files are missing: "
                + ", ".join(missing)
                + ". Export empty collections as empty JSON arrays too."
            )
        return data

    def _load_mongo(self, mongo_uri: str, database: str) -> dict[str, list[dict]]:
        client = None
        try:
            # Only collection discovery and find() operations are issued here.
            # This command contains no MongoDB insert/update/delete calls.
            client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
            client.admin.command("ping")
            source = client[database]
            available = set(source.list_collection_names())
            missing = [name for name in SOURCE_COLLECTIONS if name not in available]
            if missing:
                raise CommandError(
                    "MongoDB source is missing expected LPU collection(s): " + ", ".join(missing)
                )
            return {
                name: list(source[name].find({}, no_cursor_timeout=False).sort("_id", 1))
                for name in SOURCE_COLLECTIONS
            }
        except CommandError:
            raise
        except Exception:
            # Do not echo a Mongo URI; it may contain credentials.
            raise CommandError(
                "Could not read the source MongoDB database. Verify the URI, network access, "
                "and read permissions; the URI was not logged."
            ) from None
        finally:
            if client is not None:
                client.close()

    def _validate_source_documents(self, data):
        for collection, documents in data.items():
            seen_ids = set()
            for document in documents:
                try:
                    source_id = _source_id(document)
                except SourceDataError as exc:
                    raise CommandError(f"{collection}: {exc}.") from None
                if source_id in seen_ids:
                    raise CommandError(f"{collection}: duplicate MongoDB _id {source_id} in source data.")
                seen_ids.add(source_id)

    def _validate_unique_source_keys(self, data):
        unique_specs = {
            "itemcategories": (("code",),),
            "locations": (("code",),),
            "users": (("registrationNumber",), ("email",)),
            "items": (("referenceNumber",),),
            "privatedetails": (("item",),),
            "matchsuggestions": (("lostItem", "foundItem"),),
            "handovers": (("claim",),),
            "disposalrecords": (("item",),),
        }
        for collection, fields in unique_specs.items():
            for field_names in fields:
                observed = {}
                for document in data[collection]:
                    values = tuple(_reference_id(document.get(name)) for name in field_names)
                    if any(value is None or value == "" for value in values):
                        continue  # Required-field validation reports missing data safely later.
                    normalized = tuple(value.strip().casefold() for value in values)
                    if field_names == ("code",):
                        normalized = (values[0].strip().upper(),)
                    elif field_names == ("registrationNumber",):
                        normalized = (values[0].strip().upper(),)
                    elif field_names == ("email",):
                        normalized = (values[0].strip().casefold(),)
                    elif field_names == ("referenceNumber",):
                        normalized = (values[0].strip().upper(),)
                    if normalized in observed:
                        raise CommandError(
                            f"{collection}: duplicate source key {field_names} found in records "
                            f"{observed[normalized]} and {_source_id(document)}. No import was run."
                        )
                    observed[normalized] = _source_id(document)

        # The Django schema permits only one active claim for a claimant/item pair.
        active_statuses = {"SUBMITTED", "UNDER_REVIEW", "CHALLENGE_REQUIRED", "APPROVED"}
        active_claims = {}
        for document in data["claims"]:
            if document.get("claimStatus") not in active_statuses:
                continue
            key = (_reference_id(document.get("item")), _reference_id(document.get("claimant")))
            if None in key:
                continue
            if key in active_claims:
                raise CommandError(
                    "claims: multiple active source claims target the same item and claimant "
                    f"({active_claims[key]} and {_source_id(document)}). Resolve the conflict before import."
                )
            active_claims[key] = _source_id(document)

    def _validate_source_relationships(self, data):
        """Fail before writing when a Mongo reference cannot resolve to a source row."""
        source_ids = {
            collection: {_source_id(document) for document in documents}
            for collection, documents in data.items()
        }
        relationships = (
            ("items", "reportedBy", "users"),
            ("items", "category", "itemcategories"),
            ("items", "location", "locations"),
            ("privatedetails", "item", "items"),
            ("privatedetails", "lastDecryptedBy", "users"),
            ("verificationchallenges", "item", "items"),
            ("claims", "item", "items"),
            ("claims", "claimant", "users"),
            ("claims", "reviewedBy", "users"),
            ("matchsuggestions", "lostItem", "items"),
            ("matchsuggestions", "foundItem", "items"),
            ("custodyrecords", "item", "items"),
            ("custodyrecords", "handledBy", "users"),
            ("handovers", "claim", "claims"),
            ("handovers", "item", "items"),
            ("handovers", "recipient", "users"),
            ("handovers", "supervisingOfficer", "users"),
            ("disposalrecords", "item", "items"),
            ("disposalrecords", "approvedBy", "users"),
            ("auditentries", "actor", "users"),
        )
        unresolved = []
        for collection, field, target in relationships:
            for document in data[collection]:
                reference = _reference_id(document.get(field))
                if reference and reference not in source_ids[target]:
                    unresolved.append(
                        f"{collection}.{field} -> {target} (source record {_source_id(document)})"
                    )
        for claim in data["claims"]:
            for answer in claim.get("challengeAnswers") or []:
                reference = _reference_id(answer.get("challenge"))
                if reference and reference not in source_ids["verificationchallenges"]:
                    unresolved.append(
                        "claims.challengeAnswers.challenge -> verificationchallenges "
                        f"(source claim {_source_id(claim)})"
                    )

        if unresolved:
            if not getattr(self, "skip_orphans", False):
                preview = "; ".join(unresolved[:10])
                remainder = len(unresolved) - min(len(unresolved), 10)
                suffix = f"; and {remainder} more" if remainder else ""
                raise CommandError(
                    f"Source referential integrity check found {len(unresolved)} unresolved "
                    f"relationship(s): {preview}{suffix}. No import was run. Pass --skip-orphans to skip dangling records."
                )
            # Safely prune records with broken references so valid historical data imports cleanly
            self.stdout.write(
                self.style.WARNING(
                    f"Notice: Pruning {len(unresolved)} orphan record(s) referencing deleted items/claims before import."
                )
            )
            for collection, field, target in relationships:
                data[collection] = [
                    doc for doc in data[collection]
                    if not (_reference_id(doc.get(field)) and _reference_id(doc.get(field)) not in source_ids[target])
                ]
            for claim in data["claims"]:
                if claim.get("challengeAnswers"):
                    claim["challengeAnswers"] = [
                        ans for ans in claim["challengeAnswers"]
                        if not (_reference_id(ans.get("challenge")) and _reference_id(ans.get("challenge")) not in source_ids["verificationchallenges"])
                    ]

    def _destination_counts(self):
        return {name: model._base_manager.count() for name, model in COUNT_MODELS.items()}

    def _record(
        self,
        collection,
        document,
        database,
        values,
        stats,
        *,
        natural_key=None,
        timestamps=None,
        reuse_matching_reference=False,
    ):
        source_id = _source_id(document)
        model = COUNT_MODELS[collection]
        pk = _stable_pk(database, collection, source_id)
        existing = model._base_manager.filter(pk=pk).first()
        if existing is not None:
            stats[collection]["already_imported"] += 1
            return existing

        if natural_key:
            natural_match = model._base_manager.filter(**natural_key).first()
            if natural_match is not None:
                if reuse_matching_reference:
                    differing_fields = [
                        field
                        for field, value in values.items()
                        if getattr(natural_match, field) != value
                    ]
                    if not differing_fields:
                        # Reference tables such as categories and locations may already
                        # be seeded in the Django database with a different primary key.
                        # Reuse only an exact business-data match; never overwrite it.
                        stats[collection]["matched_existing"] += 1
                        return natural_match
                    field_names = ", ".join(sorted(differing_fields))
                    if self.reuse_existing_references:
                        stats[collection]["matched_existing"] += 1
                        stats[collection]["reference_conflicts_preserved"] += 1
                        self.reference_warnings.append(f"{collection}: {field_names}")
                        return natural_match
                    raise SourceDataError(
                        f"destination reference record conflicts for {collection} "
                        f"({field_names}); resolve the source/target mapping explicitly"
                    )
                raise SourceDataError(
                    f"destination already contains a different record with the unique key for {collection}"
                )

        instance = model(pk=pk, **values)
        try:
            instance.full_clean()
        except ValidationError as exc:
            fields = ", ".join(sorted(exc.message_dict.keys())) if hasattr(exc, "message_dict") else "record"
            raise SourceDataError(f"destination model validation failed for field(s): {fields}") from None
        instance.save(force_insert=True)

        # Django auto_now/auto_now_add fields intentionally override values passed
        # to save(); restore legacy timestamps once, before this transaction commits.
        restored = {field: value for field, value in (timestamps or {}).items() if value is not None}
        if restored:
            model._base_manager.filter(pk=pk).update(**restored)
            for field, value in restored.items():
                setattr(instance, field, value)
        stats[collection]["created"] += 1
        return instance

    @staticmethod
    def _get_timestamp_values(document):
        return {
            "created_at": _as_datetime(document.get("createdAt")),
            "updated_at": _as_datetime(document.get("updatedAt")),
        }

    @staticmethod
    def _required_text(document, key):
        value = document.get(key)
        if not isinstance(value, str) or not value.strip():
            raise SourceDataError(f"required field {key} is missing or empty")
        return value.strip()

    @staticmethod
    def _optional_text(document, key, default=""):
        value = document.get(key, default)
        if value is None:
            return default
        if not isinstance(value, str):
            raise SourceDataError(f"field {key} must be text")
        return value.strip()

    def _resolve(self, id_maps, collection, value, *, required=False, field_name="reference"):
        source_id = _reference_id(value)
        if source_id is None:
            if required:
                raise SourceDataError(f"required relationship {field_name} is missing")
            return None
        instance = id_maps[collection].get(source_id)
        if instance is None:
            raise SourceDataError(f"relationship {field_name} points to an unmapped {collection} record")
        return instance

    def _wrap_hash(self, document, key, field_name):
        try:
            return _bcrypt_compatible_hash(document.get(key), field_name)
        except SourceDataError:
            raise

    def _import_all_batched(self, data, database, source_key, id_maps, stats, batch_size=25, dry_run=False):
        handlers = {
            "itemcategories": self._import_category,
            "locations": self._import_location,
            "users": self._import_user,
            "items": self._import_item,
            "privatedetails": self._import_private_detail,
            "verificationchallenges": self._import_challenge,
            "claims": self._import_claim,
            "matchsuggestions": self._import_match,
            "custodyrecords": self._import_custody,
            "handovers": self._import_handover,
            "disposalrecords": self._import_disposal,
            "auditentries": self._import_audit,
        }
        for collection in SOURCE_COLLECTIONS:
            docs = data[collection]
            total_docs = len(docs)
            for chunk_start in range(0, max(total_docs, 1), batch_size):
                chunk = docs[chunk_start:chunk_start + batch_size]
                if not chunk:
                    continue
                with transaction.atomic():
                    for document in chunk:
                        try:
                            instance = handlers[collection](
                                document, database, source_key, id_maps, stats
                            )
                            id_maps[collection][_source_id(document)] = instance
                        except CommandError:
                            raise
                        except SourceDataError as exc:
                            raise CommandError(
                                f"{collection} record {_source_id(document)}: {exc}. "
                                "The destination transaction was rolled back."
                            ) from None
                        except IntegrityError:
                            raise CommandError(
                                f"{collection} record {_source_id(document)} conflicts with a destination "
                                "database constraint. The destination transaction was rolled back."
                            ) from None
                        except Exception as exc:
                            raise CommandError(
                                f"{collection} record {_source_id(document)} failed ({type(exc).__name__}: {exc}). "
                                "Record values were not logged and the destination transaction was rolled back."
                            ) from exc
                    if dry_run:
                        transaction.set_rollback(True)

    def _import_all(self, data, database, source_key, id_maps, stats):
        handlers = {
            "itemcategories": self._import_category,
            "locations": self._import_location,
            "users": self._import_user,
            "items": self._import_item,
            "privatedetails": self._import_private_detail,
            "verificationchallenges": self._import_challenge,
            "claims": self._import_claim,
            "matchsuggestions": self._import_match,
            "custodyrecords": self._import_custody,
            "handovers": self._import_handover,
            "disposalrecords": self._import_disposal,
            "auditentries": self._import_audit,
        }
        for collection in SOURCE_COLLECTIONS:
            for document in data[collection]:
                try:
                    instance = handlers[collection](
                        document, database, source_key, id_maps, stats
                    )
                    id_maps[collection][_source_id(document)] = instance
                except CommandError:
                    raise
                except SourceDataError as exc:
                    raise CommandError(
                        f"{collection} record {_source_id(document)}: {exc}. "
                        "The destination transaction was rolled back."
                    ) from None
                except IntegrityError:
                    raise CommandError(
                        f"{collection} record {_source_id(document)} conflicts with a destination "
                        "database constraint. The destination transaction was rolled back."
                    ) from None
                except Exception as exc:
                    raise CommandError(
                        f"{collection} record {_source_id(document)} failed ({type(exc).__name__}: {exc}). "
                        "Record values were not logged and the destination transaction was rolled back."
                    ) from exc

    def _import_category(self, doc, database, source_key, id_maps, stats):
        code = self._required_text(doc, "code").upper()
        values = {
            "code": code,
            "name": self._required_text(doc, "name"),
            "description": self._optional_text(doc, "description"),
            "icon": self._optional_text(doc, "icon"),
            "is_active": bool(doc.get("isActive", True)),
            "default_retention_days": int(doc.get("defaultRetentionDays", 90)),
        }
        return self._record(
            "itemcategories", doc, database, values, stats,
            natural_key={"code": code}, timestamps=self._get_timestamp_values(doc),
            reuse_matching_reference=True,
        )

    def _import_location(self, doc, database, source_key, id_maps, stats):
        code = self._required_text(doc, "code").upper()
        values = {
            "code": code,
            "name": self._required_text(doc, "name"),
            "campus_zone": self._required_text(doc, "campusZone"),
            "building_name": self._optional_text(doc, "buildingName"),
            "has_security_desk": bool(doc.get("hasSecurityDesk", False)),
            "security_contact_phone": self._optional_text(doc, "securityContactPhone"),
            "is_active": bool(doc.get("isActive", True)),
        }
        return self._record(
            "locations", doc, database, values, stats,
            natural_key={"code": code}, timestamps=self._get_timestamp_values(doc),
            reuse_matching_reference=True,
        )

    def _import_user(self, doc, database, source_key, id_maps, stats):
        email = self._required_text(doc, "email").lower()
        registration_number = self._required_text(doc, "registrationNumber").upper()
        role = self._required_text(doc, "role")
        user_type = {
            UserRole.SECURITY_PERSONNEL: UserType.SECURITY_OFFICER,
            UserRole.CAMPUS_ADMIN: UserType.CAMPUS_ADMIN,
            UserRole.SYSTEM_ADMIN: UserType.SYSTEM_ADMIN,
        }.get(role, UserType.UNSPECIFIED)
        values = {
            "registration_number": registration_number,
            "email": email,
            "full_name": self._required_text(doc, "fullName"),
            "role": role,
            # Legacy STUDENT_STAFF did not distinguish student from staff.
            "user_type": user_type,
            "department": self._optional_text(doc, "department"),
            "security_post": self._optional_text(doc, "securityPost"),
            "phone": self._optional_text(doc, "phone"),
            "is_active": bool(doc.get("isActive", True)),
            # Do not infer Django admin flags from a legacy application role.
            "is_staff": False,
            "password": _bcrypt_compatible_hash(doc.get("passwordHash"), "passwordHash"),
            "last_login": _as_datetime(doc.get("lastLoginAt")),
        }
        return self._record(
            "users", doc, database, values, stats,
            natural_key={"registration_number": registration_number},
            timestamps=self._get_timestamp_values(doc),
        )

    def _import_item(self, doc, database, source_key, id_maps, stats):
        reference_number = self._required_text(doc, "referenceNumber").upper()
        category = self._resolve(id_maps, "itemcategories", doc.get("category"), required=True, field_name="category")
        location = self._resolve(id_maps, "locations", doc.get("location"), required=True, field_name="location")
        reporter = self._resolve(id_maps, "users", doc.get("reportedBy"), required=True, field_name="reportedBy")
        images = doc.get("additionalImages") or []
        if not isinstance(images, list):
            raise SourceDataError("additionalImages must be an array")
        values = {
            "reference_number": reference_number,
            "item_type": self._required_text(doc, "itemType"),
            "title": self._required_text(doc, "title"),
            "public_description": self._required_text(doc, "publicDescription"),
            "category": category,
            "location": location,
            "specific_location": self._required_text(doc, "specificLocation"),
            "event_date": _as_datetime(doc.get("eventDate"), required=True),
            "primary_image_url": self._optional_text(doc, "primaryImageUrl"),
            "additional_images": _json_safe(images),
            "status": self._required_text(doc, "status"),
            "reported_by": reporter,
            "current_custody_desk": self._optional_text(doc, "currentCustodyDesk"),
            "locker_storage_reference": self._optional_text(doc, "lockerStorageReference"),
            "retention_expires_at": _as_datetime(doc.get("retentionExpiresAt"), required=True),
            "is_archived": bool(doc.get("isArchived", False)),
        }
        return self._record(
            "items", doc, database, values, stats,
            natural_key={"reference_number": reference_number},
            timestamps=self._get_timestamp_values(doc),
        )

    def _encrypted_payload(self, doc, source_key, *, ciphertext_key, iv_key, tag_key):
        return _encrypt_from_source(
            self._optional_text(doc, ciphertext_key),
            self._optional_text(doc, iv_key),
            self._optional_text(doc, tag_key),
            source_key,
        )

    def _import_private_detail(self, doc, database, source_key, id_maps, stats):
        item = self._resolve(id_maps, "items", doc.get("item"), required=True, field_name="item")
        encrypted = self._encrypted_payload(
            doc, source_key,
            ciphertext_key="encryptedCiphertext", iv_key="iv", tag_key="authTag",
        )
        last_decrypted_by = self._resolve(
            id_maps, "users", doc.get("lastDecryptedBy"), field_name="lastDecryptedBy"
        )
        values = {
            "item": item,
            "encrypted_ciphertext": encrypted["ciphertext"],
            "iv": encrypted["iv"],
            "auth_tag": encrypted["auth_tag"],
            "fields_summary": _json_safe(doc.get("fieldsSummary") or []),
            "last_decrypted_by": last_decrypted_by,
            "last_decrypted_at": _as_datetime(doc.get("lastDecryptedAt")),
            "access_count": int(doc.get("accessCount", 0)),
        }
        return self._record(
            "privatedetails", doc, database, values, stats,
            natural_key={"item": item}, timestamps=self._get_timestamp_values(doc),
        )

    def _import_challenge(self, doc, database, source_key, id_maps, stats):
        item = self._resolve(id_maps, "items", doc.get("item"), required=True, field_name="item")
        question = self._required_text(doc, "questionText")
        values = {
            "item": item,
            "question_text": question,
            "hashed_answer": _bcrypt_compatible_hash(doc.get("hashedAnswer"), "hashedAnswer"),
            "hint": self._optional_text(doc, "hint"),
            "max_attempts": int(doc.get("maxAttempts", 3)),
            "expires_at": _as_datetime(doc.get("expiresAt")),
            "is_active": bool(doc.get("isActive", True)),
        }
        return self._record(
            "verificationchallenges", doc, database, values, stats,
            timestamps=self._get_timestamp_values(doc),
        )

    def _import_claim(self, doc, database, source_key, id_maps, stats):
        item = self._resolve(id_maps, "items", doc.get("item"), required=True, field_name="item")
        claimant = self._resolve(id_maps, "users", doc.get("claimant"), required=True, field_name="claimant")
        reviewer = self._resolve(id_maps, "users", doc.get("reviewedBy"), field_name="reviewedBy")
        encrypted = self._encrypted_payload(
            doc, source_key,
            ciphertext_key="handoverOtpCipher", iv_key="handoverOtpIv", tag_key="handoverOtpTag",
        )
        has_encrypted_otp = bool(encrypted["ciphertext"] and encrypted["iv"] and encrypted["auth_tag"])
        values = {
            "item": item,
            "claimant": claimant,
            "claim_status": self._required_text(doc, "claimStatus"),
            "statement": self._required_text(doc, "statement"),
            "private_evidence_proof_urls": _json_safe(doc.get("privateEvidenceProofUrls") or []),
            "reviewed_by": reviewer,
            "reviewed_at": _as_datetime(doc.get("reviewedAt")),
            "review_notes": self._optional_text(doc, "reviewNotes"),
            "rejection_reason": self._optional_text(doc, "rejectionReason"),
            # Never import Mongo's raw handoverOtp field. Only authenticated
            # ciphertext is eligible for re-encryption and transfer.
            "handover_otp": "",
            "handover_otp_cipher": encrypted["ciphertext"] if has_encrypted_otp else "",
            "handover_otp_iv": encrypted["iv"] if has_encrypted_otp else "",
            "handover_otp_tag": encrypted["auth_tag"] if has_encrypted_otp else "",
            "handover_otp_expires_at": (
                _as_datetime(doc.get("handoverOtpExpiresAt")) if has_encrypted_otp else None
            ),
            "verification_attempts_count": int(doc.get("verificationAttemptsCount", 0)),
        }
        claim = self._record(
            "claims", doc, database, values, stats,
            timestamps=self._get_timestamp_values(doc),
        )
        for index, answer in enumerate(doc.get("challengeAnswers") or []):
            if not isinstance(answer, dict):
                raise SourceDataError("challengeAnswers contains a non-object value")
            challenge = self._resolve(
                id_maps, "verificationchallenges", answer.get("challenge"),
                required=True, field_name="challengeAnswers.challenge",
            )
            embedded_id = _reference_id(answer.get("_id"))
            answer_source_id = embedded_id or f"{_source_id(doc)}:challenge-answer:{index}:{challenge.pk}"
            answer_doc = {"_id": answer_source_id}
            answer_values = {
                "claim": claim,
                "challenge": challenge,
                "provided_answer": self._required_text(answer, "providedAnswer"),
                "is_correct": answer.get("isCorrect"),
            }
            created_at = _as_datetime(answer.get("createdAt")) or _as_datetime(doc.get("createdAt"))
            self._record(
                "claim_challenge_answers", answer_doc, database, answer_values, stats,
                timestamps={"created_at": created_at},
            )
        return claim

    def _import_match(self, doc, database, source_key, id_maps, stats):
        lost_item = self._resolve(id_maps, "items", doc.get("lostItem"), required=True, field_name="lostItem")
        found_item = self._resolve(id_maps, "items", doc.get("foundItem"), required=True, field_name="foundItem")
        reviewer = self._resolve(id_maps, "users", doc.get("reviewedBy"), field_name="reviewedBy")
        values = {
            "lost_item": lost_item,
            "found_item": found_item,
            "match_score": float(doc.get("matchScore")),
            "confidence": self._required_text(doc, "confidence"),
            "explanation": _json_safe(doc.get("explanation") or {}),
            "status": self._required_text(doc, "status"),
            "reviewed_by": reviewer,
        }
        return self._record(
            "matchsuggestions", doc, database, values, stats,
            natural_key={"lost_item": lost_item, "found_item": found_item},
            timestamps=self._get_timestamp_values(doc),
        )

    def _import_custody(self, doc, database, source_key, id_maps, stats):
        item = self._resolve(id_maps, "items", doc.get("item"), required=True, field_name="item")
        officer = self._resolve(id_maps, "users", doc.get("handledBy"), required=True, field_name="handledBy")
        values = {
            "item": item,
            "action": self._required_text(doc, "action"),
            "from_location": self._optional_text(doc, "fromLocation"),
            "to_location": self._required_text(doc, "toLocation"),
            "locker_reference": self._optional_text(doc, "lockerReference"),
            # Legacy Mongo custody entries did not store a prior locker field.
            "previous_locker_reference": "",
            "evidence_reference": self._optional_text(doc, "evidenceReference"),
            "handled_by": officer,
            "remarks": self._optional_text(doc, "remarks"),
            "timestamp": _as_datetime(doc.get("timestamp"), required=True),
        }
        return self._record("custodyrecords", doc, database, values, stats)

    def _import_handover(self, doc, database, source_key, id_maps, stats):
        item = self._resolve(id_maps, "items", doc.get("item"), required=True, field_name="item")
        claim = self._resolve(id_maps, "claims", doc.get("claim"), required=True, field_name="claim")
        recipient = self._resolve(id_maps, "users", doc.get("recipient"), required=True, field_name="recipient")
        officer = self._resolve(
            id_maps, "users", doc.get("supervisingOfficer"), required=True,
            field_name="supervisingOfficer",
        )
        values = {
            "item": item,
            "claim": claim,
            "recipient": recipient,
            "supervising_officer": officer,
            "otp_hash": _bcrypt_compatible_hash(doc.get("otpHash"), "otpHash"),
            "otp_expires_at": _as_datetime(doc.get("otpExpiresAt"), required=True),
            "otp_attempts_count": int(doc.get("otpAttemptsCount", 0)),
            "physical_desk_location": self._required_text(doc, "physicalDeskLocation"),
            "id_card_presented_type": self._required_text(doc, "idCardPresentedType"),
            "id_card_number_masked": self._required_text(doc, "idCardNumberMasked"),
            "recipient_signature_url": self._optional_text(doc, "recipientSignatureUrl"),
            "acknowledgement_notes": self._optional_text(doc, "acknowledgementNotes"),
            "proof_evidence_url": self._optional_text(doc, "proofEvidenceUrl"),
            "is_completed": bool(doc.get("isCompleted", False)),
            "completed_at": _as_datetime(doc.get("completedAt")),
        }
        return self._record(
            "handovers", doc, database, values, stats,
            natural_key={"claim": claim}, timestamps=self._get_timestamp_values(doc),
        )

    def _import_disposal(self, doc, database, source_key, id_maps, stats):
        item = self._resolve(id_maps, "items", doc.get("item"), required=True, field_name="item")
        approver = self._resolve(
            id_maps, "users", doc.get("approvedBy"), required=True, field_name="approvedBy"
        )
        values = {
            "item": item,
            "method": self._required_text(doc, "method"),
            "approved_by": approver,
            "committee_notes": self._required_text(doc, "committeeNotes"),
            "reason": self._optional_text(doc, "reason"),
            "recipient_organization": self._optional_text(doc, "recipientOrganization"),
            "disposal_date": _as_datetime(doc.get("disposalDate"), required=True),
            "certificate_url": self._optional_text(doc, "certificateUrl"),
            "evidence_reference": self._optional_text(doc, "evidenceReference"),
        }
        return self._record(
            "disposalrecords", doc, database, values, stats,
            natural_key={"item": item}, timestamps=self._get_timestamp_values(doc),
        )

    def _import_audit(self, doc, database, source_key, id_maps, stats):
        actor = self._resolve(id_maps, "users", doc.get("actor"), field_name="actor")
        values = {
            "actor": actor,
            "actor_role": self._required_text(doc, "actorRole"),
            "actor_name": actor.full_name if actor else "",
            "description": self._optional_text(doc, "description"),
            "action": self._required_text(doc, "action"),
            "target_entity": self._required_text(doc, "targetEntity"),
            "target_id": self._optional_text(doc, "targetId"),
            "ip_address": self._required_text(doc, "ipAddress"),
            "user_agent": self._optional_text(doc, "userAgent"),
            "metadata": _json_safe(doc.get("metadata") or {}),
            "timestamp": _as_datetime(doc.get("timestamp"), required=True),
        }
        return self._record("auditentries", doc, database, values, stats)

    def _print_summary(self, source_counts, before, after, stats, dry_run):
        self.stdout.write("\nSource count | Django destination count before -> after | disposition")
        self.stdout.write("-" * 96)
        for name in (*SOURCE_COLLECTIONS, "claim_challenge_answers"):
            model = COUNT_MODELS[name]
            count_key = name
            source_count = source_counts.get(count_key, 0)
            result = stats[name]
            disposition = (
                f"created={result['created']}, already_imported={result['already_imported']}, "
                f"matched_existing={result['matched_existing']}, "
                f"reference_conflicts_preserved={result['reference_conflicts_preserved']}, "
                f"skipped={result['skipped']}"
            )
            self.stdout.write(
                f"{name}: {source_count} | {before[name]} -> {after[name]} | {disposition}"
            )
        if dry_run:
            self.stdout.write(self.style.SUCCESS("Dry run completed; destination transaction rolled back."))
            self.stdout.write(
                "The created counts are simulated; destination counts should remain unchanged."
            )
        else:
            self.stdout.write(self.style.SUCCESS("Import transaction committed."))
        if self.reference_warnings:
            self.stdout.write(
                self.style.WARNING(
                    "Existing category/location configuration was preserved for these "
                    "same-code mappings (differing fields only):"
                )
            )
            for warning in sorted(set(self.reference_warnings)):
                self.stdout.write(f"- {warning}")
