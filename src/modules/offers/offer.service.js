const Offer = require('./offer.model');
const AppError = require('../../utils/errors/appError');
const { ErrorCodes } = require('../../utils/errors/errorCodes');

class OfferService {
  /**
   * Get all currently active and non-expired offers for storefront
   */
  static async getActiveOffers() {
    const now = new Date();
    const query = {
      active: true,
      $and: [
        {
          $or: [
            { startDate: { $lte: now } },
            { startDate: null },
            { startDate: { $exists: false } }
          ]
        },
        {
          $or: [
            { endDate: { $gte: now } },
            { endDate: null },
            { endDate: { $exists: false } }
          ]
        }
      ]
    };

    return Offer.find(query)
      .populate('applicableProducts', 'name nameAr slug images variants category price compareAtPrice active')
      .populate('bundleItems.product', 'name nameAr slug images variants category price compareAtPrice active')
      .sort({ priority: -1, createdAt: -1 });
  }

  /**
   * Get all offers for Admin Dashboard
   */
  static async getAllOffers() {
    return Offer.find()
      .populate('applicableProducts', 'name nameAr slug images variants category price')
      .populate('bundleItems.product', 'name nameAr slug images variants category price')
      .sort({ createdAt: -1 });
  }

  /**
   * Get single offer by ID
   */
  static async getOfferById(id) {
    const offer = await Offer.findById(id)
      .populate('applicableProducts', 'name nameAr slug images variants category price')
      .populate('bundleItems.product', 'name nameAr slug images variants category price');

    if (!offer) {
      throw new AppError('Offer not found.', 404, ErrorCodes.NOT_FOUND, 'OfferService.getOfferById');
    }
    return offer;
  }

  /**
   * Create a new offer
   */
  static async createOffer(data) {
    if (!data.title || !data.title.trim()) {
      throw new AppError('Offer title is required.', 400, ErrorCodes.VALIDATION_ERROR, 'OfferService.createOffer');
    }

    // Clean up dates
    if (data.startDate === '') data.startDate = null;
    if (data.endDate === '') data.endDate = null;

    // Clean up bundle price
    if (data.bundlePrice !== undefined && (data.bundlePrice === '' || data.bundlePrice === null)) {
      data.bundlePrice = null;
    }

    return Offer.create(data);
  }

  /**
   * Update an existing offer
   */
  static async updateOffer(id, data) {
    // Clean up dates
    if (data.startDate === '') data.startDate = null;
    if (data.endDate === '') data.endDate = null;
    if (data.bundlePrice !== undefined && (data.bundlePrice === '' || data.bundlePrice === null)) {
      data.bundlePrice = null;
    }

    const offer = await Offer.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true
    })
      .populate('applicableProducts', 'name nameAr slug images variants category price')
      .populate('bundleItems.product', 'name nameAr slug images variants category price');

    if (!offer) {
      throw new AppError('Offer not found.', 404, ErrorCodes.NOT_FOUND, 'OfferService.updateOffer');
    }
    return offer;
  }

  /**
   * Toggle offer active status
   */
  static async toggleActive(id) {
    const offer = await Offer.findById(id);
    if (!offer) {
      throw new AppError('Offer not found.', 404, ErrorCodes.NOT_FOUND, 'OfferService.toggleActive');
    }
    offer.active = !offer.active;
    await offer.save();
    return offer;
  }

  /**
   * Delete an offer
   */
  static async deleteOffer(id) {
    const offer = await Offer.findByIdAndDelete(id);
    if (!offer) {
      throw new AppError('Offer not found.', 404, ErrorCodes.NOT_FOUND, 'OfferService.deleteOffer');
    }

    if (offer.bannerImage?.publicId) {
      try {
        const CloudinaryService = require('../../cloudinary/cloudinary.service');
        await CloudinaryService.deleteImage(offer.bannerImage.publicId);
      } catch (err) {
        console.warn('[OfferService.deleteOffer] Cloudinary cleanup skipped:', err.message);
      }
    }

    return offer;
  }
}

module.exports = OfferService;
