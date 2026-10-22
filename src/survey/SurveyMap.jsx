import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useSolar } from '../store.js'
import { Protocol } from 'pmtiles'
import { toLngLat, centroid, mPerDegLon } from './geo.js'
import { buildingsUrl, OVERTURE_LAYER, OVERTURE_ATTRIBUTION, outerRing } from './overture.js'
import { reverse } from './places.js'

// Register the pmtiles:// protocol once for MapLibre.
let protocolAdded = false
function addPmtiles() {
  if (protocolAdded) return
  maplibregl.addProtocol('pmtiles', new Protocol().tile)
  protocolAdded = true
}

const LEVEL_M = 3.2

/** Overture buildings within 60 m of `ring` (excluding `id`), as neighbour shade blocks. */
function neighboursFrom(m, ring, id) {
  if (!m.getSource('ov')) return []
  const [cx, cy] = centroid(ring)
  const kx = mPerDegLon(cy)
  const seen = new Set([id])
  const out = []
  for (const f of m.querySourceFeatures('ov', { sourceLayer: OVERTURE_LAYER })) {
    const fid = f.properties.id ?? f.id
    if (seen.has(fid)) continue
    const r = outerRing(f.geometry)
    if (!r) continue
    const [x, y] = centroid(r)
    if (Math.hypot((x - cx) * kx, (y - cy) * 110540) > 60) continue
    seen.add(fid)
    const h = Number(f.properties.height) || (Number(f.properties.num_floors) || 2) * LEVEL_M
    out.push({ ring: r, height: h })
  }
  return out
}

// Satellite base from Esri World Imagery (free tiles; check Esri terms before commercial launch),
// labels on top so streets and localities are readable.
const STYLE = {
  version: 8,
  sources: {
    sat: {
      type: 'raster', tileSize: 256, maxzoom: 19,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
    labels: {
      type: 'raster', tileSize: 256, maxzoom: 19,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
    },
  },
  layers: [
    { id: 'sat', type: 'raster', source: 'sat' },
    { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } },
  ],
}

const fc = (features) => ({ type: 'FeatureCollection', features })
const poly = (ring, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } })

/** Footprints of the recommended modules, as map polygons. */
function moduleFeatures(panels, keys, origin, module) {
  if (!origin || !panels?.length) return []
  return panels
    .filter((p) => !keys || keys.has(p.key))
    .map((p) => {
      const [x, , z] = p.pos
      const hu = module.du / 2
      const hv = (module.dv / 2) * Math.abs(p.N[1]) // horizontal depth of a tilted module
      const c = [[x - hu, z - hv], [x + hu, z - hv], [x + hu, z + hv], [x - hu, z + hv]]
      return poly(c.map((q) => toLngLat(q, origin)))
    })
}

/** Fill in the address (and state, for the subsidy) for a point, quietly. */
function lookUp(ll) {
  reverse(ll)
    .then((p) => p && useSolar.getState().patchSurvey({
      address: [p.name, p.where].filter(Boolean).join(', '),
      ...(p.state ? { state: p.state } : {}),
    }))
    .catch(() => {})
}

