const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const connectDB = require('../config/database');
const Product = require('../modules/products/product.model');

const M20_CATALOG = [
  {
    name: 'M20 Signature Noir',
    nameAr: 'إم 20 سيجنتشر نوار',
    slug: 'm20-noir',
    fragranceFamily: 'Woody & Amber',
    gender: 'MEN',
    shortDescription: 'Black Cardamom, Velvet Oud, and Smoked Amber engineered for long endurance.',
    description: 'M20 NOIR is an assertive oriental fragrance built for those who command attention. Opening with spiced black cardamom and saffron, evolving into velvety oud, and settling into smoked amber and cedarwood for all-day intensity.',
    notes: {
      top: ['Black Cardamom', 'Saffron'],
      heart: ['Velvet Oud', 'Rose'],
      base: ['Smoked Amber', 'Cedarwood', 'Musk']
    },
    featured: true,
    active: true,
    variants: [
      { size: '30ml', price: 850, SKU: 'M20-SIGNA-30ML', stock: 999, targetWeightGrams: 28 },
      { size: '50ml', price: 1450, SKU: 'M20-SIGNA-50ML', stock: 999, targetWeightGrams: 45 },
      { size: '100ml', price: 2200, SKU: 'M20-SIGNA-100ML', stock: 999, targetWeightGrams: 90 }
    ],
    mainImage: { url: '/img/زجاجة عطر نوار الفاخرة.png', alt: 'M20 Noir Bottle' },
    hoverImage: { url: '/img/عطر نوار بالقهوة والفانيليا والعنبر.png', alt: 'M20 Noir Ingredients' },
    images: [
      { url: '/img/زجاجة عطر نوار الفاخرة.png', role: 'main', alt: 'M20 Noir Bottle' },
      { url: '/img/عطر نوار بالقهوة والفانيليا والعنبر.png', role: 'hover', alt: 'M20 Noir Ingredients' }
    ]
  },
  {
    name: 'SOLEIL BLANC',
    nameAr: 'سولاي بلان',
    slug: 'soleil-blanc',
    fragranceFamily: 'Floral Citrus',
    gender: 'WOMEN',
    shortDescription: 'Neroli Blossom, White Amber, and Cashmere Wood crafted for distinction.',
    description: 'SOLEIL BLANC is a luminous, sun-drenched composition. Delicate neroli and jasmine bloom over a base of white amber and cashmere wood for a refined feminine signature.',
    notes: {
      top: ['Neroli', 'Grapefruit'],
      heart: ['White Jasmine', 'Tuberose'],
      base: ['White Amber', 'Cashmere Wood', 'Vanilla']
    },
    featured: true,
    active: true,
    variants: [
      { size: '30ml', price: 900, SKU: 'M20-SOLEIL-30ML', stock: 999, targetWeightGrams: 28 },
      { size: '50ml', price: 1550, SKU: 'M20-SOLEIL-50ML', stock: 999, targetWeightGrams: 45 },
      { size: '100ml', price: 2350, SKU: 'M20-SOLEIL-100ML', stock: 999, targetWeightGrams: 90 }
    ],
    mainImage: { url: '/img/product.png', alt: 'Soleil Blanc Bottle' },
    hoverImage: { url: '/img/product.png', alt: 'Soleil Blanc Composition' },
    images: [
      { url: '/img/product.png', role: 'main', alt: 'Soleil Blanc Bottle' }
    ]
  },
  {
    name: 'ROYAL VETIVER',
    nameAr: 'رويال فيتيفر',
    slug: 'royal-vetiver',
    fragranceFamily: 'Fresh Earthy',
    gender: 'MEN',
    shortDescription: 'Haitian Vetiver, Italian Bergamot, and Pink Pepper for a refined masculine aura.',
    description: 'ROYAL VETIVER captures the essence of confident presence. Fresh bergamot and pepper open the composition, while rare Haitian vetiver forms the soul of this fragrance: earthy, smoky, and endlessly refined.',
    notes: {
      top: ['Italian Bergamot', 'Pink Pepper'],
      heart: ['Haitian Vetiver', 'Geranium'],
      base: ['Sandalwood', 'White Musk']
    },
    featured: true,
    active: true,
    variants: [
      { size: '30ml', price: 900, SKU: 'M20-VETIVER-30ML', stock: 999, targetWeightGrams: 28 },
      { size: '50ml', price: 1550, SKU: 'M20-VETIVER-50ML', stock: 999, targetWeightGrams: 45 },
      { size: '100ml', price: 2350, SKU: 'M20-VETIVER-100ML', stock: 999, targetWeightGrams: 90 }
    ],
    mainImage: { url: '/img/product.png', alt: 'Royal Vetiver Bottle' },
    hoverImage: { url: '/img/product.png', alt: 'Royal Vetiver Composition' },
    images: [
      { url: '/img/product.png', role: 'main', alt: 'Royal Vetiver Bottle' }
    ]
  },
  {
    name: 'VELVET IRIS',
    nameAr: 'فيلفيت إيريس',
    slug: 'velvet-iris',
    fragranceFamily: 'Powdery Floral',
    gender: 'WOMEN',
    shortDescription: 'Florentine Iris, White Musk, and Vanilla Accord creating an intimate sensual veil.',
    description: 'VELVET IRIS is an intimate powdery masterpiece. Precious Florentine iris butter blends harmoniously with soft Madagascar vanilla and clean white musk.',
    notes: {
      top: ['Violet Leaves', 'Bergamot'],
      heart: ['Florentine Iris', 'Heliotrope'],
      base: ['Madagascar Vanilla', 'White Musk']
    },
    featured: true,
    active: true,
    variants: [
      { size: '30ml', price: 950, SKU: 'M20-IRIS-30ML', stock: 999, targetWeightGrams: 28 },
      { size: '50ml', price: 1600, SKU: 'M20-IRIS-50ML', stock: 999, targetWeightGrams: 45 },
      { size: '100ml', price: 2450, SKU: 'M20-IRIS-100ML', stock: 999, targetWeightGrams: 90 }
    ],
    mainImage: { url: '/img/product.png', alt: 'Velvet Iris Bottle' },
    hoverImage: { url: '/img/product.png', alt: 'Velvet Iris Composition' },
    images: [
      { url: '/img/product.png', role: 'main', alt: 'Velvet Iris Bottle' }
    ]
  },
  {
    name: 'IMPERIAL OUD',
    nameAr: 'إمبريال عود',
    slug: 'imperial-oud',
    fragranceFamily: 'Rich Amber Oud',
    gender: 'MEN',
    shortDescription: 'Cambodian Oud, Saffron, and Fine Leather formulated for supreme projection.',
    description: 'IMPERIAL OUD represents the pinnacle of oriental luxury. Deep aged Cambodian oud is elevated by rich Persian saffron, smoldering birch tar, and supple leather.',
    notes: {
      top: ['Persian Saffron', 'Nutmeg'],
      heart: ['Cambodian Oud', 'Taif Rose'],
      base: ['Russian Leather', 'Amber', 'Patchouli']
    },
    featured: true,
    active: true,
    variants: [
      { size: '30ml', price: 1100, SKU: 'M20-OUD-30ML', stock: 999, targetWeightGrams: 28 },
      { size: '50ml', price: 1850, SKU: 'M20-OUD-50ML', stock: 999, targetWeightGrams: 45 },
      { size: '100ml', price: 2800, SKU: 'M20-OUD-100ML', stock: 999, targetWeightGrams: 90 }
    ],
    mainImage: { url: '/img/product.png', alt: 'Imperial Oud Bottle' },
    hoverImage: { url: '/img/product.png', alt: 'Imperial Oud Composition' },
    images: [
      { url: '/img/product.png', role: 'main', alt: 'Imperial Oud Bottle' }
    ]
  },
  {
    name: 'ROSE MAJESTÉ',
    nameAr: 'روز ماجيستيه',
    slug: 'rose-majeste',
    fragranceFamily: 'Velvet Rose',
    gender: 'WOMEN',
    shortDescription: 'Damascena Rose, Pink Pepper, and Cashmere Amber for an unforgettable trail.',
    description: 'ROSE MAJESTÉ captures the timeless grandeur of royal roses. Blooming Damascena petals are invigorated by crisp pink pepper and cushioned on warm cashmere amber.',
    notes: {
      top: ['Pink Pepper', 'Raspberry'],
      heart: ['Damascena Rose', 'Peony'],
      base: ['Cashmere Amber', 'Cedarwood']
    },
    featured: true,
    active: true,
    variants: [
      { size: '30ml', price: 950, SKU: 'M20-ROSE-30ML', stock: 999, targetWeightGrams: 28 },
      { size: '50ml', price: 1600, SKU: 'M20-ROSE-50ML', stock: 999, targetWeightGrams: 45 },
      { size: '100ml', price: 2450, SKU: 'M20-ROSE-100ML', stock: 999, targetWeightGrams: 90 }
    ],
    mainImage: { url: '/img/product.png', alt: 'Rose Majeste Bottle' },
    hoverImage: { url: '/img/product.png', alt: 'Rose Majeste Composition' },
    images: [
      { url: '/img/product.png', role: 'main', alt: 'Rose Majeste Bottle' }
    ]
  }
];

