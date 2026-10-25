import { useMemo } from 'react'
import * as THREE from 'three'
import { OVERHANG, STOREY } from '../layout.js'
import { textures, facadeTexture, signTexture } from './textures.js'
import { Face, Strip, Walls, Windows, materials, repeated } from './parts.jsx'

const RAD = Math.PI / 180

/** Eave gutter + fascia along a level edge from `a` to `b`. */
function Eave({ a, b }) {
  const m = materials()
  const down = (p, dy, dz = 0) => [p[0], p[1] + dy, p[2] + dz]
  return (
    <>
      <Strip a={down(a, -0.08)} b={down(b, -0.08)} w={0.05} h={0.2} material={m.fascia} />
      <Strip a={down(a, -0.14)} b={down(b, -0.14)} w={0.14} h={0.1} material={m.gutter} />
    </>
  )
}

function Facades({ L, W, floors, x = 0, z = 0, sides = ['front', 'back', 'left', 'right'] }) {
  const at = {
    front: [[x, 0, z + W / 2 + 0.01], 0, L - 1.2],
    back: [[x, 0, z - W / 2 - 0.01], Math.PI, L - 1.2],
    right: [[x + L / 2 + 0.01, 0, z], Math.PI / 2, W - 1.2],
    left: [[x - L / 2 - 0.01, 0, z], -Math.PI / 2, W - 1.2],
  }
  return sides.map((s) => (
    <Windows key={s} at={at[s][0]} ry={at[s][1]} span={at[s][2]} floors={floors} door={s === 'front'} storey={STOREY} />
  ))
}

