import { useState } from 'react'
import { useSolar } from '../store.js'
import { generateAlternatives, winners, OBJECTIVES } from '../alternatives.js'

// Compact money for the narrow table: ₹56.3 L, ₹1.2 Cr, £12.4k.
const short = (cur, n) => {
  if (!Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (cur === '₹') return a >= 1e7 ? `${sign}₹${(a / 1e7).toFixed(1)} Cr` : a >= 1e5 ? `${sign}₹${(a / 1e5).toFixed(1)} L` : `${sign}₹${Math.round(a).toLocaleString('en-IN')}`
  return a >= 1e6 ? `${sign}${cur}${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${sign}${cur}${(a / 1e3).toFixed(1)}k` : `${sign}${cur}${Math.round(a)}`
}
const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—')

/** Compare layout options for this site with the hourly engine, and apply one. */
export default function Alternatives({ p, y, mix }) {
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const hourly = y.source === 'hourly'
  const wx = useSolar((s) => s.hourly.data)

  const run = () => {
    setBusy(true)
    // Let the button repaint before the synchronous runs (~5 ms each once the sun series is cached).
    setTimeout(() => {
      const t0 = performance.now()
      const opts = generateAlternatives(p, { weather: wx, soiling: y.soilMonths, snow: y.snowMonths, mix })
      setRes({ opts, win: winners(opts), ms: performance.now() - t0, key: JSON.stringify(p) })
      setBusy(false)
    }, 20)
  }
  const apply = (o) => {
    useSolar.getState().patch(o.patch)
    setRes(null)
  }
  const stale = res && res.key !== JSON.stringify(p)

  return (
    <section className="card alternatives">
      <h3>Layout options</h3>
      {!hourly ? (
        <p className="card-note">Available once the hourly weather has loaded.</p>
      ) : (
        <>
          <p className="card-note">
            Tries tilts, orientation, module direction and roof faces for this site, each through the same hourly engine,
            losses and inverter sizing. Options are compared without obstruction shading; applying one re-runs the ray cast.
          </p>
          <button className="mini-chip" onClick={run} disabled={busy}>{busy ? 'Simulating…' : res ? 'Run again' : 'Generate options'}</button>
          {res && (
            <>
              {stale && <p className="card-note warn">The design changed since these were generated.</p>}
              <div className="table-wrap">
                <table className="arrays compare">
                  <thead><tr><th>Option</th><th>kWp</th><th title="kWh per kWp per year">Yield</th><th>{p.buyer === 'resco' ? 'Cost' : 'Payback'}</th><th>NPV</th><th /></tr></thead>
                  <tbody>
                    {res.opts.map((o) => {
                      const tags = OBJECTIVES.filter(([k]) => res.win[k] === o.id).map(([, l]) => l)
                      return (
                        <tr key={o.id} className={o.id === 'current' ? 'is-best' : ''}>
                          <td title={`${fmt(o.annual / 1000, 1)} MWh a year`}>{o.label}{tags.length > 0 && <span className="opt-tags">{tags.map((t) => <i key={t}>{t}</i>)}</span>}</td>
                          <td>{fmt(o.kwp, 1)}</td>
                          <td>{fmt(o.specific)}</td>
                          <td>{p.buyer === 'resco' ? short(p.cur, o.fin?.net) : o.fin?.payback != null ? `${fmt(o.fin.payback, 1)} y` : '—'}</td>
                          <td>{o.fin ? short(p.cur, o.fin.npv) : '—'}</td>
                          <td>{o.id !== 'current' && o.count > 0 && <button className="mini-chip" onClick={() => apply(o)} aria-label={`Apply ${o.label}`}>Use</button>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="field-hint">{res.opts.length} options in {fmt(res.ms)} ms, {y.weather.dataset}. Undo (Ctrl/⌘ Z) reverts an applied option.</p>
            </>
          )}
        </>
      )}
    </section>
  )
}
