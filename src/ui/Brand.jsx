import { useSolar } from '../store.js'
import Icon from './Icon.jsx'

export const REPO = 'https://github.com/ImliStack/SunPlot-3D'
export const SITE = 'https://imlistack.com'

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
        <span className="brand-actions">
          <a className="ghost-btn" href={REPO} target="_blank" rel="noreferrer" data-tip="Source code on GitHub" aria-label="SunPlot 3D on GitHub"><Icon name="github" size={16} /></a>
          {mode === 'studio' && <button className="ghost-btn" onClick={reset} data-tip="Reset all inputs" aria-label="Reset all inputs"><Icon name="reset" size={16} /></button>}
        </span>
      </div>
      <a className="by-imli" href={SITE} target="_blank" rel="noreferrer">by <b>ImliStack</b> · more projects ↗</a>
      <div className="seg mode-switch" role="radiogroup" aria-label="Mode">
        <button role="radio" aria-checked={mode === 'studio'} className={mode === 'studio' ? 'is-on' : ''} onClick={() => setMode('studio')}><Icon name="cube" size={14} />3D studio</button>
        <button role="radio" aria-checked={mode === 'survey'} className={mode === 'survey' ? 'is-on' : ''} onClick={() => setMode('survey')}><Icon name="pin" size={14} />Site survey</button>
      </div>
    </>
  )
}
