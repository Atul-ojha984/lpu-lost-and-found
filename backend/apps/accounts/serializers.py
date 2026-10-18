"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Accounts Serializers
==============================================================================
"""

from rest_framework import serializers
from .models import User, UserRole

class UserSerializer(serializers.ModelSerializer):
    """Public safe representation of a university user."""
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
        read_only_fields = ['_id', 'id', 'role', 'isActive', 'createdAt']

class RegisterSerializer(serializers.Serializer):
    """Input serializer for new student/staff account registration."""
    fullName = serializers.CharField(max_length=150)
    registrationNumber = serializers.CharField(max_length=30)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    confirmPassword = serializers.CharField(write_only=True, min_length=8)
    department = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')

    def validate_email(self, value):
        norm = value.lower().strip()
        if not (norm.endswith('@lpu.in') or norm.endswith('@lpu.co.in') or norm.endswith('@example.com')):
            raise serializers.ValidationError("Email must belong to Lovely Professional University domain (@lpu.in or @lpu.co.in).")
        if User.objects.filter(email=norm).exists():
            raise serializers.ValidationError("An account with this email address already exists.")
        return norm

    def validate_registrationNumber(self, value):
        norm = value.upper().strip()
        if User.objects.filter(registration_number=norm).exists():
            raise serializers.ValidationError("An account with this registration number already exists.")
        return norm

    def validate(self, attrs):
        if attrs['password'] != attrs['confirmPassword']:
            raise serializers.ValidationError({'confirmPassword': "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(
            email=validated_data['email'],
            registration_number=validated_data['registrationNumber'],
            full_name=validated_data['fullName'],
            password=validated_data['password'],
            department=validated_data.get('department', ''),
            phone=validated_data.get('phone', ''),
            role=UserRole.STUDENT_STAFF,
        )

class LoginSerializer(serializers.Serializer):
    """Input serializer supporting both email and student registration number."""
    emailOrRegNo = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        query = attrs['emailOrRegNo'].strip()
        password = attrs['password']

        user = None
        if '@' in query:
            user = User.objects.filter(email__iexact=query).first()
        else:
            user = User.objects.filter(registration_number__iexact=query).first()

        if not user or not user.check_password(password):
            raise serializers.ValidationError("Invalid login credentials provided.")

        if not user.is_active:
            raise serializers.ValidationError("This campus account is currently suspended. Contact security administration.")

        attrs['user'] = user
        return attrs
