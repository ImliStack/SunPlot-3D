// Cloudflare Worker: serves the built app (static assets) and proxies the few science APIs that
// don't allow browser calls (PVGIS has no CORS). Responses are cached at the edge, inputs are
// validated, and nothing here needs a secret.

const PVGIS = 'https://re.jrc.ec.europa.eu/api/v5_3'
const ALLOWED = new Set(['tmy', 'PVcalc', 'printhorizon'])
const DAY = 86400

function bad(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'content-type': 'application/json' } })
}

async function pvgis(request, url, ctx) {
  const tool = url.pathname.replace(/^\/api\/pvgis\//, '')
  if (!ALLOWED.has(tool)) return bad('unknown PVGIS tool')
  const lat = Number(url.searchParams.get('lat'))
  const lon = Number(url.searchParams.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return bad('lat/lon out of range')
  // Round to ~1 km so nearby requests share a cache entry (PVGIS grids are coarser than that).
  const q = new URLSearchParams(url.searchParams)
  q.set('lat', lat.toFixed(3))
  q.set('lon', lon.toFixed(3))
  q.set('outputformat', 'json')
  const upstream = `${PVGIS}/${tool}?${q}`
  const cache = caches.default
  const key = new Request(upstream)
  let res = await cache.match(key)
  if (!res) {
    const r = await fetch(upstream, { cf: { cacheTtl: 30 * DAY } })
    if (!r.ok) return bad(`PVGIS ${r.status}: ${(await r.text()).slice(0, 300)}`, 502)
    res = new Response(r.body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${30 * DAY}` } })
    ctx.waitUntil(cache.put(key, res.clone()))
  }
  const out = new Response(res.body, res)
  out.headers.set('access-control-allow-origin', '*')
  out.headers.set('x-data-source', 'PVGIS (European Commission JRC) v5.3')
  return out
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/pvgis/')) {
      if (request.method !== 'GET') return bad('GET only', 405)
      return pvgis(request, url, ctx)
    }
    return env.ASSETS.fetch(request)
  },
}
