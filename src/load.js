// Electricity use through the year and through the day, hour by hour against the solar output, so
// self-consumption, export and time-of-day value come from the overlap and not from a guess.

import { sunPosition, clearSky } from './solar.js'

const RAD = Math.PI / 180
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
export const SOLAR_HOURS = [9, 17] // ToD "solar hours" most SERCs use (8 h around noon)

/**
 * Load shapes. `day` = 24 relative weights (hour 0 = midnight), `off` = weight on Sundays (×day),
 * `season` = month factors used when only an average bill is known (Indian climate: summer AC).
 */
export const PROFILES = {
  home: { label: 'Home', note: 'Morning and evening peaks, AC in summer',
    day: [3, 2.5, 2.3, 2.2, 2.3, 3, 4.5, 5.5, 5, 4, 3.6, 3.5, 3.6, 3.6, 3.5, 3.6, 4, 5, 6.5, 7.5, 7.5, 7, 5.5, 4], off: 1.05,
    season: [0.8, 0.8, 0.95, 1.2, 1.35, 1.3, 1.1, 1.05, 1.05, 0.95, 0.85, 0.8] },
  office: { label: 'Office / shop', note: '9 to 7, six days a week',
    day: [1, 1, 1, 1, 1, 1, 1.5, 3, 6, 9, 10, 10, 9.5, 10, 10, 9.5, 9, 8, 6, 3.5, 2, 1.5, 1, 1], off: 0.25,
    season: [0.85, 0.85, 0.95, 1.15, 1.25, 1.2, 1.05, 1.05, 1.05, 1, 0.9, 0.85] },
  factory1: { label: 'Factory, 1 shift', note: '8 to 5 production, six days, base load at night',
    day: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 2, 5, 9, 10, 10, 10, 8, 10, 10, 9.5, 8, 4, 2.5, 2, 1.5, 1.5, 1.5, 1.5], off: 0.2,
    season: [1, 1, 1, 1.05, 1.08, 1.05, 1, 1, 1, 1, 1, 1] },
  factory3: { label: 'Factory, 24 × 7', note: 'Three shifts, near-flat load',
    day: [9, 9, 9, 9, 9, 9, 9.3, 9.6, 10, 10, 10, 10, 9.8, 10, 10, 10, 10, 9.8, 9.6, 9.4, 9.2, 9.1, 9, 9], off: 0.85,
    season: [1, 1, 1, 1.04, 1.06, 1.04, 1, 1, 1, 1, 1, 1] },
  campus: { label: 'College / school', note: 'Daytime classes, low in vacations (May–June, December)',
    day: [1.2, 1.2, 1.2, 1.2, 1.2, 1.4, 2, 4, 8, 10, 10, 10, 9, 10, 10, 9, 7, 4.5, 3.5, 3, 2.5, 2, 1.5, 1.3], off: 0.3,
    season: [1, 1.05, 1.05, 1.05, 0.45, 0.55, 1, 1.05, 1.05, 0.95, 1, 0.7] },
  hospital: { label: 'Hospital', note: 'Round the clock, busier by day',
    day: [6, 6, 6, 6, 6, 6.5, 7.5, 9, 10, 10, 10, 10, 10, 10, 10, 9.5, 9, 8.5, 8.5, 8, 7.5, 7, 6.5, 6], off: 0.9,
    season: [0.85, 0.85, 0.95, 1.15, 1.25, 1.2, 1.05, 1.05, 1.05, 1, 0.9, 0.85] },
}

/** A sensible profile for the site type (and the surveyed place's category). */
export function defaultProfile(site, poiCat) {
  if (poiCat === 'school' || poiCat === 'college') return 'campus'
  if (poiCat === 'hospital') return 'hospital'
  if (['bank', 'supermarket', 'mall', 'fuel', 'hotel'].includes(poiCat)) return 'office'
  if (site === 'industrial') return 'factory1'
  if (['flat', 'airport', 'carport', 'busstop'].includes(site)) return 'office'
  return 'home'
}

