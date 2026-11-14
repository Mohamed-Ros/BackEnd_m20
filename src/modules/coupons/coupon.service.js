const Coupon = require('./coupon.model');
const AppError = require('../../utils/errors/appError');
const { ErrorCodes } = require('../../utils/errors/errorCodes');

class CouponService {
  /**
   * Create a new coupon / promo code
   * Supports FREE_SHIPPING, percentage, fixed (strict whole integer values)
   */
  static async createCoupon(data) {
    const rawCode = (data.code || '').trim();
    if (!rawCode) {
      throw new AppError('Coupon code is required.', 400, ErrorCodes.VALIDATION_ERROR, 'CouponService.createCoupon');
    }

    const code = rawCode.toUpperCase();
    const existing = await Coupon.findOne({ code });
    if (existing) {
      throw new AppError(`Coupon '${code}' already exists.`, 400, ErrorCodes.DUPLICATE_RESOURCE, 'CouponService.createCoupon');
    }

    const rawType = (data.discountType || 'percentage').trim();
    const isFreeShipping = rawType.toUpperCase() === 'FREE_SHIPPING' || rawType.toLowerCase() === 'free_shipping';
    const discountType = isFreeShipping ? 'FREE_SHIPPING' : (rawType.toLowerCase() === 'fixed' ? 'fixed' : 'percentage');

    const discountAmount = isFreeShipping ? 0 : Math.max(0, Math.round(Number(data.discountAmount ?? data.discountValue ?? 0)));
    const minPurchaseAmount = Math.max(0, Math.round(Number(data.minPurchaseAmount ?? data.minimumSpend ?? 0)));
    const maxDiscountAmount = data.maxDiscountAmount ? Math.max(0, Math.round(Number(data.maxDiscountAmount))) : null;

    const rawExpiry = data.expiryDate || data.expiresAt;
    const expiryDate = rawExpiry ? new Date(rawExpiry) : null;

    const rawLimit = data.usageLimit ?? data.maxUsage;
    const usageLimit = (rawLimit !== undefined && rawLimit !== null && rawLimit !== '') ? Math.max(1, parseInt(rawLimit, 10)) : null;

    const active = data.active !== undefined ? Boolean(data.active) : true;

    return Coupon.create({
      code,
      discountType,
      discountAmount,
      minPurchaseAmount,
      maxDiscountAmount,
      expiryDate,
      usageLimit,
      active
    });
  }

  /**
   * Validate coupon code against cart total and shipping fee
   */
  static async validateCoupon(code, cartTotal = 0, currentShippingFee = 0) {
    if (!code || typeof code !== 'string' || !code.trim()) {
      throw new AppError('Coupon code is required.', 400, ErrorCodes.VALIDATION_ERROR, 'CouponService.validateCoupon');
    }

    const normalizedCode = code.toUpperCase().trim();
    const coupon = await Coupon.findOne({ code: normalizedCode, active: true });
    if (!coupon) {
      throw new AppError('Invalid or inactive promo code.', 404, ErrorCodes.COUPON_NOT_FOUND, 'CouponService.validateCoupon');
    }

    if (coupon.expiryDate && new Date() > new Date(coupon.expiryDate)) {
      throw new AppError('This promo code has expired.', 400, ErrorCodes.COUPON_EXPIRED, 'CouponService.validateCoupon');
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw new AppError('This promo code usage limit has been reached.', 400, ErrorCodes.INVALID_COUPON, 'CouponService.validateCoupon');
    }

    const subtotal = Math.round(Number(cartTotal) || 0);
    if (coupon.minPurchaseAmount && subtotal < coupon.minPurchaseAmount) {
      throw new AppError(
        `Minimum order subtotal of ${coupon.minPurchaseAmount} EGP required to use code "${coupon.code}".`,
        400,
        ErrorCodes.INVALID_COUPON,
        'CouponService.validateCoupon'
      );
    }

    const isFreeShipping = coupon.discountType === 'FREE_SHIPPING' || coupon.discountType === 'free_shipping';

    if (isFreeShipping) {
      const shippingDeduction = Math.round(Number(currentShippingFee) || 0);
      return {
        coupon,
        discountType: 'FREE_SHIPPING',
        discountAmount: 0,
        shippingDiscount: shippingDeduction,
        isShippingDiscount: true
      };
    }

    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = Math.round((subtotal * coupon.discountAmount) / 100);
      if (coupon.maxDiscountAmount) {
        discount = Math.min(discount, Math.round(coupon.maxDiscountAmount));
      }
    } else {
      discount = Math.min(Math.round(coupon.discountAmount), subtotal);
    }

    return {
      coupon,
      discountType: coupon.discountType,
      discountAmount: discount,
      shippingDiscount: 0,
      isShippingDiscount: false
    };
  }

  /**
   * Get all coupons
   */
  static async getAllCoupons() {
    return Coupon.find().sort({ createdAt: -1 });
  }

  /**
   * Update coupon
   */
  static async updateCoupon(id, data) {
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      throw new AppError('Coupon not found.', 404, ErrorCodes.NOT_FOUND, 'CouponService.updateCoupon');
    }

    if (data.code) {
      const newCode = data.code.toUpperCase().trim();
      if (newCode !== coupon.code) {
        const existing = await Coupon.findOne({ code: newCode, _id: { $ne: id } });
        if (existing) {
          throw new AppError(`Coupon '${newCode}' already exists.`, 400, ErrorCodes.DUPLICATE_RESOURCE, 'CouponService.updateCoupon');
        }
        coupon.code = newCode;
      }
    }

    if (data.discountType) {
      const rawType = data.discountType.trim();
      coupon.discountType = (rawType.toUpperCase() === 'FREE_SHIPPING' || rawType.toLowerCase() === 'free_shipping')
        ? 'FREE_SHIPPING'
        : (rawType.toLowerCase() === 'fixed' ? 'fixed' : 'percentage');
    }

    if (data.discountAmount !== undefined || data.discountValue !== undefined) {
      coupon.discountAmount = coupon.discountType === 'FREE_SHIPPING' ? 0 : Math.round(Number(data.discountAmount ?? data.discountValue ?? 0));
    }

    if (data.minPurchaseAmount !== undefined || data.minimumSpend !== undefined) {
      coupon.minPurchaseAmount = Math.round(Number(data.minPurchaseAmount ?? data.minimumSpend ?? 0));
    }

    if (data.maxDiscountAmount !== undefined) {
      coupon.maxDiscountAmount = data.maxDiscountAmount ? Math.round(Number(data.maxDiscountAmount)) : null;
    }

    if (data.expiryDate !== undefined || data.expiresAt !== undefined) {
      const raw = data.expiryDate ?? data.expiresAt;
      coupon.expiryDate = raw ? new Date(raw) : null;
    }

    if (data.usageLimit !== undefined || data.maxUsage !== undefined) {
      const raw = data.usageLimit ?? data.maxUsage;
      coupon.usageLimit = (raw !== undefined && raw !== null && raw !== '') ? parseInt(raw, 10) : null;
    }

    if (data.active !== undefined) {
      coupon.active = Boolean(data.active);
    }

    await coupon.save();
    return coupon;
  }

  /**
   * Toggle active status
   */
  static async toggleCouponActive(id) {
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      throw new AppError('Coupon not found.', 404, ErrorCodes.NOT_FOUND, 'CouponService.toggleCouponActive');
    }
    coupon.active = !coupon.active;
    await coupon.save();
    return coupon;
  }

  /**
   * Delete coupon
   */
  static async deleteCoupon(id) {
    return Coupon.findByIdAndDelete(id);
  }
}

module.exports = CouponService;
