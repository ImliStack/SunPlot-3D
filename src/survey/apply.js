import { toLocal, bbox, centroid, openRing } from './geo.js'
import { equatorAzimuth } from '../presets.js'

const LEVEL_M = 3.2

/**
 * Turn the survey (in [lon, lat]) into SunPlot inputs: a `terrace` in site metres centred on the
 * roof's bounding box, neighbours within 60 m as shade blocks, and the place.
 */
export function surveyToParams(sv) {
  if (!sv.ring) return null
  const ring = openRing(sv.ring)
  const ll = bbox(ring)
  const origin = [(ll.x0 + ll.x1) / 2, (ll.z0 + ll.z1) / 2] // [lon, lat] of the bbox centre
  const loc = (p) => toLocal(p, origin)
  const outline = ring.map(loc)
  const neighbours = []
  // Overture neighbours picked up on the map, then any OSM buildings loaded for the area.
  for (const b of [...(sv.neighbours ?? []), ...sv.buildings]) {
    if (b.ring === sv.ring) continue
    const r = openRing(b.ring).map(loc)
    const [cx, cz] = centroid(r)
    if (Math.hypot(cx, cz) > 60 || Math.hypot(cx, cz) < 1) continue
    neighbours.push({ ring: r, h: b.height ?? (b.levels ?? 2) * LEVEL_M })
  }
  const lat = origin[1]
  return {
    site: 'terrace',
    lat: Math.round(lat * 1000) / 1000,
    lon: Math.round(origin[0] * 1000) / 1000,
    placeName: sv.address || 'Surveyed site',
    place: '',
    azimuth: equatorAzimuth(lat),
    ...(sv.levels ? { floors: Math.max(1, Math.round(sv.levels)) } : {}),
    terrace: {
      outline,
      mumty: sv.mumty ? loc(sv.mumty) : null,
      tank: sv.tank ? loc(sv.tank) : null,
      neighbours,
      front: sv.front,
      origin,
    },
  }
}
