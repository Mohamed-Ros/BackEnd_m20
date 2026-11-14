const express = require('express');
const OfferController = require('./offer.controller');
const { protect, restrictTo } = require('../../middleware/auth');

const router = express.Router();

// Public routes
router.get('/active', OfferController.getActiveOffers);
router.get('/:id', OfferController.getOfferById);

// Admin protected routes
router.get('/', protect, restrictTo('admin'), OfferController.getAllOffers);
router.post('/', protect, restrictTo('admin'), OfferController.createOffer);
router.patch('/:id', protect, restrictTo('admin'), OfferController.updateOffer);
router.patch('/:id/toggle-active', protect, restrictTo('admin'), OfferController.toggleActive);
router.delete('/:id', protect, restrictTo('admin'), OfferController.deleteOffer);

module.exports = router;
