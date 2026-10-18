"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Test Suite: Claims & Handover APIs, Challenge Verification & Duplicate Guard
==============================================================================
"""

import pytest
from datetime import datetime, timezone, timedelta
from rest_framework.test import APIClient
from rest_framework import status

from apps.accounts.models import User, UserRole
from apps.items.models import ItemCategory, Item, ItemType, ItemStatus
from apps.locations.models import Location
from apps.verification.models import VerificationChallenge
from apps.claims.models import Claim, ClaimStatus, ClaimChallengeAnswer
from apps.handovers.models import Handover
from apps.custody.models import CustodyRecord, CustodyAction
from apps.audit.models import AuditEntry, AuditAction

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def workflow_setup(db):
    reporter = User.objects.create_user(
        email='finder@lpu.in',
        registration_number='12102001',
        full_name='Finder Rohit',
        password='Password123!',
        role=UserRole.STUDENT_STAFF,
    )
    claimant1 = User.objects.create_user(
        email='claimant1@lpu.in',
        registration_number='12102002',
        full_name='Claimant Suresh',
        password='Password123!',
        role=UserRole.STUDENT_STAFF,
    )
    claimant2 = User.objects.create_user(
        email='claimant2@lpu.in',
        registration_number='12102003',
        full_name='Claimant Meena',
        password='Password123!',
        role=UserRole.STUDENT_STAFF,
    )
    security_officer = User.objects.create_user(
        email='officer.singh@lpu.in',
        registration_number='SEC9002',
        full_name='Officer Gurpreet Singh',
        password='Password123!',
        role=UserRole.SECURITY_PERSONNEL,
        security_post='Central Gate 1 Desk',
    )
    campus_admin = User.objects.create_user(
        email='admin.sharma@lpu.in',
        registration_number='ADM1002',
        full_name='Admin Sunita Sharma',
        password='Password123!',
        role=UserRole.CAMPUS_ADMIN,
    )

    category = ItemCategory.objects.create(code='GADGETS', name='Gadgets', default_retention_days=90)
    location = Location.objects.create(code='LIBRARY_CENTRAL', name='Central Library', campus_zone='CENTRAL_CAMPUS')

    now = datetime.now(timezone.utc)
    found_item = Item.objects.create(
        reference_number='LPU-F-20261018-7777',
        item_type=ItemType.FOUND,
        title='Titan Black Leather Strap Watch',
        category=category,
        location=location,
        specific_location='Reading Room Table 4',
        event_date=now - timedelta(days=1),
        public_description='Men classic black watch with leather strap',
        status=ItemStatus.IN_CUSTODY,
        current_custody_desk='Central Security Desk',
        reported_by=reporter,
        retention_expires_at=now + timedelta(days=90),
    )

    challenge = VerificationChallenge(
        item=found_item,
        question_text='What is engraved on the back of the dial?',
    )
    challenge.set_answer('Class of 2024')
    challenge.save()

    return {
        'reporter': reporter,
        'claimant1': claimant1,
        'claimant2': claimant2,
        'security_officer': security_officer,
        'campus_admin': campus_admin,
        'found_item': found_item,
        'challenge': challenge,
    }

@pytest.mark.django_db
def test_claim_submission_and_challenge_answering(api_client, workflow_setup):
    """Test claim submission, challenge requirements, and answer attempt tracking."""
    api_client.force_authenticate(user=workflow_setup['claimant1'])

    item = workflow_setup['found_item']
    payload = {
        'itemId': str(item.id),
        'statement': 'I forgot my Titan watch in the Central Library reading room yesterday.',
        'evidenceDetails': 'Back of the dial has my graduation year engraved.',
    }

    # 1. Submit claim on item with active challenges
    res = api_client.post('/api/v1/claims/', payload, format='json')
    assert res.status_code == status.HTTP_201_CREATED
    claim_id = res.data['id']
    assert res.data['claimStatus'] == ClaimStatus.CHALLENGE_REQUIRED

    claim = Claim.objects.get(pk=claim_id)
    assert claim.claim_status == ClaimStatus.CHALLENGE_REQUIRED

    # 2. Answer challenge with incorrect answer
    challenge = workflow_setup['challenge']
    res = api_client.post(
        f"/api/v1/claims/{claim_id}/challenges/{challenge.id}/answer/",
        {'answer': 'Wrong Engraving'},
        format='json'
    )
    assert res.status_code == status.HTTP_200_OK
    assert res.data['isCorrect'] is False
    assert res.data['remainingAttempts'] == 2

    # 3. Answer challenge with correct answer
    res = api_client.post(
        f"/api/v1/claims/{claim_id}/challenges/{challenge.id}/answer/",
        {'answer': 'Class of 2024'},
        format='json'
    )
    assert res.status_code == status.HTTP_200_OK
    assert res.data['isCorrect'] is True

    claim.refresh_from_db()
    assert claim.claim_status == ClaimStatus.UNDER_REVIEW

@pytest.mark.django_db
def test_anti_self_approval_guard(api_client, workflow_setup):
    """Ensure a reporter or claimant cannot approve their own claim."""
    item = workflow_setup['found_item']
    reporter = workflow_setup['reporter']

    # Make reporter also a security officer for testing self-approval guard
    reporter.role = UserRole.SECURITY_PERSONNEL
    reporter.save()

    claim = Claim.objects.create(
        item=item,
        claimant=reporter,
        statement='I found it but actually it is mine.',
        claim_status=ClaimStatus.UNDER_REVIEW,
    )

    api_client.force_authenticate(user=reporter)
    res = api_client.post(
        f"/api/v1/claims/{claim.id}/review/",
        {'action': 'APPROVE', 'reviewNotes': 'Approving my own property claim'},
        format='json'
    )
    assert res.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN)
    assert 'SELF_APPROVAL' in str(res.data) or 'own' in str(res.data).lower()

@pytest.mark.django_db
def test_claim_approval_and_competing_claim_resolution(api_client, workflow_setup):
    """Approving one claim resolves competing claims and issues 6-digit handover OTP."""
    item = workflow_setup['found_item']
    claim1 = Claim.objects.create(
        item=item,
        claimant=workflow_setup['claimant1'],
        statement='Valid rightful owner claim',
        claim_status=ClaimStatus.UNDER_REVIEW,
    )
    claim2 = Claim.objects.create(
        item=item,
        claimant=workflow_setup['claimant2'],
        statement='Competing unverified claim',
        claim_status=ClaimStatus.UNDER_REVIEW,
    )

    api_client.force_authenticate(user=workflow_setup['security_officer'])
    res = api_client.post(
        f"/api/v1/claims/{claim1.id}/review/",
        {'action': 'APPROVE', 'reviewNotes': 'Presented purchase bill and photo match.'},
        format='json'
    )
    assert res.status_code == status.HTTP_200_OK
    assert 'handoverOtp' in res.data
    issued_otp = res.data['handoverOtp']
    assert len(issued_otp) == 6
    assert issued_otp.isdigit()

    claim1.refresh_from_db()
    claim2.refresh_from_db()
    item.refresh_from_db()

    assert claim1.claim_status == ClaimStatus.APPROVED
    assert claim2.claim_status == ClaimStatus.REJECTED
    assert 'competing' in claim2.rejection_reason.lower()
    assert item.status == ItemStatus.READY_FOR_HANDOVER

    # Handover record created
    handover = Handover.objects.filter(claim=claim1).first()
    assert handover is not None
    assert handover.is_completed is False

@pytest.mark.django_db
def test_supervised_handover_and_duplicate_prevention(api_client, workflow_setup):
    """Verify supervised physical property release via OTP and strict duplicate handover guard."""
    item = workflow_setup['found_item']
    claimant = workflow_setup['claimant1']
    officer = workflow_setup['security_officer']

    claim = Claim.objects.create(
        item=item,
        claimant=claimant,
        statement='Valid claim',
        claim_status=ClaimStatus.APPROVED,
        handover_otp='849201',
    )
    item.status = ItemStatus.READY_FOR_HANDOVER
    item.save()

    handover = Handover(
        item=item,
        claim=claim,
        recipient=claimant,
        supervising_officer=officer,
        otp_expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    handover.set_otp('849201')
    handover.save()

    api_client.force_authenticate(user=officer)

    # 1. Incorrect OTP attempt
    res = api_client.post(
        '/api/v1/handovers/verify-otp/',
        {
            'claimId': str(claim.id),
            'otp': '000000',
            'physicalDeskLocation': 'Central Security Desk',
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': 'REG-12102002',
        },
        format='json'
    )
    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert 'INVALID_OTP' in str(res.data)

    handover.refresh_from_db()
    assert handover.otp_attempts_count == 1

    # 2. Correct OTP attempt
    res = api_client.post(
        '/api/v1/handovers/verify-otp/',
        {
            'claimId': str(claim.id),
            'otp': '849201',
            'physicalDeskLocation': 'Central Security Desk',
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': 'REG-12102002',
            'acknowledgementNotes': 'Verified physical ID card in person.',
        },
        format='json'
    )
    assert res.status_code == status.HTTP_200_OK

    claim.refresh_from_db()
    item.refresh_from_db()
    handover.refresh_from_db()

    assert claim.claim_status == ClaimStatus.COMPLETED
    assert item.status == ItemStatus.HANDED_OVER
    assert handover.is_completed is True

    # Check custody history appended
    custody_rec = CustodyRecord.objects.filter(item=item, action=CustodyAction.HANDED_OVER).first()
    assert custody_rec is not None
    assert custody_rec.handled_by == officer

    # 3. Duplicate Handover Guard
    res_dup = api_client.post(
        '/api/v1/handovers/verify-otp/',
        {
            'claimId': str(claim.id),
            'otp': '849201',
            'physicalDeskLocation': 'Central Security Desk',
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': 'REG-12102002',
        },
        format='json'
    )
    assert res_dup.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_409_CONFLICT)
    assert 'DUPLICATE_HANDOVER' in str(res_dup.data)
