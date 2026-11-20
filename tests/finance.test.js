import { describe, it, expect } from 'vitest'
import { emi, irr, finance, resco, kwhIn, scenarios, sensitivity } from '../src/finance.js'
import { DEFAULTS } from '../src/presets.js'
import { INCENTIVES } from '../src/data/incentives.js'

// Hand-calculated references. Each expected value is worked out in the comment beside it.
const base = { ...DEFAULTS, cost: 50, tariff: 8, escalation: 0, omPct: 0, discount: 8, subsidy: 0, loanShare: 0, useKwh: 0, buyer: 'home', metering: 'net', degradation: 0, inverterShare: 0 }

describe('loan EMI', () => {
  // ₹1,00,000 at 12 %/yr over 12 months: r = 0.01, EMI = 100000·0.01/(1 − 1.01^−12) = 8884.879
  it('₹1 lakh, 12 %, 1 yr = ₹8,884.88/month', () => expect(emi(100000, 12, 1)).toBeCloseTo(8884.88, 2))
  it('zero rate divides evenly', () => expect(emi(1200, 0, 1)).toBeCloseTo(100, 10))
  it('no principal, no EMI', () => expect(emi(0, 10, 5)).toBe(0))
})

describe('IRR', () => {
  it('−100 then +110 → 10 %', () => expect(irr([-100, 110])).toBeCloseTo(0.1, 6))
  // −100, +60, +60: 60/(1+r) + 60/(1+r)² = 100 → r = 0.130662
  it('−100, 60, 60 → 13.0662 %', () => expect(irr([-100, 60, 60])).toBeCloseTo(0.130662, 5))
  it('no sign change → null', () => expect(irr([100, 10, 10])).toBeNull())
})

describe('owner cash flow (no O&M, no degradation, flat tariff)', () => {
  // 1 kWp, 1,500 kWh/yr, ₹50/W → ₹50,000; savings 1,500 × ₹8 = ₹12,000/yr → payback 50,000/12,000 = 4.1667 yr
  const f = finance({ annual: 1500, kwp: 1, p: base })
  it('cost ₹50,000', () => expect(f.gross).toBe(50000))
  it('year-1 savings ₹12,000', () => expect(f.rows[0].savings).toBeCloseTo(12000, 6))
  it('payback 4.1667 yr', () => expect(f.payback).toBeCloseTo(50000 / 12000, 6))
  it('lifetime defaults to 25 years', () => expect(f.rows.length).toBe(25))
  // NPV = −50,000 + 12,000 × annuity(8 %, 25) = −50,000 + 12,000 × 10.674776 = 78,097.32
  it('NPV at 8 % = ₹78,097.32', () => expect(f.npv).toBeCloseTo(-50000 + 12000 * ((1 - 1.08 ** -25) / 0.08), 4))
  // LCOE = 50,000 ÷ Σ 1,500/1.08^t = 50,000 ÷ (1,500 × 10.674776) = ₹3.1226/kWh
  it('LCOE = ₹3.1226/kWh', () => expect(f.lcoe).toBeCloseTo(50000 / (1500 * ((1 - 1.08 ** -25) / 0.08)), 6))
  // ROI = (25 × 12,000 − 50,000) ÷ 50,000 = 5.0
  it('ROI = 500 %', () => expect(f.roi).toBeCloseTo(5, 6))
  // Discounted payback: cumulative PV crosses zero in year 6 (PV annuity 5 yr = 47,912.5; 6 yr = 55,474.5)
  it('discounted payback between 5 and 6 years', () => {
    const a5 = 12000 * ((1 - 1.08 ** -5) / 0.08)
    expect(f.discountedPayback).toBeCloseTo(5 + (50000 - a5) / (12000 / 1.08 ** 6), 6)
  })
})

