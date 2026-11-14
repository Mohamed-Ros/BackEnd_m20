const mongoose = require('mongoose');

const adSpendSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: [true, 'Ad platform is required'],
      enum: ['meta', 'tiktok', 'other'],
      index: true
    },
    campaignName: {
      type: String,
      required: [true, 'Campaign name is required'],
      trim: true,
      index: true
    },
    adContent: {
      type: String,
      trim: true,
      default: ''
    },
    amountEGP: {
      type: Number,
      required: [true, 'Amount in whole EGP is required'],
      min: [1, 'Amount must be at least 1 EGP'],
      set: (v) => Math.round(Number(v))
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
      default: Date.now,
      index: true
    },
    endDate: {
      type: Date,
      default: null
    },
    paymentAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashAccount',
      default: null
    },
    paymentAccountName: {
      type: String,
      default: ''
    },
    expenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense',
      default: null
    },
    notes: {
      type: String,
      default: '',
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

adSpendSchema.index({ platform: 1, startDate: -1 });
adSpendSchema.index({ campaignName: 1, startDate: -1 });

module.exports = mongoose.model('AdSpend', adSpendSchema);
