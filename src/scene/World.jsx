import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { useSolar } from '../store.js'
import { useLayout } from '../hooks.js'
import { sunPosition, sunVector, sunPath, dayLength } from '../solar.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { textures, labelTexture } from './textures.js'
import { siteRadius, treesFor } from '../context.js'
import { useWeather } from './Weather.jsx'

const RAD = Math.PI / 180

/** Radius that holds the whole site, whatever its rotation. */
export { siteRadius }

/** Soft studio reflections for glass and module faces, generated locally (no HDR download). */
function useEnvironment(strength) {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  useEffect(() => {
    scene.environmentIntensity = strength
  }, [scene, strength])
}

/** Radius of the dome the sun travels on — well outside any camera preset. */
export const skyRadius = (R) => R * 8 + 60

// Sky colours by sun altitude (degrees): night → dawn → day.
const SKY = [
  [-8, new THREE.Color('#0d1424')],
  [0, new THREE.Color('#3b3f5c')],
  [5, new THREE.Color('#e3a77c')],
  [15, new THREE.Color('#bcd3e6')],
  [40, new THREE.Color('#a9cbe8')],
]
function skyColor(altDeg, out) {
  if (altDeg <= SKY[0][0]) return out.copy(SKY[0][1])
  for (let i = 1; i < SKY.length; i++) {
    if (altDeg <= SKY[i][0]) {
      const [a0, c0] = SKY[i - 1]
      const [a1, c1] = SKY[i]
      return out.copy(c0).lerp(c1, (altDeg - a0) / (a1 - a0))
    }
  }
  return out.copy(SKY[SKY.length - 1][1])
}

/** Sunlight, sky colour and the sun disc, driven by latitude, day and solar time. */
export function Sun() {
  const { lat, day, hour } = useSolar((s) => s.params)
  const theme = useSolar((s) => s.theme)
  const layout = useLayout()
  const light = useRef()
  const hemi = useRef()
  const { scene } = useThree()
  const R = siteRadius(layout)
  const pos = sunPosition(lat, day, hour)
  const v = sunVector(pos)
  const altDeg = pos.alt / RAD
  const up = Math.max(0, Math.min(1, (altDeg + 2) / 12)) // fades light in over sunrise
  const D = R * 3 + 30 // shadow-casting light distance
  // Overcast rain lets little direct light through; snow cloud a bit more.
  const w = useWeather().kind
  const sunK = w === 'rain' ? 0.18 : w === 'snow' ? 0.4 : 1
  useEnvironment(0.12 + 0.38 * up)
  const mapSize = R > 45 ? 4096 : 2048

  useEffect(() => {
    const c = skyColor(altDeg, new THREE.Color())
    if (w !== 'clear') c.lerp(new THREE.Color(w === 'snow' ? '#c9d0d8' : '#7d8794'), 0.75).multiplyScalar(altDeg > 0 ? 1 : 0.4)
    if (theme === 'dark') c.multiplyScalar(0.55)
    scene.background = c
    const near = w === 'clear' ? 1.2 : 0.35
    scene.fog = new THREE.Fog(c, skyRadius(R) * near, skyRadius(R) * (w === 'clear' ? 3.5 : 1.6))
  }, [scene, altDeg, theme, R, w])

  useEffect(() => {
    const l = light.current
    if (!l) return
    const cam = l.shadow.camera
    const ext = R + 6
    cam.left = -ext
    cam.right = ext
    cam.top = ext
    cam.bottom = -ext
    cam.near = 1
    cam.far = D * 2
    cam.updateProjectionMatrix()
  }, [R])

  const warm = new THREE.Color('#ffd7a8').lerp(new THREE.Color('#fff8ee'), Math.min(1, Math.max(0, altDeg / 30)))
  const discR = skyRadius(R)
  return (
    <>
      <hemisphereLight ref={hemi} args={['#dbe8ff', w === 'snow' ? '#e8eef3' : '#6b7a52', (0.35 + 0.65 * up) * (w === 'clear' ? 1 : 1.25)]} />
      <ambientLight intensity={0.08} />
      <directionalLight
        ref={light}
        key={mapSize}
        position={[v[0] * D, Math.max(0.5, v[1] * D), v[2] * D]}
        intensity={3.1 * up * sunK}
        color={warm}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      {altDeg > -1 && w === 'clear' && (
        <>
          <mesh position={[v[0] * discR, v[1] * discR, v[2] * discR]}>
            <sphereGeometry args={[discR * 0.035, 24, 16]} />
            <meshBasicMaterial color={altDeg < 8 ? '#ffb46b' : '#ffe9a8'} fog={false} toneMapped={false} />
          </mesh>
          {/* A faint ray from the sun to the site, so the disc reads as "in the sky" from any angle. */}
          <Line points={[[v[0] * discR, v[1] * discR, v[2] * discR], [0, 0, 0]]} color="#f2b33d" lineWidth={1}
            transparent opacity={0.45} dashed dashSize={1} gapSize={0.8} />
        </>
      )}
    </>
  )
}

