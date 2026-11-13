"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Test Suite: Claims & Handover APIs, Challenge Verification & Duplicate Guard
==============================================================================
"""

import logging
import pytest
from datetime import datetime, timezone, timedelta
from django.db import connection
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User, UserRole
from apps.items.models import ItemCategory, Item, ItemType, ItemStatus
from apps.locations.models import Location
from apps.verification.models import VerificationChallenge
from apps.claims.models import Claim, ClaimStatus, ClaimChallengeAnswer
from apps.handovers.models import Handover
from apps.handovers.models import DirectRecovery, DirectRecoveryStatus
from apps.custody.models import CustodyRecord, CustodyAction, CustodyLocation, Locker
from apps.verification.models import PrivateDetail
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.audit.models import AuditEntry, AuditAction
from django.utils import timezone as django_timezone
from django.utils.dateparse import parse_datetime

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
def test_item_reporter_cannot_approve_but_independent_security_officer_can(api_client, workflow_setup):
    """The reporter is blocked while a different security officer can review the same claim."""
    item = workflow_setup['found_item']
    reporter = workflow_setup['reporter']

    # The original reporter remains linked to the item even when they hold a
    # security role; the role change must not let them adjudicate their report.
    reporter.role = UserRole.SECURITY_PERSONNEL
    reporter.save()

    claim = Claim.objects.create(
        item=item,
        claimant=workflow_setup['claimant1'],
        statement='Valid claimant with ownership evidence.',
        claim_status=ClaimStatus.UNDER_REVIEW,
    )

    api_client.force_authenticate(user=reporter)
    res = api_client.patch(
        f"/api/v1/claims/{claim.id}/review/",
        {'action': 'APPROVE', 'reviewNotes': 'Review by original reporter'},
        format='json'
    )
    assert res.status_code == status.HTTP_403_FORBIDDEN
    assert 'originally reported' in str(res.data).lower()
    claim.refresh_from_db()
    assert claim.claim_status == ClaimStatus.UNDER_REVIEW
    assert not claim.handover_otp
    assert not Handover.objects.filter(claim=claim).exists()

    # A separate authorized officer can adjudicate without changing reporter
    # or claimant relationships.
    independent_officer = workflow_setup['security_officer']
    access_token = AccessToken.for_user(independent_officer)
    assert access_token['userId'] == str(independent_officer.id)
    api_client.force_authenticate(user=None)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
    res = api_client.patch(
        f"/api/v1/claims/{claim.id}/review/",
        {'action': 'APPROVE', 'reviewNotes': 'Independent verification passed.'},
        format='json'
    )
    assert res.status_code == status.HTTP_200_OK
    claim.refresh_from_db()
    item.refresh_from_db()
    assert claim.claim_status == ClaimStatus.APPROVED
    assert claim.reviewed_by_id == independent_officer.id
    assert claim.claimant_id == workflow_setup['claimant1'].id
    assert item.reported_by_id == reporter.id
    assert len(claim.handover_otp) == 6
    assert Handover.objects.filter(claim=claim, supervising_officer=independent_officer).count() == 1


@pytest.mark.django_db
def test_claimant_cannot_approve_own_claim_even_with_security_role(api_client, workflow_setup):
    """Claimant self-approval remains blocked even if claimant is also a reviewer role."""
    claimant = workflow_setup['claimant1']
    claimant.role = UserRole.SECURITY_PERSONNEL
    claimant.save()
    claim = Claim.objects.create(
        item=workflow_setup['found_item'],
        claimant=claimant,
        statement='My own claim.',
        claim_status=ClaimStatus.UNDER_REVIEW,
    )

    api_client.force_authenticate(user=claimant)
    res = api_client.patch(
        f"/api/v1/claims/{claim.id}/review/",
        {'action': 'APPROVE'},
        format='json'
    )
    assert res.status_code == status.HTTP_403_FORBIDDEN
    assert 'own claim' in str(res.data).lower()
    claim.refresh_from_db()
    assert claim.claim_status == ClaimStatus.UNDER_REVIEW
    assert not claim.handover_otp


@pytest.mark.django_db
def test_student_cannot_approve_claim(api_client, workflow_setup):
    """An authenticated student without a reviewer role is denied by endpoint RBAC."""
    claim = Claim.objects.create(
        item=workflow_setup['found_item'],
        claimant=workflow_setup['claimant1'],
        statement='Claim requiring review.',
        claim_status=ClaimStatus.UNDER_REVIEW,
    )
    api_client.force_authenticate(user=workflow_setup['claimant2'])
    res = api_client.patch(
        f"/api/v1/claims/{claim.id}/review/",
        {'action': 'APPROVE'},
        format='json'
    )
    assert res.status_code == status.HTTP_403_FORBIDDEN
    claim.refresh_from_db()
    assert claim.claim_status == ClaimStatus.UNDER_REVIEW
    assert not claim.handover_otp


@pytest.mark.django_db
def test_claim_cannot_be_approved_before_verification(api_client, workflow_setup):
    """Approval requires the verification workflow to move the claim to UNDER_REVIEW."""
    claim = Claim.objects.create(
        item=workflow_setup['found_item'],
        claimant=workflow_setup['claimant1'],
        statement='Claim awaiting challenge answers.',
        claim_status=ClaimStatus.CHALLENGE_REQUIRED,
    )
    api_client.force_authenticate(user=workflow_setup['security_officer'])
    res = api_client.patch(
        f"/api/v1/claims/{claim.id}/review/",
        {'action': 'APPROVE'},
        format='json'
    )
    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert 'pass ownership verification' in str(res.data).lower()
    claim.refresh_from_db()
    assert claim.claim_status == ClaimStatus.CHALLENGE_REQUIRED
    assert not claim.handover_otp
    assert not Handover.objects.filter(claim=claim).exists()

@pytest.mark.django_db
def test_claim_approval_and_competing_claim_resolution(api_client, workflow_setup, caplog):
    """Approving one claim resolves competing claims and issues 6-digit handover OTP."""
    caplog.set_level(logging.INFO)
    item = workflow_setup['found_item']
    claimant = workflow_setup['claimant1']
    claimant.department = 'School of Computer Science and Engineering'
    claimant.phone = '9876543210'
    claimant.save(update_fields=['department', 'phone'])
    custody_location = CustodyLocation.objects.create(
        code='CENTRAL-SECURITY',
        name='Central Security Office',
    )
    locker = Locker.objects.create(
        locker_number='VAULT-17',
        location='Central Security Office',
        custody_location=custody_location,
        current_item=item,
    )
    item.locker_storage_reference = locker.locker_number
    item.save(update_fields=['locker_storage_reference'])
    handover_officer = User.objects.create_user(
        email='officer.handover@lpu.in',
        registration_number='SEC9003',
        full_name='Officer Handover Singh',
        password='Password123!',
        role=UserRole.SECURITY_PERSONNEL,
        security_post='Central Gate 1 Desk',
    )
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
    res = api_client.patch(
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
    assert handover.claim_id == claim1.id
    assert handover.item_id == item.id
    assert handover.recipient_id == claim1.claimant_id
    assert handover.otp_expires_at == claim1.handover_otp_expires_at
    assert django_timezone.is_aware(handover.otp_expires_at)
    assert handover.otp_expires_at > django_timezone.now()
    assert handover.otp_expires_at - claim1.reviewed_at >= timedelta(hours=48)
    assert 'handover_otp_generated' in caplog.text
    assert issued_otp not in caplog.text

    # The slip endpoint rejects an approved claim until physical handover is saved.
    api_client.force_authenticate(user=workflow_setup['security_officer'])
    premature_slip = api_client.get(f'/api/v1/handovers/{handover.id}/slip/')
    assert premature_slip.status_code == status.HTTP_409_CONFLICT

    # Claimants receive the same current OTP through the existing My Claims API.
    api_client.force_authenticate(user=claim1.claimant)
    claimant_claims = api_client.get('/api/v1/claims/my-claims/')
    assert claimant_claims.status_code == status.HTTP_200_OK
    delivered_claim = next(c for c in claimant_claims.data if c['id'] == str(claim1.id))
    assert delivered_claim['handoverOtp'] == issued_otp
    assert delivered_claim['claimStatus'] == ClaimStatus.APPROVED
    assert api_client.get('/api/v1/handovers/my-recovery-history/').data == []

    # Security's existing pending-handover feed references the same claim and expiry.
    api_client.force_authenticate(user=handover_officer)
    pending_handovers = api_client.get('/api/v1/handovers/pending/')
    assert pending_handovers.status_code == status.HTTP_200_OK
    pending_record = next(h for h in pending_handovers.data if h['claim']['id'] == str(claim1.id))
    assert pending_record['claim']['handoverOtp'] == issued_otp
    assert parse_datetime(pending_record['otpExpiresAt']) == handover.otp_expires_at

    api_client.force_authenticate(user=None)
    api_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(handover_officer)}"
    )

    # An OTP without the required in-person release confirmation is not enough
    # to complete a handover or remove the claim from the active list.
    unconfirmed_handover = api_client.post(
        '/api/v1/handovers/verify-otp/',
        {'claimId': str(claim1.id), 'otp': issued_otp},
        format='json',
    )
    assert unconfirmed_handover.status_code == status.HTTP_400_BAD_REQUEST
    claim1.refresh_from_db()
    assert claim1.claim_status == ClaimStatus.APPROVED
    api_client.force_authenticate(user=claim1.claimant)
    active_before_release = api_client.get('/api/v1/claims/my-claims/')
    assert str(claim1.id) in {record['id'] for record in active_before_release.data}
    assert api_client.get('/api/v1/handovers/my-recovery-history/').data == []
    api_client.force_authenticate(user=handover_officer)

    # The OTP created by approval can complete the supervised handover and
    # append its custody record through the existing endpoint.
    handover_res = api_client.post(
        '/api/v1/handovers/verify-otp/',
        {
            'claimId': str(claim1.id),
            'otp': issued_otp,
            'physicalDeskLocation': 'Central Security Desk',
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': workflow_setup['claimant1'].registration_number,
            'acknowledgementNotes': 'Identity and ownership evidence verified in person.',
        },
        format='json'
    )
    assert handover_res.status_code == status.HTTP_200_OK
    claim1.refresh_from_db()
    item.refresh_from_db()
    handover.refresh_from_db()
    assert claim1.claim_status == ClaimStatus.COMPLETED
    assert item.status == ItemStatus.HANDED_OVER
    assert handover.is_completed is True
    assert handover.completed_at is not None
    assert AuditEntry.objects.filter(
        action=AuditAction.HANDOVER_EXECUTE,
        target_id=str(handover.id),
        actor=handover_officer,
    ).exists()
    custody_record = CustodyRecord.objects.get(item=item, action=CustodyAction.HANDED_OVER)
    assert custody_record.handled_by_id == handover_officer.id
    assert custody_record.from_location == 'Central Security Desk'
    assert custody_record.to_location == 'CLAIMANT_HANDOVER_COMPLETE'
    assert custody_record.previous_locker_reference == locker.locker_number
    assert custody_record.locker_reference == ''
    locker.refresh_from_db()
    item.refresh_from_db()
    assert locker.current_item_id is None
    assert item.locker_storage_reference == ''
    assert 'handover_otp_verification_result result=accepted' in caplog.text
    assert issued_otp not in caplog.text

    # The completed slip uses persisted handover, approval, and pre-release
    # locker history, and is available only to the owner or privileged staff.
    api_client.force_authenticate(user=claim1.claimant)
    slip_res = api_client.get(f'/api/v1/handovers/{handover.id}/slip/')
    assert slip_res.status_code == status.HTTP_200_OK
    assert AuditEntry.objects.filter(
        action=AuditAction.HANDOVER_SLIP_ACCESS,
        target_id=str(handover.id),
        actor=claim1.claimant,
    ).exists()
    assert slip_res.data['handoverReference'] == f'HND-{str(handover.id).upper()}'
    assert slip_res.data['student']['fullName'] == claim1.claimant.full_name
    assert slip_res.data['student']['registrationNumber'] == claim1.claimant.registration_number
    assert slip_res.data['student']['department'] == claimant.department
    assert slip_res.data['student']['mobile'] == claimant.phone
    assert slip_res.data['item']['title'] == item.title
    assert slip_res.data['item']['reportReference'] == item.reference_number
    assert slip_res.data['claimId'] == str(claim1.id)
    assert slip_res.data['approval']['officerName'] == workflow_setup['security_officer'].full_name
    assert slip_res.data['handoverOfficer']['fullName'] == handover_officer.full_name
    assert slip_res.data['lockerNumber'] == locker.locker_number
    assert 'otp' not in str(slip_res.data).lower()

    api_client.force_authenticate(user=workflow_setup['claimant2'])
    unauthorized_slip = api_client.get(f'/api/v1/handovers/{handover.id}/slip/')
    assert unauthorized_slip.status_code == status.HTTP_404_NOT_FOUND

    api_client.force_authenticate(user=None)
    api_client.credentials()
    unauthenticated_slip = api_client.get(f'/api/v1/handovers/{handover.id}/slip/')
    assert unauthenticated_slip.status_code == status.HTTP_401_UNAUTHORIZED

    api_client.force_authenticate(user=workflow_setup['campus_admin'])
    admin_slip = api_client.get(f'/api/v1/handovers/{handover.id}/slip/')
    assert admin_slip.status_code == status.HTTP_200_OK

    # Completed records leave both active security portals and remain in the
    # dedicated completed handover history filter.
    api_client.force_authenticate(user=workflow_setup['security_officer'])
    pending_after_release = api_client.get('/api/v1/handovers/pending/')
    assert pending_after_release.status_code == status.HTTP_200_OK
    assert all(record['claim']['id'] != str(claim1.id) for record in pending_after_release.data)
    approved_claims = api_client.get('/api/v1/claims/pending/', {'status': 'APPROVED'})
    assert approved_claims.status_code == status.HTTP_200_OK
    assert str(claim1.id) not in {record['id'] for record in approved_claims.data}
    completed_claims = api_client.get('/api/v1/claims/pending/', {'status': 'COMPLETED'})
    assert str(claim1.id) in {record['id'] for record in completed_claims.data}

    # The authenticated claimant now sees this only in persisted recovery history.
    api_client.force_authenticate(user=workflow_setup['claimant1'])
    active_claims = api_client.get('/api/v1/claims/my-claims/')
    assert active_claims.status_code == status.HTTP_200_OK
    assert str(claim1.id) not in {record['id'] for record in active_claims.data}
    recovery_history = api_client.get('/api/v1/handovers/my-recovery-history/')
    assert recovery_history.status_code == status.HTTP_200_OK
    recovered_record = next(record for record in recovery_history.data if record['claimId'] == str(claim1.id))
    assert recovered_record['status'] == ClaimStatus.COMPLETED
    assert recovered_record['itemReference'] == item.reference_number
    assert recovered_record['claimReference'] == f'CLM-{str(claim1.id)[:8].upper()}'
    assert recovered_record['recoveryDate'] == handover.completed_at
    assert recovered_record['custodyDesk'] == 'Central Security Desk'
    assert recovered_record['handoverOfficer'] == handover_officer.full_name
    # Re-reading after a simulated page refresh returns the same database receipt.
    assert api_client.get('/api/v1/handovers/my-recovery-history/').data == recovery_history.data

    # Another student can query only their own history and cannot retrieve this record.
    api_client.force_authenticate(user=workflow_setup['claimant2'])
    other_history = api_client.get('/api/v1/handovers/my-recovery-history/')
    assert other_history.status_code == status.HTTP_200_OK
    assert all(record['claimId'] != str(claim1.id) for record in other_history.data)

    # Direct multipart requests are also blocked after completion; existing evidence stays intact.
    api_client.force_authenticate(user=workflow_setup['claimant1'])
    evidence_before = list(claim1.private_evidence_proof_urls)
    closed_upload = api_client.post(
        f'/api/v1/claims/{claim1.id}/evidence/',
        {'file': SimpleUploadedFile('after-recovery.pdf', b'%PDF-1.4 late evidence', content_type='application/pdf')},
        format='multipart',
    )
    assert closed_upload.status_code == status.HTTP_409_CONFLICT
    assert closed_upload.data['error']['code'] == 'RECOVERY_COMPLETED'
    assert 'successfully recovered' in closed_upload.data['error']['message']
    claim1.refresh_from_db()
    assert claim1.private_evidence_proof_urls == evidence_before

    # Repeated confirmation cannot replace the OTP or create another handover
    # or OTP-generation audit entry.
    api_client.force_authenticate(user=workflow_setup['security_officer'])
    otp_before_duplicate = claim1.handover_otp
    duplicate = api_client.patch(
        f"/api/v1/claims/{claim1.id}/review/",
        {'action': 'APPROVE', 'reviewNotes': 'Duplicate approval attempt.'},
        format='json'
    )
    assert duplicate.status_code == status.HTTP_400_BAD_REQUEST
    claim1.refresh_from_db()
    assert claim1.handover_otp == otp_before_duplicate
    assert Handover.objects.filter(claim=claim1).count() == 1
    assert AuditEntry.objects.filter(
        action=AuditAction.HANDOVER_OTP_GENERATE,
        target_id=str(handover.id),
    ).count() == 1


@pytest.mark.django_db
def test_handover_slip_without_locker_shows_not_assigned(api_client, workflow_setup):
    """A valid completed handover without a locker never invents an allocation."""
    claim = Claim.objects.create(
        item=workflow_setup['found_item'],
        claimant=workflow_setup['claimant1'],
        statement='Ownership details verified at the security desk.',
        claim_status=ClaimStatus.UNDER_REVIEW,
    )
    officer = workflow_setup['security_officer']
    api_client.force_authenticate(user=officer)
    approved = api_client.patch(
        f'/api/v1/claims/{claim.id}/review/',
        {'action': 'APPROVE', 'reviewNotes': 'Ownership evidence checked in person.'},
        format='json',
    )
    assert approved.status_code == status.HTTP_200_OK
    handover = Handover.objects.get(claim=claim)

    completed = api_client.post(
        '/api/v1/handovers/verify-otp/',
        {
            'claimId': str(claim.id),
            'otp': approved.data['handoverOtp'],
            'physicalDeskLocation': 'Central Security Desk',
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': workflow_setup['claimant1'].registration_number,
        },
        format='json',
    )
    assert completed.status_code == status.HTTP_200_OK

    slip = api_client.get(f'/api/v1/handovers/{handover.id}/slip/')
    assert slip.status_code == status.HTTP_200_OK
    assert slip.data['lockerNumber'] == 'Not assigned'


@pytest.mark.django_db
def test_direct_recovery_from_lost_report_without_claim(api_client, workflow_setup, caplog):
    """A report owner can recover through a distinct, verified no-claim flow."""
    reporter = workflow_setup['claimant1']
    item = Item.objects.create(
        reference_number='LPU-L-20261019-DR01',
        item_type=ItemType.LOST,
        title='Blue university laptop',
        public_description='Blue laptop with a damaged right corner.',
        category=workflow_setup['found_item'].category,
        location=workflow_setup['found_item'].location,
        specific_location='Block 25 Library',
        event_date=django_timezone.now() - timedelta(days=1),
        status=ItemStatus.REPORTED,
        reported_by=reporter,
        retention_expires_at=django_timezone.now() + timedelta(days=90),
    )
    vault = PrivateDetail(item=item, fields_summary=['privateIdentifyingDetails'])
    vault.set_secret_payload({'privateDetails': 'Blue sleeve, asset sticker LPU-8843.'})
    vault.save()
    challenge = VerificationChallenge(item=item, question_text='What is the asset sticker number?')
    challenge.set_answer('LPU-8843')
    challenge.save()

    reviewer = User.objects.create_user(
        email='officer.direct-review@lpu.in',
        registration_number='SEC9100',
        full_name='Officer Independent Reviewer',
        password='Password123!',
        role=UserRole.SECURITY_PERSONNEL,
        security_post='Central Security Office',
    )
    intake_officer = workflow_setup['security_officer']

    api_client.force_authenticate(user=intake_officer)
    eligible = api_client.get('/api/v1/handovers/direct-reports', {'search': item.reference_number})
    assert eligible.status_code == status.HTTP_200_OK
    assert [entry['id'] for entry in eligible.data] == [str(item.id)]
    assert eligible.data[0]['reporter']['registrationNumber'] == reporter.registration_number
    assert eligible.data[0]['verificationAvailable']['privateDetails'] is True

    api_client.force_authenticate(user=reporter)
    denied_student_queue = api_client.get('/api/v1/handovers/direct-recoveries/')
    assert denied_student_queue.status_code == status.HTTP_403_FORBIDDEN
    api_client.force_authenticate(user=intake_officer)

    intake = api_client.post(
        '/api/v1/handovers/direct-recoveries/',
        {
            'reportId': str(item.id),
            'physicalDeskLocation': 'Central Security Desk',
            'physicalItemReceived': True,
            'intakeNotes': 'Laptop physically received from the owner and sealed at the desk.',
        },
        format='json',
    )
    assert intake.status_code == status.HTTP_201_CREATED
    direct_id = intake.data['directRecoveryId']
    record = DirectRecovery.objects.get(pk=direct_id)
    item.refresh_from_db()
    assert item.item_type == ItemType.LOST
    assert item.status == ItemStatus.IN_CUSTODY
    assert record.recipient_id == reporter.id
    assert record.intake_officer_id == intake_officer.id
    assert record.intake_custody_record.action in (CustodyAction.INITIAL_INTAKE, CustodyAction.TRANSFERRED_DESK)
    assert Claim.objects.filter(item=item).count() == 0
    assert Handover.objects.filter(item=item).count() == 0

    claim_while_direct = api_client.post(
        '/api/v1/claims/',
        {'itemId': str(item.id), 'statement': 'A separate claim must not race the direct workflow.'},
        format='json',
    )
    assert claim_while_direct.status_code == status.HTTP_400_BAD_REQUEST
    assert Claim.objects.filter(item=item).count() == 0

    self_review = api_client.patch(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/review/',
        {'action': 'APPROVE', 'studentIdVerified': True, 'verificationNotes': 'Identity and ownership checks were completed.'},
        format='json',
    )
    assert self_review.status_code == status.HTTP_400_BAD_REQUEST
    assert 'At least one independent ownership source' in self_review.data['message']

    api_client.force_authenticate(user=reviewer)
    shared_intake_queue = api_client.get('/api/v1/handovers/direct-recoveries/')
    shared_intake = next(entry for entry in shared_intake_queue.data if entry['directRecoveryId'] == direct_id)
    assert shared_intake['status'] == DirectRecoveryStatus.INTAKE_RECORDED
    assert shared_intake['intakeOfficer']['id'] == str(intake_officer.id)
    wrong_answer = api_client.patch(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/review/',
        {
            'action': 'APPROVE',
            'studentIdVerified': True,
            'verificationAnswers': [{'challengeId': str(challenge.id), 'answer': 'Wrong asset number'}],
            'verificationNotes': 'ID was inspected and the ownership answer was checked in person.',
        },
        format='json',
    )
    assert wrong_answer.status_code == status.HTTP_400_BAD_REQUEST
    record.refresh_from_db()
    assert record.status == DirectRecoveryStatus.INTAKE_RECORDED
    assert not record.otp_hash
    assert record.verification_attempts_count == 1

    uninspected_vault = api_client.patch(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/review/',
        {
            'action': 'APPROVE',
            'studentIdVerified': True,
            'privateDetailsMatched': True,
            'verificationNotes': 'ID was inspected and the private detail was matched in person.',
        },
        format='json',
    )
    assert uninspected_vault.status_code == status.HTTP_400_BAD_REQUEST

    vault_view = api_client.post(f'/api/v1/items/{item.id}/private-vault/view/', {}, format='json')
    assert vault_view.status_code == status.HTTP_200_OK
    approved = api_client.patch(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/review/',
        {
            'action': 'APPROVE',
            'studentIdVerified': True,
            'privateDetailsMatched': True,
            'verificationNotes': 'University ID verified; private asset sticker matched against the item.',
        },
        format='json',
    )
    assert approved.status_code == status.HTTP_200_OK
    assert 'handoverOtp' not in approved.data
    record.refresh_from_db()
    item.refresh_from_db()
    assert record.status == DirectRecoveryStatus.APPROVED
    assert record.reviewed_by_id == reviewer.id
    assert record.verification_methods == ['PRIVATE_DETAILS']
    assert record.otp_generated_at is not None and django_timezone.is_aware(record.otp_generated_at)
    assert record.otp_expires_at == record.otp_generated_at + timedelta(hours=48)
    assert item.status == ItemStatus.READY_FOR_HANDOVER

    api_client.force_authenticate(user=reporter)
    my_direct = api_client.get('/api/v1/handovers/direct-recoveries/my/')
    assert my_direct.status_code == status.HTTP_200_OK
    student_record = next(entry for entry in my_direct.data if entry['directRecoveryId'] == direct_id)
    assert student_record['handoverOtp'] == record.get_otp()
    assert student_record['status'] == DirectRecoveryStatus.APPROVED
    assert student_record['otpStatus'] == 'ACTIVE'
    assert student_record['otpGeneratedAt'] == record.otp_generated_at
    assert student_record['otpRemainingSeconds'] > 0

    # A different student never receives this recovery's OTP.
    api_client.force_authenticate(user=workflow_setup['claimant2'])
    other_student_recoveries = api_client.get('/api/v1/handovers/direct-recoveries/my/')
    assert all(entry['directRecoveryId'] != direct_id for entry in other_student_recoveries.data)

    # Expired OTP verification does not silently renew or change the recovery.
    original_otp = student_record['handoverOtp']
    expired_at = django_timezone.now() - timedelta(seconds=1)
    record.otp_generated_at = expired_at - timedelta(hours=48)
    record.otp_expires_at = expired_at
    record.save(update_fields=['otp_generated_at', 'otp_expires_at', 'updated_at'])
    api_client.force_authenticate(user=reviewer)
    expired_attempt = api_client.post(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/verify-otp/',
        {
            'otp': original_otp,
            'physicalDeskLocation': 'Central Security Desk',
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': reporter.registration_number,
            'idCardInspected': True,
        },
        format='json',
    )
    assert expired_attempt.status_code == status.HTTP_400_BAD_REQUEST
    assert 'expired' in expired_attempt.data['message'].lower()
    record.refresh_from_db()
    expected_expiry = expired_at
    if connection.vendor == 'mongodb':
        expected_expiry = expected_expiry.replace(
            microsecond=(expected_expiry.microsecond // 1000) * 1000
        )
    assert record.otp_expires_at == expected_expiry
    assert record.status == DirectRecoveryStatus.APPROVED

    # Accessing the recipient's portal renews an expired pending OTP once.
    api_client.force_authenticate(user=reporter)
    renewed_response = api_client.get('/api/v1/handovers/direct-recoveries/my/')
    student_record = next(entry for entry in renewed_response.data if entry['directRecoveryId'] == direct_id)
    record.refresh_from_db()
    renewed_otp = student_record['handoverOtp']
    assert renewed_otp and renewed_otp != original_otp
    assert student_record['otpStatus'] == 'RENEWED'
    assert student_record['otpRenewed'] is True
    assert record.verify_otp(renewed_otp)
    assert not record.verify_otp(original_otp)
    assert record.otp_generated_at > expired_at
    assert record.otp_expires_at == record.otp_generated_at + timedelta(hours=48)
    assert django_timezone.is_aware(record.otp_generated_at)

    # Repeated portal reads are idempotent and return the same active code.
    stable_generated_at = record.otp_generated_at
    repeated = api_client.get('/api/v1/handovers/direct-recoveries/my/')
    repeated_student_record = next(entry for entry in repeated.data if entry['directRecoveryId'] == direct_id)
    record.refresh_from_db()
    assert repeated_student_record['handoverOtp'] == renewed_otp
    assert repeated_student_record['otpStatus'] == 'ACTIVE'
    assert repeated_student_record['otpRenewed'] is False
    assert record.otp_generated_at == stable_generated_at
    assert renewed_otp not in caplog.text
    assert original_otp not in caplog.text

    custody_location = CustodyLocation.objects.create(
        code='CENTRAL-SECURITY',
        name='Central Security Office',
    )
    locker = Locker.objects.create(
        locker_number='DIRECT-LOCKER-04',
        location='Central Security Office',
        custody_location=custody_location,
        current_item=item,
    )
    item.locker_storage_reference = locker.locker_number
    item.save(update_fields=['locker_storage_reference'])

    # A different authorized Security Officer can see and process the shared queue.
    api_client.force_authenticate(user=reviewer)
    security_queue = api_client.get('/api/v1/handovers/direct-recoveries')
    queued = next(entry for entry in security_queue.data if entry['directRecoveryId'] == direct_id)
    assert queued['status'] == DirectRecoveryStatus.APPROVED
    assert queued['intakeOfficer']['id'] == str(intake_officer.id)
    assert 'handoverOtp' not in queued

    missing_physical_check = api_client.post(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/verify-otp/',
        {
            'otp': renewed_otp,
            'physicalDeskLocation': custody_location.name,
            'custodyLocationId': str(custody_location.id),
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': reporter.registration_number,
        },
        format='json',
    )
    assert missing_physical_check.status_code == status.HTTP_400_BAD_REQUEST
    assert any(
        detail['field'] == 'idCardInspected'
        for detail in missing_physical_check.data['error']['details']
    )

    unchecked_id = api_client.post(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/verify-otp/',
        {
            'otp': renewed_otp,
            'physicalDeskLocation': custody_location.name,
            'custodyLocationId': str(custody_location.id),
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': reporter.registration_number,
            'idCardInspected': False,
        },
        format='json',
    )
    assert unchecked_id.status_code == status.HTTP_400_BAD_REQUEST
    assert any(
        detail['field'] == 'idCardInspected'
        for detail in unchecked_id.data['error']['details']
    )
    record.refresh_from_db()
    assert record.otp_attempts_count == 0

    invalid_otp = '000000' if renewed_otp != '000000' else '000001'
    invalid_attempt = api_client.post(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/verify-otp/',
        {
            'otp': invalid_otp,
            'physicalDeskLocation': custody_location.name,
            'custodyLocationId': str(custody_location.id),
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': reporter.registration_number,
            'idCardInspected': True,
        },
        format='json',
    )
    assert invalid_attempt.status_code == status.HTTP_400_BAD_REQUEST
    assert 'invalid' in invalid_attempt.data['message'].lower()
    record.refresh_from_db()
    assert record.otp_attempts_count == 1
    assert record.verify_otp(renewed_otp)

    api_client.force_authenticate(user=reporter)
    unauthorized_attempt = api_client.post(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/verify-otp/',
        {
            'otp': renewed_otp,
            'physicalDeskLocation': custody_location.name,
            'custodyLocationId': str(custody_location.id),
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': reporter.registration_number,
            'idCardInspected': True,
        },
        format='json',
    )
    assert unauthorized_attempt.status_code == status.HTTP_403_FORBIDDEN
    api_client.force_authenticate(user=reviewer)

    wrong_id = api_client.post(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/verify-otp/',
        {
            'otp': renewed_otp,
            'physicalDeskLocation': custody_location.name,
            'custodyLocationId': str(custody_location.id),
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': 'WRONG-STUDENT-ID',
            'idCardInspected': True,
        },
        format='json',
    )
    assert wrong_id.status_code == status.HTTP_403_FORBIDDEN

    completed = api_client.post(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/verify-otp',
        {
            'otp': renewed_otp,
            'physicalDeskLocation': custody_location.name,
            'custodyLocationId': str(custody_location.id),
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': reporter.registration_number,
            'idCardInspected': True,
            'acknowledgementNotes': 'Original report owner received the verified property.',
        },
        format='json',
    )
    assert completed.status_code == status.HTTP_200_OK
    assert completed.data['directRecoveryId'] == direct_id
    record.refresh_from_db()
    item.refresh_from_db()
    locker.refresh_from_db()
    assert record.status == DirectRecoveryStatus.COMPLETED
    assert record.intake_officer_id == intake_officer.id
    assert record.completed_by_id == reviewer.id
    completed_generated_at = record.otp_generated_at
    assert item.status == ItemStatus.HANDED_OVER
    assert item.locker_storage_reference == ''
    assert locker.current_item_id is None
    assert CustodyRecord.objects.filter(item=item, action=CustodyAction.HANDED_OVER).count() == 1
    handover_audit = AuditEntry.objects.get(
        action=AuditAction.HANDOVER_EXECUTE,
        target_entity='DirectRecovery',
        target_id=direct_id,
        actor=reviewer,
    )
    assert handover_audit.metadata['physicalIdInspected'] is True

    slip = api_client.get(f'/api/v1/handovers/direct-recoveries/{direct_id}/slip/')
    assert slip.status_code == status.HTTP_200_OK
    assert AuditEntry.objects.filter(
        action=AuditAction.HANDOVER_SLIP_ACCESS,
        target_entity='DirectRecovery',
        target_id=direct_id,
        actor=reviewer,
    ).exists()
    assert slip.data['item']['reportId'] == str(item.id)
    assert slip.data['claimId'] is None
    assert slip.data['approval']['officerName'] == reviewer.full_name
    assert slip.data['handoverOfficer']['fullName'] == reviewer.full_name
    assert slip.data['lockerNumber'] == locker.locker_number
    assert 'otp' not in str(slip.data).lower()

    api_client.force_authenticate(user=reporter)
    post_completion_otp = api_client.get('/api/v1/handovers/direct-recoveries/my/')
    completed_record = next(entry for entry in post_completion_otp.data if entry['directRecoveryId'] == direct_id)
    assert completed_record['handoverOtp'] is None
    assert completed_record['otpStatus'] == 'USED'
    record.refresh_from_db()
    assert record.otp_generated_at == completed_generated_at
    recovery_history = api_client.get('/api/v1/handovers/my-recovery-history/')
    direct_history = next(entry for entry in recovery_history.data if entry.get('directRecoveryId') == direct_id)
    assert direct_history['recoveryType'] == 'DIRECT_REPORT'
    assert direct_history['claimId'] is None
    assert direct_history['status'] == 'COMPLETED'

    api_client.force_authenticate(user=intake_officer)
    remaining_active = api_client.get('/api/v1/handovers/direct-recoveries/')
    assert all(entry['directRecoveryId'] != direct_id for entry in remaining_active.data)
    completed_history = api_client.get('/api/v1/handovers/direct-recoveries/history')
    assert any(entry['directRecoveryId'] == direct_id for entry in completed_history.data)
    duplicate = api_client.post(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/verify-otp/',
        {
            'otp': renewed_otp,
            'physicalDeskLocation': 'Central Security Desk',
            'custodyLocationId': str(custody_location.id),
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': reporter.registration_number,
            'idCardInspected': True,
        },
        format='json',
    )
    assert duplicate.status_code == status.HTTP_409_CONFLICT
    assert CustodyRecord.objects.filter(item=item, action=CustodyAction.HANDED_OVER).count() == 1

    api_client.force_authenticate(user=reporter)
    read_only_report = api_client.patch(
        f'/api/v1/items/{item.id}/',
        {'publicDescription': 'Changed after successful recovery.'},
        format='json',
    )
    assert read_only_report.status_code == status.HTTP_409_CONFLICT
    api_client.force_authenticate(user=intake_officer)
    active_inventory = api_client.get('/api/v1/custody/inventory/')
    assert active_inventory.status_code == status.HTTP_200_OK
    assert str(item.id) not in {entry['id'] for entry in active_inventory.data}

    api_client.force_authenticate(user=workflow_setup['claimant2'])
    other_history = api_client.get('/api/v1/handovers/my-recovery-history/')
    assert all(entry.get('directRecoveryId') != direct_id for entry in other_history.data)
    unauthorized_slip = api_client.get(f'/api/v1/handovers/direct-recoveries/{direct_id}/slip/')
    assert unauthorized_slip.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_intake_officer_can_approve_and_complete_own_direct_intake(api_client, workflow_setup):
    reporter = workflow_setup['claimant1']
    officer = workflow_setup['security_officer']
    item = Item.objects.create(
        reference_number='LPU-L-20261019-DR02',
        item_type=ItemType.LOST,
        title='Red student backpack',
        public_description='Red backpack with a stitched white campus emblem.',
        category=workflow_setup['found_item'].category,
        location=workflow_setup['found_item'].location,
        specific_location='Science building foyer',
        event_date=django_timezone.now() - timedelta(days=1),
        primary_image_url='/media/red-backpack.webp',
        reported_by=reporter,
        retention_expires_at=django_timezone.now() + timedelta(days=90),
    )

    api_client.force_authenticate(user=officer)
    intake = api_client.post(
        '/api/v1/handovers/direct-recoveries/',
        {
            'reportId': str(item.id),
            'physicalDeskLocation': 'Central Security Desk',
            'physicalItemReceived': True,
            'intakeNotes': 'Received the backpack from the student and secured it at the desk.',
        },
        format='json',
    )
    assert intake.status_code == status.HTTP_201_CREATED
    direct_id = intake.data['directRecoveryId']
    record = DirectRecovery.objects.get(pk=direct_id)

    api_client.force_authenticate(user=reporter)
    claimant_approval = api_client.patch(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/review/',
        {
            'action': 'APPROVE',
            'studentIdVerified': True,
            'reportPhotoMatched': True,
            'verificationNotes': 'Student ID matched and the saved report photo was checked in person.',
        },
        format='json',
    )
    assert claimant_approval.status_code == status.HTTP_403_FORBIDDEN

    api_client.force_authenticate(user=officer)
    approval = api_client.patch(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/review/',
        {
            'action': 'APPROVE',
            'studentIdVerified': True,
            'reportPhotoMatched': True,
            'verificationNotes': 'Student ID matched and the saved report photo was checked in person.',
        },
        format='json',
    )
    assert approval.status_code == status.HTTP_200_OK
    assert 'handoverOtp' not in approval.data
    record.refresh_from_db()
    assert record.status == DirectRecoveryStatus.APPROVED
    assert record.intake_officer_id == officer.id
    assert record.reviewed_by_id == officer.id
    assert record.otp_expires_at == record.otp_generated_at + timedelta(hours=48)

    api_client.force_authenticate(user=reporter)
    recipient_view = api_client.get('/api/v1/handovers/direct-recoveries/my/')
    recipient_record = next(entry for entry in recipient_view.data if entry['directRecoveryId'] == direct_id)
    assert recipient_record['handoverOtp'] == record.get_otp()

    api_client.force_authenticate(user=officer)
    completed = api_client.post(
        f'/api/v1/handovers/direct-recoveries/{direct_id}/verify-otp/',
        {
            'otp': recipient_record['handoverOtp'],
            'physicalDeskLocation': 'Central Security Desk',
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': reporter.registration_number,
            'idCardInspected': True,
            'acknowledgementNotes': 'Item returned to its verified report owner.',
        },
        format='json',
    )
    assert completed.status_code == status.HTTP_200_OK
    record.refresh_from_db()
    assert record.status == DirectRecoveryStatus.COMPLETED
    assert record.intake_officer_id == record.reviewed_by_id == record.completed_by_id == officer.id


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
    assert AuditEntry.objects.filter(
        action=AuditAction.HANDOVER_OTP_FAILED,
        target_id=str(handover.id),
        metadata__status='FAILED',
    ).exists()
    api_client.force_authenticate(user=claimant)
    active_claims = api_client.get('/api/v1/claims/my-claims/')
    assert str(claim.id) in {record['id'] for record in active_claims.data}
    assert api_client.get('/api/v1/handovers/my-recovery-history/').data == []
    api_client.force_authenticate(user=officer)

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
    assert 'OTP Already Used' in str(res_dup.data)


@pytest.mark.django_db
def test_expired_handover_otp_is_rejected(api_client, workflow_setup, caplog):
    """An expired code remains rejected using timezone-aware database timestamps."""
    item = workflow_setup['found_item']
    claimant = workflow_setup['claimant1']
    officer = workflow_setup['security_officer']
    expired_at = django_timezone.now() - timedelta(seconds=1)

    claim = Claim.objects.create(
        item=item,
        claimant=claimant,
        statement='Expired handover OTP claim.',
        claim_status=ClaimStatus.APPROVED,
        handover_otp='849201',
        handover_otp_expires_at=expired_at,
    )
    item.status = ItemStatus.READY_FOR_HANDOVER
    item.save()

    handover = Handover(
        item=item,
        claim=claim,
        recipient=claimant,
        supervising_officer=officer,
        otp_expires_at=expired_at,
    )
    handover.set_otp('849201')
    handover.save()

    api_client.force_authenticate(user=officer)
    res = api_client.post(
        '/api/v1/handovers/verify-otp/',
        {
            'claimId': str(claim.id),
            'otp': '849201',
            'physicalDeskLocation': 'Central Security Desk',
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': claimant.registration_number,
        },
        format='json',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert res.data['error']['code'] == 'OTP_EXPIRED'
    handover.refresh_from_db()
    claim.refresh_from_db()
    assert not handover.is_completed
    assert handover.otp_attempts_count == 0
    assert claim.claim_status == ClaimStatus.APPROVED
    assert 'handover_otp_expiration_validation result=expired' in caplog.text
    assert '849201' not in caplog.text
    api_client.force_authenticate(user=claimant)
    active_claims = api_client.get('/api/v1/claims/my-claims/')
    assert str(claim.id) in {record['id'] for record in active_claims.data}
    assert api_client.get('/api/v1/handovers/my-recovery-history/').data == []


@pytest.mark.django_db
def test_otp_from_another_claim_is_rejected(api_client, workflow_setup):
    """Verification selects the handover belonging to the submitted claim only."""
    category = workflow_setup['found_item'].category
    location = workflow_setup['found_item'].location
    reporter = workflow_setup['reporter']
    claimant = workflow_setup['claimant1']
    other_claimant = workflow_setup['claimant2']
    officer = workflow_setup['security_officer']
    now = django_timezone.now()
    second_item = Item.objects.create(
        reference_number='LPU-F-20261018-8888',
        item_type=ItemType.FOUND,
        title='Second item for OTP isolation',
        category=category,
        location=location,
        specific_location='Library counter',
        event_date=now - timedelta(days=1),
        public_description='Second found item.',
        status=ItemStatus.READY_FOR_HANDOVER,
        reported_by=reporter,
        retention_expires_at=now + timedelta(days=90),
    )

    first_claim = Claim.objects.create(
        item=workflow_setup['found_item'],
        claimant=claimant,
        statement='First approved claim.',
        claim_status=ClaimStatus.APPROVED,
        handover_otp='135790',
        handover_otp_expires_at=now + timedelta(hours=48),
    )
    second_claim = Claim.objects.create(
        item=second_item,
        claimant=other_claimant,
        statement='Second approved claim.',
        claim_status=ClaimStatus.APPROVED,
        handover_otp='246801',
        handover_otp_expires_at=now + timedelta(hours=48),
    )
    for claim, item, recipient, otp in (
        (first_claim, workflow_setup['found_item'], claimant, '135790'),
        (second_claim, second_item, other_claimant, '246801'),
    ):
        handover = Handover(
            item=item,
            claim=claim,
            recipient=recipient,
            supervising_officer=officer,
            otp_expires_at=claim.handover_otp_expires_at,
        )
        handover.set_otp(otp)
        handover.save()

    api_client.force_authenticate(user=officer)
    res = api_client.post(
        '/api/v1/handovers/verify-otp/',
        {
            'claimId': str(second_claim.id),
            'otp': '135790',
            'physicalDeskLocation': 'Central Security Desk',
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': other_claimant.registration_number,
        },
        format='json',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert res.data['error']['code'] == 'INVALID_OTP'
    second_handover = Handover.objects.get(claim=second_claim)
    assert second_handover.otp_attempts_count == 1
    assert not second_handover.is_completed

    # Even a matching OTP cannot be redeemed if the handover recipient is
    # inconsistent with the claimant on the submitted claim.
    second_handover.recipient = claimant
    second_handover.save(update_fields=['recipient'])
    res_mismatched_recipient = api_client.post(
        '/api/v1/handovers/verify-otp/',
        {
            'claimId': str(second_claim.id),
            'otp': '246801',
            'physicalDeskLocation': 'Central Security Desk',
            'idCardPresentedType': 'LPU_STUDENT_ID',
            'idCardNumber': other_claimant.registration_number,
        },
        format='json',
    )

    assert res_mismatched_recipient.status_code == status.HTTP_409_CONFLICT
    assert res_mismatched_recipient.data['error']['code'] == 'HANDOVER_RELATIONSHIP_MISMATCH'
    second_handover.refresh_from_db()
    assert not second_handover.is_completed

@pytest.mark.django_db
def test_claim_evidence_upload_and_download_flow(api_client, workflow_setup):
    c1 = workflow_setup['claimant1']
    c2 = workflow_setup['claimant2']
    officer = workflow_setup['security_officer']
    item = workflow_setup['found_item']

    # 1. Create a claim by claimant 1
    api_client.force_authenticate(user=c1)
    res_claim = api_client.post(
        '/api/v1/claims/',
        {
            'itemId': str(item.id),
            'statement': 'Watch belongs to me, has engraving.',
        },
        format='json'
    )
    assert res_claim.status_code == status.HTTP_201_CREATED
    claim_id = res_claim.data['id']

    # 2. Upload valid PDF evidence
    pdf_content = b"%PDF-1.4 test invoice content"
    valid_pdf = SimpleUploadedFile("purchase_invoice.pdf", pdf_content, content_type="application/pdf")
    res_upload = api_client.post(
        f'/api/v1/claims/{claim_id}/evidence/',
        {'file': valid_pdf},
        format='multipart'
    )
    assert res_upload.status_code == status.HTTP_201_CREATED
    assert 'url' in res_upload.data
    evidence_url = res_upload.data['url']

    # 3. Reject invalid file type (.exe)
    exe_file = SimpleUploadedFile("malware.exe", b"MZtest", content_type="application/x-dosexec")
    res_bad_type = api_client.post(
        f'/api/v1/claims/{claim_id}/evidence/',
        {'file': exe_file},
        format='multipart'
    )
    assert res_bad_type.status_code == status.HTTP_400_BAD_REQUEST
    assert 'INVALID_FILE_TYPE' in str(res_bad_type.data)

    # 4. Reject oversized file (> 5MB)
    huge_data = b"0" * (5 * 1024 * 1024 + 10)
    huge_file = SimpleUploadedFile("huge.pdf", huge_data, content_type="application/pdf")
    res_huge = api_client.post(
        f'/api/v1/claims/{claim_id}/evidence/',
        {'file': huge_file},
        format='multipart'
    )
    assert res_huge.status_code == status.HTTP_400_BAD_REQUEST
    assert 'FILE_TOO_LARGE' in str(res_huge.data)

    # 5. Unauthorized upload: claimant 2 attempts to upload to claimant 1's claim -> 403
    api_client.force_authenticate(user=c2)
    res_unauth = api_client.post(
        f'/api/v1/claims/{claim_id}/evidence/',
        {'file': SimpleUploadedFile("test.png", b"fake-png", content_type="image/png")},
        format='multipart'
    )
    assert res_unauth.status_code == status.HTTP_403_FORBIDDEN

    # 6. Unauthorized download: claimant 2 attempts to download claimant 1's evidence -> 403
    filename = evidence_url.strip('/').split('/')[-1]
    res_dl_unauth = api_client.get(f'/api/v1/claims/{claim_id}/evidence/{filename}/')
    assert res_dl_unauth.status_code == status.HTTP_403_FORBIDDEN

    # 7. Authorized download: claimant 1 can download their own evidence -> 200
    api_client.force_authenticate(user=c1)
    res_dl_c1 = api_client.get(f'/api/v1/claims/{claim_id}/evidence/{filename}/')
    assert res_dl_c1.status_code == status.HTTP_200_OK

    # 8. Authorized download: security officer can inspect evidence -> 200
    api_client.force_authenticate(user=officer)
    res_dl_sec = api_client.get(f'/api/v1/claims/{claim_id}/evidence/{filename}/')
    assert res_dl_sec.status_code == status.HTTP_200_OK

@pytest.mark.django_db
def test_security_claims_register_search_and_filters(api_client, workflow_setup):
    c1 = workflow_setup['claimant1']
    officer = workflow_setup['security_officer']
    item = workflow_setup['found_item']

    # Create claim
    api_client.force_authenticate(user=c1)
    api_client.post(
        '/api/v1/claims/',
        {
            'itemId': str(item.id),
            'statement': 'Watch was lost near library table.',
        },
        format='json'
    )

    # Security officer inspects register
    api_client.force_authenticate(user=officer)
    res_reg = api_client.get('/api/v1/claims/pending/?status=ALL')
    assert res_reg.status_code == status.HTTP_200_OK
    assert len(res_reg.data) >= 1

    # Search by claimant name
    res_search = api_client.get(f'/api/v1/claims/pending/?search={c1.full_name}')
    assert res_search.status_code == status.HTTP_200_OK
    assert len(res_search.data) >= 1

    # Search by non-existent term
    res_empty = api_client.get('/api/v1/claims/pending/?search=NONEXISTENT_XYZ_TERM')
    assert res_empty.status_code == status.HTTP_200_OK
    assert len(res_empty.data) == 0

    # Student cannot access security register -> 403
    api_client.force_authenticate(user=c1)
    res_forbidden = api_client.get('/api/v1/claims/pending/')
    assert res_forbidden.status_code == status.HTTP_403_FORBIDDEN

@pytest.mark.django_db
def test_claim_creation_using_reference_number(api_client, workflow_setup):
    """Students can submit ownership claims using human-readable reference number."""
    item = workflow_setup['found_item']
    claimant = workflow_setup['claimant2']

    api_client.force_authenticate(user=claimant)
    res = api_client.post(
        '/api/v1/claims/',
        {
            'itemId': item.reference_number,
            'statement': 'Found watch belongs to me. Submitting with reference number.',
        },
        format='json',
    )
    assert res.status_code == status.HTTP_201_CREATED
    assert res.data['itemId'] == str(item.id)

@pytest.mark.django_db
def test_claim_creation_rejection_scenarios(api_client, workflow_setup):
    """Verify rejection of empty statements, finder claiming own property, and duplicate claims."""
    item = workflow_setup['found_item']
    finder = workflow_setup['reporter']
    claimant = workflow_setup['claimant1']

    # 1. Finder cannot claim their own reported found item
    api_client.force_authenticate(user=finder)
    res_finder = api_client.post(
        '/api/v1/claims/',
        {'itemId': str(item.id), 'statement': 'I reported it but now I claim it.'},
        format='json',
    )
    assert res_finder.status_code == status.HTTP_400_BAD_REQUEST
    assert 'finder' in str(res_finder.data).lower()

    # 2. Claimant cannot submit empty statement
    api_client.force_authenticate(user=claimant)
    res_empty_stmt = api_client.post(
        '/api/v1/claims/',
        {'itemId': str(item.id), 'statement': '   '},
        format='json',
    )
    assert res_empty_stmt.status_code == status.HTTP_400_BAD_REQUEST

    # 3. First claim succeeds
    res_valid = api_client.post(
        '/api/v1/claims/',
        {'itemId': str(item.id), 'statement': 'Valid statement of ownership.'},
        format='json',
    )
    assert res_valid.status_code == status.HTTP_201_CREATED

    # 4. Duplicate claim rejected
    res_dup = api_client.post(
        '/api/v1/claims/',
        {'itemId': str(item.id), 'statement': 'Submitting second claim.'},
        format='json',
    )
    assert res_dup.status_code == status.HTTP_400_BAD_REQUEST
    assert 'active claim' in str(res_dup.data).lower()

