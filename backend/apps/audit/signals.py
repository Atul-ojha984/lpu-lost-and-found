"""Create private portal notifications only after their source event commits."""

import logging

from django.apps import apps
from django.contrib.auth import get_user_model
from apps.core.db_transactions import transaction
from django.db import DatabaseError
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import UserRole

from .models import AuditAction, AuditEntry, Notification
from apps.matching.models import MatchSuggestion

logger = logging.getLogger(__name__)

ADMIN_ROLES = (UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN)
ROLE_SCOPED_EVENT_TYPES = {
    'NEW_REPORT',
    'CLAIM_EVIDENCE_UPLOADED',
    'CLAIM_REQUIRES_REVIEW',
    'CLAIM_SUBMITTED',
    'SECURITY_REVIEW',
    'HANDOVER_AWAITING_COLLECTION',
    'HANDOVER_APPROVED',
    'HANDOVER_COMPLETED',
    'INVENTORY_UPDATED',
    'SUSPICIOUS_HANDOVER_ACTIVITY',
    'ADMIN_ACTIVITY',
}


def _role_users(roles, exclude_user_id=None):
    users = get_user_model().objects.filter(role__in=roles, is_active=True)
    if exclude_user_id:
        users = users.exclude(pk=exclude_user_id)
    return list(users)


def _get_model_record(model_label, record_id):
    if not record_id:
        return None
    try:
        return apps.get_model(model_label).objects.filter(pk=record_id).first()
    except (LookupError, ValueError, TypeError):
        return None


def _save_notifications(entry, events):
    notifications = []
    seen_recipient_ids = set()
    for recipients, event_type, title, message, target_path in events:
        for recipient in recipients:
            if recipient.pk in seen_recipient_ids:
                continue
            seen_recipient_ids.add(recipient.pk)
            notifications.append(Notification(
                recipient=recipient,
                source_audit_entry=entry,
                audience_role=recipient.role if event_type in ROLE_SCOPED_EVENT_TYPES else '',
                event_type=event_type,
                title=title,
                message=message,
                target_path=target_path,
            ))
    for notification in notifications:
        try:
            # A unique partial index is the concurrency-safe idempotency guard.
            # Django MongoDB Backend 5.2 doesn't support bulk_create's
            # ignore_conflicts option, so insert individually and recognize
            # only an already-persisted (recipient, source event) duplicate.
            notification.save(force_insert=True)
        except DatabaseError:
            if (
                notification.source_audit_entry_id
                and Notification.objects.filter(
                    recipient_id=notification.recipient_id,
                    source_audit_entry_id=notification.source_audit_entry_id,
                ).exists()
            ):
                continue
            raise


