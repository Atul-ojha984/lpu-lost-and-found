"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Handovers App URLs
==============================================================================
"""

from django.urls import path
from .views import MyRecoveryHistoryAPIView, PendingHandoversAPIView, VerifyOtpHandoverAPIView

urlpatterns = [
    path('my-recovery-history/', MyRecoveryHistoryAPIView.as_view(), name='my-recovery-history'),
    path('my-recovery-history', MyRecoveryHistoryAPIView.as_view(), name='my-recovery-history-no-slash'),
    path('pending/', PendingHandoversAPIView.as_view(), name='handover-pending-slash'),
    path('pending', PendingHandoversAPIView.as_view(), name='handover-pending'),
    path('verify-otp/', VerifyOtpHandoverAPIView.as_view(), name='handover-verify-otp-slash'),
    path('verify-otp', VerifyOtpHandoverAPIView.as_view(), name='handover-verify-otp'),
]
