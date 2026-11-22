const express = require('express');
const ProductController = require('./product.controller');
const validate = require('../../middleware/validation');
const { createProductSchema, updateProductSchema } = require('./product.validation');
const { protect, optionalProtect, restrictTo } = require('../../middleware/auth');

const router = express.Router();

// Public Product Catalog Routes
router.get('/', optionalProtect, ProductController.getAllProducts);
router.get('/slug/:slug', optionalProtect, ProductController.getProductBySlug);
router.get('/:id', optionalProtect, ProductController.getProductById);

// Admin Inventory & Management Routes
router.get('/admin/low-stock', protect, restrictTo('admin'), ProductController.getLowStockProducts);
router.post('/', protect, restrictTo('admin'), validate(createProductSchema, 'Product.Create'), ProductController.createProduct);
router.patch('/:id', protect, restrictTo('admin'), validate(updateProductSchema, 'Product.Update'), ProductController.updateProduct);
router.delete('/:id', protect, restrictTo('admin'), ProductController.deleteProduct);

module.exports = router;
