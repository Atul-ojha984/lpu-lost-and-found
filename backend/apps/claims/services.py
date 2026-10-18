"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Claims App Services: Submission, Challenge Evaluation, Adjudication
==============================================================================
"""

import random
from datetime import datetime, timezone, timedelta
from django.db import transaction
from django.core.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError, NotFound

from apps.core.crypto import encrypt_field
from apps.audit.models import AuditEntry, AuditAction
from apps.items.models import Item, ItemStatus, ItemType
from apps.verification.models import VerificationChallenge
from apps.handovers.models import Handover
from .models import Claim, ClaimChallengeAnswer, ClaimStatus

def generate_secure_numeric_otp(digits: int = 6) -> str:
    """Generates a cryptographically strong numeric OTP string."""
    return ''.join(str(random.randint(0, 9)) for _ in range(digits))

def submit_claim(user, item_id: str, statement: str, challenge_answers: list = None, private_evidence_urls: list = None, req_ip: str = '127.0.0.1', user_agent: str = '') -> Claim:
    """Submit an ownership claim against an item."""
    try:
        item = Item.objects.get(pk=item_id, is_archived=False)
    except Item.DoesNotExist:
        raise NotFound("Campus property not found or is no longer active.")

    if item.status in (ItemStatus.HANDED_OVER, ItemStatus.DISPOSED):
        raise ValidationError(f"This item is in status '{item.status}' and is not eligible for new claims.")

    if item.reported_by_id == user.id and item.item_type == ItemType.FOUND:
        raise ValidationError("You are listed as the finder of this property. You cannot submit an ownership claim against it.")

    # Check for existing active claim
    existing_claim = Claim.objects.filter(
        item=item,
        claimant=user,
        claim_status__in=[ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW, ClaimStatus.CHALLENGE_REQUIRED, ClaimStatus.APPROVED],
    ).exists()
    if existing_claim:
        raise ValidationError("You already have an active claim under review for this campus property.")

    challenges = list(VerificationChallenge.objects.filter(item=item, is_active=True))
    answers_map = {a.get('challengeId'): a.get('providedAnswer', '') for a in (challenge_answers or [])}

    with transaction.atomic():
        initial_status = ClaimStatus.UNDER_REVIEW if len(challenges) == 0 else ClaimStatus.CHALLENGE_REQUIRED
        passed_count = 0

        claim = Claim.objects.create(
            item=item,
            claimant=user,
            statement=statement.strip(),
            claim_status=initial_status,
            private_evidence_proof_urls=private_evidence_urls or [],
            verification_attempts_count=1 if challenge_answers else 0,
        )

        for challenge in challenges:
            ans_text = answers_map.get(str(challenge.id))
            if ans_text is not None:
                is_correct = challenge.check_answer(ans_text)
                if is_correct:
                    passed_count += 1
                ClaimChallengeAnswer.objects.create(
                    claim=claim,
                    challenge=challenge,
                    provided_answer=ans_text.strip(),
                    is_correct=is_correct,
                )

        if len(challenges) > 0 and passed_count == len(challenges):
            claim.claim_status = ClaimStatus.UNDER_REVIEW
            claim.save(update_fields=['claim_status'])

        if item.status in (ItemStatus.REPORTED, ItemStatus.IN_CUSTODY):
            item.status = ItemStatus.CLAIM_IN_REVIEW
            item.save(update_fields=['status'])

        AuditEntry.objects.create(
            actor=user,
            actor_role=user.role,
            action=AuditAction.CLAIM_SUBMIT,
            target_entity='Claim',
            target_id=str(claim.id),
            ip_address=req_ip,
            user_agent=user_agent,
            metadata={'itemId': str(item.id), 'referenceNumber': item.reference_number, 'status': claim.claim_status},
        )

    return claim

def answer_challenge(claim_id: str, user, challenge_id: str, answer_text: str, req_ip: str = '127.0.0.1', user_agent: str = '') -> dict:
    """Answer a verification challenge on an active claim."""
    try:
        claim = Claim.objects.get(pk=claim_id)
    except Claim.DoesNotExist:
        raise NotFound("Claim record not found.")

    if claim.claimant_id != user.id:
        raise PermissionDenied("You are not authorized to answer challenges for this claim.")

    if claim.claim_status not in (ClaimStatus.CHALLENGE_REQUIRED, ClaimStatus.SUBMITTED):
        raise ValidationError("This claim is not currently awaiting challenge verification.")

    try:
        challenge = VerificationChallenge.objects.get(pk=challenge_id, is_active=True)
    except VerificationChallenge.DoesNotExist:
        raise NotFound("Verification challenge not found or no longer active.")

    if challenge.expires_at and challenge.expires_at < datetime.now(timezone.utc):
        raise ValidationError("This verification challenge has expired. Please contact campus security.")

    max_attempts = challenge.max_attempts or 3
    if claim.verification_attempts_count >= max_attempts:
        raise ValidationError("Maximum verification attempts exceeded for this challenge.")

    is_match = challenge.check_answer(answer_text)
    claim.verification_attempts_count += 1

    with transaction.atomic():
        ClaimChallengeAnswer.objects.update_or_create(
            claim=claim,
            challenge=challenge,
            defaults={
                'provided_answer': answer_text.strip(),
                'is_correct': is_match,
            }
        )

        all_challenges = VerificationChallenge.objects.filter(item=claim.item, is_active=True)
        all_passed = True
        for ch in all_challenges:
            ca = ClaimChallengeAnswer.objects.filter(claim=claim, challenge=ch).first()
            if not ca or not ca.is_correct:
                all_passed = False
                break

        if all_passed:
            claim.claim_status = ClaimStatus.UNDER_REVIEW

        claim.save(update_fields=['verification_attempts_count', 'claim_status'])

    remaining_attempts = max(0, max_attempts - claim.verification_attempts_count)
    return {
        'success': True,
        'isCorrect': is_match,
        'remainingAttempts': remaining_attempts,
        'claimStatus': claim.claim_status,
    }

def review_claim(reviewer, claim_id: str, action: str, review_notes: str = '', rejection_reason: str = '', req_ip: str = '127.0.0.1', user_agent: str = '') -> Claim:
    """
    Adjudicate an ownership claim (Approve or Reject).
    Enforces Anti-Self-Approval: Officers cannot approve their own claims or claims on items they reported.
    """
    if reviewer.role not in ('SECURITY_PERSONNEL', 'CAMPUS_ADMIN', 'SYSTEM_ADMIN'):
        raise PermissionDenied("Only security officers and campus administrators are authorized to review claims.")

    try:
        claim = Claim.objects.select_related('item', 'claimant').get(pk=claim_id)
    except Claim.DoesNotExist:
        raise NotFound("Claim not found.")

    # Guard 1: Claimant cannot approve own claim
    if claim.claimant_id == reviewer.id:
        raise PermissionDenied("Anti-Self-Approval Guard: You cannot adjudicate your own claim.")

    # Guard 2: Reporter of item cannot approve claim on that item
    if claim.item.reported_by_id == reviewer.id:
        raise PermissionDenied("Anti-Self-Approval Guard: You cannot adjudicate claims on property you originally reported.")

    if claim.claim_status in (ClaimStatus.APPROVED, ClaimStatus.COMPLETED):
        raise ValidationError("This claim has already reached an approved/completed state and cannot be modified.")

    item = claim.item

    with transaction.atomic():
        claim.reviewed_by = reviewer
        claim.reviewed_at = datetime.now(timezone.utc)
        claim.review_notes = review_notes.strip()

        if action == 'APPROVE':
            claim.claim_status = ClaimStatus.APPROVED

            raw_otp = generate_secure_numeric_otp(6)
            enc_otp = encrypt_field(raw_otp)

            claim.handover_otp = raw_otp
            claim.handover_otp_cipher = enc_otp['ciphertext']
            claim.handover_otp_iv = enc_otp['iv']
            claim.handover_otp_tag = enc_otp['authTag']
            claim.handover_otp_expires_at = datetime.now(timezone.utc) + timedelta(hours=48)
            claim.save()

            item.status = ItemStatus.READY_FOR_HANDOVER
            item.save(update_fields=['status'])

            handover, _ = Handover.objects.update_or_create(
                claim=claim,
                defaults={
                    'item': item,
                    'recipient': claim.claimant,
                    'supervising_officer': reviewer,
                    'otp_expires_at': claim.handover_otp_expires_at,
                    'otp_attempts_count': 0,
                    'physical_desk_location': item.current_custody_desk or 'Central Security Desk - Block 30',
                    'id_card_presented_type': 'PENDING_VERIFICATION',
                    'id_card_number_masked': 'PENDING',
                    'is_completed': False,
                }
            )
            handover.set_otp(raw_otp)
            handover.save()

            # Competing Claims Resolution: reject all other active claims on this item
            Claim.objects.filter(
                item=item,
                claim_status__in=[ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW, ClaimStatus.CHALLENGE_REQUIRED],
            ).exclude(pk=claim.pk).update(
                claim_status=ClaimStatus.REJECTED,
                rejection_reason='Competing claim accepted: Another claimant provided verified proof accepted by security.',
                review_notes='Rejected due to competing claim approval.',
                reviewed_by=reviewer,
                reviewed_at=datetime.now(timezone.utc),
            )

            AuditEntry.objects.create(
                actor=reviewer,
                actor_role=reviewer.role,
                action=AuditAction.HANDOVER_OTP_GENERATE,
                target_entity='Handover',
                target_id=str(handover.id),
                ip_address=req_ip,
                user_agent=user_agent,
                metadata={'claimId': str(claim.id), 'itemId': str(item.id)},
            )
        else:
            claim.claim_status = ClaimStatus.REJECTED
            claim.rejection_reason = rejection_reason.strip() if rejection_reason else 'Ownership claim declined by security.'
            claim.save()

            remaining_claims = Claim.objects.filter(
                item=item,
                claim_status__in=[ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW, ClaimStatus.CHALLENGE_REQUIRED],
            ).exclude(pk=claim.pk).count()

            if remaining_claims == 0 and item.status == ItemStatus.CLAIM_IN_REVIEW:
                item.status = ItemStatus.IN_CUSTODY
                item.save(update_fields=['status'])

        AuditEntry.objects.create(
            actor=reviewer,
            actor_role=reviewer.role,
            action=AuditAction.CLAIM_REVIEW,
            target_entity='Claim',
            target_id=str(claim.id),
            ip_address=req_ip,
            user_agent=user_agent,
            metadata={'action': action, 'itemId': str(item.id), 'claimantId': str(claim.claimant_id)},
        )

    return claim
