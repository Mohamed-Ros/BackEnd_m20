const CouponService = require('./coupon.service');
const { sendSuccess } = require('../../utils/responses/responseHandler');
const { SuccessCodes } = require('../../utils/errors/errorCodes');

class CouponController {
  static async createCoupon(req, res, next) {
    try {
      const coupon = await CouponService.createCoupon(req.body);
      return sendSuccess(res, 201, 'Coupon created successfully.', SuccessCodes.CREATED, 'CouponController.createCoupon', coupon);
    } catch (error) {
      next(error);
    }
  }

  static async validateCoupon(req, res, next) {
    try {
      const { code, cartTotal, subtotal, shippingFee } = req.body;
      const totalAmount = parseFloat(cartTotal !== undefined ? cartTotal : subtotal) || 0;
      const fee = parseFloat(shippingFee) || 0;
      const result = await CouponService.validateCoupon(code, totalAmount, fee);
      return sendSuccess(res, 200, 'Coupon applied successfully.', SuccessCodes.OK, 'CouponController.validateCoupon', result);
    } catch (error) {
      next(error);
    }
  }

  static async getAllCoupons(req, res, next) {
    try {
      const coupons = await CouponService.getAllCoupons();
      return sendSuccess(res, 200, 'Coupons list retrieved.', SuccessCodes.FETCHED, 'CouponController.getAllCoupons', coupons);
    } catch (error) {
      next(error);
    }
  }

  static async updateCoupon(req, res, next) {
    try {
      const coupon = await CouponService.updateCoupon(req.params.id, req.body);
      return sendSuccess(res, 200, 'Coupon updated successfully.', SuccessCodes.UPDATED, 'CouponController.updateCoupon', coupon);
    } catch (error) {
      next(error);
    }
  }

  static async toggleActive(req, res, next) {
    try {
      const coupon = await CouponService.toggleCouponActive(req.params.id);
      return sendSuccess(res, 200, 'Coupon status toggled successfully.', SuccessCodes.UPDATED, 'CouponController.toggleActive', coupon);
    } catch (error) {
      next(error);
    }
  }

  static async deleteCoupon(req, res, next) {
    try {
      await CouponService.deleteCoupon(req.params.id);
      return sendSuccess(res, 200, 'Coupon deleted.', SuccessCodes.DELETED, 'CouponController.deleteCoupon', null);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CouponController;
