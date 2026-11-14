/**
 * M20 PARFUMS — Seed Core Fragrances, BOM Formulas, and Manufacturing Setup
 * Configures the 6 official core fragrances with exact gram-based specifications:
 * - CRUSH (MEN): 22% Oil / 78% Alcohol
 * - CROWN (MEN): 25% Oil / 75% Alcohol
 * - NIGHT (MEN): 22% Oil / 78% Alcohol
 * - BLOOM (WOMEN): 20% Oil / 80% Alcohol
 * - CHERRY (UNISEX): 25% Oil / 75% Alcohol
 * - CLOUD (UNISEX): 25% Oil / 75% Alcohol
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Product = require('../modules/products/product.model');
const Formula = require('../modules/formulas/formula.model');
const RawMaterial = require('../modules/inventory/rawMaterial.model');
const Settings = require('../modules/settings/settings.model');
const { MANUFACTURING_DEFAULTS } = require('../utils/helpers/manufacturing');

const CORE_FRAGRANCES_DATA = [
  {
    name: 'CRUSH',
    nameAr: 'كراش',
    slug: 'crush',
    gender: 'MEN',
    fragranceFamily: 'Warm Amber & Spiced Citrus',
    shortDescription: 'Warm amber, spiced citrus, and woody evening depth.',
    description: 'M20 CRUSH is formulated for magnetic presence. Rich amber resin meets spiced bergamot and cedarwood for exceptional longevity and sillage.',
    oilRatio: 0.22,
    alcoholRatio: 0.78,
    oilPercentage: 22,
    alcoholPercentage: 78,
    oilRawName: 'CRUSH Pure Fragrance Oil',
    oilRawNameAr: 'زيت عطر كراش النقي',
    variants: [
      { size: '30ml', price: 850, SKU: 'M20-CRUSH-30ML', stock: 999, targetWeightGrams: 25 },
      { size: '50ml', price: 1450, SKU: 'M20-CRUSH-50ML', stock: 999, targetWeightGrams: 43 },
      { size: '100ml', price: 2200, SKU: 'M20-CRUSH-100ML', stock: 999, targetWeightGrams: 78 }
    ],
    mainImage: { url: '/img/m20-crush-bottle.jpg', alt: 'M20 Crush Bottle' },
    images: [{ url: '/img/m20-crush-bottle.jpg', role: 'main', alt: 'M20 Crush' }]
  },
  {
    name: 'CROWN',
    nameAr: 'كراون',
    slug: 'crown',
    gender: 'MEN',
    fragranceFamily: 'Royal Woods & Citrus',
    shortDescription: 'Golden bergamot, honeyed woods, and crisp white musk.',
    description: 'M20 CROWN is a poised signature composition balancing sunlit Italian bergamot, honeyed woods, and crisp white musk with regal restraint.',
    oilRatio: 0.25,
    alcoholRatio: 0.75,
    oilPercentage: 25,
    alcoholPercentage: 75,
    oilRawName: 'CROWN Pure Fragrance Oil',
    oilRawNameAr: 'زيت عطر كراون النقي',
    variants: [
      { size: '30ml', price: 900, SKU: 'M20-CROWN-30ML', stock: 999, targetWeightGrams: 25 },
      { size: '50ml', price: 1550, SKU: 'M20-CROWN-50ML', stock: 999, targetWeightGrams: 43 },
      { size: '100ml', price: 2350, SKU: 'M20-CROWN-100ML', stock: 999, targetWeightGrams: 78 }
    ],
    mainImage: { url: '/img/m20-crown-bottle.jpg', alt: 'M20 Crown Bottle' },
    images: [{ url: '/img/m20-crown-bottle.jpg', role: 'main', alt: 'M20 Crown' }]
  },
  {
    name: 'NIGHT',
    nameAr: 'نايت',
    slug: 'night',
    gender: 'MEN',
    fragranceFamily: 'Deep Indigo & Smoky Oud',
    shortDescription: 'Deep nocturnal clarity etched in cool indigo, cedar, and smoky oud.',
    description: 'M20 NIGHT is designed for quiet nighttime command. Cold cardamom opens into velvety cedarwood and smoked oud for undeniable endurance.',
    oilRatio: 0.22,
    alcoholRatio: 0.78,
    oilPercentage: 22,
    alcoholPercentage: 78,
    oilRawName: 'NIGHT Pure Fragrance Oil',
    oilRawNameAr: 'زيت عطر نايت النقي',
    variants: [
      { size: '30ml', price: 850, SKU: 'M20-NIGHT-30ML', stock: 999, targetWeightGrams: 25 },
      { size: '50ml', price: 1450, SKU: 'M20-NIGHT-50ML', stock: 999, targetWeightGrams: 43 },
      { size: '100ml', price: 2200, SKU: 'M20-NIGHT-100ML', stock: 999, targetWeightGrams: 78 }
    ],
    mainImage: { url: '/img/m20-night-bottle.jpg', alt: 'M20 Night Bottle' },
    images: [{ url: '/img/m20-night-bottle.jpg', role: 'main', alt: 'M20 Night' }]
  },
  {
    name: 'BLOOM',
    nameAr: 'بلوم',
    slug: 'bloom',
    gender: 'WOMEN',
    fragranceFamily: 'Velvet Rose & Powdery Floral',
    shortDescription: 'Velvet botanical petals suspended in morning stillness.',
    description: 'M20 BLOOM is an exquisite floral extrait. Delicate Bulgarian rose and white jasmine soften over a base of Madagascar vanilla and clean iris.',
    oilRatio: 0.20,
    alcoholRatio: 0.80,
    oilPercentage: 20,
    alcoholPercentage: 80,
    oilRawName: 'BLOOM Pure Fragrance Oil',
    oilRawNameAr: 'زيت عطر بلوم النقي',
    variants: [
      { size: '30ml', price: 850, SKU: 'M20-BLOOM-30ML', stock: 999, targetWeightGrams: 25 },
      { size: '50ml', price: 1450, SKU: 'M20-BLOOM-50ML', stock: 999, targetWeightGrams: 43 },
      { size: '100ml', price: 2200, SKU: 'M20-BLOOM-100ML', stock: 999, targetWeightGrams: 78 }
    ],
    mainImage: { url: '/img/m20-bloom-bottle.jpg', alt: 'M20 Bloom Bottle' },
    images: [{ url: '/img/m20-bloom-bottle.jpg', role: 'main', alt: 'M20 Bloom' }]
  },
  {
    name: 'CHERRY',
    nameAr: 'تشيري',
    slug: 'cherry',
    gender: 'UNISEX',
    fragranceFamily: 'Gourmand Cherry & Almond Smoke',
    shortDescription: 'Dark cherry liqueur, roasted tonka bean, and almond smoke.',
    description: 'M20 CHERRY is a rich, intoxicating gourmand. Bitter almond and lush black cherry open into Turkish rose and roasted tonka bean.',
    oilRatio: 0.25,
    alcoholRatio: 0.75,
    oilPercentage: 25,
    alcoholPercentage: 75,
    oilRawName: 'CHERRY Pure Fragrance Oil',
    oilRawNameAr: 'زيت عطر تشيري النقي',
    variants: [
      { size: '30ml', price: 900, SKU: 'M20-CHERRY-30ML', stock: 999, targetWeightGrams: 25 },
      { size: '50ml', price: 1550, SKU: 'M20-CHERRY-50ML', stock: 999, targetWeightGrams: 43 },
      { size: '100ml', price: 2350, SKU: 'M20-CHERRY-100ML', stock: 999, targetWeightGrams: 78 }
    ],
    mainImage: { url: '/img/m20-cherry-bottle.jpg', alt: 'M20 Cherry Bottle' },
    images: [{ url: '/img/m20-cherry-bottle.jpg', role: 'main', alt: 'M20 Cherry' }]
  },
  {
    name: 'CLOUD',
    nameAr: 'كلاود',
    slug: 'cloud',
    gender: 'UNISEX',
    fragranceFamily: 'Airy Gourmand & Solar Musk',
    shortDescription: 'Airy spun sugar, whipped coconut cream, and soft solar musk.',
    description: 'M20 CLOUD is a dreamy, uplifting cloud of fragrance. Lavender blossom, pear nectar, and whipped coconut settle onto radiant ambroxan.',
    oilRatio: 0.25,
    alcoholRatio: 0.75,
    oilPercentage: 25,
    alcoholPercentage: 75,
    oilRawName: 'CLOUD Pure Fragrance Oil',
    oilRawNameAr: 'زيت عطر كلاود النقي',
    variants: [
      { size: '30ml', price: 900, SKU: 'M20-CLOUD-30ML', stock: 999, targetWeightGrams: 25 },
      { size: '50ml', price: 1550, SKU: 'M20-CLOUD-50ML', stock: 999, targetWeightGrams: 43 },
      { size: '100ml', price: 2350, SKU: 'M20-CLOUD-100ML', stock: 999, targetWeightGrams: 78 }
    ],
    mainImage: { url: '/img/m20-cloud-bottle.jpg', alt: 'M20 Cloud Bottle' },
    images: [{ url: '/img/m20-cloud-bottle.jpg', role: 'main', alt: 'M20 Cloud' }]
  }
];

const PACKAGING_RAW_MATERIALS = [
  // Alcohol 96%
  { name: 'Alcohol 96% (باندا ماكس)', category: 'alcohol', unit: 'gram', currentStock: 25000, costPerGram: 0.18, lowStockThreshold: 5000 },
  // Bottles with Cap & Sprayer
  { name: 'Empty Bottle 30ml with Cap & Sprayer', category: 'bottle', unit: 'piece', currentStock: 500, costPerGram: 35, lowStockThreshold: 50 },
  { name: 'Empty Bottle 50ml with Cap & Sprayer', category: 'bottle', unit: 'piece', currentStock: 500, costPerGram: 45, lowStockThreshold: 50 },
  { name: 'Empty Bottle 100ml with Cap & Sprayer', category: 'bottle', unit: 'piece', currentStock: 500, costPerGram: 60, lowStockThreshold: 50 },
  // Stickers
  { name: 'M20 Luxury Bottle Sticker 30ml', category: 'sticker', unit: 'piece', currentStock: 1000, costPerGram: 15, lowStockThreshold: 100 },
  { name: 'M20 Luxury Bottle Sticker 50ml', category: 'sticker', unit: 'piece', currentStock: 1000, costPerGram: 20, lowStockThreshold: 100 },
  { name: 'M20 Luxury Bottle Sticker 100ml', category: 'sticker', unit: 'piece', currentStock: 1000, costPerGram: 25, lowStockThreshold: 100 },
  // Boxes
  { name: 'M20 Rigid Presentation Box 30ml', category: 'box', unit: 'piece', currentStock: 500, costPerGram: 20, lowStockThreshold: 50 },
  { name: 'M20 Rigid Presentation Box 50ml', category: 'box', unit: 'piece', currentStock: 500, costPerGram: 25, lowStockThreshold: 50 },
  { name: 'M20 Rigid Presentation Box 100ml', category: 'box', unit: 'piece', currentStock: 500, costPerGram: 35, lowStockThreshold: 50 }
];

async function seed() {
  await connectDB();
  console.log('[SEED] Starting M20 BOM Recipes and Manufacturing setup...');

  // 1. Ensure Manufacturing Settings in Settings model
  const settings = await Settings.findOne() || new Settings();
  if (!settings.manufacturing) {
    settings.manufacturing = MANUFACTURING_DEFAULTS;
  } else {
    settings.manufacturing.densities = {
      fragranceOil: 0.93,
      alcohol96: 0.70
    };
    settings.manufacturing.bottleSpecs = MANUFACTURING_DEFAULTS.bottleSpecs;
  }
  await settings.save();
  console.log('[SEED] Saved official manufacturing density constants and bottle specs to Settings.');

  // 2. Ensure Packaging & Alcohol Raw Materials
  for (const mat of PACKAGING_RAW_MATERIALS) {
    let existing = await RawMaterial.findOne({ name: mat.name });
    if (!existing) {
      existing = await RawMaterial.create(mat);
      console.log(`[SEED] Created Raw Material: ${mat.name}`);
    }
  }

  // 3. Ensure Each Core Fragrance Product & Oil Material & Formula
  for (const item of CORE_FRAGRANCES_DATA) {
    // 3a. Raw material for fragrance oil
    let oilMaterial = await RawMaterial.findOne({ name: item.oilRawName });
    if (!oilMaterial) {
      oilMaterial = await RawMaterial.create({
        name: item.oilRawName,
        category: 'fragrance_oil',
        unit: 'gram',
        currentStock: 2500, // 2.5 kg initial test stock
        costPerGram: 5.0,   // 5 EGP / gram
        lowStockThreshold: 500,
        supplier: 'M20 Certified Fragrance Oil Compounder'
      });
      console.log(`[SEED] Created Fragrance Oil Material: ${item.oilRawName}`);
    }

    // 3b. Product record
    let product = await Product.findOne({ slug: item.slug });
    if (!product) {
      product = await Product.create({
        name: item.name,
        nameAr: item.nameAr,
        slug: item.slug,
        gender: item.gender,
        fragranceFamily: item.fragranceFamily,
        shortDescription: item.shortDescription,
        description: item.description,
        variants: item.variants,
        mainImage: item.mainImage,
        images: item.images,
        featured: true,
        active: true,
        liquidDensity: 0.86,
        finishedLiquidGrams: 0,
        finishedLiquidCostPerGram: 0
      });
      console.log(`[SEED] Created Product: ${item.name} (${item.slug})`);
    } else {
      product.gender = item.gender;
      product.variants = item.variants;
      await product.save();
    }

    // 3c. BOM Recipe / Formula
    let formula = await Formula.findOne({ fragrance: product._id, active: true });
    if (!formula) {
      formula = await Formula.create({
        fragrance: product._id,
        fragranceName: product.name,
        version: 1,
        oilPercentage: item.oilPercentage,
        alcoholPercentage: item.alcoholPercentage,
        oilRatio: item.oilRatio,
        alcoholRatio: item.alcoholRatio,
        ingredients: [
          {
            rawMaterial: oilMaterial._id,
            rawMaterialName: oilMaterial.name,
            percentage: 100, // 100% of oil portion is this fragrance oil
            notes: `Ready-made ${item.name} fragrance oil concentrate`
          }
        ],
        notes: `Official M20 BOM Recipe: ${item.oilPercentage}% Fragrance Oil / ${item.alcoholPercentage}% Alcohol 96%`,
        active: true
      });
      product.currentFormula = formula._id;
      await product.save();
      console.log(`[SEED] Created Formula for ${product.name}: ${item.oilPercentage}% Oil / ${item.alcoholPercentage}% Alcohol`);
    } else {
      formula.oilPercentage = item.oilPercentage;
      formula.alcoholPercentage = item.alcoholPercentage;
      formula.oilRatio = item.oilRatio;
      formula.alcoholRatio = item.alcoholRatio;
      await formula.save();
      if (!product.currentFormula) {
        product.currentFormula = formula._id;
        await product.save();
      }
    }
  }

  console.log('[SEED] All 6 core fragrances and BOM recipes successfully synced!');
  await mongoose.disconnect();
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[SEED] Error:', err);
      process.exit(1);
    });
}

module.exports = seed;
