"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Root URL Configuration
==============================================================================
"""

from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve as serve_media
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)
from apps.core.views import RootWelcomeAPIView, HealthCheckAPIView, ApiV1RootIndexView
from apps.items.views import PublicCategoryListAPIView, ItemPublicBoardAPIView
from apps.locations.views import PublicLocationListAPIView
from apps.claims.views import ClaimCreateAPIView

urlpatterns = [
    # Root Welcome Endpoint (Smoke tests & root greeting)
    path('', RootWelcomeAPIView.as_view(), name='root-welcome'),

    # Django Administration Terminal
    path('django-admin/', admin.site.urls),

    # OpenAPI 3.0 Documentation Endpoints
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # API v1 Service Discovery Index
    path('api/v1/', ApiV1RootIndexView.as_view(), name='api-v1-root-slash'),
    path('api/v1', ApiV1RootIndexView.as_view(), name='api-v1-root'),

    # API v1 Core Endpoints
    path('api/v1/health/', include('apps.core.urls')),
    path('api/v1/health', HealthCheckAPIView.as_view(), name='health-no-slash'),
    path('api/v1/auth/', include('apps.accounts.urls')),

    # Authenticated taxonomy endpoints
    path('api/v1/categories/', PublicCategoryListAPIView.as_view(), name='public-categories-slash'),
    path('api/v1/categories', PublicCategoryListAPIView.as_view(), name='public-categories'),
    path('api/v1/locations/', include('apps.locations.urls')),
    path('api/v1/locations', PublicLocationListAPIView.as_view(), name='public-locations-no-slash'),

    # Core Domain Apps
    path('api/v1/items/', include('apps.items.urls')),
    path('api/v1/items', ItemPublicBoardAPIView.as_view(), name='items-no-slash'),
    path('api/v1/matches/', include('apps.matching.urls')),
    path('api/v1/claims/', include('apps.claims.urls')),
    path('api/v1/claims', ClaimCreateAPIView.as_view(), name='claims-no-slash'),
    path('api/v1/custody/', include('apps.custody.urls')),
    path('api/v1/handovers/', include('apps.handovers.urls')),
    path('api/v1/notifications/', include('apps.audit.urls_notifications')),

    # Privileged Security & Administration Workflows
    path('api/v1/security/', include('apps.audit.urls_security')),
    path('api/v1/admin/', include('apps.analytics.urls_admin')),
]

# Item photographs are public listing assets with EXIF metadata removed. Keep
# this stable URL available in production; private evidence uses its separate,
# authenticated download endpoint and is never served from MEDIA_ROOT.
urlpatterns += [
    re_path(r'^media/(?P<path>.+)$', serve_media, {'document_root': settings.MEDIA_ROOT}),
]

# WhiteNoise handles collected static assets in production; Django serves them
# only for local development.
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
