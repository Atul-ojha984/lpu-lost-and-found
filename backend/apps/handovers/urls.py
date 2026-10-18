"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Handovers App URLs
==============================================================================
"""

from django.urls import path
from .views import PendingHandoversAPIView, VerifyOtpHandoverAPIView

urlpatterns = [
    path('pending/', PendingHandoversAPIView.as_view(), name='handover-pending-slash'),
    path('pending', PendingHandoversAPIView.as_view(), name='handover-pending'),
    path('verify-otp/', VerifyOtpHandoverAPIView.as_view(), name='handover-verify-otp-slash'),
    path('verify-otp', VerifyOtpHandoverAPIView.as_view(), name='handover-verify-otp'),
]
