const express = require('express');
const CloudinaryController = require('./cloudinary.controller');
const { uploadSingle, uploadArray } = require('./cloudinary.middleware');
const { protect, restrictTo } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/upload', protect, restrictTo('admin', 'superadmin'), uploadSingle('image'), CloudinaryController.uploadSingleImage);
router.post('/upload-multiple', protect, restrictTo('admin', 'superadmin'), uploadArray('images', 5), CloudinaryController.uploadMultipleImages);
router.post('/upload-proof', authRateLimiter, uploadSingle('image'), CloudinaryController.uploadPaymentProof);
router.delete('/delete', protect, restrictTo('admin', 'superadmin'), CloudinaryController.deleteImage);

module.exports = router;
