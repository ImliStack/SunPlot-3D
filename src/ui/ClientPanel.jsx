import { useSolar } from '../store.js'
import { useLayout, useYield, useEngineering } from '../hooks.js'
import { SITES, panelOf } from '../presets.js'
import Icon from './Icon.jsx'
import Brand, { REPO, SITE } from './Brand.jsx'

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—')
const money = (cur, n) => {
  const a = Math.abs(n)
  const v = cur === '₹' ? (a >= 1e7 ? `${fmt(a / 1e7, 2)} Cr` : a >= 1e5 ? `${fmt(a / 1e5, 2)} L` : fmt(a)) : a >= 1e6 ? `${fmt(a / 1e6, 2)} M` : fmt(a)
  return `${n < 0 ? '−' : ''}${cur}${v}`
}

/** Left column on a customer link: who prepared it, what the system is, what it saves, how to reply. */
export default function ClientPanel() {
  const c = useSolar((s) => s.client)
  const p = useSolar((s) => s.params)
  const layout = useLayout()
  const y = useYield(layout)
  const { f, ppa } = useEngineering(layout, y)
  const m = panelOf(p)
  const accent = c.color || undefined
  return (
    <aside className="inputs client-panel" aria-label="Your solar proposal">
      <div className="client-head" style={accent ? { borderColor: accent } : undefined}>
        {c.company ? <strong style={accent ? { color: accent } : undefined}>{c.company}</strong> : <Brand />}
        <span>Solar proposal{c.client ? ` for ${c.client}` : ''}</span>
      </div>
      <h2 className="client-title">{fmt(layout.kwp, 1)} kWp on your {SITES[p.site]?.short.toLowerCase() ?? 'site'}</h2>
      <p className="client-sub">{p.placeName || `${fmt(p.lat, 3)}, ${fmt(p.lon, 3)}`} · {fmt(layout.count)} × {m.watt} W {m.tile ? 'solar tiles' : 'modules'}</p>
      <div className="client-stats">
        <div><b>{fmt(y.annual)}</b><span>kWh a year</span></div>
        {ppa ? (
          <>
            <div><b>{money(p.cur, 0)}</b><span>upfront (RESCO)</span></div>
            <div><b>{p.cur}{fmt(ppa.ppa, 2)}</b><span>per kWh, {p.ppaYears} yr</span></div>
            <div><b>{money(p.cur, ppa.firstYear)}</b><span>saved in year 1</span></div>
          </>
        ) : (
          <>
            <div><b>{money(p.cur, f.net)}</b><span>{f.subsidy ? 'after subsidy' : 'system cost'}</span></div>
            <div><b>{money(p.cur, f.rows[0]?.savings ?? 0)}</b><span>saved in year 1</span></div>
            <div><b>{f.payback != null ? `${fmt(f.payback, 1)} yr` : '> 25 yr'}</b><span>payback</span></div>
          </>
        )}
        <div><b>{fmt(f.env.co2Year, 1)} t</b><span>CO₂ avoided a year</span></div>
        <div><b>{fmt(f.env.trees)}</b><span>trees' worth of CO₂</span></div>
      </div>
      <p className="client-note">Drag to turn the 3D model, scroll to zoom, and use the sun bar below to see shadows through the day and year. Figures use ten years of NASA weather for this location.</p>
      {(c.phone || c.email) && (
        <div className="client-contact">
          {c.phone && <a className="primary-btn" href={`tel:${c.phone.replace(/\s+/g, '')}`} style={accent ? { background: accent } : undefined}><Icon name="phone" size={16} />Call {c.phone}</a>}
          {c.email && <a className="link-btn" href={`mailto:${c.email}?subject=${encodeURIComponent(`Solar proposal, ${fmt(layout.kwp, 1)} kWp`)}`}>{c.email}</a>}
        </div>
      )}
      <p className="fine">Made with <a href={REPO} target="_blank" rel="noreferrer">SunPlot 3D</a>, open source by <a href={SITE} target="_blank" rel="noreferrer">ImliStack</a>. Concept estimate; final design after a site visit.</p>
    </aside>
  )
}

/** The customer link for the current design, carrying the installer's name and contact. */
export function customerLink(brand = {}, client = '') {
  const q = new URLSearchParams({ view: 'client' })
  if (brand.company) q.set('co', brand.company)
  if (brand.phone) q.set('ph', brand.phone)
  if (brand.email) q.set('em', brand.email)
  if (brand.color) q.set('cl', brand.color.replace('#', ''))
  if (client) q.set('for', client)
  return `${location.origin}${location.pathname}?${q}${location.hash}`
}
