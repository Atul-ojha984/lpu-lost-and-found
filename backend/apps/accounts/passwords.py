"""Password verification helpers for current and legacy Django account hashes."""

import bcrypt


_RAW_BCRYPT_PREFIXES = ('$2a$', '$2b$', '$2y$')


def _legacy_raw_bcrypt_hash(encoded: str) -> str | None:
    """Return raw bcrypt hashes written by the pre-fix Mongo importer.

    That importer stored Express bcrypt hashes under Django's
    ``bcrypt_sha256`` label without first SHA-256 hashing the password. A
    valid Django bcrypt_sha256 hash is always checked normally first; this
    compatibility path only runs when that verification fails.
    """
    candidate = encoded
    if encoded.startswith('bcrypt_sha256$'):
        candidate = encoded.split('$', 1)[1]

    if candidate.startswith(_RAW_BCRYPT_PREFIXES):
        return candidate
    return None


def verify_user_password(user, raw_password: str) -> bool:
    """Verify a password and upgrade supported legacy hashes on success.

    New and normal Django hashes use ``AbstractBaseUser.check_password``.
    Existing imported raw bcrypt hashes with the incorrect old algorithm tag
    are checked with bcrypt directly, then immediately rehashed using the
    preferred Django password hasher. No fallback accepts unhashed or
    plaintext credentials.
    """
    try:
        if user.check_password(raw_password):
            return True
    except (TypeError, ValueError, OverflowError):
        # An unrecognized/old encoded hash may still be a raw bcrypt value.
        pass

    legacy_hash = _legacy_raw_bcrypt_hash(user.password or '')
    if not legacy_hash:
        return False

    try:
        valid = bcrypt.checkpw(
            raw_password.encode('utf-8'),
            legacy_hash.encode('ascii'),
        )
    except (TypeError, ValueError, OverflowError, UnicodeError):
        return False

    if valid:
        user.set_password(raw_password)
        user.save(update_fields=['password', 'updated_at'])
    return valid
