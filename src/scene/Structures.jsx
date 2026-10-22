import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { textures } from './textures.js'
import { materials, repeated } from './parts.jsx'

// Canopy steel (decks, columns, beams) and the car park under it.

export function Canopies({ layout }) {
  const m = materials()
  return (
    <group>
      {layout.decks.map((d, i) => (
        <mesh key={`d${i}`} position={d.pos} rotation-x={d.rotX} material={m.deck} castShadow receiveShadow>
          <boxGeometry args={d.size} />
        </mesh>
      ))}
      {layout.columns.map((c, i) => (
        <group key={`c${i}`} position={c.pos}>
          <mesh position={[0, c.h / 2, 0]} material={m.steel} castShadow><boxGeometry args={[0.36, c.h, 0.36]} /></mesh>
          <mesh position={[0, 0.2, 0]} material={m.concrete} receiveShadow><cylinderGeometry args={[0.45, 0.5, 0.4, 16]} /></mesh>
        </group>
      ))}
      {layout.beams.map((b, i) => (
        <mesh key={`b${i}`} position={b.pos} rotation-x={b.rotX} material={m.steel} castShadow>
          <boxGeometry args={b.size} />
        </mesh>
      ))}
    </group>
  )
}

const PAINT = ['#f4f4f2', '#1d1f22', '#9aa3ad', '#7d1f22', '#24477a', '#c9ccd1', '#3e5641', '#d9a441']
const tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), c: new THREE.Color(), e: new THREE.Euler() }

/** Cars as two instanced boxes (body + cabin), so a 500-bay lot stays cheap. */
function Cars({ cars }) {
  const body = useRef()
  const cabin = useRef()
  const glass = useRef()
  useLayoutEffect(() => {
    cars.forEach((car, i) => {
      tmp.q.setFromEuler(tmp.e.set(0, car.ry, 0))
      const put = (mesh, y, dz) => {
        // Cars nose into the bay: local z is along the car.
        tmp.p.set(car.x, y, car.z).add(new THREE.Vector3(0, 0, dz).applyQuaternion(tmp.q))
        mesh.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, tmp.s))
      }
      put(body.current, 0.62, 0)
      put(cabin.current, 1.28, -0.25)
      put(glass.current, 1.28, -0.25)
      body.current.setColorAt(i, tmp.c.set(PAINT[Math.floor(car.k * PAINT.length)]))
      cabin.current.setColorAt(i, tmp.c.set(PAINT[Math.floor(car.k * PAINT.length)]))
    })
    for (const r of [body, cabin, glass]) {
      r.current.instanceMatrix.needsUpdate = true
      if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true
    }
  }, [cars])
  if (!cars.length) return null
  return (
    <group key={cars.length}>
      <instancedMesh ref={body} args={[undefined, undefined, cars.length]} castShadow>
        <boxGeometry args={[1.8, 0.75, 4.4]} />
        <meshStandardMaterial roughness={0.35} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={cabin} args={[undefined, undefined, cars.length]} castShadow>
        <boxGeometry args={[1.62, 0.6, 2.3]} />
        <meshStandardMaterial roughness={0.35} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={glass} args={[undefined, undefined, cars.length]}>
        <boxGeometry args={[1.66, 0.42, 2.1]} />
        <meshStandardMaterial color="#1b2530" roughness={0.1} metalness={0.3} />
      </instancedMesh>
    </group>
  )
}

function Stripes({ stripes }) {
  const ref = useRef()
  useLayoutEffect(() => {
    stripes.forEach((s, i) => {
      tmp.q.identity()
      tmp.p.set(s.x, 0.03, s.z)
      ref.current.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, new THREE.Vector3(s.w, 1, s.d)))
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [stripes])
  if (!stripes.length) return null
  return (
    <instancedMesh key={stripes.length} ref={ref} args={[undefined, undefined, stripes.length]} receiveShadow>
      <boxGeometry args={[1, 0.01, 1]} />
      <meshStandardMaterial color="#f1f1ee" roughness={0.8} />
    </instancedMesh>
  )
}

export function CarPark({ layout }) {
  const { lot } = layout
  const tex = textures()
  const asphalt = useMemo(() => {
    if (!lot) return null
    return new THREE.MeshStandardMaterial({ map: repeated(tex.asphalt, (lot.x1 - lot.x0) / 6, (lot.z1 - lot.z0) / 6), roughness: 0.95 })
  }, [tex, lot])
  if (!lot) return null
  return (
    <group>
      <mesh position={[(lot.x0 + lot.x1) / 2, 0.02, (lot.z0 + lot.z1) / 2]} rotation-x={-Math.PI / 2} material={asphalt} receiveShadow>
        <planeGeometry args={[lot.x1 - lot.x0, lot.z1 - lot.z0]} />
      </mesh>
      <Stripes stripes={layout.stripes} />
      <Cars cars={layout.cars} />
    </group>
  )
}
