/**
 * Egyptian Governorates Shipping Rates (Origin: Giza)
 * Strict Whole Integer Numbers (No Decimals)
 */
const EGYPT_GOVERNORATES = [
  // Tier 1 (Greater Cairo / Origin: Giza) - 65 EGP
  { id: 'cairo', nameEn: 'Cairo', nameAr: 'القاهرة', tier: 1, defaultRate: 65 },
  { id: 'giza', nameEn: 'Giza', nameAr: 'الجيزة', tier: 1, defaultRate: 65 },
  { id: 'qalyubia', nameEn: 'Qalyubia', nameAr: 'القليوبية', tier: 1, defaultRate: 65 },

  // Tier 2 (Alexandria & Nile Delta) - 75 EGP
  { id: 'alexandria', nameEn: 'Alexandria', nameAr: 'الإسكندرية', tier: 2, defaultRate: 75 },
  { id: 'beheira', nameEn: 'Beheira', nameAr: 'البحيرة', tier: 2, defaultRate: 75 },
  { id: 'gharbia', nameEn: 'Gharbia', nameAr: 'الغربية', tier: 2, defaultRate: 75 },
  { id: 'monufia', nameEn: 'Monufia', nameAr: 'المنوفية', tier: 2, defaultRate: 75 },
  { id: 'damietta', nameEn: 'Damietta', nameAr: 'دمياط', tier: 2, defaultRate: 75 },
  { id: 'dakahlia', nameEn: 'Dakahlia', nameAr: 'الدقهلية', tier: 2, defaultRate: 75 },
  { id: 'kafr_el_sheikh', nameEn: 'Kafr El Sheikh', nameAr: 'كفر الشيخ', tier: 2, defaultRate: 75 },
  { id: 'sharqia', nameEn: 'Sharqia', nameAr: 'الشرقية', tier: 2, defaultRate: 75 },

  // Tier 3 (Canal Zone) - 80 EGP
  { id: 'ismailia', nameEn: 'Ismailia', nameAr: 'الإسماعيلية', tier: 3, defaultRate: 80 },
  { id: 'suez', nameEn: 'Suez', nameAr: 'السويس', tier: 3, defaultRate: 80 },
  { id: 'port_said', nameEn: 'Port Said', nameAr: 'بورسعيد', tier: 3, defaultRate: 80 },

  // Tier 4 (Northern Upper Egypt) - 85 EGP
  { id: 'faiyum', nameEn: 'Faiyum', nameAr: 'الفيوم', tier: 4, defaultRate: 85 },
  { id: 'beni_suef', nameEn: 'Beni Suef', nameAr: 'بني سويف', tier: 4, defaultRate: 85 },
  { id: 'minya', nameEn: 'Minya', nameAr: 'المنيا', tier: 4, defaultRate: 85 },
  { id: 'assiut', nameEn: 'Assiut', nameAr: 'أسيوط', tier: 4, defaultRate: 85 },

  // Tier 5 (Southern Upper Egypt & Red Sea) - 115 EGP
  { id: 'sohag', nameEn: 'Sohag', nameAr: 'سوهاج', tier: 5, defaultRate: 115 },
  { id: 'qena', nameEn: 'Qena', nameAr: 'قنا', tier: 5, defaultRate: 115 },
  { id: 'aswan', nameEn: 'Aswan', nameAr: 'أسوان', tier: 5, defaultRate: 115 },
  { id: 'luxor', nameEn: 'Luxor', nameAr: 'الأقصر', tier: 5, defaultRate: 115 },
  { id: 'red_sea', nameEn: 'Red Sea', nameAr: 'البحر الأحمر', tier: 5, defaultRate: 115 },

  // Tier 6 (Frontier & Remote Governorates) - 125 EGP
  { id: 'matrouh', nameEn: 'Matrouh', nameAr: 'مطروح', tier: 6, defaultRate: 125 },
  { id: 'new_valley', nameEn: 'New Valley', nameAr: 'الوادي الجديد', tier: 6, defaultRate: 125 },
  { id: 'north_sinai', nameEn: 'North Sinai', nameAr: 'شمال سيناء', tier: 6, defaultRate: 125 },
  { id: 'south_sinai', nameEn: 'South Sinai', nameAr: 'جنوب سيناء', tier: 6, defaultRate: 125 }
];

const DEFAULT_GOVERNORATE_RATES = {};
EGYPT_GOVERNORATES.forEach((gov) => {
  DEFAULT_GOVERNORATE_RATES[gov.nameEn] = gov.defaultRate;
  DEFAULT_GOVERNORATE_RATES[gov.nameAr] = gov.defaultRate;
  DEFAULT_GOVERNORATE_RATES[gov.id] = gov.defaultRate;
});
// Additional aliases
DEFAULT_GOVERNORATE_RATES['بور سعيد'] = 80;
DEFAULT_GOVERNORATE_RATES['Portsaid'] = 80;

/**
 * Resolve the integer shipping fee for a governorate name or ID
 */
function getGovernorateRate(govNameOrId, customRates = {}) {
  if (!govNameOrId) return 75; // Safe default Tier 2
  const raw = String(govNameOrId).trim();
  const lower = raw.toLowerCase();

  // 1. Direct match in custom rates if provided
  if (customRates) {
    if (customRates instanceof Map) {
      if (customRates.has(raw)) return Math.round(Number(customRates.get(raw)));
      for (const [k, v] of customRates.entries()) {
        if (k.toLowerCase() === lower) return Math.round(Number(v));
      }
    } else if (typeof customRates === 'object') {
      if (customRates[raw] !== undefined) return Math.round(Number(customRates[raw]));
      for (const [k, v] of Object.entries(customRates)) {
        if (k.toLowerCase() === lower) return Math.round(Number(v));
      }
    }
  }

  // 2. Match against standardized 27 governorates
  const match = EGYPT_GOVERNORATES.find(
    (g) =>
      g.id.toLowerCase() === lower ||
      g.nameEn.toLowerCase() === lower ||
      g.nameAr.toLowerCase() === lower ||
      raw.includes(g.nameEn) ||
      raw.includes(g.nameAr)
  );

  if (match) {
    // Check if customRates has match.nameEn or match.nameAr
    if (customRates) {
      const enVal = customRates instanceof Map ? customRates.get(match.nameEn) : customRates[match.nameEn];
      if (enVal !== undefined) return Math.round(Number(enVal));
      const arVal = customRates instanceof Map ? customRates.get(match.nameAr) : customRates[match.nameAr];
      if (arVal !== undefined) return Math.round(Number(arVal));
    }
    return match.defaultRate;
  }

  // 3. Fallback to default dictionary or 75
  return DEFAULT_GOVERNORATE_RATES[raw] || 75;
}

const TIER_RATES = {
  1: 65,
  2: 75,
  3: 80,
  4: 85,
  5: 115,
  6: 125
};

module.exports = {
  EGYPT_GOVERNORATES,
  DEFAULT_GOVERNORATE_RATES,
  TIER_RATES,
  getGovernorateRate
};
