import { useEffect, useRef, useState } from 'react'
import { useSolar } from '../store.js'
import { useLayout, useYield, useEngineering } from '../hooks.js'
import { bomCsv } from '../electrical.js'
import Icon from './Icon.jsx'
import { download } from './Engineering.jsx'

const slug = (s) => (s || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design'

function saveBlob(name, blob) {
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Toolbar button: CAD layout, generation CSVs, BOM, 3D model and an orbit video. */
export default function Exports() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const layout = useLayout()
  const y = useYield(layout)
  const { e } = useEngineering(layout, y)
  const p = useSolar((s) => s.params)
  const box = useRef(null)
  const name = `sunplot-${slug(p.placeName)}`

  useEffect(() => {
    if (!open) return
    const close = (ev) => !box.current?.contains(ev.target) && !busy && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open, busy])

  const run = async (label, job) => {
    try {
      setBusy(label)
      await job()
      setBusy(null)
    } catch (err) {
      setBusy(`Failed: ${err.message}`)
    }
  }
  const lib = () => import('../exports.js')

  const items = [
    ['ruler', 'CAD layout (.dxf)', 'Module outlines in metres, north up', () => run('Writing DXF…', async () => download(`${name}-layout.dxf`, (await lib()).layoutDxf(layout, p, name), 'application/dxf'))],
    ['chart', 'Monthly energy (.csv)', 'Per month and per array', () => run('Writing CSV…', async () => download(`${name}-monthly.csv`, (await lib()).monthlyCsv(y)))],
    ['chart', 'Hourly energy, 8760 h (.csv)', 'Typical year, scaled to the monthly totals', () => run('Computing 8760 hours…', async () => download(`${name}-hourly.csv`, (await lib()).hourlyCsv(y, p)))],
    ['plug', 'Bill of materials (.csv)', 'Modules, inverters, cables, protection', () => e && download(`${name}-bom.csv`, bomCsv(e.bom))],
    ['cube', '3D model (.glb)', 'Blender, SketchUp (glTF importer), 3D viewers', () => run('Exporting 3D model…', async () => saveBlob(`${name}.glb`, new Blob([await (await lib()).sceneGlb()], { type: 'model/gltf-binary' })))],
    ['play', 'Orbit video (.webm)', '8-second fly-around for WhatsApp / email', () => run('Recording 0 %', async () => {
      const blob = await (await lib()).recordOrbit(8, (f) => setBusy(`Recording ${Math.round(f * 100)} %`))
      saveBlob(`${name}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`, blob)
    })],
  ]

  return (
    <div className="proposal" ref={box}>
      <button className={`tool ${open ? 'is-on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label="Export files" data-tip="Export: CAD, CSV, 3D model, video">
        <Icon name="download" />
      </button>
      {open && (
        <div className="proposal-pop export-pop" role="dialog" aria-label="Export files">
          <strong>Export</strong>
          <ul className="export-list">
            {items.map(([icon, label, hint, act]) => (
              <li key={label}>
                <button onClick={act} disabled={!layout.count || (!!busy && !busy.startsWith('Failed'))}>
                  <Icon name={icon} size={16} />
                  <span><b>{label}</b><small>{hint}</small></span>
                </button>
              </li>
            ))}
          </ul>
          {busy && <span className="field-hint">{busy.startsWith('Failed') ? busy : <><span className="spinner" /> {busy}</>}</span>}
        </div>
      )}
    </div>
  )
}
