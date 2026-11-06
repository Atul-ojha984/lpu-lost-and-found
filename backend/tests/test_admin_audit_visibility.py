import pytest
from django.core.exceptions import ValidationError
from django.db import DatabaseError, connection, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole, UserType
from apps.audit.models import AuditAction, AuditEntry


@pytest.fixture
def audit_users(db):
    return {
        'student': User.objects.create_user(
            email='audit.student@lpu.in', registration_number='AUD-STU-1',
            full_name='Audit Student', password='Valid-pass-123',
            role=UserRole.STUDENT_STAFF, user_type=UserType.STUDENT,
        ),
        'staff': User.objects.create_user(
            email='audit.staff@lpu.in', registration_number='AUD-STAFF-1',
            full_name='Audit Staff', password='Valid-pass-123',
            role=UserRole.STUDENT_STAFF, user_type=UserType.STAFF,
        ),
        'security': User.objects.create_user(
            email='audit.security@lpu.in', registration_number='AUD-SEC-1',
            full_name='Audit Security', password='Valid-pass-123',
            role=UserRole.SECURITY_PERSONNEL, user_type=UserType.SECURITY_OFFICER,
        ),
        'admin': User.objects.create_user(
            email='audit.admin@lpu.in', registration_number='AUD-ADMIN-1',
            full_name='Audit Admin', password='Valid-pass-123',
            role=UserRole.CAMPUS_ADMIN, user_type=UserType.CAMPUS_ADMIN,
        ),
    }


def create_audit(actor, action, target_id, metadata=None):
    return AuditEntry.objects.create(
        actor=actor,
        actor_role=actor.role,
        action=action,
        target_entity='Item',
        target_id=str(target_id),
        ip_address='127.0.0.1',
        metadata=metadata or {},
    )


@pytest.mark.django_db
def test_admin_sees_all_roles_and_security_sees_operational_only(audit_users):
    entries = [
        create_audit(audit_users['student'], AuditAction.ITEM_REPORT_LOST, 'student-item'),
        create_audit(audit_users['staff'], AuditAction.ITEM_REPORT_FOUND, 'staff-item'),
        create_audit(audit_users['security'], AuditAction.CUSTODY_TRANSFER, 'locker-item'),
        create_audit(audit_users['admin'], AuditAction.USER_REGISTER, 'new-user'),
        create_audit(audit_users['admin'], AuditAction.ROLE_UPDATE, 'role-user'),
    ]
    client = APIClient()

    client.force_authenticate(audit_users['admin'])
    admin_response = client.get('/api/v1/admin/audit-logs/')
    assert admin_response.status_code == 200
    admin_ids = {entry['_id'] for entry in admin_response.data['data']['items']}
    assert {str(entry.id) for entry in entries} <= admin_ids

    client.force_authenticate(audit_users['security'])
    security_response = client.get('/api/v1/security/audit-trail/')
    assert security_response.status_code == 200
    security_ids = {entry['_id'] for entry in security_response.data['data']}
    assert {str(entries[0].id), str(entries[1].id), str(entries[2].id)} <= security_ids
    assert str(entries[3].id) not in security_ids
    assert str(entries[4].id) not in security_ids
    assert all(entry['action'] not in (AuditAction.USER_REGISTER, AuditAction.ROLE_UPDATE)
               for entry in security_response.data['data'])

    stats_response = client.get('/api/v1/security/dashboard-stats/')
    assert stats_response.status_code == 200
    recent_ids = {entry['_id'] for entry in stats_response.data['data']['recentAuditEvents']}
    assert str(entries[3].id) not in recent_ids
    assert str(entries[4].id) not in recent_ids


