import { useSolar } from '../store.js'
import Icon from './Icon.jsx'

/** Logo, reset and the Studio / Site survey switch at the top of the left panel. */
export default function Brand() {
  const mode = useSolar((s) => s.mode)
  const { setMode, reset } = useSolar.getState()
  return (
    <>
      <div className="brand-row">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); reset() }}>
          <span className="brand-mark" aria-hidden="true" />SunPlot
        </a>
        {mode === 'studio' && <button className="ghost-btn" onClick={reset} data-tip="Reset all inputs" aria-label="Reset all inputs"><Icon name="reset" size={16} /></button>}
      </div>
      <div className="seg mode-switch" role="radiogroup" aria-label="Mode">
        <button role="radio" aria-checked={mode === 'studio'} className={mode === 'studio' ? 'is-on' : ''} onClick={() => setMode('studio')}><Icon name="cube" size={14} />3D studio</button>
        <button role="radio" aria-checked={mode === 'survey'} className={mode === 'survey' ? 'is-on' : ''} onClick={() => setMode('survey')}><Icon name="pin" size={14} />Site survey</button>
      </div>
    </>
  )
}
