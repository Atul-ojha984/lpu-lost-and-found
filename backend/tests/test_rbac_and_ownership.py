"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Phase 2 Test Suite: Role-Based Access Control, Ownership & Anti-Self-Approval
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
    IsRecordOwner,
    IsRecordOwnerOrSecurity,
    AntiSelfApprovalGuard,
)

class MockRequest:
    def __init__(self, user):
        self.user = user

class MockItemReport:
    def __init__(self, reported_by):
        self.reported_by = reported_by

class MockClaim:
    def __init__(self, claimant, item_reported_by=None):
        self.claimant = claimant
        self.claimant_id = claimant.id
        if item_reported_by:
            class MockItem:
                def __init__(self, reporter):
                    self.reported_by = reporter
                    self.reported_by_id = reporter.id
            self.item = MockItem(item_reported_by)
        else:
            self.item = None

@pytest.fixture
def users_fixture():
    student_a = User(
        email='student.a@lpu.in',
        registration_number='12101001',
        full_name='Student A',
        role=UserRole.STUDENT_STAFF,
    )
    student_b = User(
        email='student.b@lpu.in',
        registration_number='12101002',
        full_name='Student B',
        role=UserRole.STUDENT_STAFF,
    )
    security_officer_1 = User(
        email='officer.1@lpu.in',
        registration_number='SEC8001',
        full_name='Security Officer 1',
        role=UserRole.SECURITY_PERSONNEL,
    )
    security_officer_2 = User(
        email='officer.2@lpu.in',
        registration_number='SEC8002',
        full_name='Security Officer 2',
        role=UserRole.SECURITY_PERSONNEL,
    )
    campus_admin = User(
        email='admin@lpu.in',
        registration_number='ADM8001',
        full_name='Campus Admin',
        role=UserRole.CAMPUS_ADMIN,
    )
    return {
        'student_a': student_a,
        'student_b': student_b,
        'officer_1': security_officer_1,
        'officer_2': security_officer_2,
        'admin': campus_admin,
    }

def test_role_hierarchy(users_fixture):
    """Verifies that each permission class strictly enforces role boundaries."""
    student = users_fixture['student_a']
    officer = users_fixture['officer_1']
    admin = users_fixture['admin']

    # IsStudentOrStaff
    assert IsStudentOrStaff().has_permission(MockRequest(student), None) is True
    assert IsStudentOrStaff().has_permission(MockRequest(officer), None) is False
    assert IsStudentOrStaff().has_permission(MockRequest(admin), None) is False

    # IsSecurityPersonnel
    assert IsSecurityPersonnel().has_permission(MockRequest(officer), None) is True
    assert IsSecurityPersonnel().has_permission(MockRequest(student), None) is False
    assert IsSecurityPersonnel().has_permission(MockRequest(admin), None) is False

    # IsCampusAdmin
    assert IsCampusAdmin().has_permission(MockRequest(admin), None) is True
    assert IsCampusAdmin().has_permission(MockRequest(officer), None) is False
    assert IsCampusAdmin().has_permission(MockRequest(student), None) is False

    # IsSecurityOrAdmin
    assert IsSecurityOrAdmin().has_permission(MockRequest(officer), None) is True
    assert IsSecurityOrAdmin().has_permission(MockRequest(admin), None) is True
    assert IsSecurityOrAdmin().has_permission(MockRequest(student), None) is False

def test_object_level_record_ownership(users_fixture):
    """Only the user who filed a report or claim has ownership rights."""
    owner = users_fixture['student_a']
    intruder = users_fixture['student_b']
    officer = users_fixture['officer_1']

    report = MockItemReport(reported_by=owner)
    guard = IsRecordOwner()

    # Owner can access/modify
    assert guard.has_object_permission(MockRequest(owner), None, report) is True
    # Another student cannot access/modify
    assert guard.has_object_permission(MockRequest(intruder), None, report) is False
    # Security personnel is not the owner (IsRecordOwner strictly tests ownership)
    assert guard.has_object_permission(MockRequest(officer), None, report) is False

    # IsRecordOwnerOrSecurity allows security oversight
    dual_guard = IsRecordOwnerOrSecurity()
    assert dual_guard.has_object_permission(MockRequest(owner), None, report) is True
    assert dual_guard.has_object_permission(MockRequest(intruder), None, report) is False
    assert dual_guard.has_object_permission(MockRequest(officer), None, report) is True

def test_anti_self_approval_student_prevented(users_fixture):
    """Students can NEVER approve any claim, including their own."""
    student_claimant = users_fixture['student_a']
    claim = MockClaim(claimant=student_claimant)
    guard = AntiSelfApprovalGuard()

    # Student attempting to approve own claim
    assert guard.has_object_permission(MockRequest(student_claimant), None, claim) is False

def test_anti_self_approval_security_officer_rules(users_fixture):
    """
    Security officer cannot approve their own claim or a claim on an item they personally reported.
    Enforces University Rule 14.2.
    """
    officer_1 = users_fixture['officer_1']
    officer_2 = users_fixture['officer_2']
    finder = users_fixture['officer_1']

    guard = AntiSelfApprovalGuard()

    # Scenario 1: Officer 1 filed a personal claim. Officer 1 CANNOT approve it.
    personal_claim = MockClaim(claimant=officer_1)
    assert guard.has_object_permission(MockRequest(officer_1), None, personal_claim) is False

    # Officer 2 CAN review and approve Officer 1's claim.
    assert guard.has_object_permission(MockRequest(officer_2), None, personal_claim) is True

    # Scenario 2: Officer 1 was the finder/reporter of a found laptop.
    # Student B claims the laptop. Officer 1 CANNOT approve the claim on their own reported item!
    student_b = users_fixture['student_b']
    item_reported_by_officer_1 = MockClaim(claimant=student_b, item_reported_by=officer_1)
    assert guard.has_object_permission(MockRequest(officer_1), None, item_reported_by_officer_1) is False

    # A different officer (Officer 2) CAN review and approve this claim.
    assert guard.has_object_permission(MockRequest(officer_2), None, item_reported_by_officer_1) is True
