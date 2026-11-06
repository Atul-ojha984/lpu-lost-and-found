"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Handovers App Views
==============================================================================
"""

import logging
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiParameter

from apps.accounts.permissions import IsSecurityOrAdmin, IsStudentOrStaff
from apps.audit.models import AuditEntry, AuditAction
from apps.custody.models import CustodyLocation, CustodyRecord, CustodyAction, Locker
from apps.items.models import Item, ItemStatus
from apps.claims.models import Claim, ClaimStatus
from .models import DirectRecovery, DirectRecoveryStatus, Handover
from .serializers import (
    VerifyOtpInputSerializer,
    HandoverReceiptSerializer,
    PendingHandoverItemSerializer,
)
from apps.items.serializers import PublicItemSerializer

logger = logging.getLogger(__name__)


class HandoverSlipAPIView(APIView):
    """Return printable receipt data only for a completed, authorized handover."""
    permission_classes = [IsAuthenticated]

    def get(self, request, handover_id):
        try:
            handover = Handover.objects.select_related(
                'item__category', 'claim__item', 'claim__reviewed_by', 'recipient', 'supervising_officer'
            ).filter(pk=handover_id).first()
        except (ValueError, TypeError):
            handover = None
        if not handover:
            return Response({'message': 'Completed handover not found.'}, status=status.HTTP_404_NOT_FOUND)
        if (
            not handover.is_completed
            or not handover.completed_at
            or handover.claim.claim_status != ClaimStatus.COMPLETED
            or handover.claim.item_id != handover.item_id
            or handover.claim.claimant_id != handover.recipient_id
            or handover.item.status != ItemStatus.HANDED_OVER
        ):
            return Response({'message': 'A handover slip is available only after the property handover is completed.'}, status=status.HTTP_409_CONFLICT)
        is_owner = handover.recipient_id == request.user.id and handover.claim.claimant_id == request.user.id
        is_security_or_admin = request.user.role in ('SECURITY_PERSONNEL', 'CAMPUS_ADMIN', 'SYSTEM_ADMIN')
        if not (is_owner or is_security_or_admin):
            return Response({'message': 'Completed handover not found.'}, status=status.HTTP_404_NOT_FOUND)

        handover_custody = CustodyRecord.objects.filter(
            item_id=handover.item_id,
            action=CustodyAction.HANDED_OVER,
            handled_by_id=handover.supervising_officer_id,
            timestamp=handover.completed_at,
        ).order_by('-timestamp').first()
        locker_number = handover_custody.previous_locker_reference if handover_custody else ''
        if not locker_number:
            last_locker_record = CustodyRecord.objects.filter(
                item_id=handover.item_id,
                action=CustodyAction.STORED_IN_LOCKER,
                timestamp__lte=handover.completed_at,
            ).order_by('-timestamp').first()
            locker_number = last_locker_record.locker_reference if last_locker_record else ''

        approver = handover.claim.reviewed_by
        AuditEntry.objects.create(
            actor=request.user,
            actor_role=request.user.role,
            action=AuditAction.HANDOVER_SLIP_ACCESS,
            target_entity='Handover',
            target_id=str(handover.id),
            ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={
                'claimId': str(handover.claim_id),
                'itemId': str(handover.item_id),
                'recipientId': str(handover.recipient_id),
                'handedOverAt': handover.completed_at.isoformat(),
            },
        )
        return Response({
            'handoverId': str(handover.id),
            'handoverReference': f"HND-{str(handover.id).upper()}",
            'handoverDate': handover.completed_at,
            'status': ClaimStatus.COMPLETED,
            'student': {
                'fullName': handover.recipient.full_name,
                'registrationNumber': handover.recipient.registration_number,
                'department': handover.recipient.department or 'Not provided',
                'mobile': handover.recipient.phone or 'Not provided',
            },
            'item': {
                'id': str(handover.item_id),
                'title': handover.item.title,
                'category': handover.item.category.name,
                'description': handover.item.public_description,
                'imageUrl': handover.item.primary_image_url,
                'additionalImages': handover.item.additional_images or [],
                'reportReference': handover.item.reference_number,
                'reportId': str(handover.item_id),
            },
            'claimId': str(handover.claim_id),
            'claimReference': f"CLM-{str(handover.claim_id)[:8].upper()}",
            'approval': {
                'officerName': approver.full_name if approver else 'Not recorded',
                'officerRegistrationNumber': approver.registration_number if approver else '',
                'approvedAt': handover.claim.reviewed_at,
            },
            'handoverOfficer': {
                'fullName': handover.supervising_officer.full_name,
                'registrationNumber': handover.supervising_officer.registration_number,
            },
            'securityOffice': handover.physical_desk_location,
            'lockerNumber': locker_number or 'Not assigned',
            'idCardPresentedType': handover.id_card_presented_type,
            'idCardNumberMasked': handover.id_card_number_masked,
            'acknowledgementNotes': handover.acknowledgement_notes,
            'recipientSignatureUrl': handover.recipient_signature_url,
        }, status=status.HTTP_200_OK)


class MyRecoveryHistoryAPIView(APIView):
    """Return only the authenticated student's/staff member's completed handovers."""
    permission_classes = [IsAuthenticated, IsStudentOrStaff]

    @extend_schema(tags=['Custody'], summary='Get My Completed Recoveries')
    def get(self, request):
        handovers = Handover.objects.filter(
            recipient=request.user,
            claim__claimant=request.user,
            claim__claim_status=ClaimStatus.COMPLETED,
            is_completed=True,
        ).select_related(
            'item__category', 'item__location', 'claim', 'recipient', 'supervising_officer'
        ).order_by('-completed_at', '-created_at')

        history = [
            {
                'id': str(handover.id),
                'handoverId': str(handover.id),
                'handoverReference': f"HND-{str(handover.id).split('-')[0].upper()}",
                'claimId': str(handover.claim_id),
                'claimReference': f"CLM-{str(handover.claim_id)[:8].upper()}",
                'claimStatement': handover.claim.statement,
                'claimSubmittedAt': handover.claim.created_at,
                'itemId': str(handover.item_id),
                'itemTitle': handover.item.title,
                'itemReference': handover.item.reference_number,
                'itemType': handover.item.item_type,
                'category': handover.item.category.name,
                'publicDescription': handover.item.public_description,
                'primaryImageUrl': handover.item.primary_image_url,
                'item': PublicItemSerializer(handover.item, context={'request': request}).data,
                'recoveryDate': handover.completed_at,
                'custodyDesk': handover.physical_desk_location,
                'handoverOfficer': handover.supervising_officer.full_name,
                'handoverOfficerRegistrationNumber': handover.supervising_officer.registration_number,
                'idCardPresentedType': handover.id_card_presented_type,
                'idCardNumberMasked': handover.id_card_number_masked,
                'acknowledgementNotes': handover.acknowledgement_notes,
                'status': ClaimStatus.COMPLETED,
                'recoveryType': 'CLAIM',
            }
            for handover in handovers
        ]

        direct_recoveries = DirectRecovery.objects.filter(
            recipient=request.user,
            status=DirectRecoveryStatus.COMPLETED,
            item__reported_by=request.user,
            item__status=ItemStatus.HANDED_OVER,
        ).select_related(
            'item__category', 'item__location', 'recipient', 'reviewed_by', 'completed_by'
        ).order_by('-completed_at', '-created_at')
        history.extend([
            {
                'id': str(record.id),
                'handoverId': str(record.id),
                'handoverReference': f"DRH-{str(record.id).upper()}",
                'directRecoveryId': str(record.id),
                'claimId': None,
                'claimReference': 'Direct recovery - no claim record',
                'claimStatement': 'Direct security recovery linked to the original lost-item report.',
                'claimSubmittedAt': record.item.created_at,
                'itemId': str(record.item_id),
                'itemTitle': record.item.title,
                'itemReference': record.item.reference_number,
                'itemType': record.item.item_type,
                'category': record.item.category.name,
                'publicDescription': record.item.public_description,
                'primaryImageUrl': record.item.primary_image_url,
                'item': PublicItemSerializer(record.item, context={'request': request}).data,
                'recoveryDate': record.completed_at,
                'custodyDesk': record.physical_desk_location,
                'handoverOfficer': record.completed_by.full_name if record.completed_by else '',
                'handoverOfficerRegistrationNumber': record.completed_by.registration_number if record.completed_by else '',
                'approvingOfficer': record.reviewed_by.full_name if record.reviewed_by else '',
                'lockerNumber': self._direct_recovery_locker(record),
                'idCardPresentedType': record.id_card_presented_type,
                'idCardNumberMasked': record.id_card_number_masked,
                'acknowledgementNotes': record.acknowledgement_notes,
                'status': 'COMPLETED',
                'recoveryType': 'DIRECT_REPORT',
            }
            for record in direct_recoveries
        ])
        history.sort(key=lambda entry: entry['recoveryDate'] or timezone.now(), reverse=True)
        return Response(history, status=status.HTTP_200_OK)

    @staticmethod
    def _direct_recovery_locker(record):
        custody = CustodyRecord.objects.filter(
            item_id=record.item_id,
            action=CustodyAction.HANDED_OVER,
            handled_by_id=record.completed_by_id,
            timestamp=record.completed_at,
        ).first()
        return (custody.previous_locker_reference if custody else '') or 'Not assigned'

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
        queryset = Handover.objects.filter(
            is_completed=False,
            claim__claim_status=ClaimStatus.APPROVED,
            item__status=ItemStatus.READY_FOR_HANDOVER,
        ).select_related(
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
        custody_location_id = vd.get('custodyLocationId')
        if custody_location_id:
            try:
                custody_location = CustodyLocation.objects.get(pk=custody_location_id)
            except (CustodyLocation.DoesNotExist, ValueError):
                return Response({'message': 'Custody location not found.'}, status=status.HTTP_404_NOT_FOUND)
            if not custody_location.is_active:
                return Response({'message': 'This custody location is inactive and cannot be selected.'}, status=status.HTTP_409_CONFLICT)
            vd['physicalDeskLocation'] = custody_location.name
        else:
            configured_location = CustodyLocation.objects.filter(name__iexact=vd['physicalDeskLocation'].strip()).first()
            if configured_location:
                if not configured_location.is_active:
                    return Response({'message': 'This custody location is inactive and cannot be selected.'}, status=status.HTTP_409_CONFLICT)
                vd['physicalDeskLocation'] = configured_location.name
        claim_id = vd['claimId']
        verification_requested_at = timezone.now()

        logger.info(
            'handover_otp_verification_requested claim_id=%s officer_id=%s requested_at=%s',
            claim_id,
            request.user.pk,
            verification_requested_at.isoformat(),
        )

        try:
            item_id = Claim.objects.values_list('item_id', flat=True).get(pk=claim_id)
        except Claim.DoesNotExist:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Claim not found.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            # Use the same lock order as claim approval (item, claim, handover)
            # so verification cannot race an approval or a second redemption.
            try:
                item = Item.objects.select_for_update().get(pk=item_id)
                claim = Claim.objects.select_for_update().select_related('claimant').get(
                    pk=claim_id,
                    item_id=item.pk,
                )
                handover = Handover.objects.select_for_update().get(claim=claim)
            except Item.DoesNotExist:
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_404_NOT_FOUND,
                        'error': {'code': 'NOT_FOUND', 'message': 'Claim not found.'},
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
            except Claim.DoesNotExist:
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_404_NOT_FOUND,
                        'error': {'code': 'NOT_FOUND', 'message': 'Claim not found.'},
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
            except Handover.DoesNotExist:
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_404_NOT_FOUND,
                        'error': {'code': 'NOT_FOUND', 'message': 'No handover tracking record found for this claim.'},
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            if claim.claim_status == ClaimStatus.COMPLETED or handover.is_completed:
                logger.warning(
                    'handover_otp_verification_result result=already_used claim_id=%s handover_id=%s officer_id=%s verified_at=%s',
                    claim.pk,
                    handover.pk,
                    request.user.pk,
                    timezone.now().isoformat(),
                )
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_400_BAD_REQUEST,
                        'error': {'code': 'DUPLICATE_HANDOVER', 'message': 'OTP Already Used. Duplicate Handover Guard: This claim has already completed handover.'},
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

            if item.status == ItemStatus.HANDED_OVER:
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_409_CONFLICT,
                        'error': {'code': 'CONFLICT', 'message': 'Duplicate Handover Guard: This property has already been handed over.'},
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            if handover.item_id != item.pk or handover.recipient_id != claim.claimant_id:
                logger.error(
                    'handover_otp_relationship_mismatch claim_id=%s handover_id=%s claim_item_id=%s handover_item_id=%s claimant_id=%s recipient_id=%s',
                    claim.pk,
                    handover.pk,
                    item.pk,
                    handover.item_id,
                    claim.claimant_id,
                    handover.recipient_id,
                )
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_409_CONFLICT,
                        'error': {'code': 'HANDOVER_RELATIONSHIP_MISMATCH', 'message': 'Handover record does not match this approved claim and cannot be verified.'},
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            verified_at = timezone.now()
            if handover.otp_expires_at <= verified_at:
                logger.warning(
                    'handover_otp_expiration_validation result=expired claim_id=%s handover_id=%s officer_id=%s verified_at=%s otp_expires_at=%s',
                    claim.pk,
                    handover.pk,
                    request.user.pk,
                    verified_at.isoformat(),
                    handover.otp_expires_at.isoformat(),
                )
                logger.warning(
                    'handover_otp_verification_result result=expired claim_id=%s handover_id=%s officer_id=%s verified_at=%s',
                    claim.pk,
                    handover.pk,
                    request.user.pk,
                    verified_at.isoformat(),
                )
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_400_BAD_REQUEST,
                        'error': {'code': 'OTP_EXPIRED', 'message': 'Handover OTP has expired. Security supervisor must re-issue OTP.'},
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            logger.info(
                'handover_otp_expiration_validation result=valid claim_id=%s handover_id=%s verified_at=%s otp_expires_at=%s',
                claim.pk,
                handover.pk,
                verified_at.isoformat(),
                handover.otp_expires_at.isoformat(),
            )

            if handover.otp_attempts_count >= 5:
                logger.warning(
                    'handover_otp_verification_result result=locked claim_id=%s handover_id=%s officer_id=%s verified_at=%s',
                    claim.pk,
                    handover.pk,
                    request.user.pk,
                    verified_at.isoformat(),
                )
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
                handover.save(update_fields=['otp_attempts_count', 'updated_at'])

                AuditEntry.objects.create(
                    actor=request.user,
                    actor_role=request.user.role,
                    action='HANDOVER_OTP_FAILED',
                    target_entity='Handover',
                    target_id=str(handover.id),
                    ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
                    user_agent=request.META.get('HTTP_USER_AGENT', ''),
                    metadata={
                        'claimId': str(claim.id),
                        'itemId': str(item.id),
                        'attemptNumber': handover.otp_attempts_count,
                        'status': 'FAILED',
                    },
                )

                remaining = max(0, 5 - handover.otp_attempts_count)
                logger.warning(
                    'handover_otp_verification_result result=invalid claim_id=%s handover_id=%s officer_id=%s attempt=%s verified_at=%s',
                    claim.pk,
                    handover.pk,
                    request.user.pk,
                    handover.otp_attempts_count,
                    verified_at.isoformat(),
                )
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_400_BAD_REQUEST,
                        'error': {'code': 'INVALID_OTP', 'message': f'Invalid Handover OTP. {remaining} attempt(s) remaining before lockout.'},
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            masked_id = mask_id_number(vd['idCardNumber'])
            completion_time = verified_at
            previous_custody_desk = item.current_custody_desk or vd['physicalDeskLocation'].strip()
            assigned_locker = Locker.objects.select_for_update().filter(current_item=item).first()
            previous_locker_reference = (
                assigned_locker.locker_number if assigned_locker else item.locker_storage_reference
            )
            if assigned_locker:
                assigned_locker.current_item = None
                assigned_locker.updated_by = request.user
                assigned_locker.save(update_fields=['current_item', 'updated_by', 'updated_at'])

            # All successful redemption writes are covered by this transaction.
            item.status = ItemStatus.HANDED_OVER
            item.current_custody_desk = f"Handed over to {claim.claimant.full_name}"
            item.locker_storage_reference = ''
            item.save(update_fields=['status', 'current_custody_desk', 'locker_storage_reference', 'updated_at'])

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
                from_location=previous_custody_desk,
                to_location='CLAIMANT_HANDOVER_COMPLETE',
                previous_locker_reference=previous_locker_reference,
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
                    'lockerReference': previous_locker_reference or None,
                },
            )

        logger.info(
            'handover_otp_verification_result result=accepted claim_id=%s handover_id=%s officer_id=%s verified_at=%s',
            claim.pk,
            handover.pk,
            request.user.pk,
            completion_time.isoformat(),
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
