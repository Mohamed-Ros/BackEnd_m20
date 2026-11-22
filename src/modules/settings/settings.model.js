const mongoose = require('mongoose');
const { DEFAULT_GOVERNORATE_RATES } = require('../../utils/helpers/governorates');

const settingsSchema = new mongoose.Schema(
  {
    storeName: {
      type: String,
      default: 'M20'
    },
    storeUrl: {
      type: String,
      default: 'https://m20fragrance.store'
    },
    whatsappNumber: {
      type: String,
      default: '201132687324'
    },
    supportPhone: {
      type: String,
      default: '01132687324'
    },
    announcement: {
      text: {
        type: String,
        default: 'شحن مجاني للطلبات المؤهلة | عينات مجانية مع كل طلب'
      },
      active: {
        type: Boolean,
        default: true
      }
    },
    socialMedia: {
      whatsapp: { type: String, default: '201132687324' },
      phone: { type: String, default: '01132687324' },
      instagram: { type: String, default: 'https://instagram.com/elan.perfumes' },
      tiktok: { type: String, default: 'https://tiktok.com/@elan.perfumes' },
      facebook: { type: String, default: 'https://facebook.com/elan.perfumes.eg' }
    },
    heroSlides: [
      {
        id: mongoose.Schema.Types.Mixed,
        image: String,
        publicId: String,
        alt: String,
        link: String,
        active: { type: Boolean, default: true }
      }
    ],
    // Shipping configuration (Origin: Giza - Strict Whole Integers)
    shipping: {
      freeShippingGovernorates: {
        type: [String],
        default: []
      },
      defaultCustomerRate: {
        type: Number,
        default: 75
      },
      governorateRates: {
        type: Map,
        of: Number,
        default: DEFAULT_GOVERNORATE_RATES
      },
      // Carrier's real cost per governorate. Regions not listed fall back to defaultRealCost.
      realCostMap: {
        type: Map,
        of: Number,
        default: {}
      },
      defaultRealCost: {
        type: Number,
        default: 50
      },
      // Flag an order when real shipping cost exceeds this % of the products subtotal
      costWarnPercent: {
        type: Number,
        default: 30
      },
      metroPickupCustomerFee: {
        type: Number,
        default: 0
      },
      metroPickupRealCost: {
        type: Number,
        default: 15
      }
    },
    // Payment Configuration & Transfer Accounts
    payments: {
      vodafoneCash: {
        enabled: { type: Boolean, default: true },
        number: { type: String, default: '01012345678' },
        feePercent: { type: Number, default: 1.0 },
        instructions: {
          type: String,
          default: 'يرجى تحويل إجمالي المبلغ على محفظة فودافون كاش: 01012345678 وإرفاق صورة إشعار التحويل.'
        }
      },
      instaPay: {
        enabled: { type: Boolean, default: true },
        account: { type: String, default: 'elan.perfumes@instapay' },
        feePercent: { type: Number, default: 1.0 },
        instructions: {
          type: String,
          default: 'يرجى تحويل المبلغ عبر إنستاباي على العنوان: elan.perfumes@instapay وإرفاق لقطة شاشة للتأكيد.'
        }
      },
      cod: {
        enabled: { type: Boolean, default: true },
        feeAmount: { type: Number, default: 0 }
      },
      // Gateway fee charged on top of the order total (rounded to the nearest whole EGP)
      fawaterk: {
        enabled: { type: Boolean, default: true },
        feePercent: { type: Number, default: 2.4 },
        feeInitialized: { type: Boolean, default: false }
      }
    },
    // Automatic Product Cost Defaults
    costDefaults: {
      bottleWithCapSprayer: { type: Number, default: 45 },
      sticker: { type: Number, default: 20 },
      box: { type: Number, default: 25 },
      marketingPerBottle: { type: Number, default: 20 },
      defaultLiquidDensity: { type: Number, default: 0.86 }
    },
    // Cost per bottle by size (EGP). Order costs are calculated from this table.
    // manufacturing = oil + alcohol + rawShipping | packaging = bottle + bag + card | marketing = marketing
    costTable: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        '30ml': { bottle: 45, oil: 35, alcohol: 10, rawShipping: 10, bag: 45, card: 5, marketing: 25 },
        '50ml': { bottle: 55, oil: 55, alcohol: 10, rawShipping: 10, bag: 45, card: 5, marketing: 25 },
        '100ml': { bottle: 60, oil: 100, alcohol: 20, rawShipping: 10, bag: 45, card: 5, marketing: 25 }
      })
    },
    // Per-order overhead used in the order cost breakdown
    orderCosts: {
      operatingPerOrder: { type: Number, default: 0 },
      operatingPercent: { type: Number, default: 0 }
    },
    // Official M20 Gram-Based Manufacturing Constants
    manufacturing: {
      densities: {
        fragranceOil: { type: Number, default: 0.93 }, // 0.93 g/ml (10ml = 9.3g)
        alcohol96: { type: Number, default: 0.70 }    // 0.70 g/ml (50ml = 35.0g | 1L = 700g)
      },
      bottleSpecs: {
        '30ml': {
          netLiquidWeightGrams: { type: Number, default: 25.0 },
          transferLossGrams: { type: Number, default: 1.0 },
          totalPrepWeightGrams: { type: Number, default: 26.0 }
        },
        '50ml': {
          netLiquidWeightGrams: { type: Number, default: 43.0 },
          transferLossGrams: { type: Number, default: 1.0 },
          totalPrepWeightGrams: { type: Number, default: 44.0 }
        },
        '100ml': {
          netLiquidWeightGrams: { type: Number, default: 78.0 },
          transferLossGrams: { type: Number, default: 1.0 },
          totalPrepWeightGrams: { type: Number, default: 79.0 }
        }
      }
    },
    // Temporary store pause (controlled from dashboard)
    storeStatus: {
      paused: { type: Boolean, default: false },
      messageAr: { type: String, default: 'المتجر متوقف مؤقتاً لأعمال الصيانة، نعود قريباً.' },
      messageEn: { type: String, default: 'The store is temporarily paused for maintenance. We will be back soon.' },
      resumeAt: { type: Date, default: null }
    },
    // Ad Tracking & Pixel Integration (Meta Pixel, Server-side CAPI, TikTok Pixel)
    tracking: {
      enableTracking: { type: Boolean, default: true },
      metaPixelId: { type: String, default: '', trim: true },
      metaCapiAccessToken: { type: String, default: '', trim: true }, // Backend-only: Never expose to public
      tiktokPixelId: { type: String, default: '', trim: true }
    }
  },
  {
    timestamps: true
  }
);

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
