const mongoose = require('mongoose');
const Order = require('./order.model');
const Product = require('../products/product.model');
const User = require('../users/user.model');
const CashAccount = require('../finance/cashAccount.model');
const Expense = require('../expenses/expense.model');
const Coupon = require('../coupons/coupon.model');
const CouponService = require('../coupons/coupon.service');
const OfferService = require('../offers/offer.service');
const SettingsService = require('../settings/settings.service');
const EmailService = require('../../utils/email/emailService');
const StockMovement = require('../inventory/stockMovement.model');
const RawMaterial = require('../inventory/rawMaterial.model');
const { getBottleSpec } = require('../../utils/helpers/manufacturing');
const { sendMetaCapiPurchase } = require('../../utils/helpers/metaCapi');
const { generateOrderNumber, generateUserId } = require('../../utils/helpers/orderNumber');
const { normalizePhone } = require('../../utils/helpers/phoneNormalizer');
const { getGovernorateRate, EGYPT_GOVERNORATES } = require('../../utils/helpers/governorates');
const AppError = require('../../utils/errors/appError');
const { ErrorCodes } = require('../../utils/errors/errorCodes');

class OrderService {
  /**
   * Server-controlled order creation with strict stock & price validation.
   * Supports both authenticated customers and guest checkouts.
   */
  static async createOrder(customerId, payload = {}) {
    const {
      items = [],
      deliveryMethod = 'home_delivery',
      metroPickup = null,
      shippingAddress = {},
      customerPhone = '',
      customerPhone2 = null,
      customerEmail = null,
      customerName = '',
      paymentMethod = 'cash_on_delivery',
      paymentScreenshot = null,
      paymentProofUrl = null,
      paymentSenderPhone = null,
      paymentReference = null,
      couponCode = null
    } = payload;

    let finalCustomerId = customerId;
    let customerRecord = null;
    if (finalCustomerId) {
      customerRecord = await User.findById(finalCustomerId).select('name email phone');
    } else {
      const rawPhone = (customerPhone || payload.phone || '').trim();
      const normPhone = normalizePhone(rawPhone) || rawPhone;
      let user = null;
      if (normPhone) {
        user = await User.findOne({
          $or: [{ phone: normPhone }, { phone: rawPhone }]
        });
      }
      if (!user) {
        const userId = generateUserId();
        user = await User.create({
          userId,
          name: customerName ? customerName.trim() : 'عميل M20',
          phone: normPhone || `+201000000000_${Date.now()}`,
          email: customerEmail || undefined,
          role: 'customer'
        });
      } else {
        if (customerName && customerName.trim() && (user.name === 'Valued Customer' || user.name === 'عميل M20' || !user.name)) {
          user.name = customerName.trim();
        }
        if (customerEmail && !user.email) {
          user.email = customerEmail;
        }
        await user.save();
      }
      finalCustomerId = user._id;
      customerRecord = user;
    }

    const resolvedCustomerEmail = (customerEmail && String(customerEmail).trim()) || customerRecord?.email || null;
    const resolvedCustomerName = (customerName && String(customerName).trim()) || customerRecord?.name || 'Valued Customer';

    let calculatedSubtotal = 0;
    let totalCogs = 0;
    const validatedItems = [];
    const activeOffers = await OfferService.getActiveOffers();
    const settings = await SettingsService.getSettings();
    if (settings.storeStatus?.paused) {
      throw new AppError(
        settings.storeStatus.messageAr || settings.storeStatus.messageEn || 'المتجر متوقف مؤقتاً ولا يستقبل طلبات حالياً.',
        503,
        'STORE_PAUSED',
        'OrderService.createOrder'
      );
    }
    const costDefaults = settings.costDefaults || {
      bottleWithCapSprayer: 45,
      sticker: 20,
      box: 25,
      marketingPerBottle: 20,
      defaultLiquidDensity: 0.86
    };

    // Server-side validation of stock and current price for every item
    for (const item of items) {
      let product = null;
      if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
        product = await Product.findById(item.productId);
      }
      if (!product) {
        // Robust fallback: search by slug, variant SKU, or name
        const escapeRx = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cleanId = String(item.productId || '').trim().toLowerCase().replace(/^prod-/, '');
        const skuSearch = item.variantSKU ? String(item.variantSKU).trim() : '';
        const orClauses = [];
        if (cleanId) {
          orClauses.push({ slug: cleanId });
          orClauses.push({ name: new RegExp(`^${escapeRx(cleanId)}$`, 'i') });
        }
        if (skuSearch) {
          orClauses.push({ 'variants.SKU': new RegExp(`^${escapeRx(skuSearch)}$`, 'i') });
        }
        if (orClauses.length) {
          product = await Product.findOne({ $or: orClauses, active: true });
        }
      }
      if (!product || !product.active) {
        throw new AppError(`Product not available for purchase.`, 400, ErrorCodes.PRODUCT_NOT_FOUND, 'OrderService.createOrder');
      }

      let variant = null;
      if (item.variantSKU) {
        variant = (product.variants || []).find((v) => v.SKU && v.SKU.toUpperCase() === item.variantSKU.toUpperCase());
      }
      if (!variant) {
        const targetSize = String(item.size || item.variantSKU || '50ml').toLowerCase();
        variant = (product.variants || []).find((v) => v.size && targetSize.includes(v.size.toLowerCase())) || product.variants[0];
      }
      if (!variant) {
        throw new AppError(`Variant not found on product '${product.name}'.`, 400, ErrorCodes.VARIANT_NOT_FOUND, 'OrderService.createOrder');
      }

      // Check for product-specific active offer
      let effectiveUnitPrice = variant.price;
      const matchingOffer = activeOffers.find((o) => {
        if (o.offerType !== 'product_specific') return false;
        const matchesProduct = !o.applicableProducts || o.applicableProducts.length === 0 || 
          o.applicableProducts.some(p => p._id.toString() === product._id.toString());
        const matchesSize = !o.applicableSizes || o.applicableSizes.length === 0 || 
          o.applicableSizes.includes(variant.size);
        return matchesProduct && matchesSize;
      });

      if (matchingOffer) {
        if (matchingOffer.discountType === 'percentage' && matchingOffer.discountValue > 0) {
          effectiveUnitPrice = Math.max(0, Math.round(variant.price * (1 - matchingOffer.discountValue / 100)));
        } else if (matchingOffer.discountType === 'fixed' && matchingOffer.discountValue > 0) {
          effectiveUnitPrice = Math.max(0, variant.price - matchingOffer.discountValue);
        }
      }

      // If client sent an explicit promo unit price (e.g. from bundle deal) that is lower or equal, respect it
      if (typeof item.price === 'number' && item.price >= 0 && item.price < effectiveUnitPrice) {
        effectiveUnitPrice = item.price;
      }

      const itemTotal = effectiveUnitPrice * item.quantity;
      calculatedSubtotal += itemTotal;

      // Density and finished liquid conversion using official M20 specifications
      const customSpecs = settings?.manufacturing?.bottleSpecs;
      const bottleSpec = getBottleSpec(variant.size, customSpecs);
      // Net liquid weight + 1.0g filling transfer loss (totalPrepWeightGrams: 26g for 30ml, 44g for 50ml, 79g for 100ml)
      const liquidPrepPerBottle = bottleSpec.totalPrepWeightGrams;
      const itemGrams = Number((liquidPrepPerBottle * item.quantity).toFixed(2));

      // Calculate unit manufacturing cost
      const liquidCostPerUnit = liquidPrepPerBottle * (product.finishedLiquidCostPerGram || 0);
      const pkgCostPerBottle = (Number(costDefaults.bottleWithCapSprayer) || 45) +
                               (Number(costDefaults.sticker) || 20) +
                               (Number(costDefaults.box) || 25) +
                               (Number(costDefaults.marketingPerBottle) || 20);
      const tableRow = OrderService.getCostRow(settings, variant.size);
      const itemUnitCost = tableRow
        ? OrderService.sumCostRow(tableRow)
        : Number((liquidCostPerUnit + pkgCostPerBottle).toFixed(2));
      const itemTotalCost = Number((itemUnitCost * item.quantity).toFixed(2));
      totalCogs += itemTotalCost;

      validatedItems.push({
        product: product._id,
        variantSKU: variant.SKU,
        productName: product.name,
        isPreOrder: !!product.preOrder?.enabled,
        size: variant.size,
        price: effectiveUnitPrice,
        quantity: item.quantity,
        liquidGramsConsumed: itemGrams,
        costRow: tableRow || null,
        unitCost: itemUnitCost,
        totalCost: itemTotalCost
      });
    }

