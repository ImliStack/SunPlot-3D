import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { spa, sunTimes, deltaT, shadow } from '../src/engine/spa.js'

// NREL/TP-560-34302, Appendix A.5 worked example: 17 Oct 2003, 12:30:30 local (UTC−7),
// Golden, Colorado; ΔT 67 s, 820 mbar, 11 °C, elevation 1830.14 m.
describe('NREL SPA reference example', () => {
  const t = Date.UTC(2003, 9, 17, 19, 30, 30)
  const r = spa(t, 39.742476, -105.1786, { elevation: 1830.14, pressure: 820, temperature: 11, deltaT: 67 })
  it('topocentric zenith 50.11162°', () => expect(r.apparentZenith).toBeCloseTo(50.11162, 4))
  it('topocentric azimuth 194.34024°', () => expect(r.azimuth).toBeCloseTo(194.34024, 4))
  it('equation of time 14.641503 min', () => expect(r.eot).toBeCloseTo(14.641503, 3))
  it('declination −9.31434°', () => expect(r.declination).toBeCloseTo(-9.31434, 4))

  // Report values (local time): sunrise 06:12:43, transit 11:46:04, sunset 17:20:19, from the
  // report's daily-interpolation method (A.2). sunTimes() instead finds the instant the full SPA
  // puts the sun's centre at −0.8333°: pvlib.spa_python gives −0.8335° at our sunset (17:18:51),
  // so the 1.5 min gap at sunset is the A.2 interpolation, not the position. Rise and transit agree
  // to a few seconds; sunset is checked to 2 min and, more strictly, by the elevation it lands on.
  const day = Date.UTC(2003, 9, 17, 7) // local midnight in UTC
  const opts = { elevation: 1830.14, pressure: 820, temperature: 11, deltaT: 67 }
  const s = sunTimes(day, 39.742476, -105.1786, opts)
  const local = (ms) => (ms - day) / 3600000
  it('sunrise ≈ 06:12:43', () => expect(Math.abs(local(s.rise) - (6 + 12 / 60 + 43 / 3600)) * 60).toBeLessThan(0.1))
  it('transit ≈ 11:46:04', () => expect(Math.abs(local(s.transit) - (11 + 46 / 60 + 4 / 3600)) * 60).toBeLessThan(0.1))
  it('sunset within 2 min of 17:20:19 (A.2)', () => expect(Math.abs(local(s.set) - (17 + 20 / 60 + 19 / 3600)) * 60).toBeLessThan(2))
  it('sun centre at −0.8333° at rise and set', () => {
    expect(spa(s.rise, 39.742476, -105.1786, opts).elevation).toBeCloseTo(-0.8333, 3)
    expect(spa(s.set, 39.742476, -105.1786, opts).elevation).toBeCloseTo(-0.8333, 3)
  })
})

describe('SPA vs pvlib.solarposition.spa_python (9 sites × 237 hours of 2025)', () => {
  const fx = JSON.parse(readFileSync(new URL('../validation/fixtures/spa_pvlib.json', import.meta.url)))
  for (const [site, f] of Object.entries(fx)) {
    it(`${site}: zenith and azimuth within 0.001°`, () => {
      let maxZ = 0
      let maxA = 0
      f.t.forEach((t, i) => {
        const r = spa(t, f.lat, f.lon, { elevation: f.elev, pressure: f.pressure, temperature: 12 })
        maxZ = Math.max(maxZ, Math.abs(r.zenith - f.zen[i]), Math.abs(r.apparentZenith - f.appzen[i]))
        // Azimuth is undefined straight overhead; compare elsewhere, wrapping at 0/360.
        if (f.zen[i] > 0.5) maxA = Math.max(maxA, Math.abs(((r.azimuth - f.az[i] + 540) % 360) - 180))
      })
      expect(maxZ).toBeLessThan(0.001)
      expect(maxA).toBeLessThan(0.001)
    })
  }
})

describe('edge cases', () => {
  it('ΔT for 2025 is about 74 s', () => expect(deltaT(2025, 6)).toBeGreaterThan(70))
  it('polar night in Tromsø in December', () => {
    expect(sunTimes(Date.UTC(2025, 11, 21), 69.65, 18.96).polar).toBe('night')
  })
  it('polar day in Tromsø in June', () => {
    expect(sunTimes(Date.UTC(2025, 5, 21), 69.65, 18.96).polar).toBe('day')
  })
  it('no shadow when the sun is down', () => expect(shadow(1, -2, 120).length).toBe(Infinity))
  it('45° sun casts a shadow equal to the height, pointing away from the sun', () => {
    const s = shadow(3, 45, 135)
    expect(s.length).toBeCloseTo(3, 10)
    expect(s.bearing).toBe(315)
  })
})
