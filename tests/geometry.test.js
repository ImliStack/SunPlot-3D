import { describe, it, expect } from 'vitest'
import { computeLayout, defaultTerrace } from '../src/layout.js'
import { DEFAULTS, SITES, panelOf } from '../src/presets.js'
import { SITE_SIZES } from '../src/store.js'
import { moduleOutlines } from '../src/exports.js'

// Layout invariants for every site type with its default sizes: no two modules overlap, capacity is
// the sum of module ratings, and terrace modules stay inside the outline minus the edge setback.

/** Separating-axis test for two convex quads in plan, shrunk by `eps` to ignore touching edges. */
export function overlap(a, b, eps = 0.01) {
  const shrink = (q) => {
    const cx = q.reduce((s, p) => s + p[0], 0) / 4
    const cy = q.reduce((s, p) => s + p[1], 0) / 4
    return q.map(([x, y]) => {
      const d = Math.hypot(x - cx, y - cy) || 1
      return [x - ((x - cx) / d) * eps, y - ((y - cy) / d) * eps]
    })
  }
  const A = shrink(a)
  const B = shrink(b)
  for (const poly of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly[i]
      const [x2, y2] = poly[(i + 1) % 4]
      const nx = y2 - y1
      const ny = x1 - x2
      const proj = (q) => q.map(([x, y]) => x * nx + y * ny)
      const pa = proj(A)
      const pb = proj(B)
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false
    }
  }
  return true
}

const inside = ([x, z], ring) => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c
  }
  return c
}

function countOverlaps(layout, p) {
  // Modules on different heights can legitimately overlap in plan (stacked canopies don't, but
  // tall-to-low planes do not exist here); compare quads in plan, bucketed on a 3 m grid.
  const quads = moduleOutlines(layout, { ...p, azimuth: 180 })
  const grid = new Map()
  let n = 0
  quads.forEach((q, i) => {
    const keys = new Set(q.map(([x, y]) => `${Math.floor(x / 3)},${Math.floor(y / 3)}`))
    const seen = new Set()
    for (const k of keys) {
      for (const j of grid.get(k) ?? []) {
        if (seen.has(j)) continue
        seen.add(j)
        // Ignore pairs on different array planes of a pitched roof (front/back share only the ridge).
        if (layout.panels[i].arr !== layout.panels[j].arr && Math.abs(layout.panels[i].pos[1] - layout.panels[j].pos[1]) > 0.5) continue
        if (overlap(q, quads[j])) n++
      }
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k).push(i)
    }
  })
  return n
}

describe.each(Object.keys(SITES))('layout: %s', (site) => {
  const p = { ...DEFAULTS, site, ...SITE_SIZES[site], ...(site === 'terrace' ? { terrace: defaultTerrace() } : {}) }
  const L = computeLayout(p)
  it('places modules', () => expect(L.count).toBeGreaterThan(0))
  it('DC capacity = modules × rated W', () => expect(L.kwp).toBeCloseTo((L.count * panelOf(p).watt) / 1000, 9))
  it('array counts add up to the module count', () => expect(L.arrays.reduce((s, a) => s + a.count, 0)).toBe(L.count))
  it('no two modules overlap', () => expect(countOverlaps(L, p)).toBe(0))
  it('module area ≤ surface area', () => expect(L.moduleArea).toBeLessThanOrEqual(L.surface + 1e-6))
})

describe('terrace containment and setback', () => {
  const t = { ...defaultTerrace(16, 11), outline: [[-8, -5.5], [8, -5.5], [8, 2], [3, 5.5], [-8, 5.5]] } // irregular pentagon
  const p = { ...DEFAULTS, site: 'terrace', ...SITE_SIZES.terrace, terrace: t, edge: 0.6 }
  const L = computeLayout(p)
  it('every module corner is inside the outline', () => {
    const quads = moduleOutlines(L, { ...p, azimuth: 180 })
    // moduleOutlines returns north-up plan coords (x east, y north = −z); undo for the site frame.
    const bad = quads.filter((q) => q.some(([x, y]) => !inside([x, -y], t.outline)))
    expect(bad.length).toBe(0)
  })
  it('places a sensible number of modules for ~150 m²', () => expect(L.count).toBeGreaterThan(20))
})

describe('degenerate inputs', () => {
  it('zero-size flat roof gives zero modules, not NaN', () => {
    const L = computeLayout({ ...DEFAULTS, site: 'flat', ...SITE_SIZES.flat, length: 1, width: 1 })
    expect(L.count).toBe(0)
    expect(L.kwp).toBe(0)
  })
  it('capacity target caps the module count', () => {
    const L = computeLayout({ ...DEFAULTS, site: 'flat', ...SITE_SIZES.flat, target: 10 })
    expect(L.kwp).toBeLessThanOrEqual(10 + panelOf({ ...DEFAULTS, ...SITE_SIZES.flat }).watt / 1000)
  })
})

describe('the overlap check itself', () => {
  const sq = (x, y, s = 1) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]
  it('detects overlapping squares', () => expect(overlap(sq(0, 0), sq(0.5, 0.5))).toBe(true))
  it('ignores squares that only touch', () => expect(overlap(sq(0, 0), sq(1, 0))).toBe(false))
  it('detects a rotated overlap', () => expect(overlap(sq(0, 0), [[0.5, -0.2], [1.4, 0.5], [0.7, 1.4], [-0.2, 0.7]])).toBe(true))
})

describe('custom module and structure height', async () => {
  const { computeLayout } = await import('../src/layout.js')
  const { DEFAULTS, panelOf } = await import('../src/presets.js')
  it('custom module size changes the count on the same roof', () => {
    const base = { ...DEFAULTS, site: 'flat', length: 30, width: 20 }
    const big = computeLayout({ ...base, panel: 'custom', customL: 2.382, customW: 1.134, customWatt: 620 })
    const small = computeLayout({ ...base, panel: 'custom', customL: 1.722, customW: 1.134, customWatt: 430 })
    expect(small.count).toBeGreaterThan(big.count)
    expect(panelOf({ ...base, panel: 'custom', customWatt: 620 }).watt).toBe(620)
  })
  it('structure height raises the racks', () => {
    const base = { ...DEFAULTS, site: 'flat', length: 30, width: 20 }
    const low = computeLayout(base)
    const high = computeLayout({ ...base, rackHeight: 2.5 })
    const minY = (l) => Math.min(...l.panels.map((q) => q.pos[1]))
    expect(minY(high) - minY(low)).toBeCloseTo(2.35, 1)
  })
})