/** Today's arc of the sun across the sky, with hour ticks. */
export function SunPath() {
  const { lat, day } = useSolar((s) => s.params)
  const layout = useLayout()
  const R = skyRadius(siteRadius(layout))
  const points = useMemo(() => sunPath(lat, day).map((p) => p.map((c) => c * R)), [lat, day, R])
  const ticks = useMemo(() => {
    const span = dayLength(lat, day)
    if (!span) return []
    const out = []
    for (let h = Math.ceil(span[0]); h <= span[1]; h++) {
      const p = sunPosition(lat, day, h)
      if (p.alt > 0) out.push({ h, v: sunVector(p).map((c) => c * R) })
    }
    return out
  }, [lat, day, R])
  if (points.length < 2) return null
  return (
    <group>
      <Line points={points} color="#f2b33d" lineWidth={1.5} dashed dashSize={2} gapSize={1.2} transparent opacity={0.8} fog={false} />
      {ticks.map((t) => (
        <mesh key={t.h} position={t.v}>
          <sphereGeometry args={[R * 0.009, 8, 6]} />
          <meshBasicMaterial color="#f2b33d" fog={false} />
        </mesh>
      ))}
    </group>
  )
}

export function Ground() {
  const layout = useLayout()
  const R = siteRadius(layout)
  const size = skyRadius(R) * 8
  const snow = useWeather().kind === 'snow'
  const tex = textures()
  const grass = useMemo(() => {
    const t = tex.grass.clone()
    t.repeat.set(size / 6, size / 6)
    t.needsUpdate = true
    return t
  }, [tex, size])
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[size, size]} />
      {snow
        ? <meshStandardMaterial key="snow" color="#eef2f6" roughness={0.95} />
        : <meshStandardMaterial key="grass" map={grass} roughness={1} />}
    </mesh>
  )
}

