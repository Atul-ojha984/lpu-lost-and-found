import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole, UserType
from apps.accounts.phone import normalize_indian_mobile_number


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_setup(db):
    admin = User.objects.create_user(
        email='phone.admin@lpu.in',
        registration_number='PHONE-ADMIN',
        full_name='Phone Test Administrator',
        password='Password123!',
        role=UserRole.CAMPUS_ADMIN,
        user_type=UserType.CAMPUS_ADMIN,
    )
    student = User.objects.create_user(
        email='phone.target@lpu.in',
        registration_number='PHONE-STUDENT',
        full_name='Phone Target Student',
        password='Password123!',
        role=UserRole.STUDENT_STAFF,
        user_type=UserType.STUDENT,
    )
    return {'admin': admin, 'student': student}


@pytest.mark.parametrize(
    ('value', 'expected'),
    [
        ('9876543210', '+919876543210'),
        ('+91 98765 43210', '+919876543210'),
        ('919876543210', '+919876543210'),
        ('+91-98765-43210', '+919876543210'),
        ('', ''),
    ],
)
def test_valid_indian_mobile_formats_are_normalized(value, expected):
    assert normalize_indian_mobile_number(value) == expected


@pytest.mark.parametrize(
    'value',
    [
        '987654321',
        '98765432100',
        '+1 2025550134',
        '01824517034',
        'abcdefghij',
        '0000000000',
        '+91 (987) 654-3210',
    ],
)
def test_invalid_or_non_mobile_values_are_rejected(value):
    with pytest.raises(ValueError, match='valid 10-digit Indian mobile'):
        normalize_indian_mobile_number(value)


@pytest.mark.django_db
def test_admin_account_creation_normalizes_phone_for_each_user_type(api_client, admin_setup):
    api_client.force_authenticate(user=admin_setup['admin'])
    accounts = [
        ('STUDENT', 'Student Phone', '12107801', 'phone.student@lpu.in'),
        ('STAFF', 'Staff Phone', 'STF07802', 'phone.staff@lpu.in'),
        ('SECURITY_OFFICER', 'Security Phone', 'SEC07803', 'phone.security@lpu.in'),
    ]

    for user_type, full_name, registration, email in accounts:
        response = api_client.post(
            '/api/v1/admin/users/',
            {
                'fullName': full_name,
                'registrationNumber': registration,
                'email': email,
                'userType': user_type,
                'password': 'InitialCampusPassword@2026',
                'phone': '+91 98765 43210',
            },
            format='json',
        )
        assert response.status_code == 201, response.data
        assert User.objects.get(email=email).phone == '+919876543210'


@pytest.mark.django_db
def test_admin_account_create_and_update_reject_invalid_mobile(api_client, admin_setup):
    api_client.force_authenticate(user=admin_setup['admin'])
    payload = {
        'fullName': 'Invalid Phone Student',
        'registrationNumber': '12107804',
        'email': 'invalid.phone@lpu.in',
        'userType': 'STUDENT',
        'password': 'InitialCampusPassword@2026',
        'phone': '01824517034',
    }
    response = api_client.post('/api/v1/admin/users/', payload, format='json')
    assert response.status_code == 400
    assert 'valid 10-digit indian mobile' in str(response.data).lower()
    assert not User.objects.filter(email=payload['email']).exists()

    target = admin_setup['student']
    response = api_client.patch(
        f'/api/v1/admin/users/{target.id}/',
        {'phone': '98765ABC10'},
        format='json',
    )
    assert response.status_code == 400
    target.refresh_from_db()
    assert target.phone == ''

    response = api_client.patch(
        f'/api/v1/admin/users/{target.id}/',
        {'phone': '9876543210'},
        format='json',
    )
    assert response.status_code == 200
    target.refresh_from_db()
    assert target.phone == '+919876543210'


@pytest.mark.django_db
def test_current_user_can_update_only_own_phone_and_not_role(api_client, admin_setup):
    student = admin_setup['student']
    api_client.force_authenticate(user=student)

    response = api_client.patch('/api/v1/auth/me/', {'phone': '9876543210'}, format='json')
    assert response.status_code == 200, response.data
    student.refresh_from_db()
    assert student.phone == '+919876543210'
    assert response.data['user']['phone'] == '+919876543210'

    response = api_client.patch(
        '/api/v1/auth/me/',
        {'phone': '+91 98765 43210', 'role': UserRole.SYSTEM_ADMIN, 'userType': UserType.SYSTEM_ADMIN},
        format='json',
    )
    assert response.status_code == 400
    student.refresh_from_db()
    assert student.role == UserRole.STUDENT_STAFF
    assert student.user_type == UserType.STUDENT


@pytest.mark.django_db
def test_phone_update_requires_authentication_and_valid_number(api_client, admin_setup):
    api_client.force_authenticate(user=None)
    assert api_client.patch('/api/v1/auth/me/', {'phone': '9876543210'}, format='json').status_code == 401

    api_client.force_authenticate(user=admin_setup['student'])
    response = api_client.patch('/api/v1/auth/me/', {'phone': '+1 2025550134'}, format='json')
    assert response.status_code == 400


@pytest.mark.django_db
def test_legacy_phone_audit_command_masks_numbers_and_does_not_change_data(db):
    user = User.objects.create_user(
        email='legacy.phone@lpu.in',
        registration_number='LEGACY-PHONE-1',
        full_name='Legacy Phone User',
        phone='01824-517034',
        role=UserRole.STUDENT_STAFF,
        user_type=UserType.STUDENT,
    )
    from django.core.management import call_command
    from io import StringIO

    output = StringIO()
    call_command('audit_legacy_mobile_numbers', stdout=output)
    user.refresh_from_db()
    assert user.phone == '01824-517034'
    assert 'LEGACY-PHONE-1' in output.getvalue()
    assert '7034' in output.getvalue()
    assert '01824-517034' not in output.getvalue()
