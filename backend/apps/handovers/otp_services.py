"""Shared issue and idempotent renewal helpers for direct recovery OTPs."""

import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.claims.services import generate_secure_numeric_otp
from apps.items.models import Item, ItemStatus

from .models import DirectRecovery, DirectRecoveryStatus

logger = logging.getLogger(__name__)
DIRECT_OTP_VALIDITY = timedelta(hours=48)


def set_direct_recovery_otp(record: DirectRecovery, generated_at=None) -> None:
    """Replace a pending recovery's OTP and invalidate its previous code."""
    generated_at = generated_at or timezone.now()
    raw_otp = generate_secure_numeric_otp(6)
    record.set_otp(raw_otp)
    record.otp_generated_at = generated_at
    record.otp_expires_at = generated_at + DIRECT_OTP_VALIDITY
    record.otp_attempts_count = 0


def renew_expired_direct_recovery_otp(direct_recovery_id, now=None):
    """Renew an expired pending OTP under the same item/record lock order as handover."""
    now = now or timezone.now()
    try:
        item_id = DirectRecovery.objects.values_list('item_id', flat=True).get(pk=direct_recovery_id)
    except (DirectRecovery.DoesNotExist, ValueError, TypeError):
        return None, False

    with transaction.atomic():
        try:
            item = Item.objects.select_for_update().get(pk=item_id)
            record = DirectRecovery.objects.select_for_update().get(pk=direct_recovery_id, item_id=item.pk)
        except (Item.DoesNotExist, DirectRecovery.DoesNotExist):
            return None, False

        if (
            record.status != DirectRecoveryStatus.APPROVED
            or record.completed_at is not None
            or record.reviewed_by_id is None
            or record.reviewed_at is None
            or item.status != ItemStatus.READY_FOR_HANDOVER
        ):
            return record, False

        if record.otp_expires_at and record.otp_expires_at > now and record.otp_hash and record.otp_cipher:
            if record.otp_generated_at is None:
                record.otp_generated_at = record.otp_expires_at - DIRECT_OTP_VALIDITY
                record.save(update_fields=['otp_generated_at', 'updated_at'])
            return record, False

        set_direct_recovery_otp(record, generated_at=now)
        record.save(update_fields=[
            'otp_hash',
            'otp_cipher',
            'otp_iv',
            'otp_tag',
            'otp_generated_at',
            'otp_expires_at',
            'otp_attempts_count',
            'updated_at',
        ])
        logger.info(
            'direct_handover_otp_renewed direct_recovery_id=%s item_id=%s recipient_id=%s generated_at=%s expires_at=%s',
            record.pk,
            item.pk,
            record.recipient_id,
            record.otp_generated_at.isoformat(),
            record.otp_expires_at.isoformat(),
        )
        return record, True
