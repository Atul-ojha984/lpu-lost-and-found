"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Custody App Serializers
==============================================================================
"""

from rest_framework import serializers
from apps.accounts.serializers import UserSerializer
from .models import CustodyRecord, CustodyAction

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
    toLocation = serializers.CharField(max_length=150)
    lockerReference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    action = serializers.ChoiceField(choices=CustodyAction.choices, required=False, default=CustodyAction.TRANSFERRED_DESK)
    remarks = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')
    evidenceReference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
