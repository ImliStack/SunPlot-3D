// Files a designer hands on: CAD layout (.dxf), hourly generation (.csv), the 3D model (.glb)
// and a short orbit video of the design (.webm). Everything is built in the browser.

import { panelOf, portraitOf } from './presets.js'
import { MONTHS } from './solar.js'
import { siteZone, offsetMinutes } from './engine/clock.js'
import { getControls, getRenderer } from './scene/capture.js'

const RAD = Math.PI / 180

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const scale = (a, k) => a.map((v) => v * k)
const add = (...vs) => vs.reduce((s, v) => s.map((x, i) => x + v[i]))

/** Site frame → plan metres, north up (+y north, +x east). The scene turns the site by 180° − azimuth. */
function planOf(p) {
  const ry = (180 - p.azimuth) * RAD
  const c = Math.cos(ry)
  const s = Math.sin(ry)
  return ([x, , z]) => {
    const wx = x * c + z * s
    const wz = -x * s + z * c
    return [wx, -wz] // world −z is north
  }
}

/** The four plan corners of every module. */
export function moduleOutlines(layout, p) {
  const m = panelOf(p)
  const plan = planOf(p)
  return layout.panels.map((pnl) => {
    const y = pnl.N
    const x = portraitOf(p) ? pnl.U : cross(pnl.U, y)
    const z = cross(x, y)
    const hx = scale(x, m.w / 2)
    const hz = scale(z, m.h / 2)
    return [add(pnl.pos, hx, hz), add(pnl.pos, hx, scale(hz, -1)), add(pnl.pos, scale(hx, -1), scale(hz, -1)), add(pnl.pos, scale(hx, -1), hz)].map(plan)
  })
}

/** AutoCAD R12 DXF of the module layout in metres, north up, with a title and north arrow. */
export function layoutDxf(layout, p, title = 'SunPlot layout') {
  const out = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '3',
    ...layerDef('MODULES', 5), ...layerDef('ARRAYS', 30), ...layerDef('NOTES', 7), '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES']
  const line = (a, b, layer) => out.push('0', 'LINE', '8', layer, '10', a[0].toFixed(3), '20', a[1].toFixed(3), '30', '0', '11', b[0].toFixed(3), '21', b[1].toFixed(3), '31', '0')
  const text = (at, h, s, layer = 'NOTES') => out.push('0', 'TEXT', '8', layer, '10', at[0].toFixed(3), '20', at[1].toFixed(3), '30', '0', '40', String(h), '1', s)
  const quads = moduleOutlines(layout, p)
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  quads.forEach((q) => q.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }))
  quads.forEach((q) => q.forEach((pt, i) => line(pt, q[(i + 1) % 4], 'MODULES')))
  // Array letters at each array's centre.
  let i = 0
  layout.arrays.forEach((a, k) => {
    if (!a.count) return
    const qs = quads.slice(i, i + a.count)
    i += a.count
    const cx = qs.reduce((s, q) => s + q[0][0], 0) / qs.length
    const cy = qs.reduce((s, q) => s + q[0][1], 0) / qs.length
    text([cx, cy], 0.8, `${'ABCDEFGH'[k]} ${a.name} ${a.count} mod ${Math.round(a.tilt)}deg/${Math.round(a.azimuth)}deg`, 'ARRAYS')
  })
  if (Number.isFinite(minX)) {
    const nx = maxX + 3
    const ny = maxY
    line([nx, ny - 3], [nx, ny], 'NOTES'); line([nx, ny], [nx - 0.5, ny - 0.9], 'NOTES'); line([nx, ny], [nx + 0.5, ny - 0.9], 'NOTES')
    text([nx - 0.3, ny + 0.4], 0.8, 'N')
    text([minX, minY - 2], 0.9, `${title} - ${layout.count} x ${panelOf(p).watt} W = ${layout.kwp.toFixed(2)} kWp - units: metres`)
    text([minX, minY - 3.4], 0.6, `${p.placeName || ''} ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)} - module ${panelOf(p).h} x ${panelOf(p).w} m`)
  }
  out.push('0', 'ENDSEC', '0', 'EOF')
  return out.join('\n')
}

function layerDef(name, color) {
  return ['0', 'LAYER', '2', name, '70', '0', '62', String(color), '6', 'CONTINUOUS']
}

/**
 * The hourly simulation as CSV: one row per weather-file interval, with UTC and site clock time,
 * plane-of-array irradiance, cell temperature, DC and AC energy. Rows add up exactly to the
 * annual figure shown in the app (nothing is rescaled).
 */
