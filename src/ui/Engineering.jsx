import { useSolar } from '../store.js'
import { INVERTERS, sldSvg, bomCsv } from '../electrical.js'
import { subsidy as suryaGhar, isSpecialState } from '../survey/sizing.js'
import { Field, Toggle } from './Inputs.jsx'
import { PROFILES, SOLAR_HOURS } from '../load.js'
import { MONTHS } from '../solar.js'
import { checklists } from '../checklists.js'
import { INCENTIVES } from '../data/incentives.js'
import Icon from './Icon.jsx'
import Stat from './Stat.jsx'

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—')
/** ₹ in lakh / crore past ₹1 L; other currencies in M past a million. */
const money = (cur, n) => {
  const a = Math.abs(n)
  const v = cur === '₹'
    ? (a >= 1e7 ? `${fmt(a / 1e7, 2)} Cr` : a >= 1e5 ? `${fmt(a / 1e5, 2)} L` : fmt(a))
    : (a >= 1e6 ? `${fmt(a / 1e6, 2)} M` : fmt(a))
  return `${n < 0 ? '−' : ''}${cur}${v}`
}

export function download(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ElectricalTab({ p, layout, eng }) {
  const { e, temps } = eng
  const set = useSolar((s) => s.set)
  const dark = useSolar((s) => s.theme === 'dark')
  if (!e) return <div className="empty"><Icon name="bolt" size={22} /><p>Install some modules to see the electrical design.</p></div>
  const inv = e.inverter
  return (
    <>
      <div className="hero">
        <Stat value={`${inv.n} ×`} unit={`${inv.ac} kW`} label="inverters" />
        <Stat value={`${e.strings} × ${e.lengths}`} label="strings × modules" />
        <Stat value={fmt(e.dcac, 2)} label="DC : AC ratio" metric="dcAcRatio" />
      </div>

      <section className="card">
        <h3>Inverter</h3>
        <div className="row2">
          <label className="field mini">
            <span className="field-label">Model class</span>
            <select value={p.inverter} onChange={(ev) => set('inverter', ev.target.value)}>
              <option value="auto">Auto ({inv.label})</option>
              <optgroup label="Generic classes (IEC markets)">
                {Object.entries(INVERTERS).filter(([, v]) => !v.library).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </optgroup>
              <optgroup label="CEC-listed (US models, NREL SAM)">
                {Object.entries(INVERTERS).filter(([, v]) => v.library).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </optgroup>
            </select>
          </label>
          <label className="field mini">
            <span className="field-label">How many</span>
            <input className="text" type="number" min={0} max={200} value={p.invCount || ''} placeholder={`auto · ${inv.n}`}
              onChange={(ev) => set('invCount', Math.max(0, Math.round(Number(ev.target.value))))} />
          </label>
        </div>
        <p className="card-note">
          {inv.vmax} V max · MPPT {inv.mpptMin}–{inv.mpptMax} V · {inv.mppts} MPPT{inv.mppts > 1 ? 's' : ''} × {inv.imax} A. {inv.library ? `${inv.market}, CEC listing (MPPT count not in the data, so checked as one tracker); confirm the IEC variant's datasheet.` : 'Generic class; match the brand datasheet.'}
        </p>
      </section>

      <section className="card">
        <h3>String check <span className={`badge ${e.ok ? 'is-ok' : 'is-warn'}`}>{e.ok ? 'all within limits' : 'needs attention'}</span></h3>
        <p className="card-note">
          Strings of {e.minLen}–{e.maxLen} modules fit between {temps.low} °C {temps.measured ? '(10-yr record low)' : '(estimated low)'} and {temps.high} °C air
          ({temps.high + 30} °C cells). Using {e.lengths} per string, {e.stringsPerInv} per inverter, {e.perMppt} per MPPT.
        </p>
        <table className="arrays checks-table">
          <tbody>
            {e.checks.map((c) => (
              <tr key={c.label} className={c.ok ? '' : 'is-bad'}>
                <td><span className={`dot ${c.ok ? 'ok' : 'bad'}`} /></td>
                <td>{c.label}</td>
                <td><b>{c.value}</b></td>
                <td><small>{c.limit}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Single-line diagram</h3>
        <div className="sld" dangerouslySetInnerHTML={{ __html: sldSvg(e, { dark }) }} />
      </section>

      <section className="card">
        <h3>Cables & protection</h3>
        <div className="row2">
          <label className="field mini">
            <span className="field-label">DC run, m</span>
            <input className="text" type="number" min={0} value={p.dcRun || ''} placeholder={`est. ${e.runs.dc}`} onChange={(ev) => set('dcRun', Math.max(0, Number(ev.target.value)))} />
          </label>
          <label className="field mini">
            <span className="field-label">AC run, m</span>
            <input className="text" type="number" min={0} value={p.acRun || ''} placeholder={`est. ${e.runs.ac}`} onChange={(ev) => set('acRun', Math.max(0, Number(ev.target.value)))} />
          </label>
        </div>
        <div className="grid2" style={{ marginTop: 10 }}>
          <Stat value={`${e.dc.mm2} mm²`} label={`DC string cable · ${fmt(e.dc.drop * 100, 2)} % drop`} />
          <Stat value={e.ac.label} label={`AC cable · ${fmt(e.ac.drop * 100, 2)} % drop`} />
          <Stat value={`${e.protection.acBreaker} A`} label={`AC MCB/MCCB per inverter (${fmt(e.iAc, 1)} A)`} />
          <Stat value={`${e.protection.dcIsolator.v} V`} label={`DC isolator, ${e.protection.dcIsolator.a} A`} />
          {e.protection.stringFuse && <Stat value={`${e.protection.stringFuse} A`} label="gPV string fuses" />}
          {e.protection.mainBreaker && <Stat value={`${e.protection.mainBreaker} A`} label="AC main breaker" />}
        </div>
        <p className="card-note">Drop kept under 1.5 % each side (copper at 50 °C). Type II SPDs on DC and AC, three earth pits and a lightning arrester per MNRE practice.</p>
      </section>

      <section className="card">
        <h3>Diesel generator</h3>
        <Field k="dgKva" label="DG set on site" min={0} max={2000} step={5} unit="kVA" hint="0 = none. Factories, hospitals and campuses usually have one." />
        {e.dg && <p className="card-note">During power cuts a DG-PV controller keeps the generator at least 30 % loaded (≈ {fmt(e.dg.minKw)} kW) and curtails solar above the load, so the DG is never back-fed. Solar can carry only the load above that floor while the DG runs.</p>}
      </section>

      <section className="card">
        <h3>Backup battery</h3>
        <Field k="battLoad" label="Essential load" min={0} max={50} step={0.5} unit="kW" hint="Lights, fans, fridge, Wi-Fi… 0 = no battery" />
        {p.battLoad > 0 && <Field k="battHours" label="Backup time" min={1} max={12} step={0.5} unit="h" />}
        {e.battery && (
          <div className="grid2" style={{ marginTop: 6 }}>
            <Stat value={fmt(e.battery.nominal, 1)} unit="kWh" label="LFP nominal (90 % DoD)" />
            <Stat value={money(p.cur, e.battery.cost)} label={`at ${money(p.cur, e.battery.price)}/kWh`} />
          </div>
        )}
      </section>

      <section className="card">
        <h3>Bill of materials
          <button className="mini-chip" onClick={() => download('sunplot-bom.csv', bomCsv(e.bom))}>CSV</button>
        </h3>
        <table className="arrays">
          <tbody>
            {e.bom.map((b) => <tr key={b.item}><td>{b.item}</td><td style={{ textAlign: 'right' }}><b>{fmt(b.qty)}</b> <small>{b.unit}</small></td></tr>)}
          </tbody>
        </table>
      </section>
      <p className="fine">Concept electrical design (IEC 62548 / MNRE practice): string limits from the module datasheet and site temperature extremes, cables by ampacity and voltage drop. A licensed engineer signs off the final design.</p>
    </>
  )
}

/** Cumulative cash position over 25 years, as bars either side of zero. */
function CashChart({ rows, down, cur }) {
  const vals = [-down, ...rows.map((r) => r.cumulative)]
  const lo = Math.min(...vals, 0)
  const hi = Math.max(...vals, 0)
  const span = hi - lo || 1
  const H = 100
  const y0 = (hi / span) * H
  const w = 100 / vals.length
  return (
    <svg className="cash" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label="Cumulative cash over 25 years">
      {vals.map((v, i) => (
        <rect key={i} className={v < 0 ? 'neg' : 'pos'} x={i * w + w * 0.15} width={w * 0.7}
          y={v < 0 ? y0 : y0 - (v / span) * H} height={Math.max(0.4, (Math.abs(v) / span) * H)}>
          <title>{`Year ${i} · ${money(cur, v)}`}</title>
        </rect>
      ))}
      <line x1="0" x2="100" y1={y0} y2={y0} className="zero" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const MONTH_SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

const societyCfa = (kw, houses, special) => INCENTIVES.pmSuryaGharSociety.amount(kw, houses, special)

/** Consumption: profile, average or twelve bills, metering type, ToD solar-hour discount. */
function UseCard({ p, eng, kwp }) {
  const set = useSolar((s) => s.set)
  const mix = eng.mix
  const months = mix?.months
  const fill = () => set('bills', (months ?? new Array(12).fill(p.useKwh || 0)).map((v) => Math.round(v)))
  return (
    <section className="card">
      <h3>Electricity use</h3>
      <div className="row2">
        <label className="field mini">
          <span className="field-label">Load pattern</span>
          <select value={p.profile} onChange={(ev) => set('profile', ev.target.value)}>
            <option value="auto">Auto ({PROFILES[mix?.profile ?? 'home']?.label})</option>
            {Object.entries(PROFILES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="field mini">
          <span className="field-label">Grid meter</span>
          <select value={p.metering} onChange={(ev) => set('metering', ev.target.value)}>
            <option value="net">Net metering</option>
            <option value="billing">Net billing</option>
            <option value="gross">Gross metering</option>
          </select>
        </label>
      </div>
      {p.bills ? (
        <>
          <div className="bills">
            {p.bills.map((v, i) => (
              <label key={i}>
                <small>{MONTHS[i]}</small>
                <input className="text" type="number" min={0} value={v} onChange={(ev) => set('bills', p.bills.map((x, j) => (j === i ? Math.max(0, Number(ev.target.value)) : x)))} />
              </label>
            ))}
          </div>
          <button className="link-btn" onClick={() => set('bills', null)}>Use one average month instead</button>
        </>
      ) : (
        <>
          <Field k="useKwh" label="Average use" min={0} max={Math.max(3000, Math.round(kwp * 250))} step={10} unit="kWh/mo" hint="0 = all solar replaces grid power" />
          <button className="link-btn" onClick={fill}>Enter twelve monthly bills (kWh)</button>
        </>
      )}
      {months && (
        <div className="use-bars" title="Monthly use (bars) against solar (line)">
          {months.map((v, i) => <span key={i} style={{ height: `${(v / Math.max(...months)) * 100}%` }}><i>{MONTH_SHORT[i]}</i></span>)}
        </div>
      )}
      {mix && mix.useYear > 0 && (
        <div className="grid2" style={{ marginTop: 10 }}>
          <Stat value={fmt(Math.min(1, mix.gen / mix.useYear) * 100)} unit="%" label="of the year's use from solar" />
          <Stat value={fmt(mix.selfShare * 100)} unit="%" label="of solar used as it is made" metric="selfConsumption" tip="Hour by hour, solar output against the load pattern" />
          <Stat value={fmt(mix.coverInstant * 100)} unit="%" label="of use met live by solar" metric="selfSufficiency" />
          <Stat value={fmt(mix.solarHours * 100)} unit="%" label={`of solar in ToD hours (${SOLAR_HOURS[0]}–${SOLAR_HOURS[1]} h)`} />
        </div>
      )}
      <p className="card-note">
        {p.metering === 'net' && 'Net metering banks surplus units through the year; what is left at settlement is paid at the export rate. Allowed up to 500 kW or the sanctioned load (state rules vary).'}
        {p.metering === 'billing' && 'Net billing values only solar used as it is made; every exported unit is paid at the export rate. Common above 500 kW.'}
        {p.metering === 'gross' && 'Gross metering sells all solar to the DISCOM at the export (feed-in) rate; the site keeps buying at the full tariff.'}
      </p>
      {(p.metering !== 'net' || p.useKwh > 0 || p.bills) && (
        <label className="field mini">
          <span className="field-label">Export rate ({p.cur.trim()}/kWh)</span>
          <input className="text" type="number" min={0} step={0.1} value={p.exportRate || ''} placeholder={`${fmt(p.tariff * 0.4, 2)} (40 % of tariff)`} onChange={(ev) => set('exportRate', Math.max(0, Number(ev.target.value)))} />
        </label>
      )}
      <Toggle k="zeroExport" label="Zero export (no net meter)" hint="An export limiter holds solar to the site load; surplus is curtailed, not sold." />
      {p.buyer !== 'home' && <Field k="todDisc" label="ToD solar-hour rebate" min={0} max={30} unit="%" hint="C&I time-of-day tariffs make solar hours 10–20 % cheaper (2023 rules); that lowers what solar saves." />}
    </section>
  )
}

/** Conservative / base / optimistic cases and an NPV tornado (±10 % per driver). */
function ScenarioCard({ p, sc, sens }) {
  const rows = [sc.conservative, sc.base, sc.optimistic]
  const max = Math.max(...sens.map((d) => Math.max(Math.abs(d.low), Math.abs(d.high))), 1)
  return (
    <section className="card">
      <h3>Scenarios</h3>
      <table className="arrays">
        <thead><tr><th>Case</th><th>Payback</th><th>IRR</th><th>NPV</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={r.label === 'Base' ? 'is-best' : ''} title={r.note}>
              <td>{r.label}<small>{r.note}</small></td>
              <td>{r.f.payback != null ? `${fmt(r.f.payback, 1)} yr` : '—'}</td>
              <td>{r.f.irr != null ? `${fmt(r.f.irr * 100, 1)} %` : '—'}</td>
              <td>{money(p.cur, r.f.npv)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="sub">NPV sensitivity, ±10 % on each input</h3>
      <div className="tornado" role="img" aria-label="NPV sensitivity tornado chart">
        {sens.map((d) => (
          <div key={d.name} className="tornado-row">
            <span>{d.name}</span>
            <span className="tornado-bar">
              <i className="lo" style={{ width: `${(Math.abs(Math.min(d.low, d.high)) / max) * 50}%`, right: '50%' }} />
              <i className="hi" style={{ width: `${(Math.max(d.low, d.high) / max) * 50}%`, left: '50%' }} />
            </span>
            <b>±{money(p.cur, Math.max(Math.abs(d.low), Math.abs(d.high)))}</b>
          </div>
        ))}
      </div>
    </section>
  )
}

export function MoneyTab({ p, layout, eng, survey }) {
  const { f, ppa } = eng
  const set = useSolar((s) => s.set)
  if (!layout.count) return <div className="empty"><Icon name="coin" size={22} /><p>Install some modules to see the money.</p></div>
  const india = p.cur === '₹'
  const special = isSpecialState(survey?.state)
  const surya = suryaGhar(Math.min(layout.kwp, 3), special)
  const society = societyCfa(layout.kwp, p.houses || 0, special)
  const buyers = [['home', 'Home'], ['business', 'Business'], ['resco', 'RESCO / PPA']]
  return (
    <>
      <div className="seg buyer-seg" role="radiogroup" aria-label="Who pays">
        {buyers.map(([k, label]) => <button key={k} role="radio" aria-checked={p.buyer === k} className={p.buyer === k ? 'is-on' : ''} onClick={() => set('buyer', k)}>{label}</button>)}
      </div>

      {p.buyer === 'resco' && ppa ? (
        <>
          <div className="hero">
            <Stat value={`${p.cur}${fmt(ppa.ppa, 2)}`} unit="/kWh" label={`PPA tariff, ${p.ppaYears} yr flat`} metric="rescoTariff" />
            <Stat value={fmt(ppa.discountVsGrid * 100)} unit="%" label="cheaper than the grid" />
            <Stat value={money(p.cur, ppa.firstYear)} label="site saves in year 1" />
          </div>
          <section className="card">
            <h3>Zero-capex RESCO</h3>
            <div className="kpis">
              <Stat value={money(p.cur, 0)} label="paid upfront by the site" />
              <Stat value={money(p.cur, ppa.capex)} label="plant cost (developer)" />
              <Stat value={money(p.cur, ppa.saved)} label={`site saves over ${p.ppaYears} yr`} />
              <Stat value={ppa.equityIrr != null ? fmt(ppa.equityIrr * 100, 1) : '—'} unit="%" label="developer equity IRR" />
            </div>
            <p className="card-note">The tariff is the flat rate at which the developer earns its target return on equity. SECI's 2026 RESCO auctions for government buildings and universities cleared at ₹2.94–3.97/kWh; state ceilings run ₹4.37–5.15.</p>
          </section>
          <section className="card">
            <h3>Developer assumptions</h3>
            <Field k="roe" label="Return on equity" min={8} max={22} step={0.5} unit="%" hint="KERC 2026–29 norm: 14 %" />
            <Field k="debtShare" label="Debt" min={0} max={80} step={5} unit="%" />
            <Field k="debtRate" label="Debt interest" min={6} max={15} step={0.1} unit="%" />
            <Field k="debtYears" label="Debt tenure" min={5} max={20} unit="yr" />
            <Field k="ppaYears" label="PPA term" min={10} max={25} unit="yr" />
            <Field k="cost" label="Plant cost" min={india ? 25 : 0.5} max={india ? 80 : 4} step={india ? 0.5 : 0.05} format={(v) => `${p.cur}${v}/Wp`} />
            <Field k="omPct" label="O&M + insurance" min={0} max={3} step={0.1} unit="% / yr" />
          </section>
          <UseCard p={p} eng={eng} kwp={layout.kwp} />
        </>
      ) : (
        <>
          <div className="hero">
            <Stat value={f.payback != null ? fmt(f.payback, 1) : '> 25'} unit="yr" label={f.business ? 'payback (after tax)' : 'payback'} metric="payback" />
            <Stat value={f.irr != null ? fmt(f.irr * 100, 1) : '—'} unit="%" label={f.business ? 'IRR after tax' : 'IRR (25 yr)'} metric="irr" />
            <Stat value={money(p.cur, f.gain25)} label="25-year gain" />
          </div>

          <section className="card">
            <h3>Cash over {f.years} years <span className="legend"><i className="sw neg" />paying back <i className="sw pos" />in profit</span></h3>
            <CashChart rows={f.rows} down={f.down} cur={p.cur} />
            <div className="kpis">
              <Stat value={money(p.cur, f.gross)} label="system cost" />
              {f.subsidy > 0 && <Stat value={`−${money(p.cur, f.subsidy)}`} label="subsidy / incentive" />}
              {f.business && <Stat value={money(p.cur, f.adYear1 * f.tax)} label={`tax saved in yr 1 (40 % AD on ${money(p.cur, f.net)})`} />}
              <Stat value={money(p.cur, f.npv)} label={`NPV at ${p.discount} %`} metric="npv" />
              <Stat value={`${p.cur}${fmt(f.lcoe, 2)}`} unit="/kWh" label="LCOE" metric="lcoe" />
              <Stat value={money(p.cur, f.savings25)} label={`${f.years}-yr bill savings`} metric="lifetimeSavings" />
              <Stat value={f.discountedPayback != null ? fmt(f.discountedPayback, 1) : `> ${f.years}`} unit="yr" label="discounted payback" metric="discountedPayback" />
              <Stat value={f.roi != null ? fmt(f.roi * 100) : '—'} unit="%" label={`ROI (${f.years} yr)`} metric="roi" />
              {f.billBefore != null && <Stat value={`${money(p.cur, f.billBefore)} → ${money(p.cur, Math.max(0, f.billAfter))}`} label="bill per year, before → after" />}
              {f.loan > 0 && <Stat value={money(p.cur, f.emi)} unit="/mo" label={`EMI, ${p.loanYears} yr`} metric="emi" />}
            </div>
          </section>

          {eng.scenarios && <ScenarioCard p={p} sc={eng.scenarios} sens={eng.sensitivity} />}

          <UseCard p={p} eng={eng} kwp={layout.kwp} />

          <section className="card">
            <h3>Assumptions</h3>
            {p.buyer === 'home' && (
              <>
                <label className="toggle">
                  <span><span className="field-label">Housing society (RWA common areas)</span><span className="field-hint">Lifts, pumps, lights, EV charging: ₹18,000/kW on up to 3 kW per house, max 500 kW.</span></span>
                  <input type="checkbox" checked={!!p.society} onChange={(ev) => set('society', ev.target.checked)} />
                  <span className="switch" aria-hidden="true" />
                </label>
                {p.society && <Field k="houses" label="Houses in the society" min={1} max={500} />}
              </>
            )}
            <label className="field mini">
              <span className="field-label">Subsidy / incentive ({p.cur.trim()})</span>
              <span className="inline">
                <input className="text" type="number" min={0} value={p.subsidy || ''} placeholder="0" onChange={(ev) => set('subsidy', Math.max(0, Number(ev.target.value)))} />
                {india && p.buyer === 'home' && !p.society && <button className="mini-chip" onClick={() => set('subsidy', surya)} title="Central financial assistance for homes, capped at 3 kW">PM Surya Ghar {money(p.cur, surya)}</button>}
                {india && p.buyer === 'home' && p.society && <button className="mini-chip" onClick={() => set('subsidy', society)} title="CFA for group housing societies / RWAs">RWA CFA {money(p.cur, society)}</button>}
              </span>
            </label>
            {india && p.buyer === 'home' && (() => {
              const inc = p.society ? INCENTIVES.pmSuryaGharSociety : INCENTIVES.pmSuryaGharHome
              return <p className="card-note">{inc.rule}. Source: <a href={inc.url} target="_blank" rel="noreferrer">{inc.source}</a> (scheme dated {inc.asOf}, checked {inc.checked}). {inc.caveat}.</p>
            })()}
            {p.buyer === 'business' && (
              <>
                <Field k="taxRate" label="Company tax rate" min={0} max={40} step={0.01} unit="%" hint="25.17 % = 22 % + surcharge + cess (new regime); 34.94 % old regime." />
                <p className="card-note">Business view is after tax: savings raise taxable profit; solar plant is depreciated at 40 % of written-down value a year (half in the first year if commissioned after September). Assumes enough other profit to use the deduction. Check with your CA.</p>
              </>
            )}
            <Field k="tariff" label="Grid tariff" min={0} max={p.cur === '₹' ? 20 : 1} step={p.cur === '₹' ? 0.1 : 0.01} format={(v) => `${p.cur}${v}/kWh`} />
            <Field k="escalation" label="Tariff rise" min={0} max={10} step={0.5} unit="%/yr" />
            <Field k="omPct" label="O&M + insurance" min={0} max={3} step={0.1} unit="% / yr" />
            <Field k="discount" label="Discount rate" min={0} max={15} step={0.5} unit="%" />
            <Field k="lifetime" label="Project lifetime" min={10} max={35} unit="yr" />
            <Field k="degradation" label="Module ageing" min={0} max={1.5} step={0.05} unit="%/yr" hint="After year 1 (first-year LID is already in the simulation losses)." />
            <Field k="inverterYear" label="Inverter replaced in year" min={0} max={30} hint="0 = never." />
            <Field k="loanShare" label="Financed by loan" min={0} max={100} step={5} unit="%" />
            {p.loanShare > 0 && (
              <>
                <Field k="loanRate" label="Loan interest" min={0} max={20} step={0.25} unit="%" />
                <Field k="loanYears" label="Loan tenure" min={1} max={15} step={1} unit="yr" />
              </>
            )}
          </section>
        </>
      )}

      {checklists(p).map((c) => (
        <details key={c.title} className="card checklist">
          <summary><h3>{c.title}</h3></summary>
          <ol>{c.items.map((it) => <li key={it}>{it}</li>)}</ol>
        </details>
      ))}

      <section className="card env">
        <h3>For the planet</h3>
        <div className="grid2">
          <Stat value={fmt(f.env.co2Year, 1)} unit="t" label="CO₂ avoided a year" metric="co2" />
          <Stat value={fmt(f.env.co2Life)} unit="t" label="CO₂ over 25 years" />
          <Stat value={fmt(f.env.trees)} label="trees' worth of CO₂, every year" />
          {india && <Stat value={fmt(f.env.coal, 1)} unit="t" label="coal not burnt a year" />}
        </div>
      </section>

      {p.buyer !== 'resco' && (
        <section className="card">
          <h3>Year by year
            <button className="mini-chip" onClick={() => download('sunplot-cashflow.csv', ['Year,kWh,Used on site,Tariff,Savings,O&M,Loan,Depreciation,Tax,Net,Cumulative', ...f.rows.map((r) => [r.year, r.kwh.toFixed(0), r.used.toFixed(0), r.tariff.toFixed(2), r.savings.toFixed(0), r.om.toFixed(0), r.loan.toFixed(0), r.dep.toFixed(0), r.tax.toFixed(0), r.net.toFixed(0), r.cumulative.toFixed(0)].join(','))].join('\n'))}>CSV</button>
          </h3>
          <table className="arrays cashflow">
            <thead><tr><th>Yr</th><th>kWh</th><th>Saved</th><th>O&M</th>{f.loan > 0 && <th>Loan</th>}{f.business && <th>Tax</th>}<th>Cumulative</th></tr></thead>
            <tbody>
              {f.rows.filter((r) => r.year <= 5 || r.year % 5 === 0 || r.year === 12).map((r) => (
                <tr key={r.year} className={r.cumulative >= 0 ? '' : 'is-neg'}>
                  <td>{r.year}</td><td>{fmt(r.kwh)}</td><td>{money(p.cur, r.savings)}</td><td>{money(p.cur, r.om)}</td>
                  {f.loan > 0 && <td>{money(p.cur, r.loan)}</td>}{f.business && <td>{money(p.cur, r.tax)}</td>}<td>{money(p.cur, r.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="fine">Year-1 energy is the P50 estimate; then −1 % light-induced loss and −0.4 %/yr. O&M rises 5 %/yr; one inverter replacement (≈10 % of cost) in year 12. Own use is matched hour by hour against the load pattern. Not financial or tax advice.</p>
    </>
  )
}
