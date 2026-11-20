// 25-year money view of a design: tariff escalation, module degradation, O&M, an inverter swap,
// optional loan, own use vs export, then payback, IRR, NPV and LCOE. Plus what it does for the air.

export const YEARS = 25 // default lifetime; p.lifetime overrides
// Defaults, each overridable from params (p.degradation, p.omRise, p.inverterYear, p.inverterShare).
// First-year light-induced degradation is already in the simulation's system losses (LID 1.5 %),
// so the finance model only ages the plant from year 2 on.
const DEGRADE = 0.004 // per year (TOPCon / PERC linear warranties ≈ 0.4–0.55 %)
const INVERTER_SWAP = { year: 12, share: 0.1 } // ≈ 10 % of the system cost, once
const OM_RISE = 0.05 // O&M cost rises 5 %/yr
const TREE_KG = 21.8 // CO₂ a mature tree absorbs per year (US Forest Service figure)
const COAL_KG = 0.6 // kg of coal burnt per kWh of Indian thermal power (CEA, approx.)

/** Monthly instalment for `principal` at `ratePct` a year over `years`. */
export function emi(principal, ratePct, years) {
  const r = ratePct / 1200
  const n = years * 12
  if (!(principal > 0) || !n) return 0
  return r ? (principal * r) / (1 - (1 + r) ** -n) : principal / n
}

