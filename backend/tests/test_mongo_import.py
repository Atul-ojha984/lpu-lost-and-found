"""Safety, mapping, and idempotence tests for the legacy Mongo migration."""

import io
import os
from datetime import datetime, timezone

import bcrypt
import pytest
from bson import ObjectId, json_util
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.models import AuditEntry, Notification
from apps.claims.models import Claim, ClaimChallengeAnswer
from apps.core.crypto import decrypt_field
from apps.custody.models import CustodyRecord
from apps.disposal.models import DisposalRecord
from apps.handovers.models import Handover
from apps.items.models import Item, ItemCategory
from apps.locations.models import Location
from apps.matching.models import MatchSuggestion
from apps.verification.models import PrivateDetail, VerificationChallenge

SOURCE_KEY = "a" * 64
PASSWORD = "ImportedBcryptPassword@123"
OTP = "314159"


def _oid(number):
    return ObjectId(f"64e819b21f3a2b100100{number:04x}")


def _source_encrypt(plaintext):
    iv = os.urandom(12)
    encrypted = AESGCM(bytes.fromhex(SOURCE_KEY)).encrypt(iv, plaintext.encode(), None)
    return {"ciphertext": encrypted[:-16].hex(), "iv": iv.hex(), "tag": encrypted[-16:].hex()}


def _timestamps():
    value = datetime(2026, 10, 15, 9, 30, tzinfo=timezone.utc)
    return {"createdAt": value, "updatedAt": value}


