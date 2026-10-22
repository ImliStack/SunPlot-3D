// Survey maths: bill → system size, PM Surya Ghar subsidy, terrace zones and the recommended
// set of modules. Figures follow MNRE guidelines as researched in PLAN.md §8 (Oct 2026).

// States with the higher central subsidy (₹33,000 / ₹19,800 per kW).
const SPECIAL = ['Arunachal Pradesh', 'Assam', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura',
  'Uttarakhand', 'Himachal Pradesh', 'Jammu and Kashmir', 'Ladakh', 'Andaman and Nicobar Islands', 'Lakshadweep']

export const isSpecialState = (state = '') => SPECIAL.some((s) => state.toLowerCase().includes(s.toLowerCase()))

/** Central subsidy (CFA) for a residential system of `kw`, capped at 3 kW. */
export function subsidy(kw, special = false) {
  const [a, b] = special ? [33000, 19800] : [30000, 18000]
  return Math.min(kw, 2) * a + Math.min(Math.max(kw - 2, 0), 1) * b
}

/**
 * System size from consumption. `unitsMonth` is average kWh per month; `specific` is the site's
 * kWh per kWp per year (from measured climate). Capped by roof capacity and sanctioned load.
 */
export function sizeSystem({ unitsMonth, specific, roofKw, sanctionedKw, watt }) {
  const needKw = specific > 0 ? (unitsMonth * 12) / specific : 0
  const caps = [roofKw, sanctionedKw > 0 ? sanctionedKw : Infinity]
  const capKw = Math.min(...caps)
  const kw = Math.max(0, Math.min(needKw, capKw))
  const modules = Math.max(0, Math.round((kw * 1000) / watt))
  const builtKw = (modules * watt) / 1000
  const limit = needKw > roofKw ? 'roof' : sanctionedKw > 0 && needKw > sanctionedKw ? 'sanctioned' : null
  return { needKw, kw: builtKw, modules, limit, cover: needKw ? Math.min(1, (builtKw * specific) / (unitsMonth * 12)) : 0 }
}

const ZONE_NAMES = { front: 'Front', back: 'Back', left: 'Left', right: 'Right', centre: 'Centre' }
const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }

/**
 * Split candidate modules into front / back / left / right / centre of the terrace as seen from
 * the street (`front` = compass side facing the street), and score each by shade.
 * `shade[i]` = annual beam fraction lost for candidate module i.
 */
export function rankZones(panels, shade, front = 'S', beamShare = 0.75) {
  if (!panels.length) return []
  const f = DIRS[front] ?? DIRS.S
  const look = [-f[0], -f[1]] // the viewer on the street looks at the house
  const right = [-look[1], look[0]]
  const pts = panels.map((p) => [p.pos[0], p.pos[2]])
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length
  const a = pts.map(([x, z]) => (x - cx) * f[0] + (z - cz) * f[1])
  const b = pts.map(([x, z]) => (x - cx) * right[0] + (z - cz) * right[1])
  const ra = Math.max(...a.map(Math.abs)) || 1
  const rb = Math.max(...b.map(Math.abs)) || 1
  const zones = {}
  panels.forEach((p, i) => {
    const na = a[i] / ra
    const nb = b[i] / rb
    let key = 'centre'
    if (Math.abs(na) > 1 / 3 || Math.abs(nb) > 1 / 3) key = Math.abs(na) >= Math.abs(nb) ? (na > 0 ? 'front' : 'back') : (nb > 0 ? 'right' : 'left')
    const z = (zones[key] ??= { key, name: ZONE_NAMES[key], idx: [], shade: 0 })
    z.idx.push(i)
    z.shade += shade?.[i] ?? 0
  })
  return Object.values(zones)
    .map((z) => ({ ...z, count: z.idx.length, shade: z.shade / z.idx.length, energy: 1 - beamShare * (z.shade / z.idx.length) }))
    .sort((x, y) => x.shade - y.shade || y.count - x.count)
}

/** The `n` least-shaded candidate modules, as indices. */
export function bestModules(shade, n) {
  return shade
    ? [...shade.keys()].sort((i, j) => shade[i] - shade[j]).slice(0, n)
    : [...Array(n).keys()]
}

/** One plain-language sentence on where to put the panels. */
export function placementAdvice(zones, mumty, tank) {
  if (!zones.length) return ''
  const best = zones[0]
  const worst = zones[zones.length - 1]
  const gap = (worst.shade - best.shade) * 100
  const extra = [mumty && 'the stair room', tank && 'the water tank'].filter(Boolean).join(' and ')
  if (zones.length === 1 || gap < 0.5) {
    return `The whole terrace gets similar sun — any part works${extra ? `; keep clear of ${extra}` : ''}.`
  }
  return `Start at the ${best.name.toLowerCase()} of the terrace: it loses ${best.shade < 0.005 ? 'almost no' : `${(best.shade * 100).toFixed(1)} %`} direct sun to shade, against ${(worst.shade * 100).toFixed(1)} % at the ${worst.name.toLowerCase()}${extra ? `, and stays clear of ${extra}` : ''}.`
}

/** Module makers named in Indian market notes (indicative, not an endorsement). */
export const MAKERS = ['Waaree', 'Adani Solar', 'Tata Power Solar', 'Vikram Solar', 'Premier Energies', 'RenewSys']
