import { useMemo, useState } from 'react'
import { useSolar } from '../store.js'
import { useLayout, useYield, useEngineering } from '../hooks.js'
import { dailyTotals } from '../engine/simulate.js'
import { siteZone, offsetMinutes, REF_YEAR } from '../engine/clock.js'
import { MONTHS } from '../solar.js'
import Icon from './Icon.jsx'
import { panelOf } from '../presets.js'

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—')

/** Index range of the hourly series for the slider's day, in local clock time. */
function dayWindow(sim, p) {
  const zone = siteZone(p.lat, p.lon, p.tz)
  const off = zone.iana ? offsetMinutes(zone.iana, Date.UTC(REF_YEAR, 0, p.day)) : zone.fixedMinutes
  const { time, offsetHours } = sim.hourly
  const target = new Date(Date.UTC(REF_YEAR, 0, p.day))
  const md = (t) => {
    const d = new Date(t + offsetHours * 3600000 + off * 60000)
    return d.getUTCMonth() * 100 + d.getUTCDate()
  }
  const want = target.getUTCMonth() * 100 + target.getUTCDate()
  const idx = []
  for (let i = 0; i < time.length; i++) if (md(time[i]) === want) idx.push(i)
  return { idx, off }
}

/** Day curve: AC power, plane-of-array irradiance and cell temperature, hour by hour (local). */
function DayChart({ sim, p }) {
  const { idx, off } = dayWindow(sim, p)
  if (!idx.length) return <p className="empty small">No hours for this day in the weather file.</p>
  const W = 640
  const H = 170
  const pts = idx.map((i) => {
    const local = ((new Date(sim.hourly.time[i]).getUTCHours() + sim.hourly.offsetHours + off / 60) % 24 + 24) % 24
    return { h: local, ac: sim.hourly.ac[i] / 1000, poa: sim.hourly.poa[i], t: sim.hourly.tCell[i] }
  }).sort((a, b) => a.h - b.h)
  const maxAc = Math.max(...pts.map((x) => x.ac), 0.001)
  const x = (h) => 30 + (h / 24) * (W - 40)
  const yAc = (v) => H - 20 - (v / maxAc) * (H - 34)
  const yPoa = (v) => H - 20 - (v / 1200) * (H - 34)
  const path = (f) => pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.h).toFixed(1)},${f(q).toFixed(1)}`).join('')
  const kwh = pts.reduce((s, q) => s + q.ac, 0)
  const now = p.hour
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Hourly AC power, irradiance and cell temperature for the selected day">
        {[0, 6, 12, 18, 24].map((h) => <g key={h}><line x1={x(h)} x2={x(h)} y1={8} y2={H - 20} className="grid" /><text x={x(h)} y={H - 6} className="tick" textAnchor="middle">{String(h).padStart(2, '0')}:00</text></g>)}
        <path d={path((q) => yPoa(q.poa))} className="ln poa" />
        <path d={`${path((q) => yAc(q.ac))}L${x(pts[pts.length - 1].h)},${H - 20}L${x(pts[0].h)},${H - 20}Z`} className="area ac" />
        <line x1={x(now)} x2={x(now)} y1={8} y2={H - 20} className="now" />
        <text x={W - 8} y={16} textAnchor="end" className="tick">peak {fmt(maxAc, 1)} kW AC · {fmt(kwh, 1)} kWh this day</text>
      </svg>
      <div className="chart-legend"><span><i className="sw acsw" />AC power (kW)</span><span><i className="sw poasw" />POA irradiance (0–1,200 W/m²)</span><span>Cell temp. at noon {fmt(pts.reduce((b, q) => (Math.abs(q.h - 12.5) < Math.abs(b.h - 12.5) ? q : b), pts[0]).t, 0)} °C</span></div>
    </div>
  )
}

/** Year heat map: hour of day (rows) × day of year (columns), coloured by AC power. */
function HeatMap({ sim, p }) {
  const cells = useMemo(() => {
    const zone = siteZone(p.lat, p.lon, p.tz)
    const off = (zone.iana ? offsetMinutes(zone.iana, Date.UTC(REF_YEAR, 0, 15)) : zone.fixedMinutes) / 60
    const n = sim.hourly.ac.length
    const grid = Array.from({ length: 24 }, () => new Float32Array(365))
    let max = 0
    for (let i = 0; i < n; i++) {
      const t = new Date(sim.hourly.time[i] + (sim.hourly.offsetHours + off) * 3600000)
      const doy = Math.min(364, Math.floor((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000))
      const v = sim.hourly.ac[i] / 1000
      grid[t.getUTCHours()][doy] = v
      if (v > max) max = v
    }
    return { grid, max }
  }, [sim, p.lat, p.lon, p.tz])
  const W = 730
  const H = 170
  const cw = (W - 40) / 365
  const ch = (H - 26) / 24
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Heat map of AC power by hour and day of year" preserveAspectRatio="none">
        {cells.grid.map((row, h) => Array.from(row, (v, d) => (v > 0 ? <rect key={`${h}-${d}`} x={34 + d * cw} y={6 + (23 - h) * ch} width={cw + 0.3} height={ch + 0.3} fill={`hsl(${38 - (v / cells.max) * 30}, 90%, ${92 - (v / cells.max) * 50}%)`} /> : null)))}
        {[0, 6, 12, 18].map((h) => <text key={h} x={30} y={6 + (23 - h) * ch + ch / 2 + 3} className="tick" textAnchor="end">{h}h</text>)}
        {MONTHS.map((m, i) => <text key={m} x={34 + (i * 365 / 12 + 15) * cw} y={H - 6} className="tick" textAnchor="middle">{m}</text>)}
      </svg>
      <div className="chart-legend"><span>Darker = more power · max {fmt(cells.max, 1)} kW AC · local time</span></div>
    </div>
  )
}

/** 365 daily totals. */
function DailyChart({ sim }) {
  const days = useMemo(() => dailyTotals(sim), [sim])
  const max = Math.max(...days.map((d) => d.kwh), 0.001)
  const W = 730
  const H = 170
  const bw = (W - 40) / days.length
  const best = days.reduce((b, d) => (d.kwh > b.kwh ? d : b), days[0])
  const worst = days.reduce((b, d) => (d.kwh < b.kwh ? d : b), days[0])
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Daily energy for every day of the weather year" preserveAspectRatio="none">
        {days.map((d, i) => <rect key={d.date} x={34 + i * bw} y={H - 20 - (d.kwh / max) * (H - 30)} width={Math.max(0.6, bw - 0.4)} height={(d.kwh / max) * (H - 30)} className="bar" />)}
        {MONTHS.map((m, i) => <text key={m} x={34 + (i * 365 / 12 + 15) * bw} y={H - 6} className="tick" textAnchor="middle">{m}</text>)}
      </svg>
      <div className="chart-legend"><span>Best day {best.date.slice(5)}: {fmt(best.kwh, 1)} kWh</span><span>Worst {worst.date.slice(5)}: {fmt(worst.kwh, 1)} kWh</span><span>Mean {fmt(days.reduce((s, d) => s + d.kwh, 0) / days.length, 1)} kWh/day</span></div>
    </div>
  )
}

/** Monthly generation vs consumption, with what is used on site. */
function UseChart({ mix }) {
  if (!mix?.useYear) return <p className="empty small">Enter the site's electricity use in the Money tab to compare generation with consumption.</p>
  const { gen, use, self } = mix.monthly
  const max = Math.max(...gen, ...use, 0.001)
  const W = 640
  const H = 170
  const step = (W - 40) / 12
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Monthly generation, consumption and self-consumption">
        {MONTHS.map((m, i) => {
          const x0 = 34 + i * step
          const hG = (gen[i] / max) * (H - 34)
          const hU = (use[i] / max) * (H - 34)
          const hS = (self[i] / max) * (H - 34)
          return (
            <g key={m}>
              <rect x={x0 + step * 0.1} y={H - 20 - hG} width={step * 0.38} height={hG} className="bar" />
              <rect x={x0 + step * 0.1} y={H - 20 - hS} width={step * 0.38} height={hS} className="bar self" />
              <rect x={x0 + step * 0.52} y={H - 20 - hU} width={step * 0.38} height={hU} className="bar use" />
              <text x={x0 + step / 2} y={H - 6} className="tick" textAnchor="middle">{m}</text>
            </g>
          )
        })}
      </svg>
      <div className="chart-legend">
        <span><i className="sw gensw" />generation</span><span><i className="sw selfsw" />used on site</span><span><i className="sw usesw" />consumption</span>
        <span>Grid export {fmt(mix.exportKwh)} kWh · import {fmt(mix.importKwh)} kWh a year</span>
      </div>
    </div>
  )
}

/** Cell temperature against irradiance, coloured by the temperature loss it causes. */
function TempChart({ sim, gamma }) {
  const W = 640
  const H = 170
  const pts = []
  for (let i = 0; i < sim.hourly.poa.length; i += 3) if (sim.hourly.poa[i] > 50) pts.push([sim.hourly.poa[i], sim.hourly.tCell[i]])
  const tMax = Math.max(...pts.map((q) => q[1]), 30)
  const tMin = Math.min(...pts.map((q) => q[1]), 0)
  const x = (g) => 34 + (g / 1200) * (W - 44)
  const y = (t) => H - 20 - ((t - tMin) / (tMax - tMin)) * (H - 30)
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Cell temperature against irradiance">
        <line x1={34} x2={W - 10} y1={y(25)} y2={y(25)} className="grid" />
        <text x={36} y={y(25) - 3} className="tick">25 °C (STC)</text>
        {pts.map(([g, t], i) => <circle key={i} cx={x(g)} cy={y(t)} r={1.4} className={t > 25 ? 'dot hot' : 'dot'} />)}
        {[0, 400, 800, 1200].map((g) => <text key={g} x={x(g)} y={H - 6} className="tick" textAnchor="middle">{g} W/m²</text>)}
      </svg>
      <div className="chart-legend"><span>Cell temperature {fmt(tMin, 0)}–{fmt(tMax, 0)} °C · every °C above 25 costs {fmt(-gamma * 100, 2)} % of DC power</span></div>
    </div>
  )
}

const TABS = [['day', 'Selected day'], ['heat', 'Year heat map'], ['daily', 'Daily'], ['use', 'Generation vs use'], ['temp', 'Temperature']]

/** Bottom analytics dock under the 3D view; collapsed to a tab when closed. */
export default function Analytics() {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('solar-dock') === '1' } catch { return false } })
  const [tab, setTab] = useState('day')
  const p = useSolar((s) => s.params)
  const layout = useLayout()
  const y = useYield(layout)
  const eng = useEngineering(layout, y)
  const toggle = () => setOpen((o) => { try { localStorage.setItem('solar-dock', o ? '0' : '1') } catch {}; return !o })
  return (
    <div className={`dock ${open ? 'is-open' : ''}`}>
      <button className="dock-toggle" onClick={toggle} aria-expanded={open} aria-controls="analytics-dock">
        <Icon name="chart" size={14} /> Analytics {open ? '▾' : '▴'}
      </button>
      {open && (
        <section id="analytics-dock" className="dock-body" aria-label="Analytics">
          <div className="dock-tabs" role="tablist">
            {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{label}</button>)}
          </div>
          {!y.sim ? (
            <p className="empty small"><span className="spinner" /> Waiting for hourly weather to run the simulation…</p>
          ) : (
            <>
              {tab === 'day' && <DayChart sim={y.sim} p={p} />}
              {tab === 'heat' && <HeatMap sim={y.sim} p={p} />}
              {tab === 'daily' && <DailyChart sim={y.sim} />}
              {tab === 'use' && <UseChart mix={eng.mix} />}
              {tab === 'temp' && <TempChart sim={y.sim} gamma={(panelOf(p).gPmax ?? -0.35) / 100} />}
            </>
          )}
        </section>
      )}
    </div>
  )
}