/** N / E / S / W markers on the ground, fixed to the world — the site turns, the compass doesn't. */
export function Compass() {
  const layout = useLayout()
  const r = siteRadius(layout) + 3
  const marks = useMemo(() => [
    ['N', [0, 0, -r], '#b42318'],
    ['E', [r, 0, 0], '#1f2937'],
    ['S', [0, 0, r], '#1f2937'],
    ['W', [-r, 0, 0], '#1f2937'],
  ].map(([t, p, c]) => ({ t, p, map: labelTexture(t, { color: c }) })), [r])
  const ring = useMemo(() => {
    const pts = []
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2
      pts.push([Math.cos(a) * r, 0.05, Math.sin(a) * r])
    }
    return pts
  }, [r])
  const s = 0.9 + r * 0.025
  return (
    <group>
      <Line points={ring} color="#ffffff" lineWidth={1} transparent opacity={0.35} />
      <Line points={[[0, 0.06, -r + 0.6], [0, 0.06, -r - 0.6]]} color="#e5484d" lineWidth={3} />
      {marks.filter((m) => m.t === 'N').map((m) => (
        <sprite key={m.t} position={[m.p[0], s * 0.6, m.p[2] - s]} scale={[s, s, s]}>
          <spriteMaterial map={m.map} depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}


const LEAVES = ['#56743f', '#4b6a38', '#617f45', '#6d8a4c'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }))
const PINE = new THREE.MeshStandardMaterial({ color: '#35553a', roughness: 0.95, flatShading: true })
const BARK = new THREE.MeshStandardMaterial({ color: '#5d4636', roughness: 1 })

/** A broadleaf (three clustered crowns) or a conifer (three stacked cones). */
function Tree({ x, z, h, k, r }) {
  if (k > 0.4) {
    const leaf = LEAVES[Math.floor(r * LEAVES.length)]
    const c = h * 0.26
    return (
      <group position={[x, 0, z]} rotation-y={r * 6}>
        <mesh position={[0, h * 0.25, 0]} material={BARK} castShadow><cylinderGeometry args={[0.14, 0.24, h * 0.5, 7]} /></mesh>
        <mesh position={[0, h * 0.66, 0]} material={leaf} castShadow><icosahedronGeometry args={[c, 1]} /></mesh>
        <mesh position={[c * 0.6, h * 0.56, c * 0.3]} material={leaf} castShadow><icosahedronGeometry args={[c * 0.75, 1]} /></mesh>
        <mesh position={[-c * 0.55, h * 0.58, -c * 0.35]} material={leaf} castShadow><icosahedronGeometry args={[c * 0.7, 1]} /></mesh>
      </group>
    )
  }
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h * 0.15, 0]} material={BARK} castShadow><cylinderGeometry args={[0.12, 0.2, h * 0.3, 6]} /></mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, h * (0.38 + i * 0.2), 0]} material={PINE} castShadow>
          <coneGeometry args={[h * (0.26 - i * 0.06), h * 0.38, 8]} />
        </mesh>
      ))}
    </group>
  )
}

/** Trees and a road around the site: context, and shade casters for the morning/evening sun. */
export function Surroundings() {
  const far = useSolar((s) => s.params.surroundings)
  const azimuth = useSolar((s) => s.params.azimuth)
  const site = useSolar((s) => s.params.site)
  const layout = useLayout()
  const R = siteRadius(layout)
  const close = useSolar((s) => s.params.closeTrees)
  const trees = useMemo(() => treesFor(R, { far, close }), [R, far, close])
  const road = useMemo(() => {
    const t = textures().asphalt.clone()
    t.repeat.set(skyRadius(R) * 8 / 6, 1)
    t.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 })
  }, [R])
  if (!far && !close) return null
  // Laid out in the site's frame, so the road and open yard stay in front of the array.
  return (
    <group rotation-y={(180 - azimuth) * RAD}>
      {far && !['busstop', 'airport'].includes(site) && (
        <mesh position={[0, 0.02, R + 4.5]} rotation-x={-Math.PI / 2} receiveShadow material={road}>
          <planeGeometry args={[skyRadius(R) * 8, 6]} />
        </mesh>
      )}
      {trees.map((t, i) => <Tree key={i} {...t} />)}
    </group>
  )
}

/** Advance the solar clock while "play" is on; stop at sunset. */
export function DayClock() {
  useFrame((_, dt) => {
    const st = useSolar.getState()
    if (!st.playing) return
    const { lat, day, hour } = st.params
    const span = dayLength(lat, day) ?? [6, 18]
    const next = hour + Math.min(dt, 0.1) * 1.2 // 1.2 solar hours per second
    if (next >= span[1]) {
      st.set('hour', span[1])
      st.togglePlay()
    } else st.set('hour', Math.max(next, span[0]))
  })
  return null
}
