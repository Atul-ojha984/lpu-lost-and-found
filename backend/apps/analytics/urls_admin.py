"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Administrative Master URLs
==============================================================================
"""

from django.urls import path
from apps.items.views import AdminCategoryListCreateAPIView, AdminCategoryDetailAPIView
from apps.locations.views import AdminLocationListCreateAPIView, AdminLocationDetailAPIView
from apps.audit.views import AdminAuditLogsAPIView
from .views import (
    AdminAnalyticsAPIView,
    AdminAgeingQueueAPIView,
    AdminDisposalApproveAPIView,
    AdminUsersAPIView,
    AdminUserDetailAPIView,
    AdminInventoryAPIView,
)

urlpatterns = [
    # Read-only cross-portal view of security inventory and locker state
    path('inventory/', AdminInventoryAPIView.as_view(), name='admin-inventory-slash'),
    path('inventory', AdminInventoryAPIView.as_view(), name='admin-inventory'),

    # Analytics Engine
    path('analytics/', AdminAnalyticsAPIView.as_view(), name='admin-analytics-slash'),
    path('analytics', AdminAnalyticsAPIView.as_view(), name='admin-analytics'),

    # Retention & Ageing Queue
    path('retention/queue/', AdminAgeingQueueAPIView.as_view(), name='admin-retention-queue-slash'),
    path('retention/queue', AdminAgeingQueueAPIView.as_view(), name='admin-retention-queue'),

    # Disposal Approval
    path('disposal/approve/', AdminDisposalApproveAPIView.as_view(), name='admin-disposal-approve-slash'),
    path('disposal/approve', AdminDisposalApproveAPIView.as_view(), name='admin-disposal-approve'),

    # Users Governance
    path('users/', AdminUsersAPIView.as_view(), name='admin-users-slash'),
    path('users', AdminUsersAPIView.as_view(), name='admin-users'),
    path('users/<uuid:pk>/', AdminUserDetailAPIView.as_view(), name='admin-user-detail-slash'),
    path('users/<uuid:pk>', AdminUserDetailAPIView.as_view(), name='admin-user-detail'),

    # Categories Management
    path('categories/', AdminCategoryListCreateAPIView.as_view(), name='admin-categories-slash'),
    path('categories', AdminCategoryListCreateAPIView.as_view(), name='admin-categories'),
    path('categories/<uuid:pk>/', AdminCategoryDetailAPIView.as_view(), name='admin-category-detail-slash'),
    path('categories/<uuid:pk>', AdminCategoryDetailAPIView.as_view(), name='admin-category-detail'),

    # Locations Management
    path('locations/', AdminLocationListCreateAPIView.as_view(), name='admin-locations-slash'),
    path('locations', AdminLocationListCreateAPIView.as_view(), name='admin-locations'),
    path('locations/<uuid:pk>/', AdminLocationDetailAPIView.as_view(), name='admin-location-detail-slash'),
    path('locations/<uuid:pk>', AdminLocationDetailAPIView.as_view(), name='admin-location-detail'),

    # Audit Logs
    path('audit-logs/', AdminAuditLogsAPIView.as_view(), name='admin-audit-logs-slash'),
    path('audit-logs', AdminAuditLogsAPIView.as_view(), name='admin-audit-logs'),
]
