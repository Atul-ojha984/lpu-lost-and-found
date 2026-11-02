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
from django.core.files.uploadedfile import SimpleUploadedFile
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

