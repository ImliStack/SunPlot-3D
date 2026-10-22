// Real solar installations: a curated list of landmark projects (India and abroad), plus a live
// OpenStreetMap lookup of solar plants near the chosen location (Overpass API, mirrors in turn).
// Capacities are as publicly reported; coordinates are approximate site centres.

export const LANDMARKS = [
  { name: 'Bhadla Solar Park', where: 'Rajasthan, India', lat: 27.54, lon: 71.92, mw: 2245, kind: 'Utility, ground', year: 2020, site: 'ground' },
  { name: 'Pavagada Solar Park', where: 'Karnataka, India', lat: 14.25, lon: 77.45, mw: 2050, kind: 'Utility, ground', year: 2019, site: 'ground' },
  { name: 'Kurnool Ultra Mega Solar Park', where: 'Andhra Pradesh, India', lat: 15.68, lon: 78.28, mw: 1000, kind: 'Utility, ground', year: 2017, site: 'ground' },
  { name: 'Rewa Ultra Mega Solar', where: 'Madhya Pradesh, India', lat: 24.53, lon: 81.3, mw: 750, kind: 'Utility, ground', year: 2018, site: 'ground' },
  { name: 'Kamuthi Solar Power Project', where: 'Tamil Nadu, India', lat: 9.35, lon: 78.39, mw: 648, kind: 'Utility, ground', year: 2016, site: 'ground' },
  { name: 'Cochin International Airport (CIAL)', where: 'Kerala, India', lat: 10.15, lon: 76.4, mw: 50, kind: 'Airport: ground + carport', year: 2015, site: 'airport',
    note: 'First airport to run fully on solar; includes a ~5 MW carport.' },
  { name: 'Noor Abu Dhabi', where: 'Sweihan, UAE', lat: 24.47, lon: 55.33, mw: 1177, kind: 'Utility, ground', year: 2019, site: 'ground' },
  { name: 'Mohammed bin Rashid Al Maktoum Solar Park', where: 'Dubai, UAE', lat: 24.75, lon: 55.36, mw: 3000, kind: 'Utility, multi-phase', year: 2013, site: 'ground' },
  { name: 'Benban Solar Park', where: 'Aswan, Egypt', lat: 24.45, lon: 32.73, mw: 1650, kind: 'Utility, ground', year: 2019, site: 'ground' },
  { name: 'Solar Star', where: 'California, USA', lat: 34.83, lon: -118.4, mw: 579, kind: 'Utility, single-axis', year: 2015, site: 'ground' },
  { name: 'Cestas Solar Farm', where: 'Gironde, France', lat: 44.74, lon: -0.79, mw: 300, kind: 'Utility, ground', year: 2015, site: 'ground' },
  { name: 'Deer Park Station solar shelters', where: 'Melbourne, Australia', lat: -37.77, lon: 144.77, mw: 0.065, kind: 'Bus / rail shelters', year: 2019, site: 'busstop',
    note: 'Two shelters over 65 m long, roofs made of modules.' },
]

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const toRad = (d) => (d * Math.PI) / 180
export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/** "2245 MW", "50 MWp", "800 kW" → MW (null when absent or unreadable). */
function parseMw(raw) {
  if (!raw) return null
  const m = String(raw).replace(',', '.').match(/([\d.]+)\s*(gw|mw|kw|w)?/i)
  if (!m) return null
  const v = parseFloat(m[1])
  const unit = (m[2] || 'mw').toLowerCase()
  return unit === 'gw' ? v * 1000 : unit === 'kw' ? v / 1000 : unit === 'w' ? v / 1e6 : v
}

const memory = new Map()

/** Solar plants mapped in OpenStreetMap within `radiusKm`, biggest first. */
export async function fetchNearby(lat, lon, radiusKm = 80, signal) {
  const key = `${lat.toFixed(1)},${lon.toFixed(1)},${radiusKm}`
  if (memory.has(key)) return memory.get(key)
  // A bounding box is far cheaper for Overpass than an `around` circle; trim to the circle after.
  const dLat = radiusKm / 111
  const dLon = radiusKm / (111 * Math.max(0.2, Math.cos(toRad(lat))))
  const bbox = [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((v) => v.toFixed(3)).join(',')
  const q = `[out:json][timeout:15];nwr["power"="plant"]["plant:source"="solar"](${bbox});out center tags 150;`
  let lastError
  for (const base of MIRRORS) {
    const ctrl = new AbortController()
    const stop = () => ctrl.abort()
    signal?.addEventListener('abort', stop)
    const timer = setTimeout(stop, 12000)
    try {
      const res = await fetch(`${base}?data=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`Overpass ${res.status}`)
      const json = await res.json()
      const here = { lat, lon }
      const list = json.elements
        .map((e) => {
          const c = e.center ?? { lat: e.lat, lon: e.lon }
          const t = e.tags ?? {}
          return {
            id: `${e.type}/${e.id}`,
            name: t.name || t['name:en'] || t.operator || 'Unnamed solar plant',
            operator: t.operator,
            mw: parseMw(t['plant:output:electricity']),
            start: t.start_date,
            lat: c.lat,
            lon: c.lon,
            km: distanceKm(here, c),
          }
        })
        .filter((x) => x.km <= radiusKm)
        .sort((a, b) => (b.mw ?? 0) - (a.mw ?? 0) || a.km - b.km)
      memory.set(key, list)
      return list
    } catch (err) {
      if (signal?.aborted) throw err
      lastError = err
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', stop)
    }
  }
  throw new Error(lastError?.name === 'AbortError' ? 'servers busy (timed out)' : lastError?.message ?? 'servers busy')
}

/** City / place search (Open-Meteo geocoding, no key). */
export async function geocode(name, signal) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=en`, { signal })
  if (!res.ok) throw new Error(`Geocoding ${res.status}`)
  const json = await res.json()
  return (json.results ?? []).map((r) => ({
    name: r.name, lat: r.latitude, lon: r.longitude,
    where: [r.admin1, r.country].filter(Boolean).join(', '),
  }))
}
