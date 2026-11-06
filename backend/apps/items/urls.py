"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Items App URLs
==============================================================================
"""

from django.urls import path
from .views import (
    ItemPublicBoardAPIView,
    ItemDetailAPIView,
    DailyLostReportLimitAPIView,
    CreateItemReportAPIView,
    WithdrawItemReportAPIView,
    MyReportsAPIView,
    ImageUploadAPIView,
    ItemChallengesAPIView,
    PrivateVaultViewAPIView,
)
from apps.matching.views import (
    ItemMatchesAPIView,
    ItemMatchesRefreshAPIView,
)

urlpatterns = [
    # Authenticated search board with dynamic multi-filtering and pagination
    path('', ItemPublicBoardAPIView.as_view(), name='item-list'),
    
    # Authenticated user filed reports
    path('my-reports/', MyReportsAPIView.as_view(), name='my-reports'),
    path('my-reports', MyReportsAPIView.as_view(), name='my-reports-no-slash'),
    path('daily-lost-report-limit/', DailyLostReportLimitAPIView.as_view(), name='daily-lost-report-limit'),
    path('daily-lost-report-limit', DailyLostReportLimitAPIView.as_view(), name='daily-lost-report-limit-no-slash'),
    
    # Report creation
    path('lost/', CreateItemReportAPIView.as_view(), {'item_type': 'LOST'}, name='create-lost'),
    path('lost', CreateItemReportAPIView.as_view(), {'item_type': 'LOST'}, name='create-lost-no-slash'),
    path('found/', CreateItemReportAPIView.as_view(), {'item_type': 'FOUND'}, name='create-found'),
    path('found', CreateItemReportAPIView.as_view(), {'item_type': 'FOUND'}, name='create-found-no-slash'),

    # Owner-only soft withdrawal
    path('<str:pk>/withdraw/', WithdrawItemReportAPIView.as_view(), name='item-withdraw'),
    path('<str:pk>/withdraw', WithdrawItemReportAPIView.as_view(), name='item-withdraw-no-slash'),
    
    # Image upload (with alias)
    path('upload/', ImageUploadAPIView.as_view(), name='image-upload'),
    path('upload', ImageUploadAPIView.as_view(), name='image-upload-no-slash'),
    path('upload-image/', ImageUploadAPIView.as_view(), name='image-upload-alias'),
    path('upload-image', ImageUploadAPIView.as_view(), name='image-upload-alias-no-slash'),
    
    # Item detail & updates
    path('<str:pk>/', ItemDetailAPIView.as_view(), name='item-detail'),
    path('<str:pk>', ItemDetailAPIView.as_view(), name='item-detail-no-slash'),
    path('<str:pk>/challenges/', ItemChallengesAPIView.as_view(), name='item-challenges'),
    path('<str:pk>/challenges', ItemChallengesAPIView.as_view(), name='item-challenges-no-slash'),
    path('<str:pk>/private-vault/view/', PrivateVaultViewAPIView.as_view(), name='private-vault-view'),
    path('<str:pk>/private-vault/view', PrivateVaultViewAPIView.as_view(), name='private-vault-view-no-slash'),
    
    # Matching suggestions for item
    path('<str:pk>/matches/', ItemMatchesAPIView.as_view(), name='item-matches'),
    path('<str:pk>/matches', ItemMatchesAPIView.as_view(), name='item-matches-no-slash'),
    path('<str:pk>/matches/refresh/', ItemMatchesRefreshAPIView.as_view(), name='item-matches-refresh'),
    path('<str:pk>/matches/refresh', ItemMatchesRefreshAPIView.as_view(), name='item-matches-refresh-no-slash'),
]
