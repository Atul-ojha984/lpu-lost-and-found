"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Claims App Views
==============================================================================
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiResponse

from apps.accounts.permissions import IsSecurityOrAdmin
from .models import Claim, ClaimStatus
from .serializers import (
    SubmitClaimSerializer,
    AnswerChallengeInputSerializer,
    ReviewClaimInputSerializer,
    ClaimSerializer,
)
from .services import submit_claim, answer_challenge, review_claim

class ClaimCreateAPIView(APIView):
    """Submit a new ownership claim with evidence and challenge answers."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Claims'],
        summary='Submit Ownership Claim',
        request=SubmitClaimSerializer,
        responses={201: ClaimSerializer},
    )
    def post(self, request):
        serializer = SubmitClaimSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        claim = submit_claim(
            user=request.user,
            item_id=vd['itemId'],
            statement=vd['statement'],
            challenge_answers=vd.get('challengeAnswers'),
            private_evidence_urls=vd.get('privateEvidenceProofUrls'),
            req_ip=request.META.get('REMOTE_ADDR', '127.0.0.1'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        return Response(ClaimSerializer(claim, context={'request': request}).data, status=status.HTTP_201_CREATED)

class ClaimAnswerChallengeAPIView(APIView):
    """Answer a verification challenge for an active claim."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Claims'],
        summary='Answer Verification Challenge',
        request=AnswerChallengeInputSerializer,
        responses={200: OpenApiResponse(description='Challenge evaluation result')},
    )
    def post(self, request, pk, challenge_id):
        serializer = AnswerChallengeInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = answer_challenge(
            claim_id=pk,
            user=request.user,
            challenge_id=challenge_id,
            answer_text=serializer.validated_data['answer'],
            req_ip=request.META.get('REMOTE_ADDR', '127.0.0.1'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        return Response(result, status=status.HTTP_200_OK)

class MyClaimsAPIView(APIView):
    """Retrieve all claims submitted by the currently authenticated user."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Claims'],
        summary='Get My Claims',
        responses={200: ClaimSerializer(many=True)},
    )
    def get(self, request):
        claims = Claim.objects.filter(claimant=request.user).select_related(
            'item__category', 'item__location', 'reviewed_by'
        ).prefetch_related('challenge_answers__challenge').order_by('-created_at')
        serializer = ClaimSerializer(claims, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

class PendingClaimsQueueAPIView(APIView):
    """Security Queue: Retrieve pending claims awaiting adjudication."""
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Claims'],
        summary='Security Pending Claims Queue',
        responses={200: ClaimSerializer(many=True)},
    )
    def get(self, request):
        claims = Claim.objects.filter(
            claim_status__in=[ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW, ClaimStatus.CHALLENGE_REQUIRED]
        ).select_related(
            'item__category', 'item__location', 'claimant', 'reviewed_by'
        ).prefetch_related('challenge_answers__challenge').order_by('created_at')
        serializer = ClaimSerializer(claims, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

class ItemClaimsAPIView(APIView):
    """Security inspection: Retrieve all competing claims for a specific item."""
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Claims'],
        summary='Get Competing Claims for Item',
        responses={200: ClaimSerializer(many=True)},
    )
    def get(self, request, item_id):
        claims = Claim.objects.filter(item_id=item_id).select_related(
            'item__category', 'item__location', 'claimant', 'reviewed_by'
        ).prefetch_related('challenge_answers__challenge').order_by('-created_at')
        serializer = ClaimSerializer(claims, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

class ReviewClaimAPIView(APIView):
    """Security Adjudication: Approve or Reject an ownership claim."""
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Claims'],
        summary='Review and Adjudicate Claim',
        request=ReviewClaimInputSerializer,
        responses={200: ClaimSerializer},
    )
    def patch(self, request, pk):
        serializer = ReviewClaimInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        claim = review_claim(
            reviewer=request.user,
            claim_id=pk,
            action=vd['action'],
            review_notes=vd.get('reviewNotes', ''),
            rejection_reason=vd.get('rejectionReason', ''),
            req_ip=request.META.get('REMOTE_ADDR', '127.0.0.1'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        return Response(ClaimSerializer(claim, context={'request': request}).data, status=status.HTTP_200_OK)

    def post(self, request, pk):
        return self.patch(request, pk)
