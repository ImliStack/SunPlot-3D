// Layout alternatives: re-run the layout and the hourly engine for variants of the current design
// (tilt, orientation, module orientation, both roof faces, east-west racks) and rank them.
//
// Each option is simulated with the same weather, losses, soiling and inverter sizing rule as the
// main result. Obstruction shading is ray-cast only for the design on screen, so options are
// compared unshaded (rows are already spaced for winter-solstice noon); applying an option
// re-runs the ray cast for it.

import { computeLayout } from './layout.js'
import { simulate } from './engine/simulate.js'
import { finance } from './finance.js'
import { pickInverters } from './electrical.js'
import { panelOf } from './presets.js'
import { mountFor } from './hooks.js'

const RACKED = ['flat', 'terrace', 'airport']
const PITCHED_BOTH = ['gable', 'hip', 'lshape', 'industrial']

/** Equator-facing azimuth for a latitude (180° in the north, 0° in the south). */
export const equatorAzimuth = (lat) => (lat >= 0 ? 180 : 0)

/** The parameter changes worth trying for this kind of site. Each: { id, label, patch }. */
export function variantsFor(p) {
  const out = [{ id: 'current', label: 'Current', patch: {} }]
  const eq = equatorAzimuth(p.lat)
  const add = (id, label, patch) => {
    // Skip a variant identical to the design on screen.
    if (Object.entries(patch).every(([k, v]) => p[k] === v)) return
    out.push({ id, label, patch })
  }
  if (RACKED.includes(p.site)) {
    for (const t of [5, 10, 15, 20, 25, 30]) add(`tilt${t}`, `${t}° racks`, { rackTilt: t, eastWest: false, azimuth: eq })
    add('ew', 'East-west racks', { eastWest: true })
  }
  if (p.site === 'ground') {
    const best = Math.round(Math.min(40, Math.max(5, Math.abs(p.lat) * 0.76 + 3.1)))
    for (const t of [...new Set([best - 10, best - 5, best, best + 5].filter((t) => t >= 5 && t <= 45))]) add(`gt${t}`, `${t}° tables`, { groundTilt: t, azimuth: eq })
    add('stack1', '1 module per table', { stack: 1 })
    add('stack3', '3 modules per table', { stack: 3 })
  }
  if (PITCHED_BOTH.includes(p.site)) add('both', p.bothFaces ? 'Front faces only' : 'Both roof faces', { bothFaces: !p.bothFaces })
  if (!p.tiles) add('orient', p.portrait ? 'Landscape modules' : 'Portrait modules', { portrait: !p.portrait })
  if (p.target > 0) add('fill', 'Fill the roof (no cap)', { target: 0 })
  return out
}

/**
 * Lay out and simulate every variant. `weather` is the loaded hourly file; `soiling`/`snow` are
 * the monthly fractions used for the main result.
 */
export function generateAlternatives(p, { weather, soiling, snow, mix = null }) {
  const panel = panelOf(p)
  return variantsFor(p).map((v) => {
    const q = { ...p, ...v.patch }
    const layout = computeLayout(q)
    if (!layout.count) return { ...v, params: q, layout, kwp: 0, count: 0, annual: 0, specific: 0, fin: null }
    const watt = (layout.kwp * 1000) / layout.count
    const inv = pickInverters(layout.kwp, 'auto', 0)
    const sim = simulate({
      weather, lat: q.lat, lon: q.lon,
      arrays: layout.arrays.filter((a) => a.count).map((a) => ({ tilt: a.tilt, azimuth: a.azimuth, pdc0: a.count * watt, gamma: (panel.gPmax ?? -0.35) / 100, mount: mountFor(q) })),
      acRating: inv.n * inv.inv.ac * 1000, albedo: weather.albedo ?? 0.2, soiling, snow,
    })
    const fin = finance({ annual: sim.annual, kwp: layout.kwp, p: q, mix })
    return {
      ...v, params: q, layout, kwp: layout.kwp, count: layout.count, annual: sim.annual,
      specific: sim.specificYield, pr: sim.performanceRatio, inverter: `${inv.n} × ${inv.inv.label}`, fin,
    }
  })
}

/** Which option wins each objective. Returns { objective: id }. */
export function winners(opts) {
  const ok = opts.filter((o) => o.count > 0)
  const best = (f, min = false) => ok.reduce((a, b) => (a == null || (min ? f(b) < f(a) : f(b) > f(a)) ? b : a), null)?.id
  return {
    kwp: best((o) => o.kwp),
    energy: best((o) => o.annual),
    yield: best((o) => o.specific),
    npv: best((o) => o.fin?.npv ?? -Infinity),
    payback: best((o) => o.fin?.payback ?? Infinity, true),
    cost: best((o) => o.fin?.net ?? Infinity, true),
  }
}

export const OBJECTIVES = [
  ['kwp', 'Most capacity'],
  ['energy', 'Most energy'],
  ['yield', 'Best kWh per kWp'],
  ['npv', 'Best NPV'],
  ['payback', 'Fastest payback'],
  ['cost', 'Lowest cost'],
]
