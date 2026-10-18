"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Locations App URLs
==============================================================================
"""

from django.urls import path
from .views import PublicLocationListAPIView

urlpatterns = [
    path('', PublicLocationListAPIView.as_view(), name='location-list'),
]
