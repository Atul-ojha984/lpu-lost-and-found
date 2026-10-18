"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Accounts Authentication URL Configuration
==============================================================================
"""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterAPIView,
    LoginAPIView,
    LogoutAPIView,
    CurrentUserAPIView,
)

app_name = 'accounts'

urlpatterns = [
    path('register/', RegisterAPIView.as_view(), name='register'),
    path('register', RegisterAPIView.as_view(), name='register-no-slash'),
    path('login/', LoginAPIView.as_view(), name='login'),
    path('login', LoginAPIView.as_view(), name='login-no-slash'),
    path('logout/', LogoutAPIView.as_view(), name='logout'),
    path('logout', LogoutAPIView.as_view(), name='logout-no-slash'),
    path('me/', CurrentUserAPIView.as_view(), name='me'),
    path('me', CurrentUserAPIView.as_view(), name='me-no-slash'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('token/refresh', TokenRefreshView.as_view(), name='token_refresh_no_slash'),
]