/** Twelve monthly kWh from an average month, shaped by the profile's seasons. */
export function monthlyFromAverage(avg, profile) {
  const s = PROFILES[profile]?.season ?? PROFILES.home.season
  const mean = s.reduce((a, b) => a + b, 0) / 12
  return s.map((f) => (avg * f) / mean)
}

/** Day of the week for day-of-year `doy` (1 Jan 2026 is a Thursday; 0 = Sunday). */
const weekday = (doy) => (doy + 4) % 7

/** 8760 hourly kWh of load: each month's total spread over its days and hours by the profile. */
export function hourlyLoad(months, profile) {
  const pr = PROFILES[profile] ?? PROFILES.home
  const out = new Float64Array(8760)
  const daySum = pr.day.reduce((a, b) => a + b, 0)
  let h = 0
  let doy = 0
  for (let m = 0; m < 12; m++) {
    const days = MONTH_DAYS[m]
    let weight = 0
    for (let d = 0; d < days; d++) weight += weekday(doy + d) === 0 ? pr.off : 1
    for (let d = 0; d < days; d++, doy++) {
      const k = (weekday(doy) === 0 ? pr.off : 1) / weight
      for (let hr = 0; hr < 24; hr++) out[h++] = months[m] * k * (pr.day[hr] / daySum)
    }
  }
  return out
}

/**
 * 8760 hourly kWh of solar output (solar time): each array's clear-sky plane-of-array shape,
 * scaled so every month adds up to the design's monthly energy.
 */
export function hourlyGeneration(arrays, lat, months) {
  const used = arrays.filter((a) => a.count)
  const shape = new Float64Array(8760)
  const monthW = new Array(12).fill(0)
  let i = 0
  let day = 1
  for (let m = 0; m < 12; m++) {
    for (let d = 0; d < MONTH_DAYS[m]; d++, day++) {
      for (let h = 0; h < 24; h++, i++) {
        let w = 0
        for (const a of used) {
          const beta = a.tilt * RAD
          const gamma = a.azimuth * RAD
          for (const t of [h + 0.25, h + 0.75]) {
            const { alt, az } = sunPosition(lat, day, t)
            if (alt <= 0.02) continue
            const sinAlt = Math.sin(alt)
            const { dni, dhi } = clearSky(day, sinAlt)
            const cosInc = sinAlt * Math.cos(beta) + Math.cos(alt) * Math.sin(beta) * Math.cos(az - gamma)
            w += a.kwp * (dni * Math.max(0, cosInc) + (dhi * (1 + Math.cos(beta))) / 2)
          }
        }
        shape[i] = w
        monthW[m] += w
      }
    }
  }
  i = 0
  for (let m = 0; m < 12; m++) {
    const k = monthW[m] ? months[m] / monthW[m] : 0
    for (let d = 0; d < MONTH_DAYS[m] * 24; d++, i++) shape[i] *= k
  }
  return shape
}

/**
 * Hour-by-hour overlap of solar and load. `self` is used on site as it is made; `export` goes to
 * the grid; `solarHours` is the share of generation inside the ToD solar window.
 */
export function overlap(gen, load) {
  let self = 0
  let total = 0
  let use = 0
  let inWindow = 0
  for (let i = 0; i < 8760; i++) {
    const g = gen[i]
    total += g
    use += load ? load[i] : 0
    if (load) self += Math.min(g, load[i])
    const hr = i % 24
    if (hr >= SOLAR_HOURS[0] && hr < SOLAR_HOURS[1]) inWindow += g
  }
  return {
    gen: total, use,
    selfShare: total ? (load ? self / total : 1) : 0, // of generation, used instantly on site
    coverInstant: use ? self / use : 0, // of the load, met by solar as it happens
    solarHours: total ? inWindow / total : 0,
  }
}
