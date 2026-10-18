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
