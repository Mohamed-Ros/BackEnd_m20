const express = require('express');
const router = express.Router();
const formulaController = require('./formula.controller');
const { protect, restrictTo } = require('../../middleware/auth');

router.use(protect);
router.use(restrictTo('admin', 'staff'));

router.get('/', formulaController.getAll);
router.post('/preview', formulaController.preview);
router.get('/:id', formulaController.getById);
router.post('/', formulaController.create);
router.patch('/:id', formulaController.update);
router.delete('/:id', formulaController.deleteFormula);
router.post('/:id/new-version', formulaController.createVersion);

module.exports = router;
