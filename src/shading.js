// Shading engine: casts a ray from every module centre towards the sun, for each month's mid-day
// sun path, against other modules, roof planes, obstacles, parapets and trees. Pure data in,
// pure data out, so it runs in a Web Worker.
//
// Only beam (direct) light is blocked here; diffuse sky light is treated as unshaded. Each
// module is judged by its centre point — a fair proxy for strings with bypass diodes, slightly
// optimistic for long rows shaded along their bottom edge.

import { sunPosition, clearSky } from './solar.js'
import { treeSpheres } from './context.js'

const RAD = Math.PI / 180
const MID = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349] // mid-month day of year
const STEP = 0.5 // hours between sun samples

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/**
 * Everything that can cast a shadow, as plain data:
 * quads (modules, roof planes) { c, n, u, v, hu, hv }, boxes { min, max }, spheres { c, r },
 * plus the sample points (module centres) and which array each belongs to.
 */
export function buildScene(layout, { trees = [], depth = 0.035, azimuth = 180 } = {}) {
  const quads = []
  const points = []
  const { du, dv } = layout.module
  let a = 0
  let left = layout.arrays[0]?.count ?? 0
  layout.panels.forEach((p, i) => {
    while (left === 0 && a < layout.arrays.length - 1) left = layout.arrays[++a].count
    left--
    const n = p.N
    const c = [p.pos[0] + n[0] * depth, p.pos[1] + n[1] * depth, p.pos[2] + n[2] * depth]
    const u = p.U
    const v = norm(cross(n, u))
    quads.push({ c, n, u, v, hu: du / 2, hv: dv / 2, self: i })
    points.push({ c, n, array: a })
  })
  for (const r of layout.roofQuads ?? []) quads.push({ ...r, self: -1 })

  const boxes = []
  const box = (x0, y0, z0, x1, y1, z1) => boxes.push({ min: [x0, y0, z0], max: [x1, y1, z1] })
  for (const o of layout.obstacles) box(o.x - o.w / 2, o.y0, o.z - o.d / 2, o.x + o.w / 2, o.y0 + o.h, o.z + o.d / 2)
  const b = layout.building
  if (b.kind === 'terrace') {
    // Parapet along each outline edge, and neighbouring buildings as boxes (their bounding boxes).
    const r = b.ring
    for (let i = 0; i < r.length; i++) {
      const [x1, z1] = r[i]
      const [x2, z2] = r[(i + 1) % r.length]
      // 1 m pieces, so a diagonal wall doesn't become one big box over the roof.
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1)))
      for (let k = 0; k < n; k++) {
        const ax = x1 + ((x2 - x1) * k) / n
        const az = z1 + ((z2 - z1) * k) / n
        const bx = x1 + ((x2 - x1) * (k + 1)) / n
        const bz = z1 + ((z2 - z1) * (k + 1)) / n
        box(Math.min(ax, bx) - 0.1, b.H, Math.min(az, bz) - 0.1, Math.max(ax, bx) + 0.1, b.H + b.parapet, Math.max(az, bz) + 0.1)
      }
    }
    for (const n of layout.neighbours ?? []) {
      const xs = n.ring.map((q) => q[0])
      const zs = n.ring.map((q) => q[1])
      box(Math.min(...xs), 0, Math.min(...zs), Math.max(...xs), n.h, Math.max(...zs))
    }
  } else if (b.parapet) {
    const { L, W } = layout
    const t = 0.3
    const top = b.H + b.parapet
    box(-L / 2, b.H, W / 2 - t, L / 2, top, W / 2)
    box(-L / 2, b.H, -W / 2, L / 2, top, -W / 2 + t)
    box(L / 2 - t, b.H, -W / 2, L / 2, top, W / 2)
    box(-L / 2, b.H, -W / 2, -L / 2 + t, top, W / 2)
  }
  if (b.kind === 'airport') box(-layout.L / 2, 0, -layout.W / 2, layout.L / 2, b.H, layout.W / 2)
  if (b.kind === 'busstop' && b.shelters?.length) {
    // The parked bus, as drawn in the scene.
    const x = b.shelters[0].x
    const z = layout.W / 2 + 4.3
    box(x - 6, 0.35, z - 1.3, x + 6, 3.3, z + 1.3)
  }
  const spheres = trees.flatMap(treeSpheres)
  return { quads, boxes, spheres, points, arrays: layout.arrays.length, ry: (180 - azimuth) * RAD }
}

