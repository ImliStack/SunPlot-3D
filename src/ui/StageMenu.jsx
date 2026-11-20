import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSolar } from '../store.js'
import { useCandidates, useLayout, useYield } from '../hooks.js'
import { indexArrays, targetsFor } from '../installTools.js'
import { panelOf } from '../presets.js'
import { sunClock } from '../engine/clock.js'
import { undoParams, redoParams, historyState } from '../history.js'
import Icon from './Icon.jsx'

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—')

/**
 * Right-click menu on the 3D view. On a module: what it is (array, tilt, facing, shading) and
 * add/remove it, its row or its whole array. Anywhere: camera views, layers, sun, image, undo.
 * In auto-fill mode, editing a module switches to hand editing with the current design kept.
 */
const TIP_KEY = 'sunplot-tip-rightclick'

/** One-time hint that the 3D view has a right-click menu. */
function RightClickTip() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try { if (localStorage.getItem(TIP_KEY)) return } catch { return }
    const done = () => { setShow(false); try { localStorage.setItem(TIP_KEY, '1') } catch {} }
    const t = setTimeout(() => setShow(true), 4000)
    const off = setTimeout(done, 16000)
    window.addEventListener('contextmenu', done, { once: true })
    return () => { clearTimeout(t); clearTimeout(off); window.removeEventListener('contextmenu', done) }
  }, [])
  if (!show) return null
  return (
    <div className="tip-toast" role="status">
      Tip: right-click a module or the 3D view for module, view and layer options.
      <button className="link-btn small" onClick={() => { setShow(false); try { localStorage.setItem(TIP_KEY, '1') } catch {} }}>Got it</button>
    </div>
  )
}

