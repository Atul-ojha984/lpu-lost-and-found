"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Handovers App Views
==============================================================================
"""

from datetime import datetime, timezone
from django.db import transaction
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema, OpenApiParameter

from apps.accounts.permissions import IsSecurityOrAdmin
from apps.audit.models import AuditEntry, AuditAction
from apps.custody.models import CustodyRecord, CustodyAction
from apps.items.models import ItemStatus
from apps.claims.models import Claim, ClaimStatus
from .models import Handover
from .serializers import (
    VerifyOtpInputSerializer,
    HandoverReceiptSerializer,
    PendingHandoverItemSerializer,
)

def mask_id_number(raw_id: str) -> str:
    """Masks ID number for safe display and logging."""
    trimmed = raw_id.strip()
    if len(trimmed) <= 4:
        return '****'
    prefix = trimmed[:2]
    suffix = trimmed[-4:]
    return f"{prefix}{'*' * max(4, len(trimmed) - 6)}{suffix}"

class PendingHandoversAPIView(APIView):
    """Retrieve all approved claims awaiting supervised physical handover."""
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Custody'],
        summary='Get Pending Handovers',
        parameters=[
            OpenApiParameter('search', str, description='Search by recipient or reference'),
            OpenApiParameter('page', int, description='Page number'),
            OpenApiParameter('limit', int, description='Page size'),
        ],
        responses={200: PendingHandoverItemSerializer(many=True)},
    )
    def get(self, request):
        queryset = Handover.objects.filter(is_completed=False).select_related(
            'item__category', 'item__location', 'claim', 'recipient', 'supervising_officer'
        ).order_by('-created_at')

        search = request.query_params.get('search')
        if search and search.strip():
            term = search.strip()
            queryset = queryset.filter(
                Q(item__reference_number__icontains=term) |
                Q(item__title__icontains=term) |
                Q(recipient__full_name__icontains=term) |
                Q(recipient__registration_number__icontains=term)
            )

        serializer = PendingHandoverItemSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

class VerifyOtpHandoverAPIView(APIView):
    """Authenticate 6-digit OTP and complete physical property release."""
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Custody'],
        summary='Verify OTP and Complete Handover',
        request=VerifyOtpInputSerializer,
        responses={200: HandoverReceiptSerializer},
    )
    def post(self, request):
        serializer = VerifyOtpInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        try:
            claim = Claim.objects.select_related('item', 'claimant').get(pk=vd['claimId'])
        except Claim.DoesNotExist:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Claim not found.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if claim.claim_status == ClaimStatus.COMPLETED:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_400_BAD_REQUEST,
                    'error': {'code': 'DUPLICATE_HANDOVER', 'message': 'Duplicate Handover Guard: This claim has already completed handover.'},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if claim.claim_status != ClaimStatus.APPROVED:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_400_BAD_REQUEST,
                    'error': {'code': 'INVALID_STATUS', 'message': f"Cannot execute handover: Claim is in status '{claim.claim_status}'. Only APPROVED claims can be handed over."},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        item = claim.item
        if item.status == ItemStatus.HANDED_OVER:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_409_CONFLICT,
                    'error': {'code': 'CONFLICT', 'message': 'Duplicate Handover Guard: This property has already been handed over.'},
                },
                status=status.HTTP_409_CONFLICT,
            )

        handover = Handover.objects.filter(claim=claim).first()
        if not handover:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'No handover tracking record found for this claim.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if handover.is_completed:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_400_BAD_REQUEST,
                    'error': {'code': 'DUPLICATE_HANDOVER', 'message': 'Duplicate Handover Guard: Handover record is already marked as completed.'},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # OTP Expiry check
        if handover.otp_expires_at and handover.otp_expires_at < datetime.now(timezone.utc):
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_400_BAD_REQUEST,
                    'error': {'code': 'OTP_EXPIRED', 'message': 'Handover OTP has expired. Security supervisor must re-issue OTP.'},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # OTP Attempt limits
        if handover.otp_attempts_count >= 5:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_400_BAD_REQUEST,
                    'error': {'code': 'SECURITY_LOCKOUT', 'message': 'Maximum OTP attempts (5) exceeded. Handover locked for security.'},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_otp_valid = handover.verify_otp(vd['otp'])
        if not is_otp_valid:
            handover.otp_attempts_count += 1
            handover.save(update_fields=['otp_attempts_count'])

            AuditEntry.objects.create(
                actor=request.user,
                actor_role=request.user.role,
                action='HANDOVER_OTP_FAILED',
                target_entity='Handover',
                target_id=str(handover.id),
                ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                metadata={'claimId': str(claim.id), 'itemId': str(item.id), 'attemptNumber': handover.otp_attempts_count},
            )

            remaining = max(0, 5 - handover.otp_attempts_count)
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_400_BAD_REQUEST,
                    'error': {'code': 'INVALID_OTP', 'message': f'Invalid Handover OTP. {remaining} attempt(s) remaining before lockout.'},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        masked_id = mask_id_number(vd['idCardNumber'])
        completion_time = datetime.now(timezone.utc)

        with transaction.atomic():
            # Update Item
            item.status = ItemStatus.HANDED_OVER
            item.current_custody_desk = f"Handed over to {claim.claimant.full_name}"
            item.save()

            # Update Claim
            claim.claim_status = ClaimStatus.COMPLETED
            claim.save()

            # Update Handover
            handover.is_completed = True
            handover.completed_at = completion_time
            handover.supervising_officer = request.user
            handover.physical_desk_location = vd['physicalDeskLocation'].strip()
            handover.id_card_presented_type = vd['idCardPresentedType'].strip()
            handover.id_card_number_masked = masked_id
            handover.recipient_signature_url = vd.get('recipientSignatureUrl', '').strip()
            handover.acknowledgement_notes = vd.get('acknowledgementNotes', '').strip()
            handover.proof_evidence_url = vd.get('proofEvidenceUrl', '').strip()
            handover.save()

            # Append Custody Record
            CustodyRecord.objects.create(
                item=item,
                action=CustodyAction.HANDED_OVER,
                from_location=item.current_custody_desk or vd['physicalDeskLocation'],
                to_location='CLAIMANT_HANDOVER_COMPLETE',
                evidence_reference=vd.get('proofEvidenceUrl', '').strip(),
                handled_by=request.user,
                remarks=vd.get('acknowledgementNotes') or f"Property released to verified claimant. ID: {masked_id}",
                timestamp=completion_time,
            )

            # Append Audit Entry
            AuditEntry.objects.create(
                actor=request.user,
                actor_role=request.user.role,
                action=AuditAction.HANDOVER_EXECUTE,
                target_entity='Handover',
                target_id=str(handover.id),
                ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                metadata={
                    'claimId': str(claim.id),
                    'itemId': str(item.id),
                    'referenceNumber': item.reference_number,
                    'recipientId': str(claim.claimant.id),
                    'idCardPresentedType': vd['idCardPresentedType'],
                    'idCardNumberMasked': masked_id,
                },
            )

        receipt = {
            'handoverId': str(handover.id),
            'claimId': str(claim.id),
            'itemId': str(item.id),
            'referenceNumber': item.reference_number,
            'itemTitle': item.title,
            'recipientName': claim.claimant.full_name,
            'recipientRegNo': claim.claimant.registration_number,
            'recipientEmail': claim.claimant.email,
            'officerId': str(request.user.id),
            'physicalDeskLocation': handover.physical_desk_location,
            'idCardPresentedType': handover.id_card_presented_type,
            'idCardNumberMasked': masked_id,
            'acknowledgementNotes': handover.acknowledgement_notes,
            'proofEvidenceUrl': handover.proof_evidence_url,
            'completedAt': completion_time,
        }

        return Response(receipt, status=status.HTTP_200_OK)