/** Uniform plan grid over every primitive, so each ray only tests what lies under its path. */
function buildGrid(scene) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = -Infinity
  const items = []
  const add = (kind, i, minX, maxX, minZ, maxZ, maxY) => {
    items.push({ kind, i, minX, maxX, minZ, maxZ })
    x0 = Math.min(x0, minX); x1 = Math.max(x1, maxX)
    z0 = Math.min(z0, minZ); z1 = Math.max(z1, maxZ)
    top = Math.max(top, maxY)
  }
  scene.quads.forEach((q, i) => {
    // Plan extent of a rotated rectangle: |u|·hu + |v|·hv per axis.
    const ex = Math.abs(q.u[0]) * q.hu + Math.abs(q.v[0]) * q.hv
    const ez = Math.abs(q.u[2]) * q.hu + Math.abs(q.v[2]) * q.hv
    const ey = Math.abs(q.u[1]) * q.hu + Math.abs(q.v[1]) * q.hv
    add(0, i, q.c[0] - ex, q.c[0] + ex, q.c[2] - ez, q.c[2] + ez, q.c[1] + ey)
  })
  scene.boxes.forEach((b, i) => add(1, i, b.min[0], b.max[0], b.min[2], b.max[2], b.max[1]))
  scene.spheres.forEach((s, i) => add(2, i, s.c[0] - s.r, s.c[0] + s.r, s.c[2] - s.r, s.c[2] + s.r, s.c[1] + s.r))
  const span = Math.max(x1 - x0, z1 - z0, 1)
  const size = Math.max(1.5, span / 120)
  const nx = Math.max(1, Math.ceil((x1 - x0) / size))
  const nz = Math.max(1, Math.ceil((z1 - z0) / size))
  const cells = Array.from({ length: nx * nz }, () => [])
  for (const it of items) {
    const ix0 = Math.max(0, Math.floor((it.minX - x0) / size))
    const ix1 = Math.min(nx - 1, Math.floor((it.maxX - x0) / size))
    const iz0 = Math.max(0, Math.floor((it.minZ - z0) / size))
    const iz1 = Math.min(nz - 1, Math.floor((it.maxZ - z0) / size))
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) cells[iz * nx + ix].push(it)
  }
  return { x0, z0, size, nx, nz, cells, top, count: items.length }
}

function hitQuad(q, P, d) {
  const den = dot(d, q.n)
  if (Math.abs(den) < 1e-6) return false
  const t = dot(sub(q.c, P), q.n) / den
  if (t <= 1e-3) return false
  const H = [P[0] + d[0] * t - q.c[0], P[1] + d[1] * t - q.c[1], P[2] + d[2] * t - q.c[2]]
  return Math.abs(dot(H, q.u)) <= q.hu && Math.abs(dot(H, q.v)) <= q.hv
}

function hitBox(b, P, d) {
  let tmin = 1e-3
  let tmax = Infinity
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      if (P[k] < b.min[k] || P[k] > b.max[k]) return false
      continue
    }
    let t1 = (b.min[k] - P[k]) / d[k]
    let t2 = (b.max[k] - P[k]) / d[k]
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return false
  }
  return true
}

function hitSphere(s, P, d) {
  const o = sub(P, s.c)
  const bq = dot(o, d)
  const c = dot(o, o) - s.r * s.r
  const disc = bq * bq - c
  if (disc < 0) return false
  return -bq + Math.sqrt(disc) > 1e-3
}

