import { useSolar } from '../store.js'
import { INVERTERS, sldSvg, bomCsv } from '../electrical.js'
import { subsidy as suryaGhar, isSpecialState } from '../survey/sizing.js'
import { Field } from './Inputs.jsx'
import Icon from './Icon.jsx'

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—')
/** ₹ in lakh / crore past ₹1 L; other currencies in M past a million. */
const money = (cur, n) => {
  const a = Math.abs(n)
  const v = cur === '₹'
    ? (a >= 1e7 ? `${fmt(a / 1e7, 2)} Cr` : a >= 1e5 ? `${fmt(a / 1e5, 2)} L` : fmt(a))
    : (a >= 1e6 ? `${fmt(a / 1e6, 2)} M` : fmt(a))
  return `${n < 0 ? '−' : ''}${cur}${v}`
}

function Stat({ value, unit, label, tip }) {
  return (
    <div className="stat" title={tip}>
      <span className="stat-value">{value}{unit && <small> {unit}</small>}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
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
        <Stat value={`${e.strings} × ${e.L}`} label="strings × modules" />
        <Stat value={fmt(e.dcac, 2)} label="DC : AC ratio" />
      </div>

      <section className="card">
        <h3>Inverter</h3>
        <div className="row2">
          <label className="field mini">
            <span className="field-label">Model class</span>
            <select value={p.inverter} onChange={(ev) => set('inverter', ev.target.value)}>
              <option value="auto">Auto ({inv.label})</option>
              {Object.entries(INVERTERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="field mini">
            <span className="field-label">How many</span>
            <input className="text" type="number" min={0} max={200} value={p.invCount || ''} placeholder={`auto · ${inv.n}`}
              onChange={(ev) => set('invCount', Math.max(0, Math.round(Number(ev.target.value))))} />
          </label>
        </div>
        <p className="card-note">
          {inv.vmax} V max · MPPT {inv.mpptMin}–{inv.mpptMax} V · {inv.mppts} MPPT{inv.mppts > 1 ? 's' : ''} × {inv.imax} A. Generic class; match the brand datasheet.
        </p>
      </section>

      <section className="card">
        <h3>String check <span className={`badge ${e.ok ? 'is-ok' : 'is-warn'}`}>{e.ok ? 'all within limits' : 'needs attention'}</span></h3>
        <p className="card-note">
          Strings of {e.minLen}–{e.maxLen} modules fit between {temps.low} °C {temps.measured ? '(10-yr record low)' : '(estimated low)'} and {temps.high} °C air
          ({temps.high + 30} °C cells). Using {e.L} per string, {e.stringsPerInv} per inverter, {e.perMppt} per MPPT.
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
          <Stat value={`${e.ac.mm2} mm²`} label={`AC cable · ${fmt(e.ac.drop * 100, 2)} % drop`} />
          <Stat value={`${e.protection.acBreaker} A`} label={`AC MCB/MCCB per inverter (${fmt(e.iAc, 1)} A)`} />
          <Stat value={`${e.protection.dcIsolator.v} V`} label={`DC isolator, ${e.protection.dcIsolator.a} A`} />
          {e.protection.stringFuse && <Stat value={`${e.protection.stringFuse} A`} label="gPV string fuses" />}
          {e.protection.mainBreaker && <Stat value={`${e.protection.mainBreaker} A`} label="AC main breaker" />}
        </div>
        <p className="card-note">Drop kept under 1.5 % each side (copper at 50 °C). Type II SPDs on DC and AC, three earth pits and a lightning arrester per MNRE practice.</p>
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

export function MoneyTab({ p, layout, eng, survey }) {
  const { f } = eng
  const set = useSolar((s) => s.set)
  if (!layout.count) return <div className="empty"><Icon name="coin" size={22} /><p>Install some modules to see the money.</p></div>
  const india = p.cur === '₹'
  const surya = suryaGhar(Math.min(layout.kwp, 3), isSpecialState(survey?.state))
  return (
    <>
      <div className="hero">
        <Stat value={f.payback != null ? fmt(f.payback, 1) : '> 25'} unit="yr" label="payback" />
        <Stat value={f.irr != null ? fmt(f.irr * 100, 1) : '—'} unit="%" label="IRR (25 yr)" />
        <Stat value={money(p.cur, f.gain25)} label="25-year gain" />
      </div>

      <section className="card">
        <h3>Cash over 25 years <span className="legend"><i className="sw neg" />paying back <i className="sw pos" />in profit</span></h3>
        <CashChart rows={f.rows} down={f.down} cur={p.cur} />
        <div className="kpis">
          <Stat value={money(p.cur, f.gross)} label="system cost" />
          {f.subsidy > 0 && <Stat value={`−${money(p.cur, f.subsidy)}`} label="subsidy / incentive" />}
          <Stat value={money(p.cur, f.npv)} label={`NPV at ${p.discount} %`} />
          <Stat value={`${p.cur}${fmt(f.lcoe, 2)}`} unit="/kWh" label="LCOE" tip="Lifetime cost ÷ lifetime energy, discounted" />
          <Stat value={money(p.cur, f.savings25)} label="25-yr bill savings" />
          {f.loan > 0 && <Stat value={money(p.cur, f.emi)} unit="/mo" label={`EMI, ${p.loanYears} yr`} />}
        </div>
      </section>

      <section className="card">
        <h3>Assumptions</h3>
        <label className="field mini">
          <span className="field-label">Subsidy / incentive ({p.cur.trim()})</span>
          <span className="inline">
            <input className="text" type="number" min={0} value={p.subsidy || ''} placeholder="0" onChange={(ev) => set('subsidy', Math.max(0, Number(ev.target.value)))} />
            {india && <button className="mini-chip" onClick={() => set('subsidy', surya)} title="Central financial assistance for homes, capped at 3 kW">PM Surya Ghar {money(p.cur, surya)}</button>}
          </span>
        </label>
        <Field k="tariff" label="Grid tariff" min={0} max={p.cur === '₹' ? 20 : 1} step={p.cur === '₹' ? 0.1 : 0.01} format={(v) => `${p.cur}${v}/kWh`} />
        <Field k="escalation" label="Tariff rise" min={0} max={10} step={0.5} unit="%/yr" />
        <Field k="useKwh" label="Site uses" min={0} max={Math.max(2000, Math.round(layout.kwp * 200))} step={10} unit="kWh/mo" hint="0 = all solar replaces grid power; above that, surplus is paid at the export rate" />
        {p.useKwh > 0 && (
          <label className="field mini">
            <span className="field-label">Export rate ({p.cur.trim()}/kWh)</span>
            <input className="text" type="number" min={0} step={0.1} value={p.exportRate || ''} placeholder={`${fmt(p.tariff * 0.4, 2)} (40 % of tariff)`} onChange={(ev) => set('exportRate', Math.max(0, Number(ev.target.value)))} />
          </label>
        )}
        <Field k="omPct" label="O&M + insurance" min={0} max={3} step={0.1} unit="% / yr" />
        <Field k="discount" label="Discount rate" min={0} max={15} step={0.5} unit="%" />
        <Field k="loanShare" label="Financed by loan" min={0} max={100} step={5} unit="%" />
        {p.loanShare > 0 && (
          <>
            <Field k="loanRate" label="Loan interest" min={0} max={20} step={0.25} unit="%" />
            <Field k="loanYears" label="Loan tenure" min={1} max={15} step={1} unit="yr" />
          </>
        )}
      </section>

      <section className="card env">
        <h3>For the planet</h3>
        <div className="grid2">
          <Stat value={fmt(f.env.co2Year, 1)} unit="t" label="CO₂ avoided a year" />
          <Stat value={fmt(f.env.co2Life)} unit="t" label="CO₂ over 25 years" />
          <Stat value={fmt(f.env.trees)} label="trees' worth of CO₂, every year" />
          {india && <Stat value={fmt(f.env.coal, 1)} unit="t" label="coal not burnt a year" />}
        </div>
      </section>

      <section className="card">
        <h3>Year by year
          <button className="mini-chip" onClick={() => download('sunplot-cashflow.csv', ['Year,kWh,Tariff,Savings,O&M,Loan,Net,Cumulative', ...f.rows.map((r) => [r.year, r.kwh, r.tariff, r.savings, r.om, r.loan, r.net, r.cumulative].map((v, i) => (i ? v.toFixed(i === 2 ? 2 : 0) : v)).join(','))].join('\n'))}>CSV</button>
        </h3>
        <table className="arrays cashflow">
          <thead><tr><th>Yr</th><th>kWh</th><th>Saved</th><th>O&M</th>{f.loan > 0 && <th>Loan</th>}<th>Cumulative</th></tr></thead>
          <tbody>
            {f.rows.filter((r) => r.year <= 5 || r.year % 5 === 0 || r.year === 12).map((r) => (
              <tr key={r.year} className={r.cumulative >= 0 ? '' : 'is-neg'}>
                <td>{r.year}</td><td>{fmt(r.kwh)}</td><td>{money(p.cur, r.savings)}</td><td>{money(p.cur, r.om)}</td>
                {f.loan > 0 && <td>{money(p.cur, r.loan)}</td>}<td>{money(p.cur, r.cumulative)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="fine">Year-1 energy is the P50 estimate; then −1 % light-induced loss and −0.4 %/yr. O&M rises 5 %/yr; one inverter replacement (≈10 % of cost) in year 12. Not financial advice.</p>
    </>
  )
}
