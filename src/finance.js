// 25-year money view of a design: tariff escalation, module degradation, O&M, an inverter swap,
// optional loan, own use vs export, then payback, IRR, NPV and LCOE. Plus what it does for the air.

export const YEARS = 25
const DEGRADE_Y1 = 0.01 // first-year light-induced loss
const DEGRADE = 0.004 // per year after (TOPCon / PERC linear warranties ≈ 0.4–0.55 %)
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

/**
 * `annual` kWh in year 1 (P50), `kwp`, params `p`, optional `battery` from electrical.js.
 * Returns the cash flow table and headline numbers.
 */
export function finance({ annual, kwp, p, battery = null }) {
  const gross = kwp * 1000 * p.cost + (battery?.cost ?? 0)
  const subsidy = Math.min(p.subsidy || 0, gross)
  const net = gross - subsidy
  const loan = (net * (p.loanShare || 0)) / 100
  const down = net - loan
  const pay = emi(loan, p.loanRate, p.loanYears)
  const ownUse = p.useKwh > 0 ? p.useKwh * 12 : Infinity
  const exportRate = p.exportRate || p.tariff * 0.4
  const om0 = (gross * p.omPct) / 100

  const rows = []
  let cumulative = -down
  let payback = null
  const flows = [-net] // project view (no loan)
  for (let t = 1; t <= YEARS; t++) {
    const kwh = t === 1 ? annual : annual * (1 - DEGRADE_Y1) * (1 - DEGRADE) ** (t - 2)
    const tariff = p.tariff * (1 + p.escalation / 100) ** (t - 1)
    const used = Math.min(kwh, ownUse)
    const savings = used * tariff + (kwh - used) * exportRate
    const om = om0 * (1 + OM_RISE) ** (t - 1) + (t === INVERTER_SWAP.year ? gross * INVERTER_SWAP.share : 0)
    const loanPaid = t <= p.loanYears ? pay * 12 : 0
    const netFlow = savings - om - loanPaid
    const before = cumulative
    cumulative += netFlow
    if (payback == null && before < 0 && cumulative >= 0) payback = t - 1 + -before / netFlow
    flows.push(savings - om)
    rows.push({ year: t, kwh, tariff, savings, om, loan: loanPaid, net: netFlow, cumulative })
  }
  const d = p.discount / 100
  const pv = (v, t) => v / (1 + d) ** t
  const npv = flows.reduce((s, f, t) => s + pv(f, t), 0)
  const energyPv = rows.reduce((s, r) => s + pv(r.kwh, r.year), 0)
  const costPv = net + rows.reduce((s, r) => s + pv(r.om, r.year), 0)
  const life = rows.reduce((s, r) => s + r.kwh, 0)
  const co2 = (annual * p.co2) / 1000 // t in year 1
  return {
    gross, subsidy, net, loan, down, emi: pay, rows, payback: payback ?? (cumulative < 0 ? null : 0),
    irr: irr(flows), npv, lcoe: energyPv ? costPv / energyPv : 0,
    savings25: rows.reduce((s, r) => s + r.savings, 0), gain25: cumulative,
    roi: net ? (rows.reduce((s, r) => s + r.savings - r.om, 0) - net) / net : 0,
    life,
    env: {
      co2Year: co2,
      co2Life: (life * p.co2) / 1000,
      trees: (co2 * 1000) / TREE_KG,
      coal: (annual * COAL_KG) / 1000, // t a year
    },
  }
}
