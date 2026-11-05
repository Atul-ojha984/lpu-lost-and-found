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
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

from apps.accounts.models import UserRole
from apps.accounts.permissions import IsSecurityOrAdmin, IsCampusAdmin
from apps.claims.models import Claim, ClaimStatus
from apps.items.models import Item, ItemStatus
from apps.items.serializers import SecurityReportQueueSerializer
from .models import AuditEntry
from .serializers import AuditEntrySerializer


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

        recent_audit_events = AuditEntry.objects.select_related('actor').order_by('-timestamp', '-id')[:25]
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
    Full paginated audit trail for campus compliance and security investigations.
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
        queryset = AuditEntry.objects.select_related('actor')

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

        start_date = request.query_params.get('startDate')
        if start_date and start_date.strip():
            queryset = queryset.filter(timestamp__gte=start_date.strip())

        end_date = request.query_params.get('endDate')
        if end_date and end_date.strip():
            queryset = queryset.filter(timestamp__lte=end_date.strip())

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
