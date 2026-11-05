"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Items App Views: Categories, Public Board, Reporting & Ingestion
==============================================================================
"""

from datetime import datetime, timezone, timedelta
import uuid
from django.db import transaction
from django.db.models import Q
from django.utils import timezone as django_timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.exceptions import ValidationError
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

from apps.accounts.permissions import (
    IsCampusAdmin,
    IsSecurityOrAdmin,
    IsStudentOrStaff,
    IsRecordOwner,
)
from apps.accounts.models import User
from apps.audit.models import AuditEntry, AuditAction
from apps.claims.models import Claim, ClaimStatus
from apps.custody.models import CustodyRecord
from apps.handovers.models import Handover
from apps.matching.models import MatchSuggestion, MatchStatus
from apps.verification.models import PrivateDetail, VerificationChallenge
from .models import ItemCategory, Item, ItemType, ItemStatus
from .serializers import (
    ItemCategorySerializer,
    CreateCategorySerializer,
    UpdateCategorySerializer,
    PublicItemSerializer,
    CreateReportSerializer,
    UpdateReportSerializer,
    PublicChallengeSerializer,
    PrivateVaultResponseSerializer,
)
from .services import (
    STUDENT_DAILY_LOST_REPORT_LIMIT,
    generate_reference_number,
    get_student_daily_lost_report_allowance,
    is_student_reporter,
    process_and_store_image,
)

# -----------------------------------------------------------------------------
# Categories
# -----------------------------------------------------------------------------

class PublicCategoryListAPIView(APIView):
    """Public catalog of active property categories."""
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Taxonomy'],
        summary='Get Public Categories',
        responses={200: ItemCategorySerializer(many=True)},
    )
    def get(self, request):
        categories = ItemCategory.objects.filter(is_active=True).order_by('name')
        serializer = ItemCategorySerializer(categories, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

class AdminCategoryListCreateAPIView(APIView):
    """Administrative management for item categories."""
    permission_classes = [IsCampusAdmin]

    @extend_schema(
        tags=['Taxonomy'],
        summary='Admin List Categories',
        responses={200: ItemCategorySerializer(many=True)},
    )
    def get(self, request):
        include_inactive = request.query_params.get('includeInactive', 'true').lower() in ('true', '1')
        queryset = ItemCategory.objects.all() if include_inactive else ItemCategory.objects.filter(is_active=True)
        serializer = ItemCategorySerializer(queryset.order_by('name'), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=['Taxonomy'],
        summary='Admin Create Category',
        request=CreateCategorySerializer,
        responses={201: ItemCategorySerializer},
    )
    def post(self, request):
        serializer = CreateCategorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        return Response(ItemCategorySerializer(category).data, status=status.HTTP_201_CREATED)

class AdminCategoryDetailAPIView(APIView):
    """Administrative update for a category."""
    permission_classes = [IsCampusAdmin]

    @extend_schema(
        tags=['Taxonomy'],
        summary='Admin Update Category',
        request=UpdateCategorySerializer,
        responses={200: ItemCategorySerializer},
    )
    def patch(self, request, pk):
        try:
            category = ItemCategory.objects.get(pk=pk)
        except ItemCategory.DoesNotExist:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Category not found.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = UpdateCategorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = serializer.update(category, serializer.validated_data)
        return Response(ItemCategorySerializer(updated).data, status=status.HTTP_200_OK)

# -----------------------------------------------------------------------------
# Public Board & Item Search
# -----------------------------------------------------------------------------

class ItemPublicBoardAPIView(APIView):
    """
    Public Property Recovery Board
    Supports dynamic multi-filtering, search, safe server-side sorting, and pagination.
    Strictly redacts sensitive fields and private vault data.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Items'],
        summary='Search Public Lost & Found Board',
        parameters=[
            OpenApiParameter('itemType', str, description='Filter by LOST or FOUND'),
            OpenApiParameter('category', str, description='Category code or UUID'),
            OpenApiParameter('campusZone', str, description='Campus zone filter'),
            OpenApiParameter('location', str, description='Location code or UUID'),
            OpenApiParameter('status', str, description='Item status'),
            OpenApiParameter('search', str, description='Keyword search on title, description, location'),
            OpenApiParameter('sortBy', str, description='Sort field: createdAt, eventDate, title'),
            OpenApiParameter('sortOrder', str, description='Sort order: asc or desc'),
            OpenApiParameter('page', int, description='Page number (default 1)'),
            OpenApiParameter('limit', int, description='Page size (default 20, max 100)'),
        ],
        responses={200: OpenApiResponse(description='Paginated public items')},
    )
    def get(self, request):
        queryset = Item.objects.filter(is_archived=False).select_related('category', 'location', 'reported_by')

        # Filters
        item_type = request.query_params.get('itemType')
        if item_type and item_type.upper() != 'ALL':
            queryset = queryset.filter(item_type=item_type.upper())

        category = request.query_params.get('category')
        if category and category.upper() != 'ALL':
            if len(category) == 36:
                queryset = queryset.filter(category_id=category)
            else:
                queryset = queryset.filter(category__code__iexact=category)

        campus_zone = request.query_params.get('campusZone')
        if campus_zone and campus_zone.upper() != 'ALL':
            queryset = queryset.filter(
                Q(location__campus_zone__iexact=campus_zone) |
                Q(location__code__iexact=campus_zone)
            )

        location = request.query_params.get('location')
        if location and location.upper() != 'ALL':
            if len(location) == 36:
                queryset = queryset.filter(location_id=location)
            else:
                queryset = queryset.filter(location__code__iexact=location)

        status_val = request.query_params.get('status')
        if status_val and status_val.upper() != 'ALL':
            queryset = queryset.filter(status=status_val.upper())

        search = request.query_params.get('search')
        if search and search.strip():
            term = search.strip()
            queryset = queryset.filter(
                Q(title__icontains=term) |
                Q(public_description__icontains=term) |
                Q(specific_location__icontains=term) |
                Q(reference_number__icontains=term)
            )

        # Server-side sorting with strict allowlist
        sort_by = request.query_params.get('sortBy', 'createdAt')
        sort_order = request.query_params.get('sortOrder', 'desc').lower()
        
        ALLOWED_SORT_FIELDS = {
            'createdat': 'created_at',
            'created_at': 'created_at',
            'eventdate': 'event_date',
            'event_date': 'event_date',
            'title': 'title',
        }
        
        sort_field = ALLOWED_SORT_FIELDS.get(sort_by.lower(), 'created_at')
        if sort_order == 'asc':
            order_clause = [sort_field, 'id']
        else:
            order_clause = [f'-{sort_field}', '-id']
        
        queryset = queryset.order_by(*order_clause)

        # Pagination
        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except ValueError:
            page = 1
        try:
            limit = min(100, max(1, int(request.query_params.get('limit', 20))))
        except ValueError:
            limit = 20

        total_items = queryset.count()
        total_pages = max(1, (total_items + limit - 1) // limit)
        offset = (page - 1) * limit
        items = list(queryset[offset:offset + limit])

        serialized_items = PublicItemSerializer(items, many=True, context={'request': request}).data

        # Frontend envelope matching PaginatedResult<PublicItem>
        return Response({
            'items': serialized_items,
            'pagination': {
                'page': page,
                'limit': limit,
                'totalItems': total_items,
                'totalPages': total_pages,
                'hasNextPage': page < total_pages,
                'hasPrevPage': page > 1,
            }
        }, status=status.HTTP_200_OK)

# -----------------------------------------------------------------------------
# Item Detail & Reporting
# -----------------------------------------------------------------------------

class DailyLostReportLimitAPIView(APIView):
    """Return the authenticated student's remaining lost-report allowance."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Items'],
        summary='Get Daily Lost Report Allowance',
        responses={200: OpenApiResponse(description='Current local-day lost report allowance')},
    )
    def get(self, request):
        return Response(
            get_student_daily_lost_report_allowance(request.user),
            status=status.HTTP_200_OK,
        )

class ItemDetailAPIView(APIView):
    """Retrieve sanitized public or owner item detail by ID or reference number."""
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Items'],
        summary='Get Item Detail',
        responses={200: PublicItemSerializer},
    )
    def get(self, request, pk):
        item = None
        if len(pk) == 36:
            item = Item.objects.filter(pk=pk).select_related('category', 'location', 'reported_by').first()
        if not item:
            item = Item.objects.filter(reference_number__iexact=pk).select_related('category', 'location', 'reported_by').first()

        if not item or item.is_archived:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Item not found or is archived.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = PublicItemSerializer(item, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=['Items'],
        summary='Update Item Report',
        request=UpdateReportSerializer,
        responses={200: PublicItemSerializer},
    )
    def patch(self, request, pk):
        if not (request.user and request.user.is_authenticated):
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_401_UNAUTHORIZED,
                    'error': {'code': 'UNAUTHORIZED', 'message': 'Authentication required to update report.'},
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        item = Item.objects.filter(pk=pk).first()
        if not item:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Item not found.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if item.status == ItemStatus.EXPIRED:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_409_CONFLICT,
                    'error': {
                        'code': 'REPORT_EXPIRED',
                        'message': 'Report expired after 30 days without recovery.',
                    },
                },
                status=status.HTTP_409_CONFLICT,
            )

        if item.reported_by_id != request.user.id and request.user.role not in ('CAMPUS_ADMIN', 'SYSTEM_ADMIN'):
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_403_FORBIDDEN,
                    'error': {'code': 'FORBIDDEN', 'message': 'You are not the owner of this report.'},
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = UpdateReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        if 'title' in vd: item.title = vd['title'].strip()
        if 'category' in vd: item.category = vd['category']
        if 'location' in vd: item.location = vd['location']
        if 'specificLocation' in vd: item.specific_location = vd['specificLocation'].strip()
        if 'eventDate' in vd: item.event_date = vd['eventDate']
        if 'publicDescription' in vd: item.public_description = vd['publicDescription'].strip()
        if 'primaryImageUrl' in vd: item.primary_image_url = vd['primaryImageUrl'].strip()
        if 'additionalImages' in vd: item.additional_images = vd['additionalImages']

        item.save()
        return Response(PublicItemSerializer(item, context={'request': request}).data, status=status.HTTP_200_OK)

class CreateItemReportAPIView(APIView):
    """Submit a LOST or FOUND property report."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Items'],
        summary='Create Lost or Found Report',
        request=CreateReportSerializer,
        responses={201: PublicItemSerializer},
    )
    def post(self, request, item_type='LOST'):
        data = request.data.copy()
        if 'itemType' not in data:
            data['itemType'] = item_type.upper()

        serializer = CreateReportSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        category = vd['category']
        location = vd['location']
        retention_days = category.default_retention_days or 90
        retention_expires_at = datetime.now(timezone.utc) + timedelta(days=retention_days)

        with transaction.atomic():
            # Serialize count-and-create for this account. PostgreSQL holds this
            # user-row lock until commit, so simultaneous requests cannot both
            # observe the same remaining allowance and exceed the cap.
            if vd['itemType'] == ItemType.LOST and is_student_reporter(request.user):
                User.objects.select_for_update().only('id').get(pk=request.user.pk)
                allowance = get_student_daily_lost_report_allowance(request.user)
                if allowance['remaining'] <= 0:
                    return Response(
                        {
                            'success': False,
                            'statusCode': status.HTTP_429_TOO_MANY_REQUESTS,
                            'error': {
                                'code': 'DAILY_LOST_REPORT_LIMIT_REACHED',
                                'message': (
                                    'Daily limit reached. You can submit new lost-item reports tomorrow.'
                                ),
                            },
                        },
                        status=status.HTTP_429_TOO_MANY_REQUESTS,
                    )

            ref_no = generate_reference_number(vd['itemType'])
            item = Item.objects.create(
                reference_number=ref_no,
                item_type=vd['itemType'],
                title=vd['title'].strip(),
                public_description=vd['publicDescription'].strip(),
                category=category,
                location=location,
                specific_location=vd['specificLocation'].strip(),
                event_date=vd['eventDate'],
                primary_image_url=vd.get('primaryImageUrl', ''),
                additional_images=vd.get('additionalImages', []),
                status=ItemStatus.REPORTED,
                reported_by=request.user,
                retention_expires_at=retention_expires_at,
            )

            # Private vault encryption if provided
            private_details = vd.get('privateIdentifyingDetails', '').strip()
            if private_details:
                vault = PrivateDetail(
                    item=item,
                    fields_summary=['privateIdentifyingDetails'],
                )
                vault.set_secret_payload({'privateDetails': private_details})
                vault.save()

            # Verification challenges if provided
            for q in vd.get('verificationQuestions', []):
                q_text = q.get('questionText', '').strip()
                ans_text = q.get('expectedAnswer', '').strip()
                if q_text and ans_text:
                    challenge = VerificationChallenge(
                        item=item,
                        question_text=q_text,
                    )
                    challenge.set_answer(ans_text)
                    challenge.save()

            # Audit log report creation
            audit_action = AuditAction.ITEM_REPORT_LOST if item.item_type == ItemType.LOST else AuditAction.ITEM_REPORT_FOUND
            AuditEntry.objects.create(
                actor=request.user,
                actor_role=request.user.role,
                action=audit_action,
                target_entity='Item',
                target_id=str(item.id),
                ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                metadata={'referenceNumber': ref_no, 'title': item.title},
            )

        res_serializer = PublicItemSerializer(item, context={'request': request})
        return Response(res_serializer.data, status=status.HTTP_201_CREATED)

