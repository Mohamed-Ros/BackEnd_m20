const OfferService = require('./offer.service');
const { sendSuccess } = require('../../utils/responses/responseHandler');
const { SuccessCodes } = require('../../utils/errors/errorCodes');

class OfferController {
  static async getActiveOffers(req, res, next) {
    try {
      const offers = await OfferService.getActiveOffers();
      return sendSuccess(res, 200, 'Active offers retrieved successfully', SuccessCodes.FETCHED, 'OfferController.getActiveOffers', offers);
    } catch (error) {
      next(error);
    }
  }

  static async getAllOffers(req, res, next) {
    try {
      const offers = await OfferService.getAllOffers();
      return sendSuccess(res, 200, 'All offers retrieved successfully', SuccessCodes.FETCHED, 'OfferController.getAllOffers', offers);
    } catch (error) {
      next(error);
    }
  }

  static async getOfferById(req, res, next) {
    try {
      const offer = await OfferService.getOfferById(req.params.id);
      return sendSuccess(res, 200, 'Offer retrieved successfully', SuccessCodes.FETCHED, 'OfferController.getOfferById', offer);
    } catch (error) {
      next(error);
    }
  }

  static async createOffer(req, res, next) {
    try {
      const offer = await OfferService.createOffer(req.body);
      return sendSuccess(res, 201, 'Offer created successfully', SuccessCodes.CREATED, 'OfferController.createOffer', offer);
    } catch (error) {
      next(error);
    }
  }

  static async updateOffer(req, res, next) {
    try {
      const offer = await OfferService.updateOffer(req.params.id, req.body);
      return sendSuccess(res, 200, 'Offer updated successfully', SuccessCodes.UPDATED, 'OfferController.updateOffer', offer);
    } catch (error) {
      next(error);
    }
  }

  static async toggleActive(req, res, next) {
    try {
      const offer = await OfferService.toggleActive(req.params.id);
      return sendSuccess(res, 200, `Offer ${offer.active ? 'activated' : 'deactivated'} successfully`, SuccessCodes.UPDATED, 'OfferController.toggleActive', offer);
    } catch (error) {
      next(error);
    }
  }

  static async deleteOffer(req, res, next) {
    try {
      await OfferService.deleteOffer(req.params.id);
      return sendSuccess(res, 200, 'Offer deleted successfully', SuccessCodes.DELETED, 'OfferController.deleteOffer', null);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = OfferController;