export function hourlyCsv(y, p, weather) {
  if (!y.sim) throw new Error('Hourly weather has not loaded yet')
  const { time, ac, dc, poa, tCell } = y.sim.hourly
  const zone = siteZone(p.lat, p.lon, p.tz)
  const pad = (n) => String(n).padStart(2, '0')
  const rows = [
    `# SunPlot hourly simulation, ${y.weather.provider} ${y.weather.dataset} (${y.weather.kind}); ${y.engine}`,
    `# Site ${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}; ${(y.kwp ?? 0).toFixed(2)} kWp DC, ${(y.acRating / 1000).toFixed(1)} kW AC; clock time in ${zone.label}`,
    'Interval start (UTC),Local time,GHI W/m2,Air °C,POA W/m2,Cell °C,DC kWh,AC kWh',
  ]
  for (let i = 0; i < time.length; i++) {
    const t = time[i]
    const loc = new Date(t + (zone.iana ? offsetMinutes(zone.iana, t) : zone.fixedMinutes) * 60000)
    const ts = `${loc.getUTCFullYear()}-${pad(loc.getUTCMonth() + 1)}-${pad(loc.getUTCDate())} ${pad(loc.getUTCHours())}:${pad(loc.getUTCMinutes())}`
    rows.push([new Date(t).toISOString().slice(0, 16).replace('T', ' '), ts,
      weather ? weather.ghi[i].toFixed(0) : '', weather ? weather.tAir[i].toFixed(1) : '',
      poa[i].toFixed(1), tCell[i].toFixed(1), (dc[i] / 1000).toFixed(4), (ac[i] / 1000).toFixed(4)].join(','))
  }
  return rows.join('\n')
}

/** The design and its results as JSON: inputs to reopen it, plus the figures and their basis. */
export function projectJson({ p, install, layout, y, f }) {
  return JSON.stringify({
    format: 'sunplot-project', version: 1, exported: new Date().toISOString(),
    params: p,
    install: install.mode === 'manual' ? { mode: 'manual', sel: Object.keys(install.sel) } : { mode: 'auto' },
    results: {
      modules: layout.count, kwpDc: layout.kwp, acKw: y.acRating ? y.acRating / 1000 : null,
      annualKwh: y.annual, specificYield: y.specific, performanceRatio: y.pr ?? null, p90Kwh: y.p90 ?? null,
      monthlyKwh: y.months, losses: y.losses ?? null,
      basis: y.source === 'hourly' ? { engine: y.engine, weather: y.weather } : { engine: 'estimate (hourly weather not loaded)' },
      finance: f ? { gross: f.gross, net: f.net, payback: f.payback, irr: f.irr, npv: f.npv, lcoe: f.lcoe } : null,
    },
  }, null, 2)
}

/** Read a file written by projectJson. Returns { params, install } or throws with a reason. */
export function parseProjectJson(text) {
  let v
  try { v = JSON.parse(text) } catch { throw new Error('Not a JSON file') }
  if (v?.format !== 'sunplot-project' || typeof v.params !== 'object') throw new Error('Not a SunPlot project file')
  if (v.version > 1) throw new Error('Made by a newer SunPlot version')
  return { params: v.params, install: v.install ?? { mode: 'auto' } }
}

/** Monthly summary CSV: energy per month, per array. */
export function monthlyCsv(y) {
  const arrays = y.arrays.map((a, i) => ({ ...a, i })).filter((a) => a.count)
  const total = y.annual || 1
  const head = ['Month', 'kWh', ...arrays.map((a) => `${a.name} kWh`)]
  const rows = y.months.map((v, m) => [MONTHS[m], v.toFixed(1), ...arrays.map((a) => ((v * y.perArray[a.i]) / total).toFixed(1))])
  rows.push(['Year', y.annual.toFixed(0), ...arrays.map((a) => y.perArray[a.i].toFixed(0))])
  return [head, ...rows].map((r) => r.join(',')).join('\n')
}

/** The 3D scene as binary glTF (opens in Blender, SketchUp via plugin, PVsyst via conversion). */
export async function sceneGlb() {
  const r = getRenderer()
  if (!r) throw new Error('3D view not ready')
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const exporter = new GLTFExporter()
  // Skip sky, weather particles and helpers: anything not a mesh in the site.
  const keep = []
  r.scene.traverse((o) => {
    if ((o.isPoints || o.isLine || o.isSprite || o.userData?.noExport) && o.visible) {
      keep.push(o)
      o.visible = false
    }
  })
  try {
    return await exporter.parseAsync(r.scene, { binary: true, onlyVisible: true })
  } finally {
    keep.forEach((o) => { o.visible = true })
  }
}

/** Record `seconds` of the 3D view orbiting once around the site, as WebM. */
export async function recordOrbit(seconds = 8, onProgress) {
  const r = getRenderer()
  const controls = getControls()
  if (!r || !controls) throw new Error('3D view not ready')
  const canvas = r.gl.domElement
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => window.MediaRecorder?.isTypeSupported(t))
  if (!type) throw new Error('This browser cannot record video')
  const stream = canvas.captureStream(30)
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6e6 })
  const chunks = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise((resolve) => { rec.onstop = resolve })
  controls.saveState()
  rec.start(250)
  const start = performance.now()
  let last = start
  await new Promise((resolve) => {
    const step = (now) => {
      const t = (now - start) / 1000
      controls.rotate(((now - last) / 1000 / seconds) * Math.PI * 2, 0, false)
      last = now
      onProgress?.(Math.min(1, t / seconds))
      if (t < seconds) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
  rec.stop()
  await done
  controls.reset(true)
  return new Blob(chunks, { type: type.split(';')[0] })
}