export default function SurveyMap({ panels, recommended, module }) {
  const box = useRef(null)
  const map = useRef(null)
  const marks = useRef({})
  const geo = useRef(null)
  const pin = useRef(null)
  const sv = useSolar((s) => s.survey)
  const terrace = useSolar((s) => s.params.terrace)
  const { patchSurvey } = useSolar.getState()

  // Create the map once.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current, style: STYLE, center: [77.209, 28.6139], zoom: 4.5, maxZoom: 20.5,
      attributionControl: { compact: true }, dragRotate: true,
    })
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    // Google-style "my location": blue dot with an accuracy circle.
    const g = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 15000 },
      trackUserLocation: false, showAccuracyCircle: true, fitBoundsOptions: { maxZoom: 19 },
    })
    m.addControl(g, 'bottom-right')
    g.on('geolocate', (pos) => {
      const ll = [pos.coords.longitude, pos.coords.latitude]
      patchSurvey({ center: ll, pin: ll, address: 'My location', ring: null, draft: [], mumty: null, tank: null, neighbours: [], locError: '' })
      lookUp(ll)
    })
    g.on('error', (err) => patchSurvey({
      locError: err.code === 1 ? 'Location permission was denied — allow it in the browser, or search the address.' : 'Could not get your location — search the address instead.',
    }))
    geo.current = g
    m.on('moveend', () => {
      const c = m.getCenter()
      patchSurvey({ view: [c.lng, c.lat] })
    })
    addPmtiles()
    m.on('load', async () => {
      const url = await buildingsUrl()
      m.addSource('ov', { type: 'vector', url: `pmtiles://${url}`, attribution: OVERTURE_ATTRIBUTION })
      m.addLayer({ id: 'ov-fill', type: 'fill', source: 'ov', 'source-layer': OVERTURE_LAYER, minzoom: 15, paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.08 } })
      m.addLayer({ id: 'ov-line', type: 'line', source: 'ov', 'source-layer': OVERTURE_LAYER, minzoom: 15, paint: { 'line-color': '#9fe0ff', 'line-width': 0.8, 'line-opacity': 0.8 } })
      for (const id of ['bld', 'sel', 'mods', 'draft']) m.addSource(id, { type: 'geojson', data: fc([]) })
      m.addLayer({ id: 'bld-fill', type: 'fill', source: 'bld', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.12 } })
      m.addLayer({ id: 'bld-line', type: 'line', source: 'bld', paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.7 } })
      m.addLayer({ id: 'sel-fill', type: 'fill', source: 'sel', paint: { 'fill-color': '#f2b33d', 'fill-opacity': 0.25 } })
      m.addLayer({ id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': '#f2b33d', 'line-width': 2.5 } })
      m.addLayer({ id: 'mods', type: 'fill', source: 'mods', paint: { 'fill-color': '#1e3a5f', 'fill-opacity': 0.9, 'fill-outline-color': '#c9d6e8' } })
      m.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#f2b33d', 'line-width': 2, 'line-dasharray': [2, 1] } })
      m.addLayer({ id: 'draft-pt', type: 'circle', source: 'draft', paint: { 'circle-radius': 4, 'circle-color': '#f2b33d', 'circle-stroke-color': '#1c1608', 'circle-stroke-width': 1 } })
      for (const layer of ['bld-fill', 'ov-fill']) {
        m.on('mouseenter', layer, () => { if (useSolar.getState().survey.tool === 'pick') m.getCanvas().style.cursor = 'pointer' })
        m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = '' })
      }
      useSolar.setState((s) => ({ survey: { ...s.survey } })) // redraw sources now that they exist
    })
    m.on('click', (e) => {
      const s = useSolar.getState().survey
      const ll = [e.lngLat.lng, e.lngLat.lat]
      if (s.tool === 'pick') {
        const layers = ['bld-fill', 'ov-fill'].filter((l) => m.getLayer(l))
        const f = m.queryRenderedFeatures(e.point, { layers })[0]
        if (!f) return
        if (f.layer.id === 'bld-fill') {
          const b = s.buildings.find((x) => x.id === f.properties.id)
          if (b) patchSurvey({ ring: b.ring, levels: b.levels, neighbours: neighboursFrom(m, b.ring, null) })
          return
        }
        const ring = outerRing(f.geometry)
        if (!ring) return
        const floors = Number(f.properties.num_floors) || (Number(f.properties.height) ? Math.round(Number(f.properties.height) / LEVEL_M) : null)
        patchSurvey({ ring, levels: floors, neighbours: neighboursFrom(m, ring, f.properties.id ?? f.id) })
      } else if (s.tool === 'draw') {
        const first = s.draft[0]
        if (first && s.draft.length >= 3) {
          const p0 = m.project(first)
          if (Math.hypot(p0.x - e.point.x, p0.y - e.point.y) < 14) {
            patchSurvey({ ring: s.draft, draft: [], tool: 'pick' })
            return
          }
        }
        patchSurvey({ draft: [...s.draft, ll] })
      } else if (s.tool === 'mumty' || s.tool === 'tank') {
        patchSurvey({ [s.tool]: ll, tool: 'pick' })
      }
    })
    // Follow the container when side panels fold or the window resizes.
    const ro = new ResizeObserver(() => m.resize())
    ro.observe(box.current)
    map.current = m
    if (import.meta.env.DEV) window.__surveyMap = m // scripted checks
    return () => {
      ro.disconnect()
      m.remove()
    }
  }, [patchSurvey])

  // Fly to a searched address.
  useEffect(() => {
    if (sv.center) map.current?.flyTo({ center: sv.center, zoom: 19, speed: 1.6 })
  }, [sv.center])

  // Keep the sources in step with the survey.
  useEffect(() => {
    const m = map.current
    if (!m?.getSource('bld')) return
    m.getSource('bld').setData(fc(sv.buildings.map((b) => poly(b.ring.slice(0, -1), { id: b.id }))))
    m.getSource('sel').setData(fc(sv.ring ? [poly(sv.ring[0][0] === sv.ring[sv.ring.length - 1][0] && sv.ring[0][1] === sv.ring[sv.ring.length - 1][1] ? sv.ring.slice(0, -1) : sv.ring)] : []))
    const draft = sv.draft
    m.getSource('draft').setData(fc([
      ...(draft.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: draft } }] : []),
      ...draft.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } })),
    ]))
    m.getCanvas().style.cursor = sv.tool === 'pick' ? '' : 'crosshair'
    if (sv.tool === 'draw') m.doubleClickZoom.disable()
    else m.doubleClickZoom.enable()
  }, [sv])

  // Recommended modules on the roof.
  useEffect(() => {
    const m = map.current
    if (!m?.getSource('mods')) return
    m.getSource('mods').setData(fc(sv.ring ? moduleFeatures(panels, recommended, terrace?.origin, module) : []))
  }, [panels, recommended, terrace, module, sv.ring, sv])

  // Stair room and water tank markers.
  useEffect(() => {
    const m = map.current
    if (!m) return
    for (const [k, label] of [['mumty', 'Stair room'], ['tank', 'Water tank']]) {
      const at = sv[k]
      if (!at) {
        marks.current[k]?.remove()
        delete marks.current[k]
        continue
      }
      if (!marks.current[k]) {
        const el = document.createElement('div')
        el.className = `map-mark is-${k}`
        el.textContent = label
        marks.current[k] = new maplibregl.Marker({ element: el, draggable: true })
          .on('dragend', (ev) => {
            const p = ev.target.getLngLat()
            useSolar.getState().patchSurvey({ [k]: [p.lng, p.lat] })
          })
      }
      marks.current[k].setLngLat(at).addTo(m)
    }
  }, [sv])

  // "Use my location" from the search box.
  useEffect(() => {
    if (sv.locate) geo.current?.trigger()
  }, [sv.locate])

  // Red pin at the searched place / my location; drag it to the exact house.
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!sv.pin) {
      pin.current?.remove()
      pin.current = null
      return
    }
    if (!pin.current) {
      pin.current = new maplibregl.Marker({ color: '#e5484d', draggable: true })
        .on('dragend', (ev) => {
          const p = ev.target.getLngLat()
          const ll = [p.lng, p.lat]
          useSolar.getState().patchSurvey({ pin: ll })
          lookUp(ll)
        })
    }
    pin.current.setLngLat(sv.pin).addTo(m)
  }, [sv.pin])

  return <div ref={box} className="survey-map" />
}