/** Gable, mono-pitch, hip and L-shaped houses: walls, roof planes, eaves and gutters. */
export function House({ layout, params }) {
  const m = materials()
  const { L } = layout
  const { kind, H, pitch, eaveY, ridgeY, W, wing } = layout.building
  const a = pitch * RAD
  const tan = Math.tan(a)
  const o = OVERHANG
  const Lo = L / 2 + o
  const Wo = W / 2 + o

  const roof = useMemo(() => {
    const faces = []
    const ends = []
    const slopeF = [0, Math.sin(a), -Math.cos(a)] // up-slope on the front plane
    const slopeB = [0, Math.sin(a), Math.cos(a)]
    if (kind === 'shed') {
      const top = eaveY + (W + 2 * o) * tan
      faces.push({ pts: [[-Lo, eaveY, Wo], [Lo, eaveY, Wo], [Lo, top, -Wo], [-Lo, top, -Wo]], U: [1, 0, 0], V: slopeF })
      const t = H + W * tan
      ends.push([[L / 2, H, W / 2], [L / 2, H, -W / 2], [L / 2, t, -W / 2]], [[-L / 2, H, W / 2], [-L / 2, H, -W / 2], [-L / 2, t, -W / 2]])
    } else if (kind === 'hip') {
      const r = Math.max(0, L / 2 - W / 2)
      faces.push({ pts: [[-Lo, eaveY, Wo], [Lo, eaveY, Wo], [r, ridgeY, 0], [-r, ridgeY, 0]], U: [1, 0, 0], V: slopeF })
      faces.push({ pts: [[Lo, eaveY, -Wo], [-Lo, eaveY, -Wo], [-r, ridgeY, 0], [r, ridgeY, 0]], U: [1, 0, 0], V: slopeB })
      faces.push({ pts: [[Lo, eaveY, Wo], [Lo, eaveY, -Wo], [r, ridgeY, 0]], U: [0, 0, 1], V: [-Math.cos(a), Math.sin(a), 0] })
      faces.push({ pts: [[-Lo, eaveY, -Wo], [-Lo, eaveY, Wo], [-r, ridgeY, 0]], U: [0, 0, 1], V: [Math.cos(a), Math.sin(a), 0] })
    } else {
      faces.push({ pts: [[-Lo, eaveY, Wo], [Lo, eaveY, Wo], [Lo, ridgeY, 0], [-Lo, ridgeY, 0]], U: [1, 0, 0], V: slopeF })
      faces.push({ pts: [[Lo, eaveY, -Wo], [-Lo, eaveY, -Wo], [-Lo, ridgeY, 0], [Lo, ridgeY, 0]], U: [1, 0, 0], V: slopeB })
      ends.push([[L / 2, H, W / 2], [L / 2, H, -W / 2], [L / 2, ridgeY - 0.05, 0]], [[-L / 2, H, -W / 2], [-L / 2, H, W / 2], [-L / 2, ridgeY - 0.05, 0]])
    }
    if (wing) {
      // Side wing: a gable running along z, from inside the main roof out to its own gable end.
      const xo = wing.w / 2 + o
      const zE = W / 2 + wing.l
      const zO = zE + o
      const rY = wing.ridgeY
      faces.push({ pts: [[wing.x + xo, eaveY, 0], [wing.x + xo, eaveY, zO], [wing.x, rY, zO], [wing.x, rY, 0]], U: [0, 0, 1], V: [-Math.cos(a), Math.sin(a), 0] })
      faces.push({ pts: [[wing.x - xo, eaveY, zO], [wing.x - xo, eaveY, 0], [wing.x, rY, 0], [wing.x, rY, zO]], U: [0, 0, 1], V: [Math.cos(a), Math.sin(a), 0] })
      ends.push([[wing.x - wing.w / 2, H, zE], [wing.x + wing.w / 2, H, zE], [wing.x, rY - 0.05, zE]])
    }
    return { faces, ends }
  }, [kind, L, W, H, a, tan, eaveY, ridgeY, Lo, Wo, o, wing])

  const eaves = useMemo(() => {
    const e = []
    if (kind === 'shed') {
      e.push([[-Lo, eaveY, Wo], [Lo, eaveY, Wo]])
    } else if (kind === 'lshape') {
      // Front eave stops where the wing begins.
      const xo = wing.w / 2 + o
      e.push([[-Lo, eaveY, Wo], [wing.x - xo, eaveY, Wo]], [[-Lo, eaveY, -Wo], [Lo, eaveY, -Wo]])
      const zO = W / 2 + wing.l + o
      e.push([[wing.x + xo, eaveY, Wo], [wing.x + xo, eaveY, zO]], [[wing.x - xo, eaveY, Wo], [wing.x - xo, eaveY, zO]])
    } else {
      e.push([[-Lo, eaveY, Wo], [Lo, eaveY, Wo]], [[-Lo, eaveY, -Wo], [Lo, eaveY, -Wo]])
      if (kind === 'hip') e.push([[Lo, eaveY, -Wo], [Lo, eaveY, Wo]], [[-Lo, eaveY, Wo], [-Lo, eaveY, -Wo]])
    }
    return e
  }, [kind, Lo, Wo, eaveY, wing, o, W])

  const ridges = useMemo(() => {
    const r = []
    if (kind === 'gable' || kind === 'lshape') r.push([[-Lo, ridgeY, 0], [Lo, ridgeY, 0]])
    if (kind === 'hip') {
      const h = Math.max(0, L / 2 - W / 2)
      r.push([[-h, ridgeY, 0], [h, ridgeY, 0]])
      for (const sx of [1, -1]) for (const sz of [1, -1]) r.push([[sx * h, ridgeY, 0], [sx * Lo, eaveY, sz * Wo]])
    }
    if (wing) r.push([[wing.x, wing.ridgeY, 0], [wing.x, wing.ridgeY, W / 2 + wing.l + o]])
    return r
  }, [kind, Lo, Wo, L, W, ridgeY, eaveY, wing, o])

  return (
    <group>
      <Walls L={L} H={H} W={W} />
      {wing && <Walls L={wing.w} H={H} W={W / 2 + wing.l} x={wing.x} z={(W / 2 + wing.l) / 2} />}
      {kind === 'shed' && (
        <mesh position={[0, H + (W * tan) / 2, -W / 2]} material={m.wall} castShadow receiveShadow>
          <boxGeometry args={[L, W * tan, 0.02]} />
        </mesh>
      )}
      {roof.ends.map((pts, i) => <Face key={`e${i}`} points={pts} material={m.gable} U={[0, 0, 1]} V={[0, 1, 0]} tile={3} />)}
      {roof.faces.map((f, i) => <Face key={`f${i}`} points={f.pts} U={f.U} V={f.V} material={{ clay: m.clay, metal: m.metalRoof }[params.roofing] ?? m.shingles} />)}
      {eaves.map(([a1, b1], i) => <Eave key={`v${i}`} a={a1} b={b1} />)}
      {ridges.map(([a1, b1], i) => <Strip key={`r${i}`} a={a1} b={b1} w={0.22} h={0.08} material={m.fascia} />)}
      <Facades L={L} W={W} floors={params.floors} sides={wing ? ['back', 'left', 'right'] : undefined} />
      {wing && (
        <>
          <Facades L={L - wing.w} W={W} floors={params.floors} x={-wing.w / 2} sides={['front']} />
          <Facades L={wing.w} W={wing.l} floors={params.floors} x={wing.x} z={W / 2 + wing.l / 2} sides={['front', 'left']} />
        </>
      )}
    </group>
  )
}