def _fixture_data():
    category, location, student, security = (_oid(i) for i in range(1, 5))
    found, lost, disposed = (_oid(i) for i in range(5, 8))
    private, challenge, claim = (_oid(i) for i in range(8, 11))
    match, custody, handover, disposal, audit, answer = (_oid(i) for i in range(11, 17))
    password_hash = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(rounds=4)).decode()
    challenge_hash = bcrypt.hashpw(b"blue", bcrypt.gensalt(rounds=4)).decode()
    otp_hash = bcrypt.hashpw(OTP.encode(), bcrypt.gensalt(rounds=4)).decode()
    private_payload = _source_encrypt("private serial details")
    encrypted_otp = _source_encrypt(OTP)

    def item(item_id, reference, kind, title, reporter, status, locker=""):
        return {
            "_id": item_id, "referenceNumber": reference, "itemType": kind,
            "title": title, "publicDescription": f"Public details for {title}",
            "category": category, "location": location, "specificLocation": "Campus library",
            "eventDate": datetime(2026, 10, 15, 8, 0, tzinfo=timezone.utc),
            "primaryImageUrl": "https://images.example.test/item.jpg", "additionalImages": [],
            "status": status, "reportedBy": reporter, "currentCustodyDesk": "Security Office",
            "lockerStorageReference": locker,
            "retentionExpiresAt": datetime(2027, 1, 13, 8, 0, tzinfo=timezone.utc),
            "isArchived": False, **_timestamps(),
        }

    return {
        "itemcategories": [{"_id": category, "code": "DOCUMENTS_BOOKS", "name": "Documents and Books",
            "description": "University materials", "icon": "book", "isActive": True,
            "defaultRetentionDays": 90, **_timestamps()}],
        "locations": [{"_id": location, "code": "LIBRARY", "name": "University Library",
            "campusZone": "MAIN_CAMPUS", "buildingName": "Library", "hasSecurityDesk": True,
            "securityContactPhone": "9876543210", "isActive": True, **_timestamps()}],
        "users": [
            {"_id": student, "registrationNumber": "12009988", "email": "student.mongo@lpu.in",
             "fullName": "Migration Test Student", "passwordHash": password_hash,
             "role": "STUDENT_STAFF", "department": "Computer Science", "phone": "9876543210",
             "isActive": True, **_timestamps()},
            {"_id": security, "registrationNumber": "SEC-1001", "email": "security.mongo@lpu.in",
             "fullName": "Migration Test Security Officer", "passwordHash": password_hash,
             "role": "SECURITY_PERSONNEL", "securityPost": "Main Gate", "isActive": True,
             **_timestamps()},
        ],
        "items": [
            item(found, "LPU-2026-F00001", "FOUND", "Found Phone", security, "HANDED_OVER", "R-1"),
            item(lost, "LPU-2026-L00002", "LOST", "Lost Phone", student, "REPORTED"),
            item(disposed, "LPU-2026-F00003", "FOUND", "Disposed Notebook", security, "DISPOSED"),
        ],
        "privatedetails": [{"_id": private, "item": found,
            "encryptedCiphertext": private_payload["ciphertext"], "iv": private_payload["iv"],
            "authTag": private_payload["tag"], "fieldsSummary": ["serial_number"],
            "lastDecryptedBy": security, "lastDecryptedAt": datetime(2026, 10, 16, 9, 0, tzinfo=timezone.utc),
            "accessCount": 2, **_timestamps()}],
        "verificationchallenges": [{"_id": challenge, "item": found,
            "questionText": "What color is the case?", "hashedAnswer": challenge_hash,
            "hint": "A basic color", "maxAttempts": 3,
            "expiresAt": datetime(2026, 11, 1, tzinfo=timezone.utc), "isActive": True, **_timestamps()}],
        "claims": [{"_id": claim, "item": found, "claimant": student, "claimStatus": "COMPLETED",
            "statement": "This is my phone.", "challengeAnswers": [{"_id": answer, "challenge": challenge,
                "providedAnswer": "blue", "isCorrect": True}], "privateEvidenceProofUrls": [],
            "reviewedBy": security, "reviewedAt": datetime(2026, 10, 16, 10, 0, tzinfo=timezone.utc),
            "reviewNotes": "Verified", "rejectionReason": "", "handoverOtp": OTP,
            "handoverOtpCipher": encrypted_otp["ciphertext"], "handoverOtpIv": encrypted_otp["iv"],
            "handoverOtpTag": encrypted_otp["tag"],
            "handoverOtpExpiresAt": datetime(2026, 10, 18, 10, 0, tzinfo=timezone.utc),
            "verificationAttemptsCount": 0, "handoverRecord": handover, **_timestamps()}],
        "matchsuggestions": [{"_id": match, "lostItem": lost, "foundItem": found,
            "matchScore": 88.5, "confidence": "HIGH", "explanation": {"categoryMatch": "same",
            "locationProximity": "nearby", "timeDelta": "same day", "matchingTokens": ["phone"]},
            "status": "PENDING", **_timestamps()}],
        "custodyrecords": [{"_id": custody, "item": found, "action": "HANDED_OVER",
            "fromLocation": "Main Store", "toLocation": "Security Office", "lockerReference": "R-1",
            "evidenceReference": "CUST-001", "handledBy": security, "remarks": "Property released",
            "timestamp": datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)}],
        "handovers": [{"_id": handover, "item": found, "claim": claim, "recipient": student,
            "supervisingOfficer": security, "otpHash": otp_hash,
            "otpExpiresAt": datetime(2026, 10, 18, 10, 0, tzinfo=timezone.utc), "otpAttemptsCount": 0,
            "physicalDeskLocation": "Security Office", "idCardPresentedType": "LPU STUDENT ID",
            "idCardNumberMasked": "********988", "recipientSignatureUrl": "",
            "acknowledgementNotes": "Completed", "proofEvidenceUrl": "", "isCompleted": True,
            "completedAt": datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc), **_timestamps()}],
        "disposalrecords": [{"_id": disposal, "item": disposed, "method": "DONATION",
            "approvedBy": security, "committeeNotes": "Approved by committee", "reason": "Expired",
            "recipientOrganization": "Campus charity", "disposalDate": datetime(2026, 10, 20, tzinfo=timezone.utc),
            "certificateUrl": "", "evidenceReference": "DISP-001", **_timestamps()}],
        "auditentries": [{"_id": audit, "actor": security, "actorRole": "SECURITY_PERSONNEL",
            "action": "HANDOVER_EXECUTE", "targetEntity": "Handover", "targetId": str(handover),
            "ipAddress": "127.0.0.1", "userAgent": "migration-test",
            "metadata": {"otp": OTP, "safe": "completed"},
            "timestamp": datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)}],
    }


def _write_extended_json(directory, data):
    directory.mkdir()
    for collection, documents in data.items():
        (directory / f"{collection}.json").write_text(json_util.dumps(documents), encoding="utf-8")


