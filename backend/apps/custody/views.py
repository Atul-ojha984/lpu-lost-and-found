"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Custody App Views
==============================================================================
"""

from django.db import transaction
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

from apps.accounts.permissions import IsSecurityOrAdmin
from apps.audit.models import AuditEntry, AuditAction
from apps.items.models import Item, ItemStatus
from apps.items.serializers import PublicItemSerializer
from .models import CustodyRecord, CustodyAction
from .serializers import (
    CustodyRecordSerializer,
    CustodyTransferInputSerializer,
)

class CustodyInventoryAPIView(APIView):
    """Retrieve campus property currently in security physical custody."""
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Custody'],
        summary='Get Security Custody Inventory',
        parameters=[
            OpenApiParameter('search', str, description='Search by reference, title, desk'),
            OpenApiParameter('category', str, description='Category code or ID'),
            OpenApiParameter('campusZone', str, description='Campus zone'),
            OpenApiParameter('status', str, description='Status filter'),
            OpenApiParameter('desk', str, description='Specific custody desk'),
            OpenApiParameter('page', int, description='Page number'),
            OpenApiParameter('limit', int, description='Page size'),
        ],
        responses={200: OpenApiResponse(description='Custody inventory list')},
    )
    def get(self, request):
        queryset = Item.objects.filter(
            status__in=[ItemStatus.IN_CUSTODY, ItemStatus.READY_FOR_HANDOVER, ItemStatus.MATCH_PENDING],
            is_archived=False,
        ).select_related('category', 'location', 'reported_by').order_by('-created_at')

        search = request.query_params.get('search')
        if search and search.strip():
            term = search.strip()
            queryset = queryset.filter(
                Q(title__icontains=term) |
                Q(reference_number__icontains=term) |
                Q(current_custody_desk__icontains=term)
            )

        category = request.query_params.get('category')
        if category and category.upper() != 'ALL':
            if len(category) == 36:
                queryset = queryset.filter(category_id=category)
            else:
                queryset = queryset.filter(category__code__iexact=category)

        campus_zone = request.query_params.get('campusZone')
        if campus_zone and campus_zone.upper() != 'ALL':
            queryset = queryset.filter(location__campus_zone__iexact=campus_zone)

        status_val = request.query_params.get('status')
        if status_val and status_val.upper() != 'ALL':
            queryset = queryset.filter(status=status_val.upper())

        desk = request.query_params.get('desk')
        if desk and desk.strip():
            queryset = queryset.filter(current_custody_desk__icontains=desk.strip())

        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except ValueError:
            page = 1
        try:
            limit = min(100, max(1, int(request.query_params.get('limit', 20))))
        except ValueError:
            limit = 20

        total = queryset.count()
        offset = (page - 1) * limit
        items = list(queryset[offset:offset + limit])
        serialized = PublicItemSerializer(items, many=True, context={'request': request}).data

        return Response(serialized, status=status.HTTP_200_OK)

class CustodyTransferAPIView(APIView):
    """Record physical custody movement or intake into a security desk/locker."""
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Custody'],
        summary='Transfer Custody Location',
        request=CustodyTransferInputSerializer,
        responses={201: CustodyRecordSerializer},
    )
    def post(self, request):
        serializer = CustodyTransferInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        with transaction.atomic():
            try:
                item = Item.objects.select_for_update().get(pk=vd['itemId'], is_archived=False)
            except Item.DoesNotExist:
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_404_NOT_FOUND,
                        'error': {'code': 'NOT_FOUND', 'message': 'Item not found.'},
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            from_loc = item.current_custody_desk or 'Initial Intake'
            to_loc = vd['toLocation'].strip()

            record = CustodyRecord.objects.create(
                item=item,
                action=vd.get('action', CustodyAction.TRANSFERRED_DESK),
                from_location=from_loc,
                to_location=to_loc,
                locker_reference=vd.get('lockerReference', '').strip(),
                evidence_reference=vd.get('evidenceReference', '').strip(),
                handled_by=request.user,
                remarks=vd.get('remarks', '').strip(),
            )

            item.current_custody_desk = to_loc
            if vd.get('lockerReference'):
                item.locker_storage_reference = vd['lockerReference'].strip()
            if item.status == ItemStatus.REPORTED:
                item.status = ItemStatus.IN_CUSTODY
            item.save()

            AuditEntry.objects.create(
                actor=request.user,
                actor_role=request.user.role,
                action=AuditAction.CUSTODY_TRANSFER,
                target_entity='CustodyRecord',
                target_id=str(record.id),
                ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                metadata={'itemId': str(item.id), 'fromLocation': from_loc, 'toLocation': to_loc},
            )

        return Response(CustodyRecordSerializer(record).data, status=status.HTTP_201_CREATED)

class ItemCustodyHistoryAPIView(APIView):
    """Retrieve chronological append-only custody movement history."""
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Custody'],
        summary='Get Item Custody History Timeline',
        responses={200: CustodyRecordSerializer(many=True)},
    )
    def get(self, request, item_id):
        records = CustodyRecord.objects.filter(item_id=item_id).select_related('handled_by').order_by('-timestamp')
        serializer = CustodyRecordSerializer(records, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
