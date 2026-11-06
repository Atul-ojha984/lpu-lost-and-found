"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Audit App Views: Security Dashboard Stats, Compliance Audit Trail & Admin Logs
==============================================================================
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from datetime import datetime, time
from uuid import UUID
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

from apps.accounts.models import UserRole
from apps.accounts.permissions import IsSecurityOrAdmin, IsCampusAdmin
from apps.claims.models import Claim, ClaimStatus
from apps.items.models import Item, ItemStatus
from apps.items.serializers import SecurityReportQueueSerializer
from .models import AuditAction, AuditEntry
from .serializers import AuditEntrySerializer


SECURITY_OPERATIONAL_ACTIONS = (
    AuditAction.ITEM_REPORT_LOST,
    AuditAction.ITEM_REPORT_FOUND,
    AuditAction.ITEM_REPORT_UPDATE,
    AuditAction.ITEM_REPORT_WITHDRAW,
    AuditAction.ITEM_REPORT_EXPIRE,
    AuditAction.PRIVATE_VAULT_VIEW,
    AuditAction.CLAIM_SUBMIT,
    AuditAction.CLAIM_REVIEW,
    AuditAction.CLAIM_CHALLENGE_VERIFY,
    AuditAction.HANDOVER_OTP_GENERATE,
    AuditAction.HANDOVER_OTP_FAILED,
    AuditAction.HANDOVER_EXECUTE,
    AuditAction.HANDOVER_SLIP_ACCESS,
    AuditAction.CUSTODY_TRANSFER,
    AuditAction.CUSTODY_INTAKE,
)
SECURITY_OPERATIONAL_ROLES = (UserRole.STUDENT_STAFF, UserRole.SECURITY_PERSONNEL)


def _security_operational_audits():
    """Return only workflow events and actors appropriate to security duties."""
    return AuditEntry.objects.filter(
        action__in=SECURITY_OPERATIONAL_ACTIONS,
        actor_role__in=SECURITY_OPERATIONAL_ROLES,
    )


def _parse_audit_boundary(value, is_end=False):
    """Accept ISO date or datetime values in the current timezone."""
    value = (value or '').strip()
    if not value:
        return None
    parsed_date = parse_date(value) if len(value) == 10 else None
    if parsed_date is not None:
        parsed = datetime.combine(parsed_date, time.max if is_end else time.min)
    else:
        parsed = parse_datetime(value)
        if parsed is None:
            raise ValueError('Use an ISO date or datetime for audit date filters.')
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _filter_action_status(queryset, value):
    normalized = value.strip().upper()
    if not normalized:
        return queryset
    status_query = Q()
    for key in ('status', 'actionStatus', 'result', 'outcome', 'action'):
        status_query |= Q(**{f'metadata__{key}__iexact': normalized})
    if normalized in ('SUCCESS', 'SUCCEEDED', 'COMPLETED', 'APPROVED', 'VERIFIED'):
        status_query |= Q(metadata__success=True) | Q(metadata__isCorrect=True)
        if normalized in ('APPROVED', 'VERIFIED'):
            status_query |= Q(metadata__action__iexact='APPROVE') | Q(metadata__action__iexact='APPROVE_DIRECT_RECOVERY')
        if normalized == 'COMPLETED':
            status_query |= Q(action=AuditAction.HANDOVER_EXECUTE)
    elif normalized in ('FAILED', 'FAILURE', 'REJECTED', 'DENIED', 'BLOCKED'):
        status_query |= Q(metadata__success=False) | Q(metadata__isCorrect=False)
        if normalized in ('FAILED', 'FAILURE'):
            status_query |= Q(action=AuditAction.HANDOVER_OTP_FAILED)
        if normalized == 'REJECTED':
            status_query |= Q(metadata__action__iexact='REJECT') | Q(metadata__action__iexact='REJECT_DIRECT_RECOVERY')
    return queryset.filter(status_query)


