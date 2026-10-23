// Turns the inputs into a panel layout: where every module, post and rail goes, plus the arrays
// the yield model needs. Pure function — the scene and the results panel both read from it.
//
// Coordinates are in the site's own frame (metres): +x along the building length, +y up, and
// +z the direction the main roof plane / array faces. The scene rotates this frame to `azimuth`.

import { PANELS, SHOWS, BAY } from './presets.js'
import { winterNoonAltitude } from './solar.js'
import { area, bbox, inside, edgeDistance } from './survey/geo.js'

const RAD = Math.PI / 180
export const GAP = 0.02 // m between modules (clamp width)
export const OVERHANG = 0.4 // m roof overhang past the walls
export const STOREY = 3 // m per floor
const STANDOFF = 0.12 // m from roof surface to module underside (flush mounts)
const RACK_CLEARANCE = 0.15 // m above a flat roof at the low edge
const MIN_ARRAY = 4 // smallest side array worth wiring
const VALLEY = 0.45 // m kept clear either side of a valley (18″, like hips)
const SQRT2 = Math.SQRT2

const add = (...vs) => vs.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0])
const mul = (v, k) => [v[0] * k, v[1] * k, v[2] * k]
const fmt1 = (n) => (Math.round(n * 10) / 10).toString()
const norm360 = (a) => ((a % 360) + 360) % 360
/** Angle between a bearing and the equator-facing bearing, 0–180°. */
const offEquator = (az, lat) => Math.abs(((az - (lat >= 0 ? 180 : 0) + 540) % 360) - 180)

/** How many modules of size `size` fit in `span` with gaps between them. */
const fit = (span, size) => Math.max(0, Math.floor((span + GAP) / (size + GAP)))
const run = (n, size) => (n > 0 ? n * size + (n - 1) * GAP : 0)

/** Effective input: values hidden for this site type fall back to something neutral. */
export function siteInputs(p) {
  const shown = (k) => SHOWS[k]?.includes(p.site) ?? true
  return {
    ...p,
    bothFaces: shown('bothFaces') && p.bothFaces,
    chimney: shown('chimney') && p.chimney,
    vents: shown('vents') ? p.vents : 0,
  }
}

/** Module footprint on its plane: `du` across the row, `dv` up the slope. */
function moduleSize(p) {
  const m = PANELS[p.panel]
  return p.portrait ? { du: m.w, dv: m.h, m } : { du: m.h, dv: m.w, m }
}

/**
 * Keep-out test on plan corners (x, z). `rects` are axis-aligned boxes already grown by their
 * clearance; `zones` are predicates for shapes like a valley.
 */
function keepOut(rects, zones = []) {
  return (corners) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const [x, z] of corners) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x)
      z0 = Math.min(z0, z); z1 = Math.max(z1, z)
    }
    if (rects.some((r) => x0 < r.x1 && x1 > r.x0 && z0 < r.z1 && z1 > r.z0)) return true
    return zones.some((zone) => corners.some(([x, z]) => zone(x, z)))
  }
}

/**
 * A sloped roof plane. It starts at the eave point `E` (centre of the low edge), runs `U` along
 * the eave and climbs `a` radians towards `inward` (a level unit vector) for a horizontal `runH`.
 * `half(d)` is the usable half-width along U at horizontal inset `d` from the eave — constant for
 * a rectangle, shrinking for a hip trapezoid or triangle.
 */
function plane({ E, U, inward, a, runH }) {
  const V = [inward[0] * Math.cos(a), Math.sin(a), inward[2] * Math.cos(a)]
  const N = [-inward[0] * Math.sin(a), Math.cos(a), -inward[2] * Math.sin(a)]
  return { E, U, V, N, slope: runH / Math.cos(a), a }
}

/**
 * Pack modules flush on a plane, row by row from the eave. Each row uses the narrowest width it
 * spans, drops any slot that touches a keep-out, and a part-filled last row keeps its middle slots.
 */
