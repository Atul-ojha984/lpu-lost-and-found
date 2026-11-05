"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Test Suite: Items App REST APIs, Public Board, Filtering, Privacy & Vault
==============================================================================
"""

import pytest
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor
from django.db import close_old_connections, connection
from django.core.management import call_command
from django.contrib.auth.hashers import make_password
from io import StringIO
from rest_framework.test import APIClient
from rest_framework import status
from apps.accounts.models import User, UserRole, UserType
from apps.items.models import ItemCategory, Item, ItemType, ItemStatus
from apps.items.services import expire_overdue_student_lost_reports
from apps.locations.models import Location
from apps.verification.models import PrivateDetail, VerificationChallenge
from apps.audit.models import AuditEntry, AuditAction
from apps.claims.models import Claim, ClaimStatus
from apps.custody.models import CustodyRecord, CustodyAction
from apps.handovers.models import Handover
from apps.matching.models import MatchSuggestion, MatchStatus

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def test_setup(db):
    student1 = User.objects.create_user(
        email='student1@lpu.in',
        registration_number='12101001',
        full_name='Aman Sharma',
        password='Password123!',
        role=UserRole.STUDENT_STAFF,
        user_type=UserType.STUDENT,
    )
    student2 = User.objects.create_user(
        email='student2@lpu.in',
        registration_number='12101002',
        full_name='Priya Patel',
        password='Password123!',
        role=UserRole.STUDENT_STAFF,
        user_type=UserType.STUDENT,
    )
    staff1 = User.objects.create_user(
        email='staff1@lpu.in',
        registration_number='STAFF1001',
        full_name='Faculty Member One',
        password='Password123!',
        role=UserRole.STUDENT_STAFF,
        user_type=UserType.STAFF,
    )
    staff2 = User.objects.create_user(
        email='staff2@lpu.in',
        registration_number='STAFF1002',
        full_name='Faculty Member Two',
        password='Password123!',
        role=UserRole.STUDENT_STAFF,
        user_type=UserType.STAFF,
    )
    security_officer = User.objects.create_user(
        email='security1@lpu.in',
        registration_number='SEC9001',
        full_name='Inspector Rajesh',
        password='Password123!',
        role=UserRole.SECURITY_PERSONNEL,
        security_post='Main Gate Security',
    )
    campus_admin = User.objects.create_user(
        email='admin1@lpu.in',
        registration_number='ADM1001',
        full_name='Dean Admin',
        password='Password123!',
        role=UserRole.CAMPUS_ADMIN,
    )

    cat_elec = ItemCategory.objects.create(
        code='ELECTRONICS',
        name='Electronics & Devices',
        default_retention_days=90,
    )
    cat_doc = ItemCategory.objects.create(
        code='DOCUMENTS',
        name='Official Documents & Cards',
        default_retention_days=180,
    )

    loc_b34 = Location.objects.create(
        code='BLOCK_34',
        name='Block 34 Computer Labs',
        campus_zone='ACADEMIC_BLOCKS',
        building_name='Block 34',
    )
    loc_mall = Location.objects.create(
        code='UNI_MALL',
        name='Student Uni-Mall Center',
        campus_zone='COMMERCIAL_HUB',
        has_security_desk=True,
    )

    now = datetime.now(timezone.utc)

    item1 = Item.objects.create(
        reference_number='LPU-L-20261018-0001',
        item_type=ItemType.LOST,
        title='Blue Dell XPS Laptop',
        category=cat_elec,
        location=loc_b34,
        specific_location='Lab 302, 3rd Floor',
        event_date=now - timedelta(days=2),
        public_description='Silver and blue Dell XPS 13 laptop with CS stickers',
        status=ItemStatus.REPORTED,
        reported_by=student1,
        retention_expires_at=now + timedelta(days=90),
    )

    item2 = Item.objects.create(
        reference_number='LPU-F-20261018-0002',
        item_type=ItemType.FOUND,
        title='LPU Student Identity Card',
        category=cat_doc,
        location=loc_mall,
        specific_location='Food Court Table 12',
        event_date=now - timedelta(days=1),
        public_description='Student identity card found near food court',
        status=ItemStatus.IN_CUSTODY,
        current_custody_desk='Uni-Mall Security Desk',
        reported_by=student2,
        retention_expires_at=now + timedelta(days=180),
    )

    item3 = Item.objects.create(
        reference_number='LPU-F-20261018-0003',
        item_type=ItemType.FOUND,
        title='Apple AirPods Pro Gen 2',
        category=cat_elec,
        location=loc_mall,
        specific_location='Near Ground Floor ATM',
        event_date=now,
        public_description='AirPods in white case with small scratch',
        status=ItemStatus.IN_CUSTODY,
        current_custody_desk='Central Security Desk',
        reported_by=student2,
        retention_expires_at=now + timedelta(days=90),
    )

    return {
        'student1': student1,
        'student2': student2,
        'staff1': staff1,
        'staff2': staff2,
        'security_officer': security_officer,
        'campus_admin': campus_admin,
        'cat_elec': cat_elec,
        'cat_doc': cat_doc,
        'loc_b34': loc_b34,
        'loc_mall': loc_mall,
        'item1': item1,
        'item2': item2,
        'item3': item3,
    }

@pytest.fixture
def report_factory(test_setup):
    def create_report(owner, item_type=ItemType.LOST, item_status=ItemStatus.REPORTED, suffix='9001'):
        now = datetime.now(timezone.utc)
        prefix = 'L' if item_type == ItemType.LOST else 'F'
        return Item.objects.create(
            reference_number=f'LPU-{prefix}-20261104-{suffix}',
            item_type=item_type,
            title=f'Withdrawal test report {suffix}',
            category=test_setup['cat_elec'],
            location=test_setup['loc_b34'],
            specific_location='Library entrance',
            event_date=now - timedelta(hours=1),
            public_description='Private test report for owner withdrawal.',
            status=item_status,
            reported_by=owner,
            retention_expires_at=now + timedelta(days=90),
        )
    return create_report

@pytest.mark.django_db
@pytest.mark.parametrize('item_type', [ItemType.LOST, ItemType.FOUND])
def test_student_can_withdraw_own_lost_or_found_report(api_client, test_setup, report_factory, item_type):
    """Eligible student withdrawals archive, audit, and remove reports from active listings."""
    item = report_factory(test_setup['student1'], item_type=item_type, suffix='9101')
    original_created_at = item.created_at

    api_client.force_authenticate(user=test_setup['student1'])
    response = api_client.delete(f'/api/v1/items/{item.id}/withdraw/')

    assert response.status_code == status.HTTP_200_OK
    assert response.data['withdrawalStatus'] == 'WITHDRAWN'
    item.refresh_from_db()
    assert item.is_archived is True
    assert item.created_at == original_created_at
    assert item.reported_by_id == test_setup['student1'].id
    assert item.status == ItemStatus.REPORTED

    audit = AuditEntry.objects.get(
        target_entity='Item',
        target_id=str(item.id),
        action=AuditAction.ITEM_REPORT_WITHDRAW,
    )
    assert audit.actor_id == test_setup['student1'].id
    assert audit.metadata['itemType'] == item_type
    assert audit.metadata['withdrawalStatus'] == 'WITHDRAWN'
    assert audit.metadata['previousStatus'] == ItemStatus.REPORTED
    assert audit.metadata['withdrawnAt']

    public_response = api_client.get('/api/v1/items/', {'search': item.title})
    assert public_response.status_code == status.HTTP_200_OK
    assert all(row['id'] != str(item.id) for row in public_response.data['items'])
    detail_response = api_client.get(f'/api/v1/items/{item.id}/')
    assert detail_response.status_code == status.HTTP_404_NOT_FOUND
    my_reports_response = api_client.get('/api/v1/items/my-reports/')
    assert my_reports_response.status_code == status.HTTP_200_OK
    assert all(row['id'] != str(item.id) for row in my_reports_response.data)

    # Repeated requests are idempotent and do not create additional audit rows.
    repeated = api_client.delete(f'/api/v1/items/{item.id}/withdraw/')
    assert repeated.status_code == status.HTTP_200_OK
    assert repeated.data['alreadyWithdrawn'] is True
    assert AuditEntry.objects.filter(
        target_entity='Item',
        target_id=str(item.id),
        action=AuditAction.ITEM_REPORT_WITHDRAW,
    ).count() == 1


@pytest.mark.django_db
def test_staff_can_withdraw_own_eligible_report(api_client, test_setup, report_factory):
    """Staff accounts use the shared student/staff role and can withdraw their own report."""
    item = report_factory(test_setup['staff1'], item_type=ItemType.FOUND, suffix='9102')
    api_client.force_authenticate(user=test_setup['staff1'])

    response = api_client.delete(f'/api/v1/items/{item.id}/withdraw/')

    assert response.status_code == status.HTTP_200_OK
    item.refresh_from_db()
    assert item.is_archived is True
    assert item.reported_by_id == test_setup['staff1'].id


@pytest.mark.django_db
@pytest.mark.parametrize(
    'owner_key,requester_key',
    [('student1', 'student2'), ('staff1', 'staff2')],
)
def test_user_cannot_withdraw_another_users_report(api_client, test_setup, report_factory, owner_key, requester_key):
    item = report_factory(test_setup[owner_key], suffix='9103')
    api_client.force_authenticate(user=test_setup[requester_key])

    response = api_client.delete(f'/api/v1/items/{item.id}/withdraw/')

    assert response.status_code == status.HTTP_403_FORBIDDEN
    item.refresh_from_db()
    assert item.is_archived is False
    assert not AuditEntry.objects.filter(
        target_entity='Item',
        target_id=str(item.id),
        action=AuditAction.ITEM_REPORT_WITHDRAW,
    ).exists()


@pytest.mark.django_db
def test_withdrawal_requires_authentication(api_client, test_setup, report_factory):
    item = report_factory(test_setup['student1'], suffix='9104')

    response = api_client.delete(f'/api/v1/items/{item.id}/withdraw/')

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    item.refresh_from_db()
    assert item.is_archived is False


@pytest.mark.django_db
def test_security_and_admin_roles_cannot_use_student_withdrawal(api_client, test_setup, report_factory):
    item = report_factory(test_setup['security_officer'], suffix='9105')
    api_client.force_authenticate(user=test_setup['security_officer'])

    response = api_client.delete(f'/api/v1/items/{item.id}/withdraw/')

    assert response.status_code == status.HTTP_403_FORBIDDEN
    item.refresh_from_db()
    assert item.is_archived is False

    admin_item = report_factory(test_setup['campus_admin'], suffix='9112')
    api_client.force_authenticate(user=test_setup['campus_admin'])
    admin_response = api_client.delete(f'/api/v1/items/{admin_item.id}/withdraw/')
    assert admin_response.status_code == status.HTTP_403_FORBIDDEN
    admin_item.refresh_from_db()
    assert admin_item.is_archived is False


@pytest.mark.django_db
def test_withdrawal_is_blocked_by_active_or_approved_claim(api_client, test_setup, report_factory):
    item = report_factory(test_setup['student1'], suffix='9106')
    claim = Claim.objects.create(
        item=item,
        claimant=test_setup['student2'],
        statement='Ownership claim under security review.',
        claim_status=ClaimStatus.UNDER_REVIEW,
    )
    item.status = ItemStatus.CLAIM_IN_REVIEW
    item.save(update_fields=['status'])
    api_client.force_authenticate(user=test_setup['student1'])

    response = api_client.delete(f'/api/v1/items/{item.id}/withdraw/')

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.data['error']['code'] == 'ACTIVE_CLAIM'
    assert 'security review' in response.data['error']['message'].lower()
    item.refresh_from_db()
    claim.refresh_from_db()
    assert item.is_archived is False
    assert claim.claim_status == ClaimStatus.UNDER_REVIEW


@pytest.mark.django_db
def test_withdrawal_is_blocked_by_approved_release_and_handover(api_client, test_setup, report_factory):
    item = report_factory(test_setup['student1'], suffix='9107')
    claim = Claim.objects.create(
        item=item,
        claimant=test_setup['student2'],
        statement='Verified ownership claim.',
        claim_status=ClaimStatus.APPROVED,
        handover_otp='123456',
    )
    item.status = ItemStatus.READY_FOR_HANDOVER
    item.save(update_fields=['status'])
    api_client.force_authenticate(user=test_setup['student1'])

    response = api_client.delete(f'/api/v1/items/{item.id}/withdraw/')

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.data['error']['code'] == 'ACTIVE_CLAIM'
    item.refresh_from_db()
    assert item.is_archived is False

    # A handover record remains a hard blocker even if claim status data is stale.
    claim.claim_status = ClaimStatus.REJECTED
    claim.save(update_fields=['claim_status'])
    Handover.objects.create(
        item=item,
        claim=claim,
        recipient=test_setup['student2'],
        supervising_officer=test_setup['security_officer'],
        otp_hash='unused-test-hash',
        otp_expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        physical_desk_location='Central Security Desk',
        id_card_presented_type='PENDING_VERIFICATION',
        id_card_number_masked='PENDING',
    )
    response = api_client.delete(f'/api/v1/items/{item.id}/withdraw/')
    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.data['error']['code'] == 'HANDOVER_DEPENDENCY'
    item.refresh_from_db()
    assert item.is_archived is False


@pytest.mark.django_db
def test_withdrawal_is_blocked_by_custody_history_or_accepted_match(api_client, test_setup, report_factory):
    custody_item = report_factory(test_setup['student1'], suffix='9108')
    CustodyRecord.objects.create(
        item=custody_item,
        action=CustodyAction.INITIAL_INTAKE,
        from_location='Report location',
        to_location='Central Security Desk',
        handled_by=test_setup['security_officer'],
        remarks='Intake recorded.',
    )
    api_client.force_authenticate(user=test_setup['student1'])

    custody_response = api_client.delete(f'/api/v1/items/{custody_item.id}/withdraw/')
    assert custody_response.status_code == status.HTTP_409_CONFLICT
    assert custody_response.data['error']['code'] == 'CUSTODY_DEPENDENCY'
    custody_item.refresh_from_db()
    assert custody_item.is_archived is False

    matched_item = report_factory(test_setup['student1'], item_type=ItemType.LOST, item_status=ItemStatus.MATCH_PENDING, suffix='9109')
    found_item = report_factory(test_setup['student2'], item_type=ItemType.FOUND, suffix='9110')
    MatchSuggestion.objects.create(
        lost_item=matched_item,
        found_item=found_item,
        match_score=90,
        confidence='HIGH',
        explanation={},
        status=MatchStatus.ACCEPTED,
    )
    match_response = api_client.delete(f'/api/v1/items/{matched_item.id}/withdraw/')
    assert match_response.status_code == status.HTTP_409_CONFLICT
    assert match_response.data['error']['code'] == 'ACTIVE_MATCH'
    matched_item.refresh_from_db()
    assert matched_item.is_archived is False


@pytest.mark.django_db
def test_withdrawal_is_blocked_after_security_workflow_changes_item_status(api_client, test_setup, report_factory):
    item = report_factory(test_setup['student1'], item_status=ItemStatus.IN_CUSTODY, suffix='9111')
    api_client.force_authenticate(user=test_setup['student1'])

    response = api_client.delete(f'/api/v1/items/{item.id}/withdraw/')

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.data['error']['code'] == 'REPORT_WORKFLOW_ACTIVE'
    assert 'security' in response.data['error']['message'].lower()
    item.refresh_from_db()
    assert item.is_archived is False


@pytest.mark.django_db
def test_unaccepted_automated_match_does_not_block_independent_withdrawal(api_client, test_setup, report_factory):
    item = report_factory(
        test_setup['student1'],
        item_type=ItemType.LOST,
        item_status=ItemStatus.MATCH_PENDING,
        suffix='9113',
    )
    api_client.force_authenticate(user=test_setup['student1'])

    response = api_client.delete(f'/api/v1/items/{item.id}/withdraw/')

    assert response.status_code == status.HTTP_200_OK
    item.refresh_from_db()
    assert item.is_archived is True
    assert item.status == ItemStatus.MATCH_PENDING


@pytest.mark.django_db
def test_withdrawn_report_disappears_from_existing_match_results(api_client, test_setup, report_factory):
    lost_item = report_factory(test_setup['student1'], item_type=ItemType.LOST, suffix='9114')
    found_item = report_factory(test_setup['student2'], item_type=ItemType.FOUND, suffix='9115')
    MatchSuggestion.objects.create(
        lost_item=lost_item,
        found_item=found_item,
        match_score=80,
        confidence='HIGH',
        explanation={},
        status=MatchStatus.PENDING,
    )

    api_client.force_authenticate(user=test_setup['student2'])
    withdrawal = api_client.delete(f'/api/v1/items/{found_item.id}/withdraw/')
    assert withdrawal.status_code == status.HTTP_200_OK

    api_client.force_authenticate(user=test_setup['student1'])
    matches = api_client.get(f'/api/v1/items/{lost_item.id}/matches/')
    assert matches.status_code == status.HTTP_200_OK
    assert all(
        match['foundItem']['id'] != str(found_item.id)
        for match in matches.data
    )

@pytest.mark.django_db
def test_public_board_filtering_and_search(api_client, test_setup):
    """Verify multi-filtering and keyword search on the public board."""
    # 1. Filter by itemType
    res = api_client.get('/api/v1/items/', {'itemType': 'LOST'})
    assert res.status_code == status.HTTP_200_OK
    assert len(res.data['items']) == 1
    assert res.data['items'][0]['title'] == 'Blue Dell XPS Laptop'

    res = api_client.get('/api/v1/items/', {'itemType': 'FOUND'})
    assert res.status_code == status.HTTP_200_OK
    assert len(res.data['items']) == 2

    # 2. Filter by category
    res = api_client.get('/api/v1/items/', {'category': 'DOCUMENTS'})
    assert res.status_code == status.HTTP_200_OK
    assert len(res.data['items']) == 1
    assert res.data['items'][0]['title'] == 'LPU Student Identity Card'

    # 3. Filter by campusZone
    res = api_client.get('/api/v1/items/', {'campusZone': 'COMMERCIAL_HUB'})
    assert res.status_code == status.HTTP_200_OK
    assert len(res.data['items']) == 2

    # 4. Keyword search
    res = api_client.get('/api/v1/items/', {'search': 'AirPods'})
    assert res.status_code == status.HTTP_200_OK
    assert len(res.data['items']) == 1
    assert res.data['items'][0]['title'] == 'Apple AirPods Pro Gen 2'

    # Search by specific location
    res = api_client.get('/api/v1/items/', {'search': 'Food Court'})
    assert res.status_code == status.HTTP_200_OK
    assert len(res.data['items']) == 1

@pytest.mark.django_db
def test_public_board_sorting_and_pagination(api_client, test_setup):
    """Verify safe server-side ordering, stable tie-breakers, and pagination limit capping."""
    # 1. Sort by title ascending
    res = api_client.get('/api/v1/items/', {'sortBy': 'title', 'sortOrder': 'asc'})
    assert res.status_code == status.HTTP_200_OK
    titles = [it['title'] for it in res.data['items']]
    assert titles == sorted(titles)

    # 2. Sort by title descending
    res = api_client.get('/api/v1/items/', {'sortBy': 'title', 'sortOrder': 'desc'})
    assert res.status_code == status.HTTP_200_OK
    titles = [it['title'] for it in res.data['items']]
    assert titles == sorted(titles, reverse=True)

    # 3. Invalid sort field rejection / fallback
    res = api_client.get('/api/v1/items/', {'sortBy': 'sensitive_vault_column', 'sortOrder': 'asc'})
    assert res.status_code == status.HTTP_200_OK
    assert len(res.data['items']) == 3

    # 4. Pagination
    res = api_client.get('/api/v1/items/', {'page': 1, 'limit': 2})
    assert res.status_code == status.HTTP_200_OK
    assert len(res.data['items']) == 2
    assert res.data['pagination']['totalItems'] == 3
    assert res.data['pagination']['totalPages'] == 2
    assert res.data['pagination']['hasNextPage'] is True

    # Limit capped at safe maximum 100
    res = api_client.get('/api/v1/items/', {'limit': 500})
    assert res.status_code == status.HTTP_200_OK
    assert res.data['pagination']['limit'] == 100

@pytest.mark.django_db
def test_public_board_privacy_redaction(api_client, test_setup):
    """Ensure public endpoints never expose private vault data or challenge answers."""
    # Create private detail and verification challenge for item3
    vault = PrivateDetail(item=test_setup['item3'])
    vault.set_secret_payload({'secret': 'TEST_SECRET'})
    vault.save()

    challenge = VerificationChallenge(
        item=test_setup['item3'],
        question_text='What is the serial number of the case?',
    )
    challenge.set_answer('secret_123')
    challenge.save()

    res = api_client.get(f"/api/v1/items/{test_setup['item3'].id}/")
    assert res.status_code == status.HTTP_200_OK
    data = res.data

    # Verify public allowlist fields
    assert 'title' in data
    assert 'category' in data
    assert 'location' in data

    # Verify no private details leak
    assert 'encrypted_details' not in data
    assert 'encrypted_ciphertext' not in data
    assert 'privateVault' not in data
    assert 'privateIdentifyingDetails' not in data
    assert 'expectedAnswer' not in data
    assert 'hashed_answer' not in data

@pytest.mark.django_db
def test_create_report_with_private_vault_and_challenges(api_client, test_setup):
    """Verify reporting creates item, encrypts private vault details, and creates challenges."""
    api_client.force_authenticate(user=test_setup['student1'])

    payload = {
        'itemType': 'FOUND',
        'title': 'Found HP Wireless Mouse',
        'category': str(test_setup['cat_elec'].id),
        'location': str(test_setup['loc_b34'].id),
        'specificLocation': 'Table 4, Lab 301',
        'eventDate': datetime.now(timezone.utc).isoformat(),
        'publicDescription': 'Black wireless mouse found on computer desk',
        'privateIdentifyingDetails': 'Serial number under battery compartment is HP-882193',
        'verificationQuestions': [
            {'questionText': 'What brand of AA battery is inside?', 'expectedAnswer': 'Duracell'},
        ],
    }

    res = api_client.post('/api/v1/items/found/', payload, format='json')
    assert res.status_code == status.HTTP_201_CREATED
    assert res.data['referenceNumber'].startswith('LPU-')
    assert '-F' in res.data['referenceNumber']

    created_item = Item.objects.get(pk=res.data['id'])
    assert created_item.title == 'Found HP Wireless Mouse'
    assert created_item.reported_by == test_setup['student1']

    # Check PrivateDetail created and encrypted
    assert hasattr(created_item, 'private_detail')
    assert created_item.private_detail.encrypted_ciphertext != 'Serial number under battery compartment is HP-882193'
    assert 'HP-882193' not in created_item.private_detail.encrypted_ciphertext

    # Check challenge created with hashed answer
    challenges = created_item.verification_challenges.all()
    assert challenges.count() == 1
    assert challenges[0].question_text == 'What brand of AA battery is inside?'
    assert challenges[0].hashed_answer != 'Duracell'
    assert challenges[0].check_answer('Duracell') is True


def _report_submission_payload(test_setup, item_type=ItemType.LOST):
    return {
        'itemType': item_type,
        'title': f'{item_type.title()} daily limit test item',
        'category': str(test_setup['cat_elec'].id),
        'location': str(test_setup['loc_b34'].id),
        'specificLocation': 'Library entrance',
        'eventDate': datetime.now(timezone.utc).isoformat(),
        'publicDescription': 'A test item submitted through the report API.',
    }


@pytest.mark.django_db
def test_student_lost_report_limit_allows_three_and_blocks_fourth(api_client, test_setup, report_factory):
    student = test_setup['student2']
    # Withdrawn and terminal records are excluded from the active daily count.
    withdrawn = report_factory(student, suffix='9201')
    withdrawn.is_archived = True
    withdrawn.save(update_fields=['is_archived'])
    report_factory(student, item_status=ItemStatus.HANDED_OVER, suffix='9202')
    api_client.force_authenticate(user=student)

    allowance = api_client.get('/api/v1/items/daily-lost-report-limit/')
    assert allowance.status_code == status.HTTP_200_OK
    assert allowance.data == {
        'applies': True,
        'limit': 3,
        'submitted': 0,
        'remaining': 3,
        'localDate': datetime.now(ZoneInfo('Asia/Kolkata')).date().isoformat(),
    }

    for expected_remaining in (2, 1, 0):
        response = api_client.post(
            '/api/v1/items/lost/',
            _report_submission_payload(test_setup),
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        current = api_client.get('/api/v1/items/daily-lost-report-limit/')
        assert current.data['remaining'] == expected_remaining

    rejected = api_client.post(
        '/api/v1/items/lost/',
        _report_submission_payload(test_setup),
        format='json',
    )
    assert rejected.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert rejected.data['error']['code'] == 'DAILY_LOST_REPORT_LIMIT_REACHED'
    assert Item.objects.filter(
        reported_by=student,
        item_type=ItemType.LOST,
        is_archived=False,
        status=ItemStatus.REPORTED,
    ).count() == 3

    # The cap applies only to student LOST submissions; FOUND remains available.
    found = api_client.post(
        '/api/v1/items/found/',
        _report_submission_payload(test_setup, ItemType.FOUND),
        format='json',
    )
    assert found.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
def test_student_daily_lost_report_allowance_resets_at_local_midnight(api_client, test_setup, monkeypatch):
    student = test_setup['student2']
    api_client.force_authenticate(user=student)
    start_of_test = datetime(2026, 11, 4, 23, 55, tzinfo=ZoneInfo('Asia/Kolkata'))
    monkeypatch.setattr('django.utils.timezone.now', lambda: start_of_test)

    for _ in range(3):
        response = api_client.post(
            '/api/v1/items/lost/',
            _report_submission_payload(test_setup),
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED

    limit_reached = api_client.get('/api/v1/items/daily-lost-report-limit/')
    assert limit_reached.data['localDate'] == '2026-11-04'
    assert limit_reached.data['remaining'] == 0

    next_day = datetime(2026, 11, 5, 0, 1, tzinfo=ZoneInfo('Asia/Kolkata'))
    monkeypatch.setattr('django.utils.timezone.now', lambda: next_day)
    reset_allowance = api_client.get('/api/v1/items/daily-lost-report-limit/')
    assert reset_allowance.status_code == status.HTTP_200_OK
    assert reset_allowance.data['localDate'] == '2026-11-05'
    assert reset_allowance.data['submitted'] == 0
    assert reset_allowance.data['remaining'] == 3

    next_day_report = api_client.post(
        '/api/v1/items/lost/',
        _report_submission_payload(test_setup),
        format='json',
    )
    assert next_day_report.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
def test_staff_lost_report_submission_is_not_limited(api_client, test_setup):
    staff = test_setup['staff1']
    api_client.force_authenticate(user=staff)
    allowance = api_client.get('/api/v1/items/daily-lost-report-limit/')
    assert allowance.status_code == status.HTTP_200_OK
    assert allowance.data['applies'] is False

    for _ in range(4):
        response = api_client.post(
            '/api/v1/items/lost/',
            _report_submission_payload(test_setup),
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db(transaction=True)
def test_concurrent_student_lost_reports_do_not_bypass_daily_limit(test_setup, report_factory):
    if connection.vendor != 'postgresql':
        pytest.skip('Concurrent row-lock verification requires the configured PostgreSQL backend.')

    student = test_setup['student2']
    report_factory(student, suffix='9301')
    report_factory(student, suffix='9302')
    user_id = student.pk

    def submit_report():
        close_old_connections()
        try:
            from apps.accounts.models import User as TestUser
            client = APIClient()
            client.force_authenticate(user=TestUser.objects.get(pk=user_id))
            return client.post(
                '/api/v1/items/lost/',
                _report_submission_payload(test_setup),
                format='json',
            ).status_code
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: submit_report(), range(2)))

    assert sorted(results) == [status.HTTP_201_CREATED, status.HTTP_429_TOO_MANY_REQUESTS]


def _set_report_created_at(item, created_at):
    Item.objects.filter(pk=item.pk).update(created_at=created_at)
    item.refresh_from_db()


@pytest.mark.django_db
def test_30_day_expiration_archives_only_eligible_student_lost_reports(
    api_client, test_setup, report_factory
):
    now = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
    owner = test_setup['student1']

    twenty_nine_days_old = report_factory(owner, suffix='9401')
    _set_report_created_at(twenty_nine_days_old, now - timedelta(days=29))
    thirty_days_old = report_factory(owner, suffix='9402')
    _set_report_created_at(thirty_days_old, now - timedelta(days=30))
    found_report = report_factory(owner, item_type=ItemType.FOUND, suffix='9403')
    _set_report_created_at(found_report, now - timedelta(days=45))
    staff_report = report_factory(test_setup['staff1'], suffix='9404')
    _set_report_created_at(staff_report, now - timedelta(days=45))
    recovered_report = report_factory(
        owner,
        item_status=ItemStatus.HANDED_OVER,
        suffix='9405',
    )
    _set_report_created_at(recovered_report, now - timedelta(days=45))

    result = expire_overdue_student_lost_reports(now=now)

    assert result['expired'] == 1
    assert result['expiryDeadline'] == (now - timedelta(days=30)).isoformat()
    thirty_days_old.refresh_from_db()
    assert thirty_days_old.status == ItemStatus.EXPIRED
    assert thirty_days_old.is_archived is True
    assert thirty_days_old.reported_by_id == owner.id
    assert thirty_days_old.created_at == now - timedelta(days=30)

    twenty_nine_days_old.refresh_from_db()
    found_report.refresh_from_db()
    staff_report.refresh_from_db()
    recovered_report.refresh_from_db()
    assert twenty_nine_days_old.is_archived is False
    assert found_report.is_archived is False
    assert staff_report.is_archived is False
    assert recovered_report.is_archived is False

    audit = AuditEntry.objects.get(
        action=AuditAction.ITEM_REPORT_EXPIRE,
        target_id=str(thirty_days_old.id),
    )
    assert audit.actor_id is None
    assert audit.metadata['message'] == 'Report expired after 30 days without recovery.'
    assert audit.metadata['createdAt'] == thirty_days_old.created_at.isoformat()

    api_client.force_authenticate(user=owner)
    my_reports = api_client.get('/api/v1/items/my-reports/')
    assert my_reports.status_code == status.HTTP_200_OK
    visible_ids = {row['id'] for row in my_reports.data}
    assert str(thirty_days_old.id) not in visible_ids
    assert str(twenty_nine_days_old.id) in visible_ids

    public_board = api_client.get('/api/v1/items/', {'search': thirty_days_old.title})
    assert public_board.status_code == status.HTTP_200_OK
    assert all(row['id'] != str(thirty_days_old.id) for row in public_board.data['items'])
    assert api_client.get(f'/api/v1/items/{thirty_days_old.id}/').status_code == status.HTTP_404_NOT_FOUND

    api_client.force_authenticate(user=test_setup['student2'])
    rejected_claim = api_client.post(
        '/api/v1/claims/',
        {'itemId': str(thirty_days_old.id), 'statement': 'I can identify this item.'},
        format='json',
    )
    assert rejected_claim.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_30_day_expiration_protects_claim_handover_custody_and_accepted_match(
    test_setup, report_factory
):
    now = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
    owner = test_setup['student1']
    claimant = test_setup['student2']
    protected_items = [
        report_factory(owner, suffix='9411'),
        report_factory(owner, suffix='9412'),
        report_factory(owner, suffix='9413'),
        report_factory(owner, suffix='9414'),
        report_factory(owner, suffix='9415'),
    ]
    for item in protected_items:
        _set_report_created_at(item, now - timedelta(days=45))

    active_claim = Claim.objects.create(
        item=protected_items[0],
        claimant=claimant,
        statement='Claim under active review.',
        claim_status=ClaimStatus.UNDER_REVIEW,
    )
    Claim.objects.create(
        item=protected_items[1],
        claimant=claimant,
        statement='Approved for supervised release.',
        claim_status=ClaimStatus.APPROVED,
    )
    pending_claim = Claim.objects.create(
        item=protected_items[2],
        claimant=claimant,
        statement='Awaiting supervised handover.',
        claim_status=ClaimStatus.APPROVED,
    )
    pending_handover = Handover(
        item=protected_items[2],
        claim=pending_claim,
        recipient=claimant,
        supervising_officer=test_setup['security_officer'],
        otp_hash=make_password('unused-test-otp'),
        otp_expires_at=now + timedelta(hours=24),
        physical_desk_location='Central Security Desk',
        id_card_presented_type='Student ID',
        id_card_number_masked='****1002',
    )
    pending_handover.save()
    CustodyRecord.objects.create(
        item=protected_items[3],
        action=CustodyAction.INITIAL_INTAKE,
        to_location='Central Security Desk',
        handled_by=test_setup['security_officer'],
    )
    MatchSuggestion.objects.create(
        lost_item=protected_items[4],
        found_item=test_setup['item2'],
        match_score=95,
        confidence='HIGH',
        status=MatchStatus.ACCEPTED,
    )

    result = expire_overdue_student_lost_reports(now=now)

    assert result['expired'] == 0
    assert result['protected'] == 5
    active_claim.refresh_from_db()
    assert active_claim.claim_status == ClaimStatus.UNDER_REVIEW
    for item in protected_items:
        item.refresh_from_db()
        assert item.status == ItemStatus.REPORTED
        assert item.is_archived is False


@pytest.mark.django_db
def test_expiration_management_command_is_idempotent_and_keeps_history(
    test_setup, report_factory, monkeypatch
):
    now = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
    old_report = report_factory(test_setup['student1'], suffix='9421')
    _set_report_created_at(old_report, now - timedelta(days=31))
    monkeypatch.setattr('apps.items.services.django_timezone.now', lambda: now)

    first_output = StringIO()
    call_command('expire_student_lost_reports', stdout=first_output)
    second_output = StringIO()
    call_command('expire_student_lost_reports', stdout=second_output)

    old_report.refresh_from_db()
    assert old_report.status == ItemStatus.EXPIRED
    assert old_report.is_archived is True
    assert Item.objects.filter(pk=old_report.pk).exists()
    assert AuditEntry.objects.filter(
        action=AuditAction.ITEM_REPORT_EXPIRE,
        target_id=str(old_report.id),
    ).count() == 1
    assert '1 expired' in first_output.getvalue()
    assert '0 expired' in second_output.getvalue()


@pytest.mark.django_db
@pytest.mark.parametrize('owner_key', ['student1', 'staff1'])
@pytest.mark.parametrize('item_type', [ItemType.LOST, ItemType.FOUND])
def test_student_and_staff_reports_are_immediately_available_to_security(
    api_client, test_setup, owner_key, item_type
):
    owner = test_setup[owner_key]
    api_client.force_authenticate(user=owner)
    create_path = '/api/v1/items/lost/' if item_type == ItemType.LOST else '/api/v1/items/found/'
    created = api_client.post(
        create_path,
        _report_submission_payload(test_setup, item_type),
        format='json',
    )

    assert created.status_code == status.HTTP_201_CREATED
    assert created.data['status'] == ItemStatus.REPORTED
    new_item = Item.objects.get(pk=created.data['id'])
    assert new_item.reported_by_id == owner.id
    assert new_item.status == ItemStatus.REPORTED

    api_client.force_authenticate(user=test_setup['security_officer'])
    queue = api_client.get('/api/v1/security/reports/')
    assert queue.status_code == status.HTTP_200_OK
    report = next(row for row in queue.data['items'] if row['id'] == str(new_item.id))
    assert report['itemType'] == item_type
    assert report['title'] == new_item.title
    assert report['publicDescription'] == new_item.public_description
    assert report['category']['id'] == str(new_item.category_id)
    assert report['location']['id'] == str(new_item.location_id)
    assert report['specificLocation'] == new_item.specific_location
    assert report['status'] == ItemStatus.REPORTED
    assert report['createdAt']
    assert report['reporter'] == {
        'fullName': owner.full_name,
        'registrationNumber': owner.registration_number,
        'userType': owner.user_type,
    }

    filtered = api_client.get('/api/v1/security/reports/', {'itemType': item_type})
    assert filtered.status_code == status.HTTP_200_OK
    assert all(row['itemType'] == item_type for row in filtered.data['items'])


@pytest.mark.django_db
def test_security_report_queue_requires_security_and_excludes_inactive_states(
    api_client, test_setup, report_factory
):
    match_pending = report_factory(
        test_setup['student2'],
        item_status=ItemStatus.MATCH_PENDING,
        suffix='9501',
    )
    archived = report_factory(test_setup['student2'], suffix='9502')
    archived.is_archived = True
    archived.save(update_fields=['is_archived'])
    expired = report_factory(
        test_setup['student2'],
        item_status=ItemStatus.EXPIRED,
        suffix='9503',
    )
    expired.is_archived = True
    expired.save(update_fields=['is_archived'])
    claim_review = report_factory(
        test_setup['student2'],
        item_status=ItemStatus.CLAIM_IN_REVIEW,
        suffix='9504',
    )

    assert api_client.get('/api/v1/security/reports/').status_code == status.HTTP_401_UNAUTHORIZED
    api_client.force_authenticate(user=test_setup['student1'])
    assert api_client.get('/api/v1/security/reports/').status_code == status.HTTP_403_FORBIDDEN

    api_client.force_authenticate(user=test_setup['security_officer'])
    queue = api_client.get('/api/v1/security/reports/')
    visible_ids = {row['id'] for row in queue.data['items']}
    assert str(match_pending.id) in visible_ids
    assert str(archived.id) not in visible_ids
    assert str(expired.id) not in visible_ids
    assert str(claim_review.id) not in visible_ids

@pytest.mark.django_db
def test_item_update_permissions(api_client, test_setup):
    """Verify owner or admin can update report, while other users receive 403 Forbidden."""
    item = test_setup['item1']

    # 1. Unauthenticated -> 401
    res = api_client.patch(f"/api/v1/items/{item.id}/", {'title': 'Hacked Title'})
    assert res.status_code == status.HTTP_401_UNAUTHORIZED

    # 2. Non-owner student -> 403
    api_client.force_authenticate(user=test_setup['student2'])
    res = api_client.patch(f"/api/v1/items/{item.id}/", {'title': 'Unauthorized Update'})
    assert res.status_code == status.HTTP_403_FORBIDDEN

    # 3. Owner student -> 200 OK
    api_client.force_authenticate(user=test_setup['student1'])
    res = api_client.patch(f"/api/v1/items/{item.id}/", {'title': 'Updated Dell Laptop Title'})
    assert res.status_code == status.HTTP_200_OK
    item.refresh_from_db()
    assert item.title == 'Updated Dell Laptop Title'

@pytest.mark.django_db
def test_private_vault_view_authorization_and_audit(api_client, test_setup):
    """Verify private vault inspection is restricted to security/admins and records audit log."""
    item = test_setup['item1']
    vault = PrivateDetail(item=item)
    vault.set_secret_payload({'serial': 'TEST-SERIAL-44'})
    vault.save()

    # 1. Student cannot inspect private vault
    api_client.force_authenticate(user=test_setup['student1'])
    res = api_client.post(f"/api/v1/items/{item.id}/private-vault/view/", {'reason': 'Curious'})
    assert res.status_code == status.HTTP_403_FORBIDDEN

    # 2. Security officer can inspect with valid reason
    api_client.force_authenticate(user=test_setup['security_officer'])
    res = api_client.post(f"/api/v1/items/{item.id}/private-vault/view/", {'reason': 'Verifying claimant proof'})
    assert res.status_code == status.HTTP_200_OK

    # 3. Audit trail verification
    audit = AuditEntry.objects.filter(
        action=AuditAction.PRIVATE_VAULT_VIEW,
        target_id=str(vault.id),
    ).first()
    assert audit is not None
    assert audit.actor == test_setup['security_officer']
