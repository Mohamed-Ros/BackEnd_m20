const express = require('express');
const MarketingController = require('./marketing.controller');
const { protect, restrictTo } = require('../../middleware/auth');

const router = express.Router();

// Public: Storefront internal conversion funnel event ingestion
router.post('/event', MarketingController.recordEvent);

// Protected Admin Analytics & Spend Management
router.use(protect);
router.use(restrictTo('admin', 'inventory_manager'));

router.get('/dashboard', MarketingController.getDashboard);
router.get('/ad-spend', MarketingController.getAdSpends);
router.post('/ad-spend', restrictTo('admin'), MarketingController.createAdSpend);
router.delete('/ad-spend/:id', restrictTo('admin'), MarketingController.deleteAdSpend);

module.exports = router;
