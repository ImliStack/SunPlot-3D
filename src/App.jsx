import { Component, useEffect, useMemo, useState } from 'react'
import Stage from './scene/Stage.jsx'
import Inputs from './ui/Inputs.jsx'
import Results from './ui/Results.jsx'
import Icon from './ui/Icon.jsx'
import TagLayer from './ui/TagLayer.jsx'
import Proposal from './ui/Proposal.jsx'
import { useSolar } from './store.js'
import { useCandidates, useLayout, useYield } from './hooks.js'
import { TOOLS, indexArrays, targetsFor, describe } from './installTools.js'
import { useWeather } from './scene/Weather.jsx'
import { PANELS } from './presets.js'
import { useHashLink } from './links.js'
import { useClimateFetch } from './climate.js'
import { useShadingStudy } from './shadingClient.js'
import { sunPosition, dayLength, dateLabel, hourLabel, dayOfYear } from './solar.js'

const RAD = Math.PI / 180

function Tools() {
  const st = useSolar.getState()
  const theme = useSolar((s) => s.theme)
  const trees = useSolar((s) => s.params.surroundings || s.params.closeTrees)
  const layers = useSolar((s) => s.layers)
  const hq = useSolar((s) => s.hq)
  const focus = useSolar((s) => !s.panels.left && !s.panels.right)
  const [copied, setCopied] = useState(false)
  const tool = (icon, tip, onClick, on = false) => (
    <button className={`tool ${on ? 'is-on' : ''}`} onClick={onClick} aria-label={tip} aria-pressed={on} data-tip={tip}>
      <Icon name={icon} />
    </button>
  )
  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {}
  }
  return (
    <div className="tools">
      <div className="tool-group">
        {tool('home', 'Overview', () => st.cameraCommand('home'))}
        {tool('front', 'Face the array', () => st.cameraCommand('front'))}
        {tool('side', 'Side', () => st.cameraCommand('side'))}
        {tool('top', 'Plan view', () => st.cameraCommand('top'))}
        {tool('zoomIn', 'Zoom in', () => st.cameraCommand('zoomIn'))}
        {tool('zoomOut', 'Zoom out', () => st.cameraCommand('zoomOut'))}
      </div>
      <div className="tool-group">
        {tool('tag', 'Array tags', () => st.toggleLayer('labels'), layers.labels)}
        {tool('zone', 'Setbacks & keep-outs', () => st.toggleLayer('zones'), layers.zones)}
        {tool('dims', 'Dimensions', () => st.toggleLayer('dims'), layers.dims)}
        {tool('heat', 'Shade heat-map', () => st.toggleLayer('shade'), layers.shade)}
        {tool('tree', trees ? 'Hide all trees & road' : 'Show trees & road', () => st.patch(trees ? { surroundings: false, closeTrees: false } : { surroundings: true }), trees)}
      </div>
      <div className="tool-group">
        {tool('focus', 'Focus mode — hide both panels · \\', () => st.togglePanel('focus'), focus)}
        {tool('hq', hq ? 'High quality (ambient occlusion) on' : 'High quality off — faster', st.toggleHq, hq)}
        {tool(theme === 'dark' ? 'sun' : 'moon', theme === 'dark' ? 'Light theme' : 'Dark theme', st.toggleTheme)}
        <Proposal />
        {tool('camera', 'Save image', st.takeSnapshot)}
        {tool(copied ? 'check' : 'link', copied ? 'Link copied' : 'Copy link to this design', share)}
      </div>
    </div>
  )
}

/** HUD compass: the needle points north whichever way the camera looks. */
function HudCompass() {
  const heading = useSolar((s) => s.heading)
  const go = useSolar((s) => s.cameraCommand)
  return (
    <button className="hud-compass" onClick={() => go('top')} aria-label={`Camera looking ${Math.round(heading)}°. Show plan view`} data-tip="Plan view">
      <svg viewBox="-20 -20 40 40" style={{ transform: `rotate(${-heading}deg)` }} aria-hidden="true">
        <circle r="18" className="ring" />
        <path d="M0 -14 4 0 0 -2 -4 0z" className="n" />
        <path d="M0 14 4 0 0 2 -4 0z" className="s" />
        <text y="-15.5" className="nl">N</text>
      </svg>
    </button>
  )
}

function Legend() {
  const zones = useSolar((s) => s.layers.zones)
  const shade = useSolar((s) => s.layers.shade)
  if (!zones && !shade) return null
  return (
    <div className="legend-box" aria-label="Overlay legend">
      {zones && <span><i className="sw zone" />Usable area (setbacks)</span>}
      {zones && <span><i className="sw keep" />Keep-out around obstacles</span>}
      {shade && <span className="heat-legend"><i className="heat" />Beam lost to shade: 0 → 25 %+</span>}
    </div>
  )
}

