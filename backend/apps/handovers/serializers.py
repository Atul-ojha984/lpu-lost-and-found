"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Handovers App Serializers
==============================================================================
"""

from rest_framework import serializers
from apps.accounts.serializers import UserSerializer
from apps.items.serializers import PublicItemSerializer
from apps.claims.serializers import ClaimSerializer
from .models import Handover

class VerifyOtpInputSerializer(serializers.Serializer):
    """Input serializer for completing a supervised physical handover."""
    claimId = serializers.CharField()
    otp = serializers.CharField()
    physicalDeskLocation = serializers.CharField(max_length=150)
    idCardPresentedType = serializers.CharField(max_length=100)
    idCardNumber = serializers.CharField(max_length=50)
    recipientSignatureUrl = serializers.CharField(required=False, allow_blank=True, default='')
    acknowledgementNotes = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')
    proofEvidenceUrl = serializers.CharField(required=False, allow_blank=True, default='')

class HandoverReceiptSerializer(serializers.Serializer):
    """Official property handover receipt returned after verification."""
    handoverId = serializers.CharField()
    claimId = serializers.CharField()
    itemId = serializers.CharField()
    referenceNumber = serializers.CharField()
    itemTitle = serializers.CharField()
    recipientName = serializers.CharField()
    recipientRegNo = serializers.CharField()
    recipientEmail = serializers.CharField()
    officerId = serializers.CharField()
    physicalDeskLocation = serializers.CharField()
    idCardPresentedType = serializers.CharField()
    idCardNumberMasked = serializers.CharField()
    acknowledgementNotes = serializers.CharField(allow_blank=True)
    proofEvidenceUrl = serializers.CharField(allow_blank=True)
    completedAt = serializers.DateTimeField()

class PendingHandoverItemSerializer(serializers.ModelSerializer):
    """Pending handover item record representation."""
    _id = serializers.CharField(source='id', read_only=True)
    claim = ClaimSerializer(read_only=True)
    item = PublicItemSerializer(read_only=True)
    recipient = UserSerializer(read_only=True)
    supervisingOfficer = UserSerializer(source='supervising_officer', read_only=True)
    otpExpiresAt = serializers.DateTimeField(source='otp_expires_at', read_only=True)
    physicalDeskLocation = serializers.CharField(source='physical_desk_location')
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = Handover
        fields = [
            '_id',
            'id',
            'item',
            'claim',
            'recipient',
            'supervisingOfficer',
            'otpExpiresAt',
            'physicalDeskLocation',
            'is_completed',
            'createdAt',
        ]