function packPlane(pl, { half, vFrom, vTo, rowBase = 0 }, size, budget, blocked) {
  const { du, dv } = size
  const { E, U, V, N, a } = pl
  const rows = fit(vTo - vFrom, dv)
  const v0 = vFrom + (vTo - vFrom - run(rows, dv)) / 2
  const at = (u, v) => add(E, mul(U, u), mul(V, v))
  const panels = []
  let cols = 0
  for (let r = 0; r < rows && panels.length < budget; r++) {
    const v = v0 + r * (dv + GAP) + dv / 2
    const w = 2 * Math.min(half((v - dv / 2) * Math.cos(a)), half((v + dv / 2) * Math.cos(a)))
    const n = fit(w, du)
    cols = Math.max(cols, n)
    const slots = []
    for (let c = 0; c < n; c++) {
      const u = -run(n, du) / 2 + c * (du + GAP) + du / 2
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => {
        const q = at(u + (su * du) / 2, v + (sv * dv) / 2)
        return [q[0], q[2]]
      })
      if (!blocked(corners)) slots.push(u)
    }
    const take = Math.min(slots.length, budget - panels.length)
    const start = Math.floor((slots.length - take) / 2)
    for (const u of slots.slice(start, start + take)) {
      panels.push({ pos: add(at(u, v), mul(N, STANDOFF)), U, N, row: rowBase + r })
    }
  }
  return { panels, cols, rows }
}

/**
 * Rows of tilted tables on a level surface at height `base`. Each table is `stack` modules up the
 * slope. Rows are spaced so the one in front does not shade the next at winter-solstice noon.
 */
function packRows(p, size, budget, { base, clearance, tilt, xSpan, zFront, zBack }, blocked, rects) {
  const { du, dv } = size
  const t = tilt * RAD
  const length = run(p.stack, dv) // along the slope
  const depth = length * Math.cos(t)
  const rise = length * Math.sin(t)
  const sun = winterNoonAltitude(p.lat)
  const shadow = rise / Math.tan(sun * RAD)
  const pitch = depth + Math.max(0.6, shadow) // keep at least a walkable aisle
  const N = [0, Math.cos(t), Math.sin(t)]
  const U = [1, 0, 0]
  const cols = fit(xSpan, du)
  const panels = []
  const posts = []
  const rails = []
  const inRect = (x, z) => rects.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)
  let rows = 0
  let rowIndex = -1
  for (let z = zFront; z - depth >= zBack - 1e-6 && panels.length < budget; z -= pitch) {
    rowIndex++
    const n = Math.min(cols, Math.ceil((budget - panels.length) / p.stack))
    if (n <= 0) break
    const width = run(n, du)
    const before = panels.length
    for (let k = 0; k < p.stack; k++) {
      const v = k * (dv + GAP) + dv / 2
      const zc = z - v * Math.cos(t)
      const hz = (dv / 2) * Math.cos(t)
      for (let c = 0; c < n && panels.length < budget; c++) {
        const x = -width / 2 + c * (du + GAP) + du / 2
        if (blocked([[x - du / 2, zc - hz], [x + du / 2, zc - hz], [x + du / 2, zc + hz], [x - du / 2, zc + hz]])) continue
        panels.push({ pos: [x, base + clearance + v * Math.sin(t), zc], U, N, row: rowIndex, stack: k })
      }
    }
    if (panels.length === before) continue
    rows++
    // Posts roughly every 2.5 m, a front and a back leg each, joined by two rails under the modules.
    const bays = Math.max(1, Math.round(width / 2.5))
    const front = z - 0.12 * depth
    const back = z - 0.88 * depth
    const yFront = clearance + 0.12 * rise
    const yBack = clearance + 0.88 * rise
    for (let b = 0; b <= bays; b++) {
      const x = -width / 2 + 0.2 + ((width - 0.4) * b) / bays
      if (!inRect(x, front)) posts.push({ pos: [x, base, front], h: yFront - 0.04, row: rowIndex })
      if (!inRect(x, back)) posts.push({ pos: [x, base, back], h: yBack - 0.04, row: rowIndex })
    }
    rails.push({ pos: [0, base + yFront - 0.04, front], len: width, row: rowIndex })
    rails.push({ pos: [0, base + yBack - 0.04, back], len: width, row: rowIndex })
  }
  return { panels, posts, rails, rows, cols, pitch, depth, sun, aisle: pitch - depth }
}

/**
 * One tilted canopy deck (carport or shelter roof): low edge along x at height `clear` and depth
 * `zFront`, climbing back (−z) by `tilt` over a horizontal `depth`. Modules cover the deck edge to
 * edge; columns sit on the deck's centre line about every three bays.
 */
