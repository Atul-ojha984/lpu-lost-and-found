"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Analytics & Administration Serializers
==============================================================================
"""

from rest_framework import serializers
from apps.accounts.models import User, UserRole
from apps.disposal.models import DisposalMethod

class DisposalApprovalInputSerializer(serializers.Serializer):
    """Input serializer for formal administrative property disposal approval."""
    itemId = serializers.CharField()
    method = serializers.ChoiceField(choices=DisposalMethod.choices)
    reason = serializers.CharField(min_length=5, max_length=1000)
    recipientOrganization = serializers.CharField(required=False, allow_blank=True, max_length=200, default='')
    certificateUrl = serializers.CharField(required=False, allow_blank=True, max_length=500, default='')

class AdminUserSerializer(serializers.ModelSerializer):
    """Admin user listing and management serializer."""
    _id = serializers.CharField(source='id', read_only=True)
    registrationNumber = serializers.CharField(source='registration_number', read_only=True)
    fullName = serializers.CharField(source='full_name', read_only=True)
    securityPost = serializers.CharField(source='security_post', read_only=True)
    isActive = serializers.BooleanField(source='is_active', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = User
        fields = [
            '_id',
            'id',
            'registrationNumber',
            'email',
            'fullName',
            'role',
            'department',
            'securityPost',
            'phone',
            'isActive',
            'createdAt',
        ]

class UpdateUserAdminSerializer(serializers.Serializer):
    """Admin update payload for user role, security post, and status."""
    role = serializers.ChoiceField(choices=UserRole.choices, required=False)
    securityPost = serializers.CharField(required=False, allow_blank=True, max_length=150)
    department = serializers.CharField(required=False, allow_blank=True, max_length=150)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=20)
    isActive = serializers.BooleanField(required=False)
