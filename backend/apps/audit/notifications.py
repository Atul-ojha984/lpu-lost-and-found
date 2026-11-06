"""Authenticated APIs for the current user's persistent portal notifications."""

import uuid

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification


def _cursor_for(notification):
    return f'{notification.created_at.isoformat()}|{notification.pk}'


def _notification_payload(notification):
    path = notification.target_path
    if not path.startswith('/') or path.startswith('//'):
        path = ''
    return {
        'id': str(notification.pk),
        'eventType': notification.event_type,
        'title': notification.title,
        'message': notification.message,
        'targetPath': path,
        'createdAt': notification.created_at,
        'readAt': notification.read_at,
        'isRead': notification.read_at is not None,
    }


class MyNotificationsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = Notification.objects.filter(recipient=request.user).filter(
            Q(audience_role='') | Q(audience_role=request.user.role)
        )
        unread_count = queryset.filter(read_at__isnull=True).count()
        cursor = request.query_params.get('cursor', '').strip()

        if cursor:
            timestamp_text, separator, notification_id = cursor.partition('|')
            timestamp = parse_datetime(timestamp_text)
            try:
                cursor_id = uuid.UUID(notification_id) if separator else None
            except (ValueError, TypeError, AttributeError):
                cursor_id = None
            if timestamp is None or timezone.is_naive(timestamp) or cursor_id is None:
                return Response({'message': 'Invalid notification cursor.'}, status=status.HTTP_400_BAD_REQUEST)
            items = list(queryset.filter(
                Q(created_at__gt=timestamp) | Q(created_at=timestamp, pk__gt=cursor_id)
            ).order_by('created_at', 'id')[:50])
            next_cursor = _cursor_for(items[-1]) if items else cursor
        else:
            items = list(queryset.order_by('-created_at', '-id')[:10])
            next_cursor = _cursor_for(items[0]) if items else ''

        return Response({
            'items': [_notification_payload(item) for item in items],
            'unreadCount': unread_count,
            'nextCursor': next_cursor,
        }, status=status.HTTP_200_OK)


class NotificationMarkReadAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, notification_id):
        notification = get_object_or_404(
            Notification.objects.filter(recipient=request.user).filter(
                Q(audience_role='') | Q(audience_role=request.user.role)
            ),
            pk=notification_id,
        )
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=['read_at'])
        return Response({
            'id': str(notification.pk),
            'readAt': notification.read_at,
            'unreadCount': Notification.objects.filter(recipient=request.user, read_at__isnull=True).filter(
                Q(audience_role='') | Q(audience_role=request.user.role)
            ).count(),
        }, status=status.HTTP_200_OK)


class NotificationsMarkAllReadAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(recipient=request.user, read_at__isnull=True).filter(
            Q(audience_role='') | Q(audience_role=request.user.role)
        ).update(read_at=timezone.now())
        return Response({'unreadCount': 0}, status=status.HTTP_200_OK)