function canopy(out, size, budget, { x = 0, zFront, len, depth, clear, tilt, columns = true, rowBase = 0 }) {
  const a = tilt * RAD
  const pl = plane({ E: [x, clear, zFront], U: [1, 0, 0], inward: [0, 0, -1], a, runH: depth })
  const res = packPlane(pl, { half: () => len / 2 - 0.05, vFrom: 0.05, vTo: pl.slope - 0.05, rowBase }, size, budget, () => false)
  out.panels.push(...res.panels)
  const yAt = (f) => clear + f * depth * Math.tan(a) // deck height at fraction f of the depth
  out.decks.push({
    pos: [x, yAt(0.5) - 0.09 * Math.cos(a), zFront - depth / 2 - 0.09 * Math.sin(a)],
    size: [len, 0.1, pl.slope], rotX: a,
  })
  if (columns) {
    const n = Math.max(2, Math.round(len / (3 * BAY.w)) + 1)
    for (let i = 0; i < n; i++) {
      const cx = x - len / 2 + 0.6 + ((len - 1.2) * i) / (n - 1)
      out.columns.push({ pos: [cx, 0, zFront - depth / 2], h: yAt(0.5) - 0.45 })
      // Cantilever beam along the slope, tapering off both sides of the column (Y / T frame).
      out.beams.push({ pos: [cx, yAt(0.5) - 0.32, zFront - depth / 2], size: [0.22, 0.4, (depth - 0.4) / Math.cos(a)], rotX: a })
    }
    for (const f of [0.12, 0.5, 0.88]) {
      out.beams.push({ pos: [x, yAt(f) - 0.2, zFront - f * depth], size: [len - 0.2, 0.16, 0.12], rotX: 0 })
    }
  }
  return res
}

/** Rows of parking canopies starting at depth `zStart` (towards −z), with bays, cars and lines. */
function carPark(p, size, budget, out, { zStart, centre }) {
  const len = p.bays * BAY.w
  const depth = p.doubleRow ? 2 * BAY.d + 0.4 : BAY.d + 0.4
  const pitch = depth + BAY.aisle
  const total = p.canopyRows * pitch - BAY.aisle
  // Front edge of the first (front-most) canopy; later rows step back towards −z, ending at zStart.
  const z0 = centre ? total / 2 : zStart + total
  let left = budget
  let rows = 0
  let cols = 0
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const start = out.panels.length
  for (let r = 0; r < p.canopyRows; r++) {
    const zFront = z0 - r * pitch
    const zc = zFront - depth / 2
    const res = canopy(out, size, left, { zFront, len, depth, clear: p.canopyClear, tilt: p.canopyTilt, rowBase: r * 100 })
    left -= res.panels.length
    rows += res.rows
    cols = Math.max(cols, res.cols)
    const sides = p.doubleRow ? [1, -1] : [1]
    for (const s of sides) {
      const zb = p.doubleRow ? zc + s * (BAY.d / 2 + 0.1) : zc
      for (let i = 0; i <= p.bays; i++) out.stripes.push({ x: -len / 2 + i * BAY.w, z: zb, w: 0.12, d: BAY.d - 0.3 })
      for (let i = 0; i < p.bays; i++) {
        if (rnd() < 0.28) continue // an empty bay here and there
        out.cars.push({ x: -len / 2 + (i + 0.5) * BAY.w, z: zb + s * 0.2, ry: s > 0 ? 0 : Math.PI, k: rnd() })
      }
    }
  }
  out.lot = { x0: -len / 2 - 3, x1: len / 2 + 3, z0: z0 - total - BAY.aisle / 2, z1: z0 + BAY.aisle / 2 }
  return { count: out.panels.length - start, rows, cols, len, depth, total, z0 }
}

/** Usable-area outline of a roof plane, lifted just above the roofing, for the setback overlay. */
function zoneOutline(pl, half, vFrom, vTo) {
  const lift = mul(pl.N, 0.06)
  const at = (u, v) => add(pl.E, mul(pl.U, u), mul(pl.V, v), lift)
  const h0 = Math.max(0, half(vFrom * Math.cos(pl.a)))
  const h1 = Math.max(0, half(vTo * Math.cos(pl.a)))
  return [at(-h0, vFrom), at(h0, vFrom), at(h1, vTo), at(-h1, vTo), at(-h0, vFrom)]
}

const flatZone = (L, W, e, y) => [[-L / 2 + e, y, -W / 2 + e], [L / 2 - e, y, -W / 2 + e], [L / 2 - e, y, W / 2 - e], [-L / 2 + e, y, W / 2 - e], [-L / 2 + e, y, -W / 2 + e]]

/** A rectangle outline, stair room and tank for a terrace that has not been surveyed yet. */
export function defaultTerrace(L = 14, W = 10) {
  return {
    outline: [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]],
    mumty: [-L / 2 + 1.8, -W / 2 + 1.6],
    tank: [-L / 2 + 4.2, -W / 2 + 1],
    neighbours: [],
    front: 'S',
  }
}

/**
 * Indian flat terrace of any outline: racks (usually elevated so the terrace stays usable) packed
 * inside the outline minus the edge setback, clear of the stair room (mumty) and water tank.
 */
