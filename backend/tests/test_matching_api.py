"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Test Suite: Matching Engine APIs, 4-Factor Deterministic Scoring & Refresh
==============================================================================
"""

import pytest
from datetime import datetime, timezone, timedelta
from rest_framework.test import APIClient
from rest_framework import status

from apps.accounts.models import User, UserRole
from apps.items.models import ItemCategory, Item, ItemType, ItemStatus
from apps.locations.models import Location
from apps.matching.models import MatchSuggestion

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def matching_setup(db):
    user = User.objects.create_user(
        email='student.matcher@lpu.in',
        registration_number='12103001',
        full_name='Matcher Student',
        password='Password123!',
        role=UserRole.STUDENT_STAFF,
    )
    admin = User.objects.create_user(
        email='admin.matcher@lpu.in',
        registration_number='ADM3001',
        full_name='Matcher Admin',
        password='Password123!',
        role=UserRole.CAMPUS_ADMIN,
    )

    cat_bags = ItemCategory.objects.create(code='BAGS', name='Bags & Backpacks')
    loc_bh1 = Location.objects.create(code='BH_1', name='Boys Hostel 1', campus_zone='RESIDENTIAL')

    now = datetime.now(timezone.utc)

    # Lost Report
    lost_bag = Item.objects.create(
        reference_number='LPU-L-20261018-1001',
        item_type=ItemType.LOST,
        title='Black Wildcraft Backpack',
        category=cat_bags,
        location=loc_bh1,
        specific_location='Common Room Ground Floor',
        event_date=now - timedelta(hours=4),
        public_description='Black Wildcraft 35L waterproof backpack with red zipper',
        status=ItemStatus.REPORTED,
        reported_by=user,
        retention_expires_at=now + timedelta(days=90),
    )

    # Found Report closely matching
    found_bag = Item.objects.create(
        reference_number='LPU-F-20261018-1002',
        item_type=ItemType.FOUND,
        title='Found Black Wildcraft Bag',
        category=cat_bags,
        location=loc_bh1,
        specific_location='Hostel 1 Mess entrance',
        event_date=now - timedelta(hours=3),
        public_description='Wildcraft backpack black color with red zipper found',
        status=ItemStatus.IN_CUSTODY,
        reported_by=user,
        retention_expires_at=now + timedelta(days=90),
    )

    return {
        'user': user,
        'admin': admin,
        'lost_bag': lost_bag,
        'found_bag': found_bag,
    }

@pytest.mark.django_db
def test_matching_refresh_and_retrieval(api_client, matching_setup):
    """Test generating match suggestions with deterministic scoring."""
    lost_bag = matching_setup['lost_bag']
    found_bag = matching_setup['found_bag']

    # 1. Refresh matches for lost item (requires owner or security)
    api_client.force_authenticate(user=matching_setup['user'])
    res = api_client.post(f"/api/v1/items/{lost_bag.id}/matches/refresh/")
    assert res.status_code == status.HTTP_200_OK
    assert 'count' in res.data

    # 2. Query matches
    res_get = api_client.get(f"/api/v1/items/{lost_bag.id}/matches/")
    assert res_get.status_code == status.HTTP_200_OK
    matches = res_get.data
    assert len(matches) >= 1

    top_match = matches[0]
    assert top_match['matchScore'] >= 50.0
    assert 'HIGH' in top_match['confidence'] or 'MEDIUM' in top_match['confidence']
    assert 'categoryMatch' in top_match['explanation']
    assert 'category' in top_match['explanation']['categoryMatch'].lower()

@pytest.mark.django_db
def test_refresh_all_matches_administrative(api_client, matching_setup):
    """Admin endpoint to refresh matches across the entire catalog."""
    api_client.force_authenticate(user=matching_setup['admin'])

    res = api_client.post('/api/v1/matches/refresh-all/')
    assert res.status_code == status.HTTP_200_OK
    assert 'totalSuggestionsGenerated' in res.data
