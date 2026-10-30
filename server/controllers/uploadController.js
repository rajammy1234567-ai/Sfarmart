// uploadController.js – Controller for product image uploads and durable streaming
import { storeProductImage, getProductImageStream } from '../services/imageStorageService.js';

export const uploadProductImage = async (req, res) => {
  try {
    const callerVendorId = req.user?.vendorId || req.user?.id || req.user?._id;
    if (!callerVendorId) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Vendor authentication required to upload product photos.'
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        code: 'NO_FILE_UPLOADED',
        message: 'No image file was uploaded. Please attach an image in field "image".'
      });
    }

    const { buffer, originalname, mimetype } = req.file;

    const stored = await storeProductImage({
      buffer,
      originalName: originalname,
      mimeType: mimetype,
      vendorId: callerVendorId
    });

    const canonicalUrl = `${req.protocol}://${req.get('host')}${stored.path}`;

    res.status(201).json({
      success: true,
      message: 'Product photo uploaded and stored persistently.',
      url: canonicalUrl,
      path: stored.path,
      fileId: stored.fileId,
      filename: stored.filename,
      size: stored.size,
      mimeType: stored.mimeType
    });
  } catch (err) {
    console.error('Error during product image upload:', err.message);
    res.status(400).json({
      success: false,
      code: 'UPLOAD_FAILED',
      message: err.message || 'Image upload failed.'
    });
  }
};

export const serveProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getProductImageStream(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        code: 'IMAGE_NOT_FOUND',
        message: 'Requested image does not exist or was deleted.'
      });
    }

    const etag = result.file._id.toString();
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', result.length);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('ETag', etag);

    result.stream.pipe(res);
  } catch (err) {
    console.error('Error serving product image:', err.message);
    res.status(500).json({
      success: false,
      code: 'IMAGE_SERVE_ERROR',
      message: 'Failed to retrieve image.'
    });
  }
};

