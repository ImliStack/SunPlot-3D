// NREL Solar Position Algorithm (Reda & Andreas, Solar Energy 76 (2004) 577–589; NREL/TP-560-34302),
// a line-for-line port of the reference algorithm as implemented in pvlib.spa. Stated uncertainty
// ±0.0003° for years −2000…6000. Validated in tests/spa.test.js against the NREL report's worked
// example and against pvlib.solarposition.spa_python on 8,760 hours per test site.
//
// Conventions: azimuth clockwise from true north (0 N, 90 E, 180 S, 270 W); zenith and elevation
// in degrees; "apparent" values include atmospheric refraction. Time is UTC (a JS millisecond
// timestamp); local clock time only matters for display.

import { L0, L1, L2, L3, L4, L5, B0, B1, R0, R1, R2, R3, R4, NUTATION_ABCD, NUTATION_Y } from './spaTables.js'

const D2R = Math.PI / 180
const R2D = 180 / Math.PI
const mod360 = (x) => ((x % 360) + 360) % 360

/** ΔT = TT − UT1 in seconds (Espenak & Meeus polynomials, as in pvlib.spa.calculate_deltat). */
export function deltaT(year, month = 6) {
  const y = year + (month - 0.5) / 12
  if (year >= 2005 && year < 2050) return 62.92 + 0.32217 * (y - 2000) + 0.005589 * (y - 2000) ** 2
  if (year >= 1986 && year < 2005) {
    const t = y - 2000
    return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5
  }
  if (year >= 1961 && year < 1986) {
    const t = y - 1975
    return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718
  }
  if (year >= 2050 && year < 2150) return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y)
  return -20 + 32 * ((y - 1820) / 100) ** 2 // outside the modern range: long-term parabola
}

const series = (rows, x) => {
  let s = 0
  for (const r of rows) s += r[0] * Math.cos(r[1] + r[2] * x)
  return s
}

/**
 * Sun position for a UTC instant.
 * @param {number} ms      UTC milliseconds (Date.getTime())
 * @param {number} lat     degrees, north positive
 * @param {number} lon     degrees, east positive
 * @param {object} [o]     { elevation m, pressure mbar, temperature °C, deltaT s, refraction ° }
 * @returns {{ zenith, apparentZenith, elevation, apparentElevation, azimuth, declination, rightAscension, hourAngle, eot }}
 *   angles in degrees, `eot` (equation of time) in minutes.
 */
