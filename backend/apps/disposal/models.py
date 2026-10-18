"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Disposal App Models: Statutory Property Retention & Disposal
==============================================================================
"""

import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.items.models import Item

class DisposalMethod(models.TextChoices):
    DONATION = 'DONATION', 'Donation to Student Charity / Community'
    AUCTION = 'AUCTION', 'Public Campus Auction'
    DESTRUCTION = 'DESTRUCTION', 'Secure Environmental Destruction'
    RECYCLED = 'RECYCLED', 'University Recycling'

class DisposalRecord(models.Model):
    """
    Statutory property disposal record complying with university retention policies (Rule 26.4).
    Requires authorized administrator approval.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.OneToOneField(
        Item,
        on_delete=models.PROTECT,
        related_name='disposal_record',
        db_index=True,
    )
    method = models.CharField(
        max_length=30,
        choices=DisposalMethod.choices,
        db_index=True,
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='approved_disposals',
        db_index=True,
    )
    committee_notes = models.TextField(max_length=1000)
    reason = models.TextField(max_length=1000, blank=True, default='')
    recipient_organization = models.CharField(max_length=200, blank=True, default='')
    disposal_date = models.DateTimeField(default=timezone.now, db_index=True)
    certificate_url = models.CharField(max_length=500, blank=True, default='')
    evidence_reference = models.CharField(max_length=100, blank=True, default='')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Property Disposal Record'
        verbose_name_plural = 'Property Disposal Records'
        ordering = ['-disposal_date']

    def __str__(self):
        return f"Disposal of {self.item.reference_number} via {self.method} by {self.approved_by.full_name}"
