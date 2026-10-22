import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSolar } from '../store.js'
import { indexArrays, targetsFor } from '../installTools.js'
import { getControls } from './capture.js'
import { PANELS } from '../presets.js'
import { textures } from './textures.js'

export const MODULE_DEPTH = 0.035

const tmp = {
  m: new THREE.Matrix4(),
  x: new THREE.Vector3(),
  y: new THREE.Vector3(),
  z: new THREE.Vector3(),
  p: new THREE.Vector3(),
  s: new THREE.Vector3(),
  q: new THREE.Quaternion(),
}

const EASE = (t) => 1 - Math.pow(1 - t, 3)
const DROP = 0.45 // s per module drop
const HEIGHT = 3.5 // m it falls from
const WHITE = new THREE.Color('#ffffff')
const AMBER = new THREE.Color('#ffb020')
const RED = new THREE.Color('#e5484d')
const GHOST = new THREE.Color('#2f7fd8')
const GHOST_HOT = new THREE.Color('#ffb020')
const REMOVE = new THREE.Color('#ff9a9a')

/** Tint for the shade heat-map: white (unshaded) → amber → red at 25 %+ of beam lost. */
function shadeColor(f, out) {
  const t = Math.min(1, f / 0.25)
  return t < 0.5 ? out.copy(WHITE).lerp(AMBER, t * 2) : out.copy(AMBER).lerp(RED, (t - 0.5) * 2)
}

/**
 * Every candidate module as one instanced box (cell texture on the sky side, anodised frame on
 * the edges). In click-to-install mode, arrays not yet installed show as glowing ghosts; clicking
 * a ghost drops its modules in one by one, clicking an installed module removes its array.
 */
