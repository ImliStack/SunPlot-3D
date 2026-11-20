// Calculation registry: every metric SunPlot shows, with its formula, units, inputs, assumptions,
// source and the test that checks it. The UI's ⓘ tooltips read from here, and
// docs/CALCULATION_METHODOLOGY.md is the long form. Keep both in step.

/** @typedef {{ id:string, label:string, unit:string, formula:string, inputs:string, assumptions?:string, source?:string, test?:string, period?:string }} Metric */

/** @type {Record<string, Metric>} */
export const METRICS = {
  dcCapacity: {
    id: 'dcCapacity', label: 'Installed DC capacity', unit: 'kWp',
    formula: 'Σ module STC rating ÷ 1000',
    inputs: 'Number of modules placed, module rated W (datasheet, STC 1000 W/m², 25 °C, AM1.5)',
    test: 'tests/geometry.test.js',
  },
  acCapacity: {
    id: 'acCapacity', label: 'Installed AC capacity', unit: 'kW',
    formula: 'inverters × rated AC power',
    inputs: 'Inverter class and count (auto: fewest units at DC:AC 0.8–1.3, nearest 1.15)',
    assumptions: 'Generic inverter classes; match the brand datasheet',
  },
  dcAcRatio: {
    id: 'dcAcRatio', label: 'DC : AC ratio', unit: '–',
    formula: 'DC capacity ÷ AC capacity', inputs: 'DC and AC capacity',
  },
  modules: { id: 'modules', label: 'Number of modules', unit: '–', formula: 'count of placed modules', inputs: 'Layout engine or click-to-install selection', test: 'tests/geometry.test.js' },
  roofArea: {
    id: 'roofArea', label: 'Roof / site area', unit: 'm²',
    formula: 'Shoelace area of the outline in a local metric frame (or L × W for parametric sites); sloped planes ÷ cos(pitch)',
    inputs: 'Outline (survey) or dimensions', test: 'tests/geometry.test.js',
  },
  moduleArea: { id: 'moduleArea', label: 'Module area', unit: 'm²', formula: 'modules × module length × width', inputs: 'Module dimensions (datasheet)' },
  coverage: { id: 'coverage', label: 'Coverage', unit: '%', formula: 'module area ÷ surface area', inputs: 'Module area, roof or ground area' },
  annualEnergy: {
    id: 'annualEnergy', label: 'Annual AC energy (P50)', unit: 'kWh',
    formula: 'Σ over every hour of the weather year of AC power × 1 h',
    inputs: 'Hourly GHI/DNI/DHI, air temperature, wind; array tilt, azimuth, DC capacity; inverter AC rating; losses',
    assumptions: 'Weather year = PVGIS typical meteorological year (or NASA POWER historical year while it loads). Monthly and daily totals are sums of the same hours.',
    source: 'Chain validated against pvlib 0.11 (annual within 0.1 %)', test: 'tests/simulate.test.js', period: 'one weather year',
  },
  p90: {
    id: 'p90', label: 'P90 (1-year)', unit: 'kWh',
    formula: 'P50 × (1 − 1.2816 × σ_GHI / mean_GHI)',
    inputs: 'Year-to-year spread of ten NASA POWER annual irradiation totals',
    assumptions: 'Weather variability only; model and data uncertainty (typically ±3–5 %) are not included',
  },
  specificYield: {
    id: 'specificYield', label: 'Specific yield', unit: 'kWh/kWp',
    formula: 'annual AC energy ÷ DC capacity (kWp)', inputs: 'Annual AC energy, DC capacity', period: 'one weather year', test: 'tests/simulate.test.js',
  },
  performanceRatio: {
    id: 'performanceRatio', label: 'Performance ratio', unit: '%',
    formula: 'final yield ÷ reference yield = (E_AC ÷ P_DC,STC) ÷ (H_POA ÷ 1 kW/m²)',
    inputs: 'Annual AC energy, DC capacity, plane-of-array irradiation before shading (IEC 61724-1)',
    assumptions: 'H_POA is the unshaded plane-of-array irradiation, so shading counts as a loss',
  },
  capacityFactor: {
    id: 'capacityFactor', label: 'Capacity factor (DC basis)', unit: '%',
    formula: 'annual AC energy ÷ (DC capacity × hours in the weather year)',
    inputs: 'Annual AC energy, DC capacity, 8,760 h (8,784 in leap years)',
    assumptions: 'Indian practice quotes CUF on the AC or DC rating; SunPlot states DC',
  },
  peakSunHours: { id: 'peakSunHours', label: 'Peak sun hours', unit: 'h/day', formula: 'annual horizontal irradiation (kWh/m²) ÷ 365', inputs: 'Ten-year mean GHI (NASA POWER)' },
  poaIrradiation: { id: 'poaIrradiation', label: 'Plane-of-array irradiation', unit: 'kWh/m²', formula: 'Σ hourly POA irradiance (W/m²) × 1 h ÷ 1000', inputs: 'Perez transposition of hourly DNI/DHI/GHI', test: 'tests/simulate.test.js' },
  shadingLoss: {
    id: 'shadingLoss', label: 'Shading loss', unit: '%',
    formula: '(POA reference − POA after shading) ÷ POA reference, energy-weighted over the year',
    inputs: 'Per-module ray casting against modules, roof, obstacles, trees, neighbours; monthly beam fraction per array',
    assumptions: 'Geometric/irradiance loss on beam light; electrical mismatch from partial shading is not separately modelled',
  },
  temperatureLoss: {
    id: 'temperatureLoss', label: 'Temperature loss', unit: '%',
    formula: 'Σ (DC at 25 °C − DC at cell temperature) ÷ POA reference', inputs: 'SAPM cell temperature (mount type, irradiance, air temperature, wind), module γ',
    source: 'King et al. 2004 (SAND2004-3535); pvlib.temperature.sapm_cell', test: 'tests/simulate.test.js',
  },
  iamLoss: { id: 'iamLoss', label: 'Reflection (incidence angle) loss', unit: '%', formula: 'beam POA × (1 − IAM(θ)), physical Fresnel model n = 1.526, K = 4 m⁻¹, L = 2 mm', inputs: 'Hourly angle of incidence', source: 'De Soto 2006; pvlib.iam.physical' },
  inverterLoss: { id: 'inverterLoss', label: 'Inverter loss', unit: '%', formula: 'PVWatts part-load efficiency curve, η_nom 96 %', inputs: 'Hourly DC power, inverter DC rating', source: 'Dobos 2014 (PVWatts v5); pvlib.inverter.pvwatts' },
  clippingLoss: { id: 'clippingLoss', label: 'Clipping loss', unit: '%', formula: 'Σ max(0, AC before limit − AC rating)', inputs: 'Hourly AC power, inverter AC rating' },
  systemLoss: { id: 'systemLoss', label: 'System losses', unit: '%', formula: '1 − Π(1 − loss_i): mismatch 2, wiring 2, connections 0.5, LID 1.5, nameplate 1, availability 3 %', inputs: 'Editable loss table', source: 'PVWatts V8 defaults (shading, soiling, snow modelled separately)' },
  totalLoss: { id: 'totalLoss', label: 'Total losses', unit: '%', formula: '1 − AC energy ÷ (POA reference × DC capacity)', inputs: 'Loss waterfall' },
  selfConsumption: {
    id: 'selfConsumption', label: 'Self-consumption', unit: '%',
    formula: 'Σ_h min(PV_h, load_h) ÷ Σ_h PV_h', inputs: 'Hourly AC generation (local time), hourly load from bills × load pattern',
    assumptions: 'Load patterns are typical shapes, not metered data',
  },
  selfSufficiency: { id: 'selfSufficiency', label: 'Energy independence (self-sufficiency)', unit: '%', formula: 'Σ_h min(PV_h, load_h) ÷ Σ_h load_h', inputs: 'As above' },
  gridExport: { id: 'gridExport', label: 'Grid export', unit: 'kWh', formula: 'Σ_h max(0, PV_h − load_h)', inputs: 'As above' },
  gridImport: { id: 'gridImport', label: 'Grid import', unit: 'kWh', formula: 'Σ_h max(0, load_h − PV_h)', inputs: 'As above' },
  co2: { id: 'co2', label: 'CO₂ avoided', unit: 't/yr', formula: 'annual AC energy × grid emission factor', inputs: 'Grid factor (editable; India CEA CO₂ baseline ≈ 0.71 kg/kWh)', assumptions: 'Average, not marginal, emission factor' },
  savings: {
    id: 'savings', label: 'Annual savings', unit: 'currency/yr',
    formula: 'self-used kWh × tariff × (1 − ToD rebate × solar-hour share) + exported kWh × export rate',
    inputs: 'Tariff, escalation, metering (net / net billing / gross), export rate, ToD rebate', test: 'tests/finance.test.js',
  },
  installCost: { id: 'installCost', label: 'Installation cost', unit: 'currency', formula: 'DC W × cost per W (+ battery)', inputs: 'Cost per Wp (editable assumption, dated)' },
  payback: { id: 'payback', label: 'Simple payback', unit: 'years', formula: 'first year in which cumulative cash flow ≥ 0, interpolated within the year', inputs: 'Year-by-year cash flow', test: 'tests/finance.test.js' },
  discountedPayback: { id: 'discountedPayback', label: 'Discounted payback', unit: 'years', formula: 'as payback, on cash flows ÷ (1 + r)^t', inputs: 'Cash flow, discount rate', test: 'tests/finance.test.js' },
  roi: { id: 'roi', label: 'ROI', unit: '%', formula: '(Σ net cash inflows − net investment) ÷ net investment, undiscounted over the lifetime', inputs: 'Cash flow', test: 'tests/finance.test.js' },
  npv: { id: 'npv', label: 'NPV', unit: 'currency', formula: 'Σ_t CF_t ÷ (1 + r)^t − net investment', inputs: 'Cash flow, discount rate', test: 'tests/finance.test.js' },
  irr: { id: 'irr', label: 'IRR', unit: '%', formula: 'r such that NPV(r) = 0 (bisection on −99 %…100 %; none if the cash flow never changes sign)', inputs: 'Cash flow', test: 'tests/finance.test.js' },
  lcoe: { id: 'lcoe', label: 'LCOE', unit: 'currency/kWh', formula: '(net investment + Σ PV(O&M, inverter)) ÷ Σ PV(energy)', inputs: 'Costs, energy by year, discount rate', test: 'tests/finance.test.js' },
  lifetimeEnergy: { id: 'lifetimeEnergy', label: 'Lifetime generation', unit: 'kWh', formula: 'Σ_t E_1 × (1 − LID) × (1 − d)^(t−2)', inputs: 'Year-1 energy, 1 % first-year loss, 0.4 %/yr degradation (editable)', test: 'tests/finance.test.js' },
  lifetimeSavings: { id: 'lifetimeSavings', label: 'Lifetime savings', unit: 'currency', formula: 'Σ_t savings_t', inputs: 'Cash flow' },
  emi: { id: 'emi', label: 'Loan EMI', unit: 'currency/month', formula: 'P·r ÷ (1 − (1 + r)^−n), r = annual rate ÷ 12, n = months', inputs: 'Loan amount, rate, tenure', test: 'tests/finance.test.js' },
  stringVoc: { id: 'stringVoc', label: 'String Voc at record cold', unit: 'V', formula: 'N × Voc,STC × (1 + β_Voc × (T_min − 25))', inputs: 'Module Voc and β (datasheet), ten-year record low air temperature (NASA POWER)', assumptions: 'Cell taken at air temperature at dawn (no irradiance heating): conservative', source: 'IEC 62548', test: 'tests/electrical.test.js' },
  rescoTariff: { id: 'rescoTariff', label: 'RESCO / PPA tariff', unit: 'currency/kWh', formula: 'flat tariff τ with NPV_RoE(equity cash flows(τ)) = 0', inputs: 'Plant cost, debt share, rate, tenure, O&M, RoE target, energy by year', source: 'KERC 2026–29 tariff norms (14 % RoE, 70:30, 10.8 %, 13 yr) as defaults', test: 'tests/finance.test.js' },
}

/** One-line tooltip text for a metric. */
export function explain(id) {
  const m = METRICS[id]
  if (!m) return ''
  return [`${m.label} (${m.unit})`, `= ${m.formula}`, `Inputs: ${m.inputs}`, m.assumptions && `Assumes: ${m.assumptions}`, m.source && `Source: ${m.source}`].filter(Boolean).join('\n')
}
