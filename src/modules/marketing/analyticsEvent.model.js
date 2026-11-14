const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: ['page_view', 'view_content', 'add_to_cart', 'initiate_checkout', 'purchase'],
      index: true
    },
    platform: {
      type: String,
      enum: ['meta', 'tiktok', 'google', 'organic', 'direct', 'other'],
      default: 'direct',
      index: true
    },
    campaign: {
      type: String,
      default: '',
      trim: true,
      index: true
    },
    content: {
      type: String,
      default: '',
      trim: true
    },
    sessionId: {
      type: String,
      required: true,
      index: true
    },
    path: {
      type: String,
      default: '/'
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null
    },
    productName: {
      type: String,
      default: ''
    },
    value: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'EGP'
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    versionKey: false
  }
);

analyticsEventSchema.index({ eventType: 1, platform: 1, createdAt: -1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
