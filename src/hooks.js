import { useEffect, useMemo } from 'react'
import { useSolar } from './store.js'
import { computeLayout, selectModules } from './layout.js'
import { estimateYield, estimateYieldMeasured, PERFORMANCE_RATIO, soilingSnowMonthly } from './solar.js'
import { loadWeather } from './engine/weather.js'
import { simulate } from './engine/simulate.js'
import { siteZone, offsetMinutes } from './engine/clock.js'
import { pickInverters } from './electrical.js'
import { CLIMATES, panelOf } from './presets.js'
import { electricalDesign } from './electrical.js'
import { finance, resco, scenarios, sensitivity } from './finance.js'
import { PROFILES, defaultProfile, monthlyFromAverage, hourlyLoad, hourlyGeneration, overlap } from './load.js'

// The sun slider and day animation change `hour` / `day` every frame; the layout and yield
// don't depend on them, so both are keyed on everything else.
const VIEW_KEYS = new Set(['day', 'hour', 'surroundings', 'closeTrees', 'placeName', 'tz', 'cur', 'cost', 'tariff', 'co2', 'climate', 'cleanDays', 'weather',
  'inverter', 'invCount', 'dcRun', 'acRun', 'subsidy', 'escalation', 'discount', 'omPct', 'useKwh', 'exportRate',
  'loanShare', 'loanRate', 'loanYears', 'battLoad', 'battHours', 'battPrice',
  'lifetime', 'degradation', 'omRise', 'inverterYear', 'inverterShare', 'buyer', 'zeroExport', 'dgKva', 'society', 'houses', 'metering', 'profile', 'bills', 'todDisc', 'taxRate', 'ppaYears', 'roe', 'debtShare', 'debtRate', 'debtYears'])
export const designKey = (p) => Object.entries(p).filter(([k]) => !VIEW_KEYS.has(k)).map(([, v]) => (v && typeof v === 'object' ? JSON.stringify(v) : v)).join('|')

/** Every array the site could take. In click-to-install mode that includes every roof plane. */
export function useCandidates() {
  const params = useSolar((s) => s.params)
  const manual = useSolar((s) => s.install.mode === 'manual')
  const key = designKey(params) + manual
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => computeLayout(manual ? { ...params, bothFaces: true } : params), [key])
}

/** The design as built: all candidates in auto mode, only the installed arrays in manual mode. */
export function useLayout() {
  const full = useCandidates()
  const install = useSolar((s) => s.install)
  const params = useSolar((s) => s.params)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (install.mode === 'manual' ? selectModules(full, install.sel, params) : full), [full, install.mode, install.sel])
}

/** Key of what the shading result depends on: the design plus which trees stand around it. */
const selIds = new WeakMap()
let selSeq = 0
/** A short id per selection object (selections are replaced, never mutated). */
const selId = (sel) => {
  if (!selIds.has(sel)) selIds.set(sel, ++selSeq)
  return selIds.get(sel)
}
export const shadingKey = (p, install) => `${designKey(p)}|${p.surroundings}|${p.closeTrees}|${install.mode}|${install.mode === 'manual' ? selId(install.sel) : ''}`

