const mongoose = require('mongoose');

const bundleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    size: {
      type: String,
      enum: ['30ml', '50ml', '100ml'],
      default: '50ml'
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1
    }
  },
  { _id: false }
);

const offerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Offer title is required'],
      trim: true
    },
    subtitle: {
      type: String,
      trim: true,
      default: ''
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    offerType: {
      type: String,
      enum: ['product_specific', 'bundle', 'general'],
      default: 'product_specific'
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'percentage'
    },
    discountValue: {
      type: Number,
      default: 0,
      min: [0, 'Discount value cannot be negative']
    },
    bundlePrice: {
      type: Number,
      default: null,
      min: [0, 'Bundle price cannot be negative']
    },
    bundleItems: [bundleItemSchema],
    applicableProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      }
    ],
    applicableSizes: [
      {
        type: String,
        enum: ['30ml', '50ml', '100ml']
      }
    ],
    bannerImage: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
      alt: { type: String, default: '' }
    },
    badge: {
      type: String,
      trim: true,
      default: ''
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      default: null
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    priority: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

offerSchema.index({ active: 1, startDate: 1, endDate: 1 });

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;
