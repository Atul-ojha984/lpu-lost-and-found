"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Phase 2 Test Suite: Models, Relational Integrity & Database Constraints
==============================================================================
"""

import pytest
from datetime import datetime, timezone, timedelta
from django.db import IntegrityError
from apps.accounts.models import User, UserRole
from apps.locations.models import Location
from apps.items.models import ItemCategory, Item, ItemType, ItemStatus
from apps.verification.models import PrivateDetail, VerificationChallenge
from apps.claims.models import Claim, ClaimChallengeAnswer, ClaimStatus
from apps.matching.models import MatchSuggestion, MatchConfidence, MatchStatus
from apps.custody.models import CustodyRecord, CustodyAction
from apps.handovers.models import Handover
from apps.disposal.models import DisposalRecord, DisposalMethod
from apps.audit.models import AuditEntry, AuditAction

@pytest.fixture
def test_setup():
    """Seed foundational test users, location, and category."""
    reporter = User.objects.create_user(
        email='reporter.student@lpu.in',
        registration_number='12109901',
        full_name='Simran Kaur',
        password='Password@123',
        role=UserRole.STUDENT_STAFF,
    )
    claimant = User.objects.create_user(
        email='claimant.student@lpu.in',
        registration_number='12109902',
        full_name='Rahul Verma',
        password='Password@123',
        role=UserRole.STUDENT_STAFF,
    )
    security_officer = User.objects.create_user(
        email='security.officer@lpu.in',
        registration_number='SEC9002',
        full_name='Inspector Baldev Singh',
        password='Password@123',
        role=UserRole.SECURITY_PERSONNEL,
        security_post='Block 34 Security Desk',
    )
    admin = User.objects.create_user(
        email='campus.admin@lpu.in',
        registration_number='ADM9001',
        full_name='Dr. Manpreet Kaur',
        password='Password@123',
        role=UserRole.CAMPUS_ADMIN,
    )

    category = ItemCategory.objects.create(
        code='ELECTRONICS',
        name='Electronics & Gadgets',
        default_retention_days=90,
    )
    location = Location.objects.create(
        code='CENTRAL_LIBRARY',
        name='Central Library Ground Floor',
        campus_zone='BLOCK_30_38',
        has_security_desk=True,
    )

    item = Item.objects.create(
        reference_number='LPU-2026-F10001',
        item_type=ItemType.FOUND,
        title='MacBook Air M2 Silver',
        public_description='Silver MacBook Air in black neoprene sleeve found on 2nd floor desk.',
        category=category,
        location=location,
        specific_location='Study Desk 42, 2nd Floor',
        event_date=datetime.now(timezone.utc),
        reported_by=reporter,
        retention_expires_at=datetime.now(timezone.utc) + timedelta(days=90),
    )

    return {
        'reporter': reporter,
        'claimant': claimant,
        'security_officer': security_officer,
        'admin': admin,
        'category': category,
        'location': location,
        'item': item,
    }

@pytest.mark.django_db
class TestModelConstraintsSuite:
    """Automated tests validating ORM relationships, constraints, and field encryption."""

    def test_private_detail_encryption_and_uniqueness(self, test_setup):
        """PrivateDetail encrypts secrets with AES-256-GCM and enforces 1-to-1 relationship."""
        item = test_setup['item']
        officer = test_setup['security_officer']

        secret_data = {'serialNumber': 'C02G89XYMD6R', 'appleId': 'rahul.v@icloud.com'}
        vault = PrivateDetail.objects.create(
            item=item,
            encrypted_ciphertext='',
            iv='',
            auth_tag='',
            fields_summary=['serialNumber', 'appleId'],
        )
        vault.set_secret_payload(secret_data)
        vault.save()

        # Database record inspection: secrets must NOT be in plaintext
        vault.refresh_from_db()
        assert 'C02G89XYMD6R' not in vault.encrypted_ciphertext
        assert len(vault.iv) == 24
        assert len(vault.auth_tag) == 32

        # Decryption inspection
        decrypted = vault.get_decrypted_payload()
        assert 'C02G89XYMD6R' in decrypted

        # Constraint enforcement: second PrivateDetail for same item must fail
        with pytest.raises(IntegrityError):
            PrivateDetail.objects.create(
                item=item,
                encrypted_ciphertext='duplicate',
                iv='0' * 24,
                auth_tag='0' * 32,
            )

    def test_verification_challenge_hashing(self, test_setup):
        """Verification challenge answers must be hashed and never stored in plaintext."""
        item = test_setup['item']
        challenge = VerificationChallenge(
            item=item,
            question_text='What is the sticker on the back of the laptop lid?',
        )
        raw_answer = "GitHub Octocat Sticker"
        challenge.set_answer(raw_answer)
        challenge.save()

        challenge.refresh_from_db()
        assert raw_answer not in challenge.hashed_answer
        assert challenge.check_answer("github octocat sticker") is True
        assert challenge.check_answer("Wrong Sticker") is False

    def test_claim_unique_active_constraint(self, test_setup):
        """Claimant cannot file multiple active claims for the same item."""
        item = test_setup['item']
        claimant = test_setup['claimant']

        # 1. Create first active claim
        Claim.objects.create(
            item=item,
            claimant=claimant,
            statement='This is my MacBook Air that I forgot at study desk 42.',
            claim_status=ClaimStatus.SUBMITTED,
        )

        # 2. Duplicate active claim must raise IntegrityError
        with pytest.raises(IntegrityError):
            Claim.objects.create(
                item=item,
                claimant=claimant,
                statement='Filing a second claim by mistake.',
                claim_status=ClaimStatus.SUBMITTED,
            )

    def test_match_suggestion_unique_pair_constraint(self, test_setup):
        """MatchSuggestion enforces unique pair constraint between lost and found items."""
        found_item = test_setup['item']
        reporter = test_setup['reporter']
        category = test_setup['category']
        location = test_setup['location']

        lost_item = Item.objects.create(
            reference_number='LPU-2026-L10002',
            item_type=ItemType.LOST,
            title='Lost Silver MacBook Air',
            public_description='Lost my silver MacBook Air near library.',
            category=category,
            location=location,
            specific_location='2nd Floor Desk',
            event_date=datetime.now(timezone.utc),
            reported_by=reporter,
            retention_expires_at=datetime.now(timezone.utc) + timedelta(days=90),
        )

        MatchSuggestion.objects.create(
            lost_item=lost_item,
            found_item=found_item,
            match_score=94.5,
            confidence=MatchConfidence.HIGH,
            explanation={'categoryMatch': 'Exact (Electronics)', 'timeDelta': '15 mins'},
        )

        # Duplicate match suggestion pair must raise IntegrityError
        with pytest.raises(IntegrityError):
            MatchSuggestion.objects.create(
                lost_item=lost_item,
                found_item=found_item,
                match_score=90.0,
                confidence=MatchConfidence.HIGH,
                explanation={'categoryMatch': 'Exact'},
            )

    def test_custody_timeline_ordering(self, test_setup):
        """Custody records form an append-only timeline ordered by timestamp descending."""
        item = test_setup['item']
        officer = test_setup['security_officer']
        first_timestamp = datetime.now(timezone.utc)

        r1 = CustodyRecord.objects.create(
            item=item,
            action=CustodyAction.INITIAL_INTAKE,
            to_location='Block 34 Security Desk',
            handled_by=officer,
            remarks='Intake from finder',
            timestamp=first_timestamp,
        )
        r2 = CustodyRecord.objects.create(
            item=item,
            action=CustodyAction.STORED_IN_LOCKER,
            from_location='Block 34 Security Desk',
            to_location='Central Strongroom Locker 14B',
            handled_by=officer,
            remarks='Secured in strongroom locker',
            timestamp=first_timestamp + timedelta(seconds=1),
        )

        records = list(CustodyRecord.objects.filter(item=item))
        assert len(records) == 2
        # Ordered by -timestamp
        assert records[0].action == CustodyAction.STORED_IN_LOCKER
        assert records[1].action == CustodyAction.INITIAL_INTAKE

    def test_handover_otp_and_uniqueness(self, test_setup):
        """Handover securely hashes OTP and prevents duplicate completed handovers on an item."""
        item = test_setup['item']
        claimant = test_setup['claimant']
        officer = test_setup['security_officer']

        claim = Claim.objects.create(
            item=item,
            claimant=claimant,
            statement='MacBook claim',
            claim_status=ClaimStatus.APPROVED,
        )

        handover = Handover(
            item=item,
            claim=claim,
            recipient=claimant,
            supervising_officer=officer,
            otp_expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
            physical_desk_location='Main Security Desk Gate 1',
            id_card_presented_type='STUDENT_ID_CARD',
            id_card_number_masked='1210****',
            is_completed=True,
            completed_at=datetime.now(timezone.utc),
        )
        handover.set_otp('491823')
        handover.save()

        handover.refresh_from_db()
        assert '491823' not in handover.otp_hash
        assert handover.verify_otp('491823') is True
        assert handover.verify_otp('000000') is False

        # Constraint: Cannot have another completed handover on the same item!
        with pytest.raises(IntegrityError):
            h2 = Handover(
                item=item,
                claim=claim,
                recipient=claimant,
                supervising_officer=officer,
                otp_expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
                physical_desk_location='Desk B',
                id_card_presented_type='ID',
                id_card_number_masked='****',
                is_completed=True,
            )
            h2.set_otp('123456')
            h2.save()

    def test_disposal_record_creation(self, test_setup):
        """Disposal record requires item and administrator authorization."""
        item = test_setup['item']
        admin = test_setup['admin']

        disp = DisposalRecord.objects.create(
            item=item,
            method=DisposalMethod.DONATION,
            approved_by=admin,
            committee_notes='Approved by Campus Property Disposal Board under Rule 26.4',
            recipient_organization='LPU Rural Education Initiative',
        )
        assert disp.id is not None
        assert disp.method == DisposalMethod.DONATION
        assert disp.approved_by == admin

    def test_audit_entry_logging(self, test_setup):
        """AuditEntry records actor, action, and target metadata."""
        officer = test_setup['security_officer']
        item = test_setup['item']

        entry = AuditEntry.objects.create(
            actor=officer,
            actor_role=officer.role,
            action=AuditAction.CUSTODY_TRANSFER,
            target_entity='Item',
            target_id=str(item.id),
            ip_address='10.20.30.40',
            metadata={'from': 'Desk 1', 'to': 'Locker 5'},
        )
        assert entry.id is not None
        assert entry.action == AuditAction.CUSTODY_TRANSFER
        assert entry.actor == officer
