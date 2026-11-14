const Product = require('../products/product.model');
const User = require('../users/user.model');
const OfferService = require('../offers/offer.service');

class HomepageService {
  /**
   * Fetch home page payload: featured fragrances, new arrivals, founding customer counter, active offers
   */
  static async getHomepageData() {
    const [featuredProducts, newArrivals, foundingCount, offers] = await Promise.all([
      Product.find({ featured: true, active: true }).limit(6),
      Product.find({ active: true }).sort({ createdAt: -1 }).limit(6),
      User.countDocuments({ isFirst100: true }),
      OfferService.getActiveOffers()
    ]);

    return {
      heroBanner: {
        title: 'M20 Fragrance',
        subtitle: 'Unveiling Elegance & Timeless Scents',
        tagline: 'Join the Founding 100 Members'
      },
      founding100Stats: {
        claimedSlots: foundingCount,
        totalSlots: 100,
        remainingSlots: Math.max(0, 100 - foundingCount)
      },
      featuredProducts,
      newArrivals,
      offers
    };
  }
}

module.exports = HomepageService;
