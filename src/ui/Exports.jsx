import { useEffect, useRef, useState } from 'react'
import { useSolar } from '../store.js'
import { useLayout, useYield, useEngineering } from '../hooks.js'
import { bomCsv } from '../electrical.js'
import Icon from './Icon.jsx'
import { download } from './Engineering.jsx'
import { DEFAULTS } from '../presets.js'

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
  const eng = useEngineering(layout, y)
  const { e } = eng
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
    ['chart', 'Hourly simulation, 8760 h (.csv)', y.sim ? `${y.weather.dataset}: POA, cell temperature, DC and AC per hour` : 'Available once hourly weather loads', () => y.sim && run('Writing CSV…', async () => download(`${name}-hourly.csv`, (await lib()).hourlyCsv(y, p, useSolar.getState().hourly.data)))],
    ['folder', 'Project file (.json)', 'Inputs and results; reopen with Import', () => run('Writing JSON…', async () => download(`${name}.sunplot.json`, (await lib()).projectJson({ p, install: useSolar.getState().install, layout, y, f: eng?.f }), 'application/json'))],
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
                <button onClick={act} disabled={!layout.count || (!!busy && !busy.startsWith('Failed') && !busy.startsWith('Opened'))}>
                  <Icon name={icon} size={16} />
                  <span><b>{label}</b><small>{hint}</small></span>
                </button>
              </li>
            ))}
          </ul>
          <label className="import-file">
            <Icon name="folder" size={16} />
            <span><b>Import project file</b><small>A .sunplot.json exported here</small></span>
            <input type="file" accept=".json,application/json" onChange={(ev) => {
              const file = ev.target.files?.[0]
              ev.target.value = ''
              if (!file) return
              run('Reading project…', async () => {
                const { params, install } = (await lib()).parseProjectJson(await file.text())
                const st = useSolar.getState()
                st.patch({ ...DEFAULTS, ...params })
                if (install.mode === 'manual' && Array.isArray(install.sel)) {
                  st.setInstallMode('manual')
                  st.applyKeys(install.sel, true, { record: false })
                } else st.setInstallMode('auto')
                st.cameraCommand('home')
                setBusy(`Opened ${file.name}`)
              })
            }} />
          </label>
          {busy && <span className="field-hint">{busy.startsWith('Failed') || busy.startsWith('Opened') ? busy : <><span className="spinner" /> {busy}</>}</span>}
        </div>
      )}
    </div>
  )
}
