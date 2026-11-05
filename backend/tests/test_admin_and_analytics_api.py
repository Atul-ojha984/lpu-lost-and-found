"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Test Suite: Admin Analytics, Security Dashboard, Retention & User Governance
==============================================================================
"""

import pytest
from datetime import datetime, timezone, timedelta
from rest_framework.test import APIClient
from rest_framework import status

from apps.accounts.models import User, UserRole, UserType
from apps.items.models import ItemCategory, Item, ItemType, ItemStatus
from apps.locations.models import Location
from apps.claims.models import Claim, ClaimStatus
from apps.disposal.models import DisposalRecord, DisposalMethod
from apps.custody.models import CustodyRecord, CustodyAction
from apps.audit.models import AuditEntry, AuditAction

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def admin_setup(db):
    admin = User.objects.create_user(
        email='super.admin@lpu.in',
        registration_number='ADM9999',
        full_name='Chief Campus Administrator',
        password='Password123!',
        role=UserRole.CAMPUS_ADMIN,
        user_type=UserType.CAMPUS_ADMIN,
    )
    security_officer = User.objects.create_user(
        email='officer.sec@lpu.in',
        registration_number='SEC9999',
        full_name='Officer Ram',
        password='Password123!',
        role=UserRole.SECURITY_PERSONNEL,
        user_type=UserType.SECURITY_OFFICER,
        security_post='Uni-Mall Gate',
    )
    student = User.objects.create_user(
        email='student.target@lpu.in',
        registration_number='12104001',
        full_name='Target Student',
        password='Password123!',
        role=UserRole.STUDENT_STAFF,
        user_type=UserType.STUDENT,
        department='Computer Science',
    )

    cat = ItemCategory.objects.create(code='ACCESSORIES', name='Accessories', default_retention_days=90)
    loc = Location.objects.create(code='UNI_HOSPITAL', name='University Hospital', campus_zone='HEALTH_CARE')

    now = datetime.now(timezone.utc)

    # 1. Active found item in custody
    item_in_custody = Item.objects.create(
        reference_number='LPU-F-20261018-8001',
        item_type=ItemType.FOUND,
        title='Found RayBan Sunglasses',
        category=cat,
        location=loc,
        specific_location='Waiting Room',
        event_date=now - timedelta(days=20),
        public_description='Black aviator sunglasses',
        status=ItemStatus.IN_CUSTODY,
        current_custody_desk='Hospital Security Desk',
        reported_by=student,
        retention_expires_at=now + timedelta(days=70),
    )

    # 2. Ageing found item overdue past retention (>90 days old)
    item_overdue = Item.objects.create(
        reference_number='LPU-F-20261018-8002',
        item_type=ItemType.FOUND,
        title='Old Water Bottle',
        category=cat,
        location=loc,
        specific_location='Corridor 2',
        event_date=now - timedelta(days=120),
        public_description='Steel water bottle',
        status=ItemStatus.IN_CUSTODY,
        current_custody_desk='Central Repository',
        reported_by=student,
        retention_expires_at=now - timedelta(days=30),
    )

    # 3. Handed over item
    item_returned = Item.objects.create(
        reference_number='LPU-F-20261018-8003',
        item_type=ItemType.FOUND,
        title='Returned Calculator',
        category=cat,
        location=loc,
        specific_location='Pharmacy Desk',
        event_date=now - timedelta(days=5),
        public_description='Scientific calculator',
        status=ItemStatus.HANDED_OVER,
        reported_by=student,
        retention_expires_at=now + timedelta(days=85),
    )

    # Claim for item_in_custody
    Claim.objects.create(
        item=item_in_custody,
        claimant=student,
        statement='My sunglasses',
        claim_status=ClaimStatus.UNDER_REVIEW,
    )

    # Audit entry
    AuditEntry.objects.create(
        actor=admin,
        actor_role=admin.role,
        action=AuditAction.CONFIG_UPDATE,
        target_entity='Platform',
        target_id='SYSTEM',
        ip_address='127.0.0.1',
        metadata={'param': 'retention_window'},
    )

    return {
        'admin': admin,
        'security_officer': security_officer,
        'student': student,
        'cat': cat,
        'loc': loc,
        'item_in_custody': item_in_custody,
        'item_overdue': item_overdue,
        'item_returned': item_returned,
    }

@pytest.mark.django_db
def test_security_dashboard_stats_and_audit_trail(api_client, admin_setup):
    """Test security stats aggregation and audit trail queries."""
    api_client.force_authenticate(user=admin_setup['security_officer'])

    # 1. Dashboard stats
    res = api_client.get('/api/v1/security/dashboard-stats/')
    assert res.status_code == status.HTTP_200_OK
    data = res.data['data']
    assert data['pendingClaimsCount'] == 1
    assert data['custodyInventoryCount'] >= 2
    assert data['completedHandoversCount'] == 1
    assert len(data['recentAuditEvents']) >= 1

    # 2. Audit trail
    res_trail = api_client.get('/api/v1/security/audit-trail/')
    assert res_trail.status_code == status.HTTP_200_OK
    assert len(res_trail.data['data']) >= 1

@pytest.mark.django_db
def test_admin_analytics_dashboard(api_client, admin_setup):
    """Test live admin analytics metrics calculated directly from database records."""
    api_client.force_authenticate(user=admin_setup['admin'])

    res = api_client.get('/api/v1/admin/analytics/')
    assert res.status_code == status.HTTP_200_OK
    data = res.data['data']

    # Overview metrics
    overview = data['overview']
    assert overview['totalFound'] == 3
    assert overview['itemsReturned'] == 1
    assert overview['returnRatePercent'] > 0

    # Ageing brackets
    ageing = data['ageing']['brackets']
    assert ageing['over90Days'] >= 1
    assert ageing['under30Days'] >= 1

    # Category distribution
    cat_dist = data['categoryDistribution']
    assert len(cat_dist) >= 1
    assert cat_dist[0]['categoryCode'] == 'ACCESSORIES'

@pytest.mark.django_db
def test_admin_retention_ageing_queue(api_client, admin_setup):
    """Test ageing queue and escalation state classifications."""
    api_client.force_authenticate(user=admin_setup['admin'])

    res = api_client.get('/api/v1/admin/retention/queue/')
    assert res.status_code == status.HTTP_200_OK
    data = res.data['data']
    items = data['items']
    assert len(items) >= 2

    # Check overdue item has escalation state DISPOSAL_PENDING
    overdue_item_entry = next(it for it in items if it['referenceNumber'] == 'LPU-F-20261018-8002')
    assert overdue_item_entry['escalationState'] == 'DISPOSAL_PENDING'
    assert overdue_item_entry['isRetentionExpired'] is True

    # Check filter by escalationState
    res_filtered = api_client.get('/api/v1/admin/retention/queue/', {'escalationState': 'DISPOSAL_PENDING'})
    assert res_filtered.status_code == status.HTTP_200_OK
    assert all(it['escalationState'] == 'DISPOSAL_PENDING' for it in res_filtered.data['data']['items'])

@pytest.mark.django_db
def test_admin_disposal_approval(api_client, admin_setup):
    """Test formal property disposal approval by administrator."""
    api_client.force_authenticate(user=admin_setup['admin'])
    item_overdue = admin_setup['item_overdue']

    payload = {
        'itemId': str(item_overdue.id),
        'method': 'DONATION',
        'reason': 'Statutory retention window elapsed with zero claims. Donating to student charity.',
        'recipientOrganization': 'LPU Student Welfare Red Cross',
        'certificateUrl': 'https://lpu-storage.internal/certificates/disp-8812.pdf',
    }

    res = api_client.post('/api/v1/admin/disposal/approve/', payload, format='json')
    assert res.status_code == status.HTTP_200_OK

    item_overdue.refresh_from_db()
    assert item_overdue.status == ItemStatus.DISPOSED
    assert item_overdue.is_archived is True

    # DisposalRecord created
    disp_rec = DisposalRecord.objects.filter(item=item_overdue).first()
    assert disp_rec is not None
    assert disp_rec.method == DisposalMethod.DONATION
    assert disp_rec.approved_by == admin_setup['admin']

    # Duplicate disposal prevention
    res_dup = api_client.post('/api/v1/admin/disposal/approve/', payload, format='json')
    assert res_dup.status_code == status.HTTP_400_BAD_REQUEST

@pytest.mark.django_db
def test_admin_user_governance_and_self_guards(api_client, admin_setup):
    """Test user administration, role assignment, and self-demotion/deactivation guard."""
    admin = admin_setup['admin']
    student = admin_setup['student']

    api_client.force_authenticate(user=admin)

    # 1. List users
    res = api_client.get('/api/v1/admin/users/')
    assert res.status_code == status.HTTP_200_OK
    assert len(res.data['data']) >= 3

    # 2. Admin cannot deactivate own account
    res_self_deact = api_client.patch(f"/api/v1/admin/users/{admin.id}/", {'isActive': False}, format='json')
    assert res_self_deact.status_code == status.HTTP_400_BAD_REQUEST
    assert 'cannot deactivate' in res_self_deact.data['error']['message'].lower()

    # 3. Admin cannot demote own role
    res_self_demote = api_client.patch(f"/api/v1/admin/users/{admin.id}/", {'role': 'STUDENT_STAFF'}, format='json')
    assert res_self_demote.status_code == status.HTTP_400_BAD_REQUEST
    assert 'cannot demote' in res_self_demote.data['error']['message'].lower()

    res_self_type_change = api_client.patch(
        f"/api/v1/admin/users/{admin.id}/",
        {'userType': UserType.STUDENT},
        format='json',
    )
    assert res_self_type_change.status_code == status.HTTP_400_BAD_REQUEST
    admin.refresh_from_db()
    assert admin.role == UserRole.CAMPUS_ADMIN
    assert admin.user_type == UserType.CAMPUS_ADMIN

    # 4. Admin successfully promotes student to security personnel
    res_promote = api_client.patch(
        f"/api/v1/admin/users/{student.id}/",
        {'role': 'SECURITY_PERSONNEL', 'securityPost': 'Block 34 Guard Post'},
        format='json'
    )
    assert res_promote.status_code == status.HTTP_200_OK
    student.refresh_from_db()
    assert student.role == UserRole.SECURITY_PERSONNEL
    assert student.security_post == 'Block 34 Guard Post'

@pytest.mark.django_db
def test_admin_can_create_student_staff_and_security_accounts(api_client, admin_setup):
    admin = admin_setup['admin']
    api_client.force_authenticate(user=admin)

    definitions = [
        ('STUDENT', 'Student Account', '12107001', 'new.student@lpu.in', UserRole.STUDENT_STAFF),
        ('STAFF', 'Staff Account', 'STF07002', 'new.staff@lpu.in', UserRole.STUDENT_STAFF),
        ('SECURITY_OFFICER', 'Security Account', 'SEC07003', 'new.officer@lpu.in', UserRole.SECURITY_PERSONNEL),
    ]
    created = {}
    for account_type, full_name, registration, email, role in definitions:
        response = api_client.post(
            '/api/v1/admin/users/',
            {
                'fullName': full_name,
                'registrationNumber': registration,
                'email': email,
                'userType': account_type,
                'password': 'InitialCampusPassword@2026',
                'department': 'Campus Test Department',
                'securityPost': 'North Security Desk' if account_type == 'SECURITY_OFFICER' else '',
                'isActive': True,
            },
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert 'password' not in response.data['data']
        user = User.objects.get(email=email)
        created[account_type] = user
        assert user.full_name == full_name
        assert user.registration_number == registration
        assert user.role == role
        assert user.user_type == account_type
        assert user.is_active is True
        assert user.check_password('InitialCampusPassword@2026')

    assert AuditEntry.objects.filter(
        actor=admin,
        action=AuditAction.USER_REGISTER,
        target_id=str(created['STUDENT'].id),
    ).exists()

    # Administrators retain the existing activate/deactivate controls.
    deactivated = api_client.patch(
        f"/api/v1/admin/users/{created['STAFF'].id}/",
        {'isActive': False},
        format='json',
    )
    assert deactivated.status_code == status.HTTP_200_OK
    created['STAFF'].refresh_from_db()
    assert created['STAFF'].is_active is False
    reactivated = api_client.patch(
        f"/api/v1/admin/users/{created['STAFF'].id}/",
        {'isActive': True},
        format='json',
    )
    assert reactivated.status_code == status.HTTP_200_OK
    created['STAFF'].refresh_from_db()
    assert created['STAFF'].is_active is True

    listed_staff = api_client.get('/api/v1/admin/users/?userType=STAFF')
    assert listed_staff.status_code == status.HTTP_200_OK
    assert any(record['id'] == str(created['STAFF'].id) for record in listed_staff.data['data'])

@pytest.mark.django_db
def test_non_admin_roles_cannot_manage_accounts_or_change_roles(api_client, admin_setup):
    student = admin_setup['student']
    security = admin_setup['security_officer']
    staff = User.objects.create_user(
        email='staff.member@lpu.in',
        registration_number='STF9200',
        full_name='Staff Member',
        password='Password123!',
        role=UserRole.STUDENT_STAFF,
        user_type=UserType.STAFF,
    )
    target = student
    payload = {
        'fullName': 'Unauthorized Account',
        'registrationNumber': 'UNAUTH9200',
        'email': 'unauthorized@lpu.in',
        'userType': 'STUDENT',
        'password': 'InitialCampusPassword@2026',
    }

    for user in (student, staff, security):
        api_client.force_authenticate(user=user)
        assert api_client.post('/api/v1/admin/users/', payload, format='json').status_code == status.HTTP_403_FORBIDDEN
        assert api_client.get('/api/v1/admin/users/').status_code == status.HTTP_403_FORBIDDEN
        assert api_client.patch(
            f'/api/v1/admin/users/{target.id}/',
            {'role': UserRole.SECURITY_PERSONNEL},
            format='json',
        ).status_code == status.HTTP_403_FORBIDDEN
        assert not User.objects.filter(registration_number='UNAUTH9200').exists()

    api_client.force_authenticate(user=None)
    assert api_client.post('/api/v1/admin/users/', payload, format='json').status_code in (
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
    )