function terrace(p, size, cap, out) {
  const t = p.terrace ?? defaultTerrace(p.length, p.width)
  const ring = t.outline
  const bb = bbox(ring)
  const H = p.floors * STOREY + 0.3
  const obstacles = []
  if (t.mumty) obstacles.push({ kind: 'housing', x: t.mumty[0], z: t.mumty[1], w: 2.6, d: 2.2, h: 2.6, y0: H })
  if (t.tank) obstacles.push({ kind: 'tank', x: t.tank[0], z: t.tank[1], w: 1.3, d: 1.3, h: 2.2, y0: H })
  out.obstacles = obstacles
  out.L = bb.x1 - bb.x0
  out.W = bb.z1 - bb.z0
  out.building = { kind: 'terrace', H, parapet: 0.9, ring, style: t.style ?? 'home', name: t.name ?? '' }
  out.neighbours = t.neighbours ?? []
  out.terrace = t
  const rects = obstacles.map((ob) => grown(ob, 0.6))
  out.keepouts = rects.map((r) => ({ ...r, y: H + 0.05 }))
  const outside = (x, z) => !inside([x, z], ring) || edgeDistance([x, z], ring) < p.edge - 1e-3
  const elevated = p.elevated ? 2.2 : RACK_CLEARANCE
  const rows = packRows(p, size, cap, {
    base: H, clearance: elevated, tilt: p.rackTilt,
    xSpan: out.L - 2 * p.edge, zFront: bb.z1 - p.edge, zBack: bb.z0 + p.edge,
  }, keepOut(rects, [outside]), rects)
  Object.assign(out, { panels: rows.panels, posts: rows.posts, rails: rows.rails })
  out.rowInfo = rows
  out.arrays.push({ name: 'Terrace racks', tilt: p.rackTilt, azimuth: norm360(p.azimuth), count: rows.panels.length, rows: rows.rows, cols: rows.cols })
  out.zones.push([...ring.map(([x, z]) => [x, H + 0.05, z]), [ring[0][0], H + 0.05, ring[0][1]]])
  out.surface = area(ring)
  out.plan = out.surface
  out.bounds = { x0: bb.x0 - 1, x1: bb.x1 + 1, z0: bb.z0 - 1, z1: bb.z1 + 1, h: H + 3 }
}

/** Plan rectangle of an obstacle grown by `clear` on every side. */
const grown = (o, clear) => ({ x0: o.x - o.w / 2 - clear, x1: o.x + o.w / 2 + clear, z0: o.z - o.d / 2 - clear, z1: o.z + o.d / 2 + clear })

// Where vents go along the main plane, as fractions of its half-length (spread, away from the middle).
const VENT_SPOTS = [0.86, -0.86, 0.62, -0.62]

