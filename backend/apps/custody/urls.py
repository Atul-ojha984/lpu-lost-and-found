"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Custody App URLs
==============================================================================
"""

from django.urls import path
from .views import (
    CustodyInventoryAPIView,
    CustodyTransferAPIView,
    ItemCustodyHistoryAPIView,
    LockerListCreateAPIView,
    LockerDetailAPIView,
    LockerAssignmentAPIView,
    CustodyLocationListCreateAPIView,
    CustodyLocationDetailAPIView,
)

urlpatterns = [
    path('locations/', CustodyLocationListCreateAPIView.as_view(), name='custody-location-list-create'),
    path('locations', CustodyLocationListCreateAPIView.as_view(), name='custody-location-list-create-no-slash'),
    path('locations/<uuid:location_id>/', CustodyLocationDetailAPIView.as_view(), name='custody-location-detail'),
    path('locations/<uuid:location_id>', CustodyLocationDetailAPIView.as_view(), name='custody-location-detail-no-slash'),
    path('inventory/', CustodyInventoryAPIView.as_view(), name='custody-inventory'),
    path('inventory', CustodyInventoryAPIView.as_view(), name='custody-inventory-no-slash'),
    path('lockers/', LockerListCreateAPIView.as_view(), name='locker-list-create'),
    path('lockers', LockerListCreateAPIView.as_view(), name='locker-list-create-no-slash'),
    path('lockers/<uuid:locker_id>/', LockerDetailAPIView.as_view(), name='locker-detail'),
    path('lockers/<uuid:locker_id>', LockerDetailAPIView.as_view(), name='locker-detail-no-slash'),
    path('assign-locker/', LockerAssignmentAPIView.as_view(), name='locker-assignment'),
    path('assign-locker', LockerAssignmentAPIView.as_view(), name='locker-assignment-no-slash'),
    path('transfer/', CustodyTransferAPIView.as_view(), name='custody-transfer'),
    path('transfer', CustodyTransferAPIView.as_view(), name='custody-transfer-no-slash'),
    path('items/<str:item_id>/history/', ItemCustodyHistoryAPIView.as_view(), name='item-custody-history'),
    path('items/<str:item_id>/history', ItemCustodyHistoryAPIView.as_view(), name='item-custody-history-no-slash'),
]