export function Modules({ candidates, params }) {
  const main = useRef()
  const ghost = useRef()
  const m = PANELS[params.panel]
  const tex = textures()
  const install = useSolar((s) => s.install)
  const hover = useSolar((s) => s.hover)
  const shadeOn = useSolar((s) => s.layers.shade)
  const shading = useSolar((s) => s.shading)
  const manual = install.mode === 'manual'
  const count = candidates.panels.length
  const geometry = useMemo(() => new THREE.BoxGeometry(m.w, MODULE_DEPTH, m.h), [m.w, m.h])
  const materials = useMemo(() => {
    const frame = new THREE.MeshStandardMaterial({ color: '#30353d', metalness: 0.7, roughness: 0.35 })
    const face = new THREE.MeshPhysicalMaterial({
      map: tex.module, roughness: 0.12, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05,
      reflectivity: 0.5, envMapIntensity: 1.3,
    })
    const back = new THREE.MeshStandardMaterial({ map: tex.backsheet, roughness: 0.8 })
    // BoxGeometry groups: +x, −x, +y (sky side), −y, +z, −z.
    return [frame, frame, face, back, frame, frame]
  }, [tex])
  // Heat-map mode: plain light faces so the per-module tint reads clearly.
  const heatMats = useMemo(() => {
    const face = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 })
    return [materials[0], materials[1], face, materials[3], materials[4], materials[5]]
  }, [materials])
  const ghostMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }), [])

  // Which array each module belongs to, its index inside it, and its index in the built design.
  const info = useMemo(() => {
    const arr = new Int32Array(count)
    const local = new Int32Array(count)
    const built = new Int32Array(count).fill(-1)
    const seen = new Array(candidates.arrays.length).fill(0)
    let b = 0
    candidates.panels.forEach((p, i) => {
      arr[i] = p.arr
      local[i] = seen[p.arr]++
      if (!manual || install.sel[p.key]) built[i] = b++
    })
    return { arr, local, built }
  }, [candidates, install.sel, manual, count])
  const byArray = useMemo(() => indexArrays(candidates), [candidates])

  // Modules the hovered click would affect, under the active tool.
  const preview = useMemo(() => {
    const mark = new Uint8Array(count)
    if (!manual || hover == null || hover >= count) return mark
    for (const j of targetsFor(candidates, byArray, hover, install.tool)) mark[j] = 1
    return mark
  }, [manual, hover, candidates, byArray, install.tool, count])

  // Resting matrix of every module.
  const base = useMemo(() => {
    const out = new Float32Array(count * 16)
    const { x, y, z, p, m: mat } = tmp
    candidates.panels.forEach((pnl, i) => {
      y.set(...pnl.N)
      x.set(...pnl.U)
      // Landscape turns the module a quarter-turn on its own plane.
      if (!params.portrait) x.crossVectors(tmp.s.set(...pnl.U), y)
      z.crossVectors(x, y)
      mat.makeBasis(x, y, z)
      p.set(...pnl.pos).addScaledVector(y, MODULE_DEPTH / 2)
      mat.setPosition(p)
      mat.toArray(out, i * 16)
    })
    return out
  }, [candidates, params.portrait, count])

  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])

  /** Write matrices; returns true while any module is still falling. */
  const place = (now) => {
    let busy = false
    for (let i = 0; i < count; i++) {
      const on = info.built[i] >= 0
      if (main.current) {
        if (!on) main.current.setMatrixAt(i, zero)
        else {
          tmp.m.fromArray(base, i * 16)
          const start = install.anim[candidates.panels[i].key]
          if (manual && start != null) {
            const t = (now - start) / 1000
            const k = t <= 0 ? 0 : Math.min(1, t / DROP)
            if (k < 1) {
              busy = true
              tmp.m.elements[13] += HEIGHT * (1 - EASE(k))
              if (k === 0) tmp.m.copy(zero)
            }
          }
          main.current.setMatrixAt(i, tmp.m)
        }
      }
      if (ghost.current) ghost.current.setMatrixAt(i, on ? zero : tmp.m.fromArray(base, i * 16))
    }
    for (const r of [main, ghost]) {
      if (!r.current) continue
      r.current.instanceMatrix.needsUpdate = true
      r.current.boundingSphere = null // recomputed on the next pointer raycast
    }
    return busy
  }

  const animating = useRef(false)
  useLayoutEffect(() => {
    animating.current = place(performance.now())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, info, install.anim])
  useFrame(() => {
    if (animating.current) animating.current = place(performance.now())
  })

  // Colours: shade heat-map on built modules, highlight on the hovered ghost array.
  const shadeKeyOk = shading.status === 'ready' && shading.perModule
  useLayoutEffect(() => {
    const c = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const b = info.built[i]
      if (main.current) {
        const f = shadeOn && shadeKeyOk && b >= 0 && b < shading.perModule.length ? shading.perModule[b] : 0
        main.current.setColorAt(i, preview[i] ? REMOVE : shadeOn ? shadeColor(f, c) : WHITE)
      }
      if (ghost.current) ghost.current.setColorAt(i, preview[i] ? GHOST_HOT : GHOST)
    }
    if (main.current?.instanceColor) main.current.instanceColor.needsUpdate = true
    if (ghost.current?.instanceColor) ghost.current.instanceColor.needsUpdate = true
  }, [info, shadeOn, shadeKeyOk, shading, preview, count])

  const st = useSolar.getState
  const installed = (i) => info.built[i] >= 0
  const keysOf = (idx) => idx.map((j) => candidates.panels[j].key)
  // Paint stroke: the first module decides add vs remove; orbiting pauses until release.
  const stroke = useRef(null)
  useEffect(() => {
    const end = () => {
      if (!stroke.current) return
      stroke.current = null
      const c = getControls()
      if (c) c.enabled = true
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  const onMove = (e) => {
    if (!manual || e.instanceId == null) return
    e.stopPropagation()
    if (st().hover !== e.instanceId) st().setHover(e.instanceId)
    document.body.style.cursor = install.tool === 'paint' ? 'crosshair' : 'pointer'
    if (stroke.current) st().applyKeys([candidates.panels[e.instanceId].key], stroke.current.value, { record: false })
  }
  const onOut = () => {
    if (st().hover != null) st().setHover(null)
    document.body.style.cursor = ''
  }
  const onDown = (e) => {
    if (!manual || install.tool !== 'paint' || e.instanceId == null || e.button !== 0) return
    e.stopPropagation()
    const c = getControls()
    if (c) c.enabled = false
    const value = !installed(e.instanceId)
    stroke.current = { value }
    st().beginStroke()
    st().applyKeys([candidates.panels[e.instanceId].key], value, { record: false })
  }
  const onClick = (e) => {
    if (!manual || install.tool === 'paint' || e.instanceId == null || e.delta > 5) return
    e.stopPropagation()
    const value = !installed(e.instanceId)
    st().applyKeys(keysOf(targetsFor(candidates, byArray, e.instanceId, install.tool)), value)
  }

  if (!count) return null
  return (
    <group key={count}>
      {/* Hidden instances are zero-scaled, so bounds change constantly: skip culling. */}
      <instancedMesh ref={main} args={[geometry, materials, count]} material={shadeOn ? heatMats : materials} castShadow receiveShadow frustumCulled={false}
        onPointerMove={onMove} onPointerOut={onOut} onPointerDown={onDown} onClick={onClick} />
      {manual && (
        <instancedMesh ref={ghost} args={[geometry, ghostMat, count]} renderOrder={2} frustumCulled={false}
          onPointerMove={onMove} onPointerOut={onOut} onPointerDown={onDown} onClick={onClick} />
      )}
    </group>
  )
}

export function Racking({ layout }) {
  const posts = useRef()
  const rails = useRef()
  const nPosts = layout.posts.length
  const nRails = layout.rails.length
  useLayoutEffect(() => {
    const { m, p, s, q } = tmp
    q.identity()
    layout.posts.forEach((post, i) => {
      p.set(post.pos[0], post.pos[1] + post.h / 2, post.pos[2])
      s.set(1, Math.max(0.01, post.h), 1)
      posts.current?.setMatrixAt(i, m.compose(p, q, s))
    })
    layout.rails.forEach((rail, i) => {
      p.set(...rail.pos)
      s.set(rail.len, 1, 1)
      rails.current?.setMatrixAt(i, m.compose(p, q, s))
    })
    if (posts.current) posts.current.instanceMatrix.needsUpdate = true
    if (rails.current) rails.current.instanceMatrix.needsUpdate = true
  }, [layout])
  return (
    <>
      {nPosts > 0 && (
        <instancedMesh key={`p${nPosts}`} ref={posts} args={[undefined, undefined, nPosts]} castShadow>
          <boxGeometry args={[0.08, 1, 0.08]} />
          <meshStandardMaterial color="#9aa1a9" metalness={0.7} roughness={0.4} />
        </instancedMesh>
      )}
      {nRails > 0 && (
        <instancedMesh key={`r${nRails}`} ref={rails} args={[undefined, undefined, nRails]} castShadow>
          <boxGeometry args={[1, 0.06, 0.05]} />
          <meshStandardMaterial color="#9aa1a9" metalness={0.7} roughness={0.4} />
        </instancedMesh>
      )}
    </>
  )
}