/**
 * Click-to-install: mode switch, tool palette (module / row / column / array / paint), undo/redo,
 * fill & clear, a live counter and a hint for what the next click does.
 */
function InstallBar() {
  const install = useSolar((s) => s.install)
  const hover = useSolar((s) => s.hover)
  const candidates = useCandidates()
  const params = useSolar((s) => s.params)
  const { setInstallMode, setTool, applyKeys, undo, redo } = useSolar.getState()
  const manual = install.mode === 'manual'
  const watt = PANELS[params.panel].watt
  const all = useMemo(() => candidates.panels.map((p) => p.key), [candidates])
  const byArray = useMemo(() => indexArrays(candidates), [candidates])
  const done = all.filter((k) => install.sel[k]).length
  if (import.meta.env.DEV) window.__installKeys = all

  useEffect(() => {
    if (!manual) return
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (mod || e.altKey) return
      const t = TOOLS.find((x) => x.shortcut.toLowerCase() === e.key.toLowerCase())
      if (t) setTool(t.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [manual, undo, redo, setTool])

  let hint = ''
  if (manual) {
    if (hover != null && candidates.panels[hover]) {
      const targets = targetsFor(candidates, byArray, hover, install.tool)
      const installing = !install.sel[candidates.panels[hover].key]
      hint = install.tool === 'paint'
        ? `Press and drag to ${installing ? 'install' : 'remove'} modules · ${candidates.arrays[candidates.panels[hover].arr].name}`
        : describe(candidates, targets, install.tool, installing)
    } else {
      hint = done ? 'Pick a tool, then click glowing slots to add or installed modules to remove' : 'Click a glowing slot to install — or Fill all, then remove what you don’t want'
    }
  }

  return (
    <div className="install-wrap">
      <div className="install-bar">
        <div className="seg small" role="radiogroup" aria-label="Layout mode">
          <button role="radio" aria-checked={!manual} className={!manual ? 'is-on' : ''} onClick={() => setInstallMode('auto')}>Auto layout</button>
          <button role="radio" aria-checked={manual} className={manual ? 'is-on' : ''} onClick={() => setInstallMode('manual')}>Click to install</button>
        </div>
        {manual && (
          <>
            <div className="tool-seg" role="radiogroup" aria-label="Install tool">
              {TOOLS.map((t) => (
                <button key={t.key} role="radio" aria-checked={install.tool === t.key} className={install.tool === t.key ? 'is-on' : ''}
                  onClick={() => setTool(t.key)} data-tip={`${t.label} — ${t.hint} · ${t.shortcut}`} aria-label={`${t.label} tool`}>
                  <Icon name={t.icon} size={15} /><span>{t.label}</span>
                </button>
              ))}
            </div>
            <div className="tool-seg">
              <button onClick={undo} disabled={!install.past.length} data-tip="Undo · Ctrl/⌘ Z" aria-label="Undo"><Icon name="undo" size={15} /></button>
              <button onClick={redo} disabled={!install.future.length} data-tip="Redo · Shift Ctrl/⌘ Z" aria-label="Redo"><Icon name="redo" size={15} /></button>
            </div>
            <span className="install-count"><b>{done}</b> / {all.length} · {((done * watt) / 1000).toFixed(1)} kWp</span>
            <button className="mini-chip" onClick={() => applyKeys(all, true)} disabled={done === all.length}>Fill all</button>
            <button className="mini-chip" onClick={() => applyKeys(all, false)} disabled={!done}>Clear</button>
          </>
        )}
      </div>
      {manual && <div className="install-hint">{hint}</div>}
    </div>
  )
}

const DAYS = [
  ['Winter', dayOfYear(11, 21)],
  ['Equinox', dayOfYear(2, 20)],
  ['Summer', dayOfYear(5, 21)],
]

function SunBar() {
  const { lat, day, hour } = useSolar((s) => s.params)
  const playing = useSolar((s) => s.playing)
  const { set, togglePlay } = useSolar.getState()
  const span = dayLength(lat, day)
  const pos = sunPosition(lat, day, hour)
  const alt = pos.alt / RAD
  // Winter/summer swap in the southern hemisphere.
  const days = lat >= 0 ? DAYS : DAYS.map(([l], i) => [l, DAYS[2 - i][1]])
  return (
    <div className="sunbar">
      <button className="play" onClick={togglePlay} aria-label={playing ? 'Pause the day' : 'Play the day'}>
        <Icon name={playing ? 'pause' : 'play'} size={18} />
      </button>
      <div className="sun-sliders">
        <label className="sun-row">
          <span className="sun-key">{hourLabel(hour)}</span>
          <input type="range" min={0} max={24} step={0.05} value={hour} aria-label="Solar time"
            style={{ '--p': `${(hour / 24) * 100}%` }} onChange={(e) => set('hour', Number(e.target.value))} />
          <span className="sun-meta">{span ? `${hourLabel(span[0])}–${hourLabel(span[1])}` : 'polar night'}</span>
        </label>
        <label className="sun-row">
          <span className="sun-key">{dateLabel(day)}</span>
          <input type="range" min={1} max={365} step={1} value={day} aria-label="Day of year"
            style={{ '--p': `${((day - 1) / 364) * 100}%` }} onChange={(e) => set('day', Number(e.target.value))} />
          <span className="sun-days">
            {days.map(([l, d]) => (
              <button key={l} className={`mini-chip ${Math.abs(d - day) < 2 ? 'is-on' : ''}`} onClick={() => set('day', d)}>{l}</button>
            ))}
          </span>
        </label>
      </div>
      <WeatherPick />
      <div className="sun-read">
        <span><b>{alt > 0 ? alt.toFixed(0) : '—'}°</b> altitude</span>
        <span><b>{alt > 0 ? (pos.az / RAD).toFixed(0) : '—'}°</b> azimuth</span>
      </div>
    </div>
  )
}

const WEATHER = [['auto', 'Auto'], ['clear', 'Clear'], ['rain', 'Rain'], ['snow', 'Snow']]

/** Weather for the 3D view: forced, or Auto = this month's typical weather from the data. */
function WeatherPick() {
  const value = useSolar((s) => s.params.weather)
  const set = useSolar((s) => s.set)
  const w = useWeather()
  return (
    <div className="weather-pick">
      <div className="seg small" role="radiogroup" aria-label="Weather">
        {WEATHER.map(([k, label]) => (
          <button key={k} role="radio" aria-checked={value === k} className={value === k ? 'is-on' : ''} onClick={() => set('weather', k)}>
            {k === 'auto' ? <>{label} · <Icon name={w.kind === 'clear' ? 'sun' : w.kind} size={13} /></> : label}
          </button>
        ))}
      </div>
      <span className="weather-note" title={w.note}>{w.note}</span>
    </div>
  )
}

/** What the current weather does to the modules, in one line over the scene. */
function WeatherEffect() {
  const w = useWeather()
  const layout = useLayout()
  const y = useYield(layout)
  const cleanDays = useSolar((s) => s.params.cleanDays)
  if (w.kind === 'clear') return null
  const pct = (v) => `${Math.round((v ?? 0) * 100)} %`
  const tilt = layout.arrays[0]?.tilt ?? 0
  const text = w.kind === 'snow'
    ? `Snow: at ${Math.round(tilt)}° modules shed it in ~${(0.5 + 3 * Math.max(0, 1 - tilt / 60)).toFixed(1)} days · ${y.snowMonths ? `typical ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][w.month]} loss ${pct(y.snowMonths[w.month])}` : 'loss needs climate data'}`
    : `Rain washes dust off — soiling this month ${y.soilMonths ? pct(y.soilMonths[w.month]) : '…'}${cleanDays ? ` (with cleaning every ${cleanDays} days)` : ' (rain-only cleaning)'} · clouds cut direct sun`
  return <div className={`weather-effect is-${w.kind}`}><Icon name={w.kind} size={15} />{text}</div>
}

class StageBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) {
      return <div className="no-webgl"><Icon name="info" size={22} /><p>This browser can’t draw the 3D view (WebGL is off or unsupported). The numbers on the right still work.</p></div>
    }
    return this.props.children
  }
}

/** Edge handles that fold the side panels away to give the 3D view the full width. */
function PanelToggles() {
  const panels = useSolar((s) => s.panels)
  const toggle = useSolar((s) => s.togglePanel)
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '[') toggle('left')
      if (e.key === ']') toggle('right')
      if (e.key === '\\') toggle('focus')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])
  const btn = (side, open, label) => (
    <button className={`edge-toggle is-${side}`} onClick={() => toggle(side)} aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} ${label}`} data-tip={`${open ? 'Hide' : 'Show'} ${label} · ${side === 'left' ? '[' : ']'}`}>
      <Icon name={(side === 'left') === open ? 'chevL' : 'chevR'} size={16} />
    </button>
  )
  return (
    <>
      {btn('left', panels.left, 'inputs')}
      {btn('right', panels.right, 'results')}
    </>
  )
}

export default function App() {
  const theme = useSolar((s) => s.theme)
  const panels = useSolar((s) => s.panels)
  useHashLink()
  useClimateFetch()
  useShadingStudy()
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  return (
    <div className={`app ${panels.left ? '' : 'no-left'} ${panels.right ? '' : 'no-right'}`}>
      <Inputs />
      <main className="stage">
        <StageBoundary><Stage /></StageBoundary>
        <TagLayer />
        <Tools />
        <PanelToggles />
        <HudCompass />
        <Legend />
        <InstallBar />
        <WeatherEffect />
        <SunBar />
      </main>
      <Results />
    </div>
  )
}
