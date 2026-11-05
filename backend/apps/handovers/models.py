"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Handovers App Models: Supervised Physical Release & OTP Redemption
==============================================================================
"""

import uuid
from django.db import models
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password
from apps.items.models import Item
from apps.claims.models import Claim

class Handover(models.Model):
    """
    Supervised physical release record for returning property to verified owners.
    Single-use OTP redemption and database constraint prevent duplicate handovers.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(
        Item,
        on_delete=models.PROTECT,
        related_name='handovers',
        db_index=True,
    )
    claim = models.ForeignKey(
        Claim,
        on_delete=models.PROTECT,
        related_name='handovers',
        db_index=True,
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='received_handovers',
        db_index=True,
    )
    supervising_officer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='supervised_handovers',
        db_index=True,
    )
    
    otp_hash = models.CharField(max_length=255)
    otp_expires_at = models.DateTimeField(db_index=True)
    otp_attempts_count = models.PositiveIntegerField(default=0)
    
    physical_desk_location = models.CharField(max_length=150)
    id_card_presented_type = models.CharField(max_length=100)
    id_card_number_masked = models.CharField(max_length=50)
    recipient_signature_url = models.CharField(max_length=500, blank=True, default='')
    acknowledgement_notes = models.TextField(max_length=1000, blank=True, default='')
    proof_evidence_url = models.CharField(max_length=500, blank=True, default='')
    
    is_completed = models.BooleanField(default=False, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Property Handover'
        verbose_name_plural = 'Property Handovers'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['claim'],
                name='unique_handover_per_claim',
            ),
            models.UniqueConstraint(
                fields=['item'],
                condition=models.Q(is_completed=True),
                name='unique_completed_handover_per_item',
            )
        ]

    def __str__(self):
        state = 'COMPLETED' if self.is_completed else 'PENDING'
        return f"Handover {str(self.id)[:8]} for {self.item.reference_number} -> {self.recipient.registration_number} [{state}]"

    def set_otp(self, raw_otp: str):
        """Securely hashes single-use numeric OTP using Django's password hasher."""
        self.otp_hash = make_password(raw_otp.strip())

    def verify_otp(self, raw_otp: str) -> bool:
        """Verifies candidate OTP against stored hash."""
        return check_password(raw_otp.strip(), self.otp_hash)
