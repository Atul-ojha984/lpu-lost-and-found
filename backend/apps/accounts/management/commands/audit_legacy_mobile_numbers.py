"""Report stored user phone values that are invalid or not normalized to E.164."""

from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.accounts.phone import normalize_indian_mobile_number


def mask_phone(value: str) -> str:
    digits = ''.join(character for character in value if character.isdigit())
    return f"{'*' * max(0, len(digits) - 4)}{digits[-4:]}" if digits else '[empty]'


class Command(BaseCommand):
    help = 'List legacy account phone values that need administrator review; does not modify records.'

    def handle(self, *args, **options):
        flagged = 0
        for user in User.objects.exclude(phone='').only('id', 'registration_number', 'user_type', 'phone').iterator():
            try:
                normalized = normalize_indian_mobile_number(user.phone, allow_blank=False)
                reason = 'valid but not E.164 normalized' if normalized != user.phone else None
            except ValueError:
                reason = 'invalid or not an Indian mobile number'

            if reason:
                flagged += 1
                self.stdout.write(
                    f'{user.id} | {user.registration_number} | {user.user_type} | '
                    f'{mask_phone(user.phone)} | {reason}'
                )

        if not flagged:
            self.stdout.write('No legacy phone values require correction.')
        else:
            self.stdout.write(f'{flagged} legacy phone value(s) require administrator review; no records were changed.')
