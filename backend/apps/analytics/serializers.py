"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Analytics & Administration Serializers
==============================================================================
"""

from rest_framework import serializers
from apps.accounts.models import User, UserRole, UserType
from apps.accounts.serializers import CreateAdminUserSerializer, IndianMobileNumberField
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
    userType = serializers.CharField(source='user_type', read_only=True)
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
            'userType',
            'department',
            'securityPost',
            'phone',
            'isActive',
            'createdAt',
        ]

class UpdateUserAdminSerializer(serializers.Serializer):
    """Admin update payload for user role, security post, and status."""
    role = serializers.ChoiceField(choices=UserRole.choices, required=False)
    userType = serializers.ChoiceField(choices=UserType.choices, required=False)
    securityPost = serializers.CharField(required=False, allow_blank=True, max_length=150)
    department = serializers.CharField(required=False, allow_blank=True, max_length=150)
    phone = IndianMobileNumberField(required=False, allow_blank=True, max_length=20)
    isActive = serializers.BooleanField(required=False)

    def validate(self, attrs):
        type_to_role = {
            UserType.STUDENT: UserRole.STUDENT_STAFF,
            UserType.STAFF: UserRole.STUDENT_STAFF,
            UserType.SECURITY_OFFICER: UserRole.SECURITY_PERSONNEL,
            UserType.CAMPUS_ADMIN: UserRole.CAMPUS_ADMIN,
            UserType.SYSTEM_ADMIN: UserRole.SYSTEM_ADMIN,
            UserType.UNSPECIFIED: UserRole.STUDENT_STAFF,
        }
        user_type = attrs.get('userType')
        role = attrs.get('role')
        if user_type:
            expected_role = type_to_role.get(user_type)
            if expected_role is None:
                raise serializers.ValidationError({'userType': 'An account must be assigned a specific role type.'})
            if role and role != expected_role:
                raise serializers.ValidationError({'userType': 'Account type and permission role do not match.'})
            attrs['role'] = expected_role
        elif role == UserRole.SECURITY_PERSONNEL:
            attrs['userType'] = UserType.SECURITY_OFFICER
        elif role == UserRole.CAMPUS_ADMIN:
            attrs['userType'] = UserType.CAMPUS_ADMIN
        elif role == UserRole.SYSTEM_ADMIN:
            attrs['userType'] = UserType.SYSTEM_ADMIN
        return attrs
