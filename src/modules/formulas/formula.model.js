const mongoose = require('mongoose');

const formulaIngredientSchema = new mongoose.Schema(
  {
    rawMaterial: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RawMaterial',
      required: [true, 'Raw material reference is required']
    },
    rawMaterialName: {
      type: String,
      required: true,
      trim: true
    },
    percentage: {
      type: Number,
      required: [true, 'Ingredient percentage is required'],
      min: [0.01, 'Percentage must be greater than 0'],
      max: [100, 'Percentage cannot exceed 100']
    },
    notes: {
      type: String,
      default: '',
      trim: true
    }
  },
  { _id: false }
);

const formulaSchema = new mongoose.Schema(
  {
    fragrance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Fragrance product reference is required'],
      index: true
    },
    fragranceName: {
      type: String,
      required: true,
      trim: true
    },
    version: {
      type: Number,
      required: true,
      default: 1
    },
    oilPercentage: {
      type: Number,
      default: 25,
      min: [1, 'Oil percentage must be at least 1%'],
      max: [100, 'Oil percentage cannot exceed 100%']
    },
    alcoholPercentage: {
      type: Number,
      default: 75,
      min: [0, 'Alcohol percentage cannot be negative'],
      max: [99, 'Alcohol percentage cannot exceed 99%']
    },
    oilRatio: {
      type: Number,
      default: 0.25
    },
    alcoholRatio: {
      type: Number,
      default: 0.75
    },
    ingredients: {
      type: [formulaIngredientSchema],
      validate: [
        function (val) {
          if (!val || val.length === 0) return false;
          const total = val.reduce((sum, item) => sum + (Number(item.percentage) || 0), 0);
          return Math.abs(total - 100) < 0.01;
        },
        'Total ingredient percentages must equal exactly 100% of fragrance oil portion.'
      ]
    },
    notes: {
      type: String,
      default: '',
      trim: true
    },
    active: {
      type: Boolean,
      default: true,
      index: true
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

formulaSchema.virtual('name').get(function () {
  return this.fragranceName;
});

formulaSchema.virtual('bottleBreakdowns').get(function () {
  const { getNetBottleBreakdowns } = require('../../utils/helpers/manufacturing');
  const ratio = this.oilRatio || (this.oilPercentage ? this.oilPercentage / 100 : 0.25);
  return getNetBottleBreakdowns(ratio);
});

formulaSchema.set('toJSON', { virtuals: true });
formulaSchema.set('toObject', { virtuals: true });

formulaSchema.index({ fragrance: 1, version: 1 }, { unique: true });

const Formula = mongoose.model('Formula', formulaSchema);

module.exports = Formula;
