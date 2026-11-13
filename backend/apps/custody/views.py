"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Custody App Views
==============================================================================
"""

from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone
from uuid import UUID
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

from apps.accounts.permissions import IsCampusAdmin, IsSecurityOrAdmin
from apps.core.workflow_concurrency import (
    CUSTODY_INVENTORY_SCOPE,
    item_scope,
    retry_transient_mongo_transaction,
    workflow_transaction,
)
from apps.audit.models import AuditEntry, AuditAction
from apps.items.models import Item, ItemStatus
from apps.items.serializers import PublicItemSerializer
from .models import CustodyRecord, CustodyAction, CustodyLocation, Locker
from .serializers import (
    CustodyRecordSerializer,
    CustodyTransferInputSerializer,
    CustodyLocationSerializer,
    CustodyLocationWriteSerializer,
    LockerSerializer,
    LockerCreateSerializer,
    LockerAssignmentSerializer,
)


LOCKABLE_ITEM_STATUSES = (
    ItemStatus.IN_CUSTODY,
    ItemStatus.READY_FOR_HANDOVER,
    ItemStatus.MATCH_PENDING,
)


def _audit_configuration(request, entity, target_id, event, description, metadata=None):
    AuditEntry.objects.create(
        actor=request.user,
        actor_role=request.user.role,
        action=AuditAction.CONFIG_UPDATE,
        target_entity=entity,
        target_id=str(target_id),
        description=description,
        ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
        user_agent=request.META.get('HTTP_USER_AGENT', ''),
        metadata={'event': event, **(metadata or {})},
    )


def _touch_custody_location(location, actor):
    if location is None:
        return
    location.updated_by = actor
    location.save(update_fields=['updated_by', 'updated_at'])


def _is_admin(user):
    return bool(user.is_superuser or getattr(user, 'role', None) in ('CAMPUS_ADMIN', 'SYSTEM_ADMIN'))


class CustodyLocationListCreateAPIView(APIView):
    """Security may read active facilities; only admins may configure them."""

    def get_permissions(self):
        if self.request.method == 'OPTIONS':
            return [AllowAny()]
        if self.request.method == 'GET':
            return [IsSecurityOrAdmin()]
        return [IsCampusAdmin()]

    def get(self, request):
        queryset = CustodyLocation.objects.all().prefetch_related('lockers')
        if not _is_admin(request.user):
            queryset = queryset.filter(is_active=True)
        elif request.query_params.get('includeInactive', 'true').lower() not in ('true', '1'):
            queryset = queryset.filter(is_active=True)
        return Response(CustodyLocationSerializer(queryset, many=True, context={'request': request}).data)

    @retry_transient_mongo_transaction()
    def post(self, request):
        serializer = CustodyLocationWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with workflow_transaction(CUSTODY_INVENTORY_SCOPE):
                location = serializer.save(created_by=request.user, updated_by=request.user)
                _audit_configuration(
                    request, 'CustodyLocation', location.id, 'CUSTODY_LOCATION_CREATED',
                    f'Custody location created: {location.name}',
                    {'code': location.code, 'isActive': location.is_active},
                )
        except IntegrityError:
            return Response({'message': 'A custody location with this code already exists.'}, status=status.HTTP_409_CONFLICT)
        location = CustodyLocation.objects.select_related('created_by', 'updated_by').prefetch_related('lockers').get(pk=location.pk)
        return Response(CustodyLocationSerializer(location, context={'request': request}).data, status=status.HTTP_201_CREATED)


class CustodyLocationDetailAPIView(APIView):
    """Admin-only edit, archive, and safe deletion for custody locations."""
    permission_classes = [IsCampusAdmin]

    @retry_transient_mongo_transaction()
    def patch(self, request, location_id):
        with workflow_transaction(CUSTODY_INVENTORY_SCOPE):
            try:
                location = CustodyLocation.objects.get(pk=location_id)
            except (CustodyLocation.DoesNotExist, ValueError):
                return Response({'message': 'Custody location not found.'}, status=status.HTTP_404_NOT_FOUND)

            serializer = CustodyLocationWriteSerializer(location, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            previous = {'code': location.code, 'name': location.name, 'isActive': location.is_active}
            values = serializer.validated_data
            disabling = values.get('is_active') is False and location.is_active
            if disabling:
                occupied_lockers = location.lockers.filter(current_item__isnull=False).exists()
                stored_items = Item.objects.filter(
                    current_custody_desk__iexact=location.name,
                    status__in=LOCKABLE_ITEM_STATUSES,
                    is_archived=False,
                ).exists()
                from apps.handovers.models import DirectRecovery, DirectRecoveryStatus, Handover
                pending_direct_recovery = DirectRecovery.objects.filter(
                    physical_desk_location__iexact=location.name,
                    status__in=[DirectRecoveryStatus.INTAKE_RECORDED, DirectRecoveryStatus.APPROVED],
                ).exists()
                pending_handover = Handover.objects.filter(
                    physical_desk_location__iexact=location.name,
                    is_completed=False,
                ).exists()
                if occupied_lockers or stored_items or pending_direct_recovery or pending_handover:
                    _audit_configuration(
                        request, 'CustodyLocation', location.id, 'CUSTODY_LOCATION_DISABLE_BLOCKED',
                        f'Custody location disable blocked: {location.name}',
                        {'reason': 'Active item custody remains at this location.'},
                    )
                    return Response({
                        'message': 'Transfer all items out of this custody location before disabling it.'
                    }, status=status.HTTP_409_CONFLICT)

            updated = serializer.save(updated_by=request.user)
            if updated.name != previous['name']:
                timestamp = timezone.now()
                for locker in updated.lockers.all():
                    locker.location = updated.name
                    locker.updated_by = request.user
                    locker.save(update_fields=['location', 'updated_by', 'updated_at'])
                Item.objects.filter(
                    current_custody_desk__iexact=previous['name'],
                    status__in=LOCKABLE_ITEM_STATUSES,
                    is_archived=False,
                ).update(current_custody_desk=updated.name, updated_at=timestamp)

            event = 'CUSTODY_LOCATION_UPDATED'
            if previous['isActive'] != updated.is_active:
                event = 'CUSTODY_LOCATION_ENABLED' if updated.is_active else 'CUSTODY_LOCATION_DISABLED'
            _audit_configuration(
                request, 'CustodyLocation', updated.id, event,
                f'{event}: {updated.name}',
                {'previous': previous, 'code': updated.code, 'name': updated.name, 'isActive': updated.is_active},
            )

        updated = CustodyLocation.objects.select_related('created_by', 'updated_by').prefetch_related('lockers').get(pk=updated.pk)
        return Response(CustodyLocationSerializer(updated, context={'request': request}).data)

    @retry_transient_mongo_transaction()
    def delete(self, request, location_id):
        with workflow_transaction(CUSTODY_INVENTORY_SCOPE):
            try:
                location = CustodyLocation.objects.get(pk=location_id)
            except (CustodyLocation.DoesNotExist, ValueError):
                return Response({'message': 'Custody location not found.'}, status=status.HTTP_404_NOT_FOUND)

            attached_lockers = location.lockers.all()
            active_items = Item.objects.filter(
                current_custody_desk__iexact=location.name,
                status__in=LOCKABLE_ITEM_STATUSES,
                is_archived=False,
            ).exists()
            from apps.handovers.models import DirectRecovery, DirectRecoveryStatus, Handover
            pending_direct_recovery = DirectRecovery.objects.filter(
                physical_desk_location__iexact=location.name,
                status__in=[DirectRecoveryStatus.INTAKE_RECORDED, DirectRecoveryStatus.APPROVED],
            ).exists()
            pending_handover = Handover.objects.filter(
                physical_desk_location__iexact=location.name,
                is_completed=False,
            ).exists()
            if (
                attached_lockers.filter(Q(is_active=True) | Q(current_item__isnull=False)).exists()
                or active_items or pending_direct_recovery or pending_handover
            ):
                _audit_configuration(
                    request, 'CustodyLocation', location.id, 'CUSTODY_LOCATION_DELETE_BLOCKED',
                    f'Custody location deletion blocked: {location.name}',
                    {'reason': 'Active lockers, stored items, or pending recovery/handover records remain.'},
                )
                return Response({
                    'message': 'Move all items and pending handovers to another active custody location, then disable or reassign its lockers before deleting this location.'
                }, status=status.HTTP_409_CONFLICT)

            has_history = CustodyRecord.objects.filter(
                Q(from_location__iexact=location.name) | Q(to_location__iexact=location.name)
            ).exists()
            from apps.handovers.models import DirectRecovery, Handover
            has_handover_history = (
                Handover.objects.filter(physical_desk_location__iexact=location.name).exists()
                or DirectRecovery.objects.filter(physical_desk_location__iexact=location.name).exists()
            )
            has_references = has_history or has_handover_history or attached_lockers.exists()
            if has_references:
                location.is_active = False
                location.updated_by = request.user
                location.save(update_fields=['is_active', 'updated_by', 'updated_at'])
                _audit_configuration(
                    request, 'CustodyLocation', location.id, 'CUSTODY_LOCATION_ARCHIVED',
                    f'Custody location archived to preserve history: {location.name}',
                    {
                        'code': location.code,
                        'historicalReferencesPreserved': has_history or has_handover_history,
                        'inactiveLockersPreserved': attached_lockers.exists(),
                    },
                )
                return Response({'deleted': False, 'archived': True, 'locationId': str(location.id)})

            location_id_value = str(location.id)
            location_name = location.name
            location_code = location.code
            location.delete()
            _audit_configuration(
                request, 'CustodyLocation', location_id_value, 'CUSTODY_LOCATION_DELETED',
                f'Unused custody location deleted: {location_name}', {'code': location_code},
            )
        return Response({'deleted': True, 'archived': False, 'locationId': location_id_value})


def _legacy_locker_occupant(locker_number, item_id):
    return Item.objects.filter(
        locker_storage_reference__iexact=locker_number,
        is_archived=False,
        status__in=LOCKABLE_ITEM_STATUSES,
    ).exclude(pk=item_id).first()


class LockerListCreateAPIView(APIView):
    """Security can view lockers; only administrators can register lockers."""

    def get_permissions(self):
        permission_class = IsCampusAdmin if self.request.method == 'POST' else IsSecurityOrAdmin
        return [permission_class()]

    def get(self, request):
        lockers = Locker.objects.select_related(
            'current_item', 'custody_location', 'updated_by'
        ).all()
        if not _is_admin(request.user):
            lockers = lockers.filter(custody_location__is_active=True)
        return Response(LockerSerializer(lockers, many=True).data, status=status.HTTP_200_OK)

    @retry_transient_mongo_transaction()
    def post(self, request):
        serializer = LockerCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with workflow_transaction(CUSTODY_INVENTORY_SCOPE):
            locker = serializer.save(updated_by=request.user)
            _touch_custody_location(locker.custody_location, request.user)
            if serializer.legacy_location_created:
                _audit_configuration(
                    request, 'CustodyLocation', locker.custody_location_id,
                    'CUSTODY_LOCATION_CREATED',
                    f'Custody location created from legacy locker input: {locker.location}',
                    {'code': locker.custody_location.code, 'legacyRequest': True},
                )
            _audit_configuration(
                request, 'Locker', locker.id, 'LOCKER_CREATED',
                f'Locker registered: {locker.locker_number}',
                {
                    'lockerNumber': locker.locker_number,
                    'location': locker.location,
                    'custodyLocationId': str(locker.custody_location_id),
                    'isActive': locker.is_active,
                },
            )
        locker = Locker.objects.select_related('current_item', 'custody_location', 'updated_by').get(pk=locker.pk)
        return Response(LockerSerializer(locker).data, status=status.HTTP_201_CREATED)


class LockerDetailAPIView(APIView):
    """Administrators manage locker configuration; history remains immutable."""
    permission_classes = [IsCampusAdmin]

    @retry_transient_mongo_transaction()
    def patch(self, request, locker_id):
        with workflow_transaction(CUSTODY_INVENTORY_SCOPE):
            try:
                locker = Locker.objects.get(pk=locker_id)
            except (Locker.DoesNotExist, ValueError):
                return Response({'message': 'Locker not found.'}, status=status.HTTP_404_NOT_FOUND)
            if locker.current_item_id and 'lockerNumber' in request.data:
                return Response(
                    {'message': 'Release the item from this locker before changing its number.'},
                    status=status.HTTP_409_CONFLICT,
                )
            previous_number = locker.locker_number
            previous_location = locker.location
            previous_location_id = locker.custody_location_id
            previous_active = locker.is_active
            serializer = LockerCreateSerializer(locker, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            locker = serializer.save(updated_by=request.user)
            if previous_location_id != locker.custody_location_id or previous_active != locker.is_active or previous_number != locker.locker_number:
                previous_location_record = CustodyLocation.objects.filter(pk=previous_location_id).first()
                _touch_custody_location(previous_location_record, request.user)
                _touch_custody_location(locker.custody_location, request.user)
            if serializer.legacy_location_created:
                _audit_configuration(
                    request, 'CustodyLocation', locker.custody_location_id,
                    'CUSTODY_LOCATION_CREATED',
                    f'Custody location created from legacy locker input: {locker.location}',
                    {'code': locker.custody_location.code, 'legacyRequest': True},
                )
            if locker.custody_location_id != previous_location_id and locker.current_item_id:
                return Response({
                    'message': 'Transfer the stored item before moving this locker to another custody location.'
                }, status=status.HTTP_409_CONFLICT)
            event = 'LOCKER_UPDATED'
            if previous_active != locker.is_active:
                event = 'LOCKER_ENABLED' if locker.is_active else 'LOCKER_DISABLED'
            _audit_configuration(
                request, 'Locker', locker.id, event, f'{event}: {locker.locker_number}',
                {
                    'lockerNumber': locker.locker_number,
                    'previousLockerNumber': previous_number,
                    'location': locker.location,
                    'previousLocation': previous_location,
                    'custodyLocationId': str(locker.custody_location_id),
                    'previousCustodyLocationId': str(previous_location_id),
                    'isActive': locker.is_active,
                },
            )
        locker = Locker.objects.select_related('current_item', 'custody_location', 'updated_by').get(pk=locker.pk)
        return Response(LockerSerializer(locker).data, status=status.HTTP_200_OK)

    @retry_transient_mongo_transaction()
    def delete(self, request, locker_id):
        with workflow_transaction(CUSTODY_INVENTORY_SCOPE):
            try:
                locker = Locker.objects.get(pk=locker_id)
            except (Locker.DoesNotExist, ValueError):
                return Response({'message': 'Locker not found.'}, status=status.HTTP_404_NOT_FOUND)

            has_history = CustodyRecord.objects.filter(
                Q(locker_reference__iexact=locker.locker_number)
                | Q(previous_locker_reference__iexact=locker.locker_number)
            ).exists()
            has_active_assignment = Item.objects.filter(
                locker_storage_reference__iexact=locker.locker_number,
                is_archived=False,
                status__in=LOCKABLE_ITEM_STATUSES,
            ).exists()
            if locker.current_item_id or has_active_assignment:
                _audit_configuration(
                    request, 'Locker', locker.id, 'LOCKER_DELETE_BLOCKED',
                    f'Locker deletion blocked: {locker.locker_number}',
                    {'reason': 'An active item assignment remains.'},
                )
                return Response({
                    'message': 'This locker still has an active item assignment. Reassign the item before deleting or archiving the locker.'
                }, status=status.HTTP_409_CONFLICT)

            locker_id_value = str(locker.id)
            locker_number = locker.locker_number
            if has_history:
                locker.is_active = False
                locker.updated_by = request.user
                locker.save(update_fields=['is_active', 'updated_by', 'updated_at'])
                _touch_custody_location(locker.custody_location, request.user)
                _audit_configuration(
                    request, 'Locker', locker_id_value, 'LOCKER_ARCHIVED',
                    f'Locker archived to preserve custody history: {locker_number}',
                    {'lockerNumber': locker_number, 'historicalReferencesPreserved': True},
                )
                return Response({
                    'deleted': False, 'archived': True, 'lockerId': locker_id_value,
                }, status=status.HTTP_200_OK)
            locker.delete()
            _touch_custody_location(CustodyLocation.objects.filter(pk=locker.custody_location_id).first(), request.user)
            _audit_configuration(
                request, 'Locker', locker_id_value, 'LOCKER_DELETED',
                f'Unused locker deleted: {locker_number}', {'lockerNumber': locker_number},
            )

        return Response({'deleted': True, 'lockerId': locker_id_value}, status=status.HTTP_200_OK)


class LockerAssignmentAPIView(APIView):
    """Assign, move, or release an item's registered locker allocation."""
    permission_classes = [IsSecurityOrAdmin]

    @retry_transient_mongo_transaction()
    def post(self, request):
        serializer = LockerAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with workflow_transaction(item_scope(values['itemId']), CUSTODY_INVENTORY_SCOPE):
            try:
                item = Item.objects.get(pk=values['itemId'], is_archived=False)
            except (Item.DoesNotExist, ValueError):
                return Response({'message': 'Active item not found.'}, status=status.HTTP_404_NOT_FOUND)
            if item.status not in LOCKABLE_ITEM_STATUSES:
                return Response({'message': 'Only items currently in an active security custody workflow can be assigned to a locker.'}, status=status.HTTP_409_CONFLICT)

            new_locker_id = values.get('lockerId')
            current_locker_id = Locker.objects.filter(current_item=item).values_list('id', flat=True).first()
            requested_locker_exists = Locker.objects.filter(pk=new_locker_id).exists() if new_locker_id else True
            if not requested_locker_exists:
                return Response({'message': 'Locker not found.'}, status=status.HTTP_404_NOT_FOUND)
            locker_ids = [locker_id for locker_id in (current_locker_id, new_locker_id) if locker_id]
            locked_lockers = list(
                Locker.objects.select_related('custody_location')
                .filter(pk__in=locker_ids).order_by('pk')
            )
            current_locker = next((locker for locker in locked_lockers if locker.current_item_id == item.id), None)
            new_locker = next((locker for locker in locked_lockers if str(locker.id) == str(new_locker_id)), None) if new_locker_id else None
            if new_locker_id:
                if not new_locker.is_active or not new_locker.custody_location.is_active:
                    return Response({'message': 'This locker is inactive and cannot receive an item.'}, status=status.HTTP_409_CONFLICT)
                if new_locker.current_item_id not in (None, item.id):
                    return Response({'message': 'This locker is already occupied.'}, status=status.HTTP_409_CONFLICT)
                legacy_occupant = _legacy_locker_occupant(new_locker.locker_number, item.id)
                if legacy_occupant:
                    return Response({'message': 'This locker is already assigned to another active item.'}, status=status.HTTP_409_CONFLICT)

            previous_number = item.locker_storage_reference or (current_locker.locker_number if current_locker else '')
            previous_location = current_locker.custody_location.name if current_locker else (item.current_custody_desk or 'Security Office')
            next_number = new_locker.locker_number if new_locker else ''
            if previous_number.casefold() == next_number.casefold():
                return Response({
                    'itemId': str(item.id),
                    'previousLockerReference': previous_number,
                    'lockerReference': next_number,
                    'message': 'Locker allocation is already current.',
                }, status=status.HTTP_200_OK)

            if current_locker:
                current_locker.current_item = None
                current_locker.updated_by = request.user
                current_locker.save(update_fields=['current_item', 'updated_by', 'updated_at'])
            if new_locker:
                new_locker.current_item = item
                new_locker.updated_by = request.user
                new_locker.save(update_fields=['current_item', 'updated_by', 'updated_at'])
            touched_locations = {
                location.pk: location
                for location in (
                    current_locker.custody_location if current_locker else None,
                    new_locker.custody_location if new_locker else None,
                )
                if location is not None
            }
            for touched_location in touched_locations.values():
                _touch_custody_location(touched_location, request.user)

            item.locker_storage_reference = next_number
            if new_locker:
                item.current_custody_desk = new_locker.custody_location.name
            item.save(update_fields=['locker_storage_reference', 'current_custody_desk', 'updated_at'])
            custody_record = CustodyRecord.objects.create(
                item=item,
                action=CustodyAction.STORED_IN_LOCKER,
                from_location=previous_location,
                to_location=(new_locker.custody_location.name if new_locker else item.current_custody_desk or 'Security Office'),
                previous_locker_reference=previous_number,
                locker_reference=next_number,
                handled_by=request.user,
                remarks=values.get('reason', '').strip() or 'Locker allocation updated.',
            )
            AuditEntry.objects.create(
                actor=request.user,
                actor_role=request.user.role,
                action=AuditAction.CUSTODY_TRANSFER,
                target_entity='LockerAllocation',
                target_id=str(custody_record.id),
                ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                metadata={
                    'itemId': str(item.id),
                    'previousLocker': previous_number or None,
                    'newLocker': next_number or None,
                    'previousCustodyLocation': previous_location,
                    'newCustodyLocation': new_locker.custody_location.name if new_locker else item.current_custody_desk,
                    'previousCustodyLocationId': str(current_locker.custody_location_id) if current_locker else None,
                    'newCustodyLocationId': str(new_locker.custody_location_id) if new_locker else None,
                    'reason': values.get('reason', '').strip(),
                },
            )

        return Response(CustodyRecordSerializer(custody_record).data, status=status.HTTP_201_CREATED)

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
            search_filter = (
                Q(title__icontains=term) |
                Q(reference_number__icontains=term) |
                Q(current_custody_desk__icontains=term) |
                Q(locker_storage_reference__icontains=term) |
                Q(category__name__icontains=term) |
                Q(category__code__icontains=term)
            )
            try:
                search_filter |= Q(id=UUID(term))
            except ValueError:
                pass
            queryset = queryset.filter(search_filter)

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
    @retry_transient_mongo_transaction()
    def post(self, request):
        serializer = CustodyTransferInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        with workflow_transaction(item_scope(vd['itemId']), CUSTODY_INVENTORY_SCOPE):
            try:
                item = Item.objects.get(pk=vd['itemId'], is_archived=False)
            except Item.DoesNotExist:
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_404_NOT_FOUND,
                        'error': {'code': 'NOT_FOUND', 'message': 'Item not found.'},
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            original_to_location = (vd.get('toLocation') or '').strip()
            custody_location = None
            custody_location_id = vd.get('custodyLocationId')
            if custody_location_id:
                try:
                    custody_location = CustodyLocation.objects.get(pk=custody_location_id)
                except (CustodyLocation.DoesNotExist, ValueError):
                    return Response({'message': 'Custody location not found.'}, status=status.HTTP_404_NOT_FOUND)
                if not custody_location.is_active:
                    return Response({'message': 'This custody location is inactive and cannot receive items.'}, status=status.HTTP_409_CONFLICT)
            elif original_to_location:
                custody_location = CustodyLocation.objects.filter(name__iexact=original_to_location).first()
                if custody_location and not custody_location.is_active:
                    return Response({'message': 'This custody location is inactive and cannot receive items.'}, status=status.HTTP_409_CONFLICT)

            to_loc = custody_location.name if custody_location else original_to_location
            from_loc = item.current_custody_desk or 'Initial Intake'
            previous_locker_id = Locker.objects.filter(current_item=item).values_list('id', flat=True).first()
            requested_locker_number = vd.get('lockerReference', '').strip()
            requested_locker_id = vd.get('lockerId')
            if not requested_locker_id and requested_locker_number:
                requested_locker_id = Locker.objects.filter(locker_number__iexact=requested_locker_number).values_list('id', flat=True).first()
            if requested_locker_id and not requested_locker_number:
                requested_locker_number = Locker.objects.filter(pk=requested_locker_id).values_list('locker_number', flat=True).first() or ''
            locker_ids = [locker_id for locker_id in (previous_locker_id, requested_locker_id) if locker_id]
            locked_lockers = list(
                Locker.objects.select_related('custody_location')
                .filter(pk__in=locker_ids).order_by('pk')
            )
            previous_locker = next((locker for locker in locked_lockers if locker.current_item_id == item.id), None)
            previous_locker_number = previous_locker.locker_number if previous_locker else item.locker_storage_reference
            requested_locker = next((locker for locker in locked_lockers if str(locker.id) == str(requested_locker_id)), None) if requested_locker_id else None
            if (requested_locker_id or requested_locker_number) and not requested_locker:
                return Response({'message': 'Create or select the locker in the locker register before assigning it.'}, status=status.HTTP_400_BAD_REQUEST)
            if requested_locker:
                if not requested_locker.is_active or not requested_locker.custody_location.is_active:
                    return Response({'message': 'This locker or its custody location is inactive.'}, status=status.HTTP_409_CONFLICT)
                if requested_locker.current_item_id not in (None, item.id):
                    return Response({'message': 'This locker is already occupied.'}, status=status.HTTP_409_CONFLICT)
                if _legacy_locker_occupant(requested_locker.locker_number, item.id):
                    return Response({'message': 'This locker is already assigned to another active item.'}, status=status.HTTP_409_CONFLICT)
                if custody_location and requested_locker.custody_location_id != custody_location.id:
                    return Response({'message': 'The selected locker does not belong to the selected custody location.'}, status=status.HTTP_409_CONFLICT)
                custody_location = requested_locker.custody_location
                to_loc = custody_location.name

            previous_custody_location = previous_locker.custody_location if previous_locker else None
            release_previous = bool(
                previous_locker
                and not requested_locker
                and (to_loc.casefold() != previous_locker.custody_location.name.casefold())
            )
            if requested_locker and requested_locker != previous_locker:
                if previous_locker:
                    previous_locker.current_item = None
                    previous_locker.updated_by = request.user
                    previous_locker.save(update_fields=['current_item', 'updated_by', 'updated_at'])
                requested_locker.current_item = item
                requested_locker.updated_by = request.user
                requested_locker.save(update_fields=['current_item', 'updated_by', 'updated_at'])
                item.locker_storage_reference = requested_locker.locker_number
            elif release_previous:
                previous_locker.current_item = None
                previous_locker.updated_by = request.user
                previous_locker.save(update_fields=['current_item', 'updated_by', 'updated_at'])
                item.locker_storage_reference = ''

            touched_locations = {
                location.pk: location
                for location in (
                    previous_locker.custody_location if previous_locker else None,
                    custody_location,
                )
                if location is not None
            }
            for touched_location in touched_locations.values():
                _touch_custody_location(touched_location, request.user)

            if not to_loc:
                return Response({'message': 'Select an active custody location.'}, status=status.HTTP_400_BAD_REQUEST)

            record = CustodyRecord.objects.create(
                item=item,
                action=vd.get('action', CustodyAction.TRANSFERRED_DESK),
                from_location=(previous_custody_location.name if previous_custody_location else from_loc),
                to_location=to_loc,
                locker_reference=(
                    requested_locker.locker_number if requested_locker
                    else ('' if release_previous else item.locker_storage_reference)
                ),
                previous_locker_reference=previous_locker_number,
                evidence_reference=vd.get('evidenceReference', '').strip(),
                handled_by=request.user,
                remarks=vd.get('remarks', '').strip(),
            )

            item.current_custody_desk = to_loc
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
                metadata={
                    'itemId': str(item.id),
                    'fromLocation': from_loc,
                    'toLocation': to_loc,
                    'previousCustodyLocationId': str(previous_custody_location.id) if previous_custody_location else None,
                    'newCustodyLocationId': str(custody_location.id) if custody_location else None,
                    'previousLocker': previous_locker_number or None,
                    'newLocker': requested_locker.locker_number if requested_locker else None,
                    'reason': vd.get('remarks', '').strip(),
                },
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
