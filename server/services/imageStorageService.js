// imageStorageService.js – Durable MongoDB GridFS and Object Storage for Product Images
import mongoose from 'mongoose';
import crypto from 'crypto';

const BUCKET_NAME = 'product_images';
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
]);

/**
 * Validates the file buffer magic bytes against common image signatures
 */
export function validateImageMagicBytes(buffer, mimeType) {
  if (!buffer || buffer.length < 12) {
    return { valid: false, reason: 'File buffer too small to be a valid image.' };
  }

  // JPEG: FF D8 FF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  // GIF: GIF87a or GIF89a (47 49 46 38)
  const isGif =
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38;

  // WEBP: "RIFF" .... "WEBP"
  const isWebp =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;

  if (isJpeg || isPng || isGif || isWebp) {
    let detectedMime = isJpeg
      ? 'image/jpeg'
      : isPng
      ? 'image/png'
      : isGif
      ? 'image/gif'
      : 'image/webp';
    return { valid: true, detectedMime };
  }

  return { valid: false, reason: 'Buffer signature does not match supported image formats (JPEG, PNG, WEBP, GIF).' };
}

/**
 * Gets or initializes the MongoDB GridFS Bucket for durable image storage
 */
export function getGridFSBucket() {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established.');
  }
  return new mongoose.mongo.GridFSBucket(db, {
    bucketName: BUCKET_NAME
  });
}

/**
 * Stores a validated product image buffer into MongoDB GridFS
 */
export async function storeProductImage({ buffer, originalName, mimeType, vendorId }) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Image data cannot be empty.');
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Image size (${Math.round(buffer.length / 1024)} KB) exceeds the 5 MB limit.`);
  }

  const normalizedMime = (mimeType || '').toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw new Error(`Unsupported image MIME type "${mimeType}". Allowed types: JPEG, PNG, WEBP, GIF.`);
  }

  const magicCheck = validateImageMagicBytes(buffer, normalizedMime);
  if (!magicCheck.valid) {
    throw new Error(`Security validation failed: ${magicCheck.reason}`);
  }

  const extension = magicCheck.detectedMime === 'image/png'
    ? 'png'
    : magicCheck.detectedMime === 'image/webp'
    ? 'webp'
    : magicCheck.detectedMime === 'image/gif'
    ? 'gif'
    : 'jpg';

  const safeVendorId = String(vendorId || 'unassigned').replace(/[^a-zA-Z0-9]/g, '');
  const uniqueToken = crypto.randomBytes(6).toString('hex');
  const safeFilename = `prod-${safeVendorId}-${Date.now()}-${uniqueToken}.${extension}`;

  const bucket = getGridFSBucket();

  const metadata = {
    vendorId: String(vendorId),
    originalName: (originalName || 'upload').slice(0, 100).replace(/[^a-zA-Z0-9._-]/g, '_'),
    mimeType: magicCheck.detectedMime,
    size: buffer.length,
    uploadedAt: new Date(),
    isConfirmed: false,
    associatedProductId: null
  };

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(safeFilename, {
      metadata,
      contentType: magicCheck.detectedMime
    });

    uploadStream.on('error', (err) => {
      reject(new Error(`GridFS upload failed: ${err.message}`));
    });

    uploadStream.on('finish', () => {
      const fileId = (uploadStream.id || (uploadStream.gridFSFile && uploadStream.gridFSFile._id) || '').toString();
      resolve({
        fileId,
        filename: safeFilename,
        mimeType: magicCheck.detectedMime,
        size: buffer.length,
        path: `/api/uploads/product-images/${fileId}`
      });
    });

    uploadStream.end(buffer);
  });
}

/**
 * Retrieves an image stream and its metadata by GridFS file ID
 */
export async function getProductImageStream(fileId) {
  if (!fileId || !mongoose.isValidObjectId(fileId)) {
    return null;
  }

  const bucket = getGridFSBucket();
  const objectId = new mongoose.Types.ObjectId(fileId);

  const files = await bucket.find({ _id: objectId }).toArray();
  if (!files || files.length === 0) {
    return null;
  }

  const file = files[0];
  const stream = bucket.openDownloadStream(objectId);

  return {
    file,
    stream,
    mimeType: file.metadata?.mimeType || file.contentType || 'image/jpeg',
    length: file.length,
    filename: file.filename
  };
}

/**
 * Confirms and links an uploaded image to a published product
 */
export async function confirmProductImage(fileIdOrPath, productId) {
  if (!fileIdOrPath) return;

  let fileId = fileIdOrPath;
  if (typeof fileIdOrPath === 'string' && fileIdOrPath.includes('/product-images/')) {
    fileId = fileIdOrPath.split('/product-images/').pop().split('?')[0];
  }

  if (!mongoose.isValidObjectId(fileId)) return;

  try {
    const db = mongoose.connection.db;
    if (!db) return;

    await db.collection(`${BUCKET_NAME}.files`).updateOne(
      { _id: new mongoose.Types.ObjectId(fileId) },
      {
        $set: {
          'metadata.isConfirmed': true,
          'metadata.associatedProductId': productId ? String(productId) : null
        }
      }
    );
  } catch (err) {
    console.warn(`[ImageStorage] Failed to confirm image ${fileId}:`, err.message);
  }
}
