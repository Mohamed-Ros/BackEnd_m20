/**
 * M20 PARFUMS — Manufacturing & Fragrance Recipe Specifications
 * Gram-based batch production, material density constants, and bottle net weights.
 */

const MANUFACTURING_DEFAULTS = {
  // Material Density Constants
  densities: {
    fragranceOil: 0.93, // 0.93 g/ml (10 ml = 9.3 g)
    alcohol96: 0.70     // 0.70 g/ml (50 ml = 35.0 g | 1 Liter = 700 g)
  },

  // Bottle Net Liquid Weights & Filling Transfer Loss (Never assume 1 ml = 1 g)
  bottleSpecs: {
    '30ml': {
      size: '30ml',
      nominalMl: 30,
      netLiquidWeightGrams: 25.0, // Net liquid in bottle
      transferLossGrams: 1.0,     // Filling / transfer loss
      totalPrepWeightGrams: 26.0  // Total production prep per bottle
    },
    '50ml': {
      size: '50ml',
      nominalMl: 50,
      netLiquidWeightGrams: 43.0,
      transferLossGrams: 1.0,
      totalPrepWeightGrams: 44.0
    },
    '100ml': {
      size: '100ml',
      nominalMl: 100,
      netLiquidWeightGrams: 78.0,
      transferLossGrams: 1.0,
      totalPrepWeightGrams: 79.0
    }
  },

  // Official M20 Core Fragrance Initial Weight Ratios (Oil % / Alcohol 96% %)
  coreFragrances: {
    CRUSH: {
      name: 'CRUSH',
      gender: 'MEN',
      oilRatio: 0.22,      // 22% Fragrance Oil
      alcoholRatio: 0.78,  // 78% Alcohol 96%
      oilPercentage: 22,
      alcoholPercentage: 78,
      description: 'Warm amber, spiced citrus, and woody evening depth.'
    },
    CROWN: {
      name: 'CROWN',
      gender: 'MEN',
      oilRatio: 0.25,      // 25% Fragrance Oil
      alcoholRatio: 0.75,  // 75% Alcohol 96%
      oilPercentage: 25,
      alcoholPercentage: 75,
      description: 'Golden bergamot, honeyed woods, and crisp white musk.'
    },
    NIGHT: {
      name: 'NIGHT',
      gender: 'MEN',
      oilRatio: 0.22,      // 22% Fragrance Oil
      alcoholRatio: 0.78,  // 78% Alcohol 96%
      oilPercentage: 22,
      alcoholPercentage: 78,
      description: 'Deep indigo clarity, smoky woods, and assertively structured oud.'
    },
    BLOOM: {
      name: 'BLOOM',
      gender: 'WOMEN',
      oilRatio: 0.20,      // 20% Fragrance Oil
      alcoholRatio: 0.80,  // 80% Alcohol 96%
      oilPercentage: 20,
      alcoholPercentage: 80,
      description: 'Velvet Damask rose, white jasmine, and soft powdery iris.'
    },
    CHERRY: {
      name: 'CHERRY',
      gender: 'UNISEX',
      oilRatio: 0.25,      // 25% Fragrance Oil
      alcoholRatio: 0.75,  // 75% Alcohol 96%
      oilPercentage: 25,
      alcoholPercentage: 75,
      description: 'Dark cherry liqueur, roasted tonka bean, and almond smoke.'
    },
    CLOUD: {
      name: 'CLOUD',
      gender: 'UNISEX',
      oilRatio: 0.25,      // 25% Fragrance Oil
      alcoholRatio: 0.75,  // 75% Alcohol 96%
      oilPercentage: 25,
      alcoholPercentage: 75,
      description: 'Airy spun sugar, whipped coconut cream, and soft solar musk.'
    }
  }
};

/**
 * Get bottle specification for a size string (e.g. '30ml', '50ml', '100ml')
 */
function getBottleSpec(size, customSpecs = {}) {
  const normalized = String(size || '').toLowerCase().trim();
  const specKey = normalized.includes('30') ? '30ml' : normalized.includes('100') ? '100ml' : '50ml';
  const custom = customSpecs?.[specKey] || customSpecs?.get?.(specKey);
  const def = MANUFACTURING_DEFAULTS.bottleSpecs[specKey];

  const netLiquidWeightGrams = Number(custom?.netLiquidWeightGrams ?? def.netLiquidWeightGrams);
  const transferLossGrams = Number(custom?.transferLossGrams ?? def.transferLossGrams);
  const totalPrepWeightGrams = Number(custom?.totalPrepWeightGrams ?? (netLiquidWeightGrams + transferLossGrams));

  return {
    size: specKey,
    nominalMl: def.nominalMl,
    netLiquidWeightGrams,
    transferLossGrams,
    totalPrepWeightGrams
  };
}

