"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Verification App Models: PrivateDetail Vault & Verification Challenges
==============================================================================
"""

import json
import uuid
from django.db import models
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password
from apps.items.models import Item
from apps.core.crypto import encrypt_field, decrypt_field

class PrivateDetail(models.Model):
    """
    Isolated cryptographic vault storing private identifying details for an item.
    Protects sensitive fields (IMEI, serial numbers, hidden marks) with application-layer AES-256-GCM encryption.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.OneToOneField(
        Item,
        on_delete=models.CASCADE,
        related_name='private_detail',
        db_index=True,
    )
    encrypted_ciphertext = models.TextField()
    iv = models.CharField(max_length=32)        # 12 bytes hex (24 chars)
    auth_tag = models.CharField(max_length=40)  # 16 bytes hex (32 chars)
    fields_summary = models.JSONField(default=list, blank=True)
    
    last_decrypted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='decrypted_vaults',
    )
    last_decrypted_at = models.DateTimeField(null=True, blank=True)
    access_count = models.PositiveIntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Private Detail Vault'
        verbose_name_plural = 'Private Detail Vaults'

    def __str__(self):
        return f"Private Vault for {self.item.reference_number}"

    def set_secret_payload(self, payload: dict | str):
        """Encrypts dictionary or string payload and populates ciphertext, IV, and auth tag."""
        plaintext = json.dumps(payload) if isinstance(payload, dict) else str(payload)
        enc = encrypt_field(plaintext)
        self.encrypted_ciphertext = enc['ciphertext']
        self.iv = enc['iv']
        self.auth_tag = enc['authTag']

    def get_decrypted_payload(self) -> str:
        """Decrypts and returns the raw plaintext secret payload."""
        return decrypt_field(self.encrypted_ciphertext, self.iv, self.auth_tag)

class VerificationChallenge(models.Model):
    """
    Ownership verification questions configured for an item.
    Answers are securely hashed with PBKDF2/Bcrypt and NEVER stored in plaintext.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name='verification_challenges',
        db_index=True,
    )
    question_text = models.CharField(max_length=300)
    hashed_answer = models.CharField(max_length=255)
    hint = models.CharField(max_length=150, blank=True, default='')
    max_attempts = models.PositiveIntegerField(default=3)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Verification Challenge'
        verbose_name_plural = 'Verification Challenges'
        ordering = ['created_at']

    def __str__(self):
        return f"Challenge for {self.item.reference_number}: {self.question_text[:40]}"

    def set_answer(self, raw_answer: str):
        """Normalizes and hashes expected challenge answer."""
        normalized = raw_answer.strip().lower()
        self.hashed_answer = make_password(normalized)

    def check_answer(self, raw_answer: str) -> bool:
        """Verifies candidate answer against the stored cryptographic hash."""
        normalized = raw_answer.strip().lower()
        return check_password(normalized, self.hashed_answer)
