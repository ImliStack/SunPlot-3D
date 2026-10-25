import { useMemo } from 'react'
import { useSolar } from './store.js'
import { computeLayout, selectModules } from './layout.js'
import { estimateYield, estimateYieldMeasured, PERFORMANCE_RATIO } from './solar.js'
import { CLIMATES, panelOf } from './presets.js'
import { electricalDesign } from './electrical.js'
import { finance, resco } from './finance.js'
import { PROFILES, defaultProfile, monthlyFromAverage, hourlyLoad, hourlyGeneration, overlap } from './load.js'

// The sun slider and day animation change `hour` / `day` every frame; the layout and yield
// don't depend on them, so both are keyed on everything else.
const VIEW_KEYS = new Set(['day', 'hour', 'surroundings', 'closeTrees', 'placeName', 'lon', 'cur', 'cost', 'tariff', 'co2', 'climate', 'cleanDays', 'weather',
  'inverter', 'invCount', 'dcRun', 'acRun', 'subsidy', 'escalation', 'discount', 'omPct', 'useKwh', 'exportRate',
  'loanShare', 'loanRate', 'loanYears', 'battLoad', 'battHours', 'battPrice',
  'buyer', 'zeroExport', 'dgKva', 'society', 'houses', 'metering', 'profile', 'bills', 'todDisc', 'taxRate', 'ppaYears', 'roe', 'debtShare', 'debtRate', 'debtYears'])
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

export function useYield(layout) {
  const params = useSolar((s) => s.params)
  const climate = useSolar((s) => s.climate)
  const useMeasured = useSolar((s) => s.useMeasured)
  const shading = useSolar((s) => s.shading)
  const install = useSolar((s) => s.install)
  const { lat, climate: cls, cleanDays } = params
  const data = useMeasured && climate.status === 'ready' ? climate.data : null
  const shade = shading.status === 'ready' && shading.key === shadingKey(params, install) ? shading.perArray : null
  return useMemo(() => {
    const watt = layout.count ? (layout.kwp * 1000) / layout.count : 0
    const arrays = layout.arrays.map((a) => ({ ...a, kwp: (a.count * watt) / 1000 }))
    const base = { arrays, kwp: layout.kwp, shaded: !!shade, shade }
    if (data) {
      const r = estimateYieldMeasured(arrays, lat, data, { shade, cleanDays })
      return { ...base, ...r, source: 'measured', specific: layout.kwp ? r.annual / layout.kwp : 0 }
    }
    const { months, perArray, shadingLoss } = estimateYield(arrays, lat, CLIMATES[cls].k, shade)
    const annual = months.reduce((a, b) => a + b, 0)
    return { ...base, months, perArray, annual, shadingLoss, source: 'model', pr: PERFORMANCE_RATIO, specific: layout.kwp ? annual / layout.kwp : 0 }
  }, [layout, lat, cls, data, shade, cleanDays])
}

/** Air temperature extremes for string sizing: measured when NASA POWER is in, else a latitude guess. */
export function siteTemps(p, climate) {
  const s = climate.status === 'ready' ? climate.summary : null
  if (s?.tRecordLow != null) return { low: Math.floor(s.tRecordLow), high: Math.ceil(s.tRecordHigh), measured: true }
  const lat = Math.abs(p.lat)
  return { low: Math.round(Math.max(-30, 18 - 0.9 * lat)), high: lat < 35 ? 45 : 36, measured: false }
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
  const gen = useMemo(() => (y.annual ? hourlyGeneration(y.arrays, p.lat, y.months) : null), [y.arrays, y.months, y.annual, p.lat])
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
    return { e, f, ppa, temps, mix }
  }, [layout, y.annual, p, climate, mix])
}
