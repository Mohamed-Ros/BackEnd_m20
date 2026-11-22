const MarketingService = require('./marketing.service');
const { sendSuccess } = require('../../utils/responses/responseHandler');
const { SuccessCodes } = require('../../utils/errors/errorCodes');

class MarketingController {
  /**
   * Get complete Marketing & Ads Analytics dashboard data
   */
  static async getDashboard(req, res, next) {
    try {
      const data = await MarketingService.getMarketingDashboard(req.query);
      return sendSuccess(
        res,
        200,
        'Marketing analytics dashboard retrieved successfully.',
        SuccessCodes.FETCHED,
        'MarketingController.getDashboard',
        data
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Live storefront traffic overview
   */
  static async getTraffic(req, res, next) {
    try {
      const data = await MarketingService.getTrafficOverview();
      return sendSuccess(
        res,
        200,
        'Traffic overview retrieved successfully.',
        SuccessCodes.FETCHED,
        'MarketingController.getTraffic',
        data
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get logged ad spend entries
   */
  static async getAdSpends(req, res, next) {
    try {
      const spends = await MarketingService.getAdSpends(req.query);
      return sendSuccess(
        res,
        200,
        'Ad spend entries retrieved successfully.',
        SuccessCodes.FETCHED,
        'MarketingController.getAdSpends',
        spends
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Log new ad spend
   */
  static async createAdSpend(req, res, next) {
    try {
      const spend = await MarketingService.createAdSpend(req.body, req.user?._id || req.user?.id);
      return sendSuccess(
        res,
        201,
        'Ad spend recorded and synced successfully.',
        SuccessCodes.CREATED,
        'MarketingController.createAdSpend',
        spend
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete ad spend entry and reverse linked expense
   */
  static async deleteAdSpend(req, res, next) {
    try {
      const result = await MarketingService.deleteAdSpend(req.params.id);
      return sendSuccess(
        res,
        200,
        'Ad spend deleted and reversed successfully.',
        SuccessCodes.DELETED,
        'MarketingController.deleteAdSpend',
        result
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Record conversion funnel event from storefront (public endpoint)
   */
  static async recordEvent(req, res, next) {
    try {
      const event = await MarketingService.recordFunnelEvent(req.body);
      return sendSuccess(
        res,
        201,
        'Funnel event recorded.',
        SuccessCodes.CREATED,
        'MarketingController.recordEvent',
        event
      );
    } catch (err) {
      next(err);
    }
  }
}

module.exports = MarketingController;