/** Internal rate of return of yearly flows (flow[0] at time 0), by bisection. */
export function irr(flows) {
  const npv = (r) => flows.reduce((s, f, t) => s + f / (1 + r) ** t, 0)
  let lo = -0.99
  let hi = 1
  if (npv(lo) * npv(hi) > 0) return null
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (npv(lo) * npv(mid) <= 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

const AD_RATE = 0.4 // Income-tax depreciation on solar plant: 40 % of the written-down value a year

/** Energy in year t (1-based): year-1 P50 (already net of LID), then compound ageing. */
export const kwhIn = (annual, t, degradation = DEGRADE) => annual * (1 - degradation) ** (t - 1)
const settings = (p) => ({
  years: Math.max(1, Math.round(p.lifetime || YEARS)),
  degradation: p.degradation != null ? p.degradation / 100 : DEGRADE,
  omRise: p.omRise != null ? p.omRise / 100 : OM_RISE,
  invYear: p.inverterYear ?? INVERTER_SWAP.year,
  invShare: p.inverterShare != null ? p.inverterShare / 100 : INVERTER_SWAP.share,
})

/**
 * What a kWh of solar is worth to the owner in year t. Net metering banks units over the
 * settlement year (own use up to the annual consumption, surplus at the export rate); net billing
 * values only what is used as it is made; gross metering sells everything at the export rate.
 * Under time-of-day tariffs the solar-hours slot is cheaper, so self-used solar saves less.
 */
function value(kwh, t, p, mix) {
  const tariff = p.tariff * (1 + p.escalation / 100) ** (t - 1)
  const exportRate = (p.exportRate || p.tariff * 0.4)
  const tod = 1 - ((p.todDisc || 0) / 100) * (mix?.solarHours ?? 0.85)
  const useYear = mix?.useYear || 0
  let used
  if (p.zeroExport) {
    // Export limiter: only what the site uses as it is made counts; the rest is curtailed.
    used = kwh * (useYear ? mix.selfShare : 1)
    return { tariff, used, savings: used * tariff * tod }
  }
  if (p.metering === 'gross') used = 0
  else if (p.metering === 'billing') used = kwh * (useYear ? mix.selfShare : 1)
  else used = useYear ? Math.min(kwh, useYear) : kwh
  return { tariff, used, savings: used * tariff * tod + (kwh - used) * exportRate }
}

/**
 * `annual` kWh in year 1 (P50), `kwp`, params `p`, optional `battery` from electrical.js, and
 * `mix` = { useYear, selfShare, solarHours } from the hourly load overlap.
 * Owner view: a home, or a business (after tax, with accelerated depreciation).
 */
export function finance({ annual, kwp, p, battery = null, mix = null }) {
  const gross = kwp * 1000 * p.cost + (battery?.cost ?? 0)
  const subsidy = Math.min(p.subsidy || 0, gross)
  const net = gross - subsidy
  const loan = (net * (p.loanShare || 0)) / 100
  const down = net - loan
  const pay = emi(loan, p.loanRate, p.loanYears)
  const om0 = (gross * p.omPct) / 100
  const S = settings(p)
  const business = p.buyer === 'business'
  const tax = business ? (p.taxRate || 0) / 100 : 0

  const rows = []
  let cumulative = -down
  let payback = null
  let wdv = net // depreciable value (subsidy reduces cost)
  let balance = loan
  const r = (p.loanRate || 0) / 1200
  const flows = [-net] // project view, no loan
  for (let t = 1; t <= S.years; t++) {
    const kwh = kwhIn(annual, t, S.degradation)
    const { tariff, savings, used } = value(kwh, t, p, mix)
    const om = om0 * (1 + S.omRise) ** (t - 1) + (t === S.invYear ? gross * S.invShare : 0)
    // Loan: twelve instalments, split into interest and principal.
    let loanPaid = 0
    let interest = 0
    if (t <= p.loanYears && balance > 0) {
      for (let k = 0; k < 12; k++) {
        const i = balance * r
        interest += i
        balance -= pay - i
        loanPaid += pay
      }
    }
    const dep = business ? wdv * AD_RATE : 0
    wdv -= dep
    // A business pays tax on the extra profit (savings − O&M − interest) and saves tax on depreciation.
    const taxPaid = business ? (savings - om - interest - dep) * tax : 0
    const netFlow = savings - om - loanPaid - taxPaid
    const before = cumulative
    cumulative += netFlow
    if (payback == null && before < 0 && cumulative >= 0) payback = t - 1 + -before / netFlow
    flows.push(savings - om - (business ? (savings - om - dep) * tax : 0))
    rows.push({ year: t, kwh, used, tariff, savings, om, loan: loanPaid, dep, tax: taxPaid, net: netFlow, cumulative })
  }
  const d = p.discount / 100
  const pv = (v, t) => v / (1 + d) ** t
  const npv = flows.reduce((s, f, t) => s + pv(f, t), 0)
  // Discounted payback on the owner's cash (after loan payments).
  let dCum = -down
  let discountedPayback = null
  rows.forEach((r) => {
    const before = dCum
    const step = pv(r.net, r.year)
    dCum += step
    if (discountedPayback == null && before < 0 && dCum >= 0) discountedPayback = r.year - 1 + -before / step
  })
  const energyPv = rows.reduce((s, x) => s + pv(x.kwh, x.year), 0)
  const costPv = net + rows.reduce((s, x) => s + pv(x.om, x.year), 0)
  const life = rows.reduce((s, x) => s + x.kwh, 0)
  const co2 = (annual * p.co2) / 1000 // t in year 1
  return {
    gross, subsidy, net, loan, down, emi: pay, rows, payback: net > 0 ? payback ?? (cumulative < 0 ? null : 0) : null,
    discountedPayback: net > 0 ? discountedPayback : null, years: S.years,
    roi: net > 0 ? (rows.reduce((s, r) => s + r.savings - r.om - r.tax, 0) - net) / net : null,
    billBefore: mix?.useYear ? mix.useYear * p.tariff : null,
    billAfter: mix?.useYear ? mix.useYear * p.tariff - (rows[0]?.savings ?? 0) : null,
    irr: irr(flows), npv, lcoe: energyPv ? costPv / energyPv : 0, business, tax,
    adYear1: rows[0]?.dep ?? 0,
    savings25: rows.reduce((s, x) => s + x.savings, 0), gain25: cumulative,
    selfUse: rows[0] && rows[0].kwh ? rows[0].used / rows[0].kwh : 1,
    life,
    env: {
      co2Year: co2,
      co2Life: (life * p.co2) / 1000,
      trees: (co2 * 1000) / TREE_KG,
      coal: (annual * COAL_KG) / 1000, // t a year
    },
  }
}

/**
 * RESCO / PPA: a developer pays for the plant and sells its power to the site for `ppaYears`.
 * Finds the flat tariff at which the developer's equity earns `roe` (pre-tax), with `debtShare`
 * of the cost borrowed at `debtRate` over `debtYears` (KERC 2026–29 norms: 70:30, 10.8 %, 13 yr, 14 % RoE).
 */
export function resco({ annual, kwp, p, mix = null }) {
  const capex = kwp * 1000 * p.cost
  const debt = (capex * p.debtShare) / 100
  const equity = capex - debt
  const pay = emi(debt, p.debtRate, p.debtYears) * 12
  const om0 = (capex * p.omPct) / 100
  const S = settings(p)
  const years = p.ppaYears
  const flowsAt = (tariff) => {
    const f = [-equity]
    for (let t = 1; t <= years; t++) {
      const om = om0 * (1 + S.omRise) ** (t - 1) + (t === S.invYear ? capex * S.invShare : 0)
      f.push(kwhIn(annual, t, S.degradation) * tariff - om - (t <= p.debtYears ? pay : 0))
    }
    return f
  }
  const target = p.roe / 100
  const npvAt = (tariff) => flowsAt(tariff).reduce((s, v, t) => s + v / (1 + target) ** t, 0)
  let lo = 0
  let hi = 50
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (npvAt(mid) < 0) lo = mid
    else hi = mid
  }
  const ppa = (lo + hi) / 2
  // What the site saves against its grid tariff, at zero capital cost.
  let saved = 0
  const rows = []
  for (let t = 1; t <= years; t++) {
    const kwh = kwhIn(annual, t, S.degradation)
    const { savings, used } = value(kwh, t, p, mix)
    const paid = kwh * ppa
    saved += savings - paid
    rows.push({ year: t, kwh, used, savings, paid, net: savings - paid })
  }
  const tariff1 = p.tariff * (1 - ((p.todDisc || 0) / 100) * (mix?.solarHours ?? 0.85))
  return { capex, debt, equity, ppa, rows, saved, firstYear: rows[0]?.net ?? 0, discountVsGrid: tariff1 ? 1 - ppa / tariff1 : 0, equityIrr: irr(flowsAt(ppa)) }
}

/**
 * Conservative / base / optimistic cases. Conservative: P90 energy, cost +10 %, tariff rise −1 pt;
 * optimistic: energy +1.2816 σ (P10), cost −5 %, tariff rise +1 pt. `cv` is the inter-annual σ/mean.
 */
export function scenarios({ annual, kwp, p, battery, mix, cv = 0.04 }) {
  const run = (k, cost, esc) => finance({ annual: annual * k, kwp, p: { ...p, cost: p.cost * cost, escalation: p.escalation + esc }, battery, mix })
  return {
    conservative: { label: 'Conservative', note: 'P90 energy, cost +10 %, tariff rise −1 pt', f: run(1 - 1.2816 * cv, 1.1, -1) },
    base: { label: 'Base', note: 'P50 energy, your inputs', f: run(1, 1, 0) },
    optimistic: { label: 'Optimistic', note: 'P10 energy, cost −5 %, tariff rise +1 pt', f: run(1 + 1.2816 * cv, 0.95, 1) },
  }
}

/** NPV sensitivity to ±`pct` % on each driver (tornado chart data), sorted by swing. */
export function sensitivity({ annual, kwp, p, battery, mix }, pct = 10) {
  const base = finance({ annual, kwp, p, battery, mix }).npv
  const k = pct / 100
  const drivers = [
    ['Energy yield', (s) => ({ annual: annual * (1 + s * k) })],
    ['System cost', (s) => ({ p: { ...p, cost: p.cost * (1 + s * k) } })],
    ['Grid tariff', (s) => ({ p: { ...p, tariff: p.tariff * (1 + s * k) } })],
    ['Discount rate', (s) => ({ p: { ...p, discount: p.discount * (1 + s * k) } })],
    ['O&M cost', (s) => ({ p: { ...p, omPct: p.omPct * (1 + s * k) } })],
  ]
  return drivers.map(([name, f]) => {
    const lo = finance({ annual, kwp, p, battery, mix, ...f(-1) }).npv - base
    const hi = finance({ annual, kwp, p, battery, mix, ...f(1) }).npv - base
    return { name, low: lo, high: hi, swing: Math.abs(hi - lo) }
  }).sort((a, b) => b.swing - a.swing)
}
