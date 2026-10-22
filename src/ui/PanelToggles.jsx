import { useEffect } from 'react'
import { useSolar } from '../store.js'
import Icon from './Icon.jsx'

/** Edge handles that fold the side panels away to give the 3D view the full width. */
export default function PanelToggles() {
  const panels = useSolar((s) => s.panels)
  const toggle = useSolar((s) => s.togglePanel)
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '[') toggle('left')
      if (e.key === ']') toggle('right')
      if (e.key === '\\') toggle('focus')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])
  const btn = (side, open, label) => (
    <button className={`edge-toggle is-${side}`} onClick={() => toggle(side)} aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} ${label}`} data-tip={`${open ? 'Hide' : 'Show'} ${label} · ${side === 'left' ? '[' : ']'}`}>
      <Icon name={(side === 'left') === open ? 'chevL' : 'chevR'} size={16} />
    </button>
  )
  return (
    <>
      {btn('left', panels.left, 'inputs')}
      {btn('right', panels.right, 'results')}
    </>
  )
}
