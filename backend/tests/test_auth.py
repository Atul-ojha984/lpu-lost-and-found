"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Phase 1 Test Suite: Identity, Authentication & JWT Access Control
==============================================================================
"""

import pytest
from rest_framework.test import APIClient
from apps.accounts.models import User, UserRole

@pytest.mark.django_db
class TestAuthenticationSuite:
    """Automated tests for university student/staff registration, login, and profile."""

    def setup_method(self):
        self.client = APIClient()

    def test_student_registration_success(self):
        """Valid registration creates account and returns JWT token and cookie."""
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
        assert response.status_code == 201

        body = response.json()
        assert body['success'] is True
        assert body['statusCode'] == 201
        data = body['data']
        assert 'token' in data
        assert 'user' in data
        user = data['user']
        assert user['registrationNumber'] == '12104501'
        assert user['email'] == 'aman.12104501@lpu.in'
        assert user['fullName'] == 'Aman Sharma'
        assert user['role'] == UserRole.STUDENT_STAFF
        assert 'password' not in user

        # Cookie assertion
        assert 'lpu_session_token' in response.cookies

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
        assert response.status_code == 400
        body = response.json()
        assert body['success'] is False
        assert body['statusCode'] == 400
        assert body['error']['code'] == 'VALIDATION_ERROR'

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
        assert response.status_code == 400
        body = response.json()
        assert body['success'] is False
        assert body['error']['code'] == 'VALIDATION_ERROR'

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