class UpdateItemReportAPIView(APIView):
    """Update report details by the original author."""
    permission_classes = [IsAuthenticated, IsRecordOwner]

    @extend_schema(
        tags=['Items'],
        summary='Update Item Report',
        request=UpdateReportSerializer,
        responses={200: PublicItemSerializer},
    )
    def patch(self, request, pk):
        try:
            item = Item.objects.get(pk=pk)
        except Item.DoesNotExist:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Item not found.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        self.check_object_permissions(request, item)

        serializer = UpdateReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        if 'title' in vd: item.title = vd['title'].strip()
        if 'category' in vd: item.category = vd['category']
        if 'location' in vd: item.location = vd['location']
        if 'specificLocation' in vd: item.specific_location = vd['specificLocation'].strip()
        if 'eventDate' in vd: item.event_date = vd['eventDate']
        if 'publicDescription' in vd: item.public_description = vd['publicDescription'].strip()
        if 'primaryImageUrl' in vd: item.primary_image_url = vd['primaryImageUrl'].strip()
        if 'additionalImages' in vd: item.additional_images = vd['additionalImages']

        item.save()
        return Response(PublicItemSerializer(item, context={'request': request}).data, status=status.HTTP_200_OK)

class WithdrawItemReportAPIView(APIView):
    """Soft-withdraw an eligible report owned by the authenticated student or staff member."""
    permission_classes = [IsAuthenticated, IsStudentOrStaff]

    @extend_schema(
        tags=['Items'],
        summary='Withdraw Own Lost or Found Report',
        responses={200: OpenApiResponse(description='Report withdrawn or already withdrawn')},
    )
    def delete(self, request, pk):
        try:
            item_id = uuid.UUID(str(pk))
        except (ValueError, AttributeError):
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Report not found.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            item = Item.objects.select_for_update().select_related('reported_by').filter(pk=item_id).first()
            if not item:
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_404_NOT_FOUND,
                        'error': {'code': 'NOT_FOUND', 'message': 'Report not found.'},
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            if item.reported_by_id != request.user.id:
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_403_FORBIDDEN,
                        'error': {'code': 'FORBIDDEN', 'message': 'You can withdraw only reports you created.'},
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            if item.is_archived:
                return Response(
                    {
                        'success': True,
                        'alreadyWithdrawn': True,
                        'reportId': str(item.id),
                        'message': 'This report is already withdrawn or archived.',
                    },
                    status=status.HTTP_200_OK,
                )

            active_claim_statuses = (
                ClaimStatus.SUBMITTED,
                ClaimStatus.UNDER_REVIEW,
                ClaimStatus.CHALLENGE_REQUIRED,
                ClaimStatus.APPROVED,
                ClaimStatus.COMPLETED,
            )
            if Claim.objects.filter(item=item, claim_status__in=active_claim_statuses).exists():
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_409_CONFLICT,
                        'error': {
                            'code': 'ACTIVE_CLAIM',
                            'message': 'This report has an active or approved ownership claim. Continue through the existing claim and security review process.',
                        },
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            if Handover.objects.filter(item=item).exists():
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_409_CONFLICT,
                        'error': {
                            'code': 'HANDOVER_DEPENDENCY',
                            'message': 'This report is linked to a supervised release or handover and cannot be withdrawn here. Continue through the existing security handover process.',
                        },
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            if CustodyRecord.objects.filter(item=item).exists():
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_409_CONFLICT,
                        'error': {
                            'code': 'CUSTODY_DEPENDENCY',
                            'message': 'Security has recorded custody activity for this report. Please continue through the existing security process.',
                        },
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            accepted_match = MatchSuggestion.objects.filter(
                status=MatchStatus.ACCEPTED,
            ).filter(Q(lost_item=item) | Q(found_item=item)).exists()
            if accepted_match:
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_409_CONFLICT,
                        'error': {
                            'code': 'ACTIVE_MATCH',
                            'message': 'This report is part of an accepted item match. Continue through the existing ownership process or contact campus security.',
                        },
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            withdrawable_statuses = (ItemStatus.REPORTED, ItemStatus.MATCH_PENDING)
            if item.status not in withdrawable_statuses:
                return Response(
                    {
                        'success': False,
                        'statusCode': status.HTTP_409_CONFLICT,
                        'error': {
                            'code': 'REPORT_WORKFLOW_ACTIVE',
                            'message': 'This report has entered a security or resolution workflow and cannot be withdrawn here. Continue through the existing claim, custody, or handover process.',
                        },
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            withdrawal_time = django_timezone.now()
            previous_status = item.status
            item.is_archived = True
            item.save(update_fields=['is_archived', 'updated_at'])

            AuditEntry.objects.create(
                actor=request.user,
                actor_role=request.user.role,
                action=AuditAction.ITEM_REPORT_WITHDRAW,
                target_entity='Item',
                target_id=str(item.id),
                ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                timestamp=withdrawal_time,
                metadata={
                    'itemType': item.item_type,
                    'referenceNumber': item.reference_number,
                    'previousStatus': previous_status,
                    'withdrawalStatus': 'WITHDRAWN',
                    'withdrawnAt': withdrawal_time.isoformat(),
                },
            )

        return Response(
            {
                'success': True,
                'reportId': str(item.id),
                'referenceNumber': item.reference_number,
                'withdrawalStatus': 'WITHDRAWN',
                'withdrawnAt': withdrawal_time,
                'message': 'Report withdrawn successfully.',
            },
            status=status.HTTP_200_OK,
        )

class MyReportsAPIView(APIView):
    """Retrieve items submitted by currently authenticated user."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Items'],
        summary='Get My Reports',
        responses={200: PublicItemSerializer(many=True)},
    )
    def get(self, request):
        items = Item.objects.filter(reported_by=request.user, is_archived=False).select_related('category', 'location').order_by('-created_at')
        serializer = PublicItemSerializer(items, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

class ImageUploadAPIView(APIView):
    """Upload and process photograph (EXIF stripping, resizing, WebP conversion)."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(
        tags=['Items'],
        summary='Upload Photograph',
        responses={201: OpenApiResponse(description='Processed image metadata')},
    )
    def post(self, request):
        uploaded_file = request.FILES.get('image') or request.FILES.get('file')
        if not uploaded_file:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_400_BAD_REQUEST,
                    'error': {'code': 'VALIDATION_ERROR', 'message': 'No image file uploaded.'},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        base_url = request.build_absolute_uri('/')[:-1]
        try:
            processed = process_and_store_image(uploaded_file, base_url=base_url)
            return Response(processed, status=status.HTTP_201_CREATED)
        except ValidationError:
            raise
        except (IOError, OSError) as e:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_503_SERVICE_UNAVAILABLE,
                    'error': {'code': 'STORAGE_UNAVAILABLE', 'message': f'Media storage unavailable: {e}'},
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

class ItemChallengesAPIView(APIView):
    """Retrieve public challenge questions for an item without answers."""
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Items'],
        summary='Get Item Verification Challenges',
        responses={200: PublicChallengeSerializer(many=True)},
    )
    def get(self, request, pk):
        challenges = VerificationChallenge.objects.filter(item_id=pk, is_active=True).order_by('created_at')
        serializer = PublicChallengeSerializer(challenges, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

class PrivateVaultViewAPIView(APIView):
    """Security-only decrypted private vault inspection."""
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Items'],
        summary='View Decrypted Private Vault',
        responses={200: PrivateVaultResponseSerializer},
    )
    def post(self, request, pk):
        try:
            vault = PrivateDetail.objects.get(item_id=pk)
        except PrivateDetail.DoesNotExist:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'No private vault record for this item.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        decrypted = vault.get_decrypted_payload()
        vault.access_count += 1
        vault.last_decrypted_by = request.user
        vault.last_decrypted_at = datetime.now(timezone.utc)
        vault.save()

        # Audit log access
        AuditEntry.objects.create(
            actor=request.user,
            actor_role=request.user.role,
            action=AuditAction.PRIVATE_VAULT_VIEW,
            target_entity='PrivateDetail',
            target_id=str(vault.id),
            ip_address=request.META.get('REMOTE_ADDR', '127.0.0.1'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'itemId': str(pk)},
        )

        return Response({
            'fieldsSummary': vault.fields_summary,
            'decryptedContent': decrypted,
            'accessCount': vault.access_count,
        }, status=status.HTTP_200_OK)