/** March the ray through the plan grid until it climbs above everything. */
function blocked(scene, grid, stamp, rayId, self, P, d) {
  if (d[1] <= 0) return true
  const tMax = (grid.top - P[1]) / d[1]
  if (tMax <= 0) return false
  const hl = Math.hypot(d[0], d[2])
  const dt = hl > 1e-6 ? (grid.size * 0.5) / hl : tMax
  for (let t = 0; t <= tMax + dt; t += dt) {
    const ix = Math.floor((P[0] + d[0] * t - grid.x0) / grid.size)
    const iz = Math.floor((P[2] + d[2] * t - grid.z0) / grid.size)
    if (ix < 0 || iz < 0 || ix >= grid.nx || iz >= grid.nz) {
      if (hl > 1e-6) {
        // Outside the grid and heading away from it: nothing more can be hit.
        const outX = (ix < 0 && d[0] <= 0) || (ix >= grid.nx && d[0] >= 0)
        const outZ = (iz < 0 && d[2] <= 0) || (iz >= grid.nz && d[2] >= 0)
        if (outX || outZ) return false
      }
      continue
    }
    for (const it of grid.cells[iz * grid.nx + ix]) {
      const key = it.kind * 1e7 + it.i
      if (stamp.get(key) === rayId) continue
      stamp.set(key, rayId)
      if (it.kind === 0) {
        if (it.i === self) continue
        if (hitQuad(scene.quads[it.i], P, d)) return true
      } else if (it.kind === 1) {
        if (hitBox(scene.boxes[it.i], P, d)) return true
      } else if (hitSphere(scene.spheres[it.i], P, d)) return true
    }
  }
  return false
}

/**
 * Monthly beam-shading fraction per array (0 = never shaded, 1 = beam fully blocked) and the
 * annual fraction per module, weighted by how much beam each sun position delivers to the module.
 */
export function computeShading(scene, lat, onProgress) {
  const grid = buildGrid(scene)
  const stamp = new Map()
  let rayId = 0
  const cr = Math.cos(scene.ry)
  const sr = Math.sin(scene.ry)
  // Sun samples in the site frame, with their beam strength.
  const suns = MID.map((day) => {
    const list = []
    for (let h = 4; h <= 20; h += STEP) {
      const { alt, az } = sunPosition(lat, day, h)
      if (alt < 2 * RAD) continue
      const w = [Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)]
      // World → site frame: undo the site's rotation about y.
      const d = [w[0] * cr - w[2] * sr, w[1], w[0] * sr + w[2] * cr]
      list.push({ d, dni: clearSky(day, Math.sin(alt)).dni })
    }
    return list
  })
  const A = scene.arrays
  const lost = Array.from({ length: A }, () => new Array(12).fill(0))
  const total = Array.from({ length: A }, () => new Array(12).fill(0))
  const module = new Float32Array(scene.points.length)
  scene.points.forEach((pt, i) => {
    const P = [pt.c[0] + pt.n[0] * 0.03, pt.c[1] + pt.n[1] * 0.03, pt.c[2] + pt.n[2] * 0.03]
    let mLost = 0
    let mTotal = 0
    suns.forEach((list, m) => {
      for (const s of list) {
        const w = s.dni * Math.max(0, dot(pt.n, s.d))
        if (w <= 0) continue
        total[pt.array][m] += w
        mTotal += w
        if (blocked(scene, grid, stamp, ++rayId, i, P, s.d)) {
          lost[pt.array][m] += w
          mLost += w
        }
      }
    })
    module[i] = mTotal ? mLost / mTotal : 0
    if (onProgress && i % 200 === 0) onProgress(i / scene.points.length)
  })
  return {
    perArray: lost.map((row, a) => row.map((v, m) => (total[a][m] ? v / total[a][m] : 0))),
    perModule: module,
    rays: rayId,
  }
}
