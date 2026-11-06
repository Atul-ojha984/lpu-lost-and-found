"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Phase 1 Test Suite: AES-256-GCM Cryptographic Vault
==============================================================================
"""

import pytest
from django.test import override_settings
from apps.core.crypto import AESGCMVault, decrypt_field, encrypt_field, get_encryption_key
import base64

def test_aes_gcm_roundtrip():
    """Verify encryption and decryption roundtrip with 12-byte IV and 16-byte auth tag."""
    test_key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    vault = AESGCMVault(test_key)

    original_secret = "Private Serial Number: SN-LPU-99281-XYZ, IMEI: 862910482019482"
    ciphertext, iv, auth_tag = vault.encrypt(original_secret)

    # Validate output formats
    assert len(iv) == 24  # 12 bytes hex
    assert len(auth_tag) == 32  # 16 bytes hex
    assert len(ciphertext) > 0
    assert ciphertext != original_secret

    # Decrypt and verify exact match
    decrypted = vault.decrypt(ciphertext, iv, auth_tag)
    assert decrypted == original_secret

def test_aes_gcm_tamper_detection():
    """Tampering with ciphertext or auth tag must raise ValueError."""
    test_key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    vault = AESGCMVault(test_key)

    ciphertext, iv, auth_tag = vault.encrypt("Confidential campus evidence")

    # Tampered ciphertext
    tampered_cipher = ("0" if ciphertext[0] != "0" else "1") + ciphertext[1:]
    with pytest.raises(ValueError):
        vault.decrypt(tampered_cipher, iv, auth_tag)

    # Tampered auth tag
    tampered_tag = ("0" if auth_tag[0] != "0" else "1") + auth_tag[1:]
    with pytest.raises(ValueError):
        vault.decrypt(ciphertext, iv, tampered_tag)


@pytest.mark.parametrize('key_value', [
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    base64.b64encode(bytes(range(32))).decode('ascii'),
])
def test_configured_encryption_key_formats_roundtrip(key_value):
    with override_settings(FIELD_ENCRYPTION_KEY=key_value):
        encrypted = encrypt_field('private verification detail')
        assert decrypt_field(encrypted['ciphertext'], encrypted['iv'], encrypted['authTag']) == 'private verification detail'


@pytest.mark.parametrize('key_value', ['too-short', base64.b64encode(b'not-32-bytes').decode('ascii')])
def test_invalid_configured_encryption_key_is_rejected(key_value):
    with override_settings(FIELD_ENCRYPTION_KEY=key_value):
        with pytest.raises(ValueError, match='FIELD_ENCRYPTION_KEY'):
            get_encryption_key()