    const { 
      shippingFee, 
      metroPickupFee, 
      realShippingCost, 
      actualOutboundShippingCost 
    } = this.calculateShippingFromSettings(
      settings,
      deliveryMethod,
      shippingAddress.governorate,
      calculatedSubtotal
    );

    let discount = 0; // product-only discount
    let shippingDiscount = 0; // direct shipping discount
    let validatedCoupon = null;
    if (couponCode && typeof couponCode === 'string' && couponCode.trim()) {
      try {
        const couponRes = await CouponService.validateCoupon(
          couponCode.trim(), 
          calculatedSubtotal, 
          shippingFee
        );
        if (couponRes && couponRes.coupon) {
          validatedCoupon = couponRes.coupon;
          if (couponRes.discountType === 'FREE_SHIPPING' || couponRes.isShippingDiscount) {
            // Deduct 100% of the selected governorate's shipping fee directly
            // (shippingDiscount = shippingFee, making net customer shipping = 0 EGP)
            // Do NOT alter product prices or product subtotals.
            shippingDiscount = shippingFee;
          } else {
            discount = couponRes.discountAmount || 0;
          }
          await Coupon.findByIdAndUpdate(validatedCoupon._id, { $inc: { usedCount: 1 } });
        }
      } catch (err) {
        throw err;
      }
    }

    const shippingFeeCharged = deliveryMethod === 'home_delivery'
      ? Math.max(0, shippingFee - shippingDiscount)
      : 0;
    const finalMetroFee = deliveryMethod === 'metro_pickup' ? metroPickupFee : 0;
    const totalShippingOrMetro = deliveryMethod === 'metro_pickup' ? finalMetroFee : shippingFeeCharged;
    const normPaymentMethod = (paymentMethod || 'cod').toLowerCase();

    // Payment gateway fee (e.g. 2.4%) is added on top of the order and rounded to the nearest whole EGP
    const orderBeforeFee = Math.max(0, calculatedSubtotal - discount + totalShippingOrMetro);
    const isGateway = ['fawaterk', 'card'].includes(normPaymentMethod);
    const gatewayPercent = isGateway ? Number(settings.payments?.fawaterk?.feePercent ?? 2.4) : 0;
    const paymentFee = isGateway ? Math.round(orderBeforeFee * gatewayPercent / 100) : 0;

    const calculatedTotal = orderBeforeFee + paymentFee;
    const orderNumber = generateOrderNumber();

    // Marketing Attribution Normalization
    const rawAttribution = payload.attribution || {};
    let source = String(rawAttribution.source || payload.utm_source || 'direct').trim().toLowerCase();
    let medium = String(rawAttribution.medium || payload.utm_medium || 'none').trim().toLowerCase();
    const campaign = String(rawAttribution.campaign || payload.utm_campaign || '').trim();
    const content = String(rawAttribution.content || payload.utm_content || '').trim();
    const term = String(rawAttribution.term || payload.utm_term || '').trim();
    const fbclid = String(rawAttribution.fbclid || payload.fbclid || '').trim();
    const ttclid = String(rawAttribution.ttclid || payload.ttclid || '').trim();

    // Auto-detect channel based on parameters & referrer
    let channel = 'direct';
    if (fbclid || source.includes('facebook') || source.includes('instagram') || source.includes('meta')) {
      channel = 'meta';
      if (source === 'direct') source = 'meta';
      if (medium === 'none') medium = 'cpc';
    } else if (ttclid || source.includes('tiktok')) {
      channel = 'tiktok';
      if (source === 'direct') source = 'tiktok';
      if (medium === 'none') medium = 'cpc';
    } else if (source.includes('google')) {
      channel = 'google';
    } else if (source === 'direct' || source === 'none' || !source) {
      channel = 'direct';
      source = 'direct';
    } else {
      channel = medium.includes('cpc') || medium.includes('paid') ? 'other' : 'organic';
    }

    const attribution = {
      source,
      medium,
      campaign,
      content,
      term,
      fbclid,
      ttclid,
      channel
    };
    const metaEventId = `order_${orderNumber}`;

    const order = await Order.create({
      orderNumber,
      customer: finalCustomerId,
      items: validatedItems,
      subtotal: calculatedSubtotal,
      discount,
      shippingDiscount,
      couponCode: couponCode ? couponCode.trim().toUpperCase() : null,
      deliveryMethod,
      metroPickup: deliveryMethod === 'metro_pickup' ? metroPickup : null,
      metroPickupFee: finalMetroFee,
      shipping: shippingFeeCharged,
      shippingFeeCharged,
      actualOutboundShippingCost: deliveryMethod === 'home_delivery' ? actualOutboundShippingCost : finalMetroFee,
      realShippingCost: deliveryMethod === 'home_delivery' ? actualOutboundShippingCost : finalMetroFee,
      actualReturnShippingCost: 0,
      paymentFee,
      total: calculatedTotal,
      totalCogs: Number(totalCogs.toFixed(2)),
      costBreakdown: OrderService.buildCostBreakdown({
        settings,
        items: validatedItems,
        subtotal: calculatedSubtotal,
        total: calculatedTotal,
        realShipping: deliveryMethod === 'home_delivery' ? actualOutboundShippingCost : finalMetroFee,
        paymentMethod: normPaymentMethod
      }),
      inventoryDeducted: true,
      orderStatus: 'pending',
      paymentStatus: 'pending',
      paymentMethod: normPaymentMethod,
      paymentScreenshot: paymentScreenshot || paymentProofUrl || null,
      paymentProofUrl: paymentProofUrl || paymentScreenshot || null,
      paymentSenderPhone: paymentSenderPhone || null,
      paymentReference: paymentReference || null,
      shippingAddress: deliveryMethod === 'home_delivery' ? shippingAddress : {},
      customerPhone: customerPhone || '',
      customerPhone2: customerPhone2 || null,
      customerEmail: resolvedCustomerEmail,
      attribution,
      metaEventId
    });

    // Deduct finished liquid inventory for items
    for (const vItem of validatedItems) {
      if (vItem.liquidGramsConsumed > 0) {
        const prod = await Product.findById(vItem.product);
        if (prod) {
          const prevLiquid = prod.finishedLiquidGrams || 0;
          prod.finishedLiquidGrams = Math.max(0, prevLiquid - vItem.liquidGramsConsumed);
          prod.totalConsumedLiquidGrams = (prod.totalConsumedLiquidGrams || 0) + vItem.liquidGramsConsumed;
          await prod.save();

          await StockMovement.create({
            itemType: 'FinishedLiquid',
            product: prod._id,
            itemName: `${prod.name} (Finished Liquid)`,
            movementType: 'SALE',
            quantityBefore: prevLiquid,
            quantityChange: -vItem.liquidGramsConsumed,
            quantityAfter: prod.finishedLiquidGrams,
            unit: 'gram',
            unitCost: prod.finishedLiquidCostPerGram || 0,
            totalValue: vItem.liquidGramsConsumed * (prod.finishedLiquidCostPerGram || 0),
            reason: `Order #${orderNumber} sold/reserved (${vItem.size} x ${vItem.quantity})`,
            referenceId: orderNumber,
            referenceType: 'Order'
          });
        }
      }
    }

    // Deduct packaging materials (1 bottle, 1 sticker, 1 box per unit) from Raw Materials
    await OrderService.adjustPackagingForOrder(order, 'deduct', finalCustomerId);

    if (validatedCoupon) {
      await Coupon.findByIdAndUpdate(validatedCoupon._id, { $inc: { usedCount: 1 } });
    }

    // Fire server-side Meta Conversions API (CAPI) for Purchase event (non-blocking)
    sendMetaCapiPurchase({
      order,
      clientIp: payload.clientIp,
      userAgent: payload.userAgent,
      fbp: payload.fbp,
      fbc: payload.fbc,
      fbclid: attribution.fbclid
    }).catch(err => {
      console.warn('[OrderService] Meta CAPI non-blocking dispatch warning:', err.message);
    });

