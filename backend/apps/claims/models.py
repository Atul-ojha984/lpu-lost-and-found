"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Claims App Models: Ownership Claims & Verification Challenge Responses
==============================================================================
"""

import uuid
from django.db import models
from django.conf import settings
from apps.items.models import Item
from apps.verification.models import VerificationChallenge

class ClaimStatus(models.TextChoices):
    SUBMITTED = 'SUBMITTED', 'Submitted'
    UNDER_REVIEW = 'UNDER_REVIEW', 'Under Review'
    CHALLENGE_REQUIRED = 'CHALLENGE_REQUIRED', 'Challenge Required'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'
    COMPLETED = 'COMPLETED', 'Completed'

class Claim(models.Model):
    """
    Ownership adjudication claim filed by a student or staff member against an item.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(
        Item,
        on_delete=models.PROTECT,
        related_name='claims',
        db_index=True,
    )
    claimant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='filed_claims',
        db_index=True,
    )
    claim_status = models.CharField(
        max_length=30,
        choices=ClaimStatus.choices,
        default=ClaimStatus.SUBMITTED,
        db_index=True,
    )
    statement = models.TextField(max_length=2000)
    private_evidence_proof_urls = models.JSONField(default=list, blank=True)
    
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_claims',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True, default='')
    rejection_reason = models.TextField(blank=True, default='')
    
    handover_otp = models.CharField(max_length=10, blank=True, default='')
    handover_otp_cipher = models.TextField(blank=True, default='')
    handover_otp_iv = models.CharField(max_length=32, blank=True, default='')
    handover_otp_tag = models.CharField(max_length=40, blank=True, default='')
    handover_otp_expires_at = models.DateTimeField(null=True, blank=True)
    
    verification_attempts_count = models.PositiveIntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Ownership Claim'
        verbose_name_plural = 'Ownership Claims'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['item', 'claimant']),
            models.Index(fields=['claim_status', '-created_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['item', 'claimant'],
                condition=models.Q(claim_status__in=['SUBMITTED', 'UNDER_REVIEW', 'CHALLENGE_REQUIRED', 'APPROVED']),
                name='unique_active_claim_per_user_item',
            )
        ]

    def __str__(self):
        return f"Claim #{str(self.id)[:8]} by {self.claimant.registration_number} on {self.item.reference_number} ({self.claim_status})"

class ClaimChallengeAnswer(models.Model):
    """
    Candidate answer submitted by the claimant to satisfy an item verification challenge.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    claim = models.ForeignKey(
        Claim,
        on_delete=models.CASCADE,
        related_name='challenge_answers',
    )
    challenge = models.ForeignKey(
        VerificationChallenge,
        on_delete=models.PROTECT,
        related_name='claim_answers',
    )
    provided_answer = models.CharField(max_length=300)
    is_correct = models.BooleanField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Claim Challenge Answer'
        verbose_name_plural = 'Claim Challenge Answers'
        ordering = ['created_at']

    def __str__(self):
        return f"Answer for Claim {str(self.claim_id)[:8]} - Challenge {str(self.challenge_id)[:8]}"
