// Sun geometry and a simple yield model. Angles in degrees at the edges, radians inside.
//
// World axes used across the app: +x east, +y up, −z north (so +z is south).
// Azimuth is the compass bearing, clockwise from north: 0 N · 90 E · 180 S · 270 W.

const RAD = Math.PI / 180
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Solar declination (Cooper), radians. */
const declination = (day) => 23.44 * RAD * Math.sin((2 * Math.PI * (284 + day)) / 365)

/** Sun altitude and azimuth (radians) for a latitude, day of year and solar time in hours. */
export function sunPosition(latDeg, day, hour) {
  const phi = latDeg * RAD
  const dec = declination(day)
  const H = (hour - 12) * 15 * RAD
  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)))
  // Azimuth from north, clockwise, using atan2 so it is stable at the poles and noon.
  const az = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi),
  ) + Math.PI
  return { alt, az }
}

/** Unit vector pointing at the sun in world axes. */
export function sunVector({ alt, az }) {
  return [Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)]
}

/** Sunrise and sunset in solar hours (polar day → [0, 24], polar night → null). */
export function dayLength(latDeg, day) {
  const x = -Math.tan(latDeg * RAD) * Math.tan(declination(day))
  if (x <= -1) return [0, 24]
  if (x >= 1) return null
  const h = Math.acos(x) / RAD / 15
  return [12 - h, 12 + h]
}

/** Lowest noon sun of the year (winter solstice) — the angle rows are spaced for. */
export const winterNoonAltitude = (latDeg) => Math.max(8, 90 - Math.abs(latDeg) - 23.44)

/**
 * ASHRAE clear-sky model (Masters, "Renewable and Efficient Electric Power Systems"):
 * beam DNI = A·e^(−B·m), diffuse on a horizontal surface = C·DNI, in W/m².
 */
export function clearSky(day, sinAlt) {
  const s = (2 * Math.PI) / 365
  const A = 1160 + 75 * Math.sin(s * (day - 275))
  const B = 0.174 + 0.035 * Math.sin(s * (day - 100))
  const C = 0.095 + 0.04 * Math.sin(s * (day - 100))
  const dni = A * Math.exp(-B / sinAlt)
  return { dni, dhi: C * dni }
}

const STEP = 0.25 // hours

/**
 * Daily plane-of-array irradiation in kWh/m² for one plane, for every month (averaged per day),
 * under clear skies. `climate` and losses are applied later so this stays cacheable.
 */
function planeIrradiation(latDeg, tiltDeg, azDeg) {
  const beta = tiltDeg * RAD
  const gamma = azDeg * RAD
  const albedo = 0.2
  const months = new Array(12).fill(0)
  let day = 1
  // Alongside the total, keep the beam part on this plane and on the horizontal, plus the
  // extraterrestrial horizontal irradiation — the measured-climate model needs all three.
  months.beam = new Array(12).fill(0)
  months.beamH = new Array(12).fill(0)
  months.ext = new Array(12).fill(0)
  months.tilt = beta
  for (let m = 0; m < 12; m++) {
    let sum = 0
    for (let d = 0; d < MONTH_DAYS[m]; d++, day++) {
      const g0 = 1367 * (1 + 0.033 * Math.cos((2 * Math.PI * day) / 365))
      for (let t = STEP / 2; t < 24; t += STEP) {
        const { alt, az } = sunPosition(latDeg, day, t)
        if (alt <= 0.02) continue
        const sinAlt = Math.sin(alt)
        const { dni, dhi } = clearSky(day, sinAlt)
        const ghi = dni * sinAlt + dhi
        const cosInc = sinAlt * Math.cos(beta) + Math.cos(alt) * Math.sin(beta) * Math.cos(az - gamma)
        const beam = dni * Math.max(0, cosInc)
        const poa = beam + dhi * (1 + Math.cos(beta)) / 2 + albedo * ghi * (1 - Math.cos(beta)) / 2
        sum += poa * STEP
        months.beam[m] += (beam * STEP) / 1000
        months.beamH[m] += (dni * sinAlt * STEP) / 1000
        months.ext[m] += (g0 * sinAlt * STEP) / 1000
      }
    }
    months[m] = sum / 1000 // kWh/m² for the whole month
  }
  return months
}

const cache = new Map()
function cachedPlane(lat, tilt, az) {
  const key = `${lat.toFixed(1)}|${tilt.toFixed(1)}|${(((az % 360) + 360) % 360).toFixed(0)}`
  if (!cache.has(key)) cache.set(key, planeIrradiation(lat, tilt, az))
  return cache.get(key)
}

// System losses: inverter, wiring, soiling, temperature, mismatch (≈ PVWatts default 14% + thermal).
export const PERFORMANCE_RATIO = 0.8