@pytest.mark.django_db(transaction=True)
def test_dry_run_rolls_back_extended_json_and_reports_counts(tmp_path, monkeypatch):
    monkeypatch.setenv("MONGO_FIELD_ENCRYPTION_KEY", SOURCE_KEY)
    export_dir = tmp_path / "mongo-export"
    _write_extended_json(export_dir, _fixture_data())
    output = io.StringIO()

    call_command("import_mongo_data", input_dir=export_dir, dry_run=True, stdout=output)

    assert "Dry run completed" in output.getvalue()
    assert "privatedetails: 1" in output.getvalue()
    assert "claim_challenge_answers: 1" in output.getvalue()
    assert not User.objects.exists()
    assert not Item.objects.exists()
    assert not AuditEntry.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_matching_seed_categories_and_locations_are_reused_without_overwrite(tmp_path, monkeypatch):
    monkeypatch.setenv("MONGO_FIELD_ENCRYPTION_KEY", SOURCE_KEY)
    category = ItemCategory.objects.create(
        code="DOCUMENTS_BOOKS",
        name="Documents and Books",
        description="University materials",
        icon="book",
        is_active=True,
        default_retention_days=90,
    )
    location = Location.objects.create(
        code="LIBRARY",
        name="University Library",
        campus_zone="MAIN_CAMPUS",
        building_name="Library",
        has_security_desk=True,
        security_contact_phone="9876543210",
        is_active=True,
    )
    original_category_name = category.name
    original_location_name = location.name
    export_dir = tmp_path / "mongo-export"
    _write_extended_json(export_dir, _fixture_data())
    output = io.StringIO()

    call_command("import_mongo_data", input_dir=export_dir, do_import=True, stdout=output)

    assert Item.objects.get(reference_number="LPU-2026-L00002").category_id == category.pk
    assert Item.objects.get(reference_number="LPU-2026-L00002").location_id == location.pk
    assert ItemCategory.objects.get(pk=category.pk).name == original_category_name
    assert Location.objects.get(pk=location.pk).name == original_location_name
    assert "matched_existing=1" in output.getvalue()


@pytest.mark.django_db(transaction=True)
def test_conflicting_reference_seed_is_rejected_and_rolled_back(tmp_path, monkeypatch):
    monkeypatch.setenv("MONGO_FIELD_ENCRYPTION_KEY", SOURCE_KEY)
    ItemCategory.objects.create(
        code="DOCUMENTS_BOOKS",
        name="Conflicting category name",
        description="University materials",
        icon="book",
        is_active=True,
        default_retention_days=90,
    )
    export_dir = tmp_path / "mongo-export"
    _write_extended_json(export_dir, _fixture_data())

    with pytest.raises(CommandError, match="destination reference record conflicts"):
        call_command("import_mongo_data", input_dir=export_dir, do_import=True)

    assert not User.objects.exists()
    assert not Item.objects.exists()
    assert ItemCategory.objects.count() == 1


@pytest.mark.django_db(transaction=True)
def test_explicit_reference_reuse_preserves_destination_configuration(tmp_path, monkeypatch):
    monkeypatch.setenv("MONGO_FIELD_ENCRYPTION_KEY", SOURCE_KEY)
    category = ItemCategory.objects.create(
        code="DOCUMENTS_BOOKS",
        name="Documents and Books",
        description="University materials",
        icon="book",
        is_active=True,
        default_retention_days=30,
    )
    export_dir = tmp_path / "mongo-export"
    _write_extended_json(export_dir, _fixture_data())
    output = io.StringIO()

    call_command(
        "import_mongo_data",
        input_dir=export_dir,
        do_import=True,
        reuse_existing_references=True,
        stdout=output,
    )

    category.refresh_from_db()
    assert category.default_retention_days == 30
    assert Item.objects.get(reference_number="LPU-2026-L00002").category_id == category.pk
    assert "reference_conflicts_preserved=1" in output.getvalue()
    assert "itemcategories: default_retention_days" in output.getvalue()


