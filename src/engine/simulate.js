// Hour-by-hour PV simulation (the "quick" PVWatts-class model), pure and deterministic:
//   SPA sun position → Perez POA → shading (beam, per array and month) → physical IAM → soiling/snow
//   → SAPM cell temperature → PVWatts DC → system losses → PVWatts inverter with clipping.
// Every interval is kept, so daily, monthly and annual totals are exact sums of the hourly AC
// energy. The same chain is reproduced with pvlib in validation/reference.py.

import { spa } from './spa.js'
import { extraRadiation, airmassRelative, alt2pres, aoi, poa } from './irradiance.js'
import { iamPhysical, sapmTemperature, pvwattsDc, pvwattsInverter, combinedLoss, DEFAULT_LOSSES } from './pvmodel.js'

/**
 * @typedef {object} SimArray
 * @property {number} tilt       degrees from horizontal
 * @property {number} azimuth    degrees clockwise from north
 * @property {number} pdc0       W at STC (modules × rated W)
 * @property {number} [gamma]    Pmax temperature coefficient, 1/°C (default −0.0035)
 * @property {string} [mount]    SAPM mount key (default open_rack_glass_polymer)
 * @property {number[]} [shadeBeam]  fraction of beam lost to shading, per month (0–1)
 * @property {number} [skyView]  fraction of the sky dome visible (diffuse multiplier, default 1)
 */

/**
 * @param {object} o
 * @param {import('./weather.js').Weather} o.weather
 * @param {number} o.lat
 * @param {number} o.lon
 * @param {number} [o.elevation]
 * @param {SimArray[]} o.arrays
 * @param {number} o.acRating        W, total inverter AC rating (clipping limit)
 * @param {number} [o.etaInv]        nominal inverter efficiency (PVWatts default 0.96)
 * @param {number} [o.albedo]        ground reflectance (default: weather's albedo or 0.2)
 * @param {object} [o.losses]        % losses, see DEFAULT_LOSSES
 * @param {number[]} [o.soiling]     monthly soiling fraction (0–1)
 * @param {number[]} [o.snow]        monthly snow fraction (0–1)
 * @param {string} [o.transposition] 'perez' | 'haydavies' | 'isotropic'
 */
