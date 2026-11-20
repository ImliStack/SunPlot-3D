import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { variantsFor, generateAlternatives, winners, equatorAzimuth } from '../src/alternatives.js'
import { parsePvgisTmy } from '../src/engine/weather.js'
import { DEFAULTS } from '../src/presets.js'

const wx = parsePvgisTmy(JSON.parse(readFileSync(new URL('../validation/data/pvgis_tmy_ajmer.json', import.meta.url))))
const site = { ...DEFAULTS, site: 'flat', lat: 26.45, lon: 74.64, tz: 'Asia/Kolkata', length: 30, width: 20, vents: 2 }

describe('layout alternatives', () => {
  it('equator azimuth by hemisphere', () => {
    expect(equatorAzimuth(26)).toBe(180)
    expect(equatorAzimuth(-33)).toBe(0)
  })
  it('offers tilts and east-west for flat roofs, and skips the current design duplicate', () => {
    const v = variantsFor({ ...site, rackTilt: 15, azimuth: 180 })
    expect(v[0].id).toBe('current')
    expect(v.some((o) => o.id === 'ew')).toBe(true)
    expect(v.some((o) => o.id === 'tilt15')).toBe(false)
  })
  it('simulates each option and picks sensible winners', () => {
    const opts = generateAlternatives(site, { weather: wx, soiling: new Array(12).fill(0.02), snow: null })
    expect(opts.every((o) => o.count > 0 && o.annual > 0)).toBe(true)
    const w = winners(opts)
    const by = Object.fromEntries(opts.map((o) => [o.id, o]))
    // East-west packs more modules on the same roof; near-latitude tilt has the best kWh/kWp.
    expect(by.ew.kwp).toBeGreaterThan(by.tilt5.kwp * 0.99)
    expect(by[w.yield].specific).toBeGreaterThanOrEqual(by.ew.specific)
    expect(['tilt20', 'tilt25', 'tilt15', 'current', 'tilt30']).toContain(w.yield)
    expect(by[w.energy].annual).toBe(Math.max(...opts.map((o) => o.annual)))
  })
})

describe('project file and hourly CSV', async () => {
  const { projectJson, parseProjectJson, hourlyCsv } = await import('../src/exports.js')
  const { simulate } = await import('../src/engine/simulate.js')
  it('round-trips the inputs', () => {
    const txt = projectJson({ p: site, install: { mode: 'auto' }, layout: { count: 10, kwp: 5 }, y: { annual: 8000, months: [] }, f: null })
    expect(parseProjectJson(txt).params).toEqual(site)
    expect(() => parseProjectJson('{"a":1}')).toThrow(/Not a SunPlot/)
    expect(() => parseProjectJson('nope')).toThrow(/Not a JSON/)
  })
  it('hourly CSV rows sum to the annual AC energy, in IST clock time', () => {
    const sim = simulate({ weather: wx, lat: 26.45, lon: 74.64, arrays: [{ tilt: 20, azimuth: 180, pdc0: 10000, gamma: -0.0037, mount: 'open_rack_glass_polymer' }], acRating: 8333 })
    const y = { sim, kwp: 10, acRating: 8333, engine: 'test', weather: { provider: 'PVGIS', dataset: 'x', kind: 'tmy' } }
    const lines = hourlyCsv(y, site, wx).split('\n').filter((l) => !l.startsWith('#'))
    const body = lines.slice(1)
    expect(body.length).toBe(wx.time.length)
    const sum = body.reduce((a, l) => a + Number(l.split(',').at(-1)), 0)
    expect(Math.abs(sum - sim.annual) / sim.annual).toBeLessThan(1e-4)
    // First row: 00:00 UTC is 05:30 in India.
    expect(body[0].split(',')[1].endsWith('05:30')).toBe(true)
  })
})
