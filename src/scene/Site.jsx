import { useMemo } from 'react'
import { useSolar } from '../store.js'
import { useLayout, useCandidates } from '../hooks.js'
import { House, FlatBuilding, Terminal, BusStops, GroundPlot, Obstacles, TerraceHouse } from './Buildings.jsx'
import { Canopies, CarPark } from './Structures.jsx'
import { Modules, Racking } from './Arrays.jsx'
import { Zones, Dimensions, TagProjector, arrayTags, dimTags } from './Overlays.jsx'

const RAD = Math.PI / 180
const HOUSES = ['gable', 'shed', 'hip', 'lshape']

/** The building, structure or plot and its modules, turned so the main array faces `azimuth`. */
export default function Site() {
  const params = useSolar((s) => s.params)
  const layers = useSolar((s) => s.layers)
  const layout = useLayout()
  const candidates = useCandidates()
  // Local +z (the array face) points at compass bearing `azimuth`: rotation = 180° − azimuth.
  const ry = (180 - params.azimuth) * RAD
  const kind = layout.building.kind
  const tags = useMemo(() => [
    ...(layers.labels ? arrayTags(layout, params) : []),
    ...(layers.dims ? dimTags(layout) : []),
  ], [layout, params, layers])
  return (
    <group rotation-y={ry}>
      {HOUSES.includes(kind) && <House layout={layout} params={params} />}
      {kind === 'flat' && <FlatBuilding layout={layout} params={params} />}
      {kind === 'terrace' && <TerraceHouse layout={layout} />}
      {kind === 'airport' && <Terminal layout={layout} />}
      {kind === 'busstop' && <BusStops layout={layout} params={params} />}
      {kind === 'ground' && <GroundPlot layout={layout} />}
      <Obstacles list={layout.obstacles} />
      <Canopies layout={layout} />
      <CarPark layout={layout} />
      <Modules candidates={candidates} params={params} />
      <Racking layout={layout} />
      {layers.zones && <Zones layout={layout} />}
      {layers.dims && <Dimensions layout={layout} />}
      <TagProjector tags={tags} ry={ry} />
    </group>
  )
}