/** Chimneys, vents, rooftop HVAC, stair housings and skylights from the layout. */
export function Obstacles({ list }) {
  const m = materials()
  return list.map((o, i) => {
    const y = o.y0 + o.h / 2
    if (o.kind === 'chimney') {
      return (
        <group key={i} position={[o.x, 0, o.z]}>
          <mesh position={[0, y, 0]} material={m.brick} castShadow receiveShadow><boxGeometry args={[o.w, o.h, o.d]} /></mesh>
          <mesh position={[0, o.y0 + o.h + 0.05, 0]} material={m.concrete} castShadow><boxGeometry args={[o.w + 0.12, 0.1, o.d + 0.12]} /></mesh>
          <mesh position={[0.1, o.y0 + o.h + 0.25, 0]} material={m.darkSteel} castShadow><cylinderGeometry args={[0.1, 0.1, 0.3, 12]} /></mesh>
        </group>
      )
    }
    if (o.kind === 'vent') {
      return (
        <group key={i} position={[o.x, y, o.z]}>
          <mesh material={m.darkSteel} castShadow><cylinderGeometry args={[0.06, 0.06, o.h, 10]} /></mesh>
          <mesh position={[0, -o.h / 2 + 0.05, 0]} material={m.darkSteel}><cylinderGeometry args={[0.07, 0.16, 0.1, 10]} /></mesh>
        </group>
      )
    }
    if (o.kind === 'hvac') {
      return (
        <group key={i} position={[o.x, y, o.z]}>
          <mesh material={m.hvac} castShadow receiveShadow><boxGeometry args={[o.w, o.h, o.d]} /></mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[(s * o.w) / 4, o.h / 2 + 0.01, 0]} material={m.fan}>
              <cylinderGeometry args={[Math.min(o.w / 4, o.d / 2) * 0.8, Math.min(o.w / 4, o.d / 2) * 0.8, 0.03, 20]} />
            </mesh>
          ))}
        </group>
      )
    }
    if (o.kind === 'tank') {
      // Black polyethylene water tank on a small steel stand, as on most Indian terraces.
      return (
        <group key={i} position={[o.x, o.y0, o.z]}>
          {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => (
            <mesh key={`${a}${b}`} position={[a * 0.45, 0.35, b * 0.45]} material={m.darkSteel}><boxGeometry args={[0.06, 0.7, 0.06]} /></mesh>
          ))}
          <mesh position={[0, 0.72, 0]} material={m.darkSteel}><boxGeometry args={[1.2, 0.05, 1.2]} /></mesh>
          <mesh position={[0, 1.45, 0]} material={m.tank} castShadow receiveShadow><cylinderGeometry args={[0.6, 0.65, 1.4, 24]} /></mesh>
          <mesh position={[0, 2.18, 0]} material={m.tank} castShadow><cylinderGeometry args={[0.25, 0.6, 0.1, 24]} /></mesh>
        </group>
      )
    }
    if (o.kind === 'turbo') {
      return (
        <group key={i} position={[o.x, o.y0, o.z]}>
          <mesh position={[0, 0.2, 0]} material={m.steel}><cylinderGeometry args={[0.18, 0.22, 0.4, 16]} /></mesh>
          <mesh position={[0, 0.52, 0]} material={m.steel} castShadow><sphereGeometry args={[0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
          <mesh position={[0, 0.5, 0]} material={m.steel}><cylinderGeometry args={[0.3, 0.3, 0.12, 16]} /></mesh>
        </group>
      )
    }
    if (o.kind === 'skylight') {
      return (
        <group key={i} position={[o.x, y, o.z]}>
          <mesh material={m.steel}><boxGeometry args={[o.w + 0.3, o.h * 0.6, o.d + 0.3]} /></mesh>
          <mesh position={[0, o.h * 0.35, 0]} rotation-z={0} material={m.glass}><boxGeometry args={[o.w, 0.1, o.d]} /></mesh>
        </group>
      )
    }
    return (
      <group key={i} position={[o.x, y, o.z]}>
        <mesh material={m.wallFlat} castShadow receiveShadow><boxGeometry args={[o.w, o.h, o.d]} /></mesh>
        <mesh position={[0, -o.h / 2 + 1.05, o.d / 2 + 0.02]} material={m.darkSteel}><boxGeometry args={[0.9, 2.1, 0.05]} /></mesh>
      </group>
    )
  })
}

