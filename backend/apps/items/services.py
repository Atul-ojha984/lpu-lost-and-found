"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Items App Services: Image Processing Pipeline & Reference Number Generator
==============================================================================
"""

import uuid
from datetime import datetime, time, timezone, timedelta
from pathlib import Path
from io import BytesIO
from PIL import Image
from django.conf import settings
from django.utils import timezone as django_timezone
from rest_framework.exceptions import ValidationError
from apps.accounts.models import UserRole, UserType
from apps.core.workflow_concurrency import (
    item_scope,
    retry_transient_mongo_transaction,
    workflow_transaction,
)
from .models import Item, ItemStatus, ItemType

ALLOWED_MIME_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
STUDENT_DAILY_LOST_REPORT_LIMIT = 3
STUDENT_LOST_REPORT_EXPIRY_DAYS = 30


def is_student_reporter(user) -> bool:
    """Return whether this authenticated account is explicitly classified as a student."""
    return bool(
        user
        and getattr(user, 'is_authenticated', False)
        and getattr(user, 'role', None) == UserRole.STUDENT_STAFF
        and getattr(user, 'user_type', None) == UserType.STUDENT
    )


def get_student_daily_lost_report_allowance(user, now=None) -> dict:
    """Count active student lost reports in the configured local calendar day.

    Withdrawn reports are archived and do not count. Terminal records also do
    not count; this keeps recovered, expired, and disposed reports outside the
    active reporting allowance.
    """
    if not is_student_reporter(user):
        return {
            'applies': False,
            'limit': STUDENT_DAILY_LOST_REPORT_LIMIT,
            'submitted': 0,
            'remaining': None,
            'localDate': None,
        }

    reference_time = now or django_timezone.now()
    current_tz = django_timezone.get_current_timezone()
    local_date = django_timezone.localdate(reference_time, timezone=current_tz)
    day_start = django_timezone.make_aware(
        datetime.combine(local_date, time.min),
        timezone=current_tz,
    )
    next_day_start = django_timezone.make_aware(
        datetime.combine(local_date + timedelta(days=1), time.min),
        timezone=current_tz,
    )

    submitted = Item.objects.filter(
        reported_by_id=user.pk,
        item_type=ItemType.LOST,
        is_archived=False,
        created_at__gte=day_start,
        created_at__lt=next_day_start,
    ).exclude(
        status__in=(
            ItemStatus.HANDED_OVER,
            ItemStatus.UNCLAIMED_EXPIRED,
            ItemStatus.EXPIRED,
            ItemStatus.DISPOSED,
        )
    ).count()

    return {
        'applies': True,
        'limit': STUDENT_DAILY_LOST_REPORT_LIMIT,
        'submitted': submitted,
        'remaining': max(0, STUDENT_DAILY_LOST_REPORT_LIMIT - submitted),
        'localDate': local_date.isoformat(),
    }


@retry_transient_mongo_transaction()
def expire_overdue_student_lost_reports(now=None) -> dict:
    """Archive eligible student LOST reports once they reach their 30-day age.

    Candidate items are locked and rechecked in the same transaction as the
    status/archive/audit writes. Claim creation and security custody intake use
    the same item lock, which prevents an expiry sweep from racing those flows.
    """
    from apps.accounts.models import UserRole, UserType
    from apps.audit.models import AuditAction, AuditEntry
    from apps.claims.models import Claim, ClaimStatus
    from apps.custody.models import CustodyRecord
    from apps.handovers.models import Handover
    from apps.matching.models import MatchSuggestion, MatchStatus

    current_time = now or django_timezone.now()
    expiry_deadline = current_time - timedelta(days=STUDENT_LOST_REPORT_EXPIRY_DAYS)
    eligible_statuses = (ItemStatus.REPORTED, ItemStatus.MATCH_PENDING)
    protected_claim_statuses = (
        ClaimStatus.SUBMITTED,
        ClaimStatus.UNDER_REVIEW,
        ClaimStatus.CHALLENGE_REQUIRED,
        ClaimStatus.APPROVED,
        ClaimStatus.COMPLETED,
    )

    candidates = Item.objects.filter(
        reported_by__role=UserRole.STUDENT_STAFF,
        reported_by__user_type=UserType.STUDENT,
        item_type=ItemType.LOST,
        status__in=eligible_statuses,
        is_archived=False,
        created_at__lte=expiry_deadline,
    )

    expired_count = 0
    protected_count = 0
    skipped_count = 0
    last_processed_id = None

    while True:
        batch_query = candidates
        if last_processed_id is not None:
            batch_query = batch_query.filter(pk__gt=last_processed_id)
        item_ids = list(batch_query.order_by('pk').values_list('pk', flat=True)[:500])
        if not item_ids:
            break

        for item_id in item_ids:
            with workflow_transaction(item_scope(item_id)):
                item = Item.objects.filter(pk=item_id).first()
                if (
                    not item
                    or item.is_archived
                    or item.item_type != ItemType.LOST
                    or item.status not in eligible_statuses
                    or item.created_at > expiry_deadline
                    or item.reported_by.role != UserRole.STUDENT_STAFF
                    or item.reported_by.user_type != UserType.STUDENT
                ):
                    skipped_count += 1
                    continue

                has_active_claim = Claim.objects.filter(
                    item_id=item.id,
                    claim_status__in=protected_claim_statuses,
                ).exists()
                has_handover = Handover.objects.filter(item_id=item.id).exists()
                has_custody_history = CustodyRecord.objects.filter(item_id=item.id).exists()
                has_accepted_match = MatchSuggestion.objects.filter(
                    lost_item_id=item.id,
                    status=MatchStatus.ACCEPTED,
                ).exists()

                if has_active_claim or has_handover or has_custody_history or has_accepted_match:
                    protected_count += 1
                    continue

                previous_status = item.status
                item.status = ItemStatus.EXPIRED
                item.is_archived = True
                item.save(update_fields=['status', 'is_archived', 'updated_at'])
                AuditEntry.objects.create(
                    actor=None,
                    actor_role=UserRole.SYSTEM_ADMIN,
                    action=AuditAction.ITEM_REPORT_EXPIRE,
                    target_entity='Item',
                    target_id=str(item.id),
                    ip_address='127.0.0.1',
                    user_agent='scheduled-expiration-command',
                    timestamp=current_time,
                    metadata={
                        'referenceNumber': item.reference_number,
                        'itemType': item.item_type,
                        'previousStatus': previous_status,
                        'expirationDays': STUDENT_LOST_REPORT_EXPIRY_DAYS,
                        'createdAt': item.created_at.isoformat(),
                        'expiredAt': current_time.isoformat(),
                        'message': 'Report expired after 30 days without recovery.',
                    },
                )
                expired_count += 1

        last_processed_id = item_ids[-1]

    return {
        'expired': expired_count,
        'protected': protected_count,
        'skipped': skipped_count,
        'expiryDeadline': expiry_deadline.isoformat(),
    }

def generate_reference_number(item_type: str) -> str:
    """
    Generates a unique university property reference number, e.g. LPU-2026-F10482.
    """
    year = datetime.now(timezone.utc).year
    prefix = 'F' if item_type == 'FOUND' else 'L'
    unique_suffix = str(uuid.uuid4().int)[:5]
    return f"LPU-{year}-{prefix}{unique_suffix}"

def process_and_store_image(uploaded_file, base_url: str = '') -> dict:
    """
    Process photograph using Pillow:
    - Validates size (<= 5MB) and mime type
    - Strips all EXIF, GPS, and camera metadata for privacy
    - Resizes down to fit inside 1200x1200px while maintaining aspect ratio
    - Converts to optimized WebP format
    - Stores into settings.MEDIA_ROOT
    - Returns: { filename, url, mimeType, width, height, sizeBytes }
    """
    if uploaded_file.size > MAX_IMAGE_SIZE_BYTES:
        raise ValidationError(f"File size exceeds 5MB limit ({uploaded_file.size} bytes).")

    try:
        image = Image.open(uploaded_file)
        image.verify()  # Verify image integrity
    except Exception as e:
        raise ValidationError(f"Invalid or corrupted image file: {e}")

    # Re-open after verify()
    uploaded_file.seek(0)
    image = Image.open(uploaded_file)

    # Convert modes (e.g. CMYK, P, RGBA) to RGB or RGBA for WebP
    if image.mode in ('RGBA', 'LA'):
        converted_image = image.convert('RGBA')
    else:
        converted_image = image.convert('RGB')

    # Resize down to 1200x1200px maintaining aspect ratio without enlargement
    converted_image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    width, height = converted_image.size

    # Ensure media directory exists
    media_root = Path(settings.MEDIA_ROOT)
    media_root.mkdir(parents=True, exist_ok=True)

    filename = f"item-{int(datetime.now(timezone.utc).timestamp())}-{uuid.uuid4().hex[:8]}.webp"
    output_path = media_root / filename

    # Save to buffer stripping EXIF (default in Pillow when not passing exif parameter)
    buffer = BytesIO()
    converted_image.save(buffer, format='WEBP', quality=80, method=4)
    buffer.seek(0)

    with open(output_path, 'wb') as f:
        f.write(buffer.getvalue())

    size_bytes = buffer.getbuffer().nbytes
    media_url = getattr(settings, 'MEDIA_URL', '/media/')
    relative_url = f"{media_url.rstrip('/')}/{filename}"
    url = f"{base_url.rstrip('/')}{relative_url}" if base_url else relative_url

    return {
        'filename': filename,
        'url': url,
        'mimeType': 'image/webp',
        'width': width,
        'height': height,
        'sizeBytes': size_bytes,
    }
