import { useEffect, useRef, useState } from 'react'
import { useSolar } from '../store.js'
import { PANELS, SITES, CLIMATES, PLACES, SHOWS, bestTilt } from '../presets.js'
import { geocode } from '../installations.js'
import Icon from './Icon.jsx'

const compass = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((az % 360) + 360) % 360) / 45) % 8]
const HOUSES = ['gable', 'hip', 'lshape', 'shed']

/** Slider with an editable number beside it. Hidden when this site type has no such input. */
export function Field({ k, label, min, max, step = 1, unit = '', format, hint }) {
  const value = useSolar((s) => s.params[k])
  const site = useSolar((s) => s.params.site)
  const set = useSolar((s) => s.set)
  if (SHOWS[k] && !SHOWS[k].includes(site)) return null
  const clamp = (v) => Math.min(max, Math.max(min, v))
  return (
    <label className="field">
      <span className="field-head">
        <span className="field-label">{label}</span>
        <span className="field-value">
          <input type="number" value={value} min={min} max={max} step={step}
            onChange={(e) => e.target.value !== '' && set(k, clamp(Number(e.target.value)))} aria-label={label} />
          <span className="unit">{format ? format(value) : unit}</span>
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))}
        style={{ '--p': `${((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100}%` }}
        onChange={(e) => set(k, Number(e.target.value))} aria-label={`${label} slider`} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

