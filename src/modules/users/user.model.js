const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true
    },
    phone: {
      type: String,
      required: false,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationCode: {
      type: String,
      default: null,
      select: false
    },
    emailVerificationExpires: {
      type: Date,
      default: null,
      select: false
    },
    emailVerificationAttempts: {
      type: Number,
      default: 0,
      select: false
    },
    emailOtpLastSentAt: {
      type: Date,
      default: null,
      select: false
    },
    emailOtpSendCount: {
      type: Number,
      default: 0,
      select: false
    },
    emailOtpSendWindowStart: {
      type: Date,
      default: null,
      select: false
    },
    password: {
      type: String,
      default: null,
      select: false
    },
    role: {
      type: String,
      enum: ['customer', 'admin', 'superadmin'],
      default: 'customer',
      index: true
    },
    totalOrders: {
      type: Number,
      default: 0,
      min: 0
    },
    totalSpent: {
      type: Number,
      default: 0,
      min: 0
    },
    isFirst100: {
      type: Boolean,
      default: false,
      index: true
    },
    firstOrderNumber: {
      type: String,
      default: null
    },
    foundingRank: {
      type: Number,
      default: null
    }
  },
  {
    timestamps: true
  }
);

userSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } }
);
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);

const User = mongoose.model('User', userSchema);

module.exports = User;