@pytest.mark.django_db(transaction=True)
def test_import_maps_all_collections_reencrypts_and_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setenv("MONGO_FIELD_ENCRYPTION_KEY", SOURCE_KEY)
    export_dir = tmp_path / "mongo-export"
    _write_extended_json(export_dir, _fixture_data())
    call_command("import_mongo_data", input_dir=export_dir, do_import=True)

    assert User.objects.count() == 2
    assert ItemCategory.objects.count() == 1
    assert Location.objects.count() == 1
    assert Item.objects.count() == 3
    assert PrivateDetail.objects.count() == VerificationChallenge.objects.count() == 1
    assert Claim.objects.count() == ClaimChallengeAnswer.objects.count() == 1
    assert MatchSuggestion.objects.count() == CustodyRecord.objects.count() == 1
    assert Handover.objects.count() == DisposalRecord.objects.count() == AuditEntry.objects.count() == 1

    user = User.objects.get(registration_number="12009988")
    assert user.password.startswith("bcrypt$$2")
    response = APIClient().post("/api/v1/auth/login/", {
        "emailOrRegNo": "12009988", "password": PASSWORD,
    }, format="json")
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.password.startswith("bcrypt_sha256$")

    detail = PrivateDetail.objects.get(item__reference_number="LPU-2026-F00001")
    assert decrypt_field(detail.encrypted_ciphertext, detail.iv, detail.auth_tag) == "private serial details"
    claim = Claim.objects.get()
    assert claim.handover_otp == ""  # Legacy raw OTP must not be copied.
    assert decrypt_field(claim.handover_otp_cipher, claim.handover_otp_iv, claim.handover_otp_tag) == OTP
    assert Handover.objects.get().verify_otp(OTP)
    assert AuditEntry.objects.get().metadata["otp"] == "[REDACTED]"
    assert not Notification.objects.exists()
    assert Item.objects.get(reference_number="LPU-2026-F00001").locker_storage_reference == "R-1"

    category = ItemCategory.objects.get()
    category.name = "Reviewed by administrator"
    category.save()
    output = io.StringIO()
    call_command("import_mongo_data", input_dir=export_dir, do_import=True, stdout=output)
    category.refresh_from_db()
    assert category.name == "Reviewed by administrator"
    assert ItemCategory.objects.count() == 1
    assert "already_imported=1" in output.getvalue()


@pytest.mark.django_db(transaction=True)
def test_unsupported_password_hash_rolls_back_everything(tmp_path, monkeypatch):
    monkeypatch.setenv("MONGO_FIELD_ENCRYPTION_KEY", SOURCE_KEY)
    data = _fixture_data()
    data["users"][0]["passwordHash"] = "plaintext-is-not-accepted"
    export_dir = tmp_path / "mongo-export"
    _write_extended_json(export_dir, data)

    with pytest.raises(CommandError, match="unsupported password-hash format"):
        call_command("import_mongo_data", input_dir=export_dir, do_import=True)
    assert not User.objects.exists()
    assert not ItemCategory.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_encrypted_import_requires_source_key(tmp_path, monkeypatch):
    monkeypatch.delenv("MONGO_FIELD_ENCRYPTION_KEY", raising=False)
    export_dir = tmp_path / "mongo-export"
    _write_extended_json(export_dir, _fixture_data())
    with pytest.raises(CommandError, match="MONGO_FIELD_ENCRYPTION_KEY"):
        call_command("import_mongo_data", input_dir=export_dir, dry_run=True)
    assert not User.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_production_import_requires_explicit_guard_flags(tmp_path, monkeypatch):
    monkeypatch.setenv("MONGO_FIELD_ENCRYPTION_KEY", SOURCE_KEY)
    export_dir = tmp_path / "mongo-export"
    _write_extended_json(export_dir, _fixture_data())
    with override_settings(IS_PRODUCTION=True):
        with pytest.raises(CommandError, match="Production/PostgreSQL writes are disabled"):
            call_command("import_mongo_data", input_dir=export_dir, do_import=True)
    assert not User.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_postgresql_destination_requires_explicit_production_confirmation(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "apps.core.management.commands.import_mongo_data.connection.vendor",
        "postgresql",
    )
    with override_settings(IS_PRODUCTION=False):
        with pytest.raises(CommandError, match="Production/PostgreSQL writes are disabled"):
            call_command("import_mongo_data", input_dir=tmp_path, do_import=True)


@pytest.mark.django_db(transaction=True)
def test_incomplete_export_is_rejected(tmp_path):
    export_dir = tmp_path / "mongo-export"
    export_dir.mkdir()
    (export_dir / "users.json").write_text("[]", encoding="utf-8")
    with pytest.raises(CommandError, match="export is incomplete"):
        call_command("import_mongo_data", input_dir=export_dir, dry_run=True)


@pytest.mark.django_db(transaction=True)
def test_unresolved_source_relationship_is_reported_before_any_import(tmp_path, monkeypatch):
    monkeypatch.setenv("MONGO_FIELD_ENCRYPTION_KEY", SOURCE_KEY)
    data = _fixture_data()
    orphan = dict(data["verificationchallenges"][0])
    orphan["_id"] = _oid(999)
    orphan["item"] = _oid(998)
    data["verificationchallenges"].append(orphan)
    export_dir = tmp_path / "mongo-export"
    _write_extended_json(export_dir, data)

    with pytest.raises(CommandError, match="unresolved relationship"):
        call_command("import_mongo_data", input_dir=export_dir, dry_run=True)

    assert not User.objects.exists()
    assert not Item.objects.exists()
