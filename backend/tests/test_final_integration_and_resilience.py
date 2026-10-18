"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Test Suite: Final Integration, Resilience, Storage Failover & Search Verification
==============================================================================
"""

import pytest
from unittest.mock import patch
from datetime import datetime, timezone, timedelta
from django.db import OperationalError
from rest_framework.test import APIClient
from rest_framework import status

from apps.accounts.models import User, UserRole
from apps.items.models import ItemCategory, Item, ItemType, ItemStatus
from apps.locations.models import Location
from apps.verification.models import VerificationChallenge, PrivateDetail
from apps.claims.models import Claim, ClaimStatus
from apps.handovers.models import Handover
from apps.custody.models import CustodyRecord, CustodyAction

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def test_data(db):
    student1 = User.objects.create_user(
        email='student1.test@lpu.in',
        registration_number='12108801',
        full_name='Student One',
        password='Password@123',
        role=UserRole.STUDENT_STAFF,
    )
    student2 = User.objects.create_user(
        email='student2.test@lpu.in',
        registration_number='12108802',
        full_name='Student Two',
        password='Password@123',
        role=UserRole.STUDENT_STAFF,
    )
    security = User.objects.create_user(
        email='security.test@lpu.in',
        registration_number='SEC8801',
        full_name='Security Officer',
        password='Password@123',
        role=UserRole.SECURITY_PERSONNEL,
        security_post='Main Gate Desk',
    )
    admin = User.objects.create_user(
        email='admin.test@lpu.in',
        registration_number='ADM8801',
        full_name='Admin User',
        password='Password@123',
        role=UserRole.CAMPUS_ADMIN,
    )

    cat_elec = ItemCategory.objects.create(code='ELECTRONICS', name='Electronics', default_retention_days=90)
    cat_wallet = ItemCategory.objects.create(code='WALLETS_PURSE', name='Wallets & Purses', default_retention_days=60)
    cat_keys = ItemCategory.objects.create(code='KEYS', name='Keys', default_retention_days=30)
    cat_docs = ItemCategory.objects.create(code='DOCUMENTS_BOOKS', name='Documents & Books', default_retention_days=180)

    loc_block34 = Location.objects.create(code='BLOCK_30_38', name='Block 34 Academic', campus_zone='ACADEMIC_ZONE')
    loc_mall = Location.objects.create(code='UNI_MALL', name='UniMall Complex', campus_zone='COMMERCIAL_ZONE')

    return {
        'student1': student1,
        'student2': student2,
        'security': security,
        'admin': admin,
        'cat_elec': cat_elec,
        'cat_wallet': cat_wallet,
        'cat_keys': cat_keys,
        'cat_docs': cat_docs,
        'loc_block34': loc_block34,
        'loc_mall': loc_mall,
    }

# -----------------------------------------------------------------------------
# 1. Resilience: Missing Database Credentials & Storage Failover
# -----------------------------------------------------------------------------

@pytest.mark.django_db
def test_health_check_database_unreachable_safe_degradation(api_client):
    """Verify health endpoint reports degraded status gracefully when DB fails."""
    with patch('django.db.connection.ensure_connection', side_effect=OperationalError('DB connection refused')):
        res = api_client.get('/api/v1/health')
        assert res.status_code == 503
        data = res.json()
        assert data['success'] is False
        assert data['data']['status'] == 'DEGRADED'
        assert data['data']['database']['connected'] is False
        assert data['data']['database']['state'] == 'FAILED'

@pytest.mark.django_db
def test_image_upload_unavailable_external_storage_safe_error(api_client, test_data):
    """Verify image upload returns 503 STORAGE_UNAVAILABLE cleanly if disk/cloud storage fails."""
    api_client.force_authenticate(user=test_data['student1'])
    from django.core.files.uploadedfile import SimpleUploadedFile
    dummy_image = SimpleUploadedFile("test.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82", content_type="image/png")

    with patch('apps.items.views.process_and_store_image', side_effect=IOError('S3/NFS volume unreachable')):
        res = api_client.post('/api/v1/items/upload', {'image': dummy_image}, format='multipart')
        assert res.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        data = res.json()
        assert data['success'] is False
        assert data['error']['code'] == 'STORAGE_UNAVAILABLE'
        assert 'storage unavailable' in data['error']['message'].lower()

# -----------------------------------------------------------------------------
# 2. State Machine: Duplicate Handover & Invalid State Transitions
# -----------------------------------------------------------------------------

@pytest.mark.django_db
def test_duplicate_handover_and_invalid_state_transition(api_client, test_data):
    """Test duplicate handover prevention and invalid claim transitions."""
    now = datetime.now(timezone.utc)
    item = Item.objects.create(
        reference_number='LPU-2026-F99881',
        item_type=ItemType.FOUND,
        title='Titan Watch',
        category=test_data['cat_elec'],
        location=test_data['loc_mall'],
        event_date=now,
        retention_expires_at=now + timedelta(days=90),
        status=ItemStatus.READY_FOR_HANDOVER,
        reported_by=test_data['student1'],
    )
    claim = Claim.objects.create(
        item=item,
        claimant=test_data['student2'],
        claim_status=ClaimStatus.APPROVED,
        statement='Titan silver watch with black dial',
    )
    handover = Handover.objects.create(
        item=item,
        claim=claim,
        recipient=test_data['student2'],
        supervising_officer=test_data['security'],
        physical_desk_location='Main Gate Security',
        id_card_presented_type='STUDENT_ID',
        id_card_number_masked='12****8802',
        otp_hash='some_hash',
        otp_expires_at=now + timedelta(hours=24),
        is_completed=True,
        completed_at=now,
    )
    item.status = ItemStatus.HANDED_OVER
    item.save()
    claim.claim_status = ClaimStatus.COMPLETED
    claim.save()

    # Attempt second handover on the same claim
    api_client.force_authenticate(user=test_data['security'])
    res = api_client.post('/api/v1/handovers/verify-otp', {
        'claimId': str(claim.id),
        'otp': '123456',
        'physicalDeskLocation': 'Main Gate Security',
        'idCardPresentedType': 'STUDENT_ID',
        'idCardNumber': '12108802',
    })
    assert res.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_409_CONFLICT)
    data = res.json()
    assert data['success'] is False
    assert data['error']['code'] in ('DUPLICATE_HANDOVER', 'CONFLICT', 'INVALID_STATUS')

    # Attempt to review claim that is already COMPLETED
    res_review = api_client.patch(f'/api/v1/claims/{claim.id}/review', {
        'action': 'APPROVE',
        'reviewNotes': 'Re-approving completed claim should fail',
    })
    assert res_review.status_code == status.HTTP_400_BAD_REQUEST
    assert res_review.json()['error']['code'] in ('INVALID_STATUS', 'VALIDATION_ERROR')

# -----------------------------------------------------------------------------
# 3. Privacy & Unauthorized Access Redaction
# -----------------------------------------------------------------------------

@pytest.mark.django_db
def test_private_data_redaction_and_unauthorized_access(api_client, test_data):
    """Verify zero private data leakage to public or unauthorized actors."""
    now = datetime.now(timezone.utc)
    item = Item.objects.create(
        reference_number='LPU-2026-F99882',
        item_type=ItemType.FOUND,
        title='MacBook Air M2',
        public_description='Silver laptop with sticker on back',
        category=test_data['cat_elec'],
        location=test_data['loc_block34'],
        event_date=now,
        retention_expires_at=now + timedelta(days=90),
        status=ItemStatus.REPORTED,
        reported_by=test_data['student1'],
    )
    vault = PrivateDetail.objects.create(
        item=item,
        fields_summary=['serialNumber', 'passcodeHint'],
    )
    vault.set_secret_payload({'serialNumber': 'C02XYZ123456', 'passcodeHint': 'birth year'})
    vault.save()

    challenge = VerificationChallenge.objects.create(
        item=item,
        question_text='What is the sticker on the back of the laptop?',
        hint='Tech logo',
    )
    challenge.set_answer('Python')
    challenge.save()

    # Public unauthenticated user views item
    res_pub = api_client.get(f'/api/v1/items/{item.id}')
    assert res_pub.status_code == 200
    pub_data = res_pub.json()['data']
    assert 'privateVault' not in pub_data
    assert 'encryptedCiphertext' not in str(pub_data)
    assert 'C02XYZ123456' not in str(pub_data)

    # Public challenges endpoint exposes question and hint, but never the answer
    res_chal = api_client.get(f'/api/v1/items/{item.id}/challenges')
    assert res_chal.status_code == 200
    chal_data = res_chal.json()['data']
    assert len(chal_data) == 1
    assert chal_data[0]['questionText'] == 'What is the sticker on the back of the laptop?'
    assert 'Python' not in str(chal_data)
    assert 'hashedAnswer' not in chal_data[0]

    # Student 2 attempts to decrypt student 1's private vault
    api_client.force_authenticate(user=test_data['student2'])
    res_vault = api_client.post(f'/api/v1/items/{item.id}/private-vault/view')
    assert res_vault.status_code == status.HTTP_403_FORBIDDEN

    # Student 2 attempts to edit Student 1's report
    res_edit = api_client.patch(f'/api/v1/items/{item.id}', {'title': 'Hacked Title'})
    assert res_edit.status_code == status.HTTP_403_FORBIDDEN

    # Security officer CAN decrypt private vault
    api_client.force_authenticate(user=test_data['security'])
    res_sec_vault = api_client.post(f'/api/v1/items/{item.id}/private-vault/view')
    assert res_sec_vault.status_code == 200
    sec_data = res_sec_vault.json()['data']
    assert 'C02XYZ123456' in str(sec_data['decryptedContent'])

# -----------------------------------------------------------------------------
# 4. Realistic Fictional Data: Pagination, Filtering, Ordering & Search
# -----------------------------------------------------------------------------

@pytest.mark.django_db
def test_pagination_filters_ordering_and_search_fictional_data(api_client, test_data):
    """Test realistic search board behavior with 12 fictional items."""
    now = datetime.now(timezone.utc)
    items_to_create = [
        ('Dell XPS 15 Laptop', ItemType.LOST, test_data['cat_elec'], test_data['loc_block34'], now - timedelta(days=1)),
        ('HP Pavilion Laptop', ItemType.FOUND, test_data['cat_elec'], test_data['loc_mall'], now - timedelta(days=2)),
        ('Sony WH-1000XM4 Headphones', ItemType.LOST, test_data['cat_elec'], test_data['loc_block34'], now - timedelta(days=3)),
        ('Tommy Hilfiger Brown Wallet', ItemType.FOUND, test_data['cat_wallet'], test_data['loc_mall'], now - timedelta(days=4)),
        ('Wildcraft Black Wallet', ItemType.LOST, test_data['cat_wallet'], test_data['loc_block34'], now - timedelta(days=5)),
        ('Honda Activa Scooter Keys', ItemType.FOUND, test_data['cat_keys'], test_data['loc_mall'], now - timedelta(days=6)),
        ('Hostel Room 412 Door Key', ItemType.LOST, test_data['cat_keys'], test_data['loc_block34'], now - timedelta(days=7)),
        ('Engineering Mathematics Calculus Book', ItemType.FOUND, test_data['cat_docs'], test_data['loc_block34'], now - timedelta(days=8)),
        ('Data Structures in C++ Textbook', ItemType.LOST, test_data['cat_docs'], test_data['loc_mall'], now - timedelta(days=9)),
        ('Apple iPad Pro 11-inch', ItemType.LOST, test_data['cat_elec'], test_data['loc_mall'], now - timedelta(days=10)),
        ('Titan Regalia Wristwatch', ItemType.FOUND, test_data['cat_elec'], test_data['loc_block34'], now - timedelta(days=11)),
        ('LPU Student Identity Card', ItemType.FOUND, test_data['cat_docs'], test_data['loc_mall'], now - timedelta(days=12)),
    ]

    for i, (title, itype, cat, loc, edate) in enumerate(items_to_create):
        Item.objects.create(
            reference_number=f"LPU-2026-T{itype[0]}{1000 + i}",
            item_type=itype,
            title=title,
            public_description=f"Campus report for {title} in {loc.name}",
            category=cat,
            location=loc,
            event_date=edate,
            retention_expires_at=now + timedelta(days=90),
            status=ItemStatus.REPORTED,
            reported_by=test_data['student1'],
        )

    # 1. Test search query
    res_search = api_client.get('/api/v1/items?search=Laptop')
    assert res_search.status_code == 200
    search_data = res_search.json()['data']
    assert len(search_data['items']) == 2
    for item in search_data['items']:
        assert 'laptop' in item['title'].lower()

    # 2. Test category filter
    res_cat = api_client.get(f'/api/v1/items?category={test_data["cat_wallet"].id}')
    assert res_cat.status_code == 200
    cat_items = res_cat.json()['data']['items']
    assert len(cat_items) == 2
    for item in cat_items:
        assert item['category']['code'] == 'WALLETS_PURSE'

    # 3. Test itemType filter
    res_found = api_client.get('/api/v1/items?itemType=FOUND')
    assert res_found.status_code == 200
    found_items = res_found.json()['data']['items']
    assert len(found_items) == 6
    for item in found_items:
        assert item['itemType'] == 'FOUND'

    # 4. Test ordering by eventDate ascending
    res_ordered = api_client.get('/api/v1/items?sortBy=eventDate&sortOrder=asc&limit=12')
    assert res_ordered.status_code == 200
    ordered_items = res_ordered.json()['data']['items']
    dates = [item['eventDate'] for item in ordered_items]
    assert dates == sorted(dates)

    # 5. Test pagination
    res_p1 = api_client.get('/api/v1/items?page=1&limit=5')
    assert res_p1.status_code == 200
    p1_data = res_p1.json()['data']
    assert len(p1_data['items']) == 5
    assert p1_data['pagination']['totalItems'] == 12
    assert p1_data['pagination']['totalPages'] == 3
    assert p1_data['pagination']['hasNextPage'] is True
    assert p1_data['pagination']['hasPrevPage'] is False

    res_p3 = api_client.get('/api/v1/items?page=3&limit=5')
    assert res_p3.status_code == 200
    p3_data = res_p3.json()['data']
    assert len(p3_data['items']) == 2
    assert p3_data['pagination']['hasNextPage'] is False
    assert p3_data['pagination']['hasPrevPage'] is True