function Parapet({ L, W, H, h, t = 0.25, material }) {
  const walls = [
    [[0, H + h / 2, W / 2 - t / 2], [L, h, t]],
    [[0, H + h / 2, -W / 2 + t / 2], [L, h, t]],
    [[L / 2 - t / 2, H + h / 2, 0], [t, h, W]],
    [[-L / 2 + t / 2, H + h / 2, 0], [t, h, W]],
  ]
  return walls.map(([p, s], i) => (
    <mesh key={i} position={p} material={material} castShadow receiveShadow><boxGeometry args={s} /></mesh>
  ))
}

export function FlatBuilding({ layout, params }) {
  const m = materials()
  const { L, W } = layout
  const { H, parapet } = layout.building
  const roof = useMemo(() => {
    const mat = m.membrane.clone()
    mat.map = repeated(textures().membrane, L / 4, W / 4)
    return mat
  }, [m, L, W])
  return (
    <group>
      <Walls L={L} H={H} W={W} />
      <mesh position={[0, H + 0.005, 0]} rotation-x={-Math.PI / 2} material={roof} receiveShadow>
        <planeGeometry args={[L - 0.5, W - 0.5]} />
      </mesh>
      <Parapet L={L} W={W} H={H} h={parapet} material={m.wallFlat} />
      <Facades L={L} W={W} floors={params.floors} />
    </group>
  )
}

/** Industrial shed (PEB): metal-clad walls on a brick dado, gable spans with metal sheet roofs,
 *  polycarbonate skylight strips, cleaning walkways, ridge caps, valley gutters and roller shutters. */
