"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Audit App Models: Forensic Compliance & Security Audit Trail
==============================================================================
"""

import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.accounts.models import UserRole

class AuditAction(models.TextChoices):
    USER_REGISTER = 'USER_REGISTER', 'User Registration'
    USER_LOGIN = 'USER_LOGIN', 'User Login'
    USER_LOGOUT = 'USER_LOGOUT', 'User Logout'
    ITEM_REPORT_LOST = 'ITEM_REPORT_LOST', 'Report Lost Property'
    ITEM_REPORT_FOUND = 'ITEM_REPORT_FOUND', 'Report Found Property'
    ITEM_REPORT_WITHDRAW = 'ITEM_REPORT_WITHDRAW', 'Withdraw Property Report'
    ITEM_REPORT_EXPIRE = 'ITEM_REPORT_EXPIRE', 'Expire Lost Property Report'
    PRIVATE_VAULT_VIEW = 'PRIVATE_VAULT_VIEW', 'View Private Vault'
    CLAIM_SUBMIT = 'CLAIM_SUBMIT', 'Submit Ownership Claim'
    CLAIM_REVIEW = 'CLAIM_REVIEW', 'Review Ownership Claim'
    HANDOVER_OTP_GENERATE = 'HANDOVER_OTP_GENERATE', 'Generate Handover OTP'
    HANDOVER_EXECUTE = 'HANDOVER_EXECUTE', 'Execute Property Handover'
    CUSTODY_TRANSFER = 'CUSTODY_TRANSFER', 'Transfer Physical Custody'
    CUSTODY_INTAKE = 'CUSTODY_INTAKE', 'Initial Custody Intake'
    ITEM_DISPOSE = 'ITEM_DISPOSE', 'Approve Item Disposal'
    ROLE_UPDATE = 'ROLE_UPDATE', 'Update User Role'
    CATEGORY_MANAGE = 'CATEGORY_MANAGE', 'Manage Categories'
    LOCATION_MANAGE = 'LOCATION_MANAGE', 'Manage Locations'
    CONFIG_UPDATE = 'CONFIG_UPDATE', 'Update Platform Configuration'

class AuditEntry(models.Model):
    """
    Forensic security and compliance audit trail recording all privileged and lifecycle operations.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='audit_entries',
        db_index=True,
    )
    actor_role = models.CharField(
        max_length=30,
        choices=UserRole.choices,
        db_index=True,
    )
    action = models.CharField(
        max_length=50,
        choices=AuditAction.choices,
        db_index=True,
    )
    target_entity = models.CharField(max_length=100, db_index=True)
    target_id = models.CharField(max_length=100, blank=True, default='', db_index=True)
    ip_address = models.GenericIPAddressField()
    user_agent = models.TextField(blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        verbose_name = 'Audit Entry'
        verbose_name_plural = 'Audit Entries'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['-timestamp']),
            models.Index(fields=['actor', 'action']),
            models.Index(fields=['target_entity', 'target_id']),
        ]

    def __str__(self):
        actor_name = self.actor.full_name if self.actor else 'SYSTEM/ANONYMOUS'
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] {actor_name} ({self.actor_role}) -> {self.action} on {self.target_entity}:{self.target_id}"
