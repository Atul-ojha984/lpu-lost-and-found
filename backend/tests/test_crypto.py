"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Phase 1 Test Suite: AES-256-GCM Cryptographic Vault
==============================================================================
"""

import pytest
from apps.core.crypto import AESGCMVault

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
