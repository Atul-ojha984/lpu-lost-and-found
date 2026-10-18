"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Test Suite: Items App REST APIs, Public Board, Filtering, Privacy & Vault
==============================================================================
"""

import pytest
from datetime import datetime, timezone, timedelta
from rest_framework.test import APIClient
from rest_framework import status
from apps.accounts.models import User, UserRole
from apps.items.models import ItemCategory, Item, ItemType, ItemStatus
from apps.locations.models import Location
from apps.verification.models import PrivateDetail, VerificationChallenge
from apps.audit.models import AuditEntry, AuditAction

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
    )
    student2 = User.objects.create_user(
        email='student2@lpu.in',
        registration_number='12101002',
        full_name='Priya Patel',
        password='Password123!',
        role=UserRole.STUDENT_STAFF,
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