/**
 * Calculate net bottle breakdown (oil grams and alcohol grams) for a fragrance ratio
 * @param {number} oilRatio (e.g. 0.22, 0.25, 0.20)
 * @param {object} customSpecs
 */
function getNetBottleBreakdowns(oilRatio = 0.25, customSpecs = {}) {
  const result = {};
  ['30ml', '50ml', '100ml'].forEach(size => {
    const spec = getBottleSpec(size, customSpecs);
    const netWeight = spec.netLiquidWeightGrams;
    const oilGrams = Number((netWeight * oilRatio).toFixed(2));
    const alcoholGrams = Number((netWeight * (1 - oilRatio)).toFixed(2));
    result[size] = {
      size,
      netLiquidWeightGrams: netWeight,
      transferLossGrams: spec.transferLossGrams,
      totalPrepWeightGrams: spec.totalPrepWeightGrams,
      oilGrams,
      alcoholGrams
    };
  });
  return result;
}

/**
 * Calculate total prep weight and net usable liquid weight for bottle-count production
 * @param {object} bottleCounts { '30ml': count, '50ml': count, '100ml': count }
 * @param {object} customSpecs
 */
function calculateBottleOrderPrep(bottleCounts = {}, customSpecs = {}) {
  let totalPrepWeightGrams = 0;
  let totalNetLiquidGrams = 0;
  let totalTransferLossGrams = 0;
  const breakdown = [];

  ['30ml', '50ml', '100ml'].forEach(size => {
    const count = Math.max(0, parseInt(bottleCounts[size] || 0, 10));
    if (count > 0) {
      const spec = getBottleSpec(size, customSpecs);
      const prepGrams = count * spec.totalPrepWeightGrams;
      const netGrams = count * spec.netLiquidWeightGrams;
      const lossGrams = count * spec.transferLossGrams;

      totalPrepWeightGrams += prepGrams;
      totalNetLiquidGrams += netGrams;
      totalTransferLossGrams += lossGrams;

      breakdown.push({
        size,
        count,
        netLiquidWeightPerBottle: spec.netLiquidWeightGrams,
        transferLossPerBottle: spec.transferLossGrams,
        totalPrepPerBottle: spec.totalPrepWeightGrams,
        totalPrepGrams: prepGrams,
        totalNetGrams: netGrams,
        totalLossGrams: lossGrams
      });
    }
  });

  return {
    totalPrepWeightGrams: Number(totalPrepWeightGrams.toFixed(2)),
    totalNetLiquidGrams: Number(totalNetLiquidGrams.toFixed(2)),
    totalTransferLossGrams: Number(totalTransferLossGrams.toFixed(2)),
    breakdown
  };
}

/**
 * Calculate cumulative scale weighing readings
 * @param {number} totalPrepWeightGrams
 * @param {number} oilRatio (e.g. 0.22, 0.25)
 * @param {number} alcoholDensity (default 0.70 g/ml)
 */
function calculateCumulativeScale({ totalPrepWeightGrams, oilRatio = 0.25, alcoholDensity = 0.70 }) {
  const totalPrep = Number(totalPrepWeightGrams) || 0;
  const oilRatioNum = Number(oilRatio) || 0.25;
  const alcDensity = Number(alcoholDensity) || 0.70;

  const requiredOilGrams = Number((totalPrep * oilRatioNum).toFixed(2));
  const requiredAlcoholGrams = Number((totalPrep - requiredOilGrams).toFixed(2));

  // Step 1: Scale target reading after adding oil
  const scaleStep1ReadingGrams = requiredOilGrams;
  // Step 2: Scale target reading after adding alcohol (cumulative total)
  const scaleStep2ReadingGrams = totalPrep;

  // Alcohol volume conversion (1 Liter = 700 g at 0.70 g/ml density)
  const alcoholMl = Number((requiredAlcoholGrams / alcDensity).toFixed(1));
  const alcoholLiters = Number((requiredAlcoholGrams / (alcDensity * 1000)).toFixed(3));

  return {
    totalPrepWeightGrams: totalPrep,
    oilRatio: oilRatioNum,
    alcoholRatio: Number((1 - oilRatioNum).toFixed(2)),
    requiredOilGrams,
    requiredAlcoholGrams,
    scaleStep1ReadingGrams, // Target reading Step 1
    scaleStep2ReadingGrams, // Target reading Step 2
    alcoholMl,
    alcoholLiters,
    alcoholDensity: alcDensity
  };
}

module.exports = {
  MANUFACTURING_DEFAULTS,
  getBottleSpec,
  getNetBottleBreakdowns,
  calculateBottleOrderPrep,
  calculateCumulativeScale
};
