import { useEffect, useRef, useState } from 'react'
import { useSolar } from '../store.js'
import { useLayout, useYield, useEngineering } from '../hooks.js'
import { loadProjects, saveProjects, snapshot, newProject } from '../projects.js'
import Icon from './Icon.jsx'

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—')
const when = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** Toolbar button: save the design into a customer project, reopen, duplicate, compare designs. */
export default function Projects() {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState(loadProjects)
  const [active, setActive] = useState(null) // project id being viewed
  const [form, setForm] = useState({ name: '', customer: '', design: '' })
  const [msg, setMsg] = useState('')
  const box = useRef(null)
  const layout = useLayout()
  const y = useYield(layout)
  const { f, ppa } = useEngineering(layout, y)
  const params = useSolar((s) => s.params)
  const install = useSolar((s) => s.install)

  useEffect(() => {
    if (!open) return
    const close = (e) => !box.current?.contains(e.target) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const commit = (next, note) => {
    setList(next)
    setMsg(saveProjects(next) ? note : 'Could not save: browser storage is full or blocked')
  }
  const numbers = () => ({ kwp: layout.kwp, count: layout.count, kwh: y.annual, cost: f.gross, net: f.net, payback: f.payback, irr: f.irr, ppa: ppa?.ppa ?? null, site: params.site })
  const designName = () => form.design.trim() || `${fmt(layout.kwp, 1)} kWp ${params.site}`

  const saveNew = () => {
    const d = snapshot(designName(), { params, install, numbers: numbers() })
    const pr = newProject(form.name.trim() || params.placeName || 'Untitled project', form.customer.trim(), d)
    commit([pr, ...list], `Saved “${pr.name}”`)
    setActive(pr.id)
    setForm({ name: '', customer: '', design: '' })
  }
  const addTo = (pid) => {
    const d = snapshot(designName(), { params, install, numbers: numbers() })
    commit(list.map((pr) => (pr.id === pid ? { ...pr, designs: [...pr.designs, d] } : pr)), `Added “${d.name}”`)
    setForm((f0) => ({ ...f0, design: '' }))
  }
  const openDesign = (d) => {
    const st = useSolar.getState()
    st.patch(d.params)
    if (d.install.mode === 'manual') {
      st.setInstallMode('manual')
      st.applyKeys(Object.keys(d.install.sel), true, { record: false })
    } else st.setInstallMode('auto')
    st.cameraCommand('home')
    setMsg(`Opened “${d.name}”`)
  }
  const patchProject = (pid, fn) => commit(list.map((pr) => (pr.id === pid ? fn(pr) : pr)), 'Saved')
  const removeProject = (pid) => {
    if (!window.confirm('Delete this project and all its designs from this browser?')) return
    commit(list.filter((pr) => pr.id !== pid), 'Project deleted')
    setActive(null)
  }
  const pr = list.find((x) => x.id === active)

  return (
    <div className="proposal" ref={box}>
      <button className={`tool ${open ? 'is-on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label="Projects" data-tip="Projects: save, reopen, compare designs">
        <Icon name="folder" />
      </button>
      {open && (
        <div className="proposal-pop projects-pop" role="dialog" aria-label="Projects">
          {!pr ? (
            <>
              <strong>Projects <small>saved in this browser</small></strong>
              <div className="brand-fields">
                <label className="field mini"><span className="field-label">Project</span>
                  <input className="text" value={form.name} placeholder={params.placeName || 'e.g. Sharma Residence'} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label className="field mini"><span className="field-label">Customer</span>
                  <input className="text" value={form.customer} placeholder="Name, phone" onChange={(e) => setForm({ ...form, customer: e.target.value })} /></label>
                <label className="field mini"><span className="field-label">Design name</span>
                  <input className="text" value={form.design} placeholder={designName()} onChange={(e) => setForm({ ...form, design: e.target.value })} /></label>
              </div>
              <button className="primary-btn" onClick={saveNew} disabled={!layout.count}><Icon name="check" size={16} />Save as new project</button>
              <ul className="project-list">
                {list.map((x) => {
                  const primary = x.designs.find((d) => d.id === x.primary) ?? x.designs[0]
                  return (
                    <li key={x.id}>
                      <button onClick={() => setActive(x.id)}>
                        <span><b>{x.name}</b><small>{[x.customer, `${x.designs.length} design${x.designs.length > 1 ? 's' : ''}`, when(x.created)].filter(Boolean).join(' · ')}</small></span>
                        <em>{fmt(primary?.numbers.kwp, 1)} kWp</em>
                      </button>
                    </li>
                  )
                })}
                {!list.length && <li className="muted">No projects yet.</li>}
              </ul>
            </>
          ) : (
            <>
              <button className="link-btn" onClick={() => setActive(null)}>← All projects</button>
              <input className="project-title" value={pr.name} onChange={(e) => patchProject(pr.id, (q) => ({ ...q, name: e.target.value }))} aria-label="Project name" />
              <input className="text" value={pr.customer} placeholder="Customer" onChange={(e) => patchProject(pr.id, (q) => ({ ...q, customer: e.target.value }))} />
              <table className="arrays compare">
                <thead><tr><th /><th>Design</th><th>kWp</th><th>MWh</th><th>Payback</th><th /></tr></thead>
                <tbody>
                  {pr.designs.map((d) => (
                    <tr key={d.id} className={d.id === pr.primary ? 'is-best' : ''}>
                      <td><button className="star" title="Mark as the primary design" onClick={() => patchProject(pr.id, (q) => ({ ...q, primary: d.id }))}>{d.id === pr.primary ? '★' : '☆'}</button></td>
                      <td>{d.name}<small>{when(d.saved)}</small></td>
                      <td>{fmt(d.numbers.kwp, 1)}</td>
                      <td>{fmt(d.numbers.kwh / 1000, 1)}</td>
                      <td>{d.numbers.ppa ? `PPA ${fmt(d.numbers.ppa, 2)}` : d.numbers.payback != null ? `${fmt(d.numbers.payback, 1)} yr` : '—'}</td>
                      <td className="row-actions">
                        <button className="mini-chip" onClick={() => openDesign(d)}>Open</button>
                        <button className="mini-chip" title="Duplicate" onClick={() => patchProject(pr.id, (q) => ({ ...q, designs: [...q.designs, { ...d, id: Math.random().toString(36).slice(2, 10), name: `${d.name} (copy)`, saved: Date.now() }] }))}>⧉</button>
                        {pr.designs.length > 1 && <button className="mini-chip" title="Delete design" onClick={() => window.confirm(`Delete “${d.name}”?`) && patchProject(pr.id, (q) => ({ ...q, designs: q.designs.filter((x) => x.id !== d.id), primary: q.primary === d.id ? q.designs.find((x) => x.id !== d.id).id : q.primary }))}>×</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <label className="field mini"><span className="field-label">Save what's on screen as a new design</span>
                <span className="inline">
                  <input className="text" value={form.design} placeholder={designName()} onChange={(e) => setForm({ ...form, design: e.target.value })} />
                  <button className="mini-chip" onClick={() => addTo(pr.id)} disabled={!layout.count}>Add</button>
                </span>
              </label>
              <button className="link-btn danger" onClick={() => removeProject(pr.id)}>Delete project</button>
            </>
          )}
          {msg && <span className="field-hint">{msg}</span>}
        </div>
      )}
    </div>
  )
}
