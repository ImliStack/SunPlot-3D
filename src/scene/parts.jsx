import { useMemo } from 'react'
import * as THREE from 'three'
import { textures } from './textures.js'

// Shared building blocks: textured polygons, beams between two points, materials, windows.

export function repeated(tex, x, y) {
  const t = tex.clone()
  t.repeat.set(x, y)
  t.needsUpdate = true
  return t
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Convex polygon from ordered 3-D points; UVs run along `U`/`V` in metres ÷ `tile`. */
export function polygonGeometry(points, U = [1, 0, 0], V = [0, 0, 1], tile = 2.5) {
  const g = new THREE.BufferGeometry()
  const pos = []
  const uv = []
  const push = (p) => {
    pos.push(...p)
    uv.push(dot(p, U) / tile, dot(p, V) / tile)
  }
  for (let i = 1; i < points.length - 1; i++) {
    push(points[0])
    push(points[i])
    push(points[i + 1])
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** A polygon mesh, double-sided so eaves show a soffit from below. */
export function Face({ points, U, V, material, tile }) {
  const geometry = useMemo(() => polygonGeometry(points, U, V, tile), [points, U, V, tile])
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />
}

const UP = new THREE.Vector3(0, 1, 0)
/** A box of section `w × h` running from point `a` to point `b` (fascia, gutters, ridge caps, beams). */
export function Strip({ a, b, w = 0.05, h = 0.2, material, roll = 0 }) {
  const { pos, quat, len } = useMemo(() => {
    const A = new THREE.Vector3(...a)
    const B = new THREE.Vector3(...b)
    const dir = B.clone().sub(A)
    const len = dir.length()
    dir.normalize()
    // Box local z runs along the strip; keep local y as close to world up as possible.
    const x = new THREE.Vector3().crossVectors(UP, dir)
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0)
    x.normalize()
    const y = new THREE.Vector3().crossVectors(dir, x)
    const m = new THREE.Matrix4().makeBasis(x, y, dir)
    const quat = new THREE.Quaternion().setFromRotationMatrix(m)
    if (roll) quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll))
    return { pos: A.add(B).multiplyScalar(0.5), quat, len }
  }, [a, b, roll])
  return (
    <mesh position={pos} quaternion={quat} material={material} castShadow receiveShadow>
      <boxGeometry args={[w, h, len]} />
    </mesh>
  )
}

let shared = null
/** One set of materials for every building, created on first use. */
export function materials() {
  if (shared) return shared
  const tex = textures()
  shared = {
    wall: new THREE.MeshStandardMaterial({ map: repeated(tex.plaster, 1, 1), roughness: 0.92 }),
    wallFlat: new THREE.MeshStandardMaterial({ color: '#d9d3c7', roughness: 0.9 }),
    plinth: new THREE.MeshStandardMaterial({ color: '#8e8a83', roughness: 0.95 }),
    trim: new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.6 }),
    fascia: new THREE.MeshStandardMaterial({ color: '#3b3632', roughness: 0.7 }),
    gutter: new THREE.MeshStandardMaterial({ color: '#d7d9db', roughness: 0.4, metalness: 0.5 }),
    shingles: new THREE.MeshStandardMaterial({ map: tex.shingles, roughness: 0.85, side: THREE.DoubleSide }),
    gable: new THREE.MeshStandardMaterial({ map: repeated(tex.plaster, 1, 1), roughness: 0.92, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#22313f', roughness: 0.06, metalness: 0.1, reflectivity: 0.6, clearcoat: 1, envMapIntensity: 1.4 }),
    clearGlass: new THREE.MeshPhysicalMaterial({ color: '#bcd3e0', roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false }),
    door: new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.6 }),
    brick: new THREE.MeshStandardMaterial({ map: tex.brick, roughness: 0.9 }),
    concrete: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: '#a7adb4', metalness: 0.75, roughness: 0.38 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: '#4b5058', metalness: 0.6, roughness: 0.45 }),
    deck: new THREE.MeshStandardMaterial({ color: '#d5d8dc', metalness: 0.5, roughness: 0.5 }),
    membrane: new THREE.MeshStandardMaterial({ map: repeated(tex.membrane, 1, 1), roughness: 0.95 }),
    hvac: new THREE.MeshStandardMaterial({ color: '#c5c9cc', metalness: 0.3, roughness: 0.55 }),
    fan: new THREE.MeshStandardMaterial({ color: '#2d3136', roughness: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: '#f2f3f5', roughness: 0.4, metalness: 0.1 }),
    tank: new THREE.MeshStandardMaterial({ color: '#202326', roughness: 0.55 }),
    neighbour: new THREE.MeshStandardMaterial({ color: '#cfc8bb', roughness: 0.9 }),
    metalRoof: new THREE.MeshStandardMaterial({ map: tex.metalSheet, metalness: 0.55, roughness: 0.42, side: THREE.DoubleSide }),
    metalWall: new THREE.MeshStandardMaterial({ map: tex.metalSheet, color: '#dfe5ea', metalness: 0.35, roughness: 0.5 }),
    clay: new THREE.MeshStandardMaterial({ map: tex.clay, roughness: 0.8, side: THREE.DoubleSide }),
    polycarb: new THREE.MeshPhysicalMaterial({ color: '#f3f6f2', roughness: 0.35, transmission: 0.2, transparent: true, opacity: 0.85 }),
    grating: new THREE.MeshStandardMaterial({ color: '#8d949b', metalness: 0.6, roughness: 0.5 }),
    shutter: new THREE.MeshStandardMaterial({ color: '#6f7a85', metalness: 0.5, roughness: 0.5 }),
  }
  return shared
}

