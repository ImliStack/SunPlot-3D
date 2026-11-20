// Incentives and tax rules as data: value, scope, source and the date it was last checked.
// Nothing here is applied silently: the UI shows the source and date next to every use, and the
// user can override the amount. Re-check before each release; schemes change.

export const INCENTIVES = {
  pmSuryaGharHome: {
    country: 'IN',
    name: 'PM Surya Ghar: Muft Bijli Yojana (residential rooftop)',
    rule: '₹30,000/kW for the first 2 kW + ₹18,000 for the 3rd kW (max ₹78,000); special-category states ₹33,000 / ₹19,800',
    source: 'MNRE operational guidelines (7 Jun 2024), pmsuryaghar.gov.in',
    url: 'https://pmsuryaghar.gov.in',
    asOf: '2024-06-07',
    checked: '2026-10-22',
    caveat: 'DCR (ALMM List-II cells) modules and a registered vendor required; confirm the current phase on the national portal',
    amount: (kw, special = false) => {
      const [a, b] = special ? [33000, 19800] : [30000, 18000]
      return Math.min(kw, 2) * a + Math.min(Math.max(kw - 2, 0), 1) * b
    },
  },
  pmSuryaGharSociety: {
    country: 'IN',
    name: 'PM Surya Ghar: group housing societies / RWAs (common facilities)',
    rule: '₹18,000/kW (₹19,800 in special-category states) on the lower of the plant size, 3 kW × houses and 500 kW',
    source: 'MNRE operational guidelines (7 Jun 2024), worked example: 100 kW, 20 houses → 60 kW × ₹18,000',
    url: 'https://pmsuryaghar.gov.in',
    asOf: '2024-06-07',
    checked: '2026-10-25',
    caveat: 'The society connection must serve common facilities only',
    amount: (kw, houses, special = false) => (special ? 19800 : 18000) * Math.max(0, Math.min(kw, 3 * houses, 500)),
  },
  acceleratedDepreciation: {
    country: 'IN',
    name: 'Accelerated depreciation on solar plant (Income Tax Act, Appendix I)',
    rule: '40 % of written-down value a year; half rate in the first year if used under 180 days',
    source: 'Income Tax Rules, Appendix I (renewable energy devices); vendor and CA summaries 2026',
    asOf: '2026-10-25',
    checked: '2026-10-25',
    caveat: 'Business use only; confirm with a chartered accountant',
    rate: 0.4,
  },
}

/** States with the higher central assistance (special-category / hill states and UTs). */
export const SPECIAL_STATES = ['Arunachal Pradesh', 'Assam', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura',
  'Uttarakhand', 'Himachal Pradesh', 'Jammu and Kashmir', 'Ladakh', 'Andaman and Nicobar Islands', 'Lakshadweep']
