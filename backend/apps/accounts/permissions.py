"""
==============================================================================
LPU Lost & Found Property Recovery Platform
DRF Role-Based Access Control (RBAC) Permissions
==============================================================================
"""

from rest_framework.permissions import BasePermission
from .models import UserRole

class IsStudentOrStaff(BasePermission):
    """Allows access to authenticated students and faculty members."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == UserRole.STUDENT_STAFF)

class IsSecurityPersonnel(BasePermission):
    """Allows access exclusively to campus security personnel."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == UserRole.SECURITY_PERSONNEL)

class IsCampusAdmin(BasePermission):
    """Allows access to campus administrators."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role in (UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN))

class IsSecurityOrAdmin(BasePermission):
    """Allows access to security personnel and campus administrators."""
    def has_permission(self, request, view):
        return bool(
            request.user and 
            request.user.is_authenticated and 
            request.user.role in (UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN)
        )

class IsRecordOwner(BasePermission):
    """Object-level permission allowing only the owner of a report or claim to edit/delete."""
    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
        # Supports Item (reported_by) or Claim (claimant)
        owner = getattr(obj, 'reported_by', None) or getattr(obj, 'claimant', None)
        return owner == request.user

class IsRecordOwnerOrSecurity(BasePermission):
    """Allows record owner OR security/admin officers to view/interact with the object."""
    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.role in (UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN):
            return True
        owner = getattr(obj, 'reported_by', None) or getattr(obj, 'claimant', None)
        return owner == request.user

class AntiSelfApprovalGuard(BasePermission):
    """
    Prevents a reviewer from approving their own claim or an item they personally reported.
    Enforces University Security Rule 14.2.
    """
    def has_object_permission(self, request, view, claim):
        if not (request.user and request.user.is_authenticated):
            return False
        # Claimant cannot approve own claim
        if claim.claimant_id == request.user.id:
            return False
        # Reporter of found item cannot approve claim on that item
        item = getattr(claim, 'item', None)
        if item and getattr(item, 'reported_by_id', None) == request.user.id:
            return False
        return True
