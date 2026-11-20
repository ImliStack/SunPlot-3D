// Hourly weather for the simulation. Two sources, both free and keyless:
//  1. PVGIS v5.3 typical meteorological year (European Commission JRC): GHI, DNI, DHI, air
//     temperature, wind; SARAH3 satellite data where covered, ERA5 reanalysis elsewhere.
//     Served through /api/pvgis (Vite dev proxy locally, worker/index.js in production): PVGIS
//     sends no CORS headers.
//  2. NASA POWER hourly (CERES/MERRA-2) for the last complete calendar year: a real historical
//     year, not a typical one. Used when PVGIS is unreachable, and labelled as such.
// Nothing is ever invented: if both fail, the caller gets an error and the UI says so.

import { spa } from './spa.js'
import { extraRadiation } from './irradiance.js'

const CACHE_VERSION = 'wx:v1'

/**
 * @typedef {object} Weather
 * @property {'PVGIS'|'NASA POWER'} provider
 * @property {'typical year (TMY)'|'historical year'} kind
 * @property {string} dataset      e.g. "PVGIS-SARAH3 2005–2023" or "NASA POWER hourly 2025"
 * @property {number[]} time       UTC ms at the start of each hour
 * @property {number} offsetHours  where inside the hour the irradiance belongs (0.5 = mid-hour)
 * @property {Float32Array} ghi    W/m²
 * @property {Float32Array} dni    W/m²
 * @property {Float32Array} dhi    W/m²
 * @property {Float32Array} tAir   °C
 * @property {Float32Array} wind   m/s at 10 m
 * @property {number|null} albedo  annual mean when the source has it
 * @property {number|null} elevation m
 * @property {object} quality      checks, see qualityChecks()
 */

const key = (lat, lon) => `${CACHE_VERSION}:${lat.toFixed(2)},${lon.toFixed(2)}`

function save(k, w) {
  try {
    const plain = { ...w, ghi: [...w.ghi], dni: [...w.dni], dhi: [...w.dhi], tAir: [...w.tAir], wind: [...w.wind] }
    localStorage.setItem(k, JSON.stringify(plain))
  } catch {}
}

function load(k) {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null')
    if (!v) return null
    for (const f of ['ghi', 'dni', 'dhi', 'tAir', 'wind']) v[f] = Float32Array.from(v[f])
    return v
  } catch {
    return null
  }
}

/** PVGIS TMY JSON → Weather. Months come from different years; they're mapped onto one non-leap
 *  reference year (2023) so the sun position for every hour is computed on the calendar date. */
export function parsePvgisTmy(json) {
  const rows = json.outputs.tmy_hourly
  const n = rows.length
  const w = {
    provider: 'PVGIS',
    kind: 'typical year (TMY)',
    dataset: `${json.inputs.meteo_data.radiation_db} ${json.inputs.meteo_data.year_min}–${json.inputs.meteo_data.year_max}`,
    time: new Array(n),
    offsetHours: json.inputs.location.irradiance_time_offset ?? 0,
    ghi: new Float32Array(n), dni: new Float32Array(n), dhi: new Float32Array(n), tAir: new Float32Array(n), wind: new Float32Array(n),
    albedo: null,
    elevation: json.inputs.location.elevation ?? null,
    monthsSelected: json.outputs.months_selected,
  }
  rows.forEach((r, i) => {
    const s = r['time(UTC)'] // "YYYYMMDD:HHMM"
    w.time[i] = Date.UTC(2023, Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)), Number(s.slice(9, 11)), Number(s.slice(11, 13)))
    w.ghi[i] = r['G(h)']
    w.dni[i] = r['Gb(n)']
    w.dhi[i] = r['Gd(h)']
    w.tAir[i] = r.T2m
    w.wind[i] = r.WS10m
  })
  // PVGIS lists the TMY in calendar order, but each month's hours start at 00:00 UTC; sort to be safe.
  const order = [...w.time.keys()].sort((a, b) => w.time[a] - w.time[b])
  if (order.some((v, i) => v !== i)) {
    for (const f of ['ghi', 'dni', 'dhi', 'tAir', 'wind']) w[f] = Float32Array.from(order.map((i) => w[f][i]))
    w.time = order.map((i) => w.time[i])
  }
  return w
}