describe('ageing, escalation, export, subsidy, edge cases', () => {
  it('degradation compounds from year 2 (LID is in the simulation)', () => {
    expect(kwhIn(1000, 1, 0.004)).toBe(1000)
    expect(kwhIn(1000, 3, 0.004)).toBeCloseTo(1000 * 0.996 ** 2, 9)
  })
  it('tariff escalation 3 %/yr', () => {
    const f = finance({ annual: 1000, kwp: 1, p: { ...base, escalation: 3 } })
    expect(f.rows[2].tariff).toBeCloseTo(8 * 1.03 ** 2, 9)
  })
  it('net metering: own use capped at annual consumption, surplus at export rate', () => {
    // 1,500 kWh made, 1,200 used (100/month): 1,200 × 8 + 300 × 3 = 10,500
    const f = finance({ annual: 1500, kwp: 1, p: { ...base, exportRate: 3 }, mix: { useYear: 1200, selfShare: 0.5, solarHours: 0.85 } })
    expect(f.rows[0].savings).toBeCloseTo(10500, 6)
  })
  it('gross metering sells everything at the export rate', () => {
    const f = finance({ annual: 1500, kwp: 1, p: { ...base, exportRate: 3, metering: 'gross' }, mix: { useYear: 1200, selfShare: 0.5, solarHours: 0.85 } })
    expect(f.rows[0].savings).toBeCloseTo(4500, 6)
  })
  it('zero export counts only what is used as it is made', () => {
    const f = finance({ annual: 1000, kwp: 1, p: { ...base, zeroExport: true }, mix: { useYear: 5000, selfShare: 0.6, solarHours: 0.85 } })
    expect(f.rows[0].savings).toBeCloseTo(1000 * 0.6 * 8, 6)
  })
  it('subsidy reduces the net cost', () => {
    const f = finance({ annual: 1500, kwp: 1, p: { ...base, subsidy: 30000 } })
    expect(f.net).toBe(20000)
    expect(f.payback).toBeCloseTo(20000 / 12000, 6)
  })
  it('zero capacity: no payback, no ROI, no crash', () => {
    const f = finance({ annual: 0, kwp: 0, p: base })
    expect(f.payback).toBeNull()
    expect(f.roi).toBeNull()
    expect(Number.isFinite(f.npv)).toBe(true)
  })
  it('never pays back → null payback', () => {
    const f = finance({ annual: 10, kwp: 1, p: base })
    expect(f.payback).toBeNull()
  })
})

describe('business after tax with 40 % accelerated depreciation', () => {
  // Year 1: depreciation 0.4 × 50,000 = 20,000; taxable = 12,000 − 0 − 0 − 20,000 = −8,000;
  // tax = −8,000 × 25 % = −2,000 (a saving against other profit); net = 12,000 + 2,000 = 14,000.
  const f = finance({ annual: 1500, kwp: 1, p: { ...base, buyer: 'business', taxRate: 25 } })
  it('year-1 depreciation ₹20,000', () => expect(f.rows[0].dep).toBeCloseTo(20000, 6))
  it('year-1 net cash ₹14,000', () => expect(f.rows[0].net).toBeCloseTo(14000, 6))
  it('year-2 depreciation on the written-down value (₹12,000)', () => expect(f.rows[1].dep).toBeCloseTo(12000, 6))
})

describe('RESCO tariff', () => {
  const r = resco({ annual: 1500, kwp: 1, p: { ...base, cost: 50, debtShare: 70, debtRate: 10.8, debtYears: 13, roe: 14, ppaYears: 25, omPct: 1 } })
  it('the solved tariff gives the developer exactly its target RoE', () => expect(r.equityIrr).toBeCloseTo(0.14, 4))
  it('site pays nothing upfront; savings = grid value − PPA payments', () => expect(r.rows[0].net).toBeCloseTo(r.rows[0].savings - r.rows[0].paid, 6))
})

describe('scenarios and sensitivity', () => {
  it('conservative < base < optimistic NPV', () => {
    const s = scenarios({ annual: 1500, kwp: 1, p: base, cv: 0.04 })
    expect(s.conservative.f.npv).toBeLessThan(s.base.f.npv)
    expect(s.base.f.npv).toBeLessThan(s.optimistic.f.npv)
  })
  it('energy yield and tariff move NPV the same way (both scale savings)', () => {
    const t = sensitivity({ annual: 1500, kwp: 1, p: base }, 10)
    const e = t.find((x) => x.name === 'Energy yield')
    const g = t.find((x) => x.name === 'Grid tariff')
    expect(e.high).toBeCloseTo(g.high, 6)
    expect(e.high).toBeGreaterThan(0)
  })
})

describe('incentive tables', () => {
  it('PM Surya Ghar: 3 kW → ₹78,000; 2 kW → ₹60,000; special state 3 kW → ₹85,800', () => {
    expect(INCENTIVES.pmSuryaGharHome.amount(3)).toBe(78000)
    expect(INCENTIVES.pmSuryaGharHome.amount(2)).toBe(60000)
    expect(INCENTIVES.pmSuryaGharHome.amount(5, true)).toBe(85800)
  })
  it('RWA: 100 kW, 20 houses → 60 kW × ₹18,000 = ₹10,80,000 (MNRE worked example)', () => {
    expect(INCENTIVES.pmSuryaGharSociety.amount(100, 20)).toBe(1080000)
  })
})
