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


class DirectRecoveryIntakeSerializer(serializers.Serializer):
    """Validate a physical intake linked to an existing lost-item report."""
    reportId = serializers.UUIDField()
    physicalDeskLocation = serializers.CharField(max_length=150)
    custodyLocationId = serializers.UUIDField(required=False)
    physicalItemReceived = serializers.BooleanField()
    intakeNotes = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')

    def validate_physicalDeskLocation(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Security desk location is required.')
        return value


class DirectVerificationAnswerSerializer(serializers.Serializer):
    challengeId = serializers.UUIDField()
    answer = serializers.CharField(max_length=300, trim_whitespace=True)


class DirectRecoveryReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['APPROVE', 'REJECT'])
    verificationNotes = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')
    rejectionReason = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')
    studentIdVerified = serializers.BooleanField(required=False, default=False)
    privateDetailsMatched = serializers.BooleanField(required=False, default=False)
    reportPhotoMatched = serializers.BooleanField(required=False, default=False)
    verificationAnswers = DirectVerificationAnswerSerializer(many=True, required=False, default=list)

    def validate(self, attrs):
        if attrs['action'] == 'APPROVE':
            if not attrs.get('studentIdVerified'):
                raise serializers.ValidationError({'studentIdVerified': 'In-person university ID verification is required.'})
            if len(attrs.get('verificationNotes', '').strip()) < 20:
                raise serializers.ValidationError({'verificationNotes': 'Record at least 20 characters describing the independent ownership checks.'})
        elif not attrs.get('rejectionReason', '').strip():
            raise serializers.ValidationError({'rejectionReason': 'A reason is required when rejecting a direct recovery.'})
        return attrs


class DirectRecoveryVerifyOtpSerializer(serializers.Serializer):
    otp = serializers.RegexField(r'^\d{6}$')
    physicalDeskLocation = serializers.CharField(max_length=150)
    custodyLocationId = serializers.UUIDField(required=False)
    idCardPresentedType = serializers.CharField(max_length=100)
    idCardNumber = serializers.CharField(max_length=50)
    idCardInspected = serializers.BooleanField()
    recipientSignatureUrl = serializers.CharField(required=False, allow_blank=True, default='')
    acknowledgementNotes = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')
    proofEvidenceUrl = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_physicalDeskLocation(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Security desk location is required.')
        return value

    def validate_idCardInspected(self, value):
        if not value:
            raise serializers.ValidationError('Confirm that the physical university ID was inspected before handover.')
        return value

class VerifyOtpInputSerializer(serializers.Serializer):
    """Input serializer for completing a supervised physical handover."""
    claimId = serializers.CharField()
    otp = serializers.CharField()
    physicalDeskLocation = serializers.CharField(max_length=150)
    custodyLocationId = serializers.UUIDField(required=False)
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
