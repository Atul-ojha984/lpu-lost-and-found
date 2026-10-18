"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Matching App URLs
==============================================================================
"""

from django.urls import path
from .views import RefreshAllMatchesAPIView

urlpatterns = [
    path('refresh-all/', RefreshAllMatchesAPIView.as_view(), name='refresh-all-matches'),
    path('refresh-all', RefreshAllMatchesAPIView.as_view(), name='refresh-all-matches-no-slash'),
]
