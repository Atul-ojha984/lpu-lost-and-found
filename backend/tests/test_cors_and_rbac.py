"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Phase 1 Test Suite: CORS Headers & Role-Based Access Control (RBAC)
==============================================================================
"""

import pytest
from rest_framework.test import APIClient
from apps.accounts.models import User, UserRole
from apps.accounts.permissions import (
    IsStudentOrStaff,
    IsSecurityPersonnel,
    IsCampusAdmin,
    IsSecurityOrAdmin,
    AntiSelfApprovalGuard,
)

@pytest.mark.django_db
class TestCorsAndSecuritySuite:
    """Automated tests for development CORS origin negotiation and RBAC logic."""

    def setup_method(self):
        self.client = APIClient()

    def test_cors_preflight_and_origin_allowance(self):
        """Cross-origin requests from frontend (http://localhost:3000) receive CORS headers."""
        response = self.client.options(
            '/api/v1/health/',
            HTTP_ORIGIN='http://localhost:3000',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET',
        )
        assert response.status_code == 200
        assert response.headers.get('Access-Control-Allow-Origin') == 'http://localhost:3000'
        assert response.headers.get('Access-Control-Allow-Credentials') == 'true'

    def test_cors_get_request_header(self):
        """Direct GET request with allowed origin echoes Access-Control-Allow-Origin."""
        response = self.client.get(
            '/api/v1/health/',
            HTTP_ORIGIN='http://localhost:3000',
        )
        assert response.status_code == 200
        assert response.headers.get('Access-Control-Allow-Origin') == 'http://localhost:3000'

    def test_rbac_permission_classes(self):
        """Test unit logic for RBAC permission classes."""
        student = User(
            email='student@lpu.in',
            registration_number='1210001',
            full_name='Student',
            role=UserRole.STUDENT_STAFF,
        )
        officer = User(
            email='officer@lpu.in',
            registration_number='SEC1001',
            full_name='Officer',
            role=UserRole.SECURITY_PERSONNEL,
        )
        admin = User(
            email='admin@lpu.in',
            registration_number='ADM1001',
            full_name='Admin',
            role=UserRole.CAMPUS_ADMIN,
        )

        class DummyRequest:
            def __init__(self, user):
                self.user = user

        # IsStudentOrStaff
        assert IsStudentOrStaff().has_permission(DummyRequest(student), None) is True
        assert IsStudentOrStaff().has_permission(DummyRequest(officer), None) is False

        # IsSecurityPersonnel
        assert IsSecurityPersonnel().has_permission(DummyRequest(officer), None) is True
        assert IsSecurityPersonnel().has_permission(DummyRequest(student), None) is False

        # IsCampusAdmin
        assert IsCampusAdmin().has_permission(DummyRequest(admin), None) is True
        assert IsCampusAdmin().has_permission(DummyRequest(officer), None) is False

        # IsSecurityOrAdmin
        assert IsSecurityOrAdmin().has_permission(DummyRequest(officer), None) is True
        assert IsSecurityOrAdmin().has_permission(DummyRequest(admin), None) is True
        assert IsSecurityOrAdmin().has_permission(DummyRequest(student), None) is False

    def test_anti_self_approval_guard(self):
        """Reviewer cannot approve their own claim or an item they personally reported."""
        claimant = User(
            email='claimant@lpu.in',
            registration_number='CLM1001',
            full_name='Claimant User',
            role=UserRole.SECURITY_PERSONNEL,
        )
        reviewer = User(
            email='reviewer@lpu.in',
            registration_number='REV1001',
            full_name='Reviewing Officer',
            role=UserRole.SECURITY_PERSONNEL,
        )

        class DummyClaim:
            def __init__(self, claimant_user):
                self.claimant_id = claimant_user.id

        claim = DummyClaim(claimant)

        class DummyRequest:
            def __init__(self, user):
                self.user = user

        guard = AntiSelfApprovalGuard()
        # Claimant cannot review own claim
        assert guard.has_object_permission(DummyRequest(claimant), None, claim) is False
        # Separate officer can review claim
        assert guard.has_object_permission(DummyRequest(reviewer), None, claim) is True
