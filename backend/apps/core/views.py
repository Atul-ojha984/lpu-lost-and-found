"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Core Views & Health Check API
==============================================================================
"""

import time
from datetime import datetime, timezone
from django.db import connection
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema, OpenApiResponse

START_TIME = time.time()

class HealthCheckAPIView(APIView):
    """
    Public Health & Diagnostics Endpoint
    Provides real-time database connectivity status and process metrics.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Health'],
        summary='Service Health & Database Connectivity Check',
        responses={
            200: OpenApiResponse(description='Service is healthy and database is connected'),
            503: OpenApiResponse(description='Service degraded or database disconnected'),
        }
    )
    def get(self, request):
        db_connected = False
        db_state = 'DISCONNECTED'
        db_vendor = connection.vendor
        
        try:
            connection.ensure_connection()
            db_connected = True
            db_state = 'CONNECTED'
        except Exception:
            db_connected = False
            db_state = 'FAILED'

        uptime_seconds = int(time.time() - START_TIME)

        health_data = {
            'status': 'HEALTHY' if db_connected else 'DEGRADED',
            'service': 'LPU Lost & Found REST API (Django DRF)',
            'environment': 'development' if settings.DEBUG else 'production',
            'uptimeSeconds': uptime_seconds,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'database': {
                'connected': db_connected,
                'state': db_state,
                'vendor': db_vendor,
                'name': connection.settings_dict.get('NAME', 'default'),
            },
            'version': '1.0.0',
        }

        # Response envelope renderer wraps this with { success: True, statusCode: 200, data: health_data }
        return Response(health_data, status=200 if db_connected else 503)

class RootWelcomeAPIView(APIView):
    """
    Public Welcome Endpoint
    Matches the Express root endpoint for deployment smoke tests and perimeter health checks.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Health'],
        summary='Root Welcome & Service Status',
        responses={200: OpenApiResponse(description='Welcome message')},
    )
    def get(self, request):
        msg = 'LPU Lost & Found Property Recovery Platform (Django REST API)'
        return Response({
            'success': True,
            'service': msg,
            'version': '1.0.0',
            'status': 'OPERATIONAL',
            'docs': '/api/docs/',
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'data': {
                'service': msg,
                'version': '1.0.0',
                'status': 'OPERATIONAL',
            }
        })

class ApiV1RootIndexView(APIView):
    """
    API v1 Root Discovery & Service Catalog Endpoint
    Serves requests to http://localhost:8000/api/v1 and http://localhost:8000/api/v1/.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Health'],
        summary='API v1 Root Service Discovery & Endpoints Catalog',
        responses={200: OpenApiResponse(description='API v1 service catalog and links')},
    )
    def get(self, request):
        base_url = request.build_absolute_uri('/')[:-1]
        catalog = {
            'service': 'LPU Lost & Found Property Recovery Platform (Django REST API v1)',
            'version': '1.0.0',
            'status': 'OPERATIONAL',
            'docs': f"{base_url}/api/docs/",
            'schema': f"{base_url}/api/schema/",
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'endpoints': {
                'health': f"{base_url}/api/v1/health/",
                'auth': f"{base_url}/api/v1/auth/",
                'items': f"{base_url}/api/v1/items/",
                'categories': f"{base_url}/api/v1/categories/",
                'locations': f"{base_url}/api/v1/locations/",
                'claims': f"{base_url}/api/v1/claims/",
                'custody': f"{base_url}/api/v1/custody/",
                'handovers': f"{base_url}/api/v1/handovers/",
                'matches': f"{base_url}/api/v1/matches/",
                'security': f"{base_url}/api/v1/security/",
                'admin': f"{base_url}/api/v1/admin/",
            }
        }
        return Response({
            'success': True,
            'service': catalog['service'],
            'version': catalog['version'],
            'status': catalog['status'],
            'docs': catalog['docs'],
            'timestamp': catalog['timestamp'],
            'data': catalog,
        })


