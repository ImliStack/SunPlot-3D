import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { parsePvgisTmy, qualityChecks, closeComponents } from '../src/engine/weather.js'
import { simulate, dailyTotals } from '../src/engine/simulate.js'

// SunPlot's hourly engine against pvlib 0.11 (validation/reference.py) on the same PVGIS TMY file,
// the same reference system and the same model choices. Differences here are implementation
// differences only, so the tolerances are tight.
const dir = new URL('../validation/fixtures/', import.meta.url)
const sites = readdirSync(dir).filter((f) => f.startsWith('sim_')).map((f) => JSON.parse(readFileSync(new URL(f, dir))))

export const results = {}

describe.each(sites)('engine vs pvlib: $site', (ref) => {
  const json = JSON.parse(readFileSync(new URL(`../validation/data/pvgis_tmy_${ref.site}.json`, import.meta.url)))
  const weather = closeComponents(parsePvgisTmy(json), ref.lat, ref.lon) // as loadWeather does
  const sim = simulate({
    weather, lat: ref.lat, lon: ref.lon, elevation: ref.elevation,
    arrays: [{ tilt: ref.tilt, azimuth: ref.azimuth, pdc0: ref.pdc0, gamma: ref.gamma, mount: 'open_rack_glass_polymer' }],
    acRating: ref.ac, etaInv: ref.eta, albedo: ref.albedo,
  })
  results[ref.site] = { js: sim.annual, pvlib: ref.annual_kwh }

  it('annual AC energy within 0.1 %', () => {
    expect(Math.abs(sim.annual / ref.annual_kwh - 1)).toBeLessThan(0.001)
  })
  it('every month within 0.5 %', () => {
    sim.monthly.forEach((v, m) => {
      if (ref.monthly_kwh[m] > 1) expect(Math.abs(v / ref.monthly_kwh[m] - 1)).toBeLessThan(0.005)
    })
  })
  it('hourly POA, cell temperature and AC match', () => {
    ref.sample_index.forEach((i, k) => {
      expect(Math.abs(sim.hourly.poa[i] - ref.sample_poa[k])).toBeLessThan(1) // W/m²
      if (ref.sample_poa[k] > 0) expect(Math.abs(sim.hourly.tCell[i] - ref.sample_tcell[k])).toBeLessThan(0.05) // °C
      expect(Math.abs(sim.hourly.ac[i] - ref.sample_ac_w[k])).toBeLessThan(0.002 * ref.ac) // W
    })
  })
  it('POA irradiation within 0.1 %', () => expect(Math.abs(sim.poaIrradiation / ref.poa_kwh_m2 - 1)).toBeLessThan(0.001))
  it('monthly, daily and hourly totals reconcile with the annual total', () => {
    const fromMonths = sim.monthly.reduce((s, v) => s + v, 0)
    const fromDays = dailyTotals(sim).reduce((s, d) => s + d.kwh, 0)
    const fromHours = sim.hourly.ac.reduce((s, v) => s + v, 0) / 1000
    expect(fromMonths).toBeCloseTo(sim.annual, 6)
    expect(Math.abs(fromDays - sim.annual)).toBeLessThan(0.01)
    expect(Math.abs(fromHours - sim.annual)).toBeLessThan(0.01)
  })
  it('loss waterfall closes: POA reference − losses = AC', () => {
    const w = sim.waterfall
    const end = w.poaRef - w.shade - w.iam - w.soil - w.snow - w.temp - w.system - w.inverter - w.clip
    expect(Math.abs(end - sim.annual)).toBeLessThan(0.001 * sim.annual + 0.01)
  })
  it('beam is made consistent only where the file needs it (ERA5), as in the pvlib reference', () => {
    expect(weather.closureFixed).toBe(ref.weather.closure_fixed)
  })
  it('weather passes quality checks, including closure once made consistent', () => {
    const q = qualityChecks(weather, ref.lat, ref.lon)
    expect(q.closure).toBeLessThan(0.05)
    expect(q.missing).toBe(0)
    expect(q.negative).toBe(0)
    expect(q.hours).toBe(8760)
  })
})
