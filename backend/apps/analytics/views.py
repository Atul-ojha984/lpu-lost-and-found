"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Admin & Analytics Views
==============================================================================
"""

from datetime import datetime, timezone
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.db.utils import IntegrityError
from django.db.models import Q
from django.db.models.deletion import ProtectedError
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

from apps.accounts.models import User, UserRole, UserType
from apps.accounts.permissions import IsCampusAdmin
from apps.items.models import Item, ItemStatus
from apps.custody.models import CustodyRecord, CustodyAction, Locker
from apps.custody.serializers import CustodyRecordSerializer, LockerSerializer
from apps.items.serializers import PublicItemSerializer
from apps.disposal.models import DisposalRecord
from apps.audit.models import AuditEntry, AuditAction
from .services import get_analytics_dashboard, get_ageing_queue
from .serializers import (
    CreateAdminUserSerializer,
    DisposalApprovalInputSerializer,
    AdminUserSerializer,
    UpdateUserAdminSerializer,
)


def _user_has_historical_references(user):
    """Keep any account referenced by reports, workflow, audit, or notifications."""
    for relation in User._meta.related_objects:
        if relation.many_to_many or relation.related_name == '+':
            continue
        accessor = relation.get_accessor_name()
        try:
            related = getattr(user, accessor)
        except (ObjectDoesNotExist, AttributeError):
            continue
        if relation.one_to_one:
            return True
        if related.exists():
            return True
    return False


def _active_system_super_admin_ids_for_update():
    """Lock the active Super Admin set so concurrent revocations cannot remove the last one."""
    return list(User.objects.select_for_update().filter(
        is_active=True,
        is_superuser=True,
        role=UserRole.SYSTEM_ADMIN,
    ).order_by('id').values_list('id', flat=True))


def _is_last_active_system_super_admin(user, active_admin_ids):
    return bool(
        user.is_superuser
        and user.role == UserRole.SYSTEM_ADMIN
        and user.is_active
        and len(active_admin_ids) <= 1
        and user.id in active_admin_ids
    )


def _audit_user_admin_action(request, user_id, action, event, description, metadata):
    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip_address = forwarded_for.split(',')[0].strip() if forwarded_for else request.META.get('REMOTE_ADDR', '127.0.0.1')
    AuditEntry.objects.create(
        actor=request.user,
        actor_role=request.user.role,
        action=action,
        target_entity='User',
        target_id=str(user_id),
        description=description,
        ip_address=ip_address or '127.0.0.1',
        user_agent=request.META.get('HTTP_USER_AGENT', ''),
        metadata={'event': event, **metadata},
    )


class AdminInventoryAPIView(APIView):
    """Admin snapshot of security-held items, locker state, and recent custody movement."""
    permission_classes = [IsCampusAdmin]

    def get(self, request):
        active_custody_statuses = (
            ItemStatus.IN_CUSTODY,
            ItemStatus.MATCH_PENDING,
            ItemStatus.CLAIM_IN_REVIEW,
            ItemStatus.READY_FOR_HANDOVER,
        )
        items = list(Item.objects.filter(
            status__in=active_custody_statuses,
            is_archived=False,
        ).select_related('category', 'location', 'reported_by').order_by('-updated_at', '-created_at'))
        lockers = list(Locker.objects.select_related(
            'current_item__category', 'current_item__location', 'current_item__reported_by'
        ).order_by('location', 'locker_number'))

        locker_rows = []
        for locker in lockers:
            has_history = CustodyRecord.objects.filter(
                Q(locker_reference__iexact=locker.locker_number)
                | Q(previous_locker_reference__iexact=locker.locker_number)
            ).exists()
            row = LockerSerializer(locker).data
            row['currentItem'] = (
                PublicItemSerializer(locker.current_item, context={'request': request}).data
                if locker.current_item_id else None
            )
            row['hasCustodyHistory'] = has_history
            row['canDelete'] = not locker.current_item_id and not has_history
            row['deleteBlockedReason'] = (
                'Move the assigned item first.' if locker.current_item_id
                else 'Custody history must be preserved; disable this locker instead.' if has_history
                else ''
            )
            locker_rows.append(row)

        recent_updates = CustodyRecord.objects.select_related(
            'item__category', 'item__location', 'handled_by'
        ).order_by('-timestamp', '-id')[:30]
        return Response({
            'items': PublicItemSerializer(items, many=True, context={'request': request}).data,
            'lockers': locker_rows,
            'recentUpdates': CustodyRecordSerializer(recent_updates, many=True).data,
        }, status=status.HTTP_200_OK)

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
        summary='Create Student, Staff, or Security Officer Account',
        request=CreateAdminUserSerializer,
        responses={201: AdminUserSerializer},
    )
    def post(self, request):
        serializer = CreateAdminUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                user = serializer.save()
                AuditEntry.objects.create(
                    actor=request.user,
                    actor_role=request.user.role,
                    action=AuditAction.USER_REGISTER,
                    target_entity='User',
                    target_id=str(user.id),
                    ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
                    user_agent=request.META.get('HTTP_USER_AGENT', ''),
                    metadata={
                        'event': 'ADMIN_CREATED_ACCOUNT',
                        'targetUserType': user.user_type,
                        'targetRole': user.role,
                        'targetActive': user.is_active,
                    },
                )
        except IntegrityError:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_409_CONFLICT,
                    'error': {'code': 'DUPLICATE_USER', 'message': 'An account with that email or registration number already exists.'},
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            {
                'success': True,
                'statusCode': status.HTTP_201_CREATED,
                'message': 'Campus account created successfully.',
                'data': AdminUserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )

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

        user_type = request.query_params.get('userType')
        if user_type and user_type.upper() != 'ALL':
            queryset = queryset.filter(user_type=user_type.upper())

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
    @transaction.atomic
    def patch(self, request, pk):
        active_system_admin_ids = _active_system_super_admin_ids_for_update()
        try:
            user = User.objects.select_for_update().get(pk=pk)
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

        removes_last_super_admin = (
            vd.get('isActive', user.is_active) is False
            or vd.get('role', user.role) != UserRole.SYSTEM_ADMIN
        )
        if removes_last_super_admin and _is_last_active_system_super_admin(user, active_system_admin_ids):
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_409_CONFLICT,
                    'error': {
                        'code': 'LAST_SUPER_ADMIN',
                        'message': 'The last active Super Admin cannot be deactivated or demoted.',
                    },
                },
                status=status.HTTP_409_CONFLICT,
            )
        previous_role = user.role
        previous_active = user.is_active
        previous_security_post = user.security_post

        if 'role' in vd:
            user.role = vd['role']
        if 'userType' in vd:
            user.user_type = vd['userType']
        elif vd.get('role') == UserRole.STUDENT_STAFF and user.user_type not in (UserType.STUDENT, UserType.STAFF):
            user.user_type = UserType.UNSPECIFIED
        if 'securityPost' in vd:
            user.security_post = vd['securityPost'].strip()
        if 'department' in vd:
            user.department = vd['department'].strip()
        if 'phone' in vd:
            user.phone = vd['phone'].strip()
        if 'isActive' in vd:
            user.is_active = vd['isActive']
        if previous_active != user.is_active:
            user.auth_token_version += 1

        user.save()

        # Audit entry
        _audit_user_admin_action(
            request,
            user.id,
            AuditAction.ROLE_UPDATE,
            'ADMIN_USER_UPDATED' if previous_active == user.is_active else (
                'ADMIN_USER_ACTIVATED' if user.is_active else 'ADMIN_USER_DEACTIVATED'
            ),
            f'Administrator updated account access and profile for {user.full_name}.',
            {
                'targetUserEmail': user.email,
                'targetRegistrationNumber': user.registration_number,
                'previousRole': previous_role,
                'newRole': user.role,
                'newUserType': user.user_type,
                'previousActive': previous_active,
                'newActive': user.is_active,
                'previousSecurityPost': previous_security_post,
                'newSecurityPost': user.security_post,
                'authTokensRevoked': previous_active != user.is_active,
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

    @transaction.atomic
    def delete(self, request, pk):
        active_system_admin_ids = _active_system_super_admin_ids_for_update()
        try:
            user = User.objects.select_for_update().get(pk=pk)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Target user not found.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if request.user.id == user.id:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_400_BAD_REQUEST,
                    'error': {'code': 'SELF_DELETE_NOT_ALLOWED', 'message': 'Administrators cannot delete their own account.'},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if _is_last_active_system_super_admin(user, active_system_admin_ids):
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_409_CONFLICT,
                    'error': {
                        'code': 'LAST_SUPER_ADMIN',
                        'message': 'The last active Super Admin account cannot be deleted.',
                    },
                },
                status=status.HTTP_409_CONFLICT,
            )

        target_id = str(user.id)
        target_snapshot = {
            'targetUserName': user.full_name,
            'targetUserEmail': user.email,
            'targetRegistrationNumber': user.registration_number,
            'targetRole': user.role,
            'targetUserType': user.user_type,
        }
        has_references = _user_has_historical_references(user)
        previous_active = user.is_active

        if has_references:
            user.is_active = False
            if previous_active:
                user.auth_token_version += 1
            user.save(update_fields=['is_active', 'auth_token_version', 'updated_at'])
            _audit_user_admin_action(
                request,
                target_id,
                AuditAction.ROLE_UPDATE,
                'ADMIN_USER_DEACTIVATED_ON_DELETE',
                f'Administrator deactivated {user.full_name}; historical records are retained.',
                {**target_snapshot, 'authTokensRevoked': previous_active, 'preservedHistoricalReferences': True},
            )
            return Response(
                {
                    'success': True,
                    'statusCode': status.HTTP_200_OK,
                    'message': 'This account is referenced by historical records, so it was deactivated and its history was preserved.',
                    'data': {'deleted': False, 'deactivated': True, 'userId': target_id},
                },
                status=status.HTTP_200_OK,
            )

        try:
            with transaction.atomic():
                user.delete()
        except ProtectedError:
            # A relation added by another app may not be enumerable above; retain
            # the account and its records rather than allowing a partial cascade.
            user.is_active = False
            if previous_active:
                user.auth_token_version += 1
            user.save(update_fields=['is_active', 'auth_token_version', 'updated_at'])
            _audit_user_admin_action(
                request,
                target_id,
                AuditAction.ROLE_UPDATE,
                'ADMIN_USER_DEACTIVATED_ON_DELETE',
                f'Administrator deactivated {user.full_name}; a protected relation requires its history to remain.',
                {**target_snapshot, 'authTokensRevoked': previous_active, 'preservedHistoricalReferences': True},
            )
            return Response(
                {
                    'success': True,
                    'statusCode': status.HTTP_200_OK,
                    'message': 'A protected historical relation was found, so the account was deactivated instead of deleted.',
                    'data': {'deleted': False, 'deactivated': True, 'userId': target_id},
                },
                status=status.HTTP_200_OK,
            )

        _audit_user_admin_action(
            request,
            target_id,
            AuditAction.ROLE_UPDATE,
            'ADMIN_USER_DELETED',
            f'Administrator permanently deleted unreferenced account {target_snapshot["targetUserName"]}.',
            {**target_snapshot, 'authTokensRevoked': True, 'preservedHistoricalReferences': False},
        )
        return Response(
            {
                'success': True,
                'statusCode': status.HTTP_200_OK,
                'message': 'Account deleted successfully.',
                'data': {'deleted': True, 'deactivated': False, 'userId': target_id},
            },
            status=status.HTTP_200_OK,
        )
