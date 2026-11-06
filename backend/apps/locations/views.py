"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Locations App Views
==============================================================================
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from apps.accounts.permissions import IsCampusAdmin
from .models import Location
from .serializers import (
    LocationSerializer,
    CreateLocationSerializer,
    UpdateLocationSerializer,
)

class PublicLocationListAPIView(APIView):
    """Authenticated catalog of active campus zones and security desks."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Taxonomy'],
        summary='Get Campus Locations',
        responses={200: LocationSerializer(many=True)},
    )
    def get(self, request):
        locations = Location.objects.filter(is_active=True).order_by('campus_zone', 'name')
        serializer = LocationSerializer(locations, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

class AdminLocationListCreateAPIView(APIView):
    """Administrative management terminal for campus locations."""
    permission_classes = [IsCampusAdmin]

    @extend_schema(
        tags=['Taxonomy'],
        summary='Admin List Locations',
        responses={200: LocationSerializer(many=True)},
    )
    def get(self, request):
        include_inactive = request.query_params.get('includeInactive', 'true').lower() in ('true', '1')
        queryset = Location.objects.all() if include_inactive else Location.objects.filter(is_active=True)
        queryset = queryset.order_by('campus_zone', 'name')
        serializer = LocationSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=['Taxonomy'],
        summary='Admin Create Location',
        request=CreateLocationSerializer,
        responses={201: LocationSerializer},
    )
    def post(self, request):
        serializer = CreateLocationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        location = serializer.save()
        return Response(LocationSerializer(location).data, status=status.HTTP_201_CREATED)

class AdminLocationDetailAPIView(APIView):
    """Administrative update terminal for a campus location."""
    permission_classes = [IsCampusAdmin]

    @extend_schema(
        tags=['Taxonomy'],
        summary='Admin Update Location',
        request=UpdateLocationSerializer,
        responses={200: LocationSerializer},
    )
    def patch(self, request, pk):
        try:
            location = Location.objects.get(pk=pk)
        except Location.DoesNotExist:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Location not found.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = UpdateLocationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = serializer.update(location, serializer.validated_data)
        return Response(LocationSerializer(updated).data, status=status.HTTP_200_OK)
