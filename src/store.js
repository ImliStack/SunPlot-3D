import { create } from 'zustand'
import { DEFAULTS, PLACES, bestTilt, equatorAzimuth } from './presets.js'
import { dayLength } from './solar.js'

function storedTheme() {
  try {
    const t = localStorage.getItem('solar-theme')
    if (t === 'light' || t === 'dark') return t
  } catch {}
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function storedPanels() {
  try {
    const v = JSON.parse(localStorage.getItem('solar-panels'))
    if (v && typeof v.left === 'boolean') return v
  } catch {}
  return { left: true, right: true }
}

// Starting sizes per site type, so switching type gives a sensible picture straight away.
const EMPTY_SURVEY = {
  center: null, // [lon, lat] searched
  pin: null, // [lon, lat] red pin (searched place, my location, or dragged)
  view: null, // map centre, to bias address suggestions
  locate: 0, // bumped to ask the map for the device location
  locError: '',
  address: '',
  state: '', // Indian state, for subsidy rates and the vendor list
  tool: 'pick', // pick | draw | mumty | tank
  buildings: [], // OSM buildings around the address
  status: 'idle', // idle | loading | ready | error
  error: '',
  ring: null, // chosen roof outline
  neighbours: [], // Overture buildings around it: [{ ring, height }]
  draft: [], // points while drawing
  levels: null,
  mumty: null,
  tank: null,
  front: 'S', // street side
  units: 300, // kWh per month
  bill: 0, // ₹ per month (alternative to units)
  sanctioned: 0, // kW, 0 = unknown
}

const EMPTY_INSTALL = { mode: 'auto', tool: 'module', sel: {}, anim: {}, past: [], future: [] }

export const SITE_SIZES = {
  terrace: { floors: 2, edge: 0.6, rackTilt: 20, panel: 'dcr580', portrait: true, stack: 1, elevated: true },
  gable: { length: 12, width: 9, floors: 2, pitch: 26, edge: 0.45, ridge: 0.45, panel: 'res430', portrait: true, vents: 2 },
  hip: { length: 14, width: 10, floors: 2, pitch: 24, edge: 0.45, ridge: 0.45, panel: 'res430', portrait: true, vents: 2 },
  lshape: { length: 14, width: 8, wingLength: 7, wingWidth: 7, floors: 2, pitch: 30, edge: 0.45, ridge: 0.45, panel: 'res430', portrait: true, vents: 1 },
  shed: { length: 11, width: 7, floors: 1, pitch: 14, edge: 0.45, ridge: 0.45, panel: 'res430', portrait: true, vents: 1 },
  flat: { length: 30, width: 18, floors: 3, edge: 1.2, panel: 'com550', portrait: true, stack: 1, vents: 2 },
  airport: { length: 160, width: 55, floors: 4, edge: 3, panel: 'com550', portrait: true, stack: 1, rackTilt: 10, vents: 6, bays: 40, canopyRows: 4, doubleRow: true, canopyClear: 3, canopyTilt: 5 },
  carport: { panel: 'com550', portrait: true, bays: 12, canopyRows: 2, doubleRow: true, canopyClear: 3, canopyTilt: 5 },
  busstop: { length: 10, width: 2.8, panel: 'res430', portrait: false, shelters: 2, canopyClear: 2.8, canopyTilt: 4 },
  ground: { length: 40, width: 26, edge: 2, panel: 'utl620', portrait: true, stack: 2 },
}

export const useSolar = create((set, get) => ({
  params: { ...DEFAULTS },
  theme: storedTheme(),
  playing: false,
  camera: { type: 'home', n: 0 },
  // Overlays: array tags, setback / keep-out outlines, overall dimensions.
  layers: { labels: true, zones: true, dims: false, shade: false },
  // High quality: ambient occlusion + antialiasing passes. Off by default on phones.
  hq: typeof matchMedia === 'undefined' || !matchMedia('(pointer: coarse)').matches,
  heading: 0, // compass bearing the camera looks towards, for the HUD compass
  // Measured climate (NASA POWER) for the current location: { status, key, data, error }
  climate: { status: 'idle' },
  // Ray-cast shading for the current design: { status, key, perArray[array][month], perModule, progress }
  shading: { status: 'idle' },
  // Click-to-install: installed module keys, their drop-in start times, the active tool and
  // undo / redo history of selections.
  install: { ...EMPTY_INSTALL },
  // App mode: the 3D design studio, or the map-based site survey.
  mode: 'studio',
  // Site survey, all in [lon, lat]: chosen building ring, stair room / tank points, neighbours, bill.
  survey: { ...EMPTY_SURVEY },
  // Module under the pointer in click-to-install mode (index into the candidate layout).
  hover: null,
  useMeasured: true,
  tab: 'system',
  // Side panels: collapsed state, remembered per browser.
  panels: storedPanels(),
  snap: 0,

  set: (key, value) => set((s) => ({ params: { ...s.params, [key]: value } })),
  patch: (values) => set((s) => ({ params: { ...s.params, ...values } })),

  setSite: (site) => {
    set((s) => ({ params: { ...s.params, site, ...SITE_SIZES[site] }, camera: { type: 'home', n: s.camera.n + 1 },
      install: { ...s.install, sel: {}, anim: {}, past: [], future: [] } }))
  },

  setPlace: (key) => {
    const place = PLACES.find((x) => x.key === key)
    if (!place) return
    const { label, key: _, ...rest } = place
    set((s) => ({
      params: { ...s.params, ...rest, place: key, placeName: label, groundTilt: bestTilt(place.lat), azimuth: equatorAzimuth(place.lat) },
    }))
  },

  reset: () => set((s) => ({ params: { ...DEFAULTS }, camera: { type: 'home', n: s.camera.n + 1 } })),

  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  toggleHq: () => set((s) => ({ hq: !s.hq })),
  setHeading: (heading) => set({ heading }),
  setClimate: (climate) => set({ climate }),
  setShading: (shading) => set({ shading }),
  setInstallMode: (mode) => set({ install: { ...EMPTY_INSTALL, tool: get().install.tool, mode } }),
  setTool: (tool) => set((s) => ({ install: { ...s.install, tool } })),
  /**
   * Install (value = true) or remove a set of modules. Newly installed modules get staggered
   * drop-in start times. `record: false` is used inside a paint stroke (recorded once at its start).
   */
  applyKeys: (keys, value, { record = true } = {}) => set((s) => {
    const sel = { ...s.install.sel }
    const anim = { ...s.install.anim }
    const now = performance.now()
    const changed = keys.filter((k) => !!sel[k] !== value)
    if (!changed.length) return {}
    const gap = Math.min(40, 1500 / changed.length)
    changed.forEach((k, i) => {
      if (value) {
        sel[k] = true
        anim[k] = now + i * gap
      } else {
        delete sel[k]
        delete anim[k]
      }
    })
    const past = record ? [...s.install.past, s.install.sel].slice(-60) : s.install.past
    return { install: { ...s.install, sel, anim, past, future: record ? [] : s.install.future } }
  }),
  /** Start a paint stroke: one undo step for the whole drag. */
  beginStroke: () => set((s) => ({ install: { ...s.install, past: [...s.install.past, s.install.sel].slice(-60), future: [] } })),
  undo: () => set((s) => {
    const past = [...s.install.past]
    const prev = past.pop()
    if (!prev) return {}
    return { install: { ...s.install, sel: prev, anim: {}, past, future: [s.install.sel, ...s.install.future] } }
  }),
  redo: () => set((s) => {
    const [next, ...future] = s.install.future
    if (!next) return {}
    return { install: { ...s.install, sel: next, anim: {}, past: [...s.install.past, s.install.sel], future } }
  }),
  setHover: (hover) => set({ hover }),
  setMode: (mode) => set({ mode }),
  /** Leave the survey for the studio with the recommended modules installed (click-to-install mode). */
  openInStudio: (keys) => set((s) => {
    const now = performance.now()
    const gap = Math.min(40, 1500 / Math.max(1, keys.length))
    return {
      mode: 'studio',
      install: { ...EMPTY_INSTALL, tool: s.install.tool, mode: 'manual',
        sel: Object.fromEntries(keys.map((k) => [k, true])),
        anim: Object.fromEntries(keys.map((k, i) => [k, now + 400 + i * gap])) },
      camera: { type: 'home', n: s.camera.n + 1 },
    }
  }),
  patchSurvey: (values) => set((s) => ({ survey: { ...s.survey, ...values } })),
  resetSurvey: () => set({ survey: { ...EMPTY_SURVEY } }),

  setUseMeasured: (useMeasured) => set({ useMeasured }),
  setTab: (tab) => set({ tab }),
  togglePanel: (side) => set((s) => {
    const panels = side === 'focus'
      ? (s.panels.left || s.panels.right ? { left: false, right: false } : { left: true, right: true })
      : { ...s.panels, [side]: !s.panels[side] }
    try { localStorage.setItem('solar-panels', JSON.stringify(panels)) } catch {}
    return { panels }
  }),
  goTo: ({ lat, lon, name, climate }) => set((s) => ({
    params: { ...s.params, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, place: '', placeName: name,
      groundTilt: bestTilt(lat), azimuth: equatorAzimuth(lat), ...(climate ? { climate } : {}) },
  })),
  cameraCommand: (type) => set((s) => ({ camera: { type, n: s.camera.n + 1 } })),
  togglePlay: () => {
    const { playing, params } = get()
    if (!playing) {
      // Start from sunrise when the day is already over.
      const span = dayLength(params.lat, params.day)
      if (span && params.hour >= span[1] - 0.1) set((s) => ({ params: { ...s.params, hour: span[0] } }))
    }
    set({ playing: !playing })
  },
  toggleTheme: () => set((s) => {
    const theme = s.theme === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem('solar-theme', theme) } catch {}
    return { theme }
  }),
  takeSnapshot: () => set((s) => ({ snap: s.snap + 1 })),
}))
