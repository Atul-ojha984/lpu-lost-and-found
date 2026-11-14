import uuid

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole
from apps.core.db_transactions import transaction
from apps.audit.models import AuditAction, AuditEntry, Notification
from apps.items.models import Item, ItemCategory, ItemType
from apps.locations.models import Location
from apps.matching.models import MatchConfidence, MatchSuggestion


def make_user(registration_number, role=UserRole.STUDENT_STAFF):
    return User.objects.create_user(
        email=f'{registration_number.lower()}@lpu.test',
        registration_number=registration_number,
        full_name=f'Test {registration_number}',
        password='GoodPass123!',
        role=role,
    )


def make_audit(actor, action, target_entity, metadata=None):
    return AuditEntry.objects.create(
        actor=actor,
        actor_role=actor.role,
        action=action,
        target_entity=target_entity,
        target_id=str(uuid.uuid4()),
        ip_address='127.0.0.1',
        user_agent='notification-test',
        metadata=metadata or {},
    )


@pytest.mark.django_db(transaction=True)
def test_notifications_are_scoped_incremental_and_read_state_persists():
    student = make_user('STU-NOTIF-1')
    other_student = make_user('STU-NOTIF-2')
    security = make_user('SEC-NOTIF-1', UserRole.SECURITY_PERSONNEL)
    admin_actor = make_user('ADM-NOTIF-1', UserRole.CAMPUS_ADMIN)
    admin_recipient = make_user('ADM-NOTIF-2', UserRole.SYSTEM_ADMIN)

    first_audit = make_audit(student, AuditAction.ITEM_REPORT_LOST, 'Item')
    assert Notification.objects.filter(source_audit_entry=first_audit).count() == 4

    client = APIClient()
    client.force_authenticate(user=student)
    first_feed = client.get('/api/v1/notifications/')
    assert first_feed.status_code == 200
    assert first_feed.data['unreadCount'] == 1
    assert first_feed.data['items'][0]['eventType'] == 'REPORT_SUBMITTED'
    first_notification_id = first_feed.data['items'][0]['id']
    cursor = first_feed.data['nextCursor']

    # The cursor exposes the newly committed event without resending older rows.
    make_audit(student, AuditAction.ITEM_REPORT_FOUND, 'Item')
    incremental = client.get('/api/v1/notifications/', {'cursor': cursor})
    assert incremental.status_code == 200
    assert len(incremental.data['items']) == 1
    assert incremental.data['items'][0]['eventType'] == 'REPORT_SUBMITTED'
    assert incremental.data['unreadCount'] == 2

    read = client.post(f'/api/v1/notifications/{first_notification_id}/read/')
    assert read.status_code == 200
    assert read.data['unreadCount'] == 1
    assert Notification.objects.get(pk=first_notification_id).read_at is not None

    client.force_authenticate(user=other_student)
    private_feed = client.get('/api/v1/notifications/')
    assert private_feed.status_code == 200
    assert private_feed.data['items'] == []
    assert private_feed.data['unreadCount'] == 0
    denied_read = client.post(f'/api/v1/notifications/{first_notification_id}/read/')
    assert denied_read.status_code == 404

    client.force_authenticate(user=security)
    security_feed = client.get('/api/v1/notifications/')
    assert security_feed.status_code == 200
    assert [item['eventType'] for item in security_feed.data['items']] == ['NEW_REPORT', 'NEW_REPORT']
    assert all(item['targetPath'] == '/security/custody?tab=reports' for item in security_feed.data['items'])

    security.role = UserRole.STUDENT_STAFF
    security.save(update_fields=['role', 'updated_at'])
    client.force_authenticate(user=security)
    reassigned_feed = client.get('/api/v1/notifications/')
    assert reassigned_feed.status_code == 200
    assert reassigned_feed.data['items'] == []

    admin_audit = make_audit(admin_actor, AuditAction.USER_REGISTER, 'User')
    assert Notification.objects.filter(source_audit_entry=admin_audit, recipient=admin_recipient).exists()
    assert not Notification.objects.filter(source_audit_entry=admin_audit, recipient=security).exists()

    client.force_authenticate(user=admin_recipient)
    admin_feed = client.get('/api/v1/notifications/')
    assert admin_feed.status_code == 200
    assert any(item['eventType'] == 'ADMIN_ACTIVITY' for item in admin_feed.data['items'])

    mark_all = client.post('/api/v1/notifications/read-all/')
    assert mark_all.status_code == 200
    assert mark_all.data['unreadCount'] == 0
    assert Notification.objects.filter(recipient=admin_recipient, read_at__isnull=True).count() == 0


@pytest.mark.django_db(transaction=True)
def test_notifications_are_not_created_for_rolled_back_audit_events():
    student = make_user('STU-NOTIF-ROLLBACK')
    before_count = Notification.objects.count()

    with pytest.raises(RuntimeError):
        with transaction.atomic():
            make_audit(student, AuditAction.ITEM_REPORT_LOST, 'Item')
            raise RuntimeError('simulate source transaction rollback')

    assert Notification.objects.count() == before_count
    assert AuditEntry.objects.filter(actor=student, action=AuditAction.ITEM_REPORT_LOST).count() == 0


@pytest.mark.django_db
def test_notifications_require_authentication():
    response = APIClient().get('/api/v1/notifications/')
    assert response.status_code == 401


@pytest.mark.django_db(transaction=True)
def test_possible_match_notification_is_security_scoped():
    reporter = make_user('STU-MATCH-NOTIF')
    security = make_user('SEC-MATCH-NOTIF', UserRole.SECURITY_PERSONNEL)
    admin = make_user('ADM-MATCH-NOTIF', UserRole.CAMPUS_ADMIN)
    category = ItemCategory.objects.create(code='MATCH-NOTIF', name='Match notification test')
    location = Location.objects.create(code='MATCH-NOTIF', name='Test location', campus_zone='TEST')
    now = timezone.now()
    lost = Item.objects.create(
        reference_number='LPU-L-MATCH-NOTIF',
        item_type=ItemType.LOST,
        title='Lost test item',
        public_description='A test item for match notifications.',
        category=category,
        location=location,
        specific_location='Test area',
        event_date=now,
        reported_by=reporter,
        retention_expires_at=now,
    )
    found = Item.objects.create(
        reference_number='LPU-F-MATCH-NOTIF',
        item_type=ItemType.FOUND,
        title='Found test item',
        public_description='A test item for match notifications.',
        category=category,
        location=location,
        specific_location='Test area',
        event_date=now,
        reported_by=reporter,
        retention_expires_at=now,
    )

    match = MatchSuggestion.objects.create(
        lost_item=lost,
        found_item=found,
        match_score=80,
        confidence=MatchConfidence.HIGH,
    )

    notice = Notification.objects.get(recipient=security, event_type='POSSIBLE_ITEM_MATCH')
    assert notice.target_path == f'/items/{lost.id}'
    assert 'possible lost-to-found match' in notice.message
    assert not Notification.objects.filter(recipient=reporter, event_type='POSSIBLE_ITEM_MATCH').exists()
    assert not Notification.objects.filter(recipient=admin, event_type='POSSIBLE_ITEM_MATCH').exists()