export function IndustrialShed({ layout }) {
  const m = materials()
  const { L } = layout
  const { H, spans, span: S, a, rise, W, skylights, walkways } = layout.building
  const lift = 0.025
  const parts = useMemo(() => {
    const faces = []
    const ends = []
    const strips = []
    const ridges = []
    const N = (sz) => [0, Math.cos(a), sz * Math.sin(a)]
    for (let i = 0; i < spans; i++) {
      const zc = -W / 2 + S * (i + 0.5)
      const R = H + rise
      for (const sz of [1, -1]) {
        const ze = zc + (sz * S) / 2
        const V = [0, Math.sin(a), -sz * Math.cos(a)]
        faces.push({ pts: [[-L / 2 - 0.3, H, ze], [L / 2 + 0.3, H, ze], [L / 2 + 0.3, R, zc], [-L / 2 - 0.3, R, zc]], U: [1, 0, 0], V })
        const n = N(sz)
        const up = (q, k) => [q[0] + n[0] * k, q[1] + n[1] * k, q[2] + n[2] * k]
        for (const sk of skylights) {
          strips.push({ mat: 'polycarb', pts: [[sk.x - sk.w / 2, H, ze], [sk.x + sk.w / 2, H, ze], [sk.x + sk.w / 2, R, zc], [sk.x - sk.w / 2, R, zc]].map((q) => up(q, lift)) })
        }
        for (const [x0, x1] of walkways) {
          strips.push({ mat: 'grating', pts: [[x0, H, ze], [x1, H, ze], [x1, R, zc], [x0, R, zc]].map((q) => up(q, 0.06)) })
        }
      }
      for (const x of [L / 2, -L / 2]) ends.push([[x, H, zc + S / 2], [x, H, zc - S / 2], [x, R - 0.02, zc]])
      ridges.push([[-L / 2 - 0.3, R + 0.03, zc], [L / 2 + 0.3, R + 0.03, zc]])
    }
    const valleys = Array.from({ length: spans + 1 }, (_, i) => -W / 2 + i * S)
    return { faces, ends, strips, ridges, valleys }
  }, [L, H, spans, S, a, rise, W, skylights, walkways])
  const wall = useMemo(() => {
    const mat = m.metalWall.clone()
    mat.map = repeated(textures().metalSheet, L / 2.5, 1)
    return mat
  }, [m, L])
  const doors = Math.max(1, Math.round(L / 22))
  return (
    <group>
      <mesh position={[0, H / 2, 0]} material={wall} castShadow receiveShadow><boxGeometry args={[L, H, W]} /></mesh>
      <mesh position={[0, 0.75, 0]} material={m.brick} receiveShadow><boxGeometry args={[L + 0.06, 1.5, W + 0.06]} /></mesh>
      {Array.from({ length: doors }, (_, i) => (
        <group key={i} position={[-L / 2 + ((i + 0.5) * L) / doors, 0, W / 2 + 0.04]}>
          <mesh position={[0, 2.75, 0]} material={m.shutter}><boxGeometry args={[5, 5.5, 0.06]} /></mesh>
          <mesh position={[0, 5.65, 0.05]} material={m.darkSteel}><boxGeometry args={[5.4, 0.35, 0.3]} /></mesh>
        </group>
      ))}
      {parts.ends.map((pts, i) => <Face key={`e${i}`} points={pts} material={wall} U={[0, 0, 1]} V={[0, 1, 0]} tile={2.5} />)}
      {parts.faces.map((f, i) => <Face key={`f${i}`} points={f.pts} U={f.U} V={f.V} material={m.metalRoof} />)}
      {parts.strips.map((st, i) => <Face key={`s${i}`} points={st.pts} U={[1, 0, 0]} V={[0, 0, 1]} material={m[st.mat]} />)}
      {parts.ridges.map(([a1, b1], i) => <Strip key={`r${i}`} a={a1} b={b1} w={0.45} h={0.08} material={m.gutter} />)}
      {parts.valleys.map((z, i) => <Strip key={`v${i}`} a={[-L / 2 - 0.3, H - 0.08, z]} b={[L / 2 + 0.3, H - 0.08, z]} w={0.4} h={0.18} material={m.gutter} />)}
    </group>
  )
}

/** A narrow-body jet (≈ A320: 37 m long, 34 m span) for scale on the apron. */
function Aircraft({ position, ry = 0, tail = '#1f4e8c' }) {
  const m = materials()
  const tailMat = useMemo(() => new THREE.MeshStandardMaterial({ color: tail, roughness: 0.5 }), [tail])
  return (
    <group position={position} rotation-y={ry}>
      <mesh position={[0, 3.2, 0]} rotation-x={Math.PI / 2} material={m.white} castShadow>
        <capsuleGeometry args={[2, 31, 8, 20]} />
      </mesh>
      <mesh position={[0, 2.4, 1.5]} material={m.white} castShadow><boxGeometry args={[34, 0.35, 4.5]} /></mesh>
      <mesh position={[0, 3.6, -15]} material={m.white} castShadow><boxGeometry args={[12, 0.25, 2.6]} /></mesh>
      <mesh position={[0, 7.4, -15.5]} material={tailMat} castShadow><boxGeometry args={[0.4, 6.5, 4]} /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 5.8, 1.5, 3]} rotation-x={Math.PI / 2} material={m.steel} castShadow>
          <cylinderGeometry args={[1, 1, 4, 16]} />
        </mesh>
      ))}
      <mesh position={[0, 3.6, 16.8]} material={m.glass}><boxGeometry args={[2.4, 0.6, 0.8]} /></mesh>
    </group>
  )
}