@pytest.mark.django_db
def test_admin_audit_api_filters_actor_role_target_status_and_date(audit_users):
    entry = create_audit(
        audit_users['security'], AuditAction.HANDOVER_OTP_FAILED, 'handover-92',
        {'status': 'FAILED', 'attemptNumber': 2},
    )
    create_audit(audit_users['student'], AuditAction.ITEM_REPORT_LOST, 'student-item', {'status': 'SUBMITTED'})
    client = APIClient()
    client.force_authenticate(audit_users['admin'])

    response = client.get('/api/v1/admin/audit-logs/', {
        'actor': 'Audit Security',
        'actorRole': UserRole.SECURITY_PERSONNEL,
        'targetEntity': 'Item',
        'targetId': 'handover-92',
        'actionStatus': 'FAILED',
        'startDate': timezone.localdate().isoformat(),
        'endDate': timezone.localdate().isoformat(),
    })
    assert response.status_code == 200
    assert response.data['data']['total'] == 1
    result = response.data['data']['items'][0]
    assert result['_id'] == str(entry.id)
    assert result['actorName'] == 'Audit Security'
    assert result['description']

    invalid_date = client.get('/api/v1/admin/audit-logs/', {'startDate': 'yesterday-ish'})
    assert invalid_date.status_code == 400


@pytest.mark.django_db
def test_student_and_security_cannot_access_admin_audit_api(audit_users):
    client = APIClient()
    for user in (audit_users['student'], audit_users['staff'], audit_users['security']):
        client.force_authenticate(user)
        assert client.get('/api/v1/admin/audit-logs/').status_code == 403

    for user in (audit_users['student'], audit_users['staff']):
        client.force_authenticate(user)
        assert client.get('/api/v1/security/audit-trail/').status_code == 403


@pytest.mark.django_db
def test_audit_entries_are_append_only_at_orm_and_database_levels(audit_users):
    entry = create_audit(audit_users['security'], AuditAction.CUSTODY_TRANSFER, 'locker-1')

    with pytest.raises(ValidationError):
        entry.description = 'changed'
        entry.save()
    with pytest.raises(ValidationError):
        AuditEntry.objects.filter(pk=entry.pk).update(description='changed')
    with pytest.raises(ValidationError):
        AuditEntry.objects.filter(pk=entry.pk).delete()
    with pytest.raises(ValidationError):
        entry.delete()

    if connection.vendor == 'postgresql':
        table = connection.ops.quote_name(AuditEntry._meta.db_table)
        with pytest.raises(DatabaseError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        f'UPDATE {table} SET description = %s WHERE id = %s',
                        ['raw update', entry.pk],
                    )
        with pytest.raises(DatabaseError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(f'DELETE FROM {table} WHERE id = %s', [entry.pk])


@pytest.mark.django_db
def test_sensitive_audit_metadata_is_redacted_before_persistence(audit_users):
    entry = create_audit(
        audit_users['security'], AuditAction.CLAIM_CHALLENGE_VERIFY, 'claim-1',
        {
            'otp': '123456',
            'nested': {
                'expected_answer': 'private answer',
                'authorization': 'Bearer secret-token',
                'safeStatus': 'verified',
            },
        },
    )
    entry.refresh_from_db()
    assert entry.metadata['otp'] == '[REDACTED]'
    assert entry.metadata['nested']['expected_answer'] == '[REDACTED]'
    assert entry.metadata['nested']['authorization'] == '[REDACTED]'
    assert entry.metadata['nested']['safeStatus'] == 'verified'


@pytest.mark.django_db
def test_security_action_list_excludes_administrative_events(audit_users):
    admin_entry = create_audit(audit_users['admin'], AuditAction.USER_REGISTER, 'account-1')
    operational_entry = create_audit(audit_users['security'], AuditAction.CUSTODY_INTAKE, 'item-1')
    client = APIClient()
    client.force_authenticate(audit_users['security'])
    response = client.get('/api/v1/security/audit-trail/', {'action': AuditAction.USER_REGISTER})
    assert response.status_code == 200
    assert response.data['meta']['total'] == 0
    assert admin_entry.id != operational_entry.id
