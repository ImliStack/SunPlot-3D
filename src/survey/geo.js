// Small plane-geometry helpers for the site survey. Local frame = metres around an origin,
// +x east, +z south (the site frame SunPlot builds in when the array faces south).

const M_PER_DEG_LAT = 110540

export const mPerDegLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)

/** [lon, lat] → [x, z] metres around origin [lon0, lat0]. */
export const toLocal = ([lon, lat], [lon0, lat0]) => [(lon - lon0) * mPerDegLon(lat0), -(lat - lat0) * M_PER_DEG_LAT]

/** [x, z] metres → [lon, lat]. */
export const toLngLat = ([x, z], [lon0, lat0]) => [lon0 + x / mPerDegLon(lat0), lat0 - z / M_PER_DEG_LAT]

/** Open ring (no repeated first point). */
export const openRing = (ring) => {
  const r = ring.slice()
  const a = r[0]
  const b = r[r.length - 1]
  if (r.length > 1 && a[0] === b[0] && a[1] === b[1]) r.pop()
  return r
}

export function area(ring) {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

export function centroid(ring) {
  let x = 0
  let y = 0
  for (const p of ring) {
    x += p[0]
    y += p[1]
  }
  return [x / ring.length, y / ring.length]
}

export function bbox(ring) {
  const xs = ring.map((p) => p[0])
  const ys = ring.map((p) => p[1])
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...ys), z1: Math.max(...ys) }
}

export function inside([x, y], ring) {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** Distance from a point to the ring's edges. */
export function edgeDistance([x, y], ring) {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    const dx = x2 - x1
    const dy = y2 - y1
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)))
  }
  return best
}

/** Bearing (0 = N, 90 = E) from a to b, both [lon, lat]. */
export function bearing(a, b) {
  const dx = (b[0] - a[0]) * mPerDegLon(a[1])
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
}
