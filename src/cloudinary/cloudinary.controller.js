const CloudinaryService = require('./cloudinary.service');
const { sendSuccess } = require('../utils/responses/responseHandler');
const { SuccessCodes } = require('../utils/errors/errorCodes');
const AppError = require('../utils/errors/appError');

const ALLOWED_FOLDERS = new Set([
  'm20/products',
  'm20/banners',
  'm20/offers',
  'm20/invoices',
  'm20/receipts',
  'elan/products'
]);

const resolveFolder = (requestedFolder, fallback = 'm20/products') => {
  if (typeof requestedFolder !== 'string') return fallback;
  const clean = requestedFolder.trim();
  return ALLOWED_FOLDERS.has(clean) ? clean : fallback;
};

const formatUploadResult = (result) => ({
  ...result,
  url: result.secure_url,
  publicId: result.public_id
});

class CloudinaryController {
  /**
   * Upload single image handler (Admin Dashboard)
   */
  static async uploadSingleImage(req, res, next) {
    try {
      if (!req.file) {
        throw new AppError('No image file provided in request.', 400, 'VALIDATION_ERROR', 'CloudinaryController.uploadSingleImage');
      }

      const folder = resolveFolder(req.body?.folder, 'm20/products');
      const result = await CloudinaryService.uploadImageStream(req.file.buffer, folder);

      return sendSuccess(
        res,
        201,
        'Image uploaded successfully to Cloudinary.',
        SuccessCodes.CREATED,
        'CloudinaryController.uploadSingleImage',
        formatUploadResult(result)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload multiple images handler (Admin Dashboard)
   */
  static async uploadMultipleImages(req, res, next) {
    try {
      if (!req.files || req.files.length === 0) {
        throw new AppError('No image files provided in request.', 400, 'VALIDATION_ERROR', 'CloudinaryController.uploadMultipleImages');
      }

      const folder = resolveFolder(req.body?.folder, 'm20/products');
      const uploadPromises = req.files.map((file) => CloudinaryService.uploadImageStream(file.buffer, folder));
      const results = await Promise.all(uploadPromises);

      return sendSuccess(
        res,
        201,
        'Multiple images uploaded successfully to Cloudinary.',
        SuccessCodes.CREATED,
        'CloudinaryController.uploadMultipleImages',
        results.map(formatUploadResult)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload customer checkout payment proof screenshot (Public Checkout -> m20/receipts)
   */
  static async uploadPaymentProof(req, res, next) {
    try {
      if (!req.file) {
        throw new AppError('No receipt image provided in request.', 400, 'VALIDATION_ERROR', 'CloudinaryController.uploadPaymentProof');
      }

      const result = await CloudinaryService.uploadImageStream(req.file.buffer, 'm20/receipts');

      return sendSuccess(
        res,
        201,
        'Payment proof uploaded successfully.',
        SuccessCodes.CREATED,
        'CloudinaryController.uploadPaymentProof',
        formatUploadResult(result)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete image handler
   */
  static async deleteImage(req, res, next) {
    try {
      const { publicId } = req.body;
      if (!publicId) {
        throw new AppError('publicId is required to delete image.', 400, 'VALIDATION_ERROR', 'CloudinaryController.deleteImage');
      }

      const result = await CloudinaryService.deleteImage(publicId);

      return sendSuccess(
        res,
        200,
        'Image deleted successfully from Cloudinary.',
        SuccessCodes.DELETED,
        'CloudinaryController.deleteImage',
        result
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CloudinaryController;