class SecuritySubmittedReportsAPIView(APIView):
    """List current student/staff reports awaiting security review."""
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Security Operations'],
        summary='Get Submitted Reports for Security Review',
        parameters=[
            OpenApiParameter('itemType', str, description='Filter by LOST or FOUND'),
            OpenApiParameter('search', str, description='Search title, description, or reference'),
            OpenApiParameter('page', int, description='Page number (default 1)'),
            OpenApiParameter('limit', int, description='Page size (default 20, max 100)'),
        ],
        responses={200: OpenApiResponse(description='Student/staff reports awaiting review')},
    )
    def get(self, request):
        queryset = Item.objects.filter(
            reported_by__role=UserRole.STUDENT_STAFF,
            is_archived=False,
            status__in=(ItemStatus.REPORTED, ItemStatus.MATCH_PENDING),
        ).select_related('category', 'location', 'reported_by').order_by('-created_at', '-id')

        item_type = request.query_params.get('itemType')
        if item_type and item_type.upper() != 'ALL':
            queryset = queryset.filter(item_type=item_type.upper())

        search = request.query_params.get('search')
        if search and search.strip():
            term = search.strip()
            queryset = queryset.filter(
                Q(title__icontains=term) |
                Q(public_description__icontains=term) |
                Q(reference_number__icontains=term)
            )

        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except ValueError:
            page = 1
        try:
            limit = min(100, max(1, int(request.query_params.get('limit', 20))))
        except ValueError:
            limit = 20

        total_items = queryset.count()
        total_pages = max(1, (total_items + limit - 1) // limit)
        offset = (page - 1) * limit
        items = list(queryset[offset:offset + limit])
        serialized = SecurityReportQueueSerializer(
            items,
            many=True,
            context={'request': request},
        ).data

        return Response(
            {
                'items': serialized,
                'pagination': {
                    'page': page,
                    'limit': limit,
                    'totalItems': total_items,
                    'totalPages': total_pages,
                    'hasNextPage': page < total_pages,
                    'hasPrevPage': page > 1,
                },
            },
            status=status.HTTP_200_OK,
        )

class SecurityDashboardStatsAPIView(APIView):
    """
    Security operations dashboard statistics and live real-time audit stream.
    Restricted strictly to security personnel, campus administrators, and system administrators.
    """
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Security Operations'],
        summary='Get Security Dashboard Statistics',
        responses={200: OpenApiResponse(description='Aggregated security metrics')},
    )
    def get(self, request):
        pending_claims_count = Claim.objects.filter(
            claim_status__in=[
                ClaimStatus.SUBMITTED,
                ClaimStatus.UNDER_REVIEW,
                ClaimStatus.CHALLENGE_REQUIRED,
            ]
        ).count()

        approved_awaiting_handover_count = Claim.objects.filter(
            claim_status=ClaimStatus.APPROVED
        ).count()

        custody_inventory_count = Item.objects.filter(
            is_archived=False,
            status__in=[
                ItemStatus.IN_CUSTODY,
                ItemStatus.READY_FOR_HANDOVER,
                ItemStatus.CLAIM_IN_REVIEW,
            ],
        ).count()

        completed_handovers_count = Item.objects.filter(
            is_archived=False,
            status=ItemStatus.HANDED_OVER,
        ).count()

        recent_audit_events = _security_operational_audits().select_related('actor').order_by('-timestamp', '-id')[:25]
        serialized_events = AuditEntrySerializer(recent_audit_events, many=True).data

        payload = {
            'pendingClaimsCount': pending_claims_count,
            'approvedAwaitingHandoverCount': approved_awaiting_handover_count,
            'custodyInventoryCount': custody_inventory_count,
            'completedHandoversCount': completed_handovers_count,
            'recentAuditEvents': serialized_events,
        }

        return Response(
            {
                'success': True,
                'statusCode': status.HTTP_200_OK,
                'message': 'Security operations dashboard statistics retrieved.',
                'data': payload,
            },
            status=status.HTTP_200_OK,
        )

