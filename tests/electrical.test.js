import { describe, it, expect } from 'vitest'
import { electricalDesign, pickInverters, INVERTERS } from '../src/electrical.js'
import { PANELS, DEFAULTS } from '../src/presets.js'

const m = PANELS.dcr580 // Voc 51.9 V, Vmp 43.4 V, Isc 14.2 A, βVoc −0.25 %/°C, γ −0.30 %/°C
const layout = (count) => ({ count, kwp: (count * m.watt) / 1000, arrays: [{ count, tilt: 20, azimuth: 180 }], moduleArea: count * 2.58, load: 12 })

describe('string voltage limits (IEC 62548 practice)', () => {
  const e = electricalDesign({ layout: layout(150), module: m, temps: { low: 0, high: 45 }, p: { ...DEFAULTS }, heightM: 8 })
  // Voc at 0 °C = 51.9 × (1 − 0.0025 × (0 − 25)) = 51.9 × 1.0625 = 55.144 V per module
  it('cold Voc per module = 55.144 V', () => expect(e.vocCold).toBeCloseTo(55.14375, 4))
  // Hot Vmp at 45 + 30 = 75 °C cell = 43.4 × (1 − 0.003 × 50) = 36.89 V
  it('hot Vmp per module = 36.89 V', () => expect(e.vmpHot).toBeCloseTo(36.89, 4))
  it('longest string stays under the inverter max DC voltage', () => expect(e.vocCold * e.L).toBeLessThanOrEqual(e.inverter.vmax))
  it('shortest string stays above the MPPT minimum when hot', () => expect(e.vmpHot * e.Lmin).toBeGreaterThanOrEqual(e.inverter.mpptMin))
  it('every module is wired (mixed string lengths)', () => expect(e.loose).toBe(0))
  it('strings × lengths cover the module count', () => {
    const lo = e.strings * e.Lmin
    const hi = e.strings * e.L
    expect(150).toBeGreaterThanOrEqual(lo)
    expect(150).toBeLessThanOrEqual(hi)
  })
  it('all checks pass for a normal design', () => expect(e.ok).toBe(true))
})

describe('inverter choice', () => {
  it('5.16 kWp home → one 5 kW single-phase (DC:AC 1.03)', () => {
    const r = pickInverters(5.16)
    expect(r.inv).toBe(INVERTERS.r5)
    expect(r.n).toBe(1)
  })
  it('DC:AC stays within 0.8–1.3 across sizes', () => {
    for (const kwp of [3.4, 5.16, 12, 25, 87, 400, 1790]) {
      const r = pickInverters(kwp)
      const ratio = kwp / (r.n * r.inv.ac)
      expect(ratio).toBeGreaterThanOrEqual(0.8)
      expect(ratio).toBeLessThanOrEqual(1.3)
    }
  })
})

describe('cables', () => {
  const e = electricalDesign({ layout: layout(640), module: m, temps: { low: 0, high: 45 }, p: { ...DEFAULTS, dcRun: 40, acRun: 30 }, heightM: 11 })
  // DC drop = 2 L I ρ / (A V): check the reported drop against the formula for the chosen size.
  it('DC drop matches 2·L·Imp·ρ/(A·Vmp,hot·Lmin) and is ≤ 1.5 %', () => {
    const expected = (2 * 40 * m.imp * 0.0193) / e.dc.mm2 / (e.vmpHot * e.Lmin)
    expect(e.dc.drop).toBeCloseTo(expected, 9)
    expect(e.dc.drop).toBeLessThanOrEqual(0.015)
  })
  it('AC cable carries 125 % of inverter current (parallel runs if needed)', () => {
    expect(e.ac.rating * e.ac.runs).toBeGreaterThanOrEqual(e.iAc * 1.25)
  })
  it('main feeder flagged when four cables cannot carry it', () => {
    const big = electricalDesign({ layout: layout(3250), module: m, temps: { low: 0, high: 45 }, p: { ...DEFAULTS }, heightM: 11 })
    const flagged = big.checks.some((c) => c.label === 'AC main feeder' && !c.ok)
    expect(flagged || !big.mainAc?.over).toBe(true)
  })
})

describe('empty design', () => {
  it('no modules → no electrical design', () => expect(electricalDesign({ layout: layout(0), module: m, temps: { low: 0, high: 45 }, p: DEFAULTS })).toBeNull())
})