async function seed() {
  try {
    await connectDB();
    console.log('Connected to MongoDB. Seeding flagship M20 catalog...');

    for (const item of M20_CATALOG) {
      let existing = await Product.findOne({
        $or: [
          { slug: item.slug },
          { name: new RegExp(item.name, 'i') }
        ]
      });

      if (existing) {
        // Update product attributes and ensure featured & active are true
        existing.name = item.name;
        existing.slug = item.slug;
        existing.fragranceFamily = item.fragranceFamily;
        existing.gender = item.gender;
        existing.shortDescription = item.shortDescription;
        existing.description = item.description;
        existing.notes = item.notes;
        existing.featured = true;
        existing.active = true;
        if (!existing.finishedLiquidGrams || existing.finishedLiquidGrams < 500) {
          existing.finishedLiquidGrams = 1500;
        }
        if (!existing.finishedLiquidCostPerGram) {
          existing.finishedLiquidCostPerGram = 0.55;
        }
        // Ensure all variants (30ml, 50ml, 100ml) exist
        item.variants.forEach((seedVar) => {
          const matchVar = existing.variants.find((v) => v.size === seedVar.size);
          if (matchVar) {
            matchVar.price = seedVar.price;
            matchVar.SKU = seedVar.SKU;
            matchVar.stock = 999;
          } else {
            existing.variants.push(seedVar);
          }
        });
        await existing.save();
        console.log(`Updated: ${existing.name} (Slug: ${existing.slug})`);
      } else {
        const created = await Product.create({
          ...item,
          finishedLiquidGrams: 1500,
          finishedLiquidCostPerGram: 0.55
        });
        console.log(`Created: ${created.name} (Slug: ${created.slug})`);
      }
    }

    console.log('Finished seeding M20 fragrance catalog successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seed();
