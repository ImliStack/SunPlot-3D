// Model-only comparison with NREL PVWatts V8: SunPlot's engine runs on the exact hourly weather
// PVWatts used (NSRDB TMY beam, diffuse, temperature, wind, from validation/pvwatts_same_weather.py),
// so the remaining difference is model, not data. PVWatts timestamps are local standard time.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { simulate } from '../src/engine/simulate.js'
import { spa } from '../src/engine/spa.js'

// Time zone of each PVWatts weather file. station_info returned no tz for these NSRDB Meteosat
// files; for India, whole-hour UTC+5 timestamps align the hourly POA far better than UTC+5:30
// (RMSE 6–9 W/m² against 34–38 W/m²), so the file uses an integer zone.
const SITES = { ajmer: 5, mumbai: 5, london: 0, dubai: 4, sydney: 10, tromso: 1 }
const fix = (s) => new URL(`../validation/fixtures/pvwatts_${s}.json`, import.meta.url)

export function pvwattsWeather(d, tzHours) {
  const n = d.hourly.dn.length
  const t0 = Date.UTC(2023, 0, 1) - tzHours * 3600000
  const w = {
    provider: 'PVWatts', kind: 'tmy', dataset: d.weather, offsetHours: 0.5, albedo: 0.2, elevation: d.elevation ?? 0,
    time: new Array(n), ghi: new Float32Array(n), dni: new Float32Array(n), dhi: new Float32Array(n), tAir: new Float32Array(n), wind: new Float32Array(n),
  }
  for (let i = 0; i < n; i++) {
    w.time[i] = t0 + i * 3600000
    const z = spa(w.time[i] + 1800000, d.lat, d.lon).zenith
    w.dni[i] = d.hourly.dn[i]
    w.dhi[i] = d.hourly.df[i]
    w.ghi[i] = Math.max(0, d.hourly.dn[i] * Math.cos((z * Math.PI) / 180)) + d.hourly.df[i]
    w.tAir[i] = d.hourly.tamb[i]
    w.wind[i] = d.hourly.wspd[i]
  }
  return w
}

export function compareSite(s) {
  const d = JSON.parse(readFileSync(fix(s)))
  const w = pvwattsWeather(d, SITES[s])
  const sim = simulate({
    weather: w, lat: d.lat, lon: d.lon,
    arrays: [{ tilt: d.tilt, azimuth: d.azimuth, pdc0: 10000, gamma: -0.0037, mount: 'open_rack_glass_polymer' }],
    acRating: 10000 / 1.2, etaInv: 0.96, albedo: 0.2, soiling: new Array(12).fill(0), snow: null,
    losses: { soiling: 0 },
  })
  const pvPoa = d.hourly.poa.reduce((a, b) => a + b, 0) / 1000
  const pvAc = d.ac_annual
  let se = 0, n = 0, dt = 0, nt = 0
  for (let i = 0; i < d.hourly.poa.length; i++) {
    const a = sim.hourly.poa[i], b = d.hourly.poa[i]
    if (a > 0 || b > 0) { se += (a - b) ** 2; n++ }
    if (b > 200) { dt += sim.hourly.tCell[i] - d.hourly.tcell[i]; nt++ }
  }
  return { site: s, poa: sim.poaIrradiation, pvPoa, ac: sim.annual, pvAc, dPoa: sim.poaIrradiation / pvPoa - 1, dAc: sim.annual / pvAc - 1, rmse: Math.sqrt(se / n), dTcell: dt / nt }
}

describe('PVWatts V8, same weather', () => {
  for (const s of Object.keys(SITES)) {
    it.skipIf(!existsSync(fix(s)))(`${s}: POA within 1.5 %, AC within 3.5 %, hourly POA RMSE under 15 W/m²`, () => {
      const r = compareSite(s)
      console.log(`${s.padEnd(7)} POA ${r.poa.toFixed(0)} vs ${r.pvPoa.toFixed(0)} kWh/m² (${(r.dPoa * 100).toFixed(2)} %)  AC ${r.ac.toFixed(0)} vs ${r.pvAc.toFixed(0)} kWh (${(r.dAc * 100).toFixed(2)} %)  POA RMSE ${r.rmse.toFixed(1)} W/m²  ΔTcell ${r.dTcell.toFixed(2)} °C`)
      expect(Math.abs(r.dPoa)).toBeLessThan(0.015)
      expect(Math.abs(r.dAc)).toBeLessThan(0.035)
      expect(r.rmse).toBeLessThan(15)
    })
  }
})
