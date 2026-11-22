const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variantSKU: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    productName: {
      type: String,
      required: true
    },
    isPreOrder: {
      type: Boolean,
      default: false
    },
    size: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1']
    },
    liquidGramsConsumed: {
      type: Number,
      default: 0
    },
    unitCost: {
      type: Number,
      default: 0
    },
    totalCost: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      index: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    items: {
      type: [orderItemSchema],
      validate: [(val) => val && val.length > 0, 'Order must contain at least one item.']
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    couponCode: {
      type: String,
      default: null
    },
    shipping: {
      type: Number,
      default: 0,
      min: 0
    },
    shippingFeeCharged: {
      type: Number,
      default: 0,
      min: 0
    },
    shippingDiscount: {
      type: Number,
      default: 0,
      min: 0
    },
    metroPickupFee: {
      type: Number,
      default: 0,
      min: 0
    },
    deliveryMethod: {
      type: String,
      enum: ['metro_pickup', 'home_delivery'],
      default: 'home_delivery',
      required: true
    },
    metroPickup: {
      stationId: { type: String, default: null },
      stationNameEn: { type: String, default: null },
      stationNameAr: { type: String, default: null },
      line: { type: String, default: null },
      pickupNote: { type: String, default: 'Pickup date and time will be confirmed after your order is reviewed.' },
      fee: { type: Number, default: 0 }
    },
    customerPhone: {
      type: String,
      default: ''
    },
    total: {
      type: Number,
      required: true,
      min: 0
    },
    orderStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned_from_shipping'],
      default: 'pending',
      index: true
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
      index: true
    },
    paymentMethod: {
      type: String,
      enum: ['vodafone_cash', 'instapay', 'cod', 'cash_on_delivery', 'fawaterk', 'card'],
      default: 'cod',
      index: true
    },
    paymentSenderPhone: {
      type: String,
      default: null
    },
    paymentProofUrl: {
      type: String,
      default: null
    },
    paymentReference: {
      type: String,
      default: null
    },
    shippingAddress: {
      governorate: { type: String, default: '' },
      city: { type: String, default: '' },
      street: { type: String, default: '' },
      buildingNumber: { type: String, default: '' },
      floor: { type: String, default: '' },
      apartment: { type: String, default: '' },
      landmark: { type: String, default: '' },
      deliveryNotes: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      country: { type: String, default: 'Egypt' }
    },
    customerPhone2: {
      type: String,
      default: null
    },
    customerEmail: {
      type: String,
      default: null
    },
    paymentFee: {
      type: Number,
      default: 0
    },
    realShippingCost: {
      type: Number,
      default: 0
    },
    actualOutboundShippingCost: {
      type: Number,
      default: 0,
      min: 0
    },
    actualReturnShippingCost: {
      type: Number,
      default: 0,
      min: 0
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    cashAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashAccount',
      default: null
    },
    adminNotes: {
      type: String,
      default: null
    },
    totalCogs: {
      type: Number,
      default: 0
    },
    // Per-order cost split (EGP): manufacturing, marketing, shipping, packaging, operating, financial
    costBreakdown: {
      manufacturing: { type: Number, default: 0 },
      marketing: { type: Number, default: 0 },
      shipping: { type: Number, default: 0 },
      packaging: { type: Number, default: 0 },
      operating: { type: Number, default: 0 },
      financial: { type: Number, default: 0 },
      totalCost: { type: Number, default: 0 },
      netProfit: { type: Number, default: 0 },
      shippingCostPercent: { type: Number, default: 0 },
      shippingCostWarning: { type: Boolean, default: false }
    },
    inventoryDeducted: {
      type: Boolean,
      default: false
    },
    processedFirst100: {
      type: Boolean,
      default: false
    },
    returnDetails: {
      isReturned: {
        type: Boolean,
        default: false,
        index: true
      },
      returnedAt: {
        type: Date,
        default: null
      },
      outboundShippingFee: {
        type: Number,
        default: 0,
        min: 0
      },
      returnShippingFee: {
        type: Number,
        default: 0,
        min: 0
      },
      totalReturnShippingCost: {
        type: Number,
        default: 0,
        min: 0
      },
      shippingExpenseRecorded: {
        type: Boolean,
        default: false
      },
      shippingExpenseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Expense',
        default: null
      },
      returnReason: {
        type: String,
        default: ''
      },
      paymentAccountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CashAccount',
        default: null
      },
      restockStatus: {
        type: String,
        enum: ['not_inspected', 'inspected_restocked', 'inspected_damaged_discarded'],
        default: 'not_inspected',
        index: true
      },
      restockedAt: {
        type: Date,
        default: null
      },
      restockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      },
      inspectionNotes: {
        type: String,
        default: ''
      },
      refundStatus: {
        type: String,
        enum: ['not_applicable', 'pending_refund', 'refunded'],
        default: 'not_applicable'
      },
      refundAmount: {
        type: Number,
        default: 0
      },
      refundedAt: {
        type: Date,
        default: null
      },
      refundCashAccountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CashAccount',
        default: null
      },
      refundNotes: {
        type: String,
        default: ''
      }
    },
    statusHistory: [
      {
        status: {
          type: String,
          required: true
        },
        changedAt: {
          type: Date,
          default: Date.now
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null
        },
        note: {
          type: String,
          default: ''
        },
        metadata: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        }
      }
    ],
    // Marketing Attribution & Ad Tracking
    attribution: {
      source: { type: String, default: 'direct', trim: true, index: true },
      medium: { type: String, default: 'none', trim: true },
      campaign: { type: String, default: '', trim: true, index: true },
      content: { type: String, default: '', trim: true },
      term: { type: String, default: '', trim: true },
      fbclid: { type: String, default: '', trim: true },
      ttclid: { type: String, default: '', trim: true },
      channel: {
        type: String,
        enum: ['meta', 'tiktok', 'google', 'organic', 'direct', 'referral', 'other'],
        default: 'direct',
        index: true
      }
    },
    metaEventId: {
      type: String,
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