/** Pitched houses: gable, mono-pitch, hip and L-shaped. */
function pitched(p, size, cap, out) {
  const a = p.pitch * RAD
  const tan = Math.tan(a)
  const H = p.floors * STOREY
  const o = OVERHANG
  const L = p.length
  const eaveY = H - o * tan
  const edgeHip = p.edge * SQRT2 // a setback square to a 45° hip line, measured along the eave
  // Hip roofs need width ≤ length; an L wing must sit inside the main wing.
  const W = p.site === 'hip' ? Math.min(p.width, L) : p.width
  const Ww = Math.min(p.wingWidth, W, L - 2)
  const Lw = p.wingLength
  const xw = L / 2 - Ww / 2 // wing centre line, flush with the right gable
  const mainRun = p.site === 'shed' ? W + 2 * o : W / 2 + o
  const ridgeY = p.site === 'shed' ? H + W * tan : H + (W / 2) * tan
  /** Roof height on the main front plane at plan depth z. */
  const roofY = (z) => eaveY + (W / 2 + o - z) * tan

  out.W = W
  out.building = { kind: p.site, H, pitch: p.pitch, eaveY, ridgeY, overhang: o, W, wing: p.site === 'lshape' ? { x: xw, w: Ww, l: Lw, ridgeY: H + (Ww / 2) * tan } : null }

  // ─── Obstacles on the main front plane ───
  const obstacles = []
  if (p.chimney) {
    // Chimneys usually rise near the ridge; vents sit high on the plane near the gables.
    const c = { kind: 'chimney', x: (p.chimneyX * L) / 2, z: p.site === 'shed' ? -W / 3 : W / 9, w: 0.7, d: 0.7 }
    c.y0 = roofY(c.z + c.d / 2) - 0.05
    c.h = roofY(c.z - c.d / 2) + 0.9 - c.y0
    obstacles.push(c)
  }
  for (let i = 0; i < p.vents; i++) {
    const v = { kind: 'vent', x: (VENT_SPOTS[i] * L) / 2, z: p.site === 'shed' ? -W / 3 : W / 12, w: 0.3, d: 0.3 }
    v.y0 = roofY(v.z) - 0.05
    v.h = 0.5
    obstacles.push(v)
  }
  out.obstacles = obstacles
  const rects = obstacles.map((ob) => grown(ob, ob.kind === 'chimney' ? 0.3 : 0.25))
  out.keepouts = rects.map((r, i) => ({ ...r, y: obstacles[i].y0 + 0.08 }))
  // L wing: its roof covers a triangle of the main front plane, bounded by the two valleys.
  const zones = []
  if (p.site === 'lshape') {
    zones.push((x, z) => Math.abs(x - xw) < Ww / 2 + o + VALLEY && z > W / 2 - Ww / 2 + Math.abs(x - xw) - VALLEY * SQRT2)
  }
  const blocked = keepOut(rects)
  const blockedMain = keepOut(rects, zones)

  // ─── Roof planes ───
  const planes = []
  const flatHalf = (h) => () => h
  const mainHalf = p.site === 'hip' ? (d) => L / 2 + o - d - edgeHip : flatHalf(L / 2 + o - p.edge)
  const front = { name: p.site === 'lshape' ? 'Main front plane' : 'Front roof plane', primary: true, az: p.azimuth,
    pl: plane({ E: [0, eaveY, W / 2 + o], U: [1, 0, 0], inward: [0, 0, -1], a, runH: mainRun }), half: mainHalf, blocked: blockedMain }
  if (p.site === 'shed') front.name = 'Roof plane'
  planes.push(front)
  if (p.site !== 'shed') {
    planes.push({ name: p.site === 'lshape' ? 'Main back plane' : 'Back roof plane', az: p.azimuth + 180,
      pl: plane({ E: [0, eaveY, -(W / 2 + o)], U: [-1, 0, 0], inward: [0, 0, 1], a, runH: W / 2 + o }), half: mainHalf })
  }
  if (p.site === 'hip') {
    const endHalf = (d) => W / 2 + o - d - edgeHip
    planes.push({ name: 'Right hip end', az: p.azimuth - 90,
      pl: plane({ E: [L / 2 + o, eaveY, 0], U: [0, 0, -1], inward: [-1, 0, 0], a, runH: W / 2 + o }), half: endHalf })
    planes.push({ name: 'Left hip end', az: p.azimuth + 90,
      pl: plane({ E: [-(L / 2 + o), eaveY, 0], U: [0, 0, 1], inward: [1, 0, 0], a, runH: W / 2 + o }), half: endHalf })
  }
  if (p.site === 'lshape') {
    // Wing planes run along z from just past the valley to the wing's far gable.
    const z0 = W / 2 + o + VALLEY
    const z1 = W / 2 + Lw + o - p.edge
    const mid = (z0 + z1) / 2
    const wHalf = flatHalf(Math.max(0, (z1 - z0) / 2))
    planes.push({ name: 'Wing right plane', az: p.azimuth - 90,
      pl: plane({ E: [xw + Ww / 2 + o, eaveY, mid], U: [0, 0, -1], inward: [-1, 0, 0], a, runH: Ww / 2 + o }), half: wHalf })
    planes.push({ name: 'Wing left plane', az: p.azimuth + 90,
      pl: plane({ E: [xw - Ww / 2 - o, eaveY, mid], U: [0, 0, 1], inward: [1, 0, 0], a, runH: Ww / 2 + o }), half: wHalf })
  }

  // Roof planes as shadow casters for the shading engine (L-shape: the wing roof can shade the
  // main plane near the valleys at low sun, and the main roof can shade the wing).
  if (p.site === 'lshape') {
    for (const f of planes) {
      const isWing = f.name.startsWith('Wing')
      const hu = isWing ? (W / 2 + Lw + o) / 2 : L / 2 + o
      const shift = isWing ? (W / 2 + Lw + o) / 2 - f.pl.E[2] : 0 // wing roof runs z = 0 … far gable
      const c = add(f.pl.E, mul(f.pl.V, f.pl.slope / 2), mul(f.pl.U, isWing ? shift * f.pl.U[2] : 0), mul(f.pl.N, -0.02))
      out.roofQuads.push({ c, n: f.pl.N, u: f.pl.U, v: f.pl.V, hu, hv: f.pl.slope / 2 })
    }
  }

  // Use the main plane, any plane within 95° of the equator, and the rest only when asked.
  // Fill the sunniest planes first so a capped system lands where it yields most.
  const used = planes
    .map((f) => ({ ...f, az: norm360(f.az), off: offEquator(f.az, p.lat) }))
    .filter((f) => f.primary || p.bothFaces || f.off <= 95)
    .sort((x, y) => x.off - y.off)
  let left = cap
  for (const f of used) {
    const vTo = f.pl.slope - p.ridge
    const res = packPlane(f.pl, { half: f.half, vFrom: p.edge, vTo }, size, left, f.blocked ?? blocked)
    out.zones.push(zoneOutline(f.pl, f.half, p.edge, vTo))
    // A side plane that only takes a module or three is not worth its own string / MPPT.
    if (!f.primary && res.panels.length > 0 && res.panels.length < MIN_ARRAY) {
      out.notes.push(`${f.name}: only ${res.panels.length} module${res.panels.length > 1 ? 's' : ''} fit — skipped (under ${MIN_ARRAY}).`)
      res.panels = []
    }
    left -= res.panels.length
    out.panels.push(...res.panels)
    out.arrays.push({ name: f.name, tilt: p.pitch, azimuth: f.az, count: res.panels.length, rows: res.rows, cols: res.cols })
  }

  out.plan = (L + 2 * o) * (W + 2 * o) + (p.site === 'lshape' ? (Ww + 2 * o) * (Lw + o) : 0)
  out.surface = out.plan / Math.cos(a)
  if (p.site === 'hip' && p.width > L) out.notes.push('A hip roof needs width ≤ length — width capped to the length.')
  if (p.site === 'lshape' && Ww < p.wingWidth) out.notes.push('Wing width capped to fit the main wing.')
  if (p.ridge < 0.45) out.notes.push('Ridge setback under 0.45 m (18″) — most fire codes ask for at least that.')
  if (p.pitch > 45) out.notes.push('Very steep roof: installation needs extra fall protection and rail spans.')
}

