import { useEffect, useMemo, useRef, useState } from 'react'
import { useSolar } from '../store.js'
import { useLayout, useYield, shadingKey } from '../hooks.js'
import { geocode } from '../installations.js'
import { autocomplete } from './places.js'
import { PANELS } from '../presets.js'
import { SITE_SIZES } from '../store.js'
import { fetchBuildings } from './osm.js'
import { surveyToParams } from './apply.js'
import { computeLayout } from '../layout.js'
import { area, openRing, toLocal } from './geo.js'
import { subsidy, isSpecialState, sizeSystem, rankZones, bestModules, placementAdvice, MAKERS } from './sizing.js'
import SurveyMap from './SurveyMap.jsx'
import { POI_CATS, CAT_BY_KEY } from './poi.js'
import Icon from '../ui/Icon.jsx'
import Brand from '../ui/Brand.jsx'
import PanelToggles from '../ui/PanelToggles.jsx'

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—')
const inr = (n) => `₹${fmt(Math.round(n))}`

/** A numbered step card; `summary` shows on the right once the step is done. */
function Step({ n, title, done, summary, children }) {
  return (
    <section className={`survey-step ${done ? 'is-done' : ''}`}>
      <h2>
        <span className="step-n">{done ? <Icon name="check" size={13} /> : n}</span>
        <span className="step-title">{title}</span>
        {done && summary && <span className="step-sum">{summary}</span>}
      </h2>
      <div className="step-body">{children}</div>
    </section>
  )
}

/**
 * Google-style address box: suggestions as you type (Photon / OpenStreetMap, biased to the map
 * view), arrow keys + Enter, and "use my location" (blue dot + reverse address on the map).
 */
function FindHouse() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const sv = useSolar((s) => s.survey)
  const { patchSurvey } = useSolar.getState()

  useEffect(() => {
    const text = q.trim()
    if (text.length < 2 || !open) return setHits([])
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setBusy(true)
      const near = useSolar.getState().survey.view ?? useSolar.getState().survey.center
      try {
        setHits(await autocomplete(text, near, ctrl.signal))
        setActive(0)
      } catch (err) {
        if (err.name === 'AbortError') return
        // Photon down: fall back to town-level search.
        try {
          setHits((await geocode(text, ctrl.signal)).map((h) => ({ ...h, id: `${h.lat},${h.lon}`, kind: 'Town', state: h.where.split(',')[0] })))
        } catch {}
      } finally {
        if (!ctrl.signal.aborted) setBusy(false)
      }
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q, open])

  const pick = (h) => {
    patchSurvey({
      center: [h.lon, h.lat], pin: [h.lon, h.lat], address: [h.name, h.where].filter(Boolean).join(', '),
      state: h.state || useSolar.getState().survey.state, ring: null, draft: [], mumty: null, tank: null, neighbours: [],
    })
    setQ(h.name)
    setOpen(false)
  }
  const locate = () => patchSurvey({ locate: (useSolar.getState().survey.locate ?? 0) + 1, locError: '' })

  return (
    <div className="place-search">
      <div className="search">
        <Icon name="search" size={16} />
        <input value={q} placeholder="Search address or landmark" aria-label="Search address" role="combobox"
          aria-expanded={open && hits.length > 0} aria-autocomplete="list"
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            if (e.key === 'Enter' && hits[active]) pick(hits[active])
            if (e.key === 'Escape') setOpen(false)
          }} />
        {busy && <span className="spinner" aria-label="Searching" />}
        {q && <button className="ghost-btn" onClick={() => { setQ(''); setHits([]) }} aria-label="Clear search"><Icon name="close" size={14} /></button>}
        <button className="ghost-btn" onClick={locate} aria-label="Use my location" data-tip="Use my location"><Icon name="locate" size={16} /></button>
      </div>
      {open && hits.length > 0 && (
        <ul className="results-list" role="listbox">
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === active} className={i === active ? 'is-active' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(h) }} onMouseEnter={() => setActive(i)}>
              <span className="hit-line"><Icon name="pin" size={14} /><span>{h.name}</span><em>{h.kind}</em></span>
              <small>{h.where}</small>
            </li>
          ))}
          <li className="hit-credit" aria-hidden="true">Search by Photon · © OpenStreetMap</li>
        </ul>
      )}
      {sv.locError && <p className="field-hint warn">{sv.locError}</p>}
      {sv.address
        ? <p className="addr-chip"><Icon name="pin" size={14} /><span>{sv.address}{sv.state && !sv.address.includes(sv.state) ? ` · ${sv.state}` : ''}</span></p>
        : <p className="field-hint">Type a colony, street or landmark — or use your location.</p>}
    </div>
  )
}

