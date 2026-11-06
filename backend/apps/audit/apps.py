from django.apps import AppConfig

class AuditConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.audit'
    label = 'audit'
    verbose_name = 'Forensic Compliance Audit Trail'

    def ready(self):
        from . import signals  # noqa: F401
