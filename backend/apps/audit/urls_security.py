"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Security Operations URLs
==============================================================================
"""

from django.urls import path
from .views import SecurityDashboardStatsAPIView, SecurityAuditTrailAPIView

urlpatterns = [
    path('dashboard-stats/', SecurityDashboardStatsAPIView.as_view(), name='security-dashboard-stats-slash'),
    path('dashboard-stats', SecurityDashboardStatsAPIView.as_view(), name='security-dashboard-stats'),
    path('audit-trail/', SecurityAuditTrailAPIView.as_view(), name='security-audit-trail-slash'),
    path('audit-trail', SecurityAuditTrailAPIView.as_view(), name='security-audit-trail'),
]
