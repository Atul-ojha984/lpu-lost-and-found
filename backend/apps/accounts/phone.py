"""Validation and normalization for Indian mobile phone numbers."""

import re

import phonenumbers
from phonenumbers import PhoneNumberFormat, PhoneNumberType


INVALID_INDIAN_MOBILE_MESSAGE = 'Enter a valid 10-digit Indian mobile number.'
_SUPPORTED_INPUT = re.compile(r'^\+?[0-9\s-]+$')


def normalize_indian_mobile_number(value: str, *, allow_blank: bool = True) -> str:
    """Validate an Indian mobile number and return its E.164 representation.

    Accepted input shapes are a 10-digit national number, ``91`` followed by
    ten digits, or ``+91`` followed by ten digits. Spaces and hyphens are
    accepted as visual separators. The metadata-backed libphonenumber checks
    are authoritative for allocation ranges and number type.
    """
    raw = str(value or '').strip()
    if not raw:
        if allow_blank:
            return ''
        raise ValueError(INVALID_INDIAN_MOBILE_MESSAGE)

    if not _SUPPORTED_INPUT.fullmatch(raw):
        raise ValueError(INVALID_INDIAN_MOBILE_MESSAGE)

    compact = re.sub(r'[\s-]', '', raw)
    if compact.startswith('+'):
        if not compact.startswith('+91'):
            raise ValueError(INVALID_INDIAN_MOBILE_MESSAGE)
        candidate = compact
    elif len(compact) == 12 and compact.startswith('91'):
        candidate = f'+{compact}'
    elif len(compact) == 10:
        candidate = compact
    else:
        raise ValueError(INVALID_INDIAN_MOBILE_MESSAGE)

    try:
        parsed = phonenumbers.parse(candidate, 'IN')
    except phonenumbers.NumberParseException as exc:
        raise ValueError(INVALID_INDIAN_MOBILE_MESSAGE) from exc

    if (
        parsed.country_code != 91
        or not phonenumbers.is_possible_number(parsed)
        or not phonenumbers.is_valid_number_for_region(parsed, 'IN')
        or phonenumbers.number_type(parsed) != PhoneNumberType.MOBILE
    ):
        raise ValueError(INVALID_INDIAN_MOBILE_MESSAGE)

    return phonenumbers.format_number(parsed, PhoneNumberFormat.E164)
