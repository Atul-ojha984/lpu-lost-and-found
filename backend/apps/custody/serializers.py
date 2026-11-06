"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Custody App Serializers
==============================================================================
"""

import uuid
from rest_framework import serializers
from django.db.models import Q
from apps.accounts.serializers import UserSerializer
from .models import CustodyRecord, CustodyAction, CustodyLocation, Locker
from apps.items.models import Item, ItemStatus

class LockerSerializer(serializers.ModelSerializer):
    lockerNumber = serializers.CharField(source='locker_number')
    locationId = serializers.UUIDField(source='custody_location_id', read_only=True)
    locationCode = serializers.CharField(source='custody_location.code', read_only=True)
    locationActive = serializers.BooleanField(source='custody_location.is_active', read_only=True)
    currentItemId = serializers.CharField(source='current_item_id', read_only=True, allow_null=True)
    currentItemTitle = serializers.CharField(source='current_item.title', read_only=True, allow_null=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    occupied = serializers.SerializerMethodField()
    updatedBy = serializers.SerializerMethodField()

    class Meta:
        model = Locker
        fields = [
            'id', 'lockerNumber', 'location', 'locationId', 'locationCode',
            'locationActive', 'is_active', 'currentItemId', 'currentItemTitle',
            'updatedAt', 'updatedBy', 'occupied',
        ]
        read_only_fields = [
            'id', 'location', 'locationId', 'locationCode', 'locationActive',
            'currentItemId', 'currentItemTitle', 'updatedAt', 'updatedBy', 'occupied',
        ]

    def get_occupied(self, obj):
        return obj.current_item_id is not None

    def get_updatedBy(self, obj):
        if not obj.updated_by_id:
            return None
        return {
            'id': str(obj.updated_by_id),
            'fullName': obj.updated_by.full_name,
            'role': obj.updated_by.role,
        }

class LockerCreateSerializer(serializers.Serializer):
    """Locker input; accepts the legacy location name or the canonical location ID."""
    lockerNumber = serializers.CharField(source='locker_number', max_length=100, required=False)
    location = serializers.CharField(max_length=150, required=False, write_only=True)
    custodyLocationId = serializers.UUIDField(required=False, write_only=True)
    is_active = serializers.BooleanField(required=False, default=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.legacy_location_created = False

    def validate(self, attrs):
        locker_number = attrs.get('locker_number', getattr(self.instance, 'locker_number', '')).strip().upper()
        if not locker_number:
            raise serializers.ValidationError({'lockerNumber': 'A locker identifier is required.'})
        duplicate = Locker.objects.filter(locker_number__iexact=locker_number)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError({'lockerNumber': 'This locker identifier is already registered.'})
        attrs['locker_number'] = locker_number

        location_id = attrs.pop('custodyLocationId', None)
        location_name = attrs.pop('location', None)
        if location_id:
            try:
                custody_location = CustodyLocation.objects.get(pk=location_id)
            except CustodyLocation.DoesNotExist:
                raise serializers.ValidationError({'custodyLocationId': 'Custody location not found.'})
        elif location_name:
            custody_location = CustodyLocation.objects.filter(name__iexact=location_name.strip()).first()
            if not custody_location:
                attrs['legacy_location_name'] = location_name.strip()
                custody_location = None
        elif self.instance:
            custody_location = self.instance.custody_location
        else:
            raise serializers.ValidationError({'custodyLocationId': 'Select an active custody location.'})

        if custody_location and not custody_location.is_active and (
            not self.instance or custody_location.pk != self.instance.custody_location_id
        ):
            raise serializers.ValidationError({'custodyLocationId': 'Inactive custody locations cannot receive lockers.'})
        attrs['custody_location'] = custody_location
        return attrs

    @staticmethod
    def _legacy_location(name, actor):
        location = CustodyLocation.objects.filter(name__iexact=name).first()
        if location:
            return location, False
        location = CustodyLocation.objects.create(
            code=f'LEGACY-{uuid.uuid4().hex[:12].upper()}',
            name=name,
            description='Created from a legacy locker request.',
            created_by=actor,
            updated_by=actor,
        )
        return location, True

    def create(self, validated_data):
        updated_by = validated_data.pop('updated_by', None)
        legacy_name = validated_data.pop('legacy_location_name', None)
        custody_location = validated_data.pop('custody_location')
        if legacy_name:
            custody_location, self.legacy_location_created = self._legacy_location(legacy_name, updated_by)
        return Locker.objects.create(
            **validated_data,
            custody_location=custody_location,
            location=custody_location.name,
            updated_by=updated_by,
        )

    def update(self, instance, validated_data):
        updated_by = validated_data.pop('updated_by', None)
        legacy_name = validated_data.pop('legacy_location_name', None)
        custody_location = validated_data.pop('custody_location', instance.custody_location)
        if legacy_name:
            custody_location, self.legacy_location_created = self._legacy_location(legacy_name, updated_by)
        if instance.current_item_id and custody_location.pk != instance.custody_location_id:
            raise serializers.ValidationError({'custodyLocationId': 'Transfer the stored item before moving this locker to another location.'})
        instance.custody_location = custody_location
        instance.location = custody_location.name
        for field in ('locker_number', 'is_active'):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        if updated_by is not None:
            instance.updated_by = updated_by
        instance.save()
        return instance


class CustodyLocationSerializer(serializers.ModelSerializer):
    isActive = serializers.BooleanField(source='is_active', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    createdBy = serializers.SerializerMethodField()
    updatedBy = serializers.SerializerMethodField()
    lockers = serializers.SerializerMethodField()
    lockersTotal = serializers.SerializerMethodField()
    lockersOccupied = serializers.SerializerMethodField()
    itemsStored = serializers.SerializerMethodField()

    class Meta:
        model = CustodyLocation
        fields = [
            'id', 'code', 'name', 'description', 'isActive', 'createdAt',
            'updatedAt', 'createdBy', 'updatedBy', 'lockers', 'lockersTotal',
            'lockersOccupied', 'itemsStored',
        ]

    def get_createdBy(self, obj):
        return self._actor(obj.created_by)

    def get_updatedBy(self, obj):
        return self._actor(obj.updated_by)

    @staticmethod
    def _actor(user):
        if not user:
            return None
        return {'id': str(user.pk), 'fullName': user.full_name, 'role': user.role}

    def get_lockers(self, obj):
        lockers = obj.lockers.select_related('current_item', 'custody_location', 'updated_by').all()
        return LockerSerializer(lockers, many=True, context=self.context).data

    def get_lockersTotal(self, obj):
        return obj.lockers.count()

    def get_lockersOccupied(self, obj):
        return obj.lockers.filter(current_item__isnull=False).count()

    def get_itemsStored(self, obj):
        return Item.objects.filter(
            Q(current_custody_desk__iexact=obj.name) | Q(assigned_locker__custody_location=obj),
            status__in=[ItemStatus.IN_CUSTODY, ItemStatus.READY_FOR_HANDOVER, ItemStatus.MATCH_PENDING],
            is_archived=False,
        ).distinct().count()


class CustodyLocationWriteSerializer(serializers.ModelSerializer):
    isActive = serializers.BooleanField(source='is_active', required=False)

    class Meta:
        model = CustodyLocation
        fields = ['code', 'name', 'description', 'isActive']

    def validate_code(self, value):
        code = value.strip().upper()
        duplicates = CustodyLocation.objects.filter(code__iexact=code)
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError('This custody location code is already in use.')
        return code

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError('Custody location name is required.')
        duplicates = CustodyLocation.objects.filter(name__iexact=name)
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError('This custody location name is already in use.')
        return name

    def validate(self, attrs):
        if not self.instance and not attrs.get('code'):
            raise serializers.ValidationError({'code': 'Custody location code is required.'})
        if not self.instance and not attrs.get('name'):
            raise serializers.ValidationError({'name': 'Custody location name is required.'})
        return attrs

class LockerAssignmentSerializer(serializers.Serializer):
    itemId = serializers.UUIDField()
    lockerId = serializers.UUIDField(required=False, allow_null=True)
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')

class CustodyRecordSerializer(serializers.ModelSerializer):
    """Output serializer for immutable chain of custody audit history."""
    _id = serializers.CharField(source='id', read_only=True)
    itemId = serializers.CharField(source='item_id')
    itemReference = serializers.CharField(source='item.reference_number', read_only=True)
    itemTitle = serializers.CharField(source='item.title', read_only=True)
    fromLocation = serializers.CharField(source='from_location')
    toLocation = serializers.CharField(source='to_location')
    location = serializers.CharField(source='to_location', read_only=True)
    lockerReference = serializers.CharField(source='locker_reference')
    previousLockerReference = serializers.CharField(source='previous_locker_reference', read_only=True)
    lockerNumber = serializers.CharField(source='locker_reference', read_only=True)
    evidenceReference = serializers.CharField(source='evidence_reference')
    handledBy = UserSerializer(source='handled_by', read_only=True)
    officerName = serializers.CharField(source='handled_by.full_name', read_only=True)
    officerPost = serializers.CharField(source='handled_by.security_post', read_only=True)

    class Meta:
        model = CustodyRecord
        fields = [
            '_id',
            'id',
            'itemId',
            'itemReference',
            'itemTitle',
            'action',
            'fromLocation',
            'toLocation',
            'location',
            'lockerReference',
            'previousLockerReference',
            'lockerNumber',
            'evidenceReference',
            'handledBy',
            'officerName',
            'officerPost',
            'remarks',
            'timestamp',
        ]

class CustodyTransferInputSerializer(serializers.Serializer):
    """Input serializer for recording physical custody movements."""
    itemId = serializers.CharField()
    toLocation = serializers.CharField(max_length=150, required=False, allow_blank=True)
    custodyLocationId = serializers.UUIDField(required=False)
    lockerId = serializers.UUIDField(required=False)
    lockerReference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    action = serializers.ChoiceField(choices=CustodyAction.choices, required=False, default=CustodyAction.TRANSFERRED_DESK)
    remarks = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')
    evidenceReference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if not attrs.get('custodyLocationId') and not attrs.get('toLocation', '').strip():
            raise serializers.ValidationError({'custodyLocationId': 'Select a custody location.'})
        return attrs
