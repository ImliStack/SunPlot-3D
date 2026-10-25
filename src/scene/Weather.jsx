import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSolar } from '../store.js'
import { useLayout } from '../hooks.js'
import { siteRadius } from '../context.js'
import { panelOf } from '../presets.js'
import { MODULE_DEPTH } from './Arrays.jsx'
import { materials } from './parts.jsx'
import { MONTHS } from '../solar.js'

const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
export const monthOf = (day) => MONTH_START.findLastIndex((d) => day > d)

/**
 * The weather shown for the current day: forced by the user, or (auto) the typical weather of
 * that month from ten years of NASA POWER data. Returns { kind, month, rain, snow, depth, note }.
 */
export function useWeather() {
  const weather = useSolar((s) => s.params.weather)
  const day = useSolar((s) => s.params.day)
  const climate = useSolar((s) => s.climate)
  const m = monthOf(day)
  const mo = climate.status === 'ready' ? climate.summary.monthly[m] : null
  const rain = mo?.rain ?? 0 // mm/day
  const snow = mo?.snow ?? 0 // mm/day water equivalent
  const depth = mo?.snowDepth ?? 0 // cm
  let kind = weather
  if (weather === 'auto') kind = depth >= 2 || snow >= 0.4 ? 'snow' : rain >= 3.5 ? 'rain' : 'clear'
  const note = mo
    ? `${MONTHS[m]}: ${rain.toFixed(1)} mm/day rain${snow > 0.05 ? ` · ${snow.toFixed(1)} cm/day snowfall` : ''}${depth >= 1 ? ` · ${depth.toFixed(0)} cm on the ground` : ''}`
    : `${MONTHS[m]}: no climate data yet`
  return { kind, month: m, rain, snow, depth, note }
}

const RAIN = 4000
const SNOW = 3000

/** Falling rain streaks or snowflakes in a box around the site, recycled as they land. */
function Precipitation({ kind, R }) {
  const ref = useRef()
  const count = kind === 'rain' ? RAIN : SNOW
  const span = Math.min(R * 2.2 + 20, 160)
  const top = Math.min(40, 18 + R * 0.3)
  const data = useMemo(() => {
    const p = new Float32Array(count * (kind === 'rain' ? 6 : 3))
    const v = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * span
      const y = Math.random() * top
      const z = (Math.random() - 0.5) * span
      v[i] = kind === 'rain' ? 18 + Math.random() * 8 : 0.8 + Math.random() * 0.8
      if (kind === 'rain') p.set([x, y, z, x + 0.05, y - 0.55, z + 0.05], i * 6)
      else p.set([x, y, z], i * 3)
    }
    return { p, v }
  }, [kind, count, span, top])

  useFrame((state, dt) => {
    const g = ref.current?.geometry
    if (!g) return
    const a = g.attributes.position.array
    const step = Math.min(dt, 0.05)
    const t = state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      if (kind === 'rain') {
        const o = i * 6
        const dy = data.v[i] * step
        a[o + 1] -= dy
        a[o + 4] -= dy
        if (a[o + 4] < 0) {
          const y = top + Math.random() * 4
          a[o + 1] = y
          a[o + 4] = y - 0.55
        }
      } else {
        const o = i * 3
        a[o + 1] -= data.v[i] * step
        a[o] += Math.sin(t * 0.8 + i) * 0.3 * step // drift
        if (a[o + 1] < 0) a[o + 1] = top
      }
    }
    g.attributes.position.needsUpdate = true
  })

  if (kind === 'rain') {
    return (
      <lineSegments ref={ref} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.p, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#cfd8e3" transparent opacity={0.45} depthWrite={false} />
      </lineSegments>
    )
  }
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.p, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.14} sizeAttenuation transparent opacity={0.9} depthWrite={false} />
    </points>
  )
}

/**
 * Snow lying on the lower part of each built module. Steeper modules shed snow, so the
 * covered share falls with tilt (≈ 1 − tilt/60, at least 15 %).
 */
function SnowOnModules() {
  const ref = useRef()
  const layout = useLayout()
  const params = useSolar((s) => s.params)
  const m = panelOf(params)
  const panels = layout.panels
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 0.05, 1), [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f5f8fb', roughness: 0.9 }), [])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const X = new THREE.Vector3()
    const Y = new THREE.Vector3()
    const Z = new THREE.Vector3()
    const pos = new THREE.Vector3()
    const mat = new THREE.Matrix4()
    panels.forEach((pnl, i) => {
      Y.set(...pnl.N)
      X.set(...pnl.U)
      if (!params.portrait) X.crossVectors(new THREE.Vector3(...pnl.U), Y)
      Z.crossVectors(X, Y)
      // Size along local x / z, and which of the two runs down the slope.
      let sx = m.w
      let sz = m.h
      const tilt = Math.acos(Math.min(1, Y.y)) * (180 / Math.PI)
      const cover = Math.max(0.15, Math.min(1, 1 - tilt / 60))
      const downX = Math.abs(X.y) > Math.abs(Z.y)
      const axis = downX ? X : Z
      const sign = axis.y > 0 ? -1 : 1 // towards the lower edge
      const full = downX ? sx : sz
      if (downX) sx *= cover
      else sz *= cover
      pos.set(...pnl.pos).addScaledVector(Y, MODULE_DEPTH + 0.025).addScaledVector(axis, (sign * (full - full * cover)) / 2)
      mat.makeBasis(X.clone().multiplyScalar(sx), Y, Z.clone().multiplyScalar(sz)).setPosition(pos)
      mesh.setMatrixAt(i, mat)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [panels, params.portrait, m.w, m.h])
  if (!panels.length) return null
  return <instancedMesh key={panels.length} ref={ref} args={[geometry, material, panels.length]} frustumCulled={false} receiveShadow />
}

/** Snow tints roofs white while it lasts; restores the shingles afterwards. */
function SnowOnRoofs({ on }) {
  useEffect(() => {
    const m = materials()
    const saved = { map: m.shingles.map, color: m.shingles.color.clone() }
    if (on) {
      m.shingles.map = null
      m.shingles.color.set('#eef2f6')
      m.shingles.needsUpdate = true
    }
    return () => {
      m.shingles.map = saved.map
      m.shingles.color.copy(saved.color)
      m.shingles.needsUpdate = true
    }
  }, [on])
  return null
}

export default function Weather() {
  const w = useWeather()
  const layout = useLayout()
  const azimuth = useSolar((s) => s.params.azimuth)
  const R = siteRadius(layout)
  if (w.kind === 'clear') return null
  return (
    <>
      <Precipitation key={w.kind} kind={w.kind} R={R} />
      {w.kind === 'snow' && (
        <group rotation-y={((180 - azimuth) * Math.PI) / 180}>
          <SnowOnModules />
        </group>
      )}
      <SnowOnRoofs on={w.kind === 'snow'} />
    </>
  )
}
