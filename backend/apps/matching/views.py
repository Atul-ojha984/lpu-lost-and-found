"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Matching App Views
==============================================================================
"""

from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiResponse

from apps.accounts.permissions import IsSecurityOrAdmin
from apps.items.models import Item
from .models import MatchSuggestion
from .serializers import MatchSuggestionSerializer
from .services import generate_match_suggestions_for_item, refresh_all_match_suggestions

class ItemMatchesAPIView(APIView):
    """Retrieve algorithmic match suggestions for an item."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Matching'],
        summary='Get Matches for Item',
        responses={200: MatchSuggestionSerializer(many=True)},
    )
    def get(self, request, pk):
        try:
            item = Item.objects.get(pk=pk)
        except Item.DoesNotExist:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Item not found.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # Allow record owner or security personnel
        is_owner = item.reported_by_id == request.user.id
        is_security = request.user.role in ('SECURITY_PERSONNEL', 'CAMPUS_ADMIN', 'SYSTEM_ADMIN')
        if not (is_owner or is_security):
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_403_FORBIDDEN,
                    'error': {'code': 'FORBIDDEN', 'message': 'Access to matches restricted to item owner or security.'},
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        matches = MatchSuggestion.objects.filter(
            Q(lost_item=item) | Q(found_item=item)
        ).select_related(
            'lost_item__category', 'lost_item__location', 'lost_item__reported_by',
            'found_item__category', 'found_item__location', 'found_item__reported_by'
        ).order_by('-match_score')

        serializer = MatchSuggestionSerializer(matches, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

class ItemMatchesRefreshAPIView(APIView):
    """Trigger re-computation of matches for an item."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Matching'],
        summary='Refresh Matches for Item',
        responses={200: OpenApiResponse(description='Match count refreshed')},
    )
    def post(self, request, pk):
        try:
            item = Item.objects.get(pk=pk)
        except Item.DoesNotExist:
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_404_NOT_FOUND,
                    'error': {'code': 'NOT_FOUND', 'message': 'Item not found.'},
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        is_owner = item.reported_by_id == request.user.id
        is_security = request.user.role in ('SECURITY_PERSONNEL', 'CAMPUS_ADMIN', 'SYSTEM_ADMIN')
        if not (is_owner or is_security):
            return Response(
                {
                    'success': False,
                    'statusCode': status.HTTP_403_FORBIDDEN,
                    'error': {'code': 'FORBIDDEN', 'message': 'Permission denied.'},
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        suggestions = generate_match_suggestions_for_item(item.id)
        return Response({'count': len(suggestions)}, status=status.HTTP_200_OK)

class RefreshAllMatchesAPIView(APIView):
    """Global batch trigger for computing matches across all active reports."""
    permission_classes = [IsSecurityOrAdmin]

    @extend_schema(
        tags=['Matching'],
        summary='Global Match Re-computation',
        responses={200: OpenApiResponse(description='Total suggestions generated')},
    )
    def post(self, request):
        total = refresh_all_match_suggestions()
        return Response({'totalSuggestionsGenerated': total}, status=status.HTTP_200_OK)
