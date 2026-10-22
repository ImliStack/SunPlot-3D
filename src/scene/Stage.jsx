import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { useSolar } from '../store.js'
import { useLayout } from '../hooks.js'
import Site from './Site.jsx'
import Weather from './Weather.jsx'
import { registerRig, registerRenderer, flushCaptures } from './capture.js'
import { Sun, SunPath, Ground, Compass, Surroundings, DayClock, siteRadius } from './World.jsx'

const RAD = Math.PI / 180
const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Polar angle and distance for each preset view; azimuth is relative to the array face. */
const VIEWS = {
  home: { turn: 35, polar: 64, k: 1.3 },
  front: { turn: 0, polar: 74, k: 1.15 },
  side: { turn: 90, polar: 70, k: 1.15 },
  back: { turn: 180, polar: 62, k: 1.15 },
  top: { turn: 0, polar: 1, k: 1.1 },
}

/** Bounds centre in world space (the site group is turned by 180° − azimuth). */
function worldCentre(layout, azimuth) {
  const b = layout.bounds
  const cx = (b.x0 + b.x1) / 2
  const cz = (b.z0 + b.z1) / 2
  const ry = (180 - azimuth) * RAD
  return [cx * Math.cos(ry) + cz * Math.sin(ry), b.h * 0.35, -cx * Math.sin(ry) + cz * Math.cos(ry)]
}

function Rig() {
  const ref = useRef()
  const camera = useSolar((s) => s.camera)
  const azimuth = useSolar((s) => s.params.azimuth)
  const layout = useLayout()
  const R = siteRadius(layout)
  const b = layout.bounds
  const half = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2

  const go = (type, animate) => {
    const c = ref.current
    const v = VIEWS[type]
    if (!c || !v) return
    // Stand out along the bearing the array faces, turned by the preset; +x east, −z north.
    const bearing = (azimuth + v.turn) * RAD
    const polar = Math.max(0.01, v.polar * RAD)
    const t = worldCentre(layout, azimuth)
    const dir = [Math.sin(bearing) * Math.sin(polar), Math.cos(polar), -Math.cos(bearing) * Math.sin(polar)]
    c.setLookAt(t[0] + dir[0] * 50, t[1] + dir[1] * 50, t[2] + dir[2] * 50, ...t, false)
    // Keep that direction and fit the bounding sphere (camera-controls handles both fields of view).
    c.fitToSphere(new THREE.Sphere(new THREE.Vector3(...t), (half + b.h * 0.3) * v.k), animate)
  }

  useEffect(() => {
    registerRig({ controls: ref.current, go })
  })

  useEffect(() => {
    // Wait a frame so the canvas has its real size (and aspect) before framing.
    const id = requestAnimationFrame(() => go('home', false))
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c || camera.n === 0) return
    const animate = !REDUCED
    if (camera.type === 'zoomIn') c.dolly(half * 0.4, animate)
    else if (camera.type === 'zoomOut') c.dolly(-half * 0.4, animate)
    else go(camera.type, animate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  // Report the compass bearing the camera looks towards, for the HUD compass.
  const dir = useRef(new THREE.Vector3())
  const onChange = () => {
    const cam = ref.current?.camera
    if (!cam) return
    cam.getWorldDirection(dir.current)
    const heading = ((Math.atan2(dir.current.x, -dir.current.z) / RAD) + 360) % 360
    const st = useSolar.getState()
    if (Math.abs(heading - st.heading) > 0.5) st.setHeading(heading)
  }

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={3}
      maxDistance={R * 8 + 60}
      maxPolarAngle={Math.PI / 2 - 0.04}
      smoothTime={0.4}
      onChange={onChange}
    />
  )
}

/** Runs after the composer each frame, so the canvas still holds the finished image. */
function Snapshot() {
  const snap = useSolar((s) => s.snap)
  const pending = useRef(false)
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    if (snap) pending.current = true
  }, [snap])
  useEffect(() => registerRenderer({ gl, scene, camera }), [gl, scene, camera])
  useFrame(() => {
    flushCaptures(gl.domElement)
    if (!pending.current) return
    pending.current = false
    const a = document.createElement('a')
    a.href = gl.domElement.toDataURL('image/png')
    a.download = 'sunplot-view.png'
    a.click()
  }, 2)
  return null
}

/** Ambient occlusion (contact shadows in corners, under modules and cars) + antialiasing. */
function Effects() {
  const hq = useSolar((s) => s.hq)
  const layout = useLayout()
  const R = siteRadius(layout)
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {hq ? <N8AO aoRadius={Math.min(6, Math.max(0.8, R * 0.06))} intensity={2.2} distanceFalloff={1} halfRes quality="medium" /> : <></>}
      <SMAA />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

export default function Stage() {
  return (
    <Canvas
      className="stage-canvas"
      shadows
      dpr={[1, 2]}
      camera={{ fov: 35, near: 0.5, far: 9000, position: [30, 25, 40] }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0, preserveDrawingBuffer: false }}
    >
      <Sun />
      <SunPath />
      <Ground />
      <Compass />
      <Surroundings />
      <Site />
      <Weather />
      <Rig />
      <DayClock />
      <Effects />
      <Snapshot />
    </Canvas>
  )
}