def _send_for_audit_entry(audit_entry_id):
    try:
        entry = AuditEntry.objects.select_related('actor').get(pk=audit_entry_id)
        metadata = entry.metadata if isinstance(entry.metadata, dict) else {}
        actor_id = entry.actor_id
        admins = _role_users(ADMIN_ROLES, actor_id)
        security = _role_users((UserRole.SECURITY_PERSONNEL,), actor_id)
        events = []

        item_id = metadata.get('itemId')
        if not item_id and entry.target_entity.casefold() == 'item':
            item_id = entry.target_id
        item = _get_model_record('items.Item', item_id)

        if entry.action in (AuditAction.ITEM_REPORT_LOST, AuditAction.ITEM_REPORT_FOUND):
            item_type = 'lost-item' if entry.action == AuditAction.ITEM_REPORT_LOST else 'found-item'
            owner = item.reported_by if item else entry.actor
            if owner and owner.is_active:
                events.append((
                    [owner], 'REPORT_SUBMITTED', 'Report submitted',
                    f'Your {item_type} report has been received and is awaiting security review.',
                    '/dashboard/my-reports',
                ))
            events.append((
                security, 'NEW_REPORT', 'New report awaiting review',
                f'A student or staff {item_type} report is ready for security review.',
                '/security/custody?tab=reports',
            ))
            events.append((
                admins, 'NEW_REPORT', 'New report submitted',
                f'A student or staff {item_type} report was submitted.',
                '/admin/audit',
            ))

        elif entry.action in (AuditAction.ITEM_REPORT_WITHDRAW, AuditAction.ITEM_REPORT_EXPIRE):
            owner = item.reported_by if item else entry.actor
            if owner and owner.is_active:
                event_type, title, message = (
                    ('REPORT_WITHDRAWN', 'Report withdrawn', 'Your report was withdrawn and is no longer active.')
                    if entry.action == AuditAction.ITEM_REPORT_WITHDRAW else
                    ('REPORT_EXPIRED', 'Report expired', 'Your lost-item report expired after its active period.')
                )
                events.append(([owner], event_type, title, message, '/dashboard/my-reports'))

        elif entry.action == AuditAction.CLAIM_SUBMIT:
            if metadata.get('event') == 'EVIDENCE_UPLOADED':
                claim = _get_model_record('claims.Claim', entry.target_id)
                if claim and claim.claimant.is_active:
                    events.append((
                        [claim.claimant], 'CLAIM_EVIDENCE_UPLOADED', 'Evidence uploaded',
                        'Your supporting evidence was added to the ownership claim.',
                        '/dashboard/my-claims',
                    ))
                events.append((
                    security, 'CLAIM_REQUIRES_REVIEW', 'Claim evidence updated',
                    'Supporting evidence was added to an ownership claim.',
                    '/security/claims',
                ))
            else:
                claim = _get_model_record('claims.Claim', entry.target_id)
                claimant = claim.claimant if claim else entry.actor
                if claimant and claimant.is_active:
                    events.append((
                        [claimant], 'CLAIM_SUBMITTED', 'Ownership claim submitted',
                        'Your ownership claim was submitted for security review.',
                        '/dashboard/my-claims',
                    ))
                events.append((
                    security, 'CLAIM_REQUIRES_REVIEW', 'New ownership claim',
                    'An ownership claim is awaiting security review.',
                    '/security/claims',
                ))
                events.append((
                    admins, 'CLAIM_SUBMITTED', 'Ownership claim submitted',
                    'A new ownership claim was submitted for security review.',
                    '/admin/audit',
                ))

        elif entry.action == AuditAction.CLAIM_REVIEW:
            direct_id = metadata.get('directRecoveryId')
            direct = _get_model_record('handovers.DirectRecovery', direct_id or (
                entry.target_id if entry.target_entity.casefold() == 'directrecovery' else None
            ))
            action = str(metadata.get('action', '')).upper()
            if direct:
                claimant = direct.recipient
                approved = action == 'APPROVE_DIRECT_RECOVERY'
                if claimant.is_active:
                    events.append((
                        [claimant], 'DIRECT_RECOVERY_REVIEWED',
                        'Direct recovery approved' if approved else 'Direct recovery updated',
                        'Security completed the independent review of your recovery request.',
                        '/dashboard/my-reports',
                    ))
            else:
                claim = _get_model_record('claims.Claim', entry.target_id)
                if claim and claim.claimant.is_active:
                    events.append((
                        [claim.claimant], 'CLAIM_REVIEWED', 'Claim status updated',
                        'Security updated the status of your ownership claim.',
                        '/dashboard/my-claims',
                    ))
            events.append((
                admins, 'SECURITY_REVIEW', 'Security review completed',
                'A security officer completed an ownership review.',
                '/admin/audit',
            ))

        elif entry.action == AuditAction.HANDOVER_OTP_GENERATE:
            direct_id = metadata.get('directRecoveryId')
            direct = _get_model_record('handovers.DirectRecovery', direct_id or (
                entry.target_id if entry.target_entity.casefold() == 'directrecovery' else None
            ))
            if direct:
                claimant = direct.recipient
                path = '/dashboard/my-reports'
            else:
                claim_id = metadata.get('claimId')
                if not claim_id and entry.target_entity.casefold() == 'handover':
                    handover = _get_model_record('handovers.Handover', entry.target_id)
                    claim_id = handover.claim_id if handover else None
                claim = _get_model_record('claims.Claim', claim_id)
                claimant = claim.claimant if claim else None
                path = '/dashboard/my-claims'
            if claimant and claimant.is_active:
                events.append((
                    [claimant], 'HANDOVER_OTP_READY', 'Item ready for collection',
                    'Security approved your recovery and issued a collection OTP. Retrieve it from your portal.',
                    path,
                ))
            events.append((
                security, 'HANDOVER_AWAITING_COLLECTION', 'Approved handover awaiting collection',
                'An approved item is awaiting supervised handover.',
                '/security/handovers',
            ))
            events.append((
                admins, 'HANDOVER_APPROVED', 'Handover approved',
                'A verified recovery was approved and is awaiting collection.',
                '/admin/audit',
            ))

        elif entry.action == AuditAction.HANDOVER_EXECUTE:
            direct_id = metadata.get('directRecoveryId')
            direct = _get_model_record('handovers.DirectRecovery', direct_id or (
                entry.target_id if entry.target_entity.casefold() == 'directrecovery' else None
            ))
            if direct:
                claimant = direct.recipient
            else:
                recipient_id = metadata.get('recipientId')
                if not recipient_id and entry.target_entity.casefold() == 'handover':
                    handover = _get_model_record('handovers.Handover', entry.target_id)
                    recipient_id = handover.recipient_id if handover else None
                claimant = _get_model_record('accounts.User', recipient_id)
            if claimant and claimant.is_active:
                events.append((
                    [claimant], 'RECOVERY_COMPLETED', 'Recovery completed',
                    'The security office confirmed that your recovered item was handed over.',
                    '/dashboard/history',
                ))
            events.append((
                security, 'HANDOVER_COMPLETED', 'Handover completed',
                'A supervised property handover was completed and recorded.',
                '/security/history',
            ))
            events.append((
                admins, 'HANDOVER_COMPLETED', 'Handover completed',
                'A supervised property handover was completed and recorded.',
                '/admin/audit',
            ))

        elif entry.action in (AuditAction.CUSTODY_TRANSFER, AuditAction.CUSTODY_INTAKE):
            title = 'Locker or custody record updated' if entry.action == AuditAction.CUSTODY_TRANSFER else 'Security intake recorded'
            message = 'An item custody or locker movement was recorded.' if entry.action == AuditAction.CUSTODY_TRANSFER else 'A physical item intake was recorded at the security desk.'
            events.append((security, 'INVENTORY_UPDATED', title, message, '/security/custody'))
            events.append((admins, 'INVENTORY_UPDATED', title, message, '/admin/audit'))

        elif entry.action == 'HANDOVER_OTP_FAILED' and int(metadata.get('attemptNumber') or 0) >= 5:
            events.append((
                admins, 'SUSPICIOUS_HANDOVER_ACTIVITY', 'Handover verification locked',
                'A handover OTP reached its failed-attempt limit and was locked.',
                '/admin/audit',
            ))

        elif entry.action in (
            AuditAction.USER_REGISTER,
            AuditAction.ROLE_UPDATE,
            AuditAction.ITEM_DISPOSE,
            AuditAction.CATEGORY_MANAGE,
            AuditAction.LOCATION_MANAGE,
            AuditAction.CONFIG_UPDATE,
        ):
            events.append((
                admins, 'ADMIN_ACTIVITY', 'Administrative activity recorded',
                'An account, inventory, or system configuration action was recorded.',
                '/admin/audit',
            ))

        _save_notifications(entry, events)
    except Exception:
        # Notification delivery must not turn a committed business transaction into an API error.
        logger.exception('portal_notification_creation_failed audit_entry_id=%s', audit_entry_id)


@receiver(post_save, sender=AuditEntry, dispatch_uid='audit_entry_portal_notifications')
def schedule_audit_notifications(sender, instance, created, **kwargs):
    if not created:
        return
    audit_entry_id = instance.pk
    transaction.on_commit(lambda: _send_for_audit_entry(audit_entry_id))


def _send_for_new_match(match_id):
    try:
        match = MatchSuggestion.objects.select_related('lost_item').get(pk=match_id)
        recipients = _role_users((UserRole.SECURITY_PERSONNEL,))
        Notification.objects.bulk_create([
            Notification(
                recipient=recipient,
                audience_role=recipient.role,
                event_type='POSSIBLE_ITEM_MATCH',
                title='Possible lost-to-found match',
                message='The matching service generated a possible lost-to-found match for security review.',
                target_path=f'/items/{match.lost_item_id}',
            )
            for recipient in recipients
        ])
    except Exception:
        logger.exception('portal_match_notification_creation_failed match_id=%s', match_id)


@receiver(post_save, sender=MatchSuggestion, dispatch_uid='new_match_portal_notifications')
def schedule_match_notifications(sender, instance, created, **kwargs):
    if created:
        match_id = instance.pk
        transaction.on_commit(lambda: _send_for_new_match(match_id))
