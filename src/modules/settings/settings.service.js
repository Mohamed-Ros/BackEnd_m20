const Settings = require('./settings.model');
const { DEFAULT_GOVERNORATE_RATES, EGYPT_GOVERNORATES } = require('../../utils/helpers/governorates');

class SettingsService {
  /**
   * Get or initialize single settings document with guaranteed 27 whole-number rates
   */
  static async getSettings() {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    } else {
      // Ensure governorate rates have the 27 governorate tier rates and are integers
      let needsSave = false;
      if (!settings.shipping) {
        settings.shipping = {};
        needsSave = true;
      }
      
      const currentRates = settings.shipping.governorateRates;
      if (!currentRates || (currentRates instanceof Map && currentRates.size === 0) || Object.keys(currentRates).length === 0) {
        settings.shipping.governorateRates = DEFAULT_GOVERNORATE_RATES;
        needsSave = true;
      }

      if (needsSave) {
        await settings.save();
      }
    }
    return settings;
  }

  /**
   * Public settings for checkout frontend (safe public payment numbers, instructions, shipping rules)
   */
  static async getPublicSettings() {
    const settings = await this.getSettings();
    return {
      storeName: settings.storeName,
      storeUrl: settings.storeUrl,
      whatsappNumber: settings.whatsappNumber,
      supportPhone: settings.supportPhone,
      announcement: settings.announcement,
      socialMedia: settings.socialMedia,
      heroSlides: settings.heroSlides,
      shipping: {
        freeShippingGovernorates: settings.shipping.freeShippingGovernorates || [],
        defaultCustomerRate: Math.round(Number(settings.shipping.defaultCustomerRate || 75)),
        governorateRates: settings.shipping.governorateRates || DEFAULT_GOVERNORATE_RATES,
        metroPickupCustomerFee: Math.round(Number(settings.shipping.metroPickupCustomerFee || 0))
      },
      payments: {
        vodafoneCash: {
          enabled: settings.payments.vodafoneCash?.enabled,
          number: settings.payments.vodafoneCash?.number,
          feePercent: settings.payments.vodafoneCash?.feePercent || 0,
          instructions: settings.payments.vodafoneCash?.instructions
        },
        instaPay: {
          enabled: settings.payments.instaPay?.enabled,
          account: settings.payments.instaPay?.account,
          feePercent: settings.payments.instaPay?.feePercent || 0,
          instructions: settings.payments.instaPay?.instructions
        },
        cod: {
          enabled: settings.payments.cod?.enabled,
          feeAmount: settings.payments.cod?.feeAmount || 0
        },
        fawaterk: {
          enabled: settings.payments.fawaterk?.enabled,
          feePercent: settings.payments.fawaterk?.feePercent || 0
        }
      },
      storeStatus: {
        paused: !!settings.storeStatus?.paused,
        messageAr: settings.storeStatus?.messageAr || '',
        messageEn: settings.storeStatus?.messageEn || '',
        resumeAt: settings.storeStatus?.resumeAt || null
      },
      tracking: {
        enableTracking: settings.tracking?.enableTracking ?? true,
        metaPixelId: settings.tracking?.metaPixelId || process.env.META_PIXEL_ID || '',
        tiktokPixelId: settings.tracking?.tiktokPixelId || process.env.TIKTOK_PIXEL_ID || ''
        // metaCapiAccessToken is strictly backend-only and NEVER exposed here
      }
    };
  }

  /**
   * Update settings (Admin)
   */
  static async updateSettings(data) {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create(data);
    } else {
      if (data.storeName) settings.storeName = data.storeName;
      if (data.storeUrl) settings.storeUrl = data.storeUrl;
      if (data.whatsappNumber) settings.whatsappNumber = data.whatsappNumber;
      if (data.supportPhone) settings.supportPhone = data.supportPhone;

      if (data.announcement) {
        settings.announcement = {
          ...settings.announcement?.toObject?.() || {},
          ...data.announcement
        };
      }
      if (data.socialMedia) {
        settings.socialMedia = {
          ...settings.socialMedia?.toObject?.() || {},
          ...data.socialMedia
        };
        if (data.socialMedia.whatsapp) settings.whatsappNumber = data.socialMedia.whatsapp;
        if (data.socialMedia.phone) settings.supportPhone = data.socialMedia.phone;
      }
      if (data.heroSlides) {
        settings.heroSlides = data.heroSlides;
      }

      if (data.shipping) {
        if (data.shipping.freeShippingGovernorates !== undefined) {
          settings.shipping.freeShippingGovernorates = Array.isArray(data.shipping.freeShippingGovernorates)
            ? data.shipping.freeShippingGovernorates
            : [];
        }
        if (data.shipping.defaultCustomerRate !== undefined) {
          settings.shipping.defaultCustomerRate = Math.round(Number(data.shipping.defaultCustomerRate));
        }
        if (data.shipping.governorateRates) {
          const cleanRates = {};
          const raw = data.shipping.governorateRates;
          if (raw instanceof Map) {
            for (const [k, v] of raw.entries()) {
              cleanRates[k] = Math.round(Number(v));
            }
          } else if (typeof raw === 'object') {
            for (const [k, v] of Object.entries(raw)) {
              cleanRates[k] = Math.round(Number(v));
            }
          }
          settings.shipping.governorateRates = cleanRates;
        }
        if (data.shipping.realCostMap) {
          const cleanReal = {};
          const raw = data.shipping.realCostMap;
          if (raw instanceof Map) {
            for (const [k, v] of raw.entries()) {
              cleanReal[k] = Math.round(Number(v));
            }
          } else if (typeof raw === 'object') {
            for (const [k, v] of Object.entries(raw)) {
              cleanReal[k] = Math.round(Number(v));
            }
          }
          settings.shipping.realCostMap = cleanReal;
        }
        if (data.shipping.metroPickupCustomerFee !== undefined) {
          settings.shipping.metroPickupCustomerFee = Math.round(Number(data.shipping.metroPickupCustomerFee));
        }
        if (data.shipping.defaultRealCost !== undefined) {
          settings.shipping.defaultRealCost = Math.max(0, Math.round(Number(data.shipping.defaultRealCost) || 0));
        }
        if (data.shipping.costWarnPercent !== undefined) {
          settings.shipping.costWarnPercent = Math.min(100, Math.max(0, Number(data.shipping.costWarnPercent) || 0));
        }
        if (data.shipping.metroPickupRealCost !== undefined) {
          settings.shipping.metroPickupRealCost = Math.round(Number(data.shipping.metroPickupRealCost));
        }
      }

      if (data.payments) {
        if (data.payments.vodafoneCash) {
          settings.payments.vodafoneCash = {
            ...settings.payments.vodafoneCash.toObject(),
            ...data.payments.vodafoneCash
          };
        }
        if (data.payments.instaPay) {
          settings.payments.instaPay = {
            ...settings.payments.instaPay.toObject(),
            ...data.payments.instaPay
          };
        }
        if (data.payments.cod) {
          settings.payments.cod = {
            ...settings.payments.cod.toObject(),
            ...data.payments.cod
          };
        }
        if (data.payments.fawaterk) {
          settings.payments.fawaterk = {
            ...settings.payments.fawaterk.toObject(),
            ...data.payments.fawaterk
          };
        }
      }

      if (data.costTable && typeof data.costTable === 'object') {
        const fields = ['bottle', 'oil', 'alcohol', 'rawShipping', 'bag', 'card', 'marketing'];
        const clean = {};
        for (const [size, row] of Object.entries(data.costTable)) {
          if (!row || typeof row !== 'object') continue;
          clean[size] = {};
          fields.forEach((f) => { clean[size][f] = Math.max(0, Number(row[f]) || 0); });
        }
        settings.costTable = clean;
        settings.markModified('costTable');
      }

      if (data.orderCosts) {
        settings.orderCosts = {
          operatingPerOrder: Math.max(0, Number(data.orderCosts.operatingPerOrder) || 0),
          operatingPercent: Math.max(0, Number(data.orderCosts.operatingPercent) || 0)
        };
      }

      if (data.storeStatus) {
        settings.storeStatus = {
          ...(settings.storeStatus?.toObject?.() || {}),
          ...data.storeStatus
        };
      }

      if (data.tracking) {
        settings.tracking = {
          ...(settings.tracking?.toObject?.() || {}),
          ...data.tracking
        };
      }

      await settings.save();
    }

    return settings;
  }
}

module.exports = SettingsService;
