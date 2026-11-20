import { useEffect, useState } from 'react'
import { useSolar } from '../store.js'
import { useLayout, useYield, useEngineering } from '../hooks.js'
import { historyState, onHistory, undoParams, redoParams, lastAutosave } from '../history.js'
import Icon from './Icon.jsx'

/**
 * The design workflow as a row of steps with live status:
 * Location → Site → Equipment → Layout → Shading → Simulation → Finance → Report.
 * Each step jumps to where that work happens.
 */
export function Workflow() {
  const p = useSolar((s) => s.params)
  const climate = useSolar((s) => s.climate)
  const hourly = useSolar((s) => s.hourly)
  const shading = useSolar((s) => s.shading)
  const layout = useLayout()
  const y = useYield(layout)
  const { e } = useEngineering(layout, y)
  const st = useSolar.getState()
  // Open the inputs on just this step's section (the others fold until a title is clicked).
  const focusLeft = (id) => {
    if (!useSolar.getState().panels.left) st.togglePanel('left')
    st.focusSection(id)
    setTimeout(() => document.querySelector(`.section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const right = (tab) => {
    if (!useSolar.getState().panels.right) st.togglePanel('right')
    st.setTab(tab)
  }
  const steps = [
    ['Location', hourly.status === 'ready' ? 'done' : hourly.status === 'error' ? 'warn' : 'busy', () => focusLeft('location'), `${p.placeName || 'Custom site'}: ${hourly.status === 'ready' ? hourly.data.dataset : hourly.status}`],
    ['Site', layout.surface > 0 ? 'done' : 'todo', () => focusLeft('structure'), `${Math.round(layout.surface || 0)} m² usable surface`],
    ['Equipment', e ? (e.ok ? 'done' : 'warn') : 'todo', () => right('electrical'), e ? `${e.inverter.n} × ${e.inverter.label}${e.ok ? '' : ': checks need attention'}` : 'Place modules first'],
    ['Layout', layout.count > 0 ? 'done' : 'todo', () => focusLeft('modules'), `${layout.count} modules, ${layout.kwp.toFixed(1)} kWp`],
    ['Shading', shading.status === 'ready' && y.shaded ? 'done' : 'busy', () => { if (!useSolar.getState().layers.shade) st.toggleLayer('shade') }, y.shaded ? `${((y.shadingLoss ?? 0) * 100).toFixed(1)} % beam loss` : 'Ray casting…'],
    ['Simulation', y.source === 'hourly' ? 'done' : 'busy', () => right('system'), y.source === 'hourly' ? `${Math.round(y.annual).toLocaleString('en-IN')} kWh/yr, hourly` : 'Waiting for hourly weather'],
    ['Finance', layout.count > 0 ? 'done' : 'todo', () => right('money'), 'Payback, IRR, scenarios'],
    ['Report', layout.count > 0 ? 'ready' : 'todo', () => document.querySelector('[aria-label="Client proposal (PDF)"]')?.click(), 'Branded PDF, CSV, JSON, CAD'],
  ]
  return (
    <nav className="workflow" aria-label="Design workflow">
      {steps.map(([label, state, go, hint], i) => (
        <button key={label} className={`wf-step is-${state}`} onClick={go} title={hint}>
          <span className="wf-dot">{state === 'done' ? '✓' : i + 1}</span>{label}
        </button>
      ))}
    </nav>
  )
}

/** Undo / redo of design inputs (Ctrl/⌘ Z, Shift Ctrl/⌘ Z), when click-to-install isn't active. */
export function HistoryButtons() {
  const [h, setH] = useState(historyState)
  const manual = useSolar((s) => s.install.mode === 'manual')
  useEffect(() => onHistory(() => setH(historyState())), [])
  useEffect(() => {
    if (manual) return
    const onKey = (ev) => {
      if (ev.target.closest?.('input, select, textarea')) return
      const mod = ev.metaKey || ev.ctrlKey
      if (!mod) return
      const k = ev.key.toLowerCase()
      if (k === 'z' || k === 'y') {
        ev.preventDefault()
        if (k === 'y' || ev.shiftKey) redoParams()
        else undoParams()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [manual])
  if (manual) return null
  return (
    <>
      <button className="tool" onClick={undoParams} disabled={!h.canUndo} aria-label="Undo design change" data-tip="Undo · Ctrl/⌘ Z"><Icon name="undo" /></button>
      <button className="tool" onClick={redoParams} disabled={!h.canRedo} aria-label="Redo design change" data-tip="Redo · Shift Ctrl/⌘ Z"><Icon name="redo" /></button>
    </>
  )
}

/** On open without a share link, restore the last autosaved design and say so. */
export function AutosaveRestore() {
  const [note, setNote] = useState(null)
  useEffect(() => {
    if (location.hash || useSolar.getState().client) return
    const saved = lastAutosave()
    if (!saved) return
    const prev = useSolar.getState().params
    useSolar.setState({ params: saved.params })
    setNote({ at: saved.at, prev })
    const t = setTimeout(() => setNote(null), 9000)
    return () => clearTimeout(t)
  }, [])
  if (!note) return null
  return (
    <div className="toast" role="status">
      Restored your last design ({new Date(note.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}).
      <button className="link-btn" onClick={() => { useSolar.getState().reset(); setNote(null) }}>Start fresh</button>
    </div>
  )
}