/** Airport terminal: curtain-wall hall, entrance canopy, forecourt road, apron, jets and a tower. */
export function Terminal({ layout }) {
  const m = materials()
  const { L, W } = layout
  const { H } = layout.building
  const tex = textures()
  const hall = useMemo(() => {
    const long = new THREE.MeshStandardMaterial({ map: repeated(tex.curtain, L / 8, H / 9), roughness: 0.15, metalness: 0.35, envMapIntensity: 1.2 })
    const short = new THREE.MeshStandardMaterial({ map: repeated(tex.curtain, W / 8, H / 9), roughness: 0.15, metalness: 0.35, envMapIntensity: 1.2 })
    const top = new THREE.MeshStandardMaterial({ map: repeated(tex.membrane, L / 6, W / 6), roughness: 0.95 })
    return [short, short, top, m.concrete, long, long]
  }, [tex, L, W, H, m])
  const apron = useMemo(() => new THREE.MeshStandardMaterial({ map: repeated(tex.concrete, (L + 120) / 8, 100 / 8), roughness: 0.95 }), [tex, L])
  const road = useMemo(() => new THREE.MeshStandardMaterial({ map: repeated(tex.asphalt, (L + 80) / 6, 3), roughness: 0.95 }), [tex, L])
  const fc = layout.forecourt
  const jets = [-L / 4, L / 4]
  return (
    <group>
      <mesh position={[0, H / 2, 0]} material={hall} castShadow receiveShadow>
        <boxGeometry args={[L, H, W]} />
      </mesh>
      <Parapet L={L} W={W} H={H} h={1} t={0.6} material={m.steel} />
      {/* Departure-level canopy along the kerb. */}
      <mesh position={[0, 7.2, W / 2 + 5]} material={m.deck} castShadow receiveShadow><boxGeometry args={[L * 0.65, 0.4, 10]} /></mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-L * 0.31 + (L * 0.62 * i) / 8, 3.5, W / 2 + 9]} material={m.steel} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 7, 12]} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, W / 2 + (fc - W / 2) / 2]} rotation-x={-Math.PI / 2} material={road} receiveShadow>
        <planeGeometry args={[L + 80, fc - W / 2 - 4]} />
      </mesh>
      <mesh position={[0, 0.12, W / 2 + 10.5]} material={m.concrete} receiveShadow><boxGeometry args={[L + 20, 0.24, 1]} /></mesh>
      <mesh position={[0, 0.015, -W / 2 - 50]} rotation-x={-Math.PI / 2} material={apron} receiveShadow>
        <planeGeometry args={[L + 120, 100]} />
      </mesh>
      {jets.map((x, i) => (
        <group key={i}>
          <Aircraft position={[x, 0, -W / 2 - 30]} tail={i ? '#c2410c' : '#1f4e8c'} />
          {/* Jet bridge from the terminal to the forward door. */}
          <Strip a={[x - 4, 4.4, -W / 2]} b={[x - 3, 3.9, -W / 2 - 11]} w={2.6} h={2.8} material={m.hvac} />
        </group>
      ))}
      <group position={[L / 2 + 40, 0, -W / 2 - 20]}>
        <mesh position={[0, 20, 0]} material={m.wallFlat} castShadow><cylinderGeometry args={[2.5, 3.5, 40, 20]} /></mesh>
        <mesh position={[0, 42.5, 0]} material={m.glass} castShadow><cylinderGeometry args={[5.5, 4.5, 5, 12]} /></mesh>
        <mesh position={[0, 45.6, 0]} material={m.steel}><cylinderGeometry args={[5.8, 5.8, 1.2, 12]} /></mesh>
      </group>
    </group>
  )
}