export function computeLayout(input) {
  const p = siteInputs(input)
  const size = moduleSize(p)
  const { m } = size
  const cap = p.target > 0 ? Math.ceil((p.target * 1000) / m.watt) : Infinity
  const L = p.length
  const W = p.width
  const out = { site: p.site, L, W, module: { du: size.du, dv: size.dv }, roofQuads: [], panels: [], posts: [], rails: [], arrays: [], notes: [], obstacles: [], rowInfo: null,
    decks: [], columns: [], beams: [], cars: [], stripes: [], lot: null, facts: [], zones: [], keepouts: [] }

  if (p.site === 'flat') {
    const H = p.floors * STOREY + 0.3
    // Stair / lift housing in the back-left corner, plus rooftop HVAC units along the back half.
    const obstacles = [{ kind: 'housing', x: -L / 2 + 1.6, z: -W / 2 + 1.4, w: 2.4, d: 2, h: 2.6, y0: H }]
    for (let i = 0; i < p.vents; i++) {
      obstacles.push({ kind: 'hvac', x: -L / 2 + (L * (i + 1.5)) / (p.vents + 1.5), z: -W / 6, w: 1.8, d: 1.2, h: 1.2, y0: H })
    }
    out.obstacles = obstacles
    out.building = { kind: 'flat', H, parapet: 0.6 }
    const rects = obstacles.map((ob) => grown(ob, 0.6))
    out.keepouts = rects.map((r) => ({ ...r, y: H + 0.05 }))
    out.zones.push(flatZone(L, W, p.edge, H + 0.05))
    const rows = packRows(p, size, cap, {
      base: H, clearance: RACK_CLEARANCE, tilt: p.rackTilt,
      xSpan: L - 2 * p.edge, zFront: W / 2 - p.edge, zBack: -W / 2 + p.edge,
    }, keepOut(rects), rects)
    Object.assign(out, { panels: rows.panels, posts: rows.posts, rails: rows.rails })
    out.rowInfo = rows
    out.arrays.push({ name: 'Roof racks', tilt: p.rackTilt, azimuth: norm360(p.azimuth), count: rows.panels.length, rows: rows.rows, cols: rows.cols })
    out.surface = L * W
    out.plan = L * W
    if (p.edge < 1.2) out.notes.push('Commercial roofs usually keep a 1.2 m (4 ft) perimeter pathway clear.')
  } else if (p.site === 'terrace') {
    terrace(p, size, cap, out)
  } else if (p.site === 'carport') {
    out.building = { kind: 'carport' }
    const res = carPark(p, size, cap, out, { centre: true })
    out.arrays.push({ name: 'Parking canopies', tilt: p.canopyTilt, azimuth: norm360(p.azimuth), count: res.count, rows: res.rows, cols: res.cols })
    out.plan = res.len * res.depth * p.canopyRows
    out.surface = out.plan / Math.cos(p.canopyTilt * RAD)
    const cars = p.bays * p.canopyRows * (p.doubleRow ? 2 : 1)
    out.facts = [`${cars} parking bays shaded`, `${fmt1(p.canopyClear)} m clear height`]
    if (p.canopyClear < 2.6) out.notes.push('Under 2.6 m clear height: SUVs and vans will not fit — 2.7–3 m is usual, 4.5 m+ for fire trucks.')
  } else if (p.site === 'busstop') {
    out.building = { kind: 'busstop', shelters: [] }
    const gap = 4
    const total = p.shelters * L + (p.shelters - 1) * gap
    let left = cap
    let rows = 0
    let cols = 0
    for (let i = 0; i < p.shelters; i++) {
      const x = -total / 2 + L / 2 + i * (L + gap)
      out.building.shelters.push({ x, len: L, depth: W, clear: p.canopyClear })
      const res = canopy(out, size, left, { x, zFront: W / 2, len: L, depth: W, clear: p.canopyClear, tilt: p.canopyTilt, columns: false, rowBase: i * 100 })
      left -= res.panels.length
      rows = Math.max(rows, res.rows)
      cols = Math.max(cols, res.cols)
    }
    out.arrays.push({ name: 'Shelter roofs', tilt: p.canopyTilt, azimuth: norm360(p.azimuth), count: out.panels.length, rows, cols })
    out.plan = p.shelters * L * W
    out.surface = out.plan / Math.cos(p.canopyTilt * RAD)
    out.L = total
    out.facts = ['Powers lighting, e-ink timetables, USB / CCTV; surplus to grid or battery']
  } else if (p.site === 'airport') {
    // Terminals use tall storeys; the roof carries low-tilt racks, the forecourt car park carries canopies.
    const H = p.floors * 4.5 + 0.5
    const obstacles = []
    for (let i = 0; i < p.vents; i++) {
      obstacles.push({ kind: 'hvac', x: -L / 2 + (L * (i + 1)) / (p.vents + 1), z: (i % 2 ? 1 : -1) * W / 5, w: 4, d: 2.5, h: 2, y0: H })
    }
    // A skylight strip along the spine stays clear.
    obstacles.push({ kind: 'skylight', x: 0, z: 0, w: L * 0.7, d: 3, h: 0.6, y0: H })
    out.obstacles = obstacles
    out.building = { kind: 'airport', H, parapet: 1 }
    const rects = obstacles.map((ob) => grown(ob, 1))
    out.keepouts = rects.map((r) => ({ ...r, y: H + 0.05 }))
    out.zones.push(flatZone(L, W, p.edge, H + 0.05))
    const rows = packRows(p, size, cap, {
      base: H, clearance: RACK_CLEARANCE, tilt: p.rackTilt,
      xSpan: L - 2 * p.edge, zFront: W / 2 - p.edge, zBack: -W / 2 + p.edge,
    }, keepOut(rects), rects)
    out.panels.push(...rows.panels)
    out.posts.push(...rows.posts)
    out.rails.push(...rows.rails)
    out.rowInfo = rows
    out.arrays.push({ name: 'Terminal roof racks', tilt: p.rackTilt, azimuth: norm360(p.azimuth), count: rows.panels.length, rows: rows.rows, cols: rows.cols })
    const park = carPark(p, size, cap - rows.panels.length, out, { zStart: W / 2 + 34 })
    out.arrays.push({ name: 'Parking canopies', tilt: p.canopyTilt, azimuth: norm360(p.azimuth), count: park.count, rows: park.rows, cols: park.cols })
    out.plan = L * W + park.len * park.depth * p.canopyRows
    out.surface = out.plan
    out.forecourt = W / 2 + 34
    const cars = p.bays * p.canopyRows * (p.doubleRow ? 2 : 1)
    out.facts = [`${cars} parking bays under canopies`, 'Cochin (CIAL) runs ~50 MW of solar incl. a 5 MW carport']
  } else if (p.site === 'ground') {
    out.building = { kind: 'ground' }
    out.zones.push(flatZone(L, W, p.edge, 0.06))
    const rows = packRows(p, size, cap, {
      base: 0, clearance: p.clearance, tilt: p.groundTilt,
      xSpan: L - 2 * p.edge, zFront: W / 2 - p.edge, zBack: -W / 2 + p.edge,
    }, keepOut([]), [])
    Object.assign(out, { panels: rows.panels, posts: rows.posts, rails: rows.rails })
    out.rowInfo = rows
    out.arrays.push({ name: 'Ground tables', tilt: p.groundTilt, azimuth: norm360(p.azimuth), count: rows.panels.length, rows: rows.rows, cols: rows.cols })
    out.surface = L * W
    out.plan = L * W
  } else {
    pitched(p, size, cap, out)
  }

  assignKeys(out)
  out.watt = m.watt
  out.kg = m.kg
  out.moduleM2 = m.w * m.h
  out.load = 0
  return totals(out, p, cap)
}