export const weatherKey = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`

/** Fetch hourly weather (PVGIS TMY, else NASA POWER hourly) whenever the site moves. */
export function useHourlyWeatherFetch() {
  const lat = useSolar((s) => s.params.lat)
  const lon = useSolar((s) => s.params.lon)
  useEffect(() => {
    const key = weatherKey(lat, lon)
    const cur = useSolar.getState().hourly
    if (cur.key === key && cur.status === 'ready') return
    const ctrl = new AbortController()
    // Both sources in parallel: the NASA POWER year usually lands first; the PVGIS typical year
    // replaces it when it arrives (a TMY is the better basis for a long-term estimate).
    const t = setTimeout(() => {
      const st = useSolar.getState()
      st.setHourly({ status: 'loading', key })
      const errors = []
      let pending = 2
      const fail = (name) => (err) => {
        if (ctrl.signal.aborted) return
        errors.push(`${name}: ${err.message}`)
        if (--pending === 0 && useSolar.getState().hourly.status !== 'ready') useSolar.getState().setHourly({ status: 'error', key, error: errors.join('; ') })
      }
      loadWeather(lat, lon, { signal: ctrl.signal, provider: 'pvgis' })
        .then((data) => { pending--; useSolar.getState().setHourly({ status: 'ready', key, data }) })
        .catch(fail('PVGIS'))
      loadWeather(lat, lon, { signal: ctrl.signal, provider: 'nasa' })
        .then((data) => {
          pending--
          const h = useSolar.getState().hourly
          if (!(h.status === 'ready' && h.key === key && h.data.provider === 'PVGIS')) useSolar.getState().setHourly({ status: 'ready', key, data, upgrading: pending > 0 })
        })
        .catch(fail('NASA POWER'))
    }, 400)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [lat, lon])
}

/** SAPM mounting class for a design: tilted racks run open-rack, flush roof mounts close-mount. */
export function mountFor(p) {
  if (p.tiles && ['gable', 'hip', 'lshape', 'shed'].includes(p.site)) return 'insulated_back_glass_polymer'
  if (['gable', 'hip', 'lshape', 'shed', 'industrial'].includes(p.site)) return 'close_mount_glass_glass'
  if (p.site === 'terrace' && !p.elevated) return 'close_mount_glass_glass'
  return 'open_rack_glass_polymer'
}

/**
 * Energy for the design. With hourly weather loaded: the hour-by-hour engine (engine/simulate.js,
 * validated against pvlib). Until then, a labelled monthly estimate so the screen isn't empty.
 */
export function useYield(layout) {
  const params = useSolar((s) => s.params)
  const climate = useSolar((s) => s.climate)
  const hourly = useSolar((s) => s.hourly)
  const useMeasured = useSolar((s) => s.useMeasured)
  const shading = useSolar((s) => s.shading)
  const install = useSolar((s) => s.install)
  const { lat, lon, climate: cls, cleanDays } = params
  const data = useMeasured && climate.status === 'ready' ? climate.data : null
  const wx = hourly.status === 'ready' && hourly.key === weatherKey(lat, lon) ? hourly.data : null
  const shade = shading.status === 'ready' && shading.key === shadingKey(params, install) ? shading.perArray : null
  const panel = panelOf(params)
  const inv = pickInverters(layout.kwp, params.inverter, params.invCount)
  const acRating = inv.n * inv.inv.ac * 1000
  const mount = mountFor(params)
  return useMemo(() => {
    const watt = layout.count ? (layout.kwp * 1000) / layout.count : 0
    const arrays = layout.arrays.map((a) => ({ ...a, kwp: (a.count * watt) / 1000 }))
    const base = { arrays, kwp: layout.kwp, shaded: !!shade, shade }
    if (wx && layout.kwp > 0) {
      const ss = data ? soilingSnowMonthly(data, arrays[0]?.tilt ?? 20, cleanDays) : null
      const sim = simulate({
        weather: wx, lat, lon,
        arrays: arrays.map((a, k) => ({ tilt: a.tilt, azimuth: a.azimuth, pdc0: a.kwp * 1000, gamma: (panel.gPmax ?? -0.35) / 100, mount, shadeBeam: shade?.[k] })),
        acRating, albedo: wx.albedo ?? 0.2,
        soiling: ss ? ss.soil : new Array(12).fill(0.02), // PVWatts default 2 % until rain data loads
        snow: ss ? ss.snow : null,
      })
      // Inter-annual spread from the ten NASA POWER years of GHI (P90 = P50 − 1.2816 σ).
      const yearly = climate.status === 'ready' ? climate.summary.yearly : null
      const meanGhi = yearly ? yearly.reduce((a, y) => a + y.ghi, 0) / yearly.length : 0
      const cv = yearly ? Math.sqrt(yearly.reduce((a, y) => a + (y.ghi - meanGhi) ** 2, 0) / Math.max(1, yearly.length - 1)) / meanGhi : 0
      const w8 = sim.waterfall
      const unshaded = w8.poaRef ? sim.annual / (1 - w8.shade / w8.poaRef) : sim.annual
      return {
        ...base,
        source: 'hourly',
        engine: 'SPA · Perez · physical IAM · SAPM · PVWatts DC/inverter, hourly',
        weather: { provider: wx.provider, kind: wx.kind, dataset: wx.dataset, quality: wx.quality, cached: !!wx.cached, fetched: wx.fetched },
        sim,
        months: sim.monthly, annual: sim.annual, perArray: sim.perArray,
        specific: sim.specificYield, pr: sim.performanceRatio, capacityFactor: sim.capacityFactor,
        p50: sim.annual, p90: yearly ? sim.annual * (1 - 1.2816 * cv) : null, variability: cv,
        years: yearly ? yearly.map((y) => ({ year: y.year, kwh: (sim.annual * y.ghi) / meanGhi })) : [],
        poaKwh: w8.poaRef,
        shadingLoss: w8.poaRef ? w8.shade / w8.poaRef : 0,
        tempLossPct: w8.poaRef ? w8.temp / w8.poaRef : 0,
        unshadedAnnual: unshaded,
        losses: [
          { key: 'shade', label: 'Shading', kwh: w8.shade },
          { key: 'iam', label: 'Reflection (incidence angle)', kwh: w8.iam },
          { key: 'soil', label: 'Soiling', kwh: w8.soil },
          { key: 'snow', label: 'Snow cover', kwh: w8.snow },
          { key: 'temp', label: 'Temperature', kwh: w8.temp },
          { key: 'system', label: 'Mismatch, wiring, LID, availability', kwh: w8.system },
          { key: 'inverter', label: 'Inverter efficiency', kwh: w8.inverter },
          { key: 'clip', label: 'Inverter clipping', kwh: w8.clip },
        ],
        soilMonths: ss?.soil ?? new Array(12).fill(0.02),
        snowMonths: ss?.snow ?? new Array(12).fill(0),
        acRating,
        mount,
      }
    }
    if (data) {
      const r = estimateYieldMeasured(arrays, lat, data, { shade, cleanDays })
      return { ...base, ...r, source: 'measured', estimate: true, specific: layout.kwp ? r.annual / layout.kwp : 0 }
    }
    const { months, perArray, shadingLoss } = estimateYield(arrays, lat, CLIMATES[cls].k, shade)
    const annual = months.reduce((a, b) => a + b, 0)
    return { ...base, months, perArray, annual, shadingLoss, source: 'model', estimate: true, pr: PERFORMANCE_RATIO, specific: layout.kwp ? annual / layout.kwp : 0 }
  }, [layout, lat, lon, cls, data, shade, cleanDays, wx, climate, acRating, mount, panel.gPmax])
}

/** Air temperature extremes for string sizing: measured when NASA POWER is in, else a latitude guess. */
export function siteTemps(p, climate) {
  const s = climate.status === 'ready' ? climate.summary : null
  if (s?.tRecordLow != null) return { low: Math.floor(s.tRecordLow), high: Math.ceil(s.tRecordHigh), measured: true }
  const lat = Math.abs(p.lat)
  return { low: Math.round(Math.max(-30, 18 - 0.9 * lat)), high: lat < 35 ? 45 : 36, measured: false }
}

/** UTC hourly W → 8,760 local-hour kWh (linear interpolation for half-hour zones like IST). */
function toLocalKwh(acW, offHours) {
  const n = acW.length
  const out = new Float64Array(8760)
  for (let j = 0; j < 8760; j++) {
    const x = j - offHours
    const i0 = Math.floor(x)
    const f = x - i0
    const a = acW[((i0 % n) + n) % n]
    const b = acW[(((i0 + 1) % n) + n) % n]
    out[j] = (a * (1 - f) + b * f) / 1000
  }
  return out
}

/** The site's monthly use (12 values) and its load shape, or null when no consumption is given. */
export function siteUse(p, poiCat) {
  const profile = PROFILES[p.profile] ? p.profile : defaultProfile(p.site, poiCat)
  const months = Array.isArray(p.bills) && p.bills.length === 12 && p.bills.some((v) => v > 0)
    ? p.bills
    : p.useKwh > 0 ? monthlyFromAverage(p.useKwh, profile) : null
  return { profile, months }
}

/** Electrical concept + 25-year finance for the current design. */
export function useEngineering(layout, y) {
  const p = useSolar((s) => s.params)
  const climate = useSolar((s) => s.climate)
  const poiCat = useSolar((s) => s.survey.poi?.cat)
  // Hourly generation only changes with the energy model; the load with the bills and profile.
  // Hourly generation in local clock time (the load profiles are local): the simulation's own
  // hourly AC when available, shifted from UTC by the site's standard offset; otherwise a
  // clear-sky shape scaled to the monthly estimate.
  const gen = useMemo(() => {
    if (y.sim) {
      const zone = siteZone(p.lat, p.lon, p.tz)
      const off = (zone.iana ? offsetMinutes(zone.iana, Date.UTC(2026, 0, 15)) : zone.fixedMinutes) / 60
      return toLocalKwh(y.sim.hourly.ac, off)
    }
    return y.annual ? hourlyGeneration(y.arrays, p.lat, y.months) : null
  }, [y.sim, y.arrays, y.months, y.annual, p.lat, p.lon, p.tz])
  const use = siteUse(p, poiCat)
  const useKey = `${use.profile}|${use.months?.map((v) => Math.round(v)).join(',')}`
  const mix = useMemo(() => {
    if (!gen) return null
    const load = use.months ? hourlyLoad(use.months, use.profile) : null
    const o = overlap(gen, load)
    return { ...o, useYear: use.months ? use.months.reduce((a, b) => a + b, 0) : 0, profile: use.profile, months: use.months }
  }, [gen, useKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const temps = siteTemps(p, climate)
    const heightM = (p.site === 'industrial' ? p.eave : ['gable', 'hip', 'lshape', 'shed', 'flat', 'airport', 'terrace'].includes(p.site) ? p.floors * 3 : 3) + 2
    const e = electricalDesign({ layout, module: panelOf(p), temps, p, heightM })
    const f = finance({ annual: y.annual, kwp: layout.kwp, p, battery: e?.battery, mix })
    const ppa = p.buyer === 'resco' ? resco({ annual: y.annual, kwp: layout.kwp, p, mix }) : null
    const args = { annual: y.annual, kwp: layout.kwp, p, battery: e?.battery, mix }
    const sc = p.buyer !== 'resco' && layout.kwp ? scenarios({ ...args, cv: y.variability || 0.04 }) : null
    const sens = p.buyer !== 'resco' && layout.kwp ? sensitivity(args, 10) : null
    return { e, f, ppa, temps, mix, scenarios: sc, sensitivity: sens }
  }, [layout, y.annual, y.variability, p, climate, mix])
}
