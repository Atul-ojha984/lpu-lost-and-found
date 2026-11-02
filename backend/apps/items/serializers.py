"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Items App Serializers
==============================================================================
"""

from rest_framework import serializers
from apps.locations.models import Location
from .models import ItemCategory, Item, ItemType
from apps.verification.models import VerificationChallenge

class ItemCategorySerializer(serializers.ModelSerializer):
    """Catalog taxonomy category representation."""
    _id = serializers.CharField(source='id', read_only=True)
    isActive = serializers.BooleanField(source='is_active')
    defaultRetentionDays = serializers.IntegerField(source='default_retention_days')

    class Meta:
        model = ItemCategory
        fields = [
            '_id',
            'id',
            'code',
            'name',
            'description',
            'icon',
            'isActive',
            'defaultRetentionDays',
        ]

class CreateCategorySerializer(serializers.Serializer):
    """Admin category creation input."""
    code = serializers.CharField(max_length=50)
    name = serializers.CharField(max_length=100)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    icon = serializers.CharField(required=False, allow_blank=True, default='')
    defaultRetentionDays = serializers.IntegerField(required=False, default=90)
    isActive = serializers.BooleanField(required=False, default=True)

    def validate_code(self, value):
        code = value.upper().strip()
        if ItemCategory.objects.filter(code=code).exists():
            raise serializers.ValidationError(f"Category code '{code}' already exists.")
        return code

    def create(self, validated_data):
        return ItemCategory.objects.create(
            code=validated_data['code'],
            name=validated_data['name'].strip(),
            description=validated_data.get('description', '').strip(),
            icon=validated_data.get('icon', '').strip(),
            default_retention_days=validated_data.get('defaultRetentionDays', 90),
            is_active=validated_data.get('isActive', True),
        )

class UpdateCategorySerializer(serializers.Serializer):
    """Admin category modification input."""
    name = serializers.CharField(max_length=100, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    icon = serializers.CharField(required=False, allow_blank=True)
    defaultRetentionDays = serializers.IntegerField(required=False)
    isActive = serializers.BooleanField(required=False)

    def update(self, instance, validated_data):
        if 'name' in validated_data:
            instance.name = validated_data['name'].strip()
        if 'description' in validated_data:
            instance.description = validated_data['description'].strip()
        if 'icon' in validated_data:
            instance.icon = validated_data['icon'].strip()
        if 'defaultRetentionDays' in validated_data:
            instance.default_retention_days = validated_data['defaultRetentionDays']
        if 'isActive' in validated_data:
            instance.is_active = validated_data['isActive']
        instance.save()
        return instance

class PublicItemSerializer(serializers.ModelSerializer):
    """
    Sanitized public item representation.
    Strictly excludes PrivateDetail vaults, challenge answers, and internal notes.
    """
    _id = serializers.CharField(source='id', read_only=True)
    referenceNumber = serializers.CharField(source='reference_number')
    itemType = serializers.CharField(source='item_type')
    publicDescription = serializers.CharField(source='public_description')
    specificLocation = serializers.CharField(source='specific_location')
    eventDate = serializers.DateTimeField(source='event_date')
    primaryImageUrl = serializers.CharField(source='primary_image_url', allow_blank=True)
    additionalImages = serializers.JSONField(source='additional_images')
    currentCustodyDesk = serializers.CharField(source='current_custody_desk', allow_blank=True)
    createdAt = serializers.DateTimeField(source='created_at')
    
    category = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    campusZone = serializers.SerializerMethodField()
    reportedByRole = serializers.SerializerMethodField()
    isOwner = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            '_id',
            'id',
            'referenceNumber',
            'itemType',
            'title',
            'publicDescription',
            'category',
            'location',
            'campusZone',
            'specificLocation',
            'eventDate',
            'primaryImageUrl',
            'additionalImages',
            'status',
            'reportedByRole',
            'currentCustodyDesk',
            'createdAt',
            'isOwner',
        ]

    def get_category(self, obj):
        return {
            'id': str(obj.category.id),
            'code': obj.category.code,
            'name': obj.category.name,
        }

    def get_location(self, obj):
        return {
            'id': str(obj.location.id),
            'code': obj.location.code,
            'name': obj.location.name,
            'campusZone': obj.location.campus_zone,
        }

    def get_campusZone(self, obj):
        return obj.location.code or obj.location.campus_zone

    def get_reportedByRole(self, obj):
        return getattr(obj.reported_by, 'role', 'STUDENT_STAFF')

    def get_isOwner(self, obj):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            return obj.reported_by_id == request.user.id
        return False

class VerificationQuestionInputSerializer(serializers.Serializer):
    questionText = serializers.CharField(max_length=300)
    expectedAnswer = serializers.CharField(max_length=200)

class CreateReportSerializer(serializers.Serializer):
    """Input serializer for student and staff lost/found report submission."""
    itemType = serializers.ChoiceField(choices=ItemType.choices)
    title = serializers.CharField(max_length=150)
    category = serializers.CharField()
    location = serializers.CharField()
    specificLocation = serializers.CharField(max_length=200)
    eventDate = serializers.DateTimeField()
    publicDescription = serializers.CharField(max_length=1000)
    primaryImageUrl = serializers.CharField(required=False, allow_blank=True, default='')
    additionalImages = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    
    # Private vault & challenges (optional, recommended for FOUND items)
    privateIdentifyingDetails = serializers.CharField(required=False, allow_blank=True, default='')
    verificationQuestions = VerificationQuestionInputSerializer(many=True, required=False, default=list)

    def validate_category(self, value):
        val = value.strip()
        cat = ItemCategory.objects.filter(code__iexact=val).first()
        if not cat:
            cat = ItemCategory.objects.filter(id=val).first() if len(val) == 36 else None
        if not cat:
            raise serializers.ValidationError(f"Invalid category code or ID: {value}")
        return cat

    def validate_location(self, value):
        val = value.strip()
        loc = Location.objects.filter(code__iexact=val).first()
        if not loc:
            loc = Location.objects.filter(id=val).first() if len(val) == 36 else None
        if not loc:
            raise serializers.ValidationError(f"Invalid location code or ID: {value}")
        return loc

class UpdateReportSerializer(serializers.Serializer):
    """Input serializer for owner updates on existing reports."""
    title = serializers.CharField(max_length=150, required=False)
    category = serializers.CharField(required=False)
    location = serializers.CharField(required=False)
    specificLocation = serializers.CharField(max_length=200, required=False)
    eventDate = serializers.DateTimeField(required=False)
    publicDescription = serializers.CharField(max_length=1000, required=False)
    primaryImageUrl = serializers.CharField(required=False, allow_blank=True)
    additionalImages = serializers.ListField(child=serializers.CharField(), required=False)
    privateIdentifyingDetails = serializers.CharField(required=False, allow_blank=True)

    def validate_category(self, value):
        val = value.strip()
        cat = ItemCategory.objects.filter(code__iexact=val).first()
        if not cat:
            cat = ItemCategory.objects.filter(id=val).first() if len(val) == 36 else None
        if not cat:
            raise serializers.ValidationError(f"Invalid category code or ID: {value}")
        return cat

    def validate_location(self, value):
        val = value.strip()
        loc = Location.objects.filter(code__iexact=val).first()
        if not loc:
            loc = Location.objects.filter(id=val).first() if len(val) == 36 else None
        if not loc:
            raise serializers.ValidationError(f"Invalid location code or ID: {value}")
        return loc

class PublicChallengeSerializer(serializers.ModelSerializer):
    """Public verification challenge serializer (excludes hashed answer)."""
    questionText = serializers.CharField(source='question_text')
    maxAttempts = serializers.IntegerField(source='max_attempts')
    expiresAt = serializers.DateTimeField(source='expires_at')

    class Meta:
        model = VerificationChallenge
        fields = [
            'id',
            'questionText',
            'hint',
            'maxAttempts',
            'expiresAt',
        ]

class PrivateVaultResponseSerializer(serializers.Serializer):
    """Security-only decrypted private vault inspection output."""
    fieldsSummary = serializers.ListField(child=serializers.CharField())
    decryptedContent = serializers.CharField()
    accessCount = serializers.IntegerField()
