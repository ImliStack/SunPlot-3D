import { useEffect, useState } from 'react'
import { useSolar } from '../store.js'
import { useLayout, useYield } from '../hooks.js'
import { PANELS, CLIMATES } from '../presets.js'
import { MONTHS } from '../solar.js'
import { LANDMARKS, fetchNearby, distanceKm } from '../installations.js'
import { climateClass } from '../climate.js'
import Icon from './Icon.jsx'

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—')
const energy = (kwh) => (kwh >= 1e6 ? [fmt(kwh / 1e6, 2), 'GWh'] : kwh >= 1e4 ? [fmt(kwh / 1e3, 1), 'MWh'] : [fmt(kwh), 'kWh'])
const power = (kw) => (kw >= 1000 ? [fmt(kw / 1000, 2), 'MWp'] : [fmt(kw, 1), 'kWp'])
const money = (cur, n) => `${cur}${n >= 1e7 ? `${fmt(n / 1e6, 1)} M` : fmt(n)}`
const bearing = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8]
const LETTERS = 'ABCDEFGH'
const DEGRADE = 0.005 // per year, typical TOPCon linear warranty
const DC_AC = 1.2 // typical inverter loading ratio

function Stat({ value, unit, label, big, tip }) {
  return (
    <div className={`stat ${big ? 'is-big' : ''}`} title={tip}>
      <span className="stat-value">{value}{unit && <small> {unit}</small>}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

/** Monthly bars; optional whiskers (min–max over the years) and a reference dot per month. */
function Bars({ values, lo, hi, marks: mark, unit, digits = 0, height = 110 }) {
  const max = Math.max(...values, ...(hi ?? []), ...(mark ?? []), 1e-9)
  return (
    <div className="months" style={{ height }} role="img" aria-label={`Monthly values in ${unit}`}>
      {values.map((v, i) => (
        <div key={i} className="month" title={`${MONTHS[i]} · ${fmt(v, digits)} ${unit}${hi ? ` (range ${fmt(lo[i], digits)}–${fmt(hi[i], digits)})` : ''}`}>
          <span className="bar-track">
            <span className="bar" style={{ height: `${(v / max) * 100}%` }} />
            {hi && <span className="whisker" style={{ bottom: `${(lo[i] / max) * 100}%`, height: `${((hi[i] - lo[i]) / max) * 100}%` }} />}
            {mark && <span className="mark" style={{ bottom: `${(mark[i] / max) * 100}%` }} />}
          </span>
          <span className="month-label">{MONTHS[i][0]}</span>
        </div>
      ))}
    </div>
  )
}

/** A small line chart (temperature) on the same 12-month axis. */
function Line12({ values, values2, unit }) {
  const all = [...values, ...(values2 ?? [])]
  const lo = Math.floor(Math.min(...all) - 2)
  const hi = Math.ceil(Math.max(...all) + 2)
  const y = (v) => 56 - ((v - lo) / (hi - lo)) * 52
  const pts = (vs) => vs.map((v, i) => `${(i + 0.5) * (100 / 12)},${y(v)}`).join(' ')
  return (
    <svg className="line12" viewBox="0 0 100 60" preserveAspectRatio="none" role="img" aria-label={`Monthly ${unit}`}>
      {values2 && <polyline points={pts(values2)} className="l2" vectorEffect="non-scaling-stroke" />}
      <polyline points={pts(values)} className="l1" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function YearBars({ items, valueKey, unit, line, lineLabel }) {
  const max = Math.max(...items.map((d) => d[valueKey]), 1e-9)
  const min = Math.min(...items.map((d) => d[valueKey]))
  const floor = Math.max(0, min - (max - min) * 1.5) // zoom in so year-to-year change is visible
  const h = (v) => `${((v - floor) / (max - floor)) * 100}%`
  return (
    <div className="years" role="img" aria-label={`Yearly ${unit}`}>
      {line != null && <span className="p90" style={{ bottom: h(line) }}><small>{lineLabel}</small></span>}
      {items.map((d) => (
        <div key={d.year} className="yr" title={`${d.year} · ${fmt(d[valueKey])} ${unit}`}>
          <span className="bar-track"><span className="bar" style={{ height: h(d[valueKey]) }} /></span>
          <span className="month-label">{String(d.year).slice(2)}</span>
        </div>
      ))}
    </div>
  )
}

function ShadeStat({ y }) {
  const shading = useSolar((s) => s.shading)
  if (!y.shaded) {
    return (
      <div className="stat" title="Ray-casting every module against trees, rows and obstacles">
        <span className="stat-value"><span className="spinner" /> {shading.status === 'running' ? `${Math.round((shading.progress ?? 0) * 100)} %` : '…'}</span>
        <span className="stat-label">shading study</span>
      </div>
    )
  }
  return <Stat value={fmt(y.shadingLoss * 100, 1)} unit="%" label="shading loss" tip="Beam light blocked by trees, other rows and obstacles, over the year" />
}

/** Where the sunlight goes: plane-of-array irradiation → each loss → AC energy. */
function Waterfall({ y }) {
  const max = y.poaKwh || 1
  let left = y.poaKwh
  const rows = y.losses.map((l) => {
    const r = { ...l, from: left }
    left -= l.kwh
    return r
  })
  return (
    <section className="card">
      <h3>Loss breakdown <span className="badge">per year</span></h3>
      <div className="fall">
        <div className="fall-row is-total">
          <span>Sunlight on modules</span>
          <span className="fall-bar"><i style={{ left: 0, width: '100%' }} /></span>
          <b>{energy(y.poaKwh).join(' ')}</b>
        </div>
        {rows.map((r) => (
          <div key={r.key} className={`fall-row is-${r.key}`}>
            <span>{r.label}</span>
            <span className="fall-bar"><i style={{ left: `${((r.from - r.kwh) / max) * 100}%`, width: `${Math.max(0.4, (r.kwh / max) * 100)}%` }} /></span>
            <b>−{fmt((r.kwh / max) * 100, 1)} %</b>
          </div>
        ))}
        <div className="fall-row is-net">
          <span>Delivered (AC)</span>
          <span className="fall-bar"><i style={{ left: 0, width: `${(y.annual / max) * 100}%` }} /></span>
          <b>{energy(y.annual).join(' ')}</b>
        </div>
      </div>
    </section>
  )
}

function SystemTab({ p, layout, y }) {
  const m = PANELS[p.panel]
  const cost = layout.kwp * 1000 * p.cost
  const savings = y.annual * p.tariff
  const payback = savings ? cost / savings : 0
  const life = Array.from({ length: 25 }, (_, k) => y.annual * (1 - DEGRADE) ** k).reduce((a, b) => a + b, 0)
  const cuf = layout.kwp ? y.annual / (layout.kwp * 8760) : 0
  const co2 = (y.annual * p.co2) / 1000
  const [mwh, unitE] = energy(y.annual)
  const [kwp, unitP] = power(layout.kwp)
  const measured = y.source === 'measured'
  return (
    <>
      <div className="hero">
        <Stat big value={fmt(layout.count)} label="modules" />
        <Stat big value={kwp} unit={unitP} label="DC capacity" />
        <Stat big value={mwh} unit={unitE} label="per year (P50)" />
      </div>

      {layout.notes.length > 0 && (
        <ul className="notes">{layout.notes.map((n) => <li key={n}><Icon name="info" size={15} />{n}</li>)}</ul>
      )}

      <section className="card">
        <h3>Energy by month <span className={`badge ${measured ? 'is-ok' : ''}`}>{measured ? `Measured climate ${y.years[0].year}–${y.years[y.years.length - 1].year}` : 'Climate-class model'}</span></h3>
        <Bars values={y.months} unit="kWh" />
        <div className="kpis">
          <Stat value={fmt(y.specific)} unit="kWh/kWp" label="specific yield" tip="Annual energy per kWp installed" />
          <Stat value={fmt(cuf * 100, 1)} unit="%" label="CUF" tip="Capacity utilisation factor = energy ÷ (kWp × 8760 h)" />
          <Stat value={fmt((y.pr ?? 0) * 100, 1)} unit="%" label="performance ratio" />
          {measured
            ? <Stat value={energy(y.p90).join(' ')} label="P90 (1-yr)" tip="Exceeded 9 years in 10, from the spread of the last ten years" />
            : <Stat value={fmt(y.annual / 365, 1)} unit="kWh" label="per day, avg" />}
          <ShadeStat y={y} />
        </div>
      </section>

      {measured && y.losses && <Waterfall y={y} />}

      <section className="card">
        <h3>Arrays</h3>
        <table className="arrays">
          <thead><tr><th /><th>Plane</th><th>Tilt</th><th>Faces</th><th>Mod.</th><th>Shade</th><th>kWh/yr</th></tr></thead>
          <tbody>
            {y.arrays.map((a, i) => (
              <tr key={a.name} className={a.count ? '' : 'is-empty'}>
                <td><span className="letter">{LETTERS[i]}</span></td>
                <td>{a.name}</td>
                <td>{fmt(a.tilt)}°</td>
                <td>{fmt(a.azimuth)}° {bearing(a.azimuth)}</td>
                <td>{a.count}</td>
                <td>{y.shade ? `${fmt((y.shade[i].reduce((p, q) => p + q, 0) / 12) * 100, 1)} %` : '…'}</td>
                <td>{energy(y.perArray[i]).join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card grid2">
        <Stat value={power(layout.kwp / DC_AC)[0]} unit={power(layout.kwp / DC_AC)[1].replace('p', '')} label={`AC inverter (DC:AC ${DC_AC})`} />
        <Stat value={energy(life).join(' ')} label="25-year energy (0.5 %/yr loss)" />
        <Stat value={fmt(layout.moduleArea)} unit="m²" label="module area" />
        <Stat value={fmt(layout.coverage * 100)} unit="%" label={['ground'].includes(p.site) ? 'ground cover ratio' : 'of the surface'} />
        {layout.rowInfo && <Stat value={fmt(layout.rowInfo.pitch, 2)} unit="m" label="row pitch" />}
        {layout.rowInfo && <Stat value={fmt(layout.rowInfo.sun, 1)} unit="°" label="design sun (winter noon)" />}
        {layout.load > 0 && <Stat value={fmt(layout.load, 1)} unit="kg/m²" label="added dead load" />}
        <Stat value={fmt((layout.count * m.kg) / 1000, 2)} unit="t" label="module weight" />
      </section>

      <section className="card grid2">
        <Stat value={money(p.cur, cost)} label="installed cost" />
        <Stat value={money(p.cur, savings)} label="saved per year" />
        <Stat value={payback ? fmt(payback, 1) : '—'} unit="yr" label="simple payback" />
        <Stat value={fmt(co2, 1)} unit="t" label="CO₂ avoided / yr" />
      </section>

      {layout.facts.length > 0 && <ul className="facts">{layout.facts.map((f) => <li key={f}>{f}</li>)}</ul>}

      <p className="fine">
        Concept estimate, not an engineering design. {measured
          ? 'Monthly NASA POWER irradiance split into beam and diffuse (Collares-Pereira & Rabl), transposed per plane; soiling from rain events and your cleaning interval, snow cover from snowfall, tilt and temperature; 14 % system losses.'
          : `Clear-sky model × ${CLIMATES[p.climate].label.toLowerCase()} factor ${CLIMATES[p.climate].k} × ${y.pr} PR.`} Shading is ray-cast per module centre (beam only). Confirm with PVsyst / PVWatts and a site survey.
      </p>
    </>
  )
}

function ClimateTab({ p, y }) {
  const climate = useSolar((s) => s.climate)
  const useMeasured = useSolar((s) => s.useMeasured)
  const { setUseMeasured, set } = useSolar.getState()
  if (climate.status === 'loading' || climate.status === 'idle') {
    return <div className="empty"><span className="spinner" /> Fetching ten years of satellite climate data for {p.placeName || 'this location'}…</div>
  }
  if (climate.status === 'error') {
    return <div className="empty"><Icon name="cloud" size={22} /><p>NASA POWER is unreachable right now ({climate.error}). Energy uses the {CLIMATES[p.climate].label.toLowerCase()} climate class until it is back.</p></div>
  }
  const s = climate.summary
  const d = climate.data
  const suggested = climateClass(s.kt)
  return (
    <>
      <div className="climate-head">
        <div>
          <strong>{p.placeName || 'Custom location'}</strong>
          <small>{fmt(p.lat, 2)}°, {fmt(p.lon, 2)}° · {d.elevation != null ? `${fmt(d.elevation)} m elevation · ` : ''}{d.years[0]}–{d.years[d.years.length - 1]}</small>
        </div>
        <label className="toggle compact">
          <span className="field-label">Use for energy</span>
          <input type="checkbox" checked={useMeasured} onChange={(e) => setUseMeasured(e.target.checked)} />
          <span className="switch" aria-hidden="true" />
        </label>
      </div>

      <section className="card grid2">
        <Stat value={fmt(s.annualGhi)} unit="kWh/m²·yr" label="global horizontal irradiation" />
        <Stat value={fmt(s.peakSunHours, 2)} unit="h/day" label="peak sun hours" />
        <Stat value={fmt(s.tAvg, 1)} unit="°C" label="mean air temperature" />
        <Stat value={fmt(s.tHot, 1)} unit="°C" label="hottest month, daily max" />
        <Stat value={fmt(s.rain)} unit="mm/yr" label="rainfall" />
        <Stat value={fmt(s.variability * 100, 1)} unit="%" label="year-to-year spread (1σ)" />
      </section>

      <section className="card">
        <h3>Solar irradiation by month <span className="legend"><i className="sw bar" />mean <i className="sw whisk" />10-yr range <i className="sw dot" />clear sky</span></h3>
        <Bars values={s.monthly.map((m) => m.ghi)} lo={s.monthly.map((m) => m.ghiMin)} hi={s.monthly.map((m) => m.ghiMax)}
          marks={s.monthly.map((m) => m.clr)} unit="kWh/m²/day" digits={2} />
        <p className="card-note">
          Cloud and haze take {fmt((1 - s.monthly.reduce((a, m) => a + m.ghi, 0) / s.monthly.reduce((a, m) => a + m.clr, 0)) * 100)} % off the clear-sky sunlight here.
          Weakest month: {MONTHS[s.monthly.reduce((b, m, i, a) => (m.ghi < a[b].ghi ? i : b), 0)]}.
        </p>
      </section>

      <section className="card">
        <h3>Temperature <span className="legend"><i className="sw l1" />daily max <i className="sw l2" />mean</span></h3>
        <Line12 values={s.monthly.map((m) => m.tmax)} values2={s.monthly.map((m) => m.t)} unit="°C" />
        <div className="axis12">{MONTHS.map((m) => <span key={m}>{m[0]}</span>)}</div>
        <p className="card-note">Hot modules lose ≈ 0.35 %/°C above 25 °C — here about {fmt((y.tempLossPct ?? 0) * 100, 1)} % of the year’s energy.</p>
      </section>

      <section className="card">
        <h3>Rain, dust & snow <span className="legend"><i className="sw rainc" />rain <i className="sw snowc" />snow</span></h3>
        <Bars values={s.monthly.map((m) => m.rain * 30)} marks={s.monthly.map((m) => m.snow * 30)} unit="mm/month" />
        {y.soilMonths && (
          <div className="loss-strip">
            {y.soilMonths.map((v, i) => (
              <span key={i} title={`${MONTHS[i]} · soiling ${fmt(v * 100, 1)} % · snow ${fmt((y.snowMonths[i] ?? 0) * 100, 1)} %`}>
                <i className="soil" style={{ opacity: Math.min(1, v / 0.06) }} />
                <i className="snowl" style={{ opacity: Math.min(1, (y.snowMonths[i] ?? 0) / 0.2) }} />
              </span>
            ))}
          </div>
        )}
        <p className="card-note">
          {fmt(s.rain)} mm of rain a year{s.snow > 1 ? ` and ~${fmt(s.snow / 10, 0)} cm of fresh snow (water-equivalent ${fmt(s.snow)} mm)` : ''}.
          {y.losses ? ` Over a year that costs ${fmt((y.losses.find((l) => l.key === 'soil').kwh / y.poaKwh) * 100, 1)} % to dust and ${fmt((y.losses.find((l) => l.key === 'snow').kwh / y.poaKwh) * 100, 1)} % to snow cover.` : ''}
          {' '}Darker cells above = higher monthly loss (top dust, bottom snow).
        </p>
      </section>

      <section className="card">
        <h3>Last ten years</h3>
        <YearBars items={s.yearly} valueKey="ghi" unit="kWh/m²" />
        {y.source === 'measured' && (
          <>
            <h3 className="sub">This design’s energy, year by year</h3>
            <YearBars items={y.years} valueKey="kwh" unit="kWh" line={y.p90} lineLabel="P90" />
          </>
        )}
      </section>

      {suggested !== p.climate && (
        <button className="link-btn" onClick={() => set('climate', suggested)}>
          Measured clearness {fmt(s.kt, 2)} fits “{CLIMATES[suggested].label}” — use it as the offline fallback
        </button>
      )}
      <p className="fine">Source: <a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">NASA POWER</a> (CERES / MERRA-2), monthly means on a ~0.5° grid. Cached in this browser.</p>
    </>
  )
}

function NearbyTab({ p }) {
  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const { goTo, setSite } = useSolar.getState()
  useEffect(() => {
    const abort = new AbortController()
    setState({ status: 'loading' })
    const t = setTimeout(() => {
      fetchNearby(p.lat, p.lon, 80, abort.signal)
        .then((list) => setState({ status: 'ready', list }))
        .catch((err) => !abort.signal.aborted && setState({ status: 'error', error: err.message }))
    }, 400)
    return () => { clearTimeout(t); abort.abort() }
  }, [p.lat, p.lon, attempt])
  const here = { lat: p.lat, lon: p.lon }
  const known = state.list?.filter((x) => x.mw) ?? []
  const total = known.reduce((a, x) => a + x.mw, 0)
  const landmarks = [...LANDMARKS].map((l) => ({ ...l, km: distanceKm(here, l) })).sort((a, b) => a.km - b.km)
  return (
    <>
      <section className="card">
        <h3>Solar plants within 80 km <span className="badge">OpenStreetMap · live</span></h3>
        {state.status === 'loading' && <div className="empty small"><span className="spinner" /> Asking OpenStreetMap (can take ~10 s)…</div>}
        {state.status === 'error' && (
          <div className="empty small">
            <span>OpenStreetMap’s public Overpass servers are {state.error}. Landmarks below still work.</span>
            <button className="mini-chip" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            <div className="kpis">
              <Stat value={fmt(state.list.length)} label="mapped plants" />
              <Stat value={total >= 1000 ? fmt(total / 1000, 2) : fmt(total, 1)} unit={total >= 1000 ? 'GW' : 'MW'} label="with capacity tagged" />
              <Stat value={state.list[0] ? fmt(state.list.reduce((a, x) => Math.min(a, x.km), Infinity), 0) : '—'} unit="km" label="nearest" />
            </div>
            <ul className="plants">
              {state.list.slice(0, 12).map((x) => (
                <li key={x.id}>
                  <span>
                    <strong>{x.name}</strong>
                    <small>{[x.operator && x.operator !== x.name ? x.operator : null, x.start ? `since ${x.start.slice(0, 4)}` : null, `${fmt(x.km)} km`].filter(Boolean).join(' · ')}</small>
                  </span>
                  <b>{x.mw ? (x.mw >= 1 ? `${fmt(x.mw, x.mw < 10 ? 1 : 0)} MW` : `${fmt(x.mw * 1000)} kW`) : '—'}</b>
                  <button className="mini-chip" onClick={() => goTo({ lat: x.lat, lon: x.lon, name: x.name })}>Go</button>
                </li>
              ))}
              {!state.list.length && <li className="muted">None mapped nearby yet.</li>}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <h3>Landmark installations</h3>
        <ul className="plants">
          {landmarks.map((l) => (
            <li key={l.name}>
              <span>
                <strong>{l.name}</strong>
                <small>{l.where} · {l.kind} · {l.year}{l.note ? ` · ${l.note}` : ''}</small>
              </span>
              <b>{l.mw >= 1 ? `${fmt(l.mw)} MW` : `${fmt(l.mw * 1000)} kW`}</b>
              <button className="mini-chip" title="Load this location and site type"
                onClick={() => { setSite(l.site); goTo({ lat: l.lat, lon: l.lon, name: l.name }) }}>Load</button>
            </li>
          ))}
        </ul>
      </section>
      <p className="fine">Live data © OpenStreetMap contributors (ODbL). Landmark capacities as publicly reported; coordinates approximate.</p>
    </>
  )
}

const TABS = [['system', 'System', 'bolt'], ['climate', 'Climate', 'cloud'], ['nearby', 'Nearby', 'globe']]

export default function Results() {
  const p = useSolar((s) => s.params)
  const tab = useSolar((s) => s.tab)
  const setTab = useSolar((s) => s.setTab)
  const layout = useLayout()
  const y = useYield(layout)
  return (
    <aside className="results" aria-label="Results">
      <div className="tabs" role="tablist">
        {TABS.map(([k, label, icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>
            <Icon name={icon} size={15} />{label}
          </button>
        ))}
      </div>
      <div className="tab-body" aria-live="polite">
        {tab === 'system' && <SystemTab p={p} layout={layout} y={y} />}
        {tab === 'climate' && <ClimateTab p={p} y={y} />}
        {tab === 'nearby' && <NearbyTab p={p} />}
      </div>
    </aside>
  )
}