/**
 * Stable ids for click-to-install: array index, row, column position along the row (cm) and
 * stack slot. `col` is the module's position along its own row axis, so columns line up across rows.
 */
function assignKeys(out) {
  let i = 0
  out.arrays.forEach((a, k) => {
    for (let j = 0; j < a.count; j++, i++) {
      const p = out.panels[i]
      p.arr = k
      p.col = Math.round((p.pos[0] * p.U[0] + p.pos[1] * p.U[1] + p.pos[2] * p.U[2]) * 100) / 100
      p.key = `${k}|${p.row ?? 0}|${Math.round(p.col * 100)}|${p.stack ?? 0}`
    }
  })
}

/** Totals and notes that depend on which modules are in the design. */
function totals(out, p, cap, manual = false) {
  const m = { watt: out.watt, kg: out.kg, w: 1, h: out.moduleM2 }
  const count = out.panels.length
  out.count = count
  out.kwp = (count * m.watt) / 1000
  out.moduleArea = count * m.w * m.h
  out.coverage = out.surface ? out.moduleArea / out.surface : 0
  // Dead load on the roof: modules plus ~3 kg/m² of rails and clamps (ballast not included).
  out.load = ['ground', 'carport', 'busstop'].includes(p.site) || !count ? 0 : (count * m.kg + out.moduleArea * 3) / out.moduleArea
  if (!count) out.notes.unshift(manual ? 'Nothing installed yet — click a glowing area in the 3D view to install modules there.' : 'No module fits — shrink the setbacks, switch orientation or enlarge the area.')
  if (p.target > 0 && count < cap) out.notes.unshift(`Only ${count} of the ${cap} modules for ${p.target} kWp fit here.`)
  if (offEquator(p.azimuth, p.lat) > 60) out.notes.push('The main array faces well away from the equator — expect a clear drop in yield.')
  out.bounds = out.bounds ?? bounds(p, out)
  return out
}

