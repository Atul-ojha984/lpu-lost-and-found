"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Matching App Serializers
==============================================================================
"""

from rest_framework import serializers
from apps.items.serializers import PublicItemSerializer
from .models import MatchSuggestion

class MatchSuggestionSerializer(serializers.ModelSerializer):
    """Output representation of a suggested match pair with factor explanations."""
    _id = serializers.CharField(source='id', read_only=True)
    matchScore = serializers.FloatField(source='match_score')
    lostItem = PublicItemSerializer(source='lost_item', read_only=True)
    foundItem = PublicItemSerializer(source='found_item', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = MatchSuggestion
        fields = [
            '_id',
            'id',
            'lostItem',
            'foundItem',
            'matchScore',
            'confidence',
            'explanation',
            'status',
            'createdAt',
        ]
