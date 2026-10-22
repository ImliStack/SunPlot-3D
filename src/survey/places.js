// Address type-ahead and reverse lookup with Photon (komoot) — built on OpenStreetMap, made for
// autocomplete, free, no key, CORS open. Please keep requests debounced (fair use).
// https://photon.komoot.io

const API = 'https://photon.komoot.io'

const KIND = { house: 'Building', street: 'Street', locality: 'Area', district: 'Area', city: 'City', county: 'District', state: 'State', other: 'Place' }

function toPlace(f) {
  const p = f.properties ?? {}
  const [lon, lat] = f.geometry.coordinates
  const line1 = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || p.street || p.city || 'Unnamed place'
  const area = [p.street && p.name ? p.street : null, p.locality || p.district, p.city, p.state].filter((x, i, a) => x && a.indexOf(x) === i && x !== line1)
  return {
    id: `${p.osm_type}${p.osm_id}`,
    name: line1,
    where: area.join(', '),
    state: p.state ?? '',
    kind: KIND[p.type] ?? 'Place',
    lat,
    lon,
  }
}

/** Suggestions for `q`, biased towards `near` ([lon, lat]) when given. */
export async function autocomplete(q, near, signal) {
  const bias = near ? `&lon=${near[0].toFixed(4)}&lat=${near[1].toFixed(4)}&location_bias_scale=0.3` : ''
  const res = await fetch(`${API}/api/?q=${encodeURIComponent(q)}&limit=7&lang=en${bias}`, { signal })
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  const json = await res.json()
  const seen = new Set()
  return json.features.map(toPlace).filter((x) => !seen.has(x.id) && seen.add(x.id))
}

/** The nearest address to a point, e.g. for "my location". */
export async function reverse([lon, lat], signal) {
  const res = await fetch(`${API}/reverse?lon=${lon}&lat=${lat}&lang=en`, { signal })
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  const f = (await res.json()).features?.[0]
  return f ? toPlace(f) : null
}
