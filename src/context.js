// Site context shared by the 3D scene and the shading engine, so what you see is what casts shade.
// Everything here is in the site frame (the frame `layout.js` builds in).

/** Radius from the site origin that holds everything built. */
export function siteRadius(layout) {
  const b = layout.bounds
  return Math.max(6, Math.hypot(Math.max(-b.x0, b.x1), Math.max(-b.z0, b.z1)) + 1)
}

// Seeded so the same site always gets the same trees.
function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
}

/**
 * Trees around the site: { x, z, h, k, r }. `k > 0.4` is a broadleaf, otherwise a conifer.
 * The yard in front of the array (+z) is kept open — that is where the cameras stand.
 * `far`: context trees round the site; `close`: mature trees right next to it (shade study).
 */
export function treesFor(R, { far = true, close = false } = {}) {
  const rnd = rng(42)
  const out = []
  if (close) {
    const nearRnd = rng(7) // own seed, so the far trees stay put when this is toggled
    // A few mature trees near the site, east, south-east, south-west and west — typical shade culprits.
    const near = [[-25, 1.0], [-60, 1.15], [-120, 1.1], [-160, 1.0], [0, 1.05], [180, 1.0]]
    for (const [deg, k] of near) {
      const a = (-deg * Math.PI) / 180 // bearing measured from +x towards +z (the array side)
      const d = R + 2.5 + nearRnd() * 3
      out.push({ x: Math.cos(a) * d * k, z: Math.sin(a) * d * k, h: 8 + nearRnd() * 5, k: 0.5 + nearRnd() * 0.5, r: nearRnd() })
    }
  }
  if (!far) return out
  const n = 14 + Math.round(R)
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2
    const d = R + 5 + rnd() * (R * 1.6 + 14)
    if (Math.sin(a) > -0.2 && d < R * 2.5 + 20) continue
    out.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h: 5 + rnd() * 6, k: rnd(), r: rnd() })
  }
  return out
}

/** Crown shapes as spheres for ray casting: one big crown for a broadleaf, two for a conifer. */
export function treeSpheres(t) {
  if (t.k > 0.4) {
    const c = t.h * 0.26
    return [{ c: [t.x, t.h * 0.63, t.z], r: c * 1.25 }]
  }
  return [
    { c: [t.x, t.h * 0.45, t.z], r: t.h * 0.22 },
    { c: [t.x, t.h * 0.75, t.z], r: t.h * 0.13 },
  ]
}