/** Bus shelters: back posts, glass walls, bench, lit ad panel, kerb, road and a bus for scale. */
export function BusStops({ layout, params }) {
  const m = materials()
  const tex = textures()
  const { shelters } = layout.building
  const tilt = params.canopyTilt * RAD
  const total = layout.L
  const road = useMemo(() => new THREE.MeshStandardMaterial({ map: repeated(tex.asphalt, (total + 60) / 6, 2), roughness: 0.95 }), [tex, total])
  const pave = useMemo(() => new THREE.MeshStandardMaterial({ map: repeated(tex.concrete, (total + 6) / 2, 3), roughness: 0.95 }), [tex, total])
  const ad = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8f0f8', emissive: '#cfe0f5', emissiveIntensity: 0.6 }), [])
  const busPaint = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.45, metalness: 0.2 }), [])
  const D = params.width
  return (
    <group>
      <mesh position={[0, 0.08, 0.6]} material={pave} receiveShadow><boxGeometry args={[total + 6, 0.16, D + 3]} /></mesh>
      <mesh position={[0, 0.12, D / 2 + 2.05]} material={m.concrete} receiveShadow><boxGeometry args={[total + 6, 0.24, 0.3]} /></mesh>
      <mesh position={[0, 0.01, D / 2 + 6.2]} rotation-x={-Math.PI / 2} material={road} receiveShadow><planeGeometry args={[total + 60, 8]} /></mesh>
      {shelters.map((s, i) => {
        const back = -s.depth / 2 + 0.15
        const topBack = s.clear + s.depth * Math.tan(tilt)
        const xs = s.len > 6 ? [-1, 0, 1] : [-1, 1]
        return (
          <group key={i} position={[s.x, 0, 0]}>
            {xs.map((k) => (
              <mesh key={k} position={[k * (s.len / 2 - 0.25), topBack / 2, back]} material={m.darkSteel} castShadow>
                <boxGeometry args={[0.15, topBack, 0.15]} />
              </mesh>
            ))}
            {/* Cantilever arms from each post to the front edge. */}
            {xs.map((k) => (
              <Strip key={`arm${k}`} a={[k * (s.len / 2 - 0.25), topBack - 0.1, back]} b={[k * (s.len / 2 - 0.25), s.clear - 0.1, s.depth / 2 - 0.1]} w={0.12} h={0.16} material={m.darkSteel} />
            ))}
            <mesh position={[0, 1.35, back + 0.05]} material={m.clearGlass}><boxGeometry args={[s.len - 0.6, 2.1, 0.02]} /></mesh>
            <mesh position={[-s.len / 2 + 0.3, 1.35, 0]} material={m.clearGlass}><boxGeometry args={[0.02, 2.1, s.depth - 0.6]} /></mesh>
            <mesh position={[s.len / 2 - 0.9, 1.25, 0.1]} material={ad} castShadow><boxGeometry args={[1.2, 1.9, 0.22]} /></mesh>
            <mesh position={[-s.len * 0.1, 0.62, back + 0.45]} material={m.steel} castShadow><boxGeometry args={[s.len * 0.45, 0.06, 0.42]} /></mesh>
            {[-1, 1].map((k) => (
              <mesh key={k} position={[-s.len * 0.1 + (k * s.len * 0.2), 0.38, back + 0.45]} material={m.darkSteel}><boxGeometry args={[0.06, 0.5, 0.36]} /></mesh>
            ))}
          </group>
        )
      })}
      {/* A 12 m city bus at the first stop. */}
      <group position={[shelters[0].x, 0, D / 2 + 4.3]}>
        <mesh position={[0, 1.85, 0]} material={busPaint} castShadow><boxGeometry args={[12, 2.9, 2.55]} /></mesh>
        <mesh position={[0, 2.15, 0]} material={m.glass}><boxGeometry args={[11.6, 1.1, 2.57]} /></mesh>
        {[-4, 3.8].map((x) => [-1, 1].map((s) => (
          <mesh key={`${x}${s}`} position={[x, 0.5, s * 1.2]} rotation-x={Math.PI / 2} material={m.fan} castShadow>
            <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
          </mesh>
        )))}
      </group>
    </group>
  )
}

export function GroundPlot({ layout }) {
  const m = materials()
  const { L, W } = layout
  const tex = textures()
  const gravel = useMemo(() => new THREE.MeshStandardMaterial({ map: repeated(tex.gravel, L / 3, W / 3), roughness: 1 }), [tex, L, W])
  const posts = []
  const step = 3
  for (let x = -L / 2; x <= L / 2 + 0.01; x += L / Math.max(1, Math.round(L / step))) posts.push([x, W / 2], [x, -W / 2])
  for (let z = -W / 2 + W / Math.round(W / step); z < W / 2 - 0.01; z += W / Math.max(1, Math.round(W / step))) posts.push([L / 2, z], [-L / 2, z])
  const wires = [0.9, 1.6].flatMap((y) => [
    [[-L / 2, y, W / 2], [L / 2, y, W / 2]], [[-L / 2, y, -W / 2], [L / 2, y, -W / 2]],
    [[L / 2, y, -W / 2], [L / 2, y, W / 2]], [[-L / 2, y, -W / 2], [-L / 2, y, W / 2]],
  ])
  return (
    <group>
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2} material={gravel} receiveShadow>
        <planeGeometry args={[L, W]} />
      </mesh>
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.9, z]} material={m.darkSteel} castShadow><boxGeometry args={[0.06, 1.8, 0.06]} /></mesh>
      ))}
      {wires.map(([a, b], i) => <Strip key={`w${i}`} a={a} b={b} w={0.025} h={0.025} material={m.steel} />)}
      {/* Inverter / transformer skid at the gate. */}
      <mesh position={[L / 2 - 1.2, 0.8, W / 2 + 1.4]} material={m.hvac} castShadow receiveShadow><boxGeometry args={[1.8, 1.6, 1.1]} /></mesh>
    </group>
  )
}