class SecurityAuditTrailAPIView(APIView):
    """
    Paginated operational audit history required for security desk duties.
    Administrative account and role activity is available only through the admin API.
    """
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Security Operations'],
        summary='Get Security Audit Trail',
        parameters=[
            OpenApiParameter('action', str, description='Filter by audit action'),
            OpenApiParameter('targetEntity', str, description='Target entity name (Item, Claim, User)'),
            OpenApiParameter('actorRole', str, description='Role of the acting user'),
            OpenApiParameter('page', int, description='Page number (default 1)'),
            OpenApiParameter('limit', int, description='Page size (default 25, max 100)'),
        ],
        responses={200: AuditEntrySerializer(many=True)},
    )
    def get(self, request):
        queryset = _security_operational_audits().select_related('actor')

        action = request.query_params.get('action')
        if action and action.strip():
            queryset = queryset.filter(action=action.strip())

        target_entity = request.query_params.get('targetEntity')
        if target_entity and target_entity.strip():
            queryset = queryset.filter(target_entity=target_entity.strip())

        actor_role = request.query_params.get('actorRole')
        if actor_role and actor_role.strip():
            queryset = queryset.filter(actor_role=actor_role.strip())

        # Safe stable sorting
        queryset = queryset.order_by('-timestamp', '-id')

        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except ValueError:
            page = 1
        try:
            limit = min(100, max(1, int(request.query_params.get('limit', 25))))
        except ValueError:
            limit = 25

        total = queryset.count()
        total_pages = max(1, (total + limit - 1) // limit)
        offset = (page - 1) * limit
        entries = list(queryset[offset:offset + limit])

        serialized_data = AuditEntrySerializer(entries, many=True).data

        return Response(
            {
                'success': True,
                'statusCode': status.HTTP_200_OK,
                'message': 'Audit trail retrieved successfully.',
                'data': serialized_data,
                'meta': {
                    'page': page,
                    'limit': limit,
                    'total': total,
                    'totalPages': total_pages,
                },
            },
            status=status.HTTP_200_OK,
        )

class AdminAuditLogsAPIView(APIView):
    """
    Authorized audit history search with strict redaction of sensitive credentials.
    """
    permission_classes = [IsCampusAdmin]

    @extend_schema(
        tags=['Administration'],
        summary='Search Audit History Logs',
        parameters=[
            OpenApiParameter('action', str, description='Filter by audit action'),
            OpenApiParameter('targetEntity', str, description='Target entity name (Item, Claim, User)'),
            OpenApiParameter('actorId', str, description='Actor UUID'),
            OpenApiParameter('actor', str, description='Actor name, email, registration number, or UUID'),
            OpenApiParameter('actorRole', str, description='Role of the acting user'),
            OpenApiParameter('targetId', str, description='Target record identifier'),
            OpenApiParameter('actionStatus', str, description='Outcome recorded with the audit event'),
            OpenApiParameter('startDate', str, description='ISO 8601 start timestamp'),
            OpenApiParameter('endDate', str, description='ISO 8601 end timestamp'),
            OpenApiParameter('page', int, description='Page number (default 1)'),
            OpenApiParameter('limit', int, description='Page size (default 20, max 100)'),
        ],
        responses={200: OpenApiResponse(description='Paginated audit logs')},
    )
    def get(self, request):
        queryset = AuditEntry.objects.select_related('actor')

        action = request.query_params.get('action')
        if action and action.strip():
            queryset = queryset.filter(action=action.strip())

        target_entity = request.query_params.get('targetEntity')
        if target_entity and target_entity.strip():
            queryset = queryset.filter(target_entity=target_entity.strip())

        actor_id = request.query_params.get('actorId')
        if actor_id and actor_id.strip():
            queryset = queryset.filter(actor_id=actor_id.strip())

        actor_search = request.query_params.get('actor')
        if actor_search and actor_search.strip():
            term = actor_search.strip()
            actor_query = (
                Q(actor_name__icontains=term) |
                Q(actor__full_name__icontains=term) |
                Q(actor__email__icontains=term) |
                Q(actor__registration_number__icontains=term)
            )
            try:
                actor_query |= Q(actor_id=UUID(term))
            except (ValueError, TypeError, AttributeError):
                pass
            queryset = queryset.filter(actor_query)

        actor_role = request.query_params.get('actorRole')
        if actor_role and actor_role.strip():
            queryset = queryset.filter(actor_role=actor_role.strip())

        target_id = request.query_params.get('targetId')
        if target_id and target_id.strip():
            queryset = queryset.filter(target_id=target_id.strip())

        action_status = request.query_params.get('actionStatus')
        if action_status and action_status.strip():
            queryset = _filter_action_status(queryset, action_status)

        try:
            start_date = _parse_audit_boundary(request.query_params.get('startDate'))
            end_date = _parse_audit_boundary(request.query_params.get('endDate'), is_end=True)
        except ValueError as exc:
            return Response({'message': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if start_date:
            queryset = queryset.filter(timestamp__gte=start_date)
        if end_date:
            queryset = queryset.filter(timestamp__lte=end_date)

        # Safe stable sorting
        queryset = queryset.order_by('-timestamp', '-id')

        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except ValueError:
            page = 1
        try:
            limit = min(100, max(1, int(request.query_params.get('limit', 20))))
        except ValueError:
            limit = 20

        total = queryset.count()
        total_pages = max(1, (total + limit - 1) // limit)
        offset = (page - 1) * limit
        entries = list(queryset[offset:offset + limit])

        serialized_entries = AuditEntrySerializer(entries, many=True).data

        payload = {
            'items': serialized_entries,
            'total': total,
            'page': page,
            'limit': limit,
            'totalPages': total_pages,
        }

        return Response(
            {
                'success': True,
                'statusCode': status.HTTP_200_OK,
                'message': 'Audit history logs retrieved successfully.',
                'data': payload,
                'meta': {
                    'page': page,
                    'limit': limit,
                    'total': total,
                    'totalPages': total_pages,
                },
            },
            status=status.HTTP_200_OK,
        )
