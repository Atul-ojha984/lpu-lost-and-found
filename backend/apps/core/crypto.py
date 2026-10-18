"""
==============================================================================
LPU Lost & Found Property Recovery Platform
AES-256-GCM Symmetric Cryptography Engine
==============================================================================
Maintains 100% cryptographic parity with Node.js crypto AES-256-GCM cipher.
Uses 12-byte IV and 16-byte authentication tag.
"""

import os
import binascii
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings

def get_encryption_key() -> bytes:
    key_hex = getattr(settings, 'FIELD_ENCRYPTION_KEY', None) or os.getenv('FIELD_ENCRYPTION_KEY')
    if not key_hex or len(key_hex) != 64:
        raise ValueError("FIELD_ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes).")
    return binascii.unhexlify(key_hex)

def encrypt_field(plaintext: str) -> dict:
    """
    Encrypts a string using AES-256-GCM with a random 12-byte IV.
    Returns: { 'ciphertext': hex, 'iv': hex (24 chars), 'authTag': hex (32 chars) }
    """
    if not plaintext:
        return {'ciphertext': '', 'iv': '', 'authTag': ''}

    key = get_encryption_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(12)  # 12 bytes = 24 hex chars
    
    # In cryptography library, AESGCM.encrypt appends 16-byte tag to the ciphertext
    combined = aesgcm.encrypt(iv, plaintext.encode('utf-8'), None)
    ciphertext = combined[:-16]
    tag = combined[-16:]

    return {
        'ciphertext': binascii.hexlify(ciphertext).decode('utf-8'),
        'iv': binascii.hexlify(iv).decode('utf-8'),
        'authTag': binascii.hexlify(tag).decode('utf-8'),
    }

def decrypt_field(ciphertext_hex: str, iv_hex: str, tag_hex: str) -> str:
    """
    Decrypts an AES-256-GCM ciphertext using the given IV and authentication tag.
    """
    if not ciphertext_hex or not iv_hex or not tag_hex:
        return ''

    key = get_encryption_key()
    aesgcm = AESGCM(key)
    
    iv = binascii.unhexlify(iv_hex)
    ciphertext = binascii.unhexlify(ciphertext_hex)
    tag = binascii.unhexlify(tag_hex)
    combined = ciphertext + tag

    decrypted_bytes = aesgcm.decrypt(iv, combined, None)
    return decrypted_bytes.decode('utf-8')

class AESGCMVault:
    """Object-oriented AES-256-GCM cipher vault supporting custom hex keys."""

    def __init__(self, hex_key: str = None):
        if hex_key:
            if len(hex_key) != 64:
                raise ValueError("hex_key must be a 64-character hexadecimal string.")
            self.key = binascii.unhexlify(hex_key)
        else:
            self.key = get_encryption_key()
        self.aesgcm = AESGCM(self.key)

    def encrypt(self, plaintext: str):
        if not plaintext:
            return '', '', ''
        iv = os.urandom(12)
        combined = self.aesgcm.encrypt(iv, plaintext.encode('utf-8'), None)
        ciphertext = combined[:-16]
        tag = combined[-16:]
        return (
            binascii.hexlify(ciphertext).decode('utf-8'),
            binascii.hexlify(iv).decode('utf-8'),
            binascii.hexlify(tag).decode('utf-8'),
        )

    def decrypt(self, ciphertext_hex: str, iv_hex: str, tag_hex: str) -> str:
        if not ciphertext_hex or not iv_hex or not tag_hex:
            return ''
        try:
            iv = binascii.unhexlify(iv_hex)
            ciphertext = binascii.unhexlify(ciphertext_hex)
            tag = binascii.unhexlify(tag_hex)
            combined = ciphertext + tag
            decrypted_bytes = self.aesgcm.decrypt(iv, combined, None)
            return decrypted_bytes.decode('utf-8')
        except Exception as e:
            raise ValueError(f"AES-GCM decryption failed: {e}")