/** Famous buildings near the map centre, by category — click one to survey its roof. */
function PlacesFinder() {
  const cats = useSolar((s) => s.survey.poiCats)
  const list = useSolar((s) => s.survey.poiList)
  const current = useSolar((s) => s.survey.poi)
  const { patchSurvey, selectPlace } = useSolar.getState()
  const toggle = (k) => patchSurvey({ poiCats: cats.includes(k) ? cats.filter((x) => x !== k) : [...cats, k] })
  const dist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`)
  return (
    <div className="places-finder">
      <span className="field-label">Or survey a public building nearby</span>
      <div className="chips cat-chips">
        {POI_CATS.map((c) => (
          <button key={c.key} className={`chip ${cats.includes(c.key) ? 'is-on' : ''}`} onClick={() => toggle(c.key)} aria-pressed={cats.includes(c.key)}>
            <i className="cat-dot" style={{ background: c.color }} />{c.label}
          </button>
        ))}
      </div>
      {cats.length > 0 && (
        list.length ? (
          <ul className="place-list">
            {list.slice(0, 12).map((p) => (
              <li key={p.id}>
                <button className={current?.id === p.id ? 'is-on' : ''} onClick={() => selectPlace(p)}>
                  <i className="cat-dot" style={{ background: CAT_BY_KEY[p.cat]?.color }} />
                  <span><b>{p.name}</b><small>{CAT_BY_KEY[p.cat]?.label.replace(/s$/, '')}{p.brand && p.brand !== p.name ? ` · ${p.brand}` : ''}</small></span>
                  <em>{dist(p.dist)}</em>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="field-hint">None of these mapped near the map centre — zoom out or move the map.</p>
      )}
    </div>
  )
}

function Steps() {
  const sv = useSolar((s) => s.survey)
  const floors = useSolar((s) => s.params.floors)
  const tariff = useSolar((s) => s.params.tariff)
  const { patchSurvey, set } = useSolar.getState()
  const roofM2 = sv.ring ? area(openRing(sv.ring).map((p) => toLocal(p, sv.ring[0]))) : 0
  const mark = (k, label, icon) => (
    <button className={`mark-tile ${sv[k] ? 'is-set' : ''} ${sv.tool === k ? 'is-on' : ''}`}
      onClick={() => patchSurvey({ tool: sv.tool === k ? 'pick' : k })}>
      <Icon name={icon} size={18} />
      <span><b>{label}</b><small>{sv.tool === k ? 'Click on the roof…' : sv[k] ? 'Placed · drag to move' : 'Place on map'}</small></span>
      {sv[k] && <span className="x" role="button" aria-label={`Remove ${label}`} onClick={(e) => { e.stopPropagation(); patchSurvey({ [k]: null }) }}><Icon name="close" size={12} /></span>}
    </button>
  )
  return (
    <aside className="inputs survey-steps" aria-label="Site survey steps">
      <Brand />
      <p className="lede">Survey a roof without a site visit — SunPlot suggests the system, where it goes and the cost after subsidy.</p>

      <Step n={1} title="Find the building" done={!!(sv.center || sv.poi)}>
        <FindHouse />
        <PlacesFinder />
      </Step>

      <Step n={2} title="Outline the roof" done={!!sv.ring} summary={sv.ring ? `${fmt(roofM2)} m²` : ''}>
        <div className="seg" role="radiogroup" aria-label="Outline tool">
          <button role="radio" aria-checked={sv.tool !== 'draw'} className={sv.tool !== 'draw' ? 'is-on' : ''} onClick={() => patchSurvey({ tool: 'pick' })}><Icon name="target" size={14} /> Pick building</button>
          <button role="radio" aria-checked={sv.tool === 'draw'} className={sv.tool === 'draw' ? 'is-on' : ''} onClick={() => patchSurvey({ tool: 'draw', draft: [] })}><Icon name="zone" size={14} /> Draw outline</button>
        </div>
        <p className="field-hint">
          {sv.tool === 'draw' ? 'Click each roof corner; click the first corner again to close.' : 'Click your building on the map. If the outline sits off the photo, draw it.'}
        </p>
        <div className="row-inline">
          <span className="field-label">Floors</span>
          <span className="stepper">
            <button onClick={() => set('floors', Math.max(1, floors - 1))} aria-label="One floor less">−</button>
            <b>{floors}</b>
            <button onClick={() => set('floors', Math.min(12, floors + 1))} aria-label="One floor more">+</button>
          </span>
          {sv.ring && <button className="link-btn small" onClick={() => patchSurvey({ ring: null })}>Clear outline</button>}
        </div>
        {sv.ring && <p className="field-hint">{fmt(roofM2)} m² ({fmt(roofM2 * 10.764)} sq ft){sv.levels ? ` · map says ${sv.levels} floors` : ''}</p>}
        <CampusCard />
      </Step>

      <Step n={3} title="On the terrace" done={!!(sv.mumty || sv.tank)} summary={[sv.mumty && 'stair room', sv.tank && 'tank'].filter(Boolean).join(' + ')}>
        <div className="mark-grid">
          {mark('mumty', 'Stair room', 'home')}
          {mark('tank', 'Water tank', 'cloud')}
        </div>
        <div className="row-inline">
          <span className="field-label">Street side</span>
          <div className="seg four compact" role="radiogroup" aria-label="Street side">
            {['N', 'E', 'S', 'W'].map((d) => (
              <button key={d} role="radio" aria-checked={sv.front === d} className={sv.front === d ? 'is-on' : ''} onClick={() => patchSurvey({ front: d })}>{d}</button>
            ))}
          </div>
        </div>
      </Step>

      <Step n={4} title="Electricity use" done={sv.units > 0} summary={sv.units ? `${fmt(sv.units)} units/mo` : ''}>
        <div className="pair two">
          <label className="field mini"><span className="field-label">Units / month</span>
            <input className="text" type="number" min={0} value={sv.units} onChange={(e) => patchSurvey({ units: Math.max(0, Number(e.target.value)), bill: 0 })} /></label>
          <label className="field mini"><span className="field-label">or bill ₹ / month</span>
            <input className="text" type="number" min={0} value={sv.bill || ''} placeholder={`at ₹${tariff}/unit`} onChange={(e) => {
              const bill = Math.max(0, Number(e.target.value))
              patchSurvey({ bill, units: Math.round(bill / (tariff || 8)) })
            }} /></label>
          <label className="field mini"><span className="field-label">Sanctioned load kW</span>
            <input className="text" type="number" min={0} step={0.5} value={sv.sanctioned || ''} placeholder="on the bill" onChange={(e) => patchSurvey({ sanctioned: Math.max(0, Number(e.target.value)) })} /></label>
          <label className="field mini"><span className="field-label">Tariff ₹ / unit</span>
            <input className="text" type="number" min={0} step={0.1} value={tariff} onChange={(e) => set('tariff', Math.max(0, Number(e.target.value)))} /></label>
        </div>
        <label className="field mini"><span className="field-label">State (for subsidy rates)</span>
          <input className="text" value={sv.state} placeholder="e.g. Rajasthan" onChange={(e) => patchSurvey({ state: e.target.value })} /></label>
      </Step>
    </aside>
  )
}

/** Campus mode: several buildings (college blocks, hostels, hospital wings, factory sheds) summed. */
function CampusCard() {
  const sv = useSolar((s) => s.survey)
  const params = useSolar((s) => s.params)
  const layout = useLayout()
  const y = useYield(layout)
  const { patchSurvey } = useSolar.getState()
  const rows = useCampus(sv, params, y.specific)
  const total = rows.reduce((a, r) => ({ m2: a.m2 + r.m2, kwp: a.kwp + r.kwp, kwh: a.kwh + r.kwh, count: a.count + r.count }), { m2: 0, kwp: 0, kwh: 0, count: 0 })
  return (
    <div className="campus">
      <label className="toggle compact">
        <span><span className="field-label">Campus: several buildings</span><span className="field-hint">Click each block on the map; click again to drop it.</span></span>
        <input type="checkbox" checked={!!sv.campusMode} onChange={(ev) => patchSurvey({ campusMode: ev.target.checked, campus: ev.target.checked && sv.ring ? [{ id: 'first', ring: sv.ring, levels: sv.levels, name: 'Block A' }] : sv.campus })} />
        <span className="switch" aria-hidden="true" />
      </label>
      {sv.campusMode && rows.length > 0 && (
        <table className="arrays campus-table">
          <thead><tr><th>Block</th><th>Fl.</th><th>m²</th><th>kWp</th><th>MWh/yr</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={sv.ring === r.ring ? 'is-best' : ''}>
                <td><input className="campus-name" value={r.name} onChange={(ev) => patchSurvey({ campus: sv.campus.map((b) => (b.id === r.id ? { ...b, name: ev.target.value } : b)) })} /></td>
                <td>{r.floors}</td><td>{fmt(r.m2)}</td><td>{fmt(r.kwp, 1)}</td><td>{fmt(r.kwh / 1000, 1)}</td>
                <td>
                  <button className="mini-chip" title="Make this the block shown and opened in 3D" onClick={() => patchSurvey({ ring: r.ring, levels: r.levels })}>Open</button>
                  <button className="mini-chip" aria-label={`Remove ${r.name}`} onClick={() => patchSurvey({ campus: sv.campus.filter((b) => b.id !== r.id) })}>×</button>
                </td>
              </tr>
            ))}
            <tr className="is-total"><td>Total</td><td /><td>{fmt(total.m2)}</td><td>{fmt(total.kwp, 1)}</td><td>{fmt(total.kwh / 1000, 1)}</td><td /></tr>
          </tbody>
        </table>
      )}
      {sv.campusMode && rows.length > 0 && <p className="field-hint">Full roofs on elevated racks at {fmt(y.specific)} kWh/kWp (this site's yield). Parking can take carports: add them in the 3D studio.</p>}
    </div>
  )
}

/** Each campus block laid out as a terrace with the current module and setbacks. */
function useCampus(sv, params, specific) {
  return useMemo(() => {
    if (!sv.campusMode) return []
    return (sv.campus ?? []).map((b) => {
      const next = surveyToParams({ ...sv, ring: b.ring, mumty: null, tank: null, neighbours: [], buildings: [] })
      const floors = Math.max(1, Math.round(b.levels || params.floors))
      const L = computeLayout({ ...params, ...next, site: 'terrace', floors })
      const ring = openRing(b.ring)
      const m2 = area(ring.map((q) => toLocal(q, ring[0])))
      return { ...b, floors, m2, kwp: L.kwp, count: L.count, kwh: L.kwp * specific }
    })
  }, [sv, params, specific])
}

/** Everything the survey concludes, plus the hand-off to the 3D studio. */
function Results({ rec }) {
  const sv = useSolar((s) => s.survey)
  const params = useSolar((s) => s.params)
  const { openInStudio } = useSolar.getState()
  if (!sv.ring || !rec) {
    return (
      <aside className="results survey-results">
        <div className="empty">
          {sv.ring ? <><span className="spinner" /><p>Working out the layout…</p></> : <><Icon name="pin" size={22} /><p>Find the house and outline its roof — the suggestion appears here.</p></>}
        </div>
      </aside>
    )
  }
  // Carry the bill and the subsidy into the studio's money tab.
  const open = () => {
    useSolar.getState().patch({ useKwh: sv.units || 0, subsidy: rec.subsidy || 0 })
    openInStudio([...rec.keys])
  }
  const m = PANELS[params.panel]
  return (
    <aside className="results survey-results" aria-label="Survey results">
      {rec.poi && (
        <div className="poi-head">
          <i className="cat-dot" style={{ background: CAT_BY_KEY[rec.poi.cat]?.color }} />
          <span><b>{rec.poi.name}</b><small>{CAT_BY_KEY[rec.poi.cat]?.label.replace(/s$/, '')}{rec.poi.brand && rec.poi.brand !== rec.poi.name ? ` · ${rec.poi.brand}` : ''}</small></span>
        </div>
      )}
      {rec.poi && (
        <ul className="notes"><li><Icon name="info" size={15} />
          PM Surya Ghar subsidy is for homes only. {rec.poi.cat === 'school' || rec.poi.cat === 'college' || rec.poi.cat === 'hospital'
            ? 'Schools and hospitals often go solar through state schemes or a RESCO / PPA model (no upfront cost).'
            : 'Businesses can usually claim accelerated depreciation on solar — check with a tax adviser.'}
          {rec.poi.cat === 'fuel' ? ' At petrol pumps the canopy over the dispensers is the usual spot; this survey covers the main building roof.' : ''}
        </li></ul>
      )}
      <div className="hero">
        <div className="stat is-big"><span className="stat-value">{fmt(rec.size.kw, 1)}<small> kWp</small></span><span className="stat-label">suggested system</span></div>
        <div className="stat is-big"><span className="stat-value">{rec.size.modules}</span><span className="stat-label">× {m.watt} W modules</span></div>
        <div className="stat is-big"><span className="stat-value">{fmt(rec.size.cover * 100)}<small> %</small></span><span className="stat-label">of your use</span></div>
      </div>
      {rec.size.limit && (
        <ul className="notes"><li><Icon name="info" size={15} />
          {rec.size.limit === 'roof'
            ? `The terrace takes at most ${fmt(rec.roofKw, 1)} kWp; you would need ${fmt(rec.size.needKw, 1)} kWp to cover the whole bill.`
            : `Capped at your sanctioned load of ${fmt(sv.sanctioned, 1)} kW — ask the DISCOM to raise it to go bigger.`}
        </li></ul>
      )}

      <section className="card">
        <h3>Where on the roof</h3>
        <p className="advice">{rec.advice}</p>
        <table className="arrays">
          <thead><tr><th>Part of terrace</th><th>Fits</th><th>Shade</th><th>Sun</th></tr></thead>
          <tbody>
            {rec.zones.map((z, i) => (
              <tr key={z.key} className={i === 0 ? 'is-best' : ''}>
                <td>{z.name}{i === 0 ? ' · best' : ''}</td><td>{z.count}</td>
                <td>{rec.shaded ? `${fmt(z.shade * 100, 1)} %` : '…'}</td>
                <td><span className="sunbar-mini"><i style={{ width: `${z.energy * 100}%` }} /></span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="card-note">Navy rectangles on the map are the {rec.size.modules} least-shaded spots{rec.shaded ? '' : ' (shade study still running)'}. Shade comes from the stair room, tank, parapet and neighbouring buildings.</p>
      </section>

      <section className="card grid2">
        <div className="stat"><span className="stat-value">{fmt(rec.roofM2)}<small> m²</small></span><span className="stat-label">roof area</span></div>
        <div className="stat"><span className="stat-value">{fmt(rec.roofKw, 1)}<small> kWp</small></span><span className="stat-label">roof can take</span></div>
        <div className="stat"><span className="stat-value">{fmt(rec.yearly)}<small> kWh</small></span><span className="stat-label">per year</span></div>
        <div className="stat"><span className="stat-value">{fmt(rec.yearly / 12)}<small> kWh</small></span><span className="stat-label">per month (you use {fmt(rec.units)})</span></div>
      </section>

      <section className="card grid2">
        <div className="stat"><span className="stat-value">{inr(rec.cost)}</span><span className="stat-label">installed (₹{fmt(params.cost)}/W)</span></div>
        <div className="stat"><span className="stat-value">−{inr(rec.subsidy)}</span><span className="stat-label">{rec.residential ? `PM Surya Ghar subsidy${rec.special ? ' (special-category state)' : ''}` : 'no home subsidy (not a house)'}</span></div>
        <div className="stat"><span className="stat-value">{inr(rec.cost - rec.subsidy)}</span><span className="stat-label">your cost</span></div>
        <div className="stat"><span className="stat-value">{rec.payback ? fmt(rec.payback, 1) : '—'}<small> yr</small></span><span className="stat-label">payback ({inr(rec.savings)}/yr saved)</span></div>
      </section>

      <section className="card">
        <h3>Modules & installers</h3>
        <p className="card-note" style={{ marginTop: 0 }}>
          {m.dcr ? 'Subsidy needs DCR modules with Indian-made cells on MNRE’s ALMM List-II (from 1 June 2026). ' : 'This module is not DCR — pick a DCR module for the subsidy. '}
          Makers in the 545–625 W class include {MAKERS.join(', ')} (indicative, not an endorsement).
        </p>
        <a className="link-btn" href="https://pmsuryaghar.gov.in" target="_blank" rel="noreferrer">
          Find DISCOM-registered vendors{sv.state ? ` in ${sv.state}` : ''} on pmsuryaghar.gov.in ↗
        </a>
      </section>

      <button className="primary-btn" onClick={open}><Icon name="cube" size={16} />Open this design in the 3D studio</button>
      <p className="fine">Concept survey from Esri satellite imagery and Overture / OpenStreetMap outlines — confirm roof strength, shade and wiring on site before installing. Subsidy per MNRE PM Surya Ghar rules (Oct 2026); check pmsuryaghar.gov.in.</p>
    </aside>
  )
}

export default function Survey() {
  const sv = useSolar((s) => s.survey)
  const params = useSolar((s) => s.params)
  const install = useSolar((s) => s.install)
  const shading = useSolar((s) => s.shading)
  const { patchSurvey, patch, setInstallMode } = useSolar.getState()
  const layout = useLayout()
  const y = useYield(layout)

  // The survey works on the full auto layout; switch to it when the survey opens.
  useEffect(() => { if (useSolar.getState().install.mode !== 'auto') setInstallMode('auto') }, [setInstallMode])

  // Load building outlines around a searched address.
  const loadKey = useRef('')
  useEffect(() => {
    if (!sv.center) return
    const key = sv.center.join(',')
    if (loadKey.current === key) return
    loadKey.current = key
    const ctrl = new AbortController()
    patchSurvey({ status: 'loading', buildings: [] })
    fetchBuildings(sv.center[1], sv.center[0], 220, ctrl.signal)
      .then((buildings) => patchSurvey({ status: 'ready', buildings }))
      .catch((err) => !ctrl.signal.aborted && patchSurvey({ status: 'error', error: err.message }))
    return () => ctrl.abort()
  }, [sv.center, patchSurvey])

  // Push the survey into SunPlot's inputs whenever it changes.
  useEffect(() => {
    const next = surveyToParams(sv)
    if (!next) return
    const p = useSolar.getState().params
    // First time onto the terrace: subsidy-eligible DCR modules on an elevated structure, and an
    // installed price typical for DCR systems in India (≈ ₹60/W, Oct 2026 market notes).
    const first = p.site !== 'terrace' ? { ...SITE_SIZES.terrace, ...(p.cur === '₹' ? { cost: 60 } : {}) } : {}
    patch({ ...first, ...next })
  }, [sv.ring, sv.mumty, sv.tank, sv.front, sv.buildings, sv.levels, sv.address, patch]) // eslint-disable-line react-hooks/exhaustive-deps

  const rec = useMemo(() => {
    if (!sv.ring || params.site !== 'terrace') return null
    const shade = shading.status === 'ready' && shading.key === shadingKey(params, install) ? shading.perModule : null
    const watt = PANELS[params.panel].watt
    const units = sv.units || 0
    const roofKw = layout.kwp
    const size = sizeSystem({ unitsMonth: units, specific: y.specific, roofKw, sanctionedKw: sv.sanctioned, watt })
    const zones = rankZones(layout.panels, shade, sv.front)
    const pick = bestModules(shade, Math.min(size.modules, layout.panels.length))
    const keys = new Set(pick.map((i) => layout.panels[i].key))
    const avgShade = shade && pick.length ? pick.reduce((s, i) => s + shade[i], 0) / pick.length : 0
    const yearly = size.kw * y.specific * (1 + (y.shadingLoss ?? 0)) * (1 - 0.75 * avgShade)
    const cost = size.kw * 1000 * params.cost
    const special = isSpecialState(sv.state)
    // PM Surya Ghar covers homes only; schools, hospitals, shops and offices pay full price.
    const residential = !sv.poi
    const sub = residential ? subsidy(size.kw, special) : 0
    const savings = Math.min(yearly, units * 12) * params.tariff
    const ring = openRing(sv.ring)
    const roofM2 = area(ring.map((p) => toLocal(p, ring[0])))
    return {
      size, zones, keys, yearly, cost, subsidy: sub, special, savings, roofKw, roofM2, units,
      payback: savings ? (cost - sub) / savings : 0, shaded: !!shade,
      advice: placementAdvice(zones, sv.mumty, sv.tank),
      residential, poi: sv.poi,
    }
  }, [sv, params, layout, y, shading, install])

  const campusRows = useCampus(sv, params, y.specific)
  // Keep a summary for the proposal PDF.
  useEffect(() => {
    if (!rec) return
    const summary = {
      address: sv.address, state: sv.state, units: rec.units, kw: rec.size.kw, modules: rec.size.modules,
      roofM2: rec.roofM2, roofKw: rec.roofKw, yearly: rec.yearly, cost: rec.cost, subsidy: rec.subsidy,
      payback: rec.payback, advice: rec.advice, zones: rec.zones.map(({ name, count, shade }) => ({ name, count, shade })),
      cover: rec.size.cover, limit: rec.size.limit,
      campus: campusRows.length > 1 ? campusRows.map(({ name, floors, m2, kwp, kwh, count }) => ({ name, floors, m2, kwp, kwh, count })) : null,
    }
    const prev = useSolar.getState().survey.summary
    if (JSON.stringify(prev) !== JSON.stringify(summary)) patchSurvey({ summary })
  }, [rec, sv.address, sv.state, patchSurvey, campusRows])

  return (
    <>
      <Steps />
      <main className="stage survey-stage">
        <SurveyMap panels={layout.panels} recommended={rec?.keys} module={layout.module} />
        <PanelToggles />
        {sv.tool !== 'pick' && (
          <div className="install-hint survey-hint">
            {sv.tool === 'draw' ? `Drawing roof outline — ${sv.draft.length} corner${sv.draft.length === 1 ? '' : 's'}; click the first corner to close`
              : sv.tool === 'mumty' ? 'Click where the stair room (mumty) stands on the roof' : 'Click where the water tank stands'}
          </div>
        )}
      </main>
      <Results rec={rec} />
    </>
  )
}
