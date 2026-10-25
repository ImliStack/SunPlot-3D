import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { panelOf } from '../presets.js'

// Engineering overlays drawn in the site frame: usable-area outlines, keep-outs, array tags, dimensions.

const LETTERS = 'ABCDEFGH'
const bearing = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8]
const fmt = (n, d = 1) => n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d })

export function Zones({ layout }) {
  return (
    <group>
      {layout.zones.map((pts, i) => (
        <Line key={`z${i}`} points={pts} color="#f2b33d" lineWidth={2} dashed dashSize={0.35} gapSize={0.2} />
      ))}
      {layout.keepouts.map((r, i) => (
        <Line key={`k${i}`} color="#e5484d" lineWidth={1.6} dashed dashSize={0.25} gapSize={0.15}
          points={[[r.x0, r.y, r.z0], [r.x1, r.y, r.z0], [r.x1, r.y, r.z1], [r.x0, r.y, r.z1], [r.x0, r.y, r.z0]]} />
      ))}
    </group>
  )
}

/** Tag anchors (site frame) for each array: letter, name, modules, kWp, tilt / azimuth. */
export function arrayTags(layout, params) {
  const watt = panelOf(params).watt
  let start = 0
  return layout.arrays.map((a, i) => {
    const own = layout.panels.slice(start, start + a.count)
    start += a.count
    if (!own.length) return null
    const c = [0, 0, 0]
    let top = -Infinity
    for (const p of own) {
      c[0] += p.pos[0]; c[1] += p.pos[1]; c[2] += p.pos[2]
      top = Math.max(top, p.pos[1])
    }
    return {
      id: `a${i}`, kind: 'array', letter: LETTERS[i], name: a.name,
      detail: `${a.count} × ${watt} W · ${fmt((a.count * watt) / 1000)} kWp · ${Math.round(a.tilt)}° / ${Math.round(a.azimuth)}° ${bearing(a.azimuth)}`,
      pos: [c[0] / own.length, top + 1.2, c[2] / own.length],
    }
  }).filter(Boolean)
}

/** Dimension label anchors, matching the lines drawn by <Dimensions>. */
export function dimTags(layout) {
  const b = layout.bounds
  const pad = 1.5
  return [
    { id: 'dl', kind: 'dim', label: `${fmt(b.x1 - b.x0)} m`, pos: [(b.x0 + b.x1) / 2, 0.05, b.z1 + pad] },
    { id: 'dw', kind: 'dim', label: `${fmt(b.z1 - b.z0)} m`, pos: [b.x1 + pad, 0.05, (b.z0 + b.z1) / 2] },
    { id: 'dh', kind: 'dim', label: `${fmt(b.h)} m high`, pos: [b.x0 - pad, b.h / 2, b.z1 + pad] },
  ]
}

const Y = new THREE.Vector3(0, 1, 0)
/**
 * Projects tag anchors to screen pixels every frame and moves the matching DOM nodes
 * (rendered by <TagLayer> outside the canvas). Cheaper and sturdier than one React root per label.
 */
export function TagProjector({ tags, ry }) {
  const { camera, size } = useThree()
  const v = useRef(new THREE.Vector3())
  useFrame(() => {
    const placed = []
    for (const t of tags) {
      const el = document.getElementById(`tag-${t.id}`)
      if (!el) continue
      v.current.set(...t.pos).applyAxisAngle(Y, ry).project(camera)
      const hidden = v.current.z > 1 || Math.abs(v.current.x) > 1.2 || Math.abs(v.current.y) > 1.2
      placed.push({ el, hidden, kind: t.kind, x: ((v.current.x + 1) / 2) * size.width, y: ((1 - v.current.y) / 2) * size.height })
    }
    // Array tags that would overlap are stacked upwards, nearest-to-top first.
    const arrays = placed.filter((p) => p.kind === 'array').sort((a, b) => a.y - b.y)
    for (let i = 1; i < arrays.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = arrays[i]
        const b = arrays[j]
        if (Math.abs(a.x - b.x) < 220 && Math.abs(a.y - b.y) < 40) a.y = b.y + 40
      }
    }
    for (const p of placed) {
      p.el.style.opacity = p.hidden ? '0' : '1'
      p.el.style.transform = `translate(${p.x}px, ${p.y}px)`
    }
  })
  return null
}

function Dim({ a, b, offset }) {
  const A = [a[0] + offset[0], a[1] + offset[1], a[2] + offset[2]]
  const B = [b[0] + offset[0], b[1] + offset[1], b[2] + offset[2]]
  return (
    <group>
      <Line points={[A, B]} color="#e9eef5" lineWidth={1.4} />
      <Line points={[a, A]} color="#e9eef5" lineWidth={1} transparent opacity={0.6} />
      <Line points={[b, B]} color="#e9eef5" lineWidth={1} transparent opacity={0.6} />
    </group>
  )
}

/** Overall length, width and height of what is built. */
export function Dimensions({ layout }) {
  const b = layout.bounds
  const y = 0.05
  const pad = 1.5
  return (
    <group>
      <Dim a={[b.x0, y, b.z1]} b={[b.x1, y, b.z1]} offset={[0, 0, pad]} />
      <Dim a={[b.x1, y, b.z0]} b={[b.x1, y, b.z1]} offset={[pad, 0, 0]} />
      <Dim a={[b.x0, 0, b.z1]} b={[b.x0, b.h, b.z1]} offset={[-pad, 0, pad]} />
    </group>
  )
}