/**
 * Monthly energy (kWh) for a set of arrays, each { tilt, azimuth, kwp }.
 * Returns { months: number[12], perArray: number[] (annual kWh) }.
 */
export function estimateYield(arrays, latDeg, climateK, shade) {
  const months = new Array(12).fill(0)
  let unshaded = 0
  const perArray = arrays.map((a, k) => {
    if (!a.kwp) return 0
    const poa = cachedPlane(latDeg, a.tilt, a.azimuth)
    let year = 0
    poa.forEach((kwhm2, m) => {
      // kWh/m² ÷ 1 kW/m² (STC) = equivalent full-sun hours. Shading removes part of the beam.
      const lostBeam = poa.beam[m] * (shade?.[k]?.[m] ?? 0)
      const e = (kwhm2 - lostBeam) * a.kwp * PERFORMANCE_RATIO * climateK
      unshaded += kwhm2 * a.kwp * PERFORMANCE_RATIO * climateK
      months[m] += e
      year += e
    })
    return year
  })
  const annual = months.reduce((x, y) => x + y, 0)
  return { months, perArray, shadingLoss: unshaded ? 1 - annual / unshaded : 0 }
}

/** Points along today's sun path, for the arc drawn in the sky. */
export function sunPath(latDeg, day, steps = 48) {
  const span = dayLength(latDeg, day)
  if (!span) return []
  const [rise, set] = span
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const p = sunPosition(latDeg, day, rise + ((set - rise) * i) / steps)
    if (p.alt >= -0.01) pts.push(sunVector(p))
  }
  return pts
}

export const dayOfYear = (month, dayOfMonth = 21) =>
  MONTH_DAYS.slice(0, month).reduce((a, b) => a + b, 0) + dayOfMonth

export function dateLabel(day) {
  let d = day
  for (let m = 0; m < 12; m++) {
    if (d <= MONTH_DAYS[m]) return `${d} ${MONTHS[m]}`
    d -= MONTH_DAYS[m]
  }
  return `31 Dec`
}

