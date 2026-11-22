const OrderService = require('./order.service');
const SettingsService = require('../settings/settings.service');
const CouponService = require('../coupons/coupon.service');
const { sendSuccess } = require('../../utils/responses/responseHandler');
const { SuccessCodes } = require('../../utils/errors/errorCodes');

class OrderController {
  /**
   * Create order (Supports both Authenticated Customer and Guest Checkout)
   */
  static async createOrder(req, res, next) {
    try {
      const customerId = req.user ? req.user._id : null;
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.ip;
      const userAgent = req.headers['user-agent'] || '';
      const order = await OrderService.createOrder(customerId, {
        ...req.body,
        clientIp,
        userAgent,
        fbp: req.cookies?._fbp || req.body.fbp,
        fbc: req.cookies?._fbc || req.body.fbc
      });

      return sendSuccess(
        res,
        201,
        'Order created successfully.',
        SuccessCodes.CREATED,
        'OrderController.createOrder',
        order
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Get marketing attribution and channel analytics
   */
  static async getMarketingAnalytics(req, res, next) {
    try {
      const analytics = await OrderService.getMarketingAnalytics(req.query);
      return sendSuccess(
        res,
        200,
        'Marketing analytics retrieved successfully.',
        SuccessCodes.FETCHED,
        'OrderController.getMarketingAnalytics',
        analytics
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Track order by Order Number or Phone (Public)
   */
  static async trackOrder(req, res, next) {
    try {
      const query = req.params.query || req.body.query || req.query.query;
      const orders = await OrderService.trackOrder(query);

      return sendSuccess(
        res,
        200,
        'Order tracking details retrieved successfully.',
        SuccessCodes.FETCHED,
        'OrderController.trackOrder',
        orders
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Calculate shipping quote (Public or Customer) - uses dynamic Settings rates
   */
  static async getShippingQuote(req, res, next) {
    try {
      const { deliveryMethod, governorate, city, subtotal, couponCode } = req.body;
      const settings = await SettingsService.getSettings();
      const sub = Math.round(parseFloat(subtotal) || 0);
      const fees = OrderService.calculateShippingFromSettings(
        settings,
        deliveryMethod,
        governorate,
        sub
      );

      let shippingDiscount = 0;
      let isShippingFreePromo = false;
      let promoDetails = null;

      if (couponCode && typeof couponCode === 'string' && couponCode.trim()) {
        try {
          const couponRes = await CouponService.validateCoupon(
            couponCode.trim(),
            sub,
            fees.shippingFee
          );
          if (couponRes && (couponRes.discountType === 'FREE_SHIPPING' || couponRes.isShippingDiscount)) {
            shippingDiscount = fees.shippingFee;
            isShippingFreePromo = true;
            promoDetails = {
              code: couponRes.coupon?.code || couponCode.trim().toUpperCase(),
              discountType: 'FREE_SHIPPING',
              shippingDiscount
            };
          }
        } catch (err) {
          // If coupon is invalid or not a shipping promo, proceed with standard shipping
        }
      }

      const effectiveShippingFee = Math.max(0, fees.shippingFee - shippingDiscount);
      const feeToAdd = deliveryMethod === 'metro_pickup' ? fees.metroPickupFee : effectiveShippingFee;

      return sendSuccess(
        res,
        200,
        'Shipping quote calculated successfully.',
        SuccessCodes.FETCHED,
        'OrderController.getShippingQuote',
        {
          subtotal: sub,
          shippingFee: fees.shippingFee,
          shippingDiscount,
          effectiveShippingFee,
          metroPickupFee: fees.metroPickupFee,
          isShippingFreePromo,
          promoDetails,
          total: sub + feeToAdd
        }
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get customer orders
   */
  static async getMyOrders(req, res, next) {
    try {
      const result = await OrderService.getCustomerOrders(req.user._id, req.query);

      return sendSuccess(
        res,
        200,
        'Customer orders retrieved successfully.',
        SuccessCodes.FETCHED,
        'OrderController.getMyOrders',
        result
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get single order details
   */
  static async getOrderById(req, res, next) {
    try {
      const customerId = req.user.role === 'admin' ? null : req.user._id;
      const order = await OrderService.getOrderById(req.params.id, customerId);

      return sendSuccess(
        res,
        200,
        'Order details retrieved successfully.',
        SuccessCodes.FETCHED,
        'OrderController.getOrderById',
        order
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Get all orders
   */
  static async getLedger(req, res, next) {
    try {
      const result = await OrderService.getLedger(req.query);
      return sendSuccess(res, 200, 'Orders ledger retrieved successfully.', SuccessCodes.FETCHED, 'OrderController.getLedger', result);
    } catch (error) {
      next(error);
    }
  }

  static async getAllOrders(req, res, next) {
    try {
      const result = await OrderService.getAllOrders(req.query);

      return sendSuccess(
        res,
        200,
        'Orders list retrieved successfully.',
        SuccessCodes.FETCHED,
        'OrderController.getAllOrders',
        result
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Update order status
   */
  static async updateOrderStatus(req, res, next) {
    try {
      const order = await OrderService.updateOrderStatus(req.params.id, req.body, req.user);

      return sendSuccess(
        res,
        200,
        'Order status updated successfully.',
        SuccessCodes.UPDATED,
        'OrderController.updateOrderStatus',
        order
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Confirm physical inspection and inventory restock for returned order
   */
  static async confirmReturnRestock(req, res, next) {
    try {
      const order = await OrderService.confirmReturnRestock(req.params.id, req.body, req.user);

      return sendSuccess(
        res,
        200,
        'Returned products inspection and inventory restock processed successfully.',
        SuccessCodes.UPDATED,
        'OrderController.confirmReturnRestock',
        order
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Process customer refund for returned paid order
   */
  static async processReturnRefund(req, res, next) {
    try {
      const order = await OrderService.processReturnRefund(req.params.id, req.body, req.user);

      return sendSuccess(
        res,
        200,
        'Customer refund for returned order processed successfully.',
        SuccessCodes.UPDATED,
        'OrderController.processReturnRefund',
        order
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Verify order payment and credit cash account
   */
  static async verifyPayment(req, res, next) {
    try {
      const order = await OrderService.verifyOrderPayment(
        req.params.id,
        req.body,
        req.user
      );

      return sendSuccess(
        res,
        200,
        'Order payment successfully verified and recorded.',
        SuccessCodes.UPDATED,
        'OrderController.verifyPayment',
        order
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Public: Invoice QR Code verification
   */
  static async publicVerify(req, res, next) {
    try {
      const verification = await OrderService.getPublicVerification(req.params.orderNumber);

      return sendSuccess(
        res,
        200,
        'Order verification details retrieved.',
        SuccessCodes.FETCHED,
        'OrderController.publicVerify',
        verification
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Create manual order directly from Dashboard
   */
  static async createAdminOrder(req, res, next) {
    try {
      const order = await OrderService.createAdminOrder(req.body, req.user);

      return sendSuccess(
        res,
        201,
        'Manual order created successfully.',
        SuccessCodes.CREATED,
        'OrderController.createAdminOrder',
        order
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Delete a single order
   */
  static async deleteOrder(req, res, next) {
    try {
      const result = await OrderService.deleteOrders(
        { ids: [req.params.id], restoreStock: req.query.restoreStock !== 'false' },
        req.user
      );
      return sendSuccess(res, 200, 'Order deleted successfully.', SuccessCodes.FETCHED, 'OrderController.deleteOrder', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin: Bulk delete selected orders, or all orders (requires confirmation text)
   */
  static async bulkDeleteOrders(req, res, next) {
    try {
      const result = await OrderService.deleteOrders(req.body || {}, req.user);
      return sendSuccess(res, 200, `${result.deletedCount} order(s) deleted successfully.`, SuccessCodes.FETCHED, 'OrderController.bulkDeleteOrders', result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = OrderController;
