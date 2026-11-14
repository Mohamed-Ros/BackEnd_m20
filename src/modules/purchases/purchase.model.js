const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema(
  {
    rawMaterial: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RawMaterial',
      required: true
    },
    rawMaterialName: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: [0.001, 'Quantity must be positive']
    },
    quantityGrams: {
      type: Number,
      default: function() { return this.quantity || 0; }
    },
    unit: {
      type: String,
      default: 'gram'
    },
    totalCost: {
      type: Number,
      required: true,
      min: [0, 'Total cost cannot be negative']
    },
    unitCost: {
      type: Number,
      default: function() { return this.quantity > 0 ? this.totalCost / this.quantity : 0; }
    },
    costPerGram: {
      type: Number,
      default: function() { return this.unitCost || 0; }
    },
    previousStock: {
      type: Number,
      default: 0
    },
    previousCostPerGram: {
      type: Number,
      default: 0
    },
    newWeightedCostPerGram: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    supplier: {
      type: String,
      default: '',
      trim: true
    },
    invoiceNumber: {
      type: String,
      default: '',
      trim: true
    },
    purchaseDate: {
      type: Date,
      default: Date.now
    },
    items: [purchaseItemSchema],
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    paymentStatus: {
      type: String,
      enum: ['paid', 'unpaid'],
      default: 'paid',
      index: true
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
    attachmentUrl: {
      type: String,
      default: null
    },
    isInventoryApplied: {
      type: Boolean,
      default: true
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

purchaseSchema.index({ createdAt: -1 });

const Purchase = mongoose.model('Purchase', purchaseSchema);

module.exports = Purchase;
