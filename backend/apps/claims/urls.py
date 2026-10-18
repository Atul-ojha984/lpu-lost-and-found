"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Claims App URLs
==============================================================================
"""

from django.urls import path
from .views import (
    ClaimCreateAPIView,
    MyClaimsAPIView,
    PendingClaimsQueueAPIView,
    ItemClaimsAPIView,
    ClaimAnswerChallengeAPIView,
    ReviewClaimAPIView,
)

urlpatterns = [
    path('', ClaimCreateAPIView.as_view(), name='claim-create'),
    path('my-claims/', MyClaimsAPIView.as_view(), name='my-claims'),
    path('my-claims', MyClaimsAPIView.as_view(), name='my-claims-no-slash'),
    path('pending/', PendingClaimsQueueAPIView.as_view(), name='pending-claims'),
    path('pending', PendingClaimsQueueAPIView.as_view(), name='pending-claims-no-slash'),
    path('item/<str:item_id>/', ItemClaimsAPIView.as_view(), name='item-claims'),
    path('item/<str:item_id>', ItemClaimsAPIView.as_view(), name='item-claims-no-slash'),
    path('<str:pk>/challenges/<str:challenge_id>/answer/', ClaimAnswerChallengeAPIView.as_view(), name='answer-challenge'),
    path('<str:pk>/challenges/<str:challenge_id>/answer', ClaimAnswerChallengeAPIView.as_view(), name='answer-challenge-no-slash'),
    path('<str:pk>/review/', ReviewClaimAPIView.as_view(), name='review-claim'),
    path('<str:pk>/review', ReviewClaimAPIView.as_view(), name='review-claim-no-slash'),
]
