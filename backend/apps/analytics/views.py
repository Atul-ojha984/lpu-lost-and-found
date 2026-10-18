"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Admin & Analytics Views
==============================================================================
"""

from datetime import datetime, timezone
from django.db import transaction
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

from apps.accounts.models import User
from apps.accounts.permissions import IsCampusAdmin
from apps.items.models import Item, ItemStatus
from apps.custody.models import CustodyRecord, CustodyAction
from apps.disposal.models import DisposalRecord
from apps.audit.models import AuditEntry, AuditAction
from .services import get_analytics_dashboard, get_ageing_queue
from .serializers import (
    DisposalApprovalInputSerializer,
    AdminUserSerializer,
    UpdateUserAdminSerializer,
)

class AdminAnalyticsAPIView(APIView):
    """
    Live analytics dashboard calculated strictly from live database records.
    Restricted to campus and system administrators.
    """
    permission_classes = [IsCampusAdmin]

    @extend_schema(
        tags=['Administration'],
        summary='Get Campus Lost & Found Analytics',
        responses={200: OpenApiResponse(description='Calculated campus property analytics')},
    )
    def get(self, request):
        data = get_analytics_dashboard()
        return Response(
            {
                'success': True,
                'statusCode': status.HTTP_200_OK,
                'message': 'Campus lost and found analytics calculated successfully.',
                'data': data,
            },
            status=status.HTTP_200_OK,
        )

class AdminAgeingQueueAPIView(APIView):
    """
    Ageing queue with statutory retention tracking and escalation states.
    """
    permission_classes = [IsCampusAdmin]

    @extend_schema(
        tags=['Administration'],
        summary='Get Property Retention Ageing Queue',
        parameters=[
            OpenApiParameter('escalationState', str, description='IN_RETENTION, NOTICE_PERIOD, DISPOSAL_PENDING, DISPOSED, or ALL'),
            OpenApiParameter('search', str, description='Search term'),
            OpenApiParameter('category', str, description='Category code or UUID'),
            OpenApiParameter('page', int, description='Page number'),
            OpenApiParameter('limit', int, description='Page size'),
        ],
        responses={200: OpenApiResponse(description='Retention queue items and state counts')},
    )
    def get(self, request):
        params = {
            'escalationState': request.query_params.get('escalationState'),
            'search': request.query_params.get('search'),
            'category': request.query_params.get('category'),
            'page': request.query_params.get('page'),
            'limit': request.query_params.get('limit'),
        }
        data = get_ageing_queue(params)
        return Response(
            {
                'success': True,
                'statusCode': status.HTTP_200_OK,
                'message': 'Retention ageing queue retrieved successfully.',
                'data': data,
                'meta': {
                    'page': data['page'],
                    'limit': data['limit'],
                    'total': data['total'],
                    'totalPages': data['totalPages'],
                },
            },
            status=status.HTTP_200_OK,
        )

class AdminDisposalApproveAPIView(APIView):
    """
    Formal administrative disposal approval.
    Requires human committee signoff with disposal method and justification.
    Never permits automated disposal.
    """
    permission_classes = [IsCampusAdmin]

    @extend_schema(
        tags=['Administration'],
        summary='Approve Property Disposal',
        request=DisposalApprovalInputSerializer,
        responses={200: OpenApiResponse(description='Disposal executed and logged')},
    )
    def post(self, request):
        serializer = DisposalApprovalInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        try:
            item = Item.objects.get(pk=vd['itemId'])
        except Item.DoesNotExist:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Item not found for disposal approval.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if item.status == ItemStatus.DISPOSED:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_400_BAD_REQUEST,
                    'error': {'code': 'BAD_REQUEST', 'message': 'Item has already been disposed.'},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if item.status == ItemStatus.HANDED_OVER:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_400_BAD_REQUEST,
                    'error': {'code': 'BAD_REQUEST', 'message': 'Item was already handed over to a claimant and cannot be disposed.'},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            previous_status = item.status

            disposal_record = DisposalRecord.objects.create(
                item=item,
                method=vd['method'],
                approved_by=request.user,
                committee_notes=vd['reason'].strip(),
                reason=vd['reason'].strip(),
                recipient_organization=vd.get('recipientOrganization', '').strip(),
                disposal_date=datetime.now(timezone.utc),
                certificate_url=vd.get('certificateUrl', '').strip(),
                evidence_reference=vd.get('certificateUrl', '').strip(),
            )

            item.status = ItemStatus.DISPOSED
            item.is_archived = True
            item.save(update_fields=['status', 'is_archived', 'updated_at'])

            CustodyRecord.objects.create(
                item=item,
                action=CustodyAction.DISPOSED,
                from_location=item.current_custody_desk or 'Central Security Repository',
                to_location=vd.get('recipientOrganization') or vd['method'],
                handled_by=request.user,
                evidence_reference=vd.get('certificateUrl', ''),
                remarks=f"Disposal authorized by administrative committee via {vd['method']}. Reason: {vd['reason']}",
                timestamp=datetime.now(timezone.utc),
            )

            # Audit entry
            ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', '127.0.0.1')).split(',')[0].strip()
            AuditEntry.objects.create(
                actor=request.user,
                actor_role=request.user.role,
                action=AuditAction.ITEM_DISPOSE,
                target_entity='Item',
                target_id=str(item.id),
                ip_address=ip or '127.0.0.1',
                user_agent=request.META.get('HTTP_USER_AGENT', 'unknown'),
                metadata={
                    'referenceNumber': item.reference_number,
                    'title': item.title,
                    'previousStatus': previous_status,
                    'method': vd['method'],
                    'reason': vd['reason'],
                    'recipientOrganization': vd.get('recipientOrganization', ''),
                    'disposalRecordId': str(disposal_record.id),
                },
            )

        return Response(
            {
                'success': True,
                'statusCode': status.HTTP_200_OK,
                'message': f"Item disposal approved and logged with method: {vd['method']}",
                'data': {
                    'itemId': str(item.id),
                    'referenceNumber': item.reference_number,
                    'status': item.status,
                    'disposalRecordId': str(disposal_record.id),
                },
            },
            status=status.HTTP_200_OK,
        )

class AdminUsersAPIView(APIView):
    """
    Paginated campus user directory with role and status management.
    """
    permission_classes = [IsCampusAdmin]

    @extend_schema(
        tags=['Administration'],
        summary='List Campus Users',
        parameters=[
            OpenApiParameter('role', str, description='Filter by user role'),
            OpenApiParameter('search', str, description='Search by name, email, reg no, or post'),
            OpenApiParameter('isActive', bool, description='Filter active or deactivated accounts'),
            OpenApiParameter('page', int, description='Page number'),
            OpenApiParameter('limit', int, description='Page size'),
        ],
        responses={200: AdminUserSerializer(many=True)},
    )
    def get(self, request):
        queryset = User.objects.all()

        role = request.query_params.get('role')
        if role and role.upper() != 'ALL':
            queryset = queryset.filter(role=role.upper())

        is_active = request.query_params.get('isActive')
        if is_active is not None and is_active.lower() in ('true', 'false'):
            queryset = queryset.filter(is_active=(is_active.lower() == 'true'))

        search = request.query_params.get('search')
        if search and search.strip():
            term = search.strip()
            queryset = queryset.filter(
                Q(full_name__icontains=term) |
                Q(email__icontains=term) |
                Q(registration_number__icontains=term) |
                Q(security_post__icontains=term)
            )

        queryset = queryset.order_by('-created_at', '-id')

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
        users = list(queryset[offset:offset + limit])

        serialized_users = AdminUserSerializer(users, many=True).data

        return Response(
            {
                'success': True,
                'statusCode': status.HTTP_200_OK,
                'message': 'Users retrieved successfully.',
                'data': serialized_users,
                'meta': {
                    'page': page,
                    'limit': limit,
                    'total': total,
                    'totalPages': total_pages,
                },
            },
            status=status.HTTP_200_OK,
        )

class AdminUserDetailAPIView(APIView):
    """
    Update campus user role, security post, and account status.
    Guards against self-deactivation or demotion of current active administrator.
    """
    permission_classes = [IsCampusAdmin]

    @extend_schema(
        tags=['Administration'],
        summary='Update User Role and Status',
        request=UpdateUserAdminSerializer,
        responses={200: AdminUserSerializer},
    )
    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Target user not found.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = UpdateUserAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        # Safety guard: prevent self-deactivation or demotion of current admin
        if str(request.user.id) == str(user.id):
            if vd.get('isActive') is False:
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_400_BAD_REQUEST,
                        'error': {'code': 'BAD_REQUEST', 'message': 'Administrators cannot deactivate their own active account.'},
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if vd.get('role') and vd.get('role') != request.user.role:
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_400_BAD_REQUEST,
                        'error': {'code': 'BAD_REQUEST', 'message': 'Administrators cannot demote their own active role.'},
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        previous_role = user.role
        previous_active = user.is_active
        previous_security_post = user.security_post

        if 'role' in vd:
            user.role = vd['role']
        if 'securityPost' in vd:
            user.security_post = vd['securityPost'].strip()
        if 'department' in vd:
            user.department = vd['department'].strip()
        if 'phone' in vd:
            user.phone = vd['phone'].strip()
        if 'isActive' in vd:
            user.is_active = vd['isActive']

        user.save()

        # Audit entry
        ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', '127.0.0.1')).split(',')[0].strip()
        AuditEntry.objects.create(
            actor=request.user,
            actor_role=request.user.role,
            action=AuditAction.ROLE_UPDATE,
            target_entity='User',
            target_id=str(user.id),
            ip_address=ip or '127.0.0.1',
            user_agent=request.META.get('HTTP_USER_AGENT', 'unknown'),
            metadata={
                'targetUserEmail': user.email,
                'targetRegistrationNumber': user.registration_number,
                'previousRole': previous_role,
                'newRole': user.role,
                'previousActive': previous_active,
                'newActive': user.is_active,
                'previousSecurityPost': previous_security_post,
                'newSecurityPost': user.security_post,
            },
        )

        return Response(
            {
                'success': True,
                'statusCode': status.HTTP_200_OK,
                'message': 'User privileges updated successfully.',
                'data': AdminUserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )
