import { useId, useState } from 'react'
import { METRICS, explain } from '../engine/registry.js'

/**
 * A number with its label. With `metric`, an ⓘ button opens how it's calculated (formula, inputs,
 * assumptions, source) from the calculation registry; keyboard and screen-reader accessible.
 */
export default function Stat({ value, unit, label, big, tip, metric }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const m = metric ? METRICS[metric] : null
  return (
    <div className={`stat ${big ? 'is-big' : ''}`} title={m ? undefined : tip}>
      <span className="stat-value">{value}{unit && <small> {unit}</small>}</span>
      <span className="stat-label">
        {label}
        {m && (
          <button type="button" className="info-dot" aria-label={`How ${m.label} is calculated`} aria-expanded={open} aria-describedby={open ? id : undefined}
            onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)}>ⓘ</button>
        )}
      </span>
      {m && open && (
        <span role="tooltip" id={id} className="metric-pop">
          <b>{m.label}</b> <small>({m.unit})</small>
          <code>{m.formula}</code>
          <span>{m.inputs}</span>
          {m.assumptions && <em>{m.assumptions}</em>}
          {m.source && <small>Source: {m.source}</small>}
          {tip && <small>{tip}</small>}
        </span>
      )}
    </div>
  )
}

export { explain }