/** Extrude a ring of [x, z] site points into a prism from y0 to y0 + h. */
function prism(ring, h) {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  return g
}

const SIGN_COLORS = { school: '#b5651d', hospital: '#2f9e8f', office: '#1e3a5f', retail: '#2f7d4f', fuel: '#d6262b' }

/** A name board above the parapet on the longest wall, facing outwards. */
function NameBoard({ ring, top, name, style }) {
  const sign = useMemo(() => {
    let best = 0
    let len = 0
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length]
      const l = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (l > len) { len = l; best = i }
    })
    const a = ring[best]
    const b = ring[(best + 1) % ring.length]
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0])
    let n = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len]
    if ((mid[0] - c[0]) * n[0] + (mid[1] - c[1]) * n[1] < 0) n = [-n[0], -n[1]]
    const width = Math.min(len * 0.6, 14)
    return { pos: [mid[0] + n[0] * 0.15, top + 0.75, mid[1] + n[1] * 0.15], ry: Math.atan2(n[0], n[1]), width }
  }, [ring, top])
  const tex = useMemo(() => signTexture(name, SIGN_COLORS[style] ?? '#1e3a5f'), [name, style])
  return (
    <group position={sign.pos} rotation-y={sign.ry}>
      <mesh castShadow><boxGeometry args={[sign.width + 0.2, 1.3, 0.12]} /><meshStandardMaterial color="#2a2f36" roughness={0.5} /></mesh>
      <mesh position={[0, 0, 0.07]}><planeGeometry args={[sign.width, (sign.width * 160) / 1024]} /><meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.25} /></mesh>
    </group>
  )
}

/** Extruded walls with a per-floor facade on the sides and plain concrete on the caps. */
function walledMaterials(style, cap) {
  const side = new THREE.MeshStandardMaterial({ map: facadeTexture(style), roughness: style === 'office' ? 0.3 : 0.85, metalness: style === 'office' ? 0.3 : 0 })
  return [cap, side] // ExtrudeGeometry groups: 0 = caps, 1 = sides
}

/** Surveyed terrace house: walls of any outline, parapet, and the neighbouring blocks around it. */
export function TerraceHouse({ layout }) {
  const m = materials()
  const { ring, H, parapet, style, name } = layout.building
  const walls = useMemo(() => prism(ring, H), [ring, H])
  const roof = useMemo(() => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z))))
    g.rotateX(-Math.PI / 2)
    return g
  }, [ring])
  const neighbours = useMemo(() => layout.neighbours.map((n) => ({ g: prism(n.ring, n.h), h: n.h })), [layout.neighbours])
  const wall = useMemo(() => walledMaterials(style, m.concrete), [style, m])
  const nWall = useMemo(() => walledMaterials('neighbour', m.neighbour), [m])
  return (
    <group>
      <mesh geometry={walls} material={wall} castShadow receiveShadow />
      <mesh geometry={roof} position={[0, H + 0.01, 0]} material={m.concrete} receiveShadow />
      {ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length]
        return <Strip key={i} a={[a[0], H + parapet / 2, a[1]]} b={[b[0], H + parapet / 2, b[1]]} w={0.22} h={parapet} material={m.wallFlat} />
      })}
      {name && <NameBoard ring={ring} top={H + parapet} name={name} style={style} />}
      {neighbours.map((n, i) => (
        <mesh key={`n${i}`} geometry={n.g} material={nWall} castShadow receiveShadow />
      ))}
    </group>
  )
}
