// Local clock time ↔ UTC for a site, so the sun bar shows the time people read on their watch
// while every sun calculation (3D light, shadows, sun path, shading study, simulation) runs the
// NREL SPA on the true UTC instant. Daylight-saving time comes from the IANA zone when known.

import { spa, sunTimes } from './spa.js'

export const REF_YEAR = 2026 // the calendar the day-of-year slider refers to (not a leap year)

const IN_INDIA = (lat, lon) => lat > 6 && lat < 37.5 && lon > 68 && lon < 97.5

/**
 * The time zone used for a site: its IANA name when known (from place search), India's zone for
 * Indian coordinates, otherwise a fixed offset from longitude (labelled as approximate).
 * @returns {{ iana: string|null, fixedMinutes: number|null, label: string, approximate: boolean }}
 */
export function siteZone(lat, lon, iana) {
  if (iana) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: iana })
      return { iana, fixedMinutes: null, label: iana, approximate: false }
    } catch {}
  }
  if (IN_INDIA(lat, lon)) return { iana: 'Asia/Kolkata', fixedMinutes: null, label: 'Asia/Kolkata', approximate: false }
  const m = Math.round(lon / 15) * 60
  const h = m / 60
  return { iana: null, fixedMinutes: m, label: `UTC${h >= 0 ? '+' : '−'}${Math.abs(h)} (from longitude)`, approximate: true }
}

/** UTC offset in minutes of an IANA zone at a UTC instant (includes DST). */
export function offsetMinutes(iana, utcMs) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: iana, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000)
}

const zoneOffset = (zone, utcMs) => (zone.iana ? offsetMinutes(zone.iana, utcMs) : zone.fixedMinutes)

/** UTC instant for a day of year (1–365 in REF_YEAR) and a local clock hour (0–24, fractional). */
export function utcFor(zone, day, hour) {
  const wall = Date.UTC(REF_YEAR, 0, day, 0, 0, 0) + hour * 3600000
  let t = wall - zoneOffset(zone, wall) * 60000
  t = wall - zoneOffset(zone, t) * 60000 // second pass settles DST transitions
  return t
}

/** Local clock hour (fractional) of a UTC instant. */
export function clockHour(zone, utcMs) {
  const local = utcMs + zoneOffset(zone, utcMs) * 60000
  return ((local / 3600000) % 24 + 24) % 24
}

/**
 * Sun for the site at a local clock time: apparent elevation/zenith (with refraction), azimuth,
 * plus `alt`/`az` in radians for rendering. One function for every consumer.
 */
export function sunAt(site, day, hour) {
  const zone = siteZone(site.lat, site.lon, site.tz)
  const t = utcFor(zone, day, hour)
  const s = spa(t, site.lat, site.lon, { elevation: site.elevation ?? 0 })
  return { ...s, utc: t, alt: (s.apparentElevation * Math.PI) / 180, az: (s.azimuth * Math.PI) / 180, zone }
}

/** Sunrise, solar noon and sunset as local clock hours; null fields in polar day/night. */
export function sunClock(site, day) {
  const zone = siteZone(site.lat, site.lon, site.tz)
  const start = utcFor(zone, day, 0)
  const r = sunTimes(start, site.lat, site.lon, { elevation: site.elevation ?? 0 })
  const h = (ms) => (ms == null ? null : (ms - start) / 3600000)
  return { rise: h(r.rise), noon: h(r.transit), set: h(r.set), polar: r.polar, zone, noonElevation: r.noonElevation }
}