function Toggle({ k, label, hint }) {
  const value = useSolar((s) => s.params[k])
  const site = useSolar((s) => s.params.site)
  const set = useSolar((s) => s.set)
  if (SHOWS[k] && !SHOWS[k].includes(site)) return null
  return (
    <label className="toggle">
      <span>
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <input type="checkbox" checked={value} onChange={(e) => set(k, e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  )
}

function Section({ title, icon, children, aside }) {
  return (
    <section className="section">
      <h2 className="section-title"><Icon name={icon} size={16} />{title}{aside}</h2>
      {children}
    </section>
  )
}

function SitePicker() {
  const site = useSolar((s) => s.params.site)
  const setSite = useSolar((s) => s.setSite)
  const groups = [...new Set(Object.values(SITES).map((s) => s.group))]
  return (
    <div className="site-picker" role="radiogroup" aria-label="Site type">
      {groups.map((g) => (
        <div key={g} className="site-group">
          <span className="site-group-label">{g}</span>
          <div className="site-grid">
            {Object.entries(SITES).filter(([, s]) => s.group === g).map(([key, s]) => (
              <button key={key} role="radio" aria-checked={site === key} title={s.hint}
                className={`site-card ${site === key ? 'is-on' : ''}`} onClick={() => setSite(key)}>
                <Icon name={key} size={20} />
                <span>{s.short}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="site-hint">{SITES[site].hint}</p>
    </div>
  )
}

/** Search any town or address (Open-Meteo geocoding), or use the device location. */
function PlaceSearch() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const [state, setState] = useState('idle')
  const [active, setActive] = useState(0)
  const goTo = useSolar((s) => s.goTo)
  const abort = useRef(null)
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([])
      return
    }
    const t = setTimeout(async () => {
      abort.current?.abort()
      abort.current = new AbortController()
      setState('loading')
      try {
        setHits(await geocode(q.trim(), abort.current.signal))
        setState('idle')
        setActive(0)
      } catch (err) {
        if (err.name !== 'AbortError') setState('error')
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q])
  const pick = (h) => {
    goTo({ lat: h.lat, lon: h.lon, name: h.name })
    setQ('')
    setHits([])
  }
  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => goTo({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'My location' }),
      () => setState('error'),
    )
  }
  return (
    <div className="place-search">
      <div className="search">
        <Icon name="search" size={16} />
        <input value={q} placeholder="Search a city, town or site" aria-label="Search location"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            if (e.key === 'Enter' && hits[active]) pick(hits[active])
            if (e.key === 'Escape') setQ('')
          }} />
        {state === 'loading' && <span className="spinner" aria-label="Searching" />}
        <button className="ghost-btn" onClick={locate} data-tip="Use my location" aria-label="Use my location"><Icon name="locate" size={16} /></button>
      </div>
      {hits.length > 0 && (
        <ul className="results-list" role="listbox">
          {hits.map((h, i) => (
            <li key={`${h.lat},${h.lon}`} role="option" aria-selected={i === active} className={i === active ? 'is-active' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(h) }} onMouseEnter={() => setActive(i)}>
              <span>{h.name}</span><small>{h.where}</small>
            </li>
          ))}
        </ul>
      )}
      {state === 'error' && <span className="field-hint">Search is offline — use the quick picks or the sliders.</span>}
    </div>
  )
}

function ClimateStatus() {
  const climate = useSolar((s) => s.climate)
  const useMeasured = useSolar((s) => s.useMeasured)
  if (climate.status === 'loading') return <span className="badge is-wait"><span className="spinner" />Fetching 10-year climate…</span>
  if (climate.status === 'error') return <span className="badge is-warn">Climate data offline — using the climate class below</span>
  if (climate.status === 'ready') {
    const y = climate.data.years
    return <span className={`badge ${useMeasured ? 'is-ok' : ''}`}><Icon name="cloud" size={14} />NASA POWER {y[0]}–{y[y.length - 1]}{useMeasured ? ' · in use' : ' · off'}</span>
  }
  return null
}

export default function Inputs() {
  const p = useSolar((s) => s.params)
  const { set, setPlace, reset } = useSolar.getState()
  const isHouse = HOUSES.includes(p.site)
  const isCanopy = ['carport', 'busstop'].includes(p.site)
  const structure = isHouse ? 'Building' : p.site === 'ground' ? 'Plot' : isCanopy ? 'Structure' : p.site === 'airport' ? 'Terminal & car park' : 'Building'

  return (
    <aside className="inputs" aria-label="Design inputs">
      <div className="brand-row">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); reset() }}>
          <span className="brand-mark" aria-hidden="true" />SunPlot
        </a>
        <button className="ghost-btn" onClick={reset} data-tip="Reset all inputs" aria-label="Reset all inputs"><Icon name="reset" size={16} /></button>
      </div>
      <p className="lede">Lay out PV on homes, buildings, carports, shelters, airports or open land — with measured climate.</p>

      <SitePicker />

      <Section title="Location" icon="pin">
        <div className="loc-head">
          <strong>{p.placeName || 'Custom location'}</strong>
          <small>{Math.abs(p.lat).toFixed(2)}° {p.lat >= 0 ? 'N' : 'S'} · {Math.abs(p.lon).toFixed(2)}° {p.lon >= 0 ? 'E' : 'W'}</small>
        </div>
        <ClimateStatus />
        <PlaceSearch />
        <div className="chips">
          {PLACES.map((pl) => (
            <button key={pl.key} className={`chip ${p.place === pl.key ? 'is-on' : ''}`} onClick={() => setPlace(pl.key)}>{pl.label}</button>
          ))}
        </div>
        <Field k="lat" label="Latitude" min={-60} max={60} step={0.01} format={(v) => `° ${v >= 0 ? 'N' : 'S'}`} />
        <Field k="lon" label="Longitude" min={-180} max={180} step={0.01} format={(v) => `° ${v >= 0 ? 'E' : 'W'}`} />
        <label className="field">
          <span className="field-head"><span className="field-label">Climate class (fallback)</span></span>
          <select value={p.climate} onChange={(e) => set('climate', e.target.value)}>
            {Object.entries(CLIMATES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </select>
        </label>
      </Section>

      <Section title={structure} icon={isHouse ? 'home' : SITES[p.site] ? p.site : 'ruler'}>
        <Field k="length" label={p.site === 'busstop' ? 'Shelter length' : p.site === 'airport' ? 'Terminal length' : HOUSES.includes(p.site) && p.site !== 'shed' ? 'Length (along ridge)' : 'Length'}
          min={p.site === 'busstop' ? 3 : 4} max={p.site === 'airport' ? 600 : p.site === 'ground' ? 300 : 80} step={0.5} unit="m" />
        <Field k="width" label={p.site === 'busstop' ? 'Shelter depth' : p.site === 'airport' ? 'Terminal depth' : 'Width'}
          min={p.site === 'busstop' ? 1.5 : 4} max={p.site === 'airport' ? 200 : p.site === 'ground' ? 200 : p.site === 'busstop' ? 5 : 60} step={0.1} unit="m" />
        <Field k="wingLength" label="Wing length (beyond main)" min={3} max={20} step={0.5} unit="m" />
        <Field k="wingWidth" label="Wing width" min={3} max={14} step={0.5} unit="m" />
        <Field k="floors" label="Floors" min={1} max={p.site === 'flat' ? 12 : p.site === 'airport' ? 6 : 4} />
        <Field k="pitch" label="Roof pitch" min={5} max={50} unit="°" />
        <Field k="shelters" label="Shelters" min={1} max={8} />
        <Field k="bays" label="Bays per canopy side" min={2} max={60} hint="2.5 m × 5 m bays; columns every 3 bays." />
        <Field k="canopyRows" label="Canopy rows" min={1} max={12} />
        <Toggle k="doubleRow" label="Double-row (Y-frame)" hint="One canopy over two facing bay rows." />
        <Field k="canopyClear" label="Clear height" min={2.2} max={6} step={0.1} unit="m" hint={p.site === 'busstop' ? undefined : '2.7–3 m for cars, 4.5 m+ for fire access.'} />
        <Field k="canopyTilt" label="Canopy tilt" min={0} max={15} unit="°" />
        <Field k="azimuth" label={isHouse ? 'Main roof faces' : 'Array faces'} min={0} max={359} format={(v) => `° ${compass(v)}`} hint="Compass bearing: 180° is due south." />
      </Section>

      {(isHouse || ['flat', 'airport'].includes(p.site)) && (
        <Section title="Roof obstacles" icon="zone">
          <Toggle k="chimney" label="Chimney" hint="Kept 0.3 m clear on every side." />
          {p.chimney && <Field k="chimneyX" label="Chimney position" min={-0.9} max={0.9} step={0.05} format={(v) => (v < -0.05 ? 'left' : v > 0.05 ? 'right' : 'centre')} />}
          <Field k="vents" label={isHouse ? 'Plumbing vents' : 'HVAC units'} min={0} max={isHouse ? 4 : 12} />
        </Section>
      )}

      <Section title="Modules" icon="panel">
        <label className="field">
          <span className="field-head"><span className="field-label">Module</span></span>
          <select value={p.panel} onChange={(e) => set('panel', e.target.value)}>
            {Object.entries(PANELS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          <span className="field-hint">{PANELS[p.panel].note}</span>
        </label>
        <div className="seg" role="radiogroup" aria-label="Orientation">
          <button role="radio" aria-checked={p.portrait} className={p.portrait ? 'is-on' : ''} onClick={() => set('portrait', true)}>Portrait</button>
          <button role="radio" aria-checked={!p.portrait} className={!p.portrait ? 'is-on' : ''} onClick={() => set('portrait', false)}>Landscape</button>
        </div>
        <Field k="rackTilt" label="Rack tilt" min={5} max={35} unit="°" />
        <Field k="groundTilt" label="Tilt" min={0} max={60} unit="°" hint={`Best fixed tilt here ≈ ${bestTilt(p.lat)}°`} />
        <Field k="stack" label="Modules per table (up slope)" min={1} max={4} />
        <Field k="clearance" label="Ground clearance" min={0.3} max={2.5} step={0.1} unit="m" />
        <Field k="target" label="Target size" min={0} max={{ ground: 5000, airport: 5000, carport: 2000, flat: 500, busstop: 100 }[p.site] ?? 30} step={0.5}
          format={(v) => (v ? 'kWp' : 'kWp · fill')} hint="0 fills all the usable space." />
        <Toggle k="bothFaces" label="Use every roof plane" hint="Also planes facing away from the sun." />
        <Field k="cleanDays" label="Cleaning interval" min={0} max={120} format={(v) => (v ? 'days' : 'days · rain only')} hint="Washing resets dust; rain does too." />
      </Section>

      <Section title="Shading" icon="tree">
        <Toggle k="closeTrees" label="Mature trees next to the site" hint="Adds tall trees east, south and west — shading is ray-cast all year." />
        <Toggle k="surroundings" label="Context trees & road" hint="Distant trees; they also count when shading." />
      </Section>

      {(isHouse || ['flat', 'ground', 'airport'].includes(p.site)) && (
        <Section title="Setbacks" icon="ruler">
          <Field k="edge" label={p.site === 'ground' ? 'Fence setback' : 'Edge / hip setback'} min={0} max={5} step={0.05} unit="m" />
          <Field k="ridge" label={p.site === 'shed' ? 'Top-edge setback' : 'Ridge setback'} min={0} max={2} step={0.05} unit="m"
            hint="Fire codes: 18″ (0.45 m) at ridges and hips, 36″ pathways." />
        </Section>
      )}

      <Section title="Economics" icon="coin">
        <div className="pair">
          <label className="field mini">
            <span className="field-label">Currency</span>
            <input className="text" value={p.cur} maxLength={4} onChange={(e) => set('cur', e.target.value)} />
          </label>
          <label className="field mini">
            <span className="field-label">Cost / Wp</span>
            <input className="text" type="number" min={0} step={0.1} value={p.cost} onChange={(e) => set('cost', Math.max(0, Number(e.target.value)))} />
          </label>
          <label className="field mini">
            <span className="field-label">Tariff / kWh</span>
            <input className="text" type="number" min={0} step={0.01} value={p.tariff} onChange={(e) => set('tariff', Math.max(0, Number(e.target.value)))} />
          </label>
        </div>
      </Section>
    </aside>
  )
}
