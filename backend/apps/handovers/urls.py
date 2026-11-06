"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Handovers App URLs
==============================================================================
"""

from django.urls import path
from .direct_recovery import (
    DirectRecoveryListCreateAPIView,
    DirectRecoveryHistoryAPIView,
    DirectRecoveryReviewAPIView,
    DirectRecoverySlipAPIView,
    DirectRecoveryVerifyOtpAPIView,
    EligibleLostReportsForDirectRecoveryAPIView,
    MyDirectRecoveriesAPIView,
)
from .views import HandoverSlipAPIView, MyRecoveryHistoryAPIView, PendingHandoversAPIView, VerifyOtpHandoverAPIView

urlpatterns = [
    path('direct-reports/', EligibleLostReportsForDirectRecoveryAPIView.as_view(), name='direct-recovery-reports'),
    path('direct-reports', EligibleLostReportsForDirectRecoveryAPIView.as_view(), name='direct-recovery-reports-no-slash'),
    path('direct-recoveries/my/', MyDirectRecoveriesAPIView.as_view(), name='my-direct-recoveries'),
    path('direct-recoveries/my', MyDirectRecoveriesAPIView.as_view(), name='my-direct-recoveries-no-slash'),
    path('direct-recoveries/history/', DirectRecoveryHistoryAPIView.as_view(), name='direct-recovery-history'),
    path('direct-recoveries/history', DirectRecoveryHistoryAPIView.as_view(), name='direct-recovery-history-no-slash'),
    path('direct-recoveries/', DirectRecoveryListCreateAPIView.as_view(), name='direct-recovery-list-create'),
    path('direct-recoveries', DirectRecoveryListCreateAPIView.as_view(), name='direct-recovery-list-create-no-slash'),
    path('direct-recoveries/<uuid:direct_recovery_id>/review/', DirectRecoveryReviewAPIView.as_view(), name='direct-recovery-review'),
    path('direct-recoveries/<uuid:direct_recovery_id>/review', DirectRecoveryReviewAPIView.as_view(), name='direct-recovery-review-no-slash'),
    path('direct-recoveries/<uuid:direct_recovery_id>/verify-otp/', DirectRecoveryVerifyOtpAPIView.as_view(), name='direct-recovery-verify-otp'),
    path('direct-recoveries/<uuid:direct_recovery_id>/verify-otp', DirectRecoveryVerifyOtpAPIView.as_view(), name='direct-recovery-verify-otp-no-slash'),
    path('direct-recoveries/<uuid:direct_recovery_id>/slip/', DirectRecoverySlipAPIView.as_view(), name='direct-recovery-slip'),
    path('direct-recoveries/<uuid:direct_recovery_id>/slip', DirectRecoverySlipAPIView.as_view(), name='direct-recovery-slip-no-slash'),
    path('<uuid:handover_id>/slip/', HandoverSlipAPIView.as_view(), name='handover-slip'),
    path('<uuid:handover_id>/slip', HandoverSlipAPIView.as_view(), name='handover-slip-no-slash'),
    path('my-recovery-history/', MyRecoveryHistoryAPIView.as_view(), name='my-recovery-history'),
    path('my-recovery-history', MyRecoveryHistoryAPIView.as_view(), name='my-recovery-history-no-slash'),
    path('pending/', PendingHandoversAPIView.as_view(), name='handover-pending-slash'),
    path('pending', PendingHandoversAPIView.as_view(), name='handover-pending'),
    path('verify-otp/', VerifyOtpHandoverAPIView.as_view(), name='handover-verify-otp-slash'),
    path('verify-otp', VerifyOtpHandoverAPIView.as_view(), name='handover-verify-otp'),
]