// Sun positions depend only on the weather file's timestamps and the site, not on the design, so
// they're computed once per (weather, site) and reused while the layout changes.
const sunCache = new WeakMap()
function sunSeries(w, lat, lon, elevation, pressure) {
  let byWeather = sunCache.get(w)
  if (!byWeather) sunCache.set(w, (byWeather = new Map()))
  const k = `${lat}|${lon}|${elevation}`
  if (byWeather.has(k)) return byWeather.get(k)
  const n = w.time.length
  const zen = new Float64Array(n)
  const az = new Float64Array(n)
  const month = new Uint8Array(n)
  const extra = new Float64Array(n)
  const am = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const t = w.time[i] + w.offsetHours * 3600000
    const d = new Date(t)
    month[i] = d.getUTCMonth()
    const doy = Math.floor((t - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1
    const sun = spa(t, lat, lon, { elevation, pressure, temperature: 12 })
    zen[i] = sun.apparentZenith
    az[i] = sun.azimuth
    extra[i] = extraRadiation(doy)
    am[i] = airmassRelative(sun.apparentZenith)
  }
  const out = { zen, az, month, extra, am }
  byWeather.set(k, out)
  return out
}

export function simulate(o) {
  const w = o.weather
  const n = w.time.length
  const elevation = o.elevation ?? w.elevation ?? 0
  const pressure = alt2pres(elevation) / 100
  const albedo = o.albedo ?? w.albedo ?? 0.2
  const etaNom = o.etaInv ?? 0.96
  const losses = { ...DEFAULT_LOSSES, ...(o.losses ?? {}) }
  const lossFrac = combinedLoss(losses)
  const pdc0Total = o.arrays.reduce((s, a) => s + (a.pdc0 || 0), 0)
  const invPdc0 = o.acRating > 0 ? o.acRating / etaNom : pdc0Total // PVWatts: AC limit = etaNom · pdc0
  const model = o.transposition ?? 'perez'

  const ac = new Float32Array(n)
  const dc = new Float32Array(n)
  const poaMain = new Float32Array(n) // first array's plane, W/m²
  const tCellMain = new Float32Array(n)
  const sunElev = new Float32Array(n)
  const monthly = new Array(12).fill(0)
  const perArray = o.arrays.map(() => 0)
  // Loss waterfall, all in kWh (DC-equivalent at STC until the inverter).
  const w8 = { poaRef: 0, shade: 0, iam: 0, soil: 0, snow: 0, temp: 0, system: 0, inverter: 0, clip: 0 }
  let poaGlobalYear = 0 // kWh/m² on the main plane (irradiation)

  const S = sunSeries(w, o.lat, o.lon, elevation, pressure)
  for (let i = 0; i < n; i++) {
    const month = S.month[i]
    const zen = S.zen[i]
    const sun = { azimuth: S.az[i] }
    sunElev[i] = 90 - zen
    const ghi = w.ghi[i]
    if (!(ghi > 0) && !(w.dni[i] > 0)) continue
    const dniExtra = S.extra[i]
    const am = S.am[i]
    let dcSum = 0
    o.arrays.forEach((a, k) => {
      if (!(a.pdc0 > 0)) return
      const irr = poa({ tilt: a.tilt, azimuth: a.azimuth, zenith: zen, sunAzimuth: sun.azimuth, dni: w.dni[i], ghi, dhi: w.dhi[i], dniExtra, airmass: am, albedo, model })
      const shadeB = a.shadeBeam?.[month] ?? 0
      const direct = irr.direct * (1 - shadeB)
      const sky = irr.sky * (a.skyView ?? 1)
      const theta = aoi(a.tilt, a.azimuth, zen, sun.azimuth)
      const iam = iamPhysical(theta)
      const soil = o.soiling?.[month] ?? 0
      const snow = o.snow?.[month] ?? 0
      const optical = direct * iam + sky + irr.ground
      const eff = optical * (1 - soil) * (1 - snow)
      const { cell } = sapmTemperature(irr.global, w.tAir[i], w.wind[i], a.mount)
      const gamma = a.gamma ?? -0.0035
      const p = Math.max(0, pvwattsDc(eff, cell, a.pdc0, gamma))
      // Waterfall at this array's scale (kWh).
      const kw = a.pdc0 / 1000
      const ref = (irr.global / 1000) * kw
      const afterShade = ((direct + sky + irr.ground) / 1000) * kw
      const afterIam = (optical / 1000) * kw
      const afterSoil = ((optical * (1 - soil)) / 1000) * kw
      const afterSnow = (eff / 1000) * kw
      w8.poaRef += ref
      w8.shade += ref - afterShade
      w8.iam += afterShade - afterIam
      w8.soil += afterIam - afterSoil
      w8.snow += afterSoil - afterSnow
      w8.temp += afterSnow - p / 1000
      if (k === 0) {
        poaMain[i] = irr.global
        tCellMain[i] = cell
        poaGlobalYear += irr.global / 1000
      }
      dcSum += p
      perArray[k] += p // DC share, rescaled to AC below
    })
    const dcNet = dcSum * (1 - lossFrac)
    w8.system += (dcSum - dcNet) / 1000
    const inv = pvwattsInverter(dcNet, invPdc0, etaNom)
    w8.inverter += (dcNet - inv.unclipped) / 1000
    w8.clip += inv.clipped / 1000
    dc[i] = dcNet
    ac[i] = inv.ac
    monthly[month] += inv.ac / 1000 // W over one hour = Wh → kWh
  }

  const annual = monthly.reduce((s, v) => s + v, 0)
  const dcYear = perArray.reduce((s, v) => s + v, 0)
  const perArrayAc = perArray.map((v) => (dcYear ? (v / dcYear) * annual : 0))
  const kwp = pdc0Total / 1000
  const yr = kwp ? w8.poaRef / kwp : 0 // reference yield, h (= kWh/m² on the array, weighted)
  const yf = kwp ? annual / kwp : 0 // final yield, kWh/kWp
  return {
    hourly: { time: w.time, offsetHours: w.offsetHours, ac, dc, poa: poaMain, tCell: tCellMain, sunElevation: sunElev },
    monthly, annual, perArray: perArrayAc,
    specificYield: yf,
    referenceYield: yr,
    performanceRatio: yr ? yf / yr : 0,
    capacityFactor: kwp ? annual / (kwp * n) : 0, // on DC nameplate, over the weather file's hours
    poaIrradiation: poaGlobalYear,
    waterfall: w8,
    losses: { ...losses, combined: lossFrac * 100 },
    hours: n,
    inputs: { albedo, etaNom, transposition: model, acRating: o.acRating, pdc0: pdc0Total },
  }
}

/** Daily totals (kWh) from a simulation, in weather-file order. */
export function dailyTotals(sim) {
  const out = []
  const { time, ac, offsetHours } = sim.hourly
  let day = null
  for (let i = 0; i < time.length; i++) {
    const d = new Date(time[i] + offsetHours * 3600000).toISOString().slice(0, 10)
    if (d !== day) { out.push({ date: d, kwh: 0 }); day = d }
    out[out.length - 1].kwh += ac[i] / 1000
  }
  return out
}
