"""Claim-free, independently verified recovery against an existing LOST report."""

import logging

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import UserRole
from apps.accounts.permissions import IsSecurityOrAdmin, IsStudentOrStaff
from apps.audit.models import AuditAction, AuditEntry
from apps.claims.models import Claim, ClaimStatus
from apps.custody.models import CustodyAction, CustodyLocation, CustodyRecord, Locker
from apps.items.models import Item, ItemStatus, ItemType
from apps.items.serializers import PublicChallengeSerializer, PublicItemSerializer, SecurityReportQueueSerializer
from apps.verification.models import PrivateDetail, VerificationChallenge

from .models import DirectRecovery, DirectRecoveryStatus, Handover
from .serializers import (
    DirectRecoveryIntakeSerializer,
    DirectRecoveryReviewSerializer,
    DirectRecoveryVerifyOtpSerializer,
)
from .views import mask_id_number
from .otp_services import renew_expired_direct_recovery_otp, set_direct_recovery_otp

logger = logging.getLogger(__name__)

ACTIVE_CLAIM_STATUSES = (
    ClaimStatus.SUBMITTED,
    ClaimStatus.UNDER_REVIEW,
    ClaimStatus.CHALLENGE_REQUIRED,
    ClaimStatus.APPROVED,
)
ACTIVE_DIRECT_STATUSES = (
    DirectRecoveryStatus.INTAKE_RECORDED,
    DirectRecoveryStatus.APPROVED,
)


