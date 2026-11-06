from django.urls import path

from .notifications import MyNotificationsAPIView, NotificationMarkReadAPIView, NotificationsMarkAllReadAPIView

urlpatterns = [
    path('', MyNotificationsAPIView.as_view(), name='my-notifications'),
    path('<uuid:notification_id>/read/', NotificationMarkReadAPIView.as_view(), name='notification-mark-read'),
    path('read-all/', NotificationsMarkAllReadAPIView.as_view(), name='notifications-mark-all-read'),
]