/**
 * Keep only the modules the user installed (click-to-install mode), by key. Arrays stay in place
 * with their installed count, so letters and indices match the full candidate layout. Racking
 * rows without a single module are dropped too.
 */
export function selectModules(full, sel, p) {
  const out = { ...full, notes: full.notes.filter((n) => !/^(Only |No module|Nothing installed|The main array faces)/.test(n)) }
  out.panels = full.panels.filter((m) => sel[m.key])
  const counts = new Array(full.arrays.length).fill(0)
  for (const m of out.panels) counts[m.arr]++
  out.arrays = full.arrays.map((a, k) => ({ ...a, count: counts[k], candidate: a.count }))
  if (full.rowInfo) {
    const rows = new Set(out.panels.filter((m) => m.arr === 0).map((m) => m.row))
    out.posts = full.posts.filter((x) => rows.has(x.row))
    out.rails = full.rails.filter((x) => rows.has(x.row))
  }
  return totals(out, p, Infinity, true)
}

/** Plan box of everything built, for camera framing, shadows and context placement. */
function bounds(p, out) {
  const o = OVERHANG
  const b = { x0: -out.L / 2 - o, x1: out.L / 2 + o, z0: -out.W / 2 - o, z1: out.W / 2 + o, h: out.building.H ?? 3 }
  if (p.site === 'lshape') b.z1 = out.W / 2 + p.wingLength + o
  if (out.building.ridgeY) b.h = out.building.ridgeY
  if (p.site === 'busstop') Object.assign(b, { z1: out.W / 2 + 5, h: p.canopyClear + 0.5 })
  if (out.lot) {
    b.x0 = Math.min(p.site === 'carport' ? Infinity : b.x0, out.lot.x0)
    b.x1 = Math.max(p.site === 'carport' ? -Infinity : b.x1, out.lot.x1)
    b.z0 = Math.min(p.site === 'carport' ? Infinity : b.z0, out.lot.z0)
    b.z1 = Math.max(p.site === 'carport' ? -Infinity : b.z1, out.lot.z1)
    if (p.site === 'carport') b.h = p.canopyClear + 1
  }
  return b
}
