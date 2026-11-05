"""Scheduled archival of stale, eligible student lost-property reports."""

from django.core.management.base import BaseCommand

from apps.items.services import expire_overdue_student_lost_reports


class Command(BaseCommand):
    help = 'Archive eligible student LOST reports after 30 days without recovery.'

    def handle(self, *args, **options):
        result = expire_overdue_student_lost_reports()
        message = (
            'Lost report expiry sweep complete: '
            f"{result['expired']} expired, {result['protected']} protected by active workflows, "
            f"{result['skipped']} changed before processing."
        )
        self.stdout.write(self.style.SUCCESS(message))
