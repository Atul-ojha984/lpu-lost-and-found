import { describe, it, expect, afterAll } from 'vitest';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { processAndStoreImage, UPLOADS_DIR } from '../../src/services/image.service';

describe('Sharp Image Processing Pipeline', () => {
  const createdFiles: string[] = [];

  afterAll(async () => {
    // Clean up test image files created in uploads directory
    for (const f of createdFiles) {
      try {
        const fullPath = path.join(UPLOADS_DIR, f);
        if (fs.existsSync(fullPath)) {
          await fs.promises.unlink(fullPath);
        }
      } catch {
        // Ignore cleanup error
      }
    }
  });

  it('should process a valid image buffer, convert to WebP, and strip EXIF metadata', async () => {
    // Generate a valid 400x300 PNG with red background and dummy text
    const sampleBuffer = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 218, g: 41, b: 28 }, // LPU red
      },
    })
      .png()
      .toBuffer();

    const result = await processAndStoreImage(sampleBuffer, 'sample-item.png', 'http://localhost:5000');
    createdFiles.push(result.filename);

    expect(result).toHaveProperty('filename');
    expect(result.mimeType).toBe('image/webp');
    expect(result.url).toContain('/uploads/');
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);

    // Verify output file on disk
    const savedPath = path.join(UPLOADS_DIR, result.filename);
    expect(fs.existsSync(savedPath)).toBe(true);

    // Inspect processed file metadata
    const diskMeta = await sharp(savedPath).metadata();
    expect(diskMeta.format).toBe('webp');
    // Confirm GPS/EXIF is absent
    expect(diskMeta.exif).toBeUndefined();
    expect(diskMeta.iptc).toBeUndefined();
    expect(diskMeta.xmp).toBeUndefined();
  });

  it('should automatically downscale images exceeding 1200x1200px while preserving aspect ratio', async () => {
    // Create an oversized 2000x1000 image
    const largeBuffer = await sharp({
      create: {
        width: 2000,
        height: 1000,
        channels: 3,
        background: { r: 50, g: 50, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await processAndStoreImage(largeBuffer, 'large-photo.jpg');
    createdFiles.push(result.filename);

    // 2000x1000 resized inside 1200x1200 gives 1200x600 (aspect ratio 2:1 preserved)
    expect(result.width).toBe(1200);
    expect(result.height).toBe(600);
    expect(result.mimeType).toBe('image/webp');
  });

  it('should fail safely when provided with invalid non-image data', async () => {
    const invalidBuffer = Buffer.from('This is a text string, not an image format.');

    await expect(
      processAndStoreImage(invalidBuffer, 'corrupt.jpg')
    ).rejects.toThrow(/image/i);
  });
});
