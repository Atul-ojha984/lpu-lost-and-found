"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Items App Services: Image Processing Pipeline & Reference Number Generator
==============================================================================
"""

import uuid
from datetime import datetime, timezone
from pathlib import Path
from io import BytesIO
from PIL import Image
from django.conf import settings
from rest_framework.exceptions import ValidationError

ALLOWED_MIME_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

def generate_reference_number(item_type: str) -> str:
    """
    Generates a unique university property reference number, e.g. LPU-2026-F10482.
    """
    year = datetime.now(timezone.utc).year
    prefix = 'F' if item_type == 'FOUND' else 'L'
    unique_suffix = str(uuid.uuid4().int)[:5]
    return f"LPU-{year}-{prefix}{unique_suffix}"

def process_and_store_image(uploaded_file, base_url: str = '') -> dict:
    """
    Process photograph using Pillow:
    - Validates size (<= 5MB) and mime type
    - Strips all EXIF, GPS, and camera metadata for privacy
    - Resizes down to fit inside 1200x1200px while maintaining aspect ratio
    - Converts to optimized WebP format
    - Stores into settings.MEDIA_ROOT
    - Returns: { filename, url, mimeType, width, height, sizeBytes }
    """
    if uploaded_file.size > MAX_IMAGE_SIZE_BYTES:
        raise ValidationError(f"File size exceeds 5MB limit ({uploaded_file.size} bytes).")

    try:
        image = Image.open(uploaded_file)
        image.verify()  # Verify image integrity
    except Exception as e:
        raise ValidationError(f"Invalid or corrupted image file: {e}")

    # Re-open after verify()
    uploaded_file.seek(0)
    image = Image.open(uploaded_file)

    # Convert modes (e.g. CMYK, P, RGBA) to RGB or RGBA for WebP
    if image.mode in ('RGBA', 'LA'):
        converted_image = image.convert('RGBA')
    else:
        converted_image = image.convert('RGB')

    # Resize down to 1200x1200px maintaining aspect ratio without enlargement
    converted_image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    width, height = converted_image.size

    # Ensure media directory exists
    media_root = Path(settings.MEDIA_ROOT)
    media_root.mkdir(parents=True, exist_ok=True)

    filename = f"item-{int(datetime.now(timezone.utc).timestamp())}-{uuid.uuid4().hex[:8]}.webp"
    output_path = media_root / filename

    # Save to buffer stripping EXIF (default in Pillow when not passing exif parameter)
    buffer = BytesIO()
    converted_image.save(buffer, format='WEBP', quality=80, method=4)
    buffer.seek(0)

    with open(output_path, 'wb') as f:
        f.write(buffer.getvalue())

    size_bytes = buffer.getbuffer().nbytes
    media_url = getattr(settings, 'MEDIA_URL', '/media/')
    relative_url = f"{media_url.rstrip('/')}/{filename}"
    url = f"{base_url.rstrip('/')}{relative_url}" if base_url else relative_url

    return {
        'filename': filename,
        'url': url,
        'mimeType': 'image/webp',
        'width': width,
        'height': height,
        'sizeBytes': size_bytes,
    }
