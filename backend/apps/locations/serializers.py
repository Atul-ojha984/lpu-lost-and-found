"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Locations App Serializers
==============================================================================
"""

from rest_framework import serializers
from .models import Location

class LocationSerializer(serializers.ModelSerializer):
    """Public representation of campus locations with security desks."""
    _id = serializers.CharField(source='id', read_only=True)
    campusZone = serializers.CharField(source='campus_zone')
    buildingName = serializers.CharField(source='building_name', allow_blank=True, required=False)
    hasSecurityDesk = serializers.BooleanField(source='has_security_desk')
    securityContactPhone = serializers.CharField(source='security_contact_phone', allow_blank=True, required=False)
    isActive = serializers.BooleanField(source='is_active')

    class Meta:
        model = Location
        fields = [
            '_id',
            'id',
            'code',
            'name',
            'campusZone',
            'buildingName',
            'hasSecurityDesk',
            'securityContactPhone',
            'isActive',
        ]

class CreateLocationSerializer(serializers.Serializer):
    """Input serializer for administrative campus location registration."""
    code = serializers.CharField(max_length=50)
    name = serializers.CharField(max_length=150)
    campusZone = serializers.CharField(max_length=100)
    buildingName = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')
    hasSecurityDesk = serializers.BooleanField(required=False, default=False)
    securityContactPhone = serializers.CharField(max_length=30, required=False, allow_blank=True, default='')
    isActive = serializers.BooleanField(required=False, default=True)

    def validate_code(self, value):
        code = value.upper().strip()
        if Location.objects.filter(code=code).exists():
            raise serializers.ValidationError(f"Location code '{code}' already exists.")
        return code

    def create(self, validated_data):
        return Location.objects.create(
            code=validated_data['code'],
            name=validated_data['name'].strip(),
            campus_zone=validated_data['campusZone'].strip(),
            building_name=validated_data.get('buildingName', '').strip(),
            has_security_desk=validated_data.get('hasSecurityDesk', False),
            security_contact_phone=validated_data.get('securityContactPhone', '').strip(),
            is_active=validated_data.get('isActive', True),
        )

class UpdateLocationSerializer(serializers.Serializer):
    """Input serializer for administrative location modifications."""
    name = serializers.CharField(max_length=150, required=False)
    campusZone = serializers.CharField(max_length=100, required=False)
    buildingName = serializers.CharField(max_length=150, required=False, allow_blank=True)
    hasSecurityDesk = serializers.BooleanField(required=False)
    securityContactPhone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    isActive = serializers.BooleanField(required=False)

    def update(self, instance, validated_data):
        if 'name' in validated_data:
            instance.name = validated_data['name'].strip()
        if 'campusZone' in validated_data:
            instance.campus_zone = validated_data['campusZone'].strip()
        if 'buildingName' in validated_data:
            instance.building_name = validated_data['buildingName'].strip()
        if 'hasSecurityDesk' in validated_data:
            instance.has_security_desk = validated_data['hasSecurityDesk']
        if 'securityContactPhone' in validated_data:
            instance.security_contact_phone = validated_data['securityContactPhone'].strip()
        if 'isActive' in validated_data:
            instance.is_active = validated_data['isActive']
        instance.save()
        return instance