export function spa(ms, lat, lon, o = {}) {
  const elevation = o.elevation ?? 0
  const pressure = o.pressure ?? 1013.25
  const temperature = o.temperature ?? 12
  const atmosRefract = o.refraction ?? 0.5667
  const d = new Date(ms)
  const dT = o.deltaT ?? deltaT(d.getUTCFullYear(), d.getUTCMonth() + 1)

  // Julian day from unix time (exact for the proleptic Gregorian calendar used by Date).
  const jd = ms / 86400000 + 2440587.5
  const jde = jd + dT / 86400
  const jc = (jd - 2451545) / 36525
  const jce = (jde - 2451545) / 36525
  const jme = jce / 10

  // Earth heliocentric longitude, latitude, radius (A4.2).
  const L = mod360(((series(L0, jme) + series(L1, jme) * jme + series(L2, jme) * jme ** 2 + series(L3, jme) * jme ** 3
    + series(L4, jme) * jme ** 4 + series(L5, jme) * jme ** 5) / 1e8) * R2D)
  const B = ((series(B0, jme) + series(B1, jme) * jme) / 1e8) * R2D
  const R = (series(R0, jme) + series(R1, jme) * jme + series(R2, jme) * jme ** 2 + series(R3, jme) * jme ** 3 + series(R4, jme) * jme ** 4) / 1e8

  const theta = mod360(L + 180) // geocentric longitude
  const beta = -B // geocentric latitude

  // Nutation (A4.3).
  const x0 = 297.85036 + 445267.11148 * jce - 0.0019142 * jce ** 2 + jce ** 3 / 189474
  const x1 = 357.52772 + 35999.05034 * jce - 0.0001603 * jce ** 2 - jce ** 3 / 300000
  const x2 = 134.96298 + 477198.867398 * jce + 0.0086972 * jce ** 2 + jce ** 3 / 56250
  const x3 = 93.27191 + 483202.017538 * jce - 0.0036825 * jce ** 2 + jce ** 3 / 327270
  const x4 = 125.04452 - 1934.136261 * jce + 0.0020708 * jce ** 2 + jce ** 3 / 450000
  let dPsi = 0
  let dEps = 0
  for (let i = 0; i < NUTATION_Y.length; i++) {
    const y = NUTATION_Y[i]
    const arg = (y[0] * x0 + y[1] * x1 + y[2] * x2 + y[3] * x3 + y[4] * x4) * D2R
    const [a, b, c, dd] = NUTATION_ABCD[i]
    dPsi += (a + b * jce) * Math.sin(arg)
    dEps += (c + dd * jce) * Math.cos(arg)
  }
  dPsi /= 36000000
  dEps /= 36000000

  const U = jme / 10
  const e0 = 84381.448 - 4680.93 * U - 1.55 * U ** 2 + 1999.25 * U ** 3 - 51.38 * U ** 4 - 249.67 * U ** 5
    - 39.05 * U ** 6 + 7.12 * U ** 7 + 27.87 * U ** 8 + 5.79 * U ** 9 + 2.45 * U ** 10
  const eps = e0 / 3600 + dEps // true obliquity of the ecliptic
  const dTau = -20.4898 / (3600 * R) // aberration
  const lambda = theta + dPsi + dTau // apparent sun longitude

  const v0 = mod360(280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * jc ** 2 - jc ** 3 / 38710000)
  const v = v0 + dPsi * Math.cos(eps * D2R) // apparent sidereal time at Greenwich

  const alpha = mod360(Math.atan2(
    Math.sin(lambda * D2R) * Math.cos(eps * D2R) - Math.tan(beta * D2R) * Math.sin(eps * D2R),
    Math.cos(lambda * D2R),
  ) * R2D)
  const delta = Math.asin(Math.sin(beta * D2R) * Math.cos(eps * D2R) + Math.cos(beta * D2R) * Math.sin(eps * D2R) * Math.sin(lambda * D2R)) * R2D

  const H = mod360(v + lon - alpha) // observer local hour angle

  // Topocentric corrections (parallax).
  const xi = 8.794 / (3600 * R)
  const u = Math.atan(0.99664719 * Math.tan(lat * D2R))
  const x = Math.cos(u) + (elevation / 6378140) * Math.cos(lat * D2R)
  const yt = 0.99664719 * Math.sin(u) + (elevation / 6378140) * Math.sin(lat * D2R)
  const dAlpha = Math.atan2(-x * Math.sin(xi * D2R) * Math.sin(H * D2R), Math.cos(delta * D2R) - x * Math.sin(xi * D2R) * Math.cos(H * D2R)) * R2D
  const deltaP = Math.atan2(
    (Math.sin(delta * D2R) - yt * Math.sin(xi * D2R)) * Math.cos(dAlpha * D2R),
    Math.cos(delta * D2R) - x * Math.sin(xi * D2R) * Math.cos(H * D2R),
  ) * R2D
  const Hp = H - dAlpha

  const e0deg = Math.asin(Math.sin(lat * D2R) * Math.sin(deltaP * D2R) + Math.cos(lat * D2R) * Math.cos(deltaP * D2R) * Math.cos(Hp * D2R)) * R2D
  const refr = e0deg >= -1 * (0.26667 + atmosRefract)
    ? (pressure / 1010) * (283 / (273 + temperature)) * 1.02 / (60 * Math.tan((e0deg + 10.3 / (e0deg + 5.11)) * D2R))
    : 0
  const e = e0deg + refr
  const gamma = mod360(Math.atan2(Math.sin(Hp * D2R), Math.cos(Hp * D2R) * Math.sin(lat * D2R) - Math.tan(deltaP * D2R) * Math.cos(lat * D2R)) * R2D)
  const azimuth = mod360(gamma + 180)

  // Equation of time (A.1), minutes.
  const M = 280.4664567 + 360007.6982779 * jme + 0.03032028 * jme ** 2 + jme ** 3 / 49931 - jme ** 4 / 15300 - jme ** 5 / 2000000
  let E = mod360(M - 0.0057183 - alpha + dPsi * Math.cos(eps * D2R)) * 4
  if (E > 20) E -= 1440
  else if (E < -20) E += 1440

  return {
    zenith: 90 - e0deg,
    apparentZenith: 90 - e,
    elevation: e0deg,
    apparentElevation: e,
    azimuth,
    declination: delta,
    rightAscension: alpha,
    hourAngle: H,
    earthSunDistance: R, // AU
    eot: E,
  }
}

/**
 * Sunrise, solar noon (transit) and sunset within a 24 h window starting at `dayStartUtcMs`, found
 * by bisection on the true (unrefracted) elevation of the sun's centre crossing −0.8333°, i.e. the
 * upper limb at the horizon with standard refraction (SPA report A.2 convention).
 * Returns UTC milliseconds; `rise`/`set` are null in polar day or night.
 */
export function sunTimes(dayStartUtcMs, lat, lon, o = {}) {
  const h0 = -0.8333
  const elev = (t) => spa(t, lat, lon, o).elevation
  // Transit: the hour angle crosses 0 (from − to +) once in the 24 h window — bracket it hourly.
  const ha = (t) => {
    const h = spa(t, lat, lon, o).hourAngle
    return h > 180 ? h - 360 : h
  }
  let a = dayStartUtcMs
  let b = dayStartUtcMs + 3600000
  for (let k = 0; k < 24; k++) {
    const t0 = dayStartUtcMs + k * 3600000
    if (ha(t0) < 0 && ha(t0 + 3600000) >= 0) {
      a = t0
      b = t0 + 3600000
      break
    }
  }
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2
    if (ha(m) < 0) a = m
    else b = m
  }
  const transit = (a + b) / 2
  const noonElev = elev(transit)
  const midnightElev = elev(transit - 12 * 3600000)
  const find = (lo, hi, rising) => {
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2
      const above = elev(m) > h0
      if (above === rising) hi = m
      else lo = m
    }
    return (lo + hi) / 2
  }
  if (noonElev < h0) return { transit, rise: null, set: null, polar: 'night', noonElevation: noonElev }
  if (midnightElev > h0) return { transit, rise: null, set: null, polar: 'day', noonElevation: noonElev }
  return {
    transit,
    rise: find(transit - 12 * 3600000, transit, true),
    set: find(transit, transit + 12 * 3600000, false),
    polar: null,
    noonElevation: noonElev,
  }
}

/** Shadow of a vertical pole of height h on level ground: length (m) and bearing it points to (°). */
export function shadow(h, apparentElevation, azimuth) {
  if (apparentElevation <= 0) return { length: Infinity, bearing: null }
  return { length: h / Math.tan(apparentElevation * D2R), bearing: mod360(azimuth + 180) }
}
