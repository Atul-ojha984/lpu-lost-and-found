"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Audit App Models: Forensic Compliance & Security Audit Trail
==============================================================================
"""

import uuid
import re
from django.core.exceptions import ValidationError
from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.accounts.models import UserRole


AUDIT_SENSITIVE_METADATA_KEYS = {
    'password', 'passwordhash', 'rawpassword', 'otp', 'otpvalue', 'otpcode',
    'otpsecret', 'otphash', 'token', 'accesstoken', 'refreshtoken',
    'authorization', 'secret', 'secretkey', 'expectedanswer',
    'expectedanswerhash', 'providedanswer', 'verificationanswer', 'answer',
    'privateidentifyingdetails', 'privatedetails',
}


def sanitize_audit_metadata(value):
    """Redact credentials and private verification data before persistence."""
    if isinstance(value, dict):
        sanitized = {}
        for key, nested_value in value.items():
            normalized_key = re.sub(r'[^a-z0-9]', '', str(key).casefold())
            sanitized[key] = (
                '[REDACTED]'
                if normalized_key in AUDIT_SENSITIVE_METADATA_KEYS
                else sanitize_audit_metadata(nested_value)
            )
        return sanitized
    if isinstance(value, list):
        return [sanitize_audit_metadata(entry) for entry in value]
    if isinstance(value, tuple):
        return [sanitize_audit_metadata(entry) for entry in value]
    return value

class AuditAction(models.TextChoices):
    USER_REGISTER = 'USER_REGISTER', 'User Registration'
    USER_LOGIN = 'USER_LOGIN', 'User Login'
    USER_LOGOUT = 'USER_LOGOUT', 'User Logout'
    ITEM_REPORT_LOST = 'ITEM_REPORT_LOST', 'Report Lost Property'
    ITEM_REPORT_FOUND = 'ITEM_REPORT_FOUND', 'Report Found Property'
    ITEM_REPORT_UPDATE = 'ITEM_REPORT_UPDATE', 'Update Property Report'
    ITEM_REPORT_WITHDRAW = 'ITEM_REPORT_WITHDRAW', 'Withdraw Property Report'
    ITEM_REPORT_EXPIRE = 'ITEM_REPORT_EXPIRE', 'Expire Lost Property Report'
    PRIVATE_VAULT_VIEW = 'PRIVATE_VAULT_VIEW', 'View Private Vault'
    CLAIM_SUBMIT = 'CLAIM_SUBMIT', 'Submit Ownership Claim'
    CLAIM_REVIEW = 'CLAIM_REVIEW', 'Review Ownership Claim'
    CLAIM_CHALLENGE_VERIFY = 'CLAIM_CHALLENGE_VERIFY', 'Verify Ownership Challenge'
    HANDOVER_OTP_GENERATE = 'HANDOVER_OTP_GENERATE', 'Generate Handover OTP'
    HANDOVER_OTP_FAILED = 'HANDOVER_OTP_FAILED', 'Failed Handover OTP Verification'
    HANDOVER_EXECUTE = 'HANDOVER_EXECUTE', 'Execute Property Handover'
    HANDOVER_SLIP_ACCESS = 'HANDOVER_SLIP_ACCESS', 'Access Handover Slip'
    CUSTODY_TRANSFER = 'CUSTODY_TRANSFER', 'Transfer Physical Custody'
    CUSTODY_INTAKE = 'CUSTODY_INTAKE', 'Initial Custody Intake'
    ITEM_DISPOSE = 'ITEM_DISPOSE', 'Approve Item Disposal'
    ROLE_UPDATE = 'ROLE_UPDATE', 'Update User Role'
    CATEGORY_MANAGE = 'CATEGORY_MANAGE', 'Manage Categories'
    LOCATION_MANAGE = 'LOCATION_MANAGE', 'Manage Locations'
    CONFIG_UPDATE = 'CONFIG_UPDATE', 'Update Platform Configuration'
    VERIFICATION_CHALLENGE_EVALUATE = 'VERIFICATION_CHALLENGE_EVALUATE', 'Evaluate Verification Challenge'
    TEST_SENSITIVE_AUDIT = 'TEST_SENSITIVE_AUDIT', 'Test Sensitive Audit'

class AppendOnlyAuditQuerySet(models.QuerySet):
    """Reject application-level mutations to compliance records."""

    def update(self, **kwargs):
        raise ValidationError('Audit entries are append-only and cannot be updated.')

    def delete(self):
        raise ValidationError('Audit entries are append-only and cannot be deleted.')


class AppendOnlyAuditManager(models.Manager.from_queryset(AppendOnlyAuditQuerySet)):
    pass


class AuditEntry(models.Model):
    """
    Forensic security and compliance audit trail recording all privileged and lifecycle operations.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='audit_entries',
        db_index=True,
    )
    actor_role = models.CharField(
        max_length=30,
        choices=UserRole.choices,
        db_index=True,
    )
    actor_name = models.CharField(max_length=150, blank=True, default='')
    description = models.CharField(max_length=255, blank=True, default='')
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

    objects = AppendOnlyAuditManager()

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
        actor_name = self.actor_name or (self.actor.full_name if self.actor else 'SYSTEM/ANONYMOUS')
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] {actor_name} ({self.actor_role}) -> {self.action} on {self.target_entity}:{self.target_id}"

    def save(self, *args, **kwargs):
        if not self._state.adding and type(self).objects.filter(pk=self.pk).exists():
            raise ValidationError('Audit entries are append-only and cannot be updated.')
        if self.actor_id and not self.actor_name:
            self.actor_name = self.actor.full_name
        if not self.description:
            action_label = dict(AuditAction.choices).get(self.action, self.action.replace('_', ' ').title())
            self.description = f'{action_label} on {self.target_entity} {self.target_id}'.strip()
        self.metadata = sanitize_audit_metadata(self.metadata or {})
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Audit entries are append-only and cannot be deleted.')


class Notification(models.Model):
    """Persistent, recipient-scoped portal notification derived from a saved event."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        db_index=True,
    )
    source_audit_entry = models.ForeignKey(
        AuditEntry,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='notifications',
    )
    audience_role = models.CharField(max_length=30, blank=True, default='', db_index=True)
    event_type = models.CharField(max_length=64, db_index=True)
    title = models.CharField(max_length=160)
    message = models.CharField(max_length=500)
    target_path = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['recipient', '-created_at']),
            models.Index(fields=['recipient', 'read_at']),
            models.Index(fields=['recipient', 'audience_role']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['recipient', 'source_audit_entry'],
                name='unique_notification_per_audit_recipient',
            ),
        ]

    def __str__(self):
        return f'{self.event_type} for {self.recipient_id}'
