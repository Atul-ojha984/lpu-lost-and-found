"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Claims App Views
==============================================================================
"""

import os
import uuid
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter

from apps.accounts.permissions import IsSecurityOrAdmin
from apps.audit.models import AuditEntry, AuditAction
from apps.items.models import Item
from apps.handovers.models import Handover
from .models import Claim, ClaimStatus
from .serializers import (
    SubmitClaimSerializer,
    AnswerChallengeInputSerializer,
    ReviewClaimInputSerializer,
    ClaimSerializer,
)
from .services import submit_claim, answer_challenge, review_claim

ALLOWED_EVIDENCE_EXTENSIONS = {'.pdf', '.jpg', '.jpeg', '.png', '.webp'}
ALLOWED_EVIDENCE_MIMES = {
    'application/pdf',
    'application/x-pdf',
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/x-png',
    'image/webp',
}
MAX_EVIDENCE_SIZE = 5 * 1024 * 1024  # 5 MB

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
        ).exclude(
            Q(claim_status=ClaimStatus.COMPLETED) | Q(handovers__is_completed=True)
        ).prefetch_related('challenge_answers__challenge', 'handovers').distinct().order_by('-created_at')
        serializer = ClaimSerializer(claims, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

class PendingClaimsQueueAPIView(APIView):
    """Security Queue: Searchable, filterable ownership-claim register for security personnel."""
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Claims'],
        summary='Security Claims Register',
        parameters=[
            OpenApiParameter('status', str, description='Filter by claim status (e.g. SUBMITTED, UNDER_REVIEW, CHALLENGE_REQUIRED, APPROVED, REJECTED, COMPLETED, ALL)'),
            OpenApiParameter('search', str, description='Search by item reference, title, claimant name, or reg number'),
        ],
        responses={200: ClaimSerializer(many=True)},
    )
    def get(self, request):
        queryset = Claim.objects.all().select_related(
            'item__category', 'item__location', 'claimant', 'reviewed_by'
        ).prefetch_related('challenge_answers__challenge')

        status_param = request.query_params.get('status')
        if status_param and status_param.upper() != 'ALL':
            st_upper = status_param.upper()
            if st_upper in ('READY_FOR_HANDOVER', 'AWAITING_COLLECTION'):
                queryset = queryset.filter(claim_status=ClaimStatus.APPROVED)
            elif st_upper == 'COMPLETED':
                queryset = queryset.filter(Q(claim_status=ClaimStatus.COMPLETED) | Q(handovers__is_completed=True))
            else:
                queryset = queryset.filter(claim_status=st_upper)
        elif not status_param:
            # Default: show all claims for register overview
            pass

        search_param = request.query_params.get('search')
        if search_param and search_param.strip():
            term = search_param.strip()
            # If search term has CLM- prefix, strip it to search UUID
            raw_term = term[4:] if term.upper().startswith('CLM-') else term
            queryset = queryset.filter(
                Q(statement__icontains=term) |
                Q(item__title__icontains=term) |
                Q(item__reference_number__icontains=term) |
                Q(claimant__full_name__icontains=term) |
                Q(claimant__registration_number__icontains=term) |
                Q(claimant__email__icontains=term) |
                Q(review_notes__icontains=term) |
                Q(rejection_reason__icontains=term) |
                Q(id__icontains=raw_term)
            )

        queryset = queryset.distinct().order_by('-created_at')
        serializer = ClaimSerializer(queryset, many=True, context={'request': request})
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

class ClaimEvidenceUploadAPIView(APIView):
    """
    Upload ownership evidence (invoice, photo, student ID) for an existing claim.
    Strictly restricted to the claimant who submitted the claim.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        target_path = None
        try:
            with transaction.atomic():
                # Match the item -> claim lock order used by supervised handover
                # so uploads cannot race a successful recovery transaction.
                try:
                    claim_seed = Claim.objects.only('item_id').get(pk=pk)
                    Item.objects.select_for_update().get(pk=claim_seed.item_id)
                    claim = Claim.objects.select_for_update().get(pk=pk)
                except (Claim.DoesNotExist, Item.DoesNotExist, ValueError):
                    return Response(
                        {'success': False, 'statusCode': 404, 'error': {'code': 'NOT_FOUND', 'message': 'Claim not found.'}},
                        status=status.HTTP_404_NOT_FOUND
                    )

                is_claimant = claim.claimant_id == request.user.id
                is_authorized_staff = request.user.role in ('SECURITY_PERSONNEL', 'CAMPUS_ADMIN', 'SYSTEM_ADMIN')

                if not (is_claimant or is_authorized_staff):
                    return Response(
                        {'success': False, 'statusCode': 403, 'error': {'code': 'FORBIDDEN', 'message': 'You are not authorized to upload evidence for this claim.'}},
                        status=status.HTTP_403_FORBIDDEN
                    )

                if claim.claim_status == ClaimStatus.COMPLETED or Handover.objects.filter(
                    claim=claim, is_completed=True
                ).exists():
                    return Response(
                        {
                            'success': False,
                            'statusCode': status.HTTP_409_CONFLICT,
                            'error': {
                                'code': 'RECOVERY_COMPLETED',
                                'message': 'Evidence submission is closed because this item has already been successfully recovered.',
                            },
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

                uploaded_file = request.FILES.get('file') or request.FILES.get('evidence')
                if not uploaded_file:
                    return Response(
                        {'success': False, 'statusCode': 400, 'error': {'code': 'BAD_REQUEST', 'message': 'No evidence file provided.'}},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                if uploaded_file.size > MAX_EVIDENCE_SIZE:
                    return Response(
                        {'success': False, 'statusCode': 400, 'error': {'code': 'FILE_TOO_LARGE', 'message': 'File size exceeds maximum allowed size of 5MB.'}},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                ext = os.path.splitext(uploaded_file.name)[1].lower()
                if ext not in ALLOWED_EVIDENCE_EXTENSIONS or uploaded_file.content_type.lower() not in ALLOWED_EVIDENCE_MIMES:
                    return Response(
                        {'success': False, 'statusCode': 400, 'error': {'code': 'INVALID_FILE_TYPE', 'message': 'Invalid file type. Allowed formats: PNG, JPG, JPEG, WEBP, PDF.'}},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                private_dir = settings.BASE_DIR / 'private_evidence' / str(claim.id)
                os.makedirs(private_dir, exist_ok=True)

                safe_filename = f"{uuid.uuid4().hex}{ext}"
                target_path = private_dir / safe_filename

                with open(target_path, 'wb+') as destination:
                    for chunk in uploaded_file.chunks():
                        destination.write(chunk)

                evidence_url = f"/api/v1/claims/{claim.id}/evidence/{safe_filename}/"

                current_urls = claim.private_evidence_proof_urls or []
                if isinstance(current_urls, list):
                    current_urls.append(evidence_url)
                    claim.private_evidence_proof_urls = current_urls
                    claim.save(update_fields=['private_evidence_proof_urls', 'updated_at'])

                AuditEntry.objects.create(
                    actor=request.user,
                    actor_role=request.user.role,
                    action=AuditAction.CLAIM_SUBMIT,
                    target_entity='CLAIM',
                    target_id=str(claim.id),
                    metadata={
                        'event': 'EVIDENCE_UPLOADED',
                        'original_filename': uploaded_file.name,
                        'size': uploaded_file.size,
                    },
                    ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
                    user_agent=request.META.get('HTTP_USER_AGENT', ''),
                )
        except Exception:
            if target_path and target_path.exists():
                target_path.unlink()
            raise

        return Response(
            {
                'message': 'Ownership verification evidence uploaded successfully.',
                'url': evidence_url,
                'claim': ClaimSerializer(claim, context={'request': request}).data
            },
            status=status.HTTP_201_CREATED
        )

class ClaimEvidenceDownloadAPIView(APIView):
    """
    Secure download endpoint for private claim evidence.
    Access strictly restricted to claimant, security personnel, and administrators.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, filename):
        try:
            claim = Claim.objects.get(pk=pk)
        except (Claim.DoesNotExist, ValueError):
            raise Http404("Evidence not found.")

        is_claimant = claim.claimant_id == request.user.id
        is_authorized_staff = request.user.role in ('SECURITY_PERSONNEL', 'CAMPUS_ADMIN', 'SYSTEM_ADMIN')

        if not (is_claimant or is_authorized_staff):
            return Response(
                {'success': False, 'statusCode': 403, 'error': {'code': 'FORBIDDEN', 'message': 'Access to private claim evidence is restricted.'}},
                status=status.HTTP_403_FORBIDDEN
            )

        safe_filename = os.path.basename(filename)
        file_path = settings.BASE_DIR / 'private_evidence' / str(claim.id) / safe_filename

        if not os.path.exists(file_path):
            raise Http404("Evidence document not found.")

        return FileResponse(open(file_path, 'rb'))