/** A framed window with sill, or a door with frame and step. Local origin at its sill centre, facing +z. */
function Opening({ door }) {
  const m = materials()
  if (door) {
    return (
      <group>
        <mesh position={[0, 1.08, 0.02]} material={m.trim}><boxGeometry args={[1.2, 2.25, 0.08]} /></mesh>
        <mesh position={[0, 1.05, 0.05]} material={m.door}><boxGeometry args={[1, 2.1, 0.06]} /></mesh>
        <mesh position={[0, 0.06, 0.35]} material={m.concrete} receiveShadow><boxGeometry args={[1.6, 0.12, 0.7]} /></mesh>
      </group>
    )
  }
  return (
    <group>
      <mesh position={[0, 0.65, 0.02]} material={m.trim}><boxGeometry args={[1.28, 1.38, 0.08]} /></mesh>
      <mesh position={[0, 0.65, 0.05]} material={m.glass}><boxGeometry args={[1.1, 1.2, 0.04]} /></mesh>
      <mesh position={[0, 0.65, 0.07]} material={m.trim}><boxGeometry args={[0.05, 1.2, 0.02]} /></mesh>
      <mesh position={[0, -0.02, 0.09]} material={m.trim} castShadow><boxGeometry args={[1.42, 0.06, 0.18]} /></mesh>
    </group>
  )
}

/** Rows of windows on one facade: `span` wide, centred on `at`, facing `ry`. */
export function Windows({ span, floors, at, ry, door = false, storey = 3 }) {
  const items = []
  const n = Math.max(1, Math.floor(span / 2.6))
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (span * (i + 0.5)) / n
      const isDoor = door && f === 0 && i === Math.floor(n / 2)
      items.push(
        <group key={`${f}-${i}`} position={[x, isDoor ? 0 : f * storey + 0.95, 0]}>
          <Opening door={isDoor} />
        </group>,
      )
    }
  }
  return <group position={at} rotation-y={ry}>{items}</group>
}

/** Plastered walls with a plinth: a box `L × H × W` centred at `x, z`. */
export function Walls({ L, H, W, x = 0, z = 0 }) {
  const m = materials()
  const wall = useMemo(() => {
    const mat = m.wall.clone()
    mat.map = repeated(textures().plaster, Math.max(L, W) / 3, H / 3)
    return mat
  }, [m, L, W, H])
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, H / 2, 0]} material={wall} castShadow receiveShadow>
        <boxGeometry args={[L, H, W]} />
      </mesh>
      <mesh position={[0, 0.22, 0]} material={m.plinth} receiveShadow>
        <boxGeometry args={[L + 0.08, 0.44, W + 0.08]} />
      </mesh>
    </group>
  )
}
