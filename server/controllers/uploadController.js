// uploadController.js – Controller for product & shop image uploads and durable streaming
import {
  storeProductImage,
  getProductImageStream,
  storeShopImage,
  getShopImageStream,
  cleanupOldShopImage
} from '../services/imageStorageService.js';
import Vendor from '../models/Vendor.js';

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

    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const canonicalUrl = `${protocol}://${req.get('host')}${stored.path}`;

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

export const uploadShopPhoto = async (req, res) => {
  try {
    const callerVendorId = req.user?.vendorId || req.user?.id || req.user?._id;
    if (!callerVendorId) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Vendor authentication required to upload shop photo.'
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        code: 'NO_FILE_UPLOADED',
        message: 'No image file was uploaded. Please attach an image in field "image".'
      });
    }

    const vendor = await Vendor.findById(callerVendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        code: 'VENDOR_NOT_FOUND',
        message: 'Merchant store not found.'
      });
    }

    const { buffer, originalname, mimetype } = req.file;

    const stored = await storeShopImage({
      buffer,
      originalName: originalname,
      mimeType: mimetype,
      vendorId: callerVendorId
    });

    // Cleanup prior GridFS photo if present
    if (vendor.banner && vendor.banner.includes('/shop-photos/')) {
      await cleanupOldShopImage(vendor.banner, callerVendorId);
    }

    // Persist portable image reference
    vendor.banner = stored.path;
    await vendor.save();

    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const canonicalUrl = `${protocol}://${req.get('host')}${stored.path}`;

    res.status(200).json({
      success: true,
      message: 'Shop cover photo uploaded and saved successfully.',
      url: canonicalUrl,
      path: stored.path,
      fileId: stored.fileId,
      filename: stored.filename,
      size: stored.size,
      mimeType: stored.mimeType,
      vendor
    });
  } catch (err) {
    console.error('Error during shop photo upload:', err.message);
    res.status(400).json({
      success: false,
      code: 'UPLOAD_FAILED',
      message: err.message || 'Shop photo upload failed.'
    });
  }
};

export const serveShopPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getShopImageStream(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        code: 'IMAGE_NOT_FOUND',
        message: 'Requested shop photo does not exist or was deleted.'
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
    console.error('Error serving shop photo:', err.message);
    res.status(500).json({
      success: false,
      code: 'IMAGE_SERVE_ERROR',
      message: 'Failed to retrieve shop photo.'
    });
  }
};

export const deleteShopPhoto = async (req, res) => {
  try {
    const callerVendorId = req.user?.vendorId || req.user?.id || req.user?._id;
    if (!callerVendorId) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Vendor authentication required.'
      });
    }

    const vendor = await Vendor.findById(callerVendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        code: 'VENDOR_NOT_FOUND',
        message: 'Merchant store not found.'
      });
    }

    if (vendor.banner && vendor.banner.includes('/shop-photos/')) {
      await cleanupOldShopImage(vendor.banner, callerVendorId);
    }

    vendor.banner = '';
    await vendor.save();

    res.status(200).json({
      success: true,
      message: 'Shop cover photo removed successfully.',
      vendor
    });
  } catch (err) {
    console.error('Error removing shop photo:', err.message);
    res.status(500).json({
      success: false,
      code: 'DELETE_FAILED',
      message: 'Failed to remove shop photo.'
    });
  }
};
