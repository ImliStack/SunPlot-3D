// Building outlines around a point from OpenStreetMap (Overpass API, mirrors in turn).
// Free, no key; coverage in Indian cities is good for outlines, patchy for heights.

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const LEVEL_M = 3.2

/** Height in metres from OSM tags, or null when unknown. */
function heightOf(tags) {
  const h = parseFloat(tags.height)
  if (Number.isFinite(h) && h > 0) return h
  const lv = parseFloat(tags['building:levels'])
  if (Number.isFinite(lv) && lv > 0) return lv * LEVEL_M
  return null
}

/**
 * Buildings within `radius` metres: [{ id, ring: [[lon, lat]…], levels, height, tags }].
 * Throws when every mirror fails (the caller offers drawing instead).
 */
export async function fetchBuildings(lat, lon, radius = 180, signal) {
  const dLat = radius / 110540
  const dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180))
  const bb = [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((v) => v.toFixed(6)).join(',')
  const q = `[out:json][timeout:15];way["building"](${bb});out tags geom 400;`
  let last
  for (const base of MIRRORS) {
    const ctrl = new AbortController()
    const stop = () => ctrl.abort()
    signal?.addEventListener('abort', stop)
    const timer = setTimeout(stop, 12000)
    try {
      const res = await fetch(`${base}?data=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`Overpass ${res.status}`)
      const json = await res.json()
      return json.elements
        .filter((e) => e.geometry?.length >= 4)
        .map((e) => {
          const tags = e.tags ?? {}
          const lv = parseFloat(tags['building:levels'])
          return {
            id: `way/${e.id}`,
            ring: e.geometry.map((g) => [g.lon, g.lat]),
            levels: Number.isFinite(lv) ? lv : null,
            height: heightOf(tags),
            tags,
          }
        })
    } catch (err) {
      if (signal?.aborted) throw err
      last = err
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', stop)
    }
  }
  throw new Error(last?.name === 'AbortError' ? 'map servers are busy (timed out)' : last?.message ?? 'map servers are busy')
}
