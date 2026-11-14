"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Custody App Models: Immutable Chain-of-Custody Ledger
==============================================================================
"""

import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.items.models import Item

class CustodyLocation(models.Model):
    """Admin-managed physical storage area used by custody workflows."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True, db_index=True)
    name = models.CharField(max_length=150)
    # Materialized case-folded key replaces the functional Lower(name) unique
    # constraint, which Django MongoDB Backend 5.2 cannot create.
    name_key = models.CharField(max_length=150, unique=True, editable=False, default='')
    description = models.TextField(max_length=500, blank=True, default='')
    is_active = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_custody_locations',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='updated_custody_locations',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'code']

    def save(self, *args, **kwargs):
        self.name_key = self.name.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.name} ({self.code})'


class Locker(models.Model):
    """Registered single-occupancy locker in a campus security office."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    locker_number = models.CharField(max_length=100, unique=True, db_index=True)
    # Keep the legacy name field for existing API and receipt consumers. The
    # custody_location relation is the source of truth and save() synchronizes it.
    location = models.CharField(max_length=150)
    custody_location = models.ForeignKey(
        CustodyLocation,
        on_delete=models.PROTECT,
        related_name='lockers',
    )
    is_active = models.BooleanField(default=True, db_index=True)
    current_item = models.OneToOneField(
        Item,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='assigned_locker',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='updated_lockers',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['location', 'locker_number']

    def save(self, *args, **kwargs):
        if self.custody_location_id:
            self.location = self.custody_location.name
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.locker_number} ({self.location})'

class CustodyAction(models.TextChoices):
    INITIAL_INTAKE = 'INITIAL_INTAKE', 'Initial Property Intake'
    TRANSFERRED_DESK = 'TRANSFERRED_DESK', 'Transferred to Security Desk'
    STORED_IN_LOCKER = 'STORED_IN_LOCKER', 'Stored in Secure Locker'
    INSPECTION = 'INSPECTION', 'Physical Property Inspection'
    HANDED_OVER = 'HANDED_OVER', 'Handed Over to Verified Claimant'
    DISPOSED = 'DISPOSED', 'Disposed / Transferred to Donation'

class CustodyRecord(models.Model):
    """
    Immutable append-only ledger tracking every physical movement and custody transfer of property.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name='custody_records',
        db_index=True,
    )
    action = models.CharField(
        max_length=30,
        choices=CustodyAction.choices,
        db_index=True,
    )
    from_location = models.CharField(max_length=150, blank=True, default='')
    to_location = models.CharField(max_length=150)
    locker_reference = models.CharField(max_length=100, blank=True, default='')
    previous_locker_reference = models.CharField(max_length=100, blank=True, default='')
    evidence_reference = models.CharField(max_length=100, blank=True, default='')
    
    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='custody_actions',
        db_index=True,
    )
    remarks = models.TextField(max_length=500, blank=True, default='')
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        verbose_name = 'Custody Record'
        verbose_name_plural = 'Custody Records'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['item', '-timestamp']),
            models.Index(fields=['action', '-timestamp']),
        ]

    def __str__(self):
        return f"{self.action} on {self.item.reference_number} by {self.handled_by.full_name} at {self.timestamp.strftime('%Y-%m-%d %H:%M')}"
