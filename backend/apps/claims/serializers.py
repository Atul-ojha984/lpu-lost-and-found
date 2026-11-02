"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Claims App Serializers
==============================================================================
"""

from rest_framework import serializers
from apps.accounts.serializers import UserSerializer
from apps.items.serializers import PublicItemSerializer
from .models import Claim, ClaimChallengeAnswer, ClaimStatus

class ChallengeAnswerInputSerializer(serializers.Serializer):
    challengeId = serializers.CharField(required=False)
    challenge_id = serializers.CharField(required=False)
    providedAnswer = serializers.CharField(required=False, allow_blank=True)
    provided_answer = serializers.CharField(required=False, allow_blank=True)
    answer = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        cid = attrs.get('challengeId') or attrs.get('challenge_id')
        if not cid:
            raise serializers.ValidationError({'challengeId': "Verification challenge identifier is required."})
        attrs['challengeId'] = str(cid).strip()

        ans = attrs.get('providedAnswer') or attrs.get('provided_answer') or attrs.get('answer') or ''
        attrs['providedAnswer'] = str(ans).strip()
        return attrs

class SubmitClaimSerializer(serializers.Serializer):
    """Input serializer for filing an ownership claim."""
    itemId = serializers.CharField(required=False)
    item_id = serializers.CharField(required=False)
    item = serializers.CharField(required=False)
    statement = serializers.CharField(max_length=2000, required=True)
    challengeAnswers = serializers.ListField(required=False, default=list)
    challenge_answers = serializers.ListField(required=False, default=list)
    privateEvidenceProofUrls = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    private_evidence_urls = serializers.ListField(child=serializers.CharField(), required=False, default=list)

    def validate_statement(self, value):
        if not value or not str(value).strip():
            raise serializers.ValidationError("A detailed statement explaining your ownership is required.")
        return str(value).strip()

    def validate(self, attrs):
        target_item = attrs.get('itemId') or attrs.get('item_id') or attrs.get('item')
        if not target_item or not str(target_item).strip():
            raise serializers.ValidationError({'itemId': "Item ID or reference number is required."})
        attrs['itemId'] = str(target_item).strip()

        # Normalize challenge answers
        raw_answers = attrs.get('challengeAnswers') or attrs.get('challenge_answers') or []
        normalized_answers = []
        for a in raw_answers:
            if isinstance(a, dict):
                cid = a.get('challengeId') or a.get('challenge_id')
                ans = a.get('providedAnswer') or a.get('provided_answer') or a.get('answer') or ''
                if cid and str(ans).strip():
                    normalized_answers.append({
                        'challengeId': str(cid).strip(),
                        'providedAnswer': str(ans).strip(),
                    })
        attrs['challengeAnswers'] = normalized_answers

        # Normalize evidence urls
        urls = attrs.get('privateEvidenceProofUrls') or attrs.get('private_evidence_urls') or []
        attrs['privateEvidenceProofUrls'] = urls
        return attrs

class AnswerChallengeInputSerializer(serializers.Serializer):
    """Input serializer for answering an individual verification challenge."""
    answer = serializers.CharField()

class ReviewClaimInputSerializer(serializers.Serializer):
    """Input serializer for security adjudication."""
    action = serializers.ChoiceField(choices=['APPROVE', 'REJECT'])
    reviewNotes = serializers.CharField(required=False, allow_blank=True, default='')
    rejectionReason = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if attrs['action'] == 'REJECT' and not attrs.get('rejectionReason', '').strip():
            raise serializers.ValidationError({'rejectionReason': "A specific rejection reason is mandatory when declining an ownership claim."})
        return attrs

class ClaimChallengeAnswerSerializer(serializers.ModelSerializer):
    challengeId = serializers.CharField(source='challenge_id')
    questionText = serializers.CharField(source='challenge.question_text', read_only=True)
    providedAnswer = serializers.CharField(source='provided_answer')
    isCorrect = serializers.BooleanField(source='is_correct')

    class Meta:
        model = ClaimChallengeAnswer
        fields = [
            'id',
            'challengeId',
            'questionText',
            'providedAnswer',
            'isCorrect',
        ]

class ClaimSerializer(serializers.ModelSerializer):
    """Unified Claim serializer for claimant view and security queue."""
    _id = serializers.CharField(source='id', read_only=True)
    item = PublicItemSerializer(read_only=True)
    itemId = serializers.CharField(source='item.id', read_only=True)
    itemTitle = serializers.CharField(source='item.title', read_only=True)
    itemReference = serializers.CharField(source='item.reference_number', read_only=True)
    itemType = serializers.CharField(source='item.item_type', read_only=True)
    claimant = UserSerializer(read_only=True)
    reviewedBy = UserSerializer(source='reviewed_by', read_only=True)
    claimStatus = serializers.CharField(source='claim_status')
    privateEvidenceProofUrls = serializers.JSONField(source='private_evidence_proof_urls')
    verificationAttemptsCount = serializers.IntegerField(source='verification_attempts_count')
    challengeAnswers = ClaimChallengeAnswerSerializer(source='challenge_answers', many=True, read_only=True)
    reviewedAt = serializers.DateTimeField(source='reviewed_at', read_only=True)
    reviewNotes = serializers.CharField(source='review_notes')
    rejectionReason = serializers.CharField(source='rejection_reason')
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    submittedAt = serializers.DateTimeField(source='created_at', read_only=True)
    
    # Handover OTP is conditionally revealed ONLY to the verified claimant when APPROVED
    handoverOtp = serializers.SerializerMethodField()
    claimReference = serializers.SerializerMethodField()
    handoverStatus = serializers.SerializerMethodField()
    handoverCompletedAt = serializers.SerializerMethodField()

    class Meta:
        model = Claim
        fields = [
            '_id',
            'id',
            'claimReference',
            'itemId',
            'itemTitle',
            'itemReference',
            'itemType',
            'item',
            'claimant',
            'claimStatus',
            'statement',
            'challengeAnswers',
            'privateEvidenceProofUrls',
            'reviewedBy',
            'reviewedAt',
            'reviewNotes',
            'rejectionReason',
            'handoverOtp',
            'handoverStatus',
            'handoverCompletedAt',
            'verificationAttemptsCount',
            'createdAt',
            'submittedAt',
        ]

    def get_claimReference(self, obj):
        return f"CLM-{str(obj.id)[:8].upper()}"

    def get_handoverStatus(self, obj):
        handover = obj.handovers.first()
        if handover:
            return 'COMPLETED' if handover.is_completed else 'READY_FOR_HANDOVER'
        if obj.claim_status == ClaimStatus.APPROVED:
            return 'AWAITING_COLLECTION'
        return None

    def get_handoverCompletedAt(self, obj):
        handover = obj.handovers.filter(is_completed=True).first()
        if handover and handover.completed_at:
            return handover.completed_at
        return None

    def get_handoverOtp(self, obj):
        request = self.context.get('request')
        # Only expose to claimant or security officer if claim is APPROVED
        if obj.claim_status == ClaimStatus.APPROVED and obj.handover_otp:
            if request and request.user and (request.user.id == obj.claimant_id or request.user.role in ('SECURITY_PERSONNEL', 'CAMPUS_ADMIN', 'SYSTEM_ADMIN')):
                return obj.handover_otp
        return None
