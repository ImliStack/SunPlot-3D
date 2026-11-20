import { describe, it, expect } from 'vitest'
import { buildScene, computeShading, skyDirections } from '../src/shading.js'
import { computeLayout } from '../src/layout.js'
import { DEFAULTS } from '../src/presets.js'

const site = { lat: 26.9, lon: 75.8 }
const flat = (extra = {}) => computeLayout({ ...DEFAULTS, site: 'flat', length: 24, width: 16, vents: 0, floors: 2, edge: 1.2, ...extra })

describe('shading: bypass diodes and sky view', () => {
  it('cosine-weighted sky directions average cos θ = 2/3', () => {
    const d = skyDirections(400)
    expect(d.reduce((a, x) => a + x[2], 0) / d.length).toBeCloseTo(2 / 3, 2)
  })
  it('an open roof with no obstacles keeps nearly all its sky', () => {
    const L = flat({ rackTilt: 5, target: 1 }) // a couple of modules alone
    const r = computeShading(buildScene(L, { azimuth: 180 }), site)
    expect(r.skyView[0]).toBeGreaterThan(0.9)
  })
  it('electrical (bypass-diode) beam loss is never below the shaded area, and rows lose some sky', () => {
    const L = flat({ rackTilt: 25 })
    const r = computeShading(buildScene(L, { azimuth: 180 }), site)
    const sum = (rows) => rows[0].reduce((a, b) => a + b, 0)
    expect(sum(r.perArray)).toBeGreaterThanOrEqual(sum(r.perArrayGeometric) - 1e-9)
    expect(r.skyView[0]).toBeLessThan(1)
    expect(r.skyView[0]).toBeGreaterThan(0.6)
    expect(r.samples).toBe(9)
  })
})
