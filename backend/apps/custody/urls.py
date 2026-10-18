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
)

urlpatterns = [
    path('inventory/', CustodyInventoryAPIView.as_view(), name='custody-inventory'),
    path('inventory', CustodyInventoryAPIView.as_view(), name='custody-inventory-no-slash'),
    path('transfer/', CustodyTransferAPIView.as_view(), name='custody-transfer'),
    path('transfer', CustodyTransferAPIView.as_view(), name='custody-transfer-no-slash'),
    path('items/<str:item_id>/history/', ItemCustodyHistoryAPIView.as_view(), name='item-custody-history'),
    path('items/<str:item_id>/history', ItemCustodyHistoryAPIView.as_view(), name='item-custody-history-no-slash'),
]