    // Dispatch order received email to customer & new-order alert to store owner (non-fatal)
    try {
      const trackingUrl = `${settings.storeUrl || 'https://m20fragrance.store'}/track-order?order=${order.orderNumber}`;
      const emailTasks = [
        EmailService.sendAdminNewOrderAlert({
          orderNumber: order.orderNumber,
          customerName: resolvedCustomerName,
          customerPhone: customerPhone || customerRecord?.phone || '',
          customerEmail: resolvedCustomerEmail,
          total: order.total,
          items: order.items,
          deliveryMethod: order.deliveryMethod,
          paymentMethod: order.paymentMethod
        })
      ];

      if (resolvedCustomerEmail) {
        emailTasks.push(
          EmailService.sendOrderReceived({
            to: resolvedCustomerEmail,
            name: resolvedCustomerName,
            orderNumber: order.orderNumber,
            total: order.total,
            items: order.items,
            deliveryMethod: order.deliveryMethod,
            paymentMethod: order.paymentMethod,
            trackingUrl
          })
        );
      }

      await Promise.allSettled(emailTasks);
    } catch (err) {
      console.error('[OrderService.createOrder] Email dispatch error:', err);
    }

    return order;
  }

  /**
   * Look up an explicitly configured per-region cost (by id / English / Arabic name). Returns null if not set.
   */
  static lookupRegionCost(map, governorate) {
    if (!map || !governorate) return null;
    const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);
    if (!entries.length) return null;
    const raw = String(governorate).trim().toLowerCase();
    const gov = EGYPT_GOVERNORATES.find((g) =>
      [g.id, g.nameEn, g.nameAr].some((n) => n.toLowerCase() === raw) ||
      raw.includes(g.nameEn.toLowerCase()) || raw.includes(g.nameAr)
    );
    const names = new Set([raw]);
    if (gov) [gov.id, gov.nameEn, gov.nameAr].forEach((n) => names.add(n.toLowerCase()));
    const hit = entries.find(([k]) => names.has(String(k).toLowerCase()));
    return hit ? Math.round(Number(hit[1])) : null;
  }

  /**
   * Cost-table row for a bottle size (e.g. '50ml'), or null when the size is not configured
   */
  static getCostRow(settings, size) {
    const table = settings.costTable;
    if (!table || !size) return null;
    const key = String(size).toLowerCase().replace(/\s+/g, '');
    const row = table[key] || table[String(size)] || null;
    if (!row) return null;
    const plain = { ...(row.toObject ? row.toObject() : row) };
    if (plain.box === undefined && plain.bag !== undefined) plain.box = plain.bag; // older saved name
    return plain;
  }

  static sumCostRow(row) {
    return ['bottle', 'oil', 'alcohol', 'rawShipping', 'box', 'card', 'marketing']
      .reduce((a, f) => a + (Number(row[f]) || 0), 0);
  }

  /**
   * Split an order into manufacturing / marketing / shipping / packaging / operating / financial costs
   */
  static buildCostBreakdown({ settings, items, subtotal, total, realShipping, paymentMethod }) {
    const cd = settings.costDefaults || {};
    const packagingPerUnit = (Number(cd.bottleWithCapSprayer) || 45) + (Number(cd.sticker) || 20) + (Number(cd.box) || 25);
    const marketingPerUnit = Number(cd.marketingPerBottle) || 20;
    let manufacturing = 0;
    let packaging = 0;
    let marketing = 0;
    items.forEach((it) => {
      const qty = it.quantity || 1;
      const row = it.costRow;
      if (row) {
        manufacturing += ((row.oil || 0) + (row.alcohol || 0) + (row.rawShipping || 0)) * qty;
        packaging += ((row.bottle || 0) + (row.box || 0) + (row.card || 0)) * qty;
        marketing += (row.marketing || 0) * qty;
      } else {
        packaging += packagingPerUnit * qty;
        marketing += marketingPerUnit * qty;
        manufacturing += Math.max(0, (it.unitCost || 0) - packagingPerUnit - marketingPerUnit) * qty;
      }
    });
    const oc = settings.orderCosts || {};
    const operating = (Number(oc.operatingPerOrder) || 0) + ((Number(oc.operatingPercent) || 0) / 100) * total;
    const pm = String(paymentMethod || '').toLowerCase();
    const pay = settings.payments || {};
    let feePercent = 0;
    let feeFixed = 0;
    if (pm === 'vodafone_cash') feePercent = Number(pay.vodafoneCash?.feePercent) || 0;
    else if (pm === 'instapay') feePercent = Number(pay.instaPay?.feePercent) || 0;
    else if (pm === 'fawaterk' || pm === 'card') feePercent = Number(pay.fawaterk?.feePercent) || 0;
    else feeFixed = Number(pay.cod?.feeAmount) || 0;
    const financial = (feePercent / 100) * total + feeFixed;

    const r = (n) => Math.round(n);
    const shipping = r(realShipping);
    const totalCost = r(manufacturing) + r(packaging) + r(marketing) + shipping + r(operating) + r(financial);
    const warnPct = Number(settings.shipping?.costWarnPercent ?? 30);
    const shippingCostPercent = subtotal > 0 ? Number(((shipping / subtotal) * 100).toFixed(1)) : 0;
    return {
      manufacturing: r(manufacturing),
      marketing: r(marketing),
      shipping,
      packaging: r(packaging),
      operating: r(operating),
      financial: r(financial),
      totalCost,
      netProfit: r(total) - totalCost,
      shippingCostPercent,
      shippingCostWarning: warnPct > 0 && shippingCostPercent > warnPct
    };
  }

  /**
   * Helper to calculate shipping fee and real internal shipping cost from Settings
   * Strict Whole Integers only (Origin: Giza)
   */
  static calculateShippingFromSettings(settings, deliveryMethod, governorate, subtotal) {
    if (deliveryMethod === 'metro_pickup') {
      const customerFee = Math.round(Number(settings.shipping?.metroPickupCustomerFee ?? 0));
      const realCost = Math.round(Number(settings.shipping?.metroPickupRealCost ?? 15));
      return { 
        shippingFee: 0, 
        metroPickupFee: customerFee, 
        realShippingCost: realCost,
        actualOutboundShippingCost: realCost
      };
    }

    const freeGovs = settings.shipping?.freeShippingGovernorates || [];
    const govRates = settings.shipping?.governorateRates || {};
    const realCostMap = settings.shipping?.realCostMap || {};

    const isFree = governorate && freeGovs.some(g => g.toLowerCase() === governorate.toLowerCase());
    
    // Resolve whole-number rate for this governorate
    const baseRate = Math.round(getGovernorateRate(governorate, govRates));
    const shippingFee = isFree ? 0 : baseRate;

    // Carrier actual outbound shipping cost defaults to the whole-number governorate rate
    const explicitReal = OrderService.lookupRegionCost(realCostMap, governorate);
    const actualOutboundShippingCost = explicitReal !== null
      ? explicitReal
      : Math.round(Number(settings.shipping?.defaultRealCost ?? 50));

    return { 
      shippingFee, 
      metroPickupFee: 0, 
      realShippingCost: actualOutboundShippingCost,
      actualOutboundShippingCost
    };
  }

  /**
   * Helper / Static method to calculate shipping fee based on backend rules / pricing config
   * Strict Whole Integers only
   */
  static getShippingFee({ deliveryMethod, governorate, city, subtotal }) {
    if (deliveryMethod === 'metro_pickup') {
      const metroFee = process.env.METRO_PICKUP_FEE ? Math.round(parseFloat(process.env.METRO_PICKUP_FEE)) : 0;
      return { shippingFee: 0, metroPickupFee: metroFee };
    }

    const shippingFee = Math.round(getGovernorateRate(governorate));
    return { shippingFee, metroPickupFee: 0 };
  }

  /**
   * Deduct or restock 1 unit each of empty bottle, sticker, and presentation box per bottle sold
   */
  static async adjustPackagingForOrder(order, action = 'deduct', adminUserId = null) {
    const isDeduct = action === 'deduct';
    for (const item of (order.items || [])) {
      const qty = Number(item.quantity) || 1;
      const sizeStr = (item.size || '50ml').trim().toLowerCase();

      // Find matching bottle, sticker, box by size in name
      const [bottle, sticker, box] = await Promise.all([
        RawMaterial.findOne({ category: 'bottle', name: new RegExp(sizeStr, 'i') }),
        RawMaterial.findOne({ category: 'sticker', name: new RegExp(sizeStr, 'i') }),
        RawMaterial.findOne({ category: 'box', name: new RegExp(sizeStr, 'i') })
      ]);

      const materials = [bottle, sticker, box].filter(Boolean);
      for (const mat of materials) {
        const before = mat.currentStock || 0;
        const change = isDeduct ? -qty : qty;
        const after = Math.max(0, before + change);
        mat.currentStock = after;
        await mat.save();

        await StockMovement.create({
          itemType: 'RawMaterial',
          rawMaterial: mat._id,
          itemName: mat.name,
          movementType: isDeduct ? 'SALE' : 'RETURN',
          quantityBefore: before,
          quantityChange: change,
          quantityAfter: after,
          unit: mat.unit || 'piece',
          unitCost: mat.costPerUnit || 0,
          totalValue: Number((qty * (mat.costPerUnit || 0)).toFixed(2)),
          reason: isDeduct
            ? `Order #${order.orderNumber} packaging fulfillment (${item.size} x ${qty})`
            : `Order #${order.orderNumber} packaging restock (${item.size} x ${qty})`,
          referenceId: order.orderNumber,
          referenceType: 'Order',
          createdBy: adminUserId || null
        });
      }
    }
  }

  /**
   * Track order by order number or phone
   */
  static async trackOrder(searchTerm) {
    if (!searchTerm || !searchTerm.trim()) {
      throw new AppError('Order number or phone number is required.', 400, ErrorCodes.VALIDATION_ERROR, 'OrderService.trackOrder');
    }
    const term = searchTerm.trim();
    const normalizedPhone = normalizePhone(term);

    let orders = await Order.find({
      $or: [
        { orderNumber: { $regex: `^${term}$`, $options: 'i' } },
        { customerPhone: term },
        ...(normalizedPhone ? [{ customerPhone: normalizedPhone }] : []),
        ...(term.length === 24 && /^[0-9a-fA-F]{24}$/.test(term) ? [{ _id: term }] : [])
      ]
    })
      .populate('customer', 'name phone')
      .populate('items.product', 'name images mainImage slug fragranceFamily')
      .sort({ createdAt: -1 });

    if (!orders || orders.length === 0) {
      throw new AppError('No order found matching this reference. Please check your order number or phone.', 404, ErrorCodes.ORDER_NOT_FOUND, 'OrderService.trackOrder');
    }

    return orders;
  }

  /**
   * Get order by ID or orderNumber
   */
  static async getOrderById(orderId, customerId = null) {
    const filter = (orderId.startsWith('M20-') || orderId.startsWith('ELAN-')) ? { orderNumber: orderId } : { _id: orderId };
    if (customerId) {
      filter.customer = customerId;
    }

    const order = await Order.findOne(filter)
      .populate('customer', 'name phone userId isFirst100 foundingRank')
      .populate('items.product', 'name images mainImage slug fragranceFamily');
    if (!order) {
      throw new AppError('Order not found.', 404, ErrorCodes.ORDER_NOT_FOUND, 'OrderService.getOrderById');
    }
    return order;
  }

  /**
   * Customer: Get my orders
   */
  static async getCustomerOrders(customerId, query = {}) {
    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find({ customer: customerId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments({ customer: customerId })
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Admin: Get all orders with filter
   */
  /**
   * Orders ledger: every order with its cost split and net profit, plus totals.
   * Uses the stored breakdown; older orders without one are estimated from the current cost table.
   */
  static async getLedger(query = {}) {
    const settings = await SettingsService.getSettings();
    const filter = {};
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to) {
        const to = new Date(query.to);
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }
    if (query.orderStatus) filter.orderStatus = query.orderStatus;
    if (query.search) filter.orderNumber = { $regex: String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const orders = await Order.find(filter)
      .populate('customer', 'name phone')
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    // Real operating expenses (from the Expenses page) in the same period, spread evenly over the orders.
    // Marketing is excluded (already in the per-bottle cost table) and Transportation (shipping is per order).
    const Expense = require('../expenses/expense.model');
    const expFilter = { category: { $nin: ['Marketing', 'Transportation'] } };
    if (filter.createdAt) expFilter.date = filter.createdAt;
    const expRows = await Expense.find(expFilter).select('amount').lean();
    const operatingPool = Math.round(expRows.reduce((a, e) => a + (e.amount || 0), 0));
    const countedOrders = orders.filter((o) => !['cancelled', 'returned_from_shipping'].includes(o.orderStatus)).length;
    const operatingPerOrderAlloc = countedOrders > 0 ? operatingPool / countedOrders : 0;

    const keys = ['manufacturing', 'packaging', 'marketing', 'shipping', 'operating', 'financial'];
    const byMethod = {};
    const totals = { orders: 0, revenue: 0, manufacturing: 0, packaging: 0, marketing: 0, shipping: 0, operating: 0, financial: 0, totalCost: 0, netProfit: 0, warned: 0 };

    const rows = orders.map((o) => {
      const real = Math.round(Number(o.actualOutboundShippingCost ?? o.realShippingCost ?? 0));
      const hasStored = o.costBreakdown && o.costBreakdown.totalCost > 0;
      let cb;
      let estimated = false;
      if (hasStored) {
        cb = { ...o.costBreakdown, shipping: real };
        cb.totalCost = ['manufacturing', 'packaging', 'marketing', 'shipping', 'operating', 'financial']
          .reduce((a, k) => a + (Number(cb[k]) || 0), 0);
        cb.netProfit = Math.round(o.total || 0) - cb.totalCost;
        cb.shippingCostPercent = o.subtotal > 0 ? Number(((real / o.subtotal) * 100).toFixed(1)) : 0;
        cb.shippingCostWarning = Number(settings.shipping?.costWarnPercent ?? 30) > 0 &&
          cb.shippingCostPercent > Number(settings.shipping?.costWarnPercent ?? 30);
      } else {
        estimated = true;
        cb = OrderService.buildCostBreakdown({
          settings,
          items: (o.items || []).map((it) => ({ ...it, costRow: OrderService.getCostRow(settings, it.size) })),
          subtotal: o.subtotal || 0,
          total: o.total || 0,
          realShipping: real,
          paymentMethod: o.paymentMethod
        });
      }
      const counted = !['cancelled', 'returned_from_shipping'].includes(o.orderStatus);
      // operating = fixed per-order setting + share of the real operating expenses
      if (counted && operatingPerOrderAlloc > 0) {
        cb.operating = Math.round((cb.operating || 0) + operatingPerOrderAlloc);
        cb.totalCost = ['manufacturing', 'packaging', 'marketing', 'shipping', 'operating', 'financial']
          .reduce((a, k) => a + (Number(cb[k]) || 0), 0);
        cb.netProfit = Math.round(o.total || 0) - cb.totalCost;
      }
      if (counted) {
        totals.orders += 1;
        totals.revenue += Math.round(o.total || 0);
        keys.forEach((k) => { totals[k] += Number(cb[k]) || 0; });
        totals.totalCost += cb.totalCost;
        totals.netProfit += cb.netProfit;
        if (cb.shippingCostWarning) totals.warned += 1;
        const m = o.paymentMethod || 'cod';
        const g = byMethod[m] || (byMethod[m] = { method: m, orders: 0, revenue: 0, feeCharged: 0, feeCost: 0, paid: 0, unpaid: 0 });
        g.orders += 1;
        g.revenue += Math.round(o.total || 0);
        g.feeCharged += Math.round(o.paymentFee || 0);
        g.feeCost += Number(cb.financial) || 0;
        if (o.paymentStatus === 'paid') g.paid += Math.round(o.total || 0); else g.unpaid += Math.round(o.total || 0);
      }
      return {
        _id: o._id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        customerName: o.customer?.name || '',
        orderStatus: o.orderStatus,
        paymentMethod: o.paymentMethod,
        governorate: o.shippingAddress?.governorate || (o.deliveryMethod === 'metro_pickup' ? 'Metro' : ''),
        deliveryMethod: o.deliveryMethod,
        subtotal: Math.round(o.subtotal || 0),
        total: Math.round(o.total || 0),
        paymentFee: Math.round(o.paymentFee || 0),
        paymentStatus: o.paymentStatus,
        counted,
        estimated,
        ...cb
      };
    });

    totals.operatingPool = operatingPool;
    return { rows, totals, byPaymentMethod: Object.values(byMethod), truncated: orders.length >= 5000 };
  }

  static async getAllOrders(query = {}) {
    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.orderStatus) {
      filter.orderStatus = query.orderStatus;
    }
    if (query.paymentStatus) {
      filter.paymentStatus = query.paymentStatus;
    }
    if (query.channel) {
      filter['attribution.channel'] = query.channel;
    }
    if (query.campaign) {
      filter['attribution.campaign'] = query.campaign;
    }
    if (query.search) {
      filter.$or = [
        { orderNumber: { $regex: query.search, $options: 'i' } },
        { paymentReference: { $regex: query.search, $options: 'i' } }
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('customer', 'name phone userId isFirst100 foundingRank')
        .populate('items.product', 'name images mainImage slug fragranceFamily')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter)
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Admin: Get marketing attribution and channel performance analytics
   */
  static async getMarketingAnalytics(query = {}) {
    const filter = { orderStatus: { $ne: 'cancelled' } };
    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
    }

    const orders = await Order.find(filter)
      .select('orderNumber total orderStatus paymentStatus attribution couponCode createdAt');

    // Channels definitions
    const channels = {
      meta: { id: 'meta', name: 'Meta / Facebook & Instagram', count: 0, revenue: 0, deliveredCount: 0 },
      tiktok: { id: 'tiktok', name: 'TikTok Ads & Organic', count: 0, revenue: 0, deliveredCount: 0 },
      google: { id: 'google', name: 'Google Ads & Search', count: 0, revenue: 0, deliveredCount: 0 },
      organic: { id: 'organic', name: 'Organic Social & Referrals', count: 0, revenue: 0, deliveredCount: 0 },
      direct: { id: 'direct', name: 'Direct / Storefront Visits', count: 0, revenue: 0, deliveredCount: 0 },
      other: { id: 'other', name: 'Other Marketing Channels', count: 0, revenue: 0, deliveredCount: 0 }
    };

    const campaigns = {};
    const promoCodes = {};

    let totalOrders = 0;
    let totalRevenue = 0;

    for (const order of orders) {
      const ch = order.attribution?.channel || 'direct';
      const key = channels[ch] ? ch : 'other';
      const rev = Math.round(order.total || 0);

      channels[key].count += 1;
      channels[key].revenue += rev;
      if (order.orderStatus === 'delivered') {
        channels[key].deliveredCount += 1;
      }

      totalOrders += 1;
      totalRevenue += rev;

      // Campaign stats
      const camp = order.attribution?.campaign;
      if (camp) {
        if (!campaigns[camp]) {
          campaigns[camp] = { campaign: camp, channel: key, count: 0, revenue: 0 };
        }
        campaigns[camp].count += 1;
        campaigns[camp].revenue += rev;
      }

      // Promo Code stats
      const coup = order.couponCode;
      if (coup) {
        if (!promoCodes[coup]) {
          promoCodes[coup] = { code: coup, count: 0, revenue: 0 };
        }
        promoCodes[coup].count += 1;
        promoCodes[coup].revenue += rev;
      }
    }

    const channelList = Object.values(channels).map(ch => ({
      ...ch,
      orderSharePercent: totalOrders > 0 ? Number(((ch.count / totalOrders) * 100).toFixed(1)) : 0,
      revenueSharePercent: totalRevenue > 0 ? Number(((ch.revenue / totalRevenue) * 100).toFixed(1)) : 0
    }));

    const topCampaigns = Object.values(campaigns).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const topPromoCodes = Object.values(promoCodes).sort((a, b) => b.count - a.count).slice(0, 10);

    return {
      totalOrders,
      totalRevenue,
      channels: channelList,
      topCampaigns,
      topPromoCodes
    };
  }

  /**
   * Admin: Update order status manually with support for returned orders and shipping expenses
   */
  static async updateOrderStatus(orderId, payload = {}, adminUser = null) {
    const {
      orderStatus,
      paymentStatus,
      outboundShippingCost,
      returnShippingCost,
      actualOutboundShippingCost,
      actualReturnShippingCost,
      shippingFeeCharged,
      returnReason,
      paymentAccountId,
      notes
    } = payload;

    const order = await Order.findById(orderId).populate('customer', 'name email phone');
    if (!order) {
      throw new AppError('Order not found.', 404, ErrorCodes.ORDER_NOT_FOUND, 'OrderService.updateOrderStatus');
    }

    const prevOrderStatus = order.orderStatus;
    const nextOrderStatus = orderStatus || order.orderStatus;
    const nextPaymentStatus = paymentStatus || order.paymentStatus;
    const isCancelling = (nextOrderStatus === 'cancelled' || nextPaymentStatus === 'refunded');

    // Update actual outbound shipping cost if explicitly provided (strict whole integer)
    if (actualOutboundShippingCost !== undefined && actualOutboundShippingCost !== null && actualOutboundShippingCost !== '') {
      order.actualOutboundShippingCost = Math.max(0, Math.round(Number(actualOutboundShippingCost)));
      order.realShippingCost = order.actualOutboundShippingCost;
    }

    if (shippingFeeCharged !== undefined && shippingFeeCharged !== null && shippingFeeCharged !== '') {
      order.shippingFeeCharged = Math.max(0, Math.round(Number(shippingFeeCharged)));
      order.shipping = order.shippingFeeCharged;
    }

    // If order was deducted and is being cancelled (not returned_from_shipping), restock finished liquid
    if (isCancelling && nextOrderStatus !== 'returned_from_shipping' && order.inventoryDeducted) {
      for (const item of (order.items || [])) {
        if (item.liquidGramsConsumed > 0) {
          const prod = await Product.findById(item.product);
          if (prod) {
            const prevLiquid = prod.finishedLiquidGrams || 0;
            prod.finishedLiquidGrams = prevLiquid + item.liquidGramsConsumed;
            prod.totalConsumedLiquidGrams = Math.max(0, (prod.totalConsumedLiquidGrams || 0) - item.liquidGramsConsumed);
            await prod.save();

            await StockMovement.create({
              itemType: 'FinishedLiquid',
              product: prod._id,
              itemName: `${prod.name} (Finished Liquid)`,
              movementType: 'RETURN',
              quantityBefore: prevLiquid,
              quantityChange: item.liquidGramsConsumed,
              quantityAfter: prod.finishedLiquidGrams,
              unit: 'gram',
              unitCost: prod.finishedLiquidCostPerGram || 0,
              totalValue: item.liquidGramsConsumed * (prod.finishedLiquidCostPerGram || 0),
              reason: `Restocked from cancelled Order #${order.orderNumber}`,
              referenceId: order.orderNumber,
              referenceType: 'Order',
              createdBy: adminUser?._id || null
            });
          }
        }
      }
      await OrderService.adjustPackagingForOrder(order, 'restock', adminUser?._id);
      order.inventoryDeducted = false;
    } else if (!isCancelling && nextOrderStatus !== 'returned_from_shipping' && order.inventoryDeducted === false && orderStatus && orderStatus !== 'cancelled') {
      // Re-deduct if reinstated from cancelled
      for (const item of (order.items || [])) {
        if (item.liquidGramsConsumed > 0) {
          const prod = await Product.findById(item.product);
          if (prod) {
            const prevLiquid = prod.finishedLiquidGrams || 0;
            prod.finishedLiquidGrams = Math.max(0, prevLiquid - item.liquidGramsConsumed);
            prod.totalConsumedLiquidGrams = (prod.totalConsumedLiquidGrams || 0) + item.liquidGramsConsumed;
            await prod.save();

            await StockMovement.create({
              itemType: 'FinishedLiquid',
              product: prod._id,
              itemName: `${prod.name} (Finished Liquid)`,
              movementType: 'SALE',
              quantityBefore: prevLiquid,
              quantityChange: -item.liquidGramsConsumed,
              quantityAfter: prod.finishedLiquidGrams,
              unit: 'gram',
              unitCost: prod.finishedLiquidCostPerGram || 0,
              totalValue: item.liquidGramsConsumed * (prod.finishedLiquidCostPerGram || 0),
              reason: `Re-deducted for reinstated Order #${order.orderNumber}`,
              referenceId: order.orderNumber,
              referenceType: 'Order',
              createdBy: adminUser?._id || null
            });
          }
        }
      }
      await OrderService.adjustPackagingForOrder(order, 'deduct', adminUser?._id);
      order.inventoryDeducted = true;
    }

    // Handle Returned from Shipping Logic & Shipping Expenses
    const hasShippingInput = outboundShippingCost !== undefined || returnShippingCost !== undefined || actualReturnShippingCost !== undefined || returnReason !== undefined;
    if (nextOrderStatus === 'returned_from_shipping' || hasShippingInput) {
      order.returnDetails = order.returnDetails || {};
      order.returnDetails.isReturned = true;
      if (!order.returnDetails.returnedAt) {
        order.returnDetails.returnedAt = new Date();
      }
      if (!order.returnDetails.restockStatus) {
        order.returnDetails.restockStatus = 'not_inspected';
      }

      const outCostVal = outboundShippingCost !== undefined 
        ? outboundShippingCost 
        : (actualOutboundShippingCost !== undefined ? actualOutboundShippingCost : (order.actualOutboundShippingCost || order.realShippingCost || 0));
      const retCostVal = returnShippingCost !== undefined
        ? returnShippingCost
        : (actualReturnShippingCost !== undefined ? actualReturnShippingCost : (order.actualReturnShippingCost || order.returnDetails.returnShippingFee || 0));

      order.returnDetails.outboundShippingFee = Math.max(0, Math.round(Number(outCostVal) || 0));
      order.returnDetails.returnShippingFee = Math.max(0, Math.round(Number(retCostVal) || 0));
      order.actualOutboundShippingCost = order.returnDetails.outboundShippingFee;
      order.realShippingCost = order.actualOutboundShippingCost;
      order.actualReturnShippingCost = order.returnDetails.returnShippingFee;

      if (returnReason !== undefined) {
        order.returnDetails.returnReason = String(returnReason || '').trim();
      }
      if (paymentAccountId !== undefined) {
        order.returnDetails.paymentAccountId = paymentAccountId || null;
      }

      const totalShippingCharge = order.returnDetails.outboundShippingFee + order.returnDetails.returnShippingFee;
      order.returnDetails.totalReturnShippingCost = totalShippingCharge;

      // Automatically record or update shipping expenses in Finance (preventing duplicates)
      if (totalShippingCharge > 0) {
        let existingExpense = null;
        if (order.returnDetails.shippingExpenseId) {
          existingExpense = await Expense.findById(order.returnDetails.shippingExpenseId);
        }
        if (!existingExpense) {
          existingExpense = await Expense.findOne({
            $or: [
              { relatedOrderId: order._id },
              { title: `Return Shipping: Order #${order.orderNumber}` }
            ]
          });
        }

        const expNotes = `Outbound: ${order.returnDetails.outboundShippingFee || 0} EGP | Return: ${order.returnDetails.returnShippingFee || 0} EGP. Reason: ${order.returnDetails.returnReason || 'Delivery Refused / Returned'}`;

        if (existingExpense) {
          existingExpense.amount = totalShippingCharge;
          existingExpense.notes = expNotes;
          existingExpense.relatedOrderId = order._id;
          if (paymentAccountId) {
            existingExpense.paymentAccount = paymentAccountId;
            const acc = await CashAccount.findById(paymentAccountId);
            if (acc) existingExpense.paymentAccountName = acc.name;
          }
          await existingExpense.save();
          order.returnDetails.shippingExpenseId = existingExpense._id;
          order.returnDetails.shippingExpenseRecorded = true;
        } else {
          const count = await Expense.countDocuments();
          const year = new Date().getFullYear();
          const seq = String(count + 1).padStart(4, '0');
          const expenseNumber = `EXP-${year}-${seq}`;

          let accDoc = null;
          if (paymentAccountId) {
            accDoc = await CashAccount.findById(paymentAccountId);
          }

          const newExpense = await Expense.create({
            expenseNumber,
            title: `Return Shipping: Order #${order.orderNumber}`,
            category: 'Transportation',
            amount: totalShippingCharge,
            relatedOrderId: order._id,
            paymentAccount: accDoc ? accDoc._id : null,
            paymentAccountName: accDoc ? accDoc.name : '',
            date: new Date(),
            notes: expNotes,
            createdBy: adminUser?._id || null
          });

          order.returnDetails.shippingExpenseId = newExpense._id;
          order.returnDetails.shippingExpenseRecorded = true;
        }
      } else if (totalShippingCharge === 0 && order.returnDetails.shippingExpenseId) {
        await Expense.findByIdAndDelete(order.returnDetails.shippingExpenseId);
        order.returnDetails.shippingExpenseId = null;
        order.returnDetails.shippingExpenseRecorded = false;
      }
    }

    if (orderStatus) order.orderStatus = orderStatus;
    if (paymentStatus) order.paymentStatus = paymentStatus;

    // Log status history event for audit
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: nextOrderStatus,
      changedAt: new Date(),
      changedBy: adminUser?._id || null,
      note: notes || (nextOrderStatus === 'returned_from_shipping' ? `Status updated to Returned from Shipping. Reason: ${order.returnDetails?.returnReason || 'N/A'}` : `Status changed from ${prevOrderStatus} to ${nextOrderStatus}`),
      metadata: {
        outboundShippingFee: order.returnDetails?.outboundShippingFee || 0,
        returnShippingFee: order.returnDetails?.returnShippingFee || 0,
        totalReturnShippingCost: order.returnDetails?.totalReturnShippingCost || 0,
        shippingExpenseRecorded: order.returnDetails?.shippingExpenseRecorded || false
      }
    });

    await order.save();

    // Notify customer by email when fulfillment status advances
    const statusToNotify = ['confirmed', 'processing', 'shipped', 'delivered'];
    const recipientEmail = order.customerEmail || order.customer?.email;
    if (orderStatus && nextOrderStatus !== prevOrderStatus && statusToNotify.includes(nextOrderStatus) && recipientEmail) {
      try {
        const settings = await SettingsService.getSettings();
        const trackingUrl = `${settings.storeUrl || 'https://m20fragrance.store'}/track-order?order=${order.orderNumber}`;
        await EmailService.sendOrderStatusUpdate({
          to: recipientEmail,
          name: order.customer?.name || 'Valued Customer',
          orderNumber: order.orderNumber,
          orderStatus: nextOrderStatus,
          total: order.total,
          items: order.items,
          trackingUrl
        });
      } catch (err) {
        console.error('[OrderService.updateOrderStatus] Email dispatch error:', err);
      }
    }

    return order;
  }

  /**
   * Admin: Confirm physical inspection and inventory restock for returned order
   * Restores finished liquid inventory ONLY after products have been physically verified as reusable.
   */
  static async confirmReturnRestock(orderId, { inspectionOutcome, action, inspectionNotes, notes } = {}, adminUser = null) {
    const order = await Order.findById(orderId).populate('customer', 'name email phone');
    if (!order) {
      throw new AppError('Order not found.', 404, ErrorCodes.ORDER_NOT_FOUND, 'OrderService.confirmReturnRestock');
    }

    if (order.orderStatus !== 'returned_from_shipping') {
      throw new AppError('Only orders in "Returned from Shipping" status can be inspected and restocked.', 400);
    }

    order.returnDetails = order.returnDetails || {};

    if (order.returnDetails.restockStatus === 'inspected_restocked') {
      throw new AppError('This returned order has already been inspected and restocked. Duplicate restocking prevented.', 400);
    }

    const outcome = inspectionOutcome || action || 'reusable';
    const comments = inspectionNotes || notes || '';

    if (outcome === 'reusable') {
      // Restore finished liquid inventory
      for (const item of (order.items || [])) {
        if (item.liquidGramsConsumed > 0) {
          const prod = await Product.findById(item.product);
          if (prod) {
            const prevLiquid = prod.finishedLiquidGrams || 0;
            prod.finishedLiquidGrams = prevLiquid + item.liquidGramsConsumed;
            prod.totalConsumedLiquidGrams = Math.max(0, (prod.totalConsumedLiquidGrams || 0) - item.liquidGramsConsumed);
            await prod.save();

            await StockMovement.create({
              itemType: 'FinishedLiquid',
              product: prod._id,
              itemName: `${prod.name || item.productName} (Finished Liquid)`,
              movementType: 'RETURN',
              quantityBefore: prevLiquid,
              quantityChange: item.liquidGramsConsumed,
              quantityAfter: prod.finishedLiquidGrams,
              unit: 'gram',
              unitCost: prod.finishedLiquidCostPerGram || 0,
              totalValue: item.liquidGramsConsumed * (prod.finishedLiquidCostPerGram || 0),
              reason: `Physical inspection confirmed reusable: Returned Order #${order.orderNumber} restocked`,
              referenceId: order.orderNumber,
              referenceType: 'Order',
              createdBy: adminUser?._id || null
            });
          }
        }
      }

      order.returnDetails.restockStatus = 'inspected_restocked';
      order.returnDetails.restockedAt = new Date();
      order.returnDetails.restockedBy = adminUser?._id || null;
      order.returnDetails.inspectionNotes = comments || 'Confirmed physically intact and reusable; restocked to finished liquid.';
      await OrderService.adjustPackagingForOrder(order, 'restock', adminUser?._id);
      order.inventoryDeducted = false;
    } else {
      // Marked as damaged / spoiled - do NOT restock
      order.returnDetails.restockStatus = 'inspected_damaged_discarded';
      order.returnDetails.restockedAt = new Date();
      order.returnDetails.restockedBy = adminUser?._id || null;
      order.returnDetails.inspectionNotes = comments || 'Products damaged or unsealed during courier transit; discarded.';

      for (const item of (order.items || [])) {
        if (item.liquidGramsConsumed > 0) {
          await StockMovement.create({
            itemType: 'FinishedLiquid',
            product: item.product,
            itemName: `${item.productName} (Damaged Return)`,
            movementType: 'DAMAGED',
            quantityBefore: 0,
            quantityChange: 0,
            quantityAfter: 0,
            unit: 'gram',
            unitCost: 0,
            totalValue: 0,
            reason: `Damaged return inspection: Order #${order.orderNumber} items discarded; inventory NOT restocked.`,
            referenceId: order.orderNumber,
            referenceType: 'Order',
            createdBy: adminUser?._id || null
          });
        }
      }
    }

    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: order.orderStatus,
      changedAt: new Date(),
      changedBy: adminUser?._id || null,
      note: `Inspection complete: ${inspectionOutcome === 'reusable' ? 'Items confirmed reusable and restocked' : 'Items marked damaged and discarded'}. Notes: ${inspectionNotes || 'None'}`
    });

    await order.save();
    return order;
  }

  /**
   * Admin: Process customer refund for a returned paid order
   */
  static async processReturnRefund(orderId, { refundAmount, cashAccountId, notes }, adminUser = null) {
    const order = await Order.findById(orderId).populate('customer', 'name email phone');
    if (!order) {
      throw new AppError('Order not found.', 404, ErrorCodes.ORDER_NOT_FOUND, 'OrderService.processReturnRefund');
    }

    if (order.paymentStatus !== 'paid') {
      throw new AppError('Refunds can only be processed on orders where customer payment was collected.', 400);
    }

    const amt = Number(refundAmount);
    if (isNaN(amt) || amt <= 0) {
      throw new AppError('Refund amount must be a positive number.', 400);
    }

    if (amt > order.total) {
      throw new AppError(`Refund amount (${amt} EGP) cannot exceed order total (${order.total} EGP).`, 400);
    }

    let selectedAccount = null;
    if (cashAccountId) {
      selectedAccount = await CashAccount.findById(cashAccountId);
    } else if (order.cashAccount) {
      selectedAccount = await CashAccount.findById(order.cashAccount);
    } else {
      selectedAccount = await CashAccount.findOne({ active: true });
    }

    if (selectedAccount) {
      selectedAccount.balance = (selectedAccount.balance || 0) - amt;
      selectedAccount.transactions.push({
        type: 'REFUND',
        amount: -amt,
        balanceAfter: selectedAccount.balance,
        referenceId: order.orderNumber,
        referenceType: 'ORDER',
        description: `Customer refund for returned Order #${order.orderNumber}`,
        createdBy: adminUser?._id || null,
        date: new Date()
      });
      await selectedAccount.save();
    }

    order.paymentStatus = 'refunded';
    order.returnDetails = order.returnDetails || {};
    order.returnDetails.refundStatus = 'refunded';
    order.returnDetails.refundAmount = amt;
    order.returnDetails.refundedAt = new Date();
    order.returnDetails.refundCashAccountId = selectedAccount ? selectedAccount._id : null;
    order.returnDetails.refundNotes = notes || '';

    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: order.orderStatus,
      changedAt: new Date(),
      changedBy: adminUser?._id || null,
      note: `Customer refund of ${amt} EGP processed via ${selectedAccount?.name || 'Cash'}. Notes: ${notes || 'None'}`
    });

    await order.save();
    return order;
  }

  /**
   * Admin: One-click verify order payment, deposit to CashAccount, and notify customer
   */
  static async verifyOrderPayment(orderId, { cashAccountId = null, notes = null, amountReceived = null } = {}, adminUser = null) {
    const order = await Order.findById(orderId).populate('customer', 'name email phone');
    if (!order) {
      throw new AppError('Order not found.', 404, ErrorCodes.ORDER_NOT_FOUND, 'OrderService.verifyOrderPayment');
    }

    order.paymentStatus = 'paid';
    if (order.orderStatus === 'pending') {
      order.orderStatus = 'confirmed';
    }
    order.verifiedBy = adminUser?._id || null;
    order.verifiedAt = new Date();
    if (notes) order.adminNotes = notes;

    // Credit Cash Account if selected or if a default digital wallet / cash account exists
    let selectedCashAccount = null;
    if (cashAccountId) {
      selectedCashAccount = await CashAccount.findById(cashAccountId);
    } else {
      // Find matching cash account by payment method or first active account
      if (order.paymentMethod === 'vodafone_cash') {
        selectedCashAccount = await CashAccount.findOne({
          active: true,
          $or: [{ type: 'digital_wallet' }, { name: /vodafone/i }, { name: /فودافون/i }]
        });
      } else if (order.paymentMethod === 'instapay') {
        selectedCashAccount = await CashAccount.findOne({
          active: true,
          $or: [{ type: 'bank' }, { name: /instapay/i }, { name: /انستاباي/i }, { name: /إنستاباي/i }]
        });
      }

      if (!selectedCashAccount) {
        selectedCashAccount = await CashAccount.findOne({ active: true });
      }
    }

    const finalAmount = amountReceived !== null && amountReceived !== undefined ? Number(amountReceived) : order.total;

    if (selectedCashAccount) {
      order.cashAccount = selectedCashAccount._id;
      selectedCashAccount.balance = (selectedCashAccount.balance || 0) + finalAmount;
      selectedCashAccount.transactions.push({
        type: 'SALE',
        amount: finalAmount,
        balanceAfter: selectedCashAccount.balance,
        referenceId: order.orderNumber,
        referenceType: 'ORDER',
        description: `Payment verified for Order #${order.orderNumber} (${order.paymentMethod})`,
        createdBy: adminUser?._id || null,
        date: new Date()
      });
      await selectedCashAccount.save();
    }

    await order.save();

    // Send confirmation email if customer email exists
    const customerEmail = order.customerEmail || order.customer?.email;
    if (customerEmail) {
      try {
        const settings = await SettingsService.getSettings();
        const trackingUrl = `${settings.storeUrl || 'https://m20fragrance.store'}/track-order?order=${order.orderNumber}`;
        await EmailService.sendOrderConfirmation({
          to: customerEmail,
          name: order.customer?.name || 'Valued Customer',
          orderNumber: order.orderNumber,
          total: order.total,
          items: order.items,
          deliveryMethod: order.deliveryMethod,
          shippingAddress: order.shippingAddress,
          trackingUrl
        });
      } catch (err) {
        console.error('[OrderService.verifyOrderPayment] Email dispatch error:', err);
      }
    }

    return order;
  }

  /**
   * Public Safe QR Verification for Invoices & Customers
   */
  static async getPublicVerification(orderNumber) {
    if (!orderNumber) {
      throw new AppError('Order number is required for verification.', 400, ErrorCodes.VALIDATION_ERROR, 'OrderService.getPublicVerification');
    }

    const order = await Order.findOne({ orderNumber: orderNumber.trim() })
      .populate('customer', 'name')
      .select('orderNumber orderStatus paymentStatus deliveryMethod metroPickup createdAt items customer');

    if (!order) {
      throw new AppError('Order not found or invalid verification code.', 404, ErrorCodes.ORDER_NOT_FOUND, 'OrderService.getPublicVerification');
    }

    // Mask customer name for privacy e.g. "Ah*** M***"
    const rawName = order.customer?.name || 'Guest Customer';
    const maskedName = rawName
      .split(' ')
      .map(part => (part.length > 2 ? `${part[0]}***${part[part.length - 1]}` : part))
      .join(' ');

    return {
      orderNumber: order.orderNumber,
      isVerified: order.paymentStatus === 'paid',
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      deliveryMethod: order.deliveryMethod,
      customerName: maskedName,
      itemCount: order.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0,
      items: order.items?.map(i => ({
        name: i.productName,
        size: i.size,
        quantity: i.quantity
      })),
      createdAt: order.createdAt
    };
  }

  /**
   * Admin: Create manual order directly from Dashboard
   */
  static async createAdminOrder(payload = {}, adminUser = null) {
    const {
      items = [],
      deliveryMethod = 'home_delivery',
      metroPickup = null,
      shippingAddress = {},
      customerPhone = '',
      customerPhone2 = null,
      customerEmail = null,
      customerName = '',
      paymentMethod = 'cash_on_delivery',
      paymentStatus = 'pending',
      orderStatus = 'confirmed',
      shipping = 50,
      discount = 0,
      cashAccountId = null,
      adminNotes = ''
    } = payload;

    if (!customerPhone || !customerPhone.trim()) {
      throw new AppError('Customer phone number is required.', 400);
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('At least one item is required in the order.', 400);
    }

    const normPhone = normalizePhone(customerPhone) || customerPhone.trim();
    let user = await User.findOne({ phone: normPhone });
    if (!user) {
      const userId = generateUserId();
      user = await User.create({
        userId,
        name: customerName ? customerName.trim() : 'Valued Customer',
        phone: normPhone,
        email: customerEmail || undefined,
        role: 'customer'
      });
    } else {
      if (customerName && customerName.trim()) user.name = customerName.trim();
      if (customerEmail && !user.email) user.email = customerEmail;
      await user.save();
    }

    let calculatedSubtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId || item.product || item._id);
      if (!product) {
        throw new AppError(`Product ID '${item.productId}' not found.`, 404);
      }

      // Find variant by size or SKU
      const variant = product.variants?.find(
        (v) => (item.variantSKU && v.SKU?.toUpperCase() === item.variantSKU?.toUpperCase()) ||
               (item.size && v.size?.toLowerCase() === item.size?.toLowerCase())
      ) || product.variants?.[0];

      const itemPrice = item.price !== undefined && item.price !== null && item.price !== '' 
        ? Number(item.price) 
        : (variant?.price || 0);
      const itemQty = Math.max(1, Number(item.quantity) || 1);
      const itemTotal = itemPrice * itemQty;
      calculatedSubtotal += itemTotal;

      validatedItems.push({
        product: product._id,
        variantSKU: variant?.SKU || `ELN-${product.slug}-${item.size || '50ml'}`,
        productName: product.name,
        size: item.size || variant?.size || '50ml',
        price: itemPrice,
        quantity: itemQty
      });
    }

    const numShipping = Math.max(0, Math.round(Number(payload.shippingFeeCharged ?? shipping ?? 0)));
    const numDiscount = Math.max(0, Math.round(Number(discount) || 0));
    const calculatedTotal = Math.max(0, calculatedSubtotal - numDiscount + numShipping);
    const orderNumber = generateOrderNumber();

    const defaultOutboundRate = deliveryMethod === 'home_delivery' 
      ? getGovernorateRate(shippingAddress.governorate) 
      : 15;
    const actualOutboundCost = payload.actualOutboundShippingCost !== undefined 
      ? Math.round(Number(payload.actualOutboundShippingCost)) 
      : defaultOutboundRate;

    const order = await Order.create({
      orderNumber,
      customer: user._id,
      items: validatedItems,
      subtotal: calculatedSubtotal,
      discount: numDiscount,
      shippingDiscount: 0,
      deliveryMethod,
      metroPickup: deliveryMethod === 'metro_pickup' ? metroPickup : null,
      metroPickupFee: deliveryMethod === 'metro_pickup' ? numShipping : 0,
      shipping: deliveryMethod === 'home_delivery' ? numShipping : 0,
      shippingFeeCharged: deliveryMethod === 'home_delivery' ? numShipping : 0,
      paymentFee: 0,
      actualOutboundShippingCost: actualOutboundCost,
      realShippingCost: actualOutboundCost,
      actualReturnShippingCost: 0,
      total: calculatedTotal,
      orderStatus: orderStatus || 'confirmed',
      paymentStatus: paymentStatus || 'pending',
      paymentMethod: (paymentMethod || 'cash_on_delivery').toLowerCase(),
      shippingAddress: deliveryMethod === 'home_delivery' ? shippingAddress : {},
      customerPhone: normPhone,
      customerPhone2: customerPhone2 || null,
      customerEmail: customerEmail || null,
      adminNotes: adminNotes || 'Created manually from Dashboard'
    });

    // If marked paid upon creation, credit selected cash account
    if (paymentStatus === 'paid') {
      let selectedAccount = null;
      if (cashAccountId) {
        selectedAccount = await CashAccount.findById(cashAccountId);
      } else {
        selectedAccount = await CashAccount.findOne({ active: true });
      }

      if (selectedAccount) {
        order.cashAccount = selectedAccount._id;
        order.verifiedBy = adminUser?._id || null;
        order.verifiedAt = new Date();
        selectedAccount.balance = (selectedAccount.balance || 0) + calculatedTotal;
        selectedAccount.transactions.push({
          type: 'SALE',
          amount: calculatedTotal,
          balanceAfter: selectedAccount.balance,
          referenceId: order.orderNumber,
          referenceType: 'ORDER',
          description: `Manual order created and marked paid #${order.orderNumber}`,
          createdBy: adminUser?._id || null,
          date: new Date()
        });
        await selectedAccount.save();
        await order.save();
      }
    }

    return order;
  }

  /**
   * Admin: Permanently delete one, several, or all orders.
   * - Orders that still hold deducted inventory get their finished liquid + packaging returned to stock
   *   (unless restoreStock === false), so stock counts stay correct.
   * - Cash account balances are NOT reversed (money already received is real); adjust in Finance if needed.
   */
  static async deleteOrders({ ids = [], all = false, confirm = '', restoreStock = true } = {}, adminUser = null) {
    let orders;
    if (all) {
      if (String(confirm).trim() !== 'DELETE ALL ORDERS') {
        throw new AppError('Confirmation text mismatch. Type DELETE ALL ORDERS to delete every order.', 400, ErrorCodes.VALIDATION_ERROR || 'VALIDATION_ERROR', 'OrderService.deleteOrders');
      }
      orders = await Order.find({});
    } else {
      const cleanIds = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (cleanIds.length === 0) {
        throw new AppError('No valid order ids were provided.', 400, ErrorCodes.VALIDATION_ERROR || 'VALIDATION_ERROR', 'OrderService.deleteOrders');
      }
      if (cleanIds.length > 1000) {
        throw new AppError('Too many orders in one request (max 1000).', 400, ErrorCodes.VALIDATION_ERROR || 'VALIDATION_ERROR', 'OrderService.deleteOrders');
      }
      orders = await Order.find({ _id: { $in: cleanIds } });
    }

    let restocked = 0;
    for (const order of orders) {
      if (restoreStock !== false && order.inventoryDeducted) {
        for (const item of order.items || []) {
          if (item.liquidGramsConsumed > 0) {
            const prod = await Product.findById(item.product);
            if (prod) {
              const prevLiquid = prod.finishedLiquidGrams || 0;
              prod.finishedLiquidGrams = prevLiquid + item.liquidGramsConsumed;
              prod.totalConsumedLiquidGrams = Math.max(0, (prod.totalConsumedLiquidGrams || 0) - item.liquidGramsConsumed);
              await prod.save();
              await StockMovement.create({
                itemType: 'FinishedLiquid',
                product: prod._id,
                itemName: `${prod.name} (Finished Liquid)`,
                movementType: 'RETURN',
                quantityBefore: prevLiquid,
                quantityChange: item.liquidGramsConsumed,
                quantityAfter: prod.finishedLiquidGrams,
                unit: 'gram',
                unitCost: prod.finishedLiquidCostPerGram || 0,
                totalValue: item.liquidGramsConsumed * (prod.finishedLiquidCostPerGram || 0),
                reason: `Restocked because Order #${order.orderNumber} was deleted`,
                referenceId: order.orderNumber,
                referenceType: 'Order',
                createdBy: adminUser?._id || null
              });
            }
          }
        }
        await OrderService.adjustPackagingForOrder(order, 'restock', adminUser?._id);
        restocked += 1;
      }
      await Order.deleteOne({ _id: order._id });
    }

    return { deletedCount: orders.length, restockedOrders: restocked };
  }
}

module.exports = OrderService;