export default function StageMenu() {
  const [menu, setMenu] = useState(null) // { x, y, hit }
  const box = useRef(null)
  const candidates = useCandidates()
  const layout = useLayout()
  const y = useYield(layout)
  const p = useSolar((s) => s.params)
  const layers = useSolar((s) => s.layers)
  const install = useSolar((s) => s.install)
  const byArray = useMemo(() => indexArrays(candidates), [candidates])

  useEffect(() => {
    const stage = document.querySelector('.stage')
    if (!stage) return
    const open = (ev) => {
      if (!ev.target.closest('canvas')) return
      ev.preventDefault()
      const st = useSolar.getState()
      const hit = st.ctxHit && performance.now() - st.ctxHit.at < 400 ? st.ctxHit : null
      useSolar.setState({ ctxHit: null })
      const r = stage.getBoundingClientRect()
      setMenu({ x: ev.clientX - r.left, y: ev.clientY - r.top, hit })
    }
    stage.addEventListener('contextmenu', open)
    return () => stage.removeEventListener('contextmenu', open)
  }, [])

  useEffect(() => {
    if (!menu) return
    const close = (ev) => !box.current?.contains(ev.target) && setMenu(null)
    const esc = (ev) => ev.key === 'Escape' && setMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    window.addEventListener('wheel', close, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('wheel', close)
    }
  }, [menu])

  // Keep the menu inside the stage.
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !menu) return
    const stage = el.parentElement.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (r.right > stage.right - 8) el.style.left = `${Math.max(8, menu.x - r.width)}px`
    if (r.bottom > stage.bottom - 8) el.style.top = `${Math.max(8, menu.y - r.height)}px`
  }, [menu])

  if (!menu) return <RightClickTip />
  const st = useSolar.getState()
  const act = (f) => () => { f(); setMenu(null) }
  const manual = install.mode === 'manual'
  const hit = menu.hit && candidates.panels[menu.hit.i]?.key === menu.hit.key ? menu.hit : null
  const arr = hit ? candidates.arrays[hit.arr] : null
  const shade = hit && y.shade?.[layout.arrays.findIndex((a) => a.name === arr?.name)]
  const shadeLoss = Array.isArray(shade) ? shade.reduce((a, b) => a + b, 0) / shade.length : null // mean monthly beam fraction lost
  const installedNow = hit ? (manual ? !!install.sel[hit.key] : true) : false

  /** Switch auto-fill to hand editing, keeping every module of the design on screen. */
  const toManual = () => {
    if (useSolar.getState().install.mode === 'manual') return
    const keys = layout.panels.map((q) => q.key)
    st.setInstallMode('manual')
    st.applyKeys(keys, true, { record: false })
  }
  const edit = (tool) => act(() => {
    toManual()
    // Manual candidates may include more roof planes; match by key.
    const targets = targetsFor(candidates, byArray, hit.i, tool).map((j) => candidates.panels[j].key)
    useSolar.getState().applyKeys(targets, !installedNow)
  })
  const verb = installedNow ? 'Remove' : 'Install'
  const noon = () => {
    const c = sunClock(p, p.day)
    if (c.noon != null) st.set('hour', Math.round(c.noon * 4) / 4)
  }
  const h = historyState()
  const layer = (k, label) => (
    <button role="menuitemcheckbox" aria-checked={!!layers[k]} onClick={act(() => st.toggleLayer(k))}>
      <span className="ctx-check">{layers[k] ? '✓' : ''}</span>{label}
    </button>
  )

  return (
    <div className="ctx-menu" ref={box} role="menu" style={{ left: menu.x, top: menu.y }} onContextMenu={(e) => e.preventDefault()}>
      {hit && arr && (
        <>
          <div className="ctx-head">
            <b>{arr.name}</b>
            <small>{panelOf(p).watt} W module · tilt {fmt(arr.tilt)}° · facing {fmt(arr.azimuth)}°{shadeLoss != null ? ` · ${fmt(shadeLoss * 100, 1)} % beam shaded` : ''}</small>
          </div>
          <button role="menuitem" onClick={edit('module')}><Icon name="panel" size={15} />{verb} this module</button>
          <button role="menuitem" onClick={edit('row')}><Icon name="rowsel" size={15} />{verb} this row</button>
          <button role="menuitem" onClick={edit('array')}><Icon name="zone" size={15} />{verb} the whole array ({byArray[hit.arr]?.length ?? 0})</button>
          {!manual && <p className="ctx-note">Editing switches to hand placement with the current design kept.</p>}
          <hr />
        </>
      )}
      <div className="ctx-row" role="group" aria-label="Views">
        {[['home', 'Home'], ['top', 'Top'], ['front', 'Front'], ['side', 'Side'], ['back', 'Back']].map(([k, l]) => (
          <button key={k} onClick={act(() => st.cameraCommand(k))}>{l}</button>
        ))}
      </div>
      <hr />
      {layer('shade', 'Shade heat map')}
      {layer('labels', 'Labels')}
      {layer('dims', 'Dimensions')}
      {layer('zones', 'Setback zones')}
      <hr />
      <button role="menuitem" onClick={act(noon)}><Icon name="sun" size={15} />Sun at solar noon</button>
      <button role="menuitem" onClick={act(() => st.togglePlay())}><Icon name="play" size={15} />Play the day</button>
      <button role="menuitem" onClick={act(() => st.takeSnapshot())}><Icon name="camera" size={15} />Save view as image</button>
      <button role="menuitem" onClick={act(() => {
        if (!useSolar.getState().panels.right) st.togglePanel('right')
        st.setTab('system')
        setTimeout(() => document.querySelector('.alternatives')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
      })}><Icon name="chart" size={15} />Compare layout options</button>
      {manual
        ? <button role="menuitem" onClick={act(() => st.setInstallMode('auto'))}><Icon name="reset" size={15} />Back to auto-fill</button>
        : <button role="menuitem" onClick={act(toManual)}><Icon name="brush" size={15} />Edit modules by hand</button>}
      <hr />
      <div className="ctx-row">
        <button disabled={manual ? !install.past.length : !h.canUndo} onClick={act(() => (manual ? st.undo() : undoParams()))}><Icon name="undo" size={15} />Undo</button>
        <button disabled={manual ? !install.future.length : !h.canRedo} onClick={act(() => (manual ? st.redo() : redoParams()))}><Icon name="redo" size={15} />Redo</button>
      </div>
    </div>
  )
}
