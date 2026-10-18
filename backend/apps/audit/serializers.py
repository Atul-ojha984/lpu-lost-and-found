"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Audit App Serializers
==============================================================================
"""

from rest_framework import serializers
from .models import AuditEntry
from apps.accounts.models import User

class AuditActorBriefSerializer(serializers.ModelSerializer):
    """Sanitized actor representation for audit entries."""
    _id = serializers.CharField(source='id', read_only=True)
    fullName = serializers.CharField(source='full_name', read_only=True)
    registrationNumber = serializers.CharField(source='registration_number', read_only=True)
    securityPost = serializers.CharField(source='security_post', read_only=True)

    class Meta:
        model = User
        fields = ['_id', 'id', 'fullName', 'email', 'registrationNumber', 'role', 'securityPost']

class AuditEntrySerializer(serializers.ModelSerializer):
    """Sanitized compliance audit log serializer."""
    _id = serializers.CharField(source='id', read_only=True)
    actor = AuditActorBriefSerializer(read_only=True)
    actorRole = serializers.CharField(source='actor_role', read_only=True)
    targetEntity = serializers.CharField(source='target_entity', read_only=True)
    targetId = serializers.CharField(source='target_id', read_only=True)
    ipAddress = serializers.CharField(source='ip_address', read_only=True)
    userAgent = serializers.CharField(source='user_agent', read_only=True)

    class Meta:
        model = AuditEntry
        fields = [
            '_id',
            'id',
            'actor',
            'actorRole',
            'action',
            'targetEntity',
            'targetId',
            'ipAddress',
            'userAgent',
            'metadata',
            'timestamp',
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Redaction guarantee: strip secrets, hashes, OTPs, raw expected answers
        metadata = dict(instance.metadata or {})
        sensitive_keys = [
            'password',
            'passwordHash',
            'otp',
            'otpSecret',
            'otp_hash',
            'expectedAnswer',
            'expected_answer_hash',
            'privateIdentifyingDetails',
            'token',
        ]
        for key in sensitive_keys:
            if key in metadata:
                metadata[key] = '[REDACTED]'
        data['metadata'] = metadata
        return data
