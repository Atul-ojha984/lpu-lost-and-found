"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Analytics & Retention Queue Services
==============================================================================
"""

from datetime import datetime, timezone
from django.db.models import Count, Q
from apps.items.models import Item, ItemType, ItemStatus
from apps.claims.models import Claim, ClaimStatus
from apps.audit.models import AuditEntry

def get_analytics_dashboard():
    """
    Calculate campus lost & found metrics strictly from database records.
    Definitions are transparently documented to avoid hardcoded totals.
    """
    now = datetime.now(timezone.utc)

    # 1. Report counts
    total_lost = Item.objects.filter(item_type=ItemType.LOST).count()
    total_found = Item.objects.filter(item_type=ItemType.FOUND).count()
    total_reports = Item.objects.count()

    # 2. Returns and Return Rate
    items_returned = Item.objects.filter(status=ItemStatus.HANDED_OVER).count()
    return_rate_percent = (
        round((items_returned / total_found) * 100, 1) if total_found > 0 else 0.0
    )

    # 3. Median Time to Return (calculated from completed handed-over items)
    returned_items = Item.objects.filter(status=ItemStatus.HANDED_OVER).values('created_at', 'updated_at')
    median_time_to_return_hours = 0.0
    if returned_items.exists():
        durations = []
        for it in returned_items:
            diff_sec = (it['updated_at'] - it['created_at']).total_seconds()
            durations.append(max(0.0, diff_sec / 3600.0))
        durations.sort()
        mid = len(durations) // 2
        if len(durations) % 2 == 0:
            median_time_to_return_hours = round((durations[mid - 1] + durations[mid]) / 2.0, 1)
        else:
            median_time_to_return_hours = round(durations[mid], 1)
    median_time_to_return_days = round(median_time_to_return_hours / 24.0, 1)

    # 4. Pending Claims and Verification Failures
    pending_claims = Claim.objects.filter(
        claim_status__in=[
            ClaimStatus.SUBMITTED,
            ClaimStatus.UNDER_REVIEW,
            ClaimStatus.CHALLENGE_REQUIRED,
            ClaimStatus.APPROVED,
        ]
    ).count()

    failed_challenges_count = AuditEntry.objects.filter(
        action='VERIFICATION_CHALLENGE_EVALUATE',
        metadata__outcome='FAILED',
    ).count()

    failed_handover_otps_count = AuditEntry.objects.filter(
        action='HANDOVER_OTP_FAILED'
    ).count()

    rejected_claims_count = Claim.objects.filter(
        claim_status=ClaimStatus.REJECTED
    ).count()

    total_verification_failures = (
        failed_challenges_count + failed_handover_otps_count + rejected_claims_count
    )

    # 5. Inventory by Custody Location (Items currently in physical custody)
    custody_entries = (
        Item.objects.filter(
            status__in=[ItemStatus.IN_CUSTODY, ItemStatus.READY_FOR_HANDOVER]
        )
        .values('current_custody_desk')
        .annotate(count=Count('id'))
        .order_by('-count')
    )
    inventory_by_custody_location = [
        {
            'desk': entry['current_custody_desk'] or 'Central Security Repository',
            'count': entry['count'],
        }
        for entry in custody_entries
    ]
    total_unclaimed_in_custody = sum(entry['count'] for entry in custody_entries)

    # 6. Category Distribution
    category_entries = (
        Item.objects.values('category__id', 'category__code', 'category__name')
        .annotate(count=Count('id'))
        .order_by('-count')
    )
    category_distribution = []
    for entry in category_entries:
        cnt = entry['count']
        pct = round((cnt / total_reports) * 100, 1) if total_reports > 0 else 0.0
        category_distribution.append({
            'categoryId': str(entry['category__id']) if entry['category__id'] else 'unknown',
            'categoryCode': entry['category__code'] or 'OTHER',
            'categoryName': entry['category__name'] or 'Uncategorized',
            'count': cnt,
            'percentage': pct,
        })

    # 7. Campus Location and Time Hotspots
    location_entries = (
        Item.objects.values('location__id', 'location__name', 'location__campus_zone', 'location__building_name')
        .annotate(
            total_count=Count('id'),
            lost_count=Count('id', filter=Q(item_type=ItemType.LOST)),
            found_count=Count('id', filter=Q(item_type=ItemType.FOUND)),
        )
        .order_by('-total_count')[:10]
    )
    location_hotspots = [
        {
            'locationId': str(entry['location__id']) if entry['location__id'] else 'unknown',
            'name': entry['location__name'] or 'Campus Unknown',
            'campusZone': entry['location__campus_zone'] or 'Central Zone',
            'buildingName': entry['location__building_name'] or '',
            'totalCount': entry['total_count'],
            'lostCount': entry['lost_count'],
            'foundCount': entry['found_count'],
        }
        for entry in location_entries
    ]

    # Time hotspots by hour of day (0-23)
    hourly_counts = {h: 0 for h in range(24)}
    for event_dt in Item.objects.values_list('event_date', flat=True):
        if event_dt:
            hourly_counts[event_dt.hour] += 1
    time_hotspots = [{'hour': h, 'count': hourly_counts[h]} for h in range(24)]

    # 8. Unclaimed Item Volume and Ageing Brackets
    unclaimed_found_items = Item.objects.filter(
        item_type=ItemType.FOUND,
        status__in=[ItemStatus.IN_CUSTODY, ItemStatus.READY_FOR_HANDOVER, ItemStatus.CLAIM_IN_REVIEW],
    ).only('event_date', 'created_at', 'retention_expires_at')

    ageing_brackets = {
        'under30Days': 0,
        'from31To60Days': 0,
        'from61To90Days': 0,
        'over90Days': 0,
    }

    for it in unclaimed_found_items:
        age_days = (now - it.event_date).days
        if age_days <= 30:
            ageing_brackets['under30Days'] += 1
        elif age_days <= 60:
            ageing_brackets['from31To60Days'] += 1
        elif age_days <= 90:
            ageing_brackets['from61To90Days'] += 1
        else:
            ageing_brackets['over90Days'] += 1

    return {
        'overview': {
            'totalReports': total_reports,
            'totalLost': total_lost,
            'totalFound': total_found,
            'itemsReturned': items_returned,
            'returnRatePercent': return_rate_percent,
            'pendingClaims': pending_claims,
            'totalVerificationFailures': total_verification_failures,
            'totalUnclaimedInCustody': total_unclaimed_in_custody,
        },
        'returnMetrics': {
            'itemsReturned': items_returned,
            'returnRatePercent': return_rate_percent,
            'returnRateDefinition': 'Percentage of reported found items successfully verified and handed over to rightful claimants: (itemsReturned / totalFound) * 100.',
            'medianTimeToReturnHours': median_time_to_return_hours,
            'medianTimeToReturnDays': median_time_to_return_days,
            'medianTimeToReturnDefinition': 'Median elapsed duration between report creation and verified physical custody handover across all returned items.',
        },
        'verificationMetrics': {
            'pendingClaims': pending_claims,
            'totalVerificationFailures': total_verification_failures,
            'failedChallengesCount': failed_challenges_count,
            'failedHandoverOtpsCount': failed_handover_otps_count,
            'rejectedClaimsCount': rejected_claims_count,
            'failureDefinition': 'Sum of failed private ownership challenge attempts, failed OTP handovers, and claims rejected after security review.',
        },
        'custodyInventory': {
            'totalInCustody': total_unclaimed_in_custody,
            'byLocation': inventory_by_custody_location,
        },
        'categoryDistribution': category_distribution,
        'hotspots': {
            'locations': location_hotspots,
            'hourly': time_hotspots,
        },
        'ageing': {
            'brackets': ageing_brackets,
            'statutoryRetentionPeriodDays': 90,
            'ageingDefinition': 'Distribution of unclaimed items by age from event date. Items exceeding category retention threshold require administrative committee approval before disposal.',
        },
    }

def get_ageing_queue(params: dict):
    """
    Get Ageing Queue with escalation states for campus custody items.
    Escalation states:
    - IN_RETENTION: > 15 days until statutory expiry
    - NOTICE_PERIOD: Within 15 days before or after retention expiry
    - DISPOSAL_PENDING: > 15 days overdue past retention, awaiting administrative review
    - DISPOSED: Item has undergone formal approved disposal
    """
    page = max(1, int(params.get('page') or 1))
    limit = min(100, max(1, int(params.get('limit') or 20)))
    now = datetime.now(timezone.utc)

    queryset = Item.objects.filter(
        item_type=ItemType.FOUND,
        status__in=[
            ItemStatus.IN_CUSTODY,
            ItemStatus.READY_FOR_HANDOVER,
            ItemStatus.CLAIM_IN_REVIEW,
            ItemStatus.HANDED_OVER,
            ItemStatus.DISPOSED,
        ],
    ).select_related('category', 'location', 'reported_by').order_by('event_date', 'id')

    search = params.get('search')
    if search and search.strip():
        term = search.strip()
        queryset = queryset.filter(
            Q(reference_number__icontains=term) |
            Q(title__icontains=term) |
            Q(current_custody_desk__icontains=term)
        )

    category = params.get('category')
    if category and category.strip() and category != 'ALL':
        if len(category) == 36:
            queryset = queryset.filter(category_id=category)
        else:
            queryset = queryset.filter(category__code__iexact=category)

    # Process each item with computed ageing metrics and escalation state
    raw_items = list(queryset)
    processed_items = []
    counts_by_state = {
        'inRetention': 0,
        'noticePeriod': 0,
        'disposalPending': 0,
        'disposed': 0,
    }

    for item in raw_items:
        days_elapsed = (now - item.event_date).days
        days_until_expiry = (item.retention_expires_at - now).days
        is_retention_expired = item.retention_expires_at <= now

        if item.status == ItemStatus.DISPOSED:
            escalation_state = 'DISPOSED'
            counts_by_state['disposed'] += 1
        elif days_until_expiry > 15:
            escalation_state = 'IN_RETENTION'
            counts_by_state['inRetention'] += 1
        elif -15 <= days_until_expiry <= 15:
            escalation_state = 'NOTICE_PERIOD'
            counts_by_state['noticePeriod'] += 1
        else:
            escalation_state = 'DISPOSAL_PENDING'
            counts_by_state['disposalPending'] += 1

        processed_items.append({
            '_id': str(item.id),
            'id': str(item.id),
            'referenceNumber': item.reference_number,
            'title': item.title,
            'status': item.status,
            'eventDate': item.event_date.isoformat(),
            'retentionExpiresAt': item.retention_expires_at.isoformat(),
            'currentCustodyDesk': item.current_custody_desk,
            'category': {
                '_id': str(item.category.id) if item.category else '',
                'name': item.category.name if item.category else '',
                'code': item.category.code if item.category else '',
                'defaultRetentionDays': item.category.default_retention_days if item.category else 90,
            } if item.category else None,
            'location': {
                '_id': str(item.location.id) if item.location else '',
                'name': item.location.name if item.location else '',
                'campusZone': item.location.campus_zone if item.location else '',
            } if item.location else None,
            'daysElapsed': days_elapsed,
            'daysUntilExpiry': days_until_expiry,
            'isRetentionExpired': is_retention_expired,
            'escalationState': escalation_state,
        })

    escalation_filter = params.get('escalationState')
    if escalation_filter and escalation_filter != 'ALL':
        filtered = [it for it in processed_items if it['escalationState'] == escalation_filter]
    else:
        filtered = processed_items

    total = len(filtered)
    total_pages = max(1, (total + limit - 1) // limit)
    offset = (page - 1) * limit
    paginated_items = filtered[offset:offset + limit]

    return {
        'items': paginated_items,
        'total': total,
        'page': page,
        'limit': limit,
        'totalPages': total_pages,
        'countsByState': counts_by_state,
    }
