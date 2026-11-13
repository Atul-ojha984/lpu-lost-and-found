"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Items App Models: ItemCategory & Item Registry
==============================================================================
"""

import uuid
from django.db import models
from django.conf import settings
from apps.locations.models import Location

class ItemType(models.TextChoices):
    LOST = 'LOST', 'Lost Property'
    FOUND = 'FOUND', 'Found Property'

class ItemStatus(models.TextChoices):
    REPORTED = 'REPORTED', 'Reported'
    IN_CUSTODY = 'IN_CUSTODY', 'In Security Custody'
    MATCH_PENDING = 'MATCH_PENDING', 'Match Pending'
    CLAIM_IN_REVIEW = 'CLAIM_IN_REVIEW', 'Claim Under Review'
    READY_FOR_HANDOVER = 'READY_FOR_HANDOVER', 'Ready for Handover'
    HANDED_OVER = 'HANDED_OVER', 'Handed Over to Owner'
    UNCLAIMED_EXPIRED = 'UNCLAIMED_EXPIRED', 'Unclaimed Expired'
    EXPIRED = 'EXPIRED', 'Lost Report Expired'
    DISPOSED = 'DISPOSED', 'Disposed / Donated'

class ItemCategory(models.Model):
    """
    Taxonomy classification for university lost and found property.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True, db_index=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    icon = models.CharField(max_length=50, blank=True, default='')
    is_active = models.BooleanField(default=True, db_index=True)
    default_retention_days = models.PositiveIntegerField(default=90)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Item Category'
        verbose_name_plural = 'Item Categories'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.code})"

class Item(models.Model):
    """
    Core campus property record for lost and found reports.
    Sensitive identifying details are explicitly stored in the separate PrivateDetail vault.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference_number = models.CharField(max_length=50, unique=True, db_index=True)
    item_type = models.CharField(max_length=10, choices=ItemType.choices, db_index=True)
    title = models.CharField(max_length=150)
    public_description = models.TextField(max_length=1000)
    
    category = models.ForeignKey(
        ItemCategory,
        on_delete=models.PROTECT,
        related_name='items',
        db_index=True,
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='items',
        db_index=True,
    )
    specific_location = models.CharField(max_length=200)
    event_date = models.DateTimeField(db_index=True)
    
    primary_image_url = models.CharField(max_length=500, blank=True, default='')
    additional_images = models.JSONField(default=list, blank=True)
    
    status = models.CharField(
        max_length=30,
        choices=ItemStatus.choices,
        default=ItemStatus.REPORTED,
        db_index=True,
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='reported_items',
        db_index=True,
    )
    
    current_custody_desk = models.CharField(max_length=150, blank=True, default='')
    locker_storage_reference = models.CharField(max_length=100, blank=True, default='')
    retention_expires_at = models.DateTimeField(db_index=True)
    is_archived = models.BooleanField(default=False, db_index=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Campus Property Item'
        verbose_name_plural = 'Campus Property Items'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'item_type']),
            models.Index(fields=['category', 'location']),
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        return f"{self.reference_number}: {self.title} [{self.item_type}]"
