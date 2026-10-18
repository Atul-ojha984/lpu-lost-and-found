"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Matching App Models: Algorithmic Match Suggestions
==============================================================================
"""

import uuid
from django.db import models
from django.conf import settings
from apps.items.models import Item

class MatchConfidence(models.TextChoices):
    HIGH = 'HIGH', 'High Confidence'
    MEDIUM = 'MEDIUM', 'Medium Confidence'
    LOW = 'LOW', 'Low Confidence'

class MatchStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending Evaluation'
    ACCEPTED = 'ACCEPTED', 'Accepted by Owner'
    DISMISSED = 'DISMISSED', 'Dismissed / Incompatible'

class MatchSuggestion(models.Model):
    """
    Deterministic scoring engine pairing between LOST and FOUND reports.
    A suggested match provides mathematical factors but NEVER establishes ownership automatically.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lost_item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name='lost_matches',
        db_index=True,
    )
    found_item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name='found_matches',
        db_index=True,
    )
    match_score = models.FloatField(db_index=True)
    confidence = models.CharField(max_length=10, choices=MatchConfidence.choices)
    explanation = models.JSONField(default=dict)
    
    status = models.CharField(
        max_length=20,
        choices=MatchStatus.choices,
        default=MatchStatus.PENDING,
        db_index=True,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_matches',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Match Suggestion'
        verbose_name_plural = 'Match Suggestions'
        ordering = ['-match_score', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['lost_item', 'found_item'],
                name='unique_lost_found_match_pair',
            )
        ]

    def __str__(self):
        return f"Match {self.lost_item.reference_number} <-> {self.found_item.reference_number} ({self.match_score}%)"
