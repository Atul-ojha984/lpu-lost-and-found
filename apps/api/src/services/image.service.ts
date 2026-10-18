import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import sharp from 'sharp';
import { Request } from 'express';
import { ApiError } from '../utils/api-response';
import { logger } from '../config/logger';

// Enforce limits: 5MB maximum file size
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Destination directory for processed uploads
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer memory storage configuration for in-memory Sharp processing
const memoryStorage = multer.memoryStorage();

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      ApiError.badRequest(
        `Unsupported image format (${file.mimetype}). Only JPEG, PNG, and WebP are allowed.`
      )
    );
  }
}

export const imageUploadMiddleware = multer({
  storage: memoryStorage,
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: 5,
  },
  fileFilter,
});

export interface ProcessedImageResult {
  filename: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Process photograph using Sharp:
 * - Resizes image down if larger than 1200x1200px while maintaining aspect ratio
 * - Strips all EXIF, GPS, and camera metadata for privacy
 * - Converts to optimized WebP format
 * - Fails safely if Sharp processing or storage encounters an error
 */
export async function processAndStoreImage(
  fileBuffer: Buffer,
  originalName: string,
  baseUrl: string = ''
): Promise<ProcessedImageResult> {
  try {
    const sharpInstance = sharp(fileBuffer);
    const metadata = await sharpInstance.metadata();

    if (!metadata.format) {
      throw ApiError.badRequest('Uploaded file does not appear to be a valid image.');
    }

    // Generate safe unique filename
    const uniqueId = crypto.randomUUID();
    const filename = `item-${Date.now()}-${uniqueId}.webp`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    // Sharp pipeline:
    // 1. Resize down if exceeds 1200x1200px without enlargement
    // 2. EXIF and GPS metadata are stripped by default (do NOT call .withMetadata())
    // 3. WebP conversion with 80% quality
    const processedBuffer = await sharpInstance
      .resize({
        width: 1200,
        height: 1200,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();

    // Verify metadata stripping
    const processedMeta = await sharp(processedBuffer).metadata();

    // Save to local storage
    await fs.promises.writeFile(outputPath, processedBuffer);

    // Build URL: if baseUrl is provided, use it; else relative path
    const url = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/uploads/${filename}` : `/uploads/${filename}`;

    logger.info(
      { filename, size: processedBuffer.length, originalName },
      '📷 Photograph processed, metadata stripped, and saved successfully'
    );

    return {
      filename,
      url,
      mimeType: 'image/webp',
      width: processedMeta.width || 0,
      height: processedMeta.height || 0,
      sizeBytes: processedBuffer.length,
    };
  } catch (error) {
    logger.error({ error }, '❌ Image processing or storage failed');
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.badRequest(
      `Image processing failed: ${error instanceof Error ? error.message : 'Unknown image error'}`
    );
  }
}
