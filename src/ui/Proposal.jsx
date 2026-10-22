import { useEffect, useRef, useState } from 'react'
import { useSolar } from '../store.js'
import { useLayout, useYield } from '../hooks.js'
import { captureView, captureFrom, nextFrames } from '../scene/capture.js'
import Icon from './Icon.jsx'

const remember = (k, v) => { try { localStorage.setItem(k, v) } catch {} }
const recall = (k) => { try { return localStorage.getItem(k) ?? '' } catch { return '' } }

/** Toolbar button + small form: client name, preparer, then one click to a PDF proposal. */
export default function Proposal() {
  const [open, setOpen] = useState(false)
  const [client, setClient] = useState('')
  const [preparer, setPreparer] = useState(recall('solar-preparer'))
  const [step, setStep] = useState(null)
  const layout = useLayout()
  const y = useYield(layout)
  const params = useSolar((s) => s.params)
  const climate = useSolar((s) => s.climate)
  const shading = useSolar((s) => s.shading)
  const box = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => !box.current?.contains(e.target) && !step && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open, step])

  const make = async () => {
    try {
      remember('solar-preparer', preparer)
      const tags = useSolar.getState().layers
      setStep('Capturing the 3D view…')
      await nextFrames(2)
      const hero = await captureView()
      setStep('Capturing the plan view…')
      // Plan view reads best with setback outlines on.
      if (!tags.zones) useSolar.getState().toggleLayer('zones')
      await nextFrames(2)
      const plan = await captureFrom('top')
      if (!tags.zones) useSolar.getState().toggleLayer('zones')
      setStep('Writing the PDF…')
      const { buildProposal } = await import('../report.js')
      const doc = await buildProposal({
        params, layout, yield: y, date: new Date(), client: client.trim(), preparer: preparer.trim(),
        images: { hero, plan },
        survey: params.site === 'terrace' ? useSolar.getState().survey.summary ?? null : null,
        save: !(import.meta.env.DEV && window.__noSave), // local checks skip the download
        climate: climate.status === 'ready' ? { years: climate.data.years, summary: climate.summary } : null,
      })
      if (import.meta.env.DEV) window.__proposal = { doc, hero, plan } // for local checks
      setStep(null)
      setOpen(false)
    } catch (err) {
      setStep(`Could not build the PDF: ${err.message}`)
    }
  }

  return (
    <div className="proposal" ref={box}>
      <button className={`tool ${open ? 'is-on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label="Client proposal (PDF)" data-tip="Client proposal (PDF)">
        <Icon name="doc" />
      </button>
      {open && (
        <div className="proposal-pop" role="dialog" aria-label="Client proposal">
          <strong>Client proposal</strong>
          <p>PDF: 3D view, {params.site === 'terrace' && useSolar.getState().survey.summary ? 'site survey, ' : ''}plan, arrays, monthly energy, loss breakdown, site climate and 25-year financials.</p>
          <label className="field mini">
            <span className="field-label">Client</span>
            <input className="text" value={client} placeholder="e.g. Sharma Residence" onChange={(e) => setClient(e.target.value)} />
          </label>
          <label className="field mini">
            <span className="field-label">Prepared by</span>
            <input className="text" value={preparer} placeholder="Your name or company" onChange={(e) => setPreparer(e.target.value)} />
          </label>
          <ul className="checks">
            <li className={climate.status === 'ready' ? 'ok' : ''}>{climate.status === 'ready' ? 'Measured climate included' : 'Climate data not loaded — model figures used'}</li>
            <li className={shading.status === 'ready' && y.shaded ? 'ok' : ''}>{y.shaded ? 'Shading study included' : 'Shading study still running'}</li>
            <li className={layout.count ? 'ok' : ''}>{layout.count ? `${layout.count} modules in the design` : 'No modules installed yet'}</li>
          </ul>
          <button className="primary-btn" onClick={make} disabled={!!step && !step.startsWith('Could') || !layout.count}>
            {step && !step.startsWith('Could') ? <><span className="spinner" />{step}</> : <><Icon name="doc" size={16} />Download PDF</>}
          </button>
          {step?.startsWith('Could') && <span className="field-hint">{step}</span>}
        </div>
      )}
    </div>
  )
}
