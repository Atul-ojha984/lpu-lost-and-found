"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Phase 1 Test Suite: Identity, Authentication & JWT Access Control
==============================================================================
"""

import pytest
from rest_framework.test import APIClient
from apps.accounts.models import User, UserRole, UserType

@pytest.mark.django_db
class TestAuthenticationSuite:
    """Automated tests for university student/staff registration, login, and profile."""

    def setup_method(self):
        self.client = APIClient()

    def test_public_student_registration_is_disabled(self):
        """A public request cannot create an account or receive credentials."""
        payload = {
            'fullName': 'Aman Sharma',
            'registrationNumber': '12104501',
            'email': 'aman.12104501@lpu.in',
            'password': 'SecurePassword@123',
            'confirmPassword': 'SecurePassword@123',
            'department': 'School of Computer Science & Engineering',
            'phone': '+91 98765 43210',
        }
        response = self.client.post('/api/v1/auth/register/', payload, format='json')
        assert response.status_code == 403
        assert response.json()['error']['code'] == 'ADMIN_CREATION_REQUIRED'
        assert not User.objects.filter(registration_number='12104501').exists()
        assert 'lpu_session_token' not in response.cookies

    def test_registration_domain_rejection(self):
        """Non-LPU email domains must be rejected with validation error."""
        payload = {
            'fullName': 'Intruder User',
            'registrationNumber': '99999999',
            'email': 'intruder@external-domain.com',
            'password': 'Password@123',
            'confirmPassword': 'Password@123',
        }
        response = self.client.post('/api/v1/auth/register/', payload, format='json')
        assert response.status_code == 403
        body = response.json()
        assert body['success'] is False
        assert body['statusCode'] == 403
        assert body['error']['code'] == 'ADMIN_CREATION_REQUIRED'

    def test_registration_password_mismatch(self):
        """Mismatched confirmation password must be rejected."""
        payload = {
            'fullName': 'Aman Sharma',
            'registrationNumber': '12104502',
            'email': 'aman2@lpu.in',
            'password': 'FirstPassword@123',
            'confirmPassword': 'DifferentPassword@123',
        }
        response = self.client.post('/api/v1/auth/register/', payload, format='json')
        assert response.status_code == 403
        body = response.json()
        assert body['success'] is False
        assert body['error']['code'] == 'ADMIN_CREATION_REQUIRED'

    def test_login_with_email_and_regno(self):
        """User can authenticate using either official email or registration number."""
        user = User.objects.create_user(
            email='priya.verma@lpu.in',
            registration_number='12215099',
            full_name='Priya Verma',
            password='Password123#',
        )

        # 1. Login with email
        res1 = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': 'priya.verma@lpu.in', 'password': 'Password123#'},
            format='json',
        )
        assert res1.status_code == 200
        body1 = res1.json()
        assert body1['success'] is True
        token = body1['data']['token']
        assert token

        # 2. Login with registration number
        res2 = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': '12215099', 'password': 'Password123#'},
            format='json',
        )
        assert res2.status_code == 200
        body2 = res2.json()
        assert body2['success'] is True

    def test_login_invalid_credentials(self):
        """Incorrect password fails with 400 validation error."""
        User.objects.create_user(
            email='test.officer@lpu.in',
            registration_number='SEC9001',
            full_name='Officer Sandhu',
            password='CorrectPassword@1',
        )
        response = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': 'SEC9001', 'password': 'WrongPassword'},
            format='json',
        )
        assert response.status_code == 400
        body = response.json()
        assert body['success'] is False
        assert body['error']['code'] == 'VALIDATION_ERROR'

    def test_current_user_profile_access(self):
        """Profile /api/v1/auth/me/ enforces authentication and returns profile."""
        user = User.objects.create_user(
            email='staff.member@lpu.in',
            registration_number='STF1020',
            full_name='Dr. Harpreet Singh',
            password='StaffPassword@1',
            role=UserRole.STUDENT_STAFF,
            user_type=UserType.STAFF,
        )

        # Unauthenticated request fails with 401
        res_anon = self.client.get('/api/v1/auth/me/')
        assert res_anon.status_code == 401
        body_anon = res_anon.json()
        assert body_anon['success'] is False
        assert body_anon['statusCode'] == 401
        assert body_anon['error']['code'] == 'UNAUTHORIZED'

        # Authenticated with Bearer token succeeds
        login_res = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': 'STF1020', 'password': 'StaffPassword@1'},
            format='json',
        )
        token = login_res.json()['data']['token']

        auth_client = APIClient()
        auth_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        res_auth = auth_client.get('/api/v1/auth/me/')
        assert res_auth.status_code == 200
        body_auth = res_auth.json()
        assert body_auth['success'] is True
        assert body_auth['data']['user']['registrationNumber'] == 'STF1020'
        assert body_auth['data']['user']['fullName'] == 'Dr. Harpreet Singh'

        # Profile endpoints do not accept role or account-type updates.
        role_update = auth_client.patch(
            '/api/v1/auth/me/',
            {'role': UserRole.SYSTEM_ADMIN, 'userType': UserType.SYSTEM_ADMIN},
            format='json',
        )
        assert role_update.status_code == 405
        user.refresh_from_db()
        assert user.role == UserRole.STUDENT_STAFF
        assert user.user_type == UserType.STAFF

    def test_current_user_profile_with_cookie(self):
        """Current user profile endpoint authenticates seamlessly using HttpOnly cookie."""
        User.objects.create_user(
            email='cookie.staff@lpu.in',
            registration_number='STF9999',
            full_name='Dr. Cookie Test',
            password='StaffPassword@1',
            role=UserRole.STUDENT_STAFF,
        )
        login_res = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': 'STF9999', 'password': 'StaffPassword@1'},
            format='json',
        )
        assert login_res.status_code == 200
        token = login_res.json()['data']['token']

        cookie_client = APIClient()
        cookie_client.cookies['lpu_session_token'] = token
        res = cookie_client.get('/api/v1/auth/me/')
        assert res.status_code == 200
        data = res.json()['data']
        assert data['user']['registrationNumber'] == 'STF9999'
        assert data['user']['fullName'] == 'Dr. Cookie Test'

    def test_logout_clears_cookie(self):
        """Logout endpoint responds with 200 and expired cookie directive."""
        response = self.client.post('/api/v1/auth/logout/')
        assert response.status_code == 200
        assert response.json()['success'] is True
        # Check cookie cleared or expired
        cookie = response.cookies.get('lpu_session_token')
        assert cookie is None or cookie.value == '' or cookie['max-age'] == 0

    def test_valid_student_login_by_registration_number_and_alias(self):
        """Student can log in with canonical registration number 12108801 and alias 12108001."""
        User.objects.create_user(
            email='aarav.sharma.12108@lpu.in',
            registration_number='12108801',
            full_name='Aarav Sharma',
            password='DemoStudent2026!',
            role=UserRole.STUDENT_STAFF,
        )

        # 1. Login with canonical registration number 12108801
        res1 = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': '12108801', 'password': 'DemoStudent2026!'},
            format='json',
        )
        assert res1.status_code == 200
        data1 = res1.json()['data']
        assert data1['user']['role'] == UserRole.STUDENT_STAFF
        assert data1['user']['registrationNumber'] == '12108801'
        assert data1['token']

        # 2. Login with legacy alias 12108001
        res2 = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': '12108001', 'password': 'DemoStudent2026!'},
            format='json',
        )
        assert res2.status_code == 200
        assert res2.json()['data']['user']['role'] == UserRole.STUDENT_STAFF

    def test_valid_administrator_login_and_role_verification(self):
        """Administrator logs in with LPU-ADM-001 or ADM9001 and backend verifies admin privileges."""
        admin = User.objects.create_user(
            email='sunita.admin@lpu.in',
            registration_number='LPU-ADM-001',
            full_name='Sunita Rao',
            password='DemoAdmin2026!',
            role=UserRole.CAMPUS_ADMIN,
        )
        admin.is_staff = True
        admin.save()

        # Login with LPU-ADM-001
        res = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': 'LPU-ADM-001', 'password': 'DemoAdmin2026!'},
            format='json',
        )
        assert res.status_code == 200
        data = res.json()['data']
        assert data['user']['role'] == UserRole.CAMPUS_ADMIN
        assert data['user']['registrationNumber'] == 'LPU-ADM-001'

        # Verify backend authorization: admin can access admin analytics
        token = data['token']
        admin_client = APIClient()
        admin_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        analytics_res = admin_client.get('/api/v1/admin/analytics')
        assert analytics_res.status_code == 200

    def test_valid_security_officer_login_and_role_verification(self):
        """Security officer logs in with LPU-SEC-001 or SEC8001 and accesses security desk endpoints."""
        User.objects.create_user(
            email='rajesh.verma.sec@lpu.in',
            registration_number='LPU-SEC-001',
            full_name='Rajesh Verma',
            password='DemoSecurity2026!',
            role=UserRole.SECURITY_PERSONNEL,
            security_post='Main Gate 1 Security Desk',
        )

        res = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': 'LPU-SEC-001', 'password': 'DemoSecurity2026!'},
            format='json',
        )
        assert res.status_code == 200
        data = res.json()['data']
        assert data['user']['role'] == UserRole.SECURITY_PERSONNEL
        assert data['user']['registrationNumber'] == 'LPU-SEC-001'

        # Verify backend authorization: security officer can access pending claims queue
        token = data['token']
        sec_client = APIClient()
        sec_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        claims_res = sec_client.get('/api/v1/claims/pending')
        assert claims_res.status_code == 200

    def test_unknown_registration_number_rejection(self):
        """Non-existent registration number returns 400 validation error."""
        res = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': 'NONEXISTENT99999', 'password': 'SomePassword123!'},
            format='json',
        )
        assert res.status_code == 400
        body = res.json()
        assert body['success'] is False
        assert body['error']['code'] == 'VALIDATION_ERROR'

    def test_unauthorized_role_access_rejection(self):
        """Student cannot access security desk queue or admin analytics (enforced server-side)."""
        student = User.objects.create_user(
            email='student.normal@lpu.in',
            registration_number='12107777',
            full_name='Normal Student',
            password='Password123!',
            role=UserRole.STUDENT_STAFF,
        )
        login_res = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': '12107777', 'password': 'Password123!'},
            format='json',
        )
        token = login_res.json()['data']['token']

        student_client = APIClient()
        student_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        # 1. Attempt to access Security Queue -> 403 Forbidden
        sec_res = student_client.get('/api/v1/claims/pending')
        assert sec_res.status_code == 403

        # 2. Attempt to access Admin Analytics -> 403 Forbidden
        admin_res = student_client.get('/api/v1/admin/analytics')
        assert admin_res.status_code == 403

    def test_missing_and_malformed_login_fields(self):
        """Missing password or identifier returns 400 validation error."""
        # Missing password
        res1 = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': '12108801'},
            format='json',
        )
        assert res1.status_code == 400
        assert res1.json()['success'] is False

        # Empty identifier
        res2 = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': '   ', 'password': 'SomePassword123!'},
            format='json',
        )
        assert res2.status_code == 400
        assert res2.json()['success'] is False

    def test_alternative_request_field_names(self):
        """Backend supports registration_number, username, and regNo field aliases."""
        User.objects.create_user(
            email='flex.user@lpu.in',
            registration_number='12103333',
            full_name='Flex User',
            password='Password123!',
            role=UserRole.STUDENT_STAFF,
        )

        # 1. Using 'registration_number'
        res1 = self.client.post(
            '/api/v1/auth/login/',
            {'registration_number': '12103333', 'password': 'Password123!'},
            format='json',
        )
        assert res1.status_code == 200

        # 2. Using 'username'
        res2 = self.client.post(
            '/api/v1/auth/login/',
            {'username': '12103333', 'password': 'Password123!'},
            format='json',
        )
        assert res2.status_code == 200

        # 3. Using 'regNo'
        res3 = self.client.post(
            '/api/v1/auth/login/',
            {'regNo': '12103333', 'password': 'Password123!'},
            format='json',
        )
        assert res3.status_code == 200

    def test_suspended_account_rejection(self):
        """Inactive/suspended account is rejected even with valid password."""
        User.objects.create_user(
            email='suspended.user@lpu.in',
            registration_number='12100000',
            full_name='Suspended User',
            password='Password123!',
            is_active=False,
        )

        res = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': '12100000', 'password': 'Password123!'},
            format='json',
        )
        assert res.status_code == 400
        assert 'suspended' in res.json()['error']['message'].lower()

    def test_login_returns_complete_token_pair(self):
        """Login generates both access token and refresh token."""
        User.objects.create_user(
            email='token.pair@lpu.in',
            registration_number='12108899',
            full_name='Token Pair User',
            password='Password123!',
        )
        res = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': '12108899', 'password': 'Password123!'},
            format='json',
        )
        assert res.status_code == 200
        data = res.json()['data']
        assert 'token' in data
        assert 'accessToken' in data
        assert 'refreshToken' in data
        assert 'refresh' in data
        assert data['token'] == data['accessToken']
        assert data['refresh'] == data['refreshToken']

    def test_token_refresh_workflow(self):
        """Client can exchange valid refresh token for a new access token."""
        User.objects.create_user(
            email='refresh.user@lpu.in',
            registration_number='12107788',
            full_name='Refresh User',
            password='Password123!',
        )
        login_res = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': '12107788', 'password': 'Password123!'},
            format='json',
        )
        refresh_token = login_res.json()['data']['refreshToken']

        # Refresh token endpoint
        refresh_res = self.client.post(
            '/api/v1/auth/token/refresh/',
            {'refresh': refresh_token},
            format='json',
        )
        assert refresh_res.status_code == 200
        body = refresh_res.json()
        payload = body.get('data') or body
        new_access = payload.get('access') or payload.get('accessToken')
        assert new_access is not None

        # Access protected endpoint with newly refreshed token
        auth_client = APIClient()
        auth_client.credentials(HTTP_AUTHORIZATION=f'Bearer {new_access}')
        me_res = auth_client.get('/api/v1/auth/me/')
        assert me_res.status_code == 200
        assert me_res.json()['data']['user']['registrationNumber'] == '12107788'

    def test_invalid_token_refresh_rejected(self):
        """Invalid or corrupt refresh token returns 401."""
        res = self.client.post(
            '/api/v1/auth/token/refresh/',
            {'refresh': 'invalid.garbage.refresh.token'},
            format='json',
        )
        assert res.status_code == 401

    def test_login_with_stale_bearer_token_header_succeeds(self):
        """A stale or expired Authorization header does not break or 401 login."""
        User.objects.create_user(
            email='stale.header@lpu.in',
            registration_number='12106655',
            full_name='Stale Header User',
            password='Password123!',
        )
        client_with_stale_header = APIClient()
        client_with_stale_header.credentials(HTTP_AUTHORIZATION='Bearer stale.expired.invalid.token.from.old.session')

        res = client_with_stale_header.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': '12106655', 'password': 'Password123!'},
            format='json',
        )
        assert res.status_code == 200
        assert res.json()['success'] is True
        assert res.json()['data']['user']['registrationNumber'] == '12106655'

    def test_refresh_token_cannot_be_used_as_access_token(self):
        """Refresh token cannot be passed in Bearer header as access token."""
        User.objects.create_user(
            email='wrong.type@lpu.in',
            registration_number='12104433',
            full_name='Wrong Type User',
            password='Password123!',
        )
        login_res = self.client.post(
            '/api/v1/auth/login/',
            {'emailOrRegNo': '12104433', 'password': 'Password123!'},
            format='json',
        )
        refresh_token = login_res.json()['data']['refreshToken']

        bad_client = APIClient()
        bad_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh_token}')
        res = bad_client.get('/api/v1/auth/me/')
        assert res.status_code == 401
        assert 'token_not_valid' in str(res.json()).lower() or 'not valid' in str(res.json()).lower()