/** NASA POWER hourly JSON → Weather (a real calendar year; keeps 29 Feb in leap years). */
export function parseNasaHourly(json, year) {
  const p = json.properties.parameter
  const keys = Object.keys(p.ALLSKY_SFC_SW_DWN)
  const n = keys.length
  const fill = json.header?.fill_value ?? -999
  const w = {
    provider: 'NASA POWER',
    kind: 'historical year',
    dataset: `NASA POWER hourly ${year} (CERES SYN1deg + MERRA-2)`,
    time: new Array(n),
    offsetHours: 0.5, // hourly means, taken as the hour starting at the timestamp
    ghi: new Float32Array(n), dni: new Float32Array(n), dhi: new Float32Array(n), tAir: new Float32Array(n), wind: new Float32Array(n),
    albedo: null,
    elevation: json.geometry?.coordinates?.[2] ?? null,
    missing: 0,
  }
  const albedos = []
  keys.forEach((k, i) => {
    w.time[i] = Date.UTC(Number(k.slice(0, 4)), Number(k.slice(4, 6)) - 1, Number(k.slice(6, 8)), Number(k.slice(8, 10)))
    const get = (name) => {
      const v = p[name]?.[k]
      if (v == null || v === fill) { w.missing++; return NaN }
      return v
    }
    w.ghi[i] = get('ALLSKY_SFC_SW_DWN')
    w.dni[i] = get('ALLSKY_SFC_SW_DNI')
    w.dhi[i] = get('ALLSKY_SFC_SW_DIFF')
    w.tAir[i] = get('T2M')
    w.wind[i] = get('WS10M')
    const a = p.ALLSKY_SRF_ALB?.[k]
    if (a != null && a !== fill && a > 0 && a < 1) albedos.push(a)
  })
  // Night-time irradiance is reported as fill: that is zero, not missing.
  for (let i = 0; i < n; i++) {
    for (const f of ['ghi', 'dni', 'dhi']) if (Number.isNaN(w[f][i]) && !(w.ghi[i] > 0)) { w[f][i] = 0; w.missing-- }
  }
  if (albedos.length) w.albedo = albedos.reduce((s, v) => s + v, 0) / albedos.length
  return w
}

/**
 * Plausibility checks (in the spirit of BSRN / IEC 61724 screening): missing values, negatives,
 * GHI above extraterrestrial, and closure GHI ≈ DNI·cos z + DHI for hours with sun above 10°.
 */
export function qualityChecks(w, lat, lon) {
  let missing = 0
  let negative = 0
  let overExtra = 0
  let closureTested = 0
  let closureFail = 0
  let ghiSum = 0
  for (let i = 0; i < w.time.length; i++) {
    const g = w.ghi[i]
    if (![g, w.dni[i], w.dhi[i], w.tAir[i], w.wind[i]].every(Number.isFinite)) { missing++; continue }
    if (g < 0 || w.dni[i] < 0 || w.dhi[i] < 0) negative++
    ghiSum += g
    if (g <= 50) continue
    const t = w.time[i] + w.offsetHours * 3600000
    const s = spa(t, lat, lon)
    const doy = Math.floor((t - Date.UTC(new Date(t).getUTCFullYear(), 0, 1)) / 86400000) + 1
    if (g > 1.2 * extraRadiation(doy)) overExtra++
    if (s.apparentElevation > 10) {
      closureTested++
      const sum = w.dni[i] * Math.cos(s.apparentZenith * Math.PI / 180) + w.dhi[i]
      if (Math.abs(sum - g) > 0.08 * g + 25) closureFail++
    }
  }
  const hours = w.time.length
  const closure = closureTested ? closureFail / closureTested : 0
  const issues = []
  if (missing) issues.push(`${missing} hours with missing values`)
  if (negative) issues.push(`${negative} hours with negative irradiance`)
  if (overExtra) issues.push(`${overExtra} hours with GHI above extraterrestrial`)
  if (closure > 0.05) issues.push(`${(closure * 100).toFixed(1)} % of daytime hours fail GHI = DNI·cos z + DHI`)
  return { hours, missing, negative, overExtra, closure, annualGhi: ghiSum / 1000, ok: !issues.length, issues }
}

async function fetchJson(url, signal, timeout = 45000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  signal?.addEventListener('abort', () => ctrl.abort())
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

/**
 * Hourly weather from one provider ('pvgis' | 'nasa'), cached per provider and location.
 * PVGIS computes a TMY on demand (≈ 1 min the first time; the Worker then caches it at the edge).
 * @returns {Promise<Weather>}
 */
export async function loadWeather(lat, lon, { signal, provider = 'pvgis' } = {}) {
  const k = `${key(lat, lon)}:${provider}`
  const cached = load(k)
  if (cached) return { ...cached, cached: true }
  let w
  if (provider === 'pvgis') {
    const json = await fetchJson(`/api/pvgis/tmy?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&outputformat=json`, signal, 150000)
    w = parsePvgisTmy(json)
  } else {
    const year = new Date().getUTCFullYear() - 1
    const url = `https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DNI,ALLSKY_SFC_SW_DIFF,T2M,WS10M,ALLSKY_SRF_ALB&community=RE&longitude=${lon.toFixed(3)}&latitude=${lat.toFixed(3)}&start=${year}0101&end=${year}1231&format=JSON&time-standard=UTC`
    w = parseNasaHourly(await fetchJson(url, signal, 120000), year)
  }
  w.quality = qualityChecks(w, lat, lon)
  w.lat = lat
  w.lon = lon
  w.fetched = new Date().toISOString()
  save(k, w)
  return w
}
