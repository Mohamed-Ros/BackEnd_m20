const crypto = require('crypto');
const Settings = require('../../modules/settings/settings.model');
const logger = require('./logger');

/**
 * SHA-256 hash normalizer according to Meta CAPI specification
 */
const hashData = (val) => {
  if (!val || typeof val !== 'string') return null;
  const normalized = val.trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

/**
 * Normalize phone number to international E.164 without '+' or leading zeros
 * e.g. 01012345678 -> 201012345678
 */
const normalizePhoneForCapi = (phone) => {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('002')) {
    digits = digits.substring(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = '2' + digits;
  } else if (!digits.startsWith('20') && digits.length === 10) {
    digits = '20' + digits;
  }
  return digits;
};

/**
 * Format _fbc cookie from fbclid if not explicitly present
 */
const formatFbc = (fbc, fbclid) => {
  if (fbc && typeof fbc === 'string' && fbc.startsWith('fb.')) {
    return fbc;
  }
  if (fbclid && typeof fbclid === 'string' && fbclid.trim()) {
    const creationTime = Date.now();
    return `fb.1.${creationTime}.${fbclid.trim()}`;
  }
  return undefined;
};

/**
 * Send server-side Purchase event to Meta Conversions API (CAPI)
 * High Event Match Quality with exact event_id deduplication matching client Pixel.
 */
const sendMetaCapiPurchase = async ({
  order,
  clientIp = '',
  userAgent = '',
  fbp = '',
  fbc = '',
  fbclid = ''
}) => {
  try {
    const settings = await Settings.findOne();
    const pixelId = settings?.tracking?.metaPixelId || process.env.META_PIXEL_ID;
    const accessToken = settings?.tracking?.metaCapiAccessToken || process.env.META_CAPI_ACCESS_TOKEN;
    const isEnabled = settings?.tracking?.enableTracking !== false;

    if (!isEnabled || !pixelId || !accessToken) {
      // Tracking disabled or Meta credentials not configured
      return { skipped: true, reason: 'Meta CAPI not configured or tracking disabled' };
    }

    const eventId = `order_${order.orderNumber}`;
    const eventTime = Math.floor(Date.now() / 1000);
    const storeUrl = settings?.storeUrl || 'https://m20fragrance.com';

    // Hash email & phone
    const hashedEmail = hashData(order.customerEmail || order.customer?.email);
    const normalizedPhone = normalizePhoneForCapi(order.customerPhone || order.customer?.phone);
    const hashedPhone = hashData(normalizedPhone);

    const effectiveFbc = formatFbc(fbc, fbclid);

    const userData = {
      client_ip_address: clientIp || undefined,
      client_user_agent: userAgent || undefined
    };

    if (hashedEmail) userData.em = [hashedEmail];
    if (hashedPhone) userData.ph = [hashedPhone];
    if (fbp) userData.fbp = fbp;
    if (effectiveFbc) userData.fbc = effectiveFbc;

    // Build contents array
    const contents = (order.items || []).map(item => ({
      id: item.variantSKU || String(item.product),
      quantity: Number(item.quantity) || 1,
      item_price: Math.round(Number(item.price) || 0)
    }));

    const eventPayload = {
      data: [
        {
          event_name: 'Purchase',
          event_time: eventTime,
          event_id: eventId,
          event_source_url: `${storeUrl}/checkout`,
          action_source: 'website',
          user_data: userData,
          custom_data: {
            currency: 'EGP',
            value: Math.round(Number(order.total) || 0),
            order_id: order.orderNumber,
            content_type: 'product',
            contents
          }
        }
      ]
    };

    // Support Meta Test Event Code if present in environment or settings
    const testCode = process.env.META_TEST_EVENT_CODE;
    if (testCode) {
      eventPayload.test_event_code = testCode;
    }

    const apiUrl = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(eventPayload)
    });

    const responseData = await res.json().catch(() => ({}));

    if (!res.ok) {
      logger.warn(`[META CAPI] Error sending Purchase event for order ${order.orderNumber}:`, responseData);
      return { success: false, error: responseData };
    }

    logger.info(`[META CAPI] Purchase event sent successfully for order ${order.orderNumber} (eventId: ${eventId})`);
    return { success: true, response: responseData, eventId };
  } catch (err) {
    logger.warn(`[META CAPI] Exception during event dispatch: ${err.message}`);
    return { success: false, error: err.message };
  }
};

module.exports = {
  hashData,
  normalizePhoneForCapi,
  formatFbc,
  sendMetaCapiPurchase
};
