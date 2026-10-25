import { useEffect } from 'react'
import { useSolar } from './store.js'

// Measured climate from NASA POWER (satellite + reanalysis, global, 0.5° grid, no key, CORS on):
// monthly all-sky and clear-sky irradiance on a horizontal surface, temperature, wind and rain
// for the last ten complete years. https://power.larc.nasa.gov/docs/services/api/temporal/monthly/

const API = 'https://power.larc.nasa.gov/api/temporal/monthly/point'
const PARAMS = ['ALLSKY_SFC_SW_DWN', 'CLRSKY_SFC_SW_DWN', 'T2M', 'T2M_MAX', 'T2M_MIN', 'WS10M', 'PRECTOTCORR', 'ALLSKY_KT', 'PRECSNOLAND', 'SNODP']
export const YEARS = 10
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const memory = new Map()
const cacheKey = (lat, lon) => `power:v3:${lat.toFixed(1)},${lon.toFixed(1)}`

function readCache(key) {
  if (memory.has(key)) return memory.get(key)
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const data = JSON.parse(raw)
      memory.set(key, data)
      return data
    }
  } catch {}
  return null
}

function writeCache(key, data) {
  memory.set(key, data)
  try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
}

/**
 * Normalise the POWER response into
 * { years: [2016…], ghi[y][m], clr[y][m], t[y][m], tmax[y][m], tmin[y][m], wind[y][m], rain[y][m], kt[y][m] }
 * with daily means per month (kWh/m²/day, °C, m/s, mm/day). Missing values (−999) become null.
 */
function parse(json, years) {
  const p = json.properties.parameter
  const pick = (name) => years.map((y) => DAYS.map((_, m) => {
    const v = p[name]?.[`${y}${String(m + 1).padStart(2, '0')}`]
    return v == null || v <= -990 ? null : v
  }))
  return {
    years,
    elevation: json.geometry?.coordinates?.[2] ?? null,
    ghi: pick('ALLSKY_SFC_SW_DWN'),
    clr: pick('CLRSKY_SFC_SW_DWN'),
    t: pick('T2M'),
    tmax: pick('T2M_MAX'),
    tmin: pick('T2M_MIN'),
    wind: pick('WS10M'),
    rain: pick('PRECTOTCORR'),
    kt: pick('ALLSKY_KT'),
    snow: pick('PRECSNOLAND'), // snowfall, mm/day water equivalent
    snowDepth: pick('SNODP'), // cm on the ground
  }
}

async function request(lat, lon, end, signal) {
  const start = end - YEARS + 1
  const url = `${API}?parameters=${PARAMS.join(',')}&community=RE&longitude=${lon.toFixed(3)}&latitude=${lat.toFixed(3)}&start=${start}&end=${end}&format=JSON`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`NASA POWER ${res.status}`)
  const json = await res.json()
  const years = Array.from({ length: YEARS }, (_, i) => start + i)
  const data = parse(json, years)
  // The newest year can be incomplete; signal the caller to step back a year.
  const filled = data.ghi[YEARS - 1].filter((v) => v != null).length
  if (filled < 12) throw Object.assign(new Error('incomplete'), { incomplete: true })
  return data
}

export async function fetchClimate(lat, lon, signal) {
  const key = cacheKey(lat, lon)
  const hit = readCache(key)
  if (hit) return hit
  const last = new Date().getFullYear() - 1
  let data
  try {
    data = await request(lat, lon, last, signal)
  } catch (err) {
    if (!err.incomplete && err.name === 'AbortError') throw err
    data = await request(lat, lon, last - 1, signal)
  }
  writeCache(key, data)
  return data
}

const mean = (xs) => {
  const v = xs.filter((x) => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** Monthly means across the years and the yearly totals, for charts and insights. */
const extreme = (grid, f) => {
  const v = (grid ?? []).flat().filter((x) => x != null)
  return v.length ? f(...v) : null
}

export function summarise(d) {
  const monthly = DAYS.map((_, m) => ({
    ghi: mean(d.ghi.map((y) => y[m])),
    ghiMin: Math.min(...d.ghi.map((y) => y[m]).filter((v) => v != null)),
    ghiMax: Math.max(...d.ghi.map((y) => y[m]).filter((v) => v != null)),
    clr: mean(d.clr.map((y) => y[m])),
    t: mean(d.t.map((y) => y[m])),
    tmax: mean(d.tmax.map((y) => y[m])),
    rain: mean(d.rain.map((y) => y[m])),
    wind: mean(d.wind.map((y) => y[m])),
    kt: mean(d.kt.map((y) => y[m])),
    snow: mean(d.snow.map((y) => y[m])) ?? 0,
    snowDepth: mean(d.snowDepth.map((y) => y[m])) ?? 0,
  }))
  const yearly = d.years.map((year, i) => ({
    year,
    ghi: d.ghi[i].reduce((s, v, m) => s + (v ?? 0) * DAYS[m], 0), // kWh/m²·yr
    t: mean(d.t[i]),
    rain: d.rain[i].reduce((s, v, m) => s + (v ?? 0) * DAYS[m], 0), // mm/yr
    snow: d.snow[i].reduce((s, v, m) => s + (v ?? 0) * DAYS[m], 0), // mm water eq./yr
  }))
  const annualGhi = mean(yearly.map((y) => y.ghi))
  const sd = Math.sqrt(mean(yearly.map((y) => (y.ghi - annualGhi) ** 2)))
  const kt = mean(monthly.map((m) => m.kt))
  return {
    monthly, yearly, annualGhi, variability: sd / annualGhi,
    tAvg: mean(monthly.map((m) => m.t)), tHot: Math.max(...monthly.map((m) => m.tmax)),
    // Extremes over the ten years, for string voltage limits (cold Voc, hot Vmp).
    tRecordLow: extreme(d.tmin, Math.min) ?? Math.min(...monthly.map((m) => m.t)) - 12,
    tRecordHigh: extreme(d.tmax, Math.max) ?? Math.max(...monthly.map((m) => m.tmax)),
    rain: mean(yearly.map((y) => y.rain)), wind: mean(monthly.map((m) => m.wind)),
    kt, peakSunHours: annualGhi / 365,
    snow: mean(yearly.map((y) => y.snow)),
    snowMonths: monthly.filter((m) => m.snowDepth >= 1).length,
  }
}

/** The climate class that best matches a measured clearness index — keeps the fallback in step. */
export function climateClass(kt) {
  if (kt >= 0.62) return 'arid'
  if (kt >= 0.55) return 'sunny'
  if (kt >= 0.5) return 'monsoon'
  if (kt >= 0.44) return 'temperate'
  return 'cloudy'
}

/** Fetch whenever the location settles; the store holds { status, key, data, summary, error }. */
export function useClimateFetch() {
  const lat = useSolar((s) => s.params.lat)
  const lon = useSolar((s) => s.params.lon)
  useEffect(() => {
    const key = cacheKey(lat, lon)
    const { climate, setClimate } = useSolar.getState()
    if (climate.key === key && climate.status === 'ready') return
    const abort = new AbortController()
    const timer = setTimeout(async () => {
      setClimate({ status: 'loading', key })
      try {
        const data = await fetchClimate(lat, lon, abort.signal)
        setClimate({ status: 'ready', key, data, summary: summarise(data) })
      } catch (err) {
        if (err.name !== 'AbortError') setClimate({ status: 'error', key, error: err.message })
      }
    }, 500)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [lat, lon])
}
