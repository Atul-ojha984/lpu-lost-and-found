"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Locations App Models
==============================================================================
"""

import uuid
from django.db import models

class Location(models.Model):
    """
    Campus zones, buildings, and security desks at Lovely Professional University.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True, db_index=True)
    name = models.CharField(max_length=150)
    campus_zone = models.CharField(max_length=100, db_index=True)
    building_name = models.CharField(max_length=150, blank=True, default='')
    has_security_desk = models.BooleanField(default=False)
    security_contact_phone = models.CharField(max_length=30, blank=True, default='')
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Campus Location'
        verbose_name_plural = 'Campus Locations'
        ordering = ['campus_zone', 'name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['campus_zone']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"