def _resolve_custody_desk(values):
    location_id = values.get('custodyLocationId')
    if location_id:
        try:
            location = CustodyLocation.objects.get(pk=location_id)
        except (CustodyLocation.DoesNotExist, ValueError):
            return None, Response({'message': 'Custody location not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not location.is_active:
            return None, Response({'message': 'This custody location is inactive and cannot be selected.'}, status=status.HTTP_409_CONFLICT)
        return location.name, None

    supplied_name = values.get('physicalDeskLocation', '').strip()
    location = CustodyLocation.objects.filter(name__iexact=supplied_name).first()
    if location:
        if not location.is_active:
            return None, Response({'message': 'This custody location is inactive and cannot be selected.'}, status=status.HTTP_409_CONFLICT)
        return location.name, None
    return supplied_name, None
DIRECT_INTAKE_ITEM_STATUSES = (
    ItemStatus.REPORTED,
    ItemStatus.IN_CUSTODY,
    ItemStatus.MATCH_PENDING,
)


def _ip(request):
    return request.META.get('REMOTE_ADDR', '127.0.0.1')


def _agent(request):
    return request.META.get('HTTP_USER_AGENT', '')


def _audit(request, action, target_id, metadata):
    AuditEntry.objects.create(
        actor=request.user,
        actor_role=request.user.role,
        action=action,
        target_entity='DirectRecovery',
        target_id=str(target_id),
        ip_address=_ip(request),
        user_agent=_agent(request),
        metadata=metadata,
    )


def _renew_accessed_direct_otps(direct_recovery_ids, request):
    renewed_ids = set()
    for direct_recovery_id in direct_recovery_ids:
        record, renewed = renew_expired_direct_recovery_otp(direct_recovery_id)
        if not record or not renewed:
            continue
        renewed_ids.add(str(record.id))
        _audit(request, AuditAction.HANDOVER_OTP_GENERATE, record.id, {
            'event': 'DIRECT_OTP_RENEWED',
            'itemId': str(record.item_id),
            'recipientId': str(record.recipient_id),
            'generatedAt': record.otp_generated_at.isoformat(),
            'expiresAt': record.otp_expires_at.isoformat(),
        })
    return renewed_ids


def _direct_otp_status(record, now=None):
    now = now or timezone.now()
    if record.status == DirectRecoveryStatus.COMPLETED:
        return 'USED'
    if record.status == DirectRecoveryStatus.INTAKE_RECORDED:
        return 'PENDING_APPROVAL'
    if record.status == DirectRecoveryStatus.REJECTED:
        return 'NOT_ISSUED'
    if (
        not record.reviewed_by_id
        or not record.reviewed_at
        or not record.otp_hash
        or not record.otp_expires_at
    ):
        return 'NOT_ISSUED'
    return 'ACTIVE' if record.otp_expires_at > now else 'EXPIRED'


def _direct_recovery_data(record, request=None, include_questions=False):
    item = record.item
    data = {
        'id': str(record.id),
        'directRecoveryId': str(record.id),
        'recoveryReference': f'DRH-{str(record.id).upper()}',
        'itemId': str(item.id),
        'item': PublicItemSerializer(item, context={'request': request}).data,
        'recipient': {
            'id': str(record.recipient_id),
            'fullName': record.recipient.full_name,
            'registrationNumber': record.recipient.registration_number,
            'department': record.recipient.department or '',
            'phone': record.recipient.phone or '',
        },
        'status': record.status,
        'intakeOfficer': {
            'id': str(record.intake_officer_id),
            'fullName': record.intake_officer.full_name,
            'registrationNumber': record.intake_officer.registration_number,
        },
        'intakeNotes': record.intake_notes,
        'physicalDeskLocation': record.physical_desk_location,
        'createdAt': record.created_at,
        'reviewedBy': {
            'id': str(record.reviewed_by_id),
            'fullName': record.reviewed_by.full_name,
            'registrationNumber': record.reviewed_by.registration_number,
        } if record.reviewed_by_id else None,
        'reviewedAt': record.reviewed_at,
        'verificationMethods': record.verification_methods,
        'verificationNotes': record.verification_notes,
        'otpGeneratedAt': record.otp_generated_at,
        'otpExpiresAt': record.otp_expires_at,
        'otpStatus': _direct_otp_status(record),
        'handoverStatus': 'COMPLETED' if record.status == DirectRecoveryStatus.COMPLETED else (
            'PENDING_HANDOVER' if record.status == DirectRecoveryStatus.APPROVED else record.status
        ),
        'completedAt': record.completed_at,
        'completedBy': {
            'id': str(record.completed_by_id),
            'fullName': record.completed_by.full_name,
            'registrationNumber': record.completed_by.registration_number,
        } if record.completed_by_id else None,
    }
    if include_questions:
        challenges = item.verification_challenges.filter(is_active=True).order_by('created_at')
        data['verificationQuestions'] = PublicChallengeSerializer(challenges, many=True).data
        data['verificationAvailable'] = {
            'privateDetails': PrivateDetail.objects.filter(item_id=item.id).exists(),
            'reportPhotos': bool(item.primary_image_url or item.additional_images),
            'questions': challenges.exists(),
        }
    return data


class EligibleLostReportsForDirectRecoveryAPIView(APIView):
    """Search eligible existing lost reports for a physical security intake."""
    permission_classes = [IsSecurityOrAdmin]

    def get(self, request):
        queryset = Item.objects.filter(
            item_type=ItemType.LOST,
            status__in=DIRECT_INTAKE_ITEM_STATUSES,
            is_archived=False,
            reported_by__role=UserRole.STUDENT_STAFF,
        ).select_related('category', 'location', 'reported_by').prefetch_related('verification_challenges')
        queryset = queryset.exclude(
            claims__claim_status__in=ACTIVE_CLAIM_STATUSES,
        ).exclude(
            direct_recoveries__status__in=ACTIVE_DIRECT_STATUSES,
        ).exclude(
            handovers__is_completed=False,
        ).distinct().order_by('-created_at')

        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(reference_number__icontains=search) |
                Q(title__icontains=search) |
                Q(category__name__icontains=search) |
                Q(reported_by__full_name__icontains=search) |
                Q(reported_by__registration_number__icontains=search)
            )
        try:
            limit = min(100, max(1, int(request.query_params.get('limit', 30))))
        except (TypeError, ValueError):
            limit = 30
        reports = list(queryset[:limit])
        payload = SecurityReportQueueSerializer(reports, many=True, context={'request': request}).data
        for index, item in enumerate(reports):
            questions = item.verification_challenges.filter(is_active=True).order_by('created_at')
            payload[index]['verificationQuestions'] = PublicChallengeSerializer(questions, many=True).data
            payload[index]['verificationAvailable'] = {
                'privateDetails': PrivateDetail.objects.filter(item_id=item.id).exists(),
                'reportPhotos': bool(item.primary_image_url or item.additional_images),
                'questions': questions.exists(),
            }
        return Response(payload, status=status.HTTP_200_OK)


class DirectRecoveryListCreateAPIView(APIView):
    """Record verified physical intake and list active direct recoveries for security."""
    permission_classes = [IsSecurityOrAdmin]

    def get(self, request):
        now = timezone.now()
        renewal_candidates = DirectRecovery.objects.filter(
            status=DirectRecoveryStatus.APPROVED,
        ).filter(
            Q(otp_expires_at__lte=now) |
            Q(otp_expires_at__isnull=True) |
            Q(otp_generated_at__isnull=True) |
            Q(otp_hash='') |
            Q(otp_cipher='')
        ).values_list('id', flat=True)
        _renew_accessed_direct_otps(renewal_candidates, request)

        queryset = DirectRecovery.objects.filter(status__in=ACTIVE_DIRECT_STATUSES).select_related(
            'item__category', 'item__location', 'recipient', 'intake_officer', 'reviewed_by', 'completed_by'
        )
        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(item__reference_number__icontains=search) |
                Q(item__title__icontains=search) |
                Q(recipient__full_name__icontains=search) |
                Q(recipient__registration_number__icontains=search)
            )
        return Response(
            [_direct_recovery_data(record, request, include_questions=True) for record in queryset],
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = DirectRecoveryIntakeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        physical_desk_location, location_error = _resolve_custody_desk(values)
        if location_error:
            return location_error
        if not values['physicalItemReceived']:
            return Response({'message': 'Confirm that the physical item has been received into security custody.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                try:
                    item = Item.objects.select_for_update().select_related('reported_by').get(
                        pk=values['reportId'], is_archived=False
                    )
                except Item.DoesNotExist:
                    return Response({'message': 'Lost report not found or no longer active.'}, status=status.HTTP_404_NOT_FOUND)

                if item.item_type != ItemType.LOST or item.reported_by.role != UserRole.STUDENT_STAFF:
                    return Response({'message': 'Direct recovery can only use an existing student or staff lost-item report.'}, status=status.HTTP_400_BAD_REQUEST)
                if item.reported_by_id == request.user.id:
                    return Response({'message': 'A report owner cannot register the security intake for their own report.'}, status=status.HTTP_403_FORBIDDEN)
                if item.status not in DIRECT_INTAKE_ITEM_STATUSES:
                    return Response({'message': 'This report is already in another recovery, handover, or closed workflow.'}, status=status.HTTP_409_CONFLICT)
                if Claim.objects.filter(item=item, claim_status__in=ACTIVE_CLAIM_STATUSES).exists():
                    return Response({'message': 'This report has an active ownership claim. Continue through the existing claim workflow.'}, status=status.HTTP_409_CONFLICT)
                if Handover.objects.filter(item=item, is_completed=False).exists():
                    return Response({'message': 'This report already has a pending handover.'}, status=status.HTTP_409_CONFLICT)
                if DirectRecovery.objects.filter(item=item, status__in=ACTIVE_DIRECT_STATUSES).exists():
                    return Response({'message': 'A direct recovery is already active for this report.'}, status=status.HTTP_409_CONFLICT)

                prior_location = item.current_custody_desk or 'Reporter lost-item report'
                custody_action = CustodyAction.INITIAL_INTAKE if item.status == ItemStatus.REPORTED else CustodyAction.TRANSFERRED_DESK
                item.status = ItemStatus.IN_CUSTODY
                item.current_custody_desk = physical_desk_location
                item.save(update_fields=['status', 'current_custody_desk', 'updated_at'])
                intake_record = CustodyRecord.objects.create(
                    item=item,
                    action=custody_action,
                    from_location=prior_location,
                    to_location=physical_desk_location,
                    locker_reference=item.locker_storage_reference,
                    handled_by=request.user,
                    remarks=values['intakeNotes'].strip() or 'Physical item received and linked to the reporter existing LOST report.',
                )
                record = DirectRecovery.objects.create(
                    item=item,
                    recipient=item.reported_by,
                    intake_custody_record=intake_record,
                    intake_officer=request.user,
                    physical_desk_location=physical_desk_location,
                    intake_notes=values['intakeNotes'].strip(),
                )
                _audit(request, AuditAction.CUSTODY_INTAKE, record.id, {
                    'itemId': str(item.id),
                    'reportReference': item.reference_number,
                    'recipientId': str(record.recipient_id),
                    'custodyRecordId': str(intake_record.id),
                    'directRecoveryId': str(record.id),
                    'physicalDeskLocation': physical_desk_location,
                    'custodyLocationId': str(values['custodyLocationId']) if values.get('custodyLocationId') else None,
                })
        except IntegrityError:
            return Response({'message': 'A direct recovery is already active for this report.'}, status=status.HTTP_409_CONFLICT)

        record = DirectRecovery.objects.select_related(
            'item__category', 'item__location', 'recipient', 'intake_officer'
        ).get(pk=record.pk)
        return Response(_direct_recovery_data(record, request, include_questions=True), status=status.HTTP_201_CREATED)


class DirectRecoveryReviewAPIView(APIView):
    """Require independent ownership verification and review before issuing a direct OTP."""
    permission_classes = [IsSecurityOrAdmin]

    def patch(self, request, direct_recovery_id):
        serializer = DirectRecoveryReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        try:
            item_id = DirectRecovery.objects.values_list('item_id', flat=True).get(pk=direct_recovery_id)
        except (DirectRecovery.DoesNotExist, ValueError, TypeError):
            return Response({'message': 'Direct recovery not found.'}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            try:
                item = Item.objects.select_for_update().get(pk=item_id)
                record = DirectRecovery.objects.select_for_update().select_related(
                    'recipient', 'intake_officer'
                ).get(pk=direct_recovery_id, item_id=item.pk)
            except (Item.DoesNotExist, DirectRecovery.DoesNotExist):
                return Response({'message': 'Direct recovery not found.'}, status=status.HTTP_404_NOT_FOUND)

            if record.status != DirectRecoveryStatus.INTAKE_RECORDED:
                return Response({'message': 'Only an intake awaiting review can be adjudicated.'}, status=status.HTTP_409_CONFLICT)
            if request.user.id in (record.recipient_id, item.reported_by_id):
                return Response({'message': 'Anti-Self-Approval Guard: the original report owner cannot approve their own recovery.'}, status=status.HTTP_403_FORBIDDEN)
            if Claim.objects.filter(item=item, claim_status__in=ACTIVE_CLAIM_STATUSES).exists():
                return Response({'message': 'An active ownership claim exists. Continue through the existing claim workflow.'}, status=status.HTTP_409_CONFLICT)

            now = timezone.now()
            if values['action'] == 'REJECT':
                record.status = DirectRecoveryStatus.REJECTED
                record.reviewed_by = request.user
                record.reviewed_at = now
                record.rejection_reason = values['rejectionReason'].strip()
                record.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'rejection_reason', 'updated_at'])
                _audit(request, AuditAction.CLAIM_REVIEW, record.id, {
                    'action': 'REJECT_DIRECT_RECOVERY',
                    'itemId': str(item.id),
                    'reason': record.rejection_reason,
                })
                return Response(_direct_recovery_data(record, request, include_questions=True), status=status.HTTP_200_OK)

            methods = []
            if values.get('privateDetailsMatched'):
                vault = PrivateDetail.objects.filter(item=item).first()
                if not vault or vault.last_decrypted_by_id != request.user.id:
                    return Response({'message': 'Open and inspect this report private ownership details before recording a match.'}, status=status.HTTP_400_BAD_REQUEST)
                methods.append('PRIVATE_DETAILS')

            if values.get('reportPhotoMatched'):
                if not (item.primary_image_url or item.additional_images):
                    return Response({'message': 'This report has no saved photograph to use as ownership evidence.'}, status=status.HTTP_400_BAD_REQUEST)
                methods.append('REPORT_PHOTO')

            verified_challenge_ids = set(record.verified_challenge_ids or [])
            answers = values.get('verificationAnswers', [])
            if answers and record.verification_attempts_count >= 5:
                return Response({'message': 'Maximum ownership-question attempts exceeded for this direct recovery.'}, status=status.HTTP_400_BAD_REQUEST)
            for answer in answers:
                challenge = VerificationChallenge.objects.filter(
                    pk=answer['challengeId'], item=item, is_active=True
                ).first()
                if not challenge:
                    return Response({'message': 'A selected ownership question is no longer active for this report.'}, status=status.HTTP_400_BAD_REQUEST)
                if not challenge.check_answer(answer['answer']):
                    record.verification_attempts_count += 1
                    record.save(update_fields=['verification_attempts_count', 'updated_at'])
                    logger.warning(
                        'direct_recovery_verification_result result=challenge_mismatch direct_recovery_id=%s item_id=%s officer_id=%s attempts=%s',
                        record.pk, item.pk, request.user.pk, record.verification_attempts_count,
                    )
                    remaining = max(0, 5 - record.verification_attempts_count)
                    return Response({
                        'message': f'Ownership question answer did not match. {remaining} verification attempt(s) remain.',
                        'verificationAttemptsRemaining': remaining,
                    }, status=status.HTTP_400_BAD_REQUEST)
                verified_challenge_ids.add(str(challenge.id))
            if verified_challenge_ids:
                methods.append('VERIFICATION_QUESTION')
            if not methods:
                return Response({
                    'message': 'At least one independent ownership source is required in addition to the student ID check: private details, a saved report photograph, or a correct verification-question answer.'
                }, status=status.HTTP_400_BAD_REQUEST)

            otp_created_at = timezone.now()
            record.status = DirectRecoveryStatus.APPROVED
            record.reviewed_by = request.user
            record.reviewed_at = otp_created_at
            record.verification_notes = values['verificationNotes'].strip()
            record.verification_methods = methods
            record.verified_challenge_ids = sorted(verified_challenge_ids)
            set_direct_recovery_otp(record, generated_at=otp_created_at)
            record.save()

            item.status = ItemStatus.READY_FOR_HANDOVER
            item.save(update_fields=['status', 'updated_at'])
            _audit(request, AuditAction.HANDOVER_OTP_GENERATE, record.id, {
                'directRecoveryId': str(record.id),
                'itemId': str(item.id),
                'recipientId': str(record.recipient_id),
                'verificationMethods': methods,
            })
            _audit(request, AuditAction.CLAIM_REVIEW, record.id, {
                'action': 'APPROVE_DIRECT_RECOVERY',
                'itemId': str(item.id),
                'recipientId': str(record.recipient_id),
                'verificationMethods': methods,
            })
            logger.info(
                'direct_handover_otp_generated direct_recovery_id=%s item_id=%s officer_id=%s created_at=%s expires_at=%s',
                record.pk, item.pk, request.user.pk, otp_created_at.isoformat(), record.otp_expires_at.isoformat(),
            )

        record = DirectRecovery.objects.select_related(
            'item__category', 'item__location', 'recipient', 'intake_officer', 'reviewed_by'
        ).get(pk=record.pk)
        return Response(_direct_recovery_data(record, request, include_questions=True), status=status.HTTP_200_OK)


class DirectRecoveryVerifyOtpAPIView(APIView):
    """Verify the claimant OTP and atomically record actual direct property handover."""
    permission_classes = [IsSecurityOrAdmin]

    def post(self, request, direct_recovery_id):
        serializer = DirectRecoveryVerifyOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        physical_desk_location, location_error = _resolve_custody_desk(values)
        if location_error:
            return location_error
        try:
            item_id = DirectRecovery.objects.values_list('item_id', flat=True).get(pk=direct_recovery_id)
        except (DirectRecovery.DoesNotExist, ValueError, TypeError):
            return Response({'message': 'Direct recovery not found.'}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            try:
                item = Item.objects.select_for_update().get(pk=item_id)
                record = DirectRecovery.objects.select_for_update().select_related(
                    'recipient', 'reviewed_by', 'intake_officer'
                ).get(pk=direct_recovery_id, item_id=item.pk)
            except (Item.DoesNotExist, DirectRecovery.DoesNotExist):
                return Response({'message': 'Direct recovery not found.'}, status=status.HTTP_404_NOT_FOUND)

            if record.status == DirectRecoveryStatus.COMPLETED:
                return Response({'message': 'This direct recovery has already been completed; the OTP cannot be reused.'}, status=status.HTTP_409_CONFLICT)
            if (
                record.status != DirectRecoveryStatus.APPROVED
                or item.status != ItemStatus.READY_FOR_HANDOVER
                or record.reviewed_by_id is None
                or record.reviewed_at is None
            ):
                return Response({'message': 'Direct recovery must be independently approved before handover.'}, status=status.HTTP_409_CONFLICT)
            if item.reported_by_id != record.recipient_id or record.recipient_id != record.item.reported_by_id:
                return Response({'message': 'Direct recovery recipient no longer matches the original report owner.'}, status=status.HTTP_409_CONFLICT)
            if request.user.id == record.recipient_id:
                return Response({'message': 'The property owner cannot perform or approve their own handover.'}, status=status.HTTP_403_FORBIDDEN)
            if values['idCardNumber'].strip().casefold() != record.recipient.registration_number.strip().casefold():
                return Response({'message': 'Presented university ID does not match the original report owner.'}, status=status.HTTP_403_FORBIDDEN)

            now = timezone.now()
            if not record.otp_expires_at or record.otp_expires_at <= now:
                logger.warning(
                    'direct_handover_otp_verification_result result=expired direct_recovery_id=%s officer_id=%s verified_at=%s expires_at=%s',
                    record.pk, request.user.pk, now.isoformat(), record.otp_expires_at.isoformat() if record.otp_expires_at else 'missing',
                )
                return Response({'message': 'Direct handover OTP has expired. Security supervisor must re-approve the recovery.'}, status=status.HTTP_400_BAD_REQUEST)
            if record.otp_attempts_count >= 5:
                return Response({'message': 'Maximum OTP attempts exceeded. Direct handover is locked for security.'}, status=status.HTTP_400_BAD_REQUEST)

            if not record.verify_otp(values['otp']):
                record.otp_attempts_count += 1
                record.save(update_fields=['otp_attempts_count', 'updated_at'])
                _audit(request, AuditAction.HANDOVER_OTP_FAILED, record.id, {
                    'directRecoveryId': str(record.id),
                    'itemId': str(item.id),
                    'attemptNumber': record.otp_attempts_count,
                    'status': 'FAILED',
                })
                logger.warning(
                    'direct_handover_otp_verification_result result=invalid direct_recovery_id=%s officer_id=%s attempt=%s verified_at=%s',
                    record.pk, request.user.pk, record.otp_attempts_count, now.isoformat(),
                )
                remaining = max(0, 5 - record.otp_attempts_count)
                return Response({'message': f'Invalid direct handover OTP. {remaining} attempt(s) remain.'}, status=status.HTTP_400_BAD_REQUEST)

            locker = Locker.objects.select_for_update().filter(current_item=item).first()
            previous_locker = locker.locker_number if locker else item.locker_storage_reference
            if locker:
                locker.current_item = None
                locker.updated_by = request.user
                locker.save(update_fields=['current_item', 'updated_by', 'updated_at'])

            completed_at = now
            record.status = DirectRecoveryStatus.COMPLETED
            record.completed_by = request.user
            record.completed_at = completed_at
            record.physical_desk_location = physical_desk_location
            record.id_card_presented_type = values['idCardPresentedType'].strip()
            record.id_card_number_masked = mask_id_number(values['idCardNumber'])
            record.recipient_signature_url = values.get('recipientSignatureUrl', '').strip()
            record.acknowledgement_notes = values.get('acknowledgementNotes', '').strip()
            record.proof_evidence_url = values.get('proofEvidenceUrl', '').strip()
            record.save()

            item.status = ItemStatus.HANDED_OVER
            item.current_custody_desk = f'Handed over to {record.recipient.full_name}'
            item.locker_storage_reference = ''
            item.save(update_fields=['status', 'current_custody_desk', 'locker_storage_reference', 'updated_at'])

            CustodyRecord.objects.create(
                item=item,
                action=CustodyAction.HANDED_OVER,
                from_location=physical_desk_location,
                to_location='CLAIMANT_HANDOVER_COMPLETE',
                previous_locker_reference=previous_locker,
                evidence_reference=record.proof_evidence_url,
                handled_by=request.user,
                remarks=record.acknowledgement_notes or 'Direct security recovery released to the verified original report owner.',
                timestamp=completed_at,
            )
            _audit(request, AuditAction.HANDOVER_EXECUTE, record.id, {
                'directRecoveryId': str(record.id),
                'itemId': str(item.id),
                'reportReference': item.reference_number,
                'recipientId': str(record.recipient_id),
                'reviewerId': str(record.reviewed_by_id) if record.reviewed_by_id else None,
                'idCardPresentedType': record.id_card_presented_type,
                'idCardNumberMasked': record.id_card_number_masked,
                'physicalIdInspected': values['idCardInspected'],
                'lockerReference': previous_locker or None,
            })

        logger.info(
            'direct_handover_otp_verification_result result=accepted direct_recovery_id=%s item_id=%s officer_id=%s verified_at=%s',
            record.pk, item.pk, request.user.pk, completed_at.isoformat(),
        )
        return Response({
            'handoverId': str(record.id),
            'directRecoveryId': str(record.id),
            'referenceNumber': item.reference_number,
            'itemTitle': item.title,
            'recipientName': record.recipient.full_name,
            'recipientRegNo': record.recipient.registration_number,
            'officerId': str(request.user.id),
            'physicalDeskLocation': record.physical_desk_location,
            'idCardPresentedType': record.id_card_presented_type,
            'idCardNumberMasked': record.id_card_number_masked,
            'completedAt': completed_at,
        }, status=status.HTTP_200_OK)


class MyDirectRecoveriesAPIView(APIView):
    """Return the authenticated report owner's direct recovery progress and active OTP."""
    permission_classes = [IsAuthenticated, IsStudentOrStaff]

    def get(self, request):
        record_ids = list(DirectRecovery.objects.filter(
            recipient=request.user,
            status=DirectRecoveryStatus.APPROVED,
        ).values_list('id', flat=True))
        renewed_ids = _renew_accessed_direct_otps(record_ids, request)

        records = DirectRecovery.objects.filter(recipient=request.user).select_related(
            'item__category', 'item__location', 'recipient', 'intake_officer', 'reviewed_by', 'completed_by'
        ).order_by('-created_at')
        now = timezone.now()
        results = []
        for record in records:
            data = _direct_recovery_data(record, request)
            is_active = (
                record.status == DirectRecoveryStatus.APPROVED
                and record.reviewed_by_id
                and record.reviewed_at
                and record.item.status == ItemStatus.READY_FOR_HANDOVER
                and record.otp_hash
                and record.otp_expires_at
                and record.otp_expires_at > now
            )
            data['handoverOtp'] = record.get_otp() if is_active else None
            data['otpRemainingSeconds'] = max(0, int((record.otp_expires_at - now).total_seconds())) if is_active else 0
            data['otpRenewed'] = str(record.id) in renewed_ids
            if data['otpRenewed']:
                data['otpStatus'] = 'RENEWED'
            results.append(data)
        return Response(results, status=status.HTTP_200_OK)


class DirectRecoveryHistoryAPIView(APIView):
    """Security-only completed direct recovery history for receipt access."""
    permission_classes = [IsSecurityOrAdmin]

    def get(self, request):
        records = DirectRecovery.objects.filter(
            status=DirectRecoveryStatus.COMPLETED,
            item__status=ItemStatus.HANDED_OVER,
        ).select_related(
            'item__category', 'item__location', 'recipient', 'intake_officer', 'reviewed_by', 'completed_by'
        ).order_by('-completed_at', '-created_at')[:100]
        return Response(
            [_direct_recovery_data(record, request) for record in records],
            status=status.HTTP_200_OK,
        )


class DirectRecoverySlipAPIView(APIView):
    """Return an authorized print receipt for a completed claim-free recovery."""
    permission_classes = [IsAuthenticated]

    def get(self, request, direct_recovery_id):
        try:
            record = DirectRecovery.objects.select_related(
                'item__category', 'recipient', 'intake_officer', 'reviewed_by', 'completed_by'
            ).get(pk=direct_recovery_id)
        except (DirectRecovery.DoesNotExist, ValueError, TypeError):
            return Response({'message': 'Completed direct recovery not found.'}, status=status.HTTP_404_NOT_FOUND)
        if record.status != DirectRecoveryStatus.COMPLETED or not record.completed_at or record.item.status != ItemStatus.HANDED_OVER:
            return Response({'message': 'A handover slip is available only after physical handover is completed.'}, status=status.HTTP_409_CONFLICT)

        is_owner = record.recipient_id == request.user.id and record.item.reported_by_id == request.user.id
        is_security_or_admin = request.user.role in (UserRole.SECURITY_PERSONNEL, UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN)
        if not (is_owner or is_security_or_admin):
            return Response({'message': 'Completed direct recovery not found.'}, status=status.HTTP_404_NOT_FOUND)

        custody = CustodyRecord.objects.filter(
            item_id=record.item_id,
            action=CustodyAction.HANDED_OVER,
            handled_by_id=record.completed_by_id,
            timestamp=record.completed_at,
        ).order_by('-timestamp').first()
        locker_number = custody.previous_locker_reference if custody else ''
        if not locker_number:
            prior_locker = CustodyRecord.objects.filter(
                item_id=record.item_id,
                action=CustodyAction.STORED_IN_LOCKER,
                timestamp__lte=record.completed_at,
            ).order_by('-timestamp').first()
            locker_number = prior_locker.locker_reference if prior_locker else ''

        AuditEntry.objects.create(
            actor=request.user,
            actor_role=request.user.role,
            action=AuditAction.HANDOVER_SLIP_ACCESS,
            target_entity='DirectRecovery',
            target_id=str(record.id),
            ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={
                'directRecoveryId': str(record.id),
                'itemId': str(record.item_id),
                'recipientId': str(record.recipient_id),
                'handedOverAt': record.completed_at.isoformat(),
            },
        )

        return Response({
            'handoverId': str(record.id),
            'directRecoveryId': str(record.id),
            'handoverReference': f'DRH-{str(record.id).upper()}',
            'handoverDate': record.completed_at,
            'status': DirectRecoveryStatus.COMPLETED,
            'recoveryType': 'DIRECT_REPORT',
            'student': {
                'fullName': record.recipient.full_name,
                'registrationNumber': record.recipient.registration_number,
                'department': record.recipient.department or 'Not provided',
                'mobile': record.recipient.phone or 'Not provided',
            },
            'item': {
                'id': str(record.item_id),
                'title': record.item.title,
                'category': record.item.category.name,
                'description': record.item.public_description,
                'imageUrl': record.item.primary_image_url,
                'additionalImages': record.item.additional_images or [],
                'reportReference': record.item.reference_number,
                'reportId': str(record.item_id),
            },
            'claimId': None,
            'claimReference': 'No claim record - direct recovery from existing lost report',
            'approval': {
                'officerName': record.reviewed_by.full_name if record.reviewed_by else 'Not recorded',
                'officerRegistrationNumber': record.reviewed_by.registration_number if record.reviewed_by else '',
                'approvedAt': record.reviewed_at,
            },
            'handoverOfficer': {
                'fullName': record.completed_by.full_name if record.completed_by else 'Not recorded',
                'registrationNumber': record.completed_by.registration_number if record.completed_by else '',
            },
            'securityOffice': record.physical_desk_location,
            'lockerNumber': locker_number or 'Not assigned',
            'idCardPresentedType': record.id_card_presented_type,
            'idCardNumberMasked': record.id_card_number_masked,
            'acknowledgementNotes': record.acknowledgement_notes,
            'recipientSignatureUrl': record.recipient_signature_url,
        }, status=status.HTTP_200_OK)
