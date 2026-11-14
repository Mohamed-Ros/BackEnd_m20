const express = require('express');
const router = express.Router();
const purchaseController = require('./purchase.controller');
const { protect, restrictTo } = require('../../middleware/auth');

router.use(protect);
router.use(restrictTo('admin', 'staff'));

router.get('/', purchaseController.getAll);
router.get('/:id', purchaseController.getById);
router.post('/', purchaseController.create);
router.put('/:id', purchaseController.update);
router.patch('/:id', purchaseController.update);
router.delete('/:id', purchaseController.deletePurchase);

module.exports = router;