export const hourLabel = (h) => {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`
}

// With measured climate the losses are split: 14% system losses (PVWatts default) plus shading,
// soiling, snow and temperature losses computed month by month from the data.
const SYSTEM_PR = 0.86
const TEMP_COEFF = -0.0035 // per °C, typical TOPCon / PERC Pmax coefficient

/**
 * Soiling (Kimber-style): dust builds up at `rate` per day and is washed off by rain events
 * (≈ one per 10 mm of monthly rain) or by cleaning every `cleanDays` (0 = rain only). The
 * monthly loss is the average over a cleaning cycle: rate × interval ÷ 2, capped at 25 %.
 * Dust rate follows dryness: 0.30 %/day under 300 mm/yr of rain, 0.20 % under 800, else 0.12 %.
 */
function soilingByMonth(rainYear, rainMm, cleanDays) {
  const rate = rainYear < 300 ? 0.003 : rainYear < 800 ? 0.002 : 0.0012
  const out = new Array(12).fill(0)
  let streak = 0
  // Two passes so December's dry streak carries into January.
  for (let pass = 0; pass < 2; pass++) {
    for (let m = 0; m < 12; m++) {
      const days = MONTH_DAYS[m]
      const events = Math.floor(rainMm[m] / 10)
      const gap = events > 0 ? days / events : (streak += days)
      if (events > 0) streak = 0
      const interval = Math.min(cleanDays > 0 ? cleanDays : Infinity, gap)
      out[m] = Math.min(0.25, (rate * interval) / 2)
    }
  }
  return { months: out, rate }
}

/**
 * Snow cover: each ~8 mm (water equivalent) of snowfall is one event that buries the modules
 * until it slides off or melts — about 0.5 + 3·(1 − tilt/60) days, halved when daily highs
 * are above 5 °C. Covered days still give ~10 % (light through thin snow, edges clearing).
 */
function snowLoss(snowMmMonth, tiltDeg, tmax, days) {
  if (!snowMmMonth) return 0
  const events = snowMmMonth / 8
  let stay = 0.5 + 3 * Math.max(0, 1 - tiltDeg / 60)
  if (tmax > 5) stay *= 0.5
  return Math.min(0.95, ((events * stay) / days) * 0.9)
}

/**
 * Yield from ten years of measured monthly weather (NASA POWER). Each month, measured
 * horizontal irradiance is split into beam and diffuse, transposed to every plane, then
 * reduced by shading (beam only), soiling, snow, cell temperature and system losses.
 * Returns averages, every year's total, P50 / P90 and a loss waterfall.
 */
export function estimateYieldMeasured(arrays, latDeg, d, { shade, cleanDays = 30 } = {}) {
  const horiz = cachedPlane(latDeg, 0, 180)
  const planes = arrays.map((a) => (a.kwp ? cachedPlane(latDeg, a.tilt, a.azimuth) : null))
  /**
   * Measured horizontal H → plane of array (Liu–Jordan isotropic sky):
   * diffuse share from the monthly clearness index Kt = H / H₀ (Collares-Pereira & Rabl / Page fit),
   * beam scaled by the clear-sky geometric ratio Rb of this plane.
   */
  const toPlane = (pl, m, H) => {
    const kt = Math.min(0.8, Math.max(0.15, H / horiz.ext[m]))
    const share = Math.min(1, Math.max(0.1, 1.39 - 4.027 * kt + 5.531 * kt ** 2 - 3.108 * kt ** 3))
    const Hd = H * share
    const Hb = H - Hd
    const rb = horiz.beamH[m] ? pl.beam[m] / horiz.beamH[m] : 1
    const beam = Hb * rb
    return { total: beam + Hd * (1 + Math.cos(pl.tilt)) / 2 + H * 0.2 * (1 - Math.cos(pl.tilt)) / 2, beam }
  }
  const n = d.years.length
  const fill = (grid, m) => {
    const v = (grid ?? []).map((y) => y[m]).filter((x) => x != null)
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0
  }
  const val = (grid, i, m) => grid?.[i]?.[m] ?? fill(grid, m)
  const months = new Array(12).fill(0)
  const perArray = arrays.map(() => 0)
  const years = d.years.map((year) => ({ year, kwh: 0 }))
  // Loss waterfall stages, as average kWh per year.
  const w = { poa: 0, shade: 0, soil: 0, snow: 0, temp: 0, system: 0 }
  const soilMonths = new Array(12).fill(0)
  const snowMonths = new Array(12).fill(0)
  for (let i = 0; i < n; i++) {
    const rainMm = MONTH_DAYS.map((days, m) => val(d.rain, i, m) * days)
    const soil = soilingByMonth(rainMm.reduce((a, b) => a + b, 0), rainMm, cleanDays)
    for (let m = 0; m < 12; m++) {
      const days = MONTH_DAYS[m]
      const ghiDay = val(d.ghi, i, m)
      const ghi = ghiDay * days
      const tAir = (val(d.t, i, m) + val(d.tmax, i, m)) / 2 // daytime air
      const tCell = tAir + 25 * Math.min(1.2, ghiDay / 6)
      const kTemp = 1 + TEMP_COEFF * Math.max(0, tCell - 25)
      const snowMm = val(d.snow, i, m) * days
      soilMonths[m] += soil.months[m] / n
      arrays.forEach((a, k) => {
        if (!planes[k]) return
        const { total, beam } = toPlane(planes[k], m, ghi)
        const e0 = total * a.kwp
        const e1 = (total - beam * (shade?.[k]?.[m] ?? 0)) * a.kwp
        const e2 = e1 * (1 - soil.months[m])
        const snow = snowLoss(snowMm, a.tilt, val(d.tmax, i, m), days)
        if (k === 0) snowMonths[m] += snow / n
        const e3 = e2 * (1 - snow)
        const e4 = e3 * kTemp
        const e = e4 * SYSTEM_PR
        w.poa += e0 / n; w.shade += (e0 - e1) / n; w.soil += (e1 - e2) / n
        w.snow += (e2 - e3) / n; w.temp += (e3 - e4) / n; w.system += (e4 - e) / n
        months[m] += e / n
        perArray[k] += e / n
        years[i].kwh += e
      })
    }
  }
  const annual = months.reduce((s, x) => s + x, 0)
  const sd = Math.sqrt(years.reduce((s, y) => (s + (y.kwh - annual) ** 2), 0) / Math.max(1, n - 1))
  const pct = (x) => (w.poa ? x / w.poa : 0)
  return {
    months, perArray, years, annual,
    p50: annual, p90: annual - 1.2816 * sd, sd,
    pr: w.poa ? annual / w.poa : 0,
    tempLossPct: pct(w.temp),
    shadingLoss: pct(w.shade),
    losses: [
      { key: 'shade', label: 'Shading', kwh: w.shade },
      { key: 'soil', label: 'Soiling', kwh: w.soil },
      { key: 'snow', label: 'Snow cover', kwh: w.snow },
      { key: 'temp', label: 'Temperature', kwh: w.temp },
      { key: 'system', label: 'Inverter, wiring, mismatch', kwh: w.system },
    ],
    poaKwh: w.poa,
    soilMonths, snowMonths,
  }
}
