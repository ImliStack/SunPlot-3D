import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useSolar } from '../store.js'
import { Protocol } from 'pmtiles'
import { toLngLat, centroid, mPerDegLon, openRing } from './geo.js'
import { buildingsUrl, OVERTURE_LAYER, OVERTURE_ATTRIBUTION, outerRing } from './overture.js'
import { reverse } from './places.js'
import { POI_CATS, PLACES_LAYER, placesUrl, poiFilter, categoryOf, brandOf } from './poi.js'

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
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', // free label fonts
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
function moduleFeatures(panels, keys, origin, module, roofH = 6) {
  if (!origin || !panels?.length) return []
  return panels
    .filter((p) => !keys || keys.has(p.key))
    .map((p) => {
      const [x, , z] = p.pos
      const hu = module.du / 2
      const hv = (module.dv / 2) * Math.abs(p.N[1]) // horizontal depth of a tilted module
      const c = [[x - hu, z - hv], [x + hu, z - hv], [x + hu, z + hv], [x - hu, z + hv]]
      // In 3D the module sits on its rack: base just above the roof, top at the module's height.
      return poly(c.map((q) => toLngLat(q, origin)), { base: Math.max(roofH, p.pos[1] - 0.05), top: p.pos[1] + 0.12 })
    })
}

/** Building height in metres from Overture tags (MapLibre expression), 6 m when unknown. */
const HEIGHT = ['case',
  ['has', 'height'], ['to-number', ['get', 'height']],
  ['has', 'num_floors'], ['*', ['to-number', ['get', 'num_floors']], LEVEL_M],
  6]

/** Colour per place category, as one MapLibre `case` expression. */
const POI_COLOR = ['case', ...POI_CATS.flatMap((c) => [c.filter, c.color]), '#8a8f98']

/** Places of the enabled categories currently loaded around the map centre, nearest first. */
function nearbyPlaces(m, keys) {
  if (!keys.length || !m.getSource('places')) return []
  const c = m.getCenter()
  const kx = mPerDegLon(c.lat)
  const seen = new Set()
  const out = []
  for (const f of m.querySourceFeatures('places', { sourceLayer: PLACES_LAYER })) { // category test below
    const id = f.properties.id ?? f.id
    if (seen.has(id) || f.geometry.type !== 'Point') continue
    seen.add(id)
    const [lon, lat] = f.geometry.coordinates
    const cat = categoryOf(f.properties)
    if (!cat || !keys.includes(cat)) continue
    out.push({ id, name: f.properties['@name'] || 'Unnamed', cat, brand: brandOf(f.properties), lon, lat,
      dist: Math.hypot((lon - c.lng) * kx, (lat - c.lat) * 110540) })
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, 40)
}

/** The Overture building under (or nearest to, within 40 m) a point. */
function buildingAt(m, ll) {
  const pt = m.project(ll)
  const hit = m.queryRenderedFeatures(pt, { layers: ['ov-fill', 'ov-3d'].filter((l) => m.getLayer(l)) })[0]
  if (hit) return hit
  const kx = mPerDegLon(ll[1])
  let best = null
  for (const f of m.querySourceFeatures('ov', { sourceLayer: OVERTURE_LAYER })) {
    const r = outerRing(f.geometry)
    if (!r) continue
    const [x, y] = centroid(r)
    const d = Math.hypot((x - ll[0]) * kx, (y - ll[1]) * 110540)
    if (d < 40 && (!best || d < best.d)) best = { f, d }
  }
  return best?.f ?? null
}

/** Select a building feature as the roof to survey. */
function chooseBuilding(m, f, extra = {}) {
  const ring = outerRing(f.geometry)
  if (!ring) return false
  const floors = Number(f.properties.num_floors) || (Number(f.properties.height) ? Math.round(Number(f.properties.height) / LEVEL_M) : null)
  const id = String(f.properties.id ?? f.id ?? ring[0].join(','))
  useSolar.getState().patchSurvey({ ring, levels: floors, neighbours: neighboursFrom(m, ring, f.properties.id ?? f.id), ...extra })
  toggleCampus({ id, ring, levels: floors })
  return true
}

/** Campus mode: every picked building joins (or, picked again, leaves) the campus list. */
function toggleCampus(b) {
  const s = useSolar.getState().survey
  if (!s.campusMode) return
  const list = s.campus ?? []
  const same = (x) => x.id === b.id || (x.ring.length === b.ring.length && x.ring[0][0] === b.ring[0][0] && x.ring[0][1] === b.ring[0][1])
  const next = list.some(same) ? list.filter((x) => !same(x)) : [...list, { ...b, name: `Block ${String.fromCharCode(65 + (list.length % 26))}` }]
  useSolar.getState().patchSurvey({ campus: next })
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

/** A small "3D / 2D" button in the map's corner. */
class ViewToggle {
  onAdd() {
    this.el = document.createElement('div')
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-group view-toggle'
    this.btn = document.createElement('button')
    this.btn.type = 'button'
    this.btn.onclick = () => {
      const s = useSolar.getState()
      s.patchSurvey({ map3d: !s.survey.map3d })
    }
    this.el.appendChild(this.btn)
    this.update(useSolar.getState().survey.map3d)
    return this.el
  }
  update(on) {
    if (!this.btn) return
    this.btn.textContent = on ? '2D' : '3D'
    this.btn.title = on ? 'Flat satellite view' : '3D buildings'
  }
  onRemove() { this.el.remove() }
}

export default function SurveyMap({ panels, recommended, module }) {
  const box = useRef(null)
  const map = useRef(null)
  const marks = useRef({})
  const geo = useRef(null)
  const pin = useRef(null)
  const toggle = useRef(null)
  const pendingPoi = useRef(null) // { poi, until }
  const refreshPlaces = useRef(() => {})
  const sv = useSolar((s) => s.survey)
  const terrace = useSolar((s) => s.params.terrace)
  const floors = useSolar((s) => s.params.floors)
  const { patchSurvey } = useSolar.getState()

  // Create the map once.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current, style: STYLE, center: [77.209, 28.6139], zoom: 4.5, maxZoom: 20.5,
      attributionControl: { compact: true }, dragRotate: true,
    })
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    toggle.current = new ViewToggle()
    m.addControl(toggle.current, 'bottom-right')
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
    // Refresh the nearby-places list and finish a pending "go to this place" as tiles arrive. Not on
    // 'idle': one slow imagery tile keeps the map from ever going idle.
    let timer = 0
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!map.current || m.isMoving()) return
        const s = useSolar.getState().survey
        const list = nearbyPlaces(m, s.poiCats)
        if (list.map((x) => x.id).join() !== (s.poiList ?? []).map((x) => x.id).join()) patchSurvey({ poiList: list })
        const want = pendingPoi.current
        if (!want) return
        const f = buildingAt(m, [want.poi.lon, want.poi.lat])
        if (f && chooseBuilding(m, f)) pendingPoi.current = null
        else if (Date.now() > want.until) {
          pendingPoi.current = null
          patchSurvey({ locError: `No mapped building at ${want.poi.name} — draw its roof outline.`, tool: 'draw', draft: [] })
        }
      }, 250)
    }
    refreshPlaces.current = refresh
    m.on('moveend', refresh)
    m.on('sourcedata', (e) => (e.sourceId === 'places' || e.sourceId === 'ov') && refresh())
    addPmtiles()
    m.on('load', async () => {
      const url = await buildingsUrl()
      m.addSource('ov', { type: 'vector', url: `pmtiles://${url}`, attribution: OVERTURE_ATTRIBUTION })
      m.addLayer({ id: 'ov-fill', type: 'fill', source: 'ov', 'source-layer': OVERTURE_LAYER, minzoom: 15, paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.08 } })
      m.addLayer({ id: 'ov-line', type: 'line', source: 'ov', 'source-layer': OVERTURE_LAYER, minzoom: 15, paint: { 'line-color': '#9fe0ff', 'line-width': 0.8, 'line-opacity': 0.8 } })
      // 3D: every building extruded to its mapped height (6 m when unknown).
      m.addLayer({ id: 'ov-3d', type: 'fill-extrusion', source: 'ov', 'source-layer': OVERTURE_LAYER, minzoom: 15,
        layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': '#e9e4da', 'fill-extrusion-height': HEIGHT, 'fill-extrusion-opacity': 0.88, 'fill-extrusion-vertical-gradient': true } })
      // Famous buildings by category: dots + names.
      m.addSource('places', { type: 'vector', url: `pmtiles://${placesUrl(url)}`, attribution: 'Places © Overture Maps Foundation' })
      const cats = useSolar.getState().survey.poiCats
      m.addLayer({ id: 'poi-dot', type: 'circle', source: 'places', 'source-layer': PLACES_LAYER, minzoom: 13, filter: poiFilter(cats),
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 18, 8], 'circle-color': POI_COLOR, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
      m.addLayer({ id: 'poi-label', type: 'symbol', source: 'places', 'source-layer': PLACES_LAYER, minzoom: 15, filter: poiFilter(cats),
        layout: { 'text-field': ['get', '@name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-max-width': 10, 'text-optional': true },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(17,20,26,.85)', 'text-halo-width': 1.6 } })
      m.on('mouseenter', 'poi-dot', () => { m.getCanvas().style.cursor = 'pointer' })
      m.on('mouseleave', 'poi-dot', () => { m.getCanvas().style.cursor = '' })
      for (const id of ['bld', 'sel', 'mods', 'draft', 'campus']) m.addSource(id, { type: 'geojson', data: fc([]) })
      m.addLayer({ id: 'campus-fill', type: 'fill', source: 'campus', paint: { 'fill-color': '#3f9a5c', 'fill-opacity': 0.28 } })
      m.addLayer({ id: 'campus-line', type: 'line', source: 'campus', paint: { 'line-color': '#7ee2a0', 'line-width': 2 } })
      m.addLayer({ id: 'campus-label', type: 'symbol', source: 'campus', layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12 },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(20,60,35,.9)', 'text-halo-width': 1.6 } })
      m.addLayer({ id: 'bld-fill', type: 'fill', source: 'bld', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.12 } })
      m.addLayer({ id: 'bld-line', type: 'line', source: 'bld', paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.7 } })
      m.addLayer({ id: 'sel-fill', type: 'fill', source: 'sel', paint: { 'fill-color': '#f2b33d', 'fill-opacity': 0.25 } })
      m.addLayer({ id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': '#f2b33d', 'line-width': 2.5 } })
      m.addLayer({ id: 'mods', type: 'fill', source: 'mods', paint: { 'fill-color': '#1e3a5f', 'fill-opacity': 0.9, 'fill-outline-color': '#c9d6e8' } })
      m.addLayer({ id: 'sel-3d', type: 'fill-extrusion', source: 'sel', layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': '#f2c45a', 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.95 } })
      m.addLayer({ id: 'mods-3d', type: 'fill-extrusion', source: 'mods', layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': '#1e3a5f', 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'top'], 'fill-extrusion-opacity': 1 } })
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
        const place = m.getLayer('poi-dot') && m.queryRenderedFeatures(e.point, { layers: ['poi-dot'] })[0]
        if (place) {
          const [lon, lat] = place.geometry.coordinates
          useSolar.getState().selectPlace({ id: place.properties.id, name: place.properties['@name'] || 'Place', cat: categoryOf(place.properties), brand: brandOf(place.properties), lon, lat })
          return
        }
        const layers = ['bld-fill', 'ov-fill', 'ov-3d'].filter((l) => m.getLayer(l))
        const f = m.queryRenderedFeatures(e.point, { layers })[0]
        if (!f) return
        if (f.layer.id === 'bld-fill') {
          const b = s.buildings.find((x) => x.id === f.properties.id)
          if (b) {
            patchSurvey({ ring: b.ring, levels: b.levels, neighbours: neighboursFrom(m, b.ring, null) })
            toggleCampus({ id: `osm${b.id}`, ring: b.ring, levels: b.levels })
          }
          return
        }
        chooseBuilding(m, f, s.campusMode ? {} : { poi: null })
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
      if (window.__surveyMap === m) delete window.__surveyMap
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
    m.getSource('campus')?.setData(fc((sv.campusMode ? sv.campus ?? [] : []).map((b) => poly(openRing(b.ring), { name: b.name }))))
    const roofH = floors * 3 + 0.3
    m.getSource('sel').setData(fc(sv.ring ? [poly(sv.ring[0][0] === sv.ring[sv.ring.length - 1][0] && sv.ring[0][1] === sv.ring[sv.ring.length - 1][1] ? sv.ring.slice(0, -1) : sv.ring, { h: roofH })] : []))
    const draft = sv.draft
    m.getSource('draft').setData(fc([
      ...(draft.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: draft } }] : []),
      ...draft.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } })),
    ]))
    m.getCanvas().style.cursor = sv.tool === 'pick' ? '' : 'crosshair'
    if (sv.tool === 'draw') m.doubleClickZoom.disable()
    else m.doubleClickZoom.enable()
  }, [sv, floors])

  // Recommended modules on the roof.
  useEffect(() => {
    const m = map.current
    if (!m?.getSource('mods')) return
    const roofH = floors * 3 + 0.3
    m.getSource('mods').setData(fc(sv.ring ? moduleFeatures(panels, recommended, terrace?.origin, module, roofH) : []))
  }, [panels, recommended, terrace, module, sv.ring, sv, floors])

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

  // Category chips → which places show.
  useEffect(() => {
    const m = map.current
    if (!m?.getLayer('poi-dot')) return
    const f = poiFilter(sv.poiCats)
    m.setFilter('poi-dot', f)
    m.setFilter('poi-label', f)
    m.triggerRepaint()
    refreshPlaces.current()
  }, [sv.poiCats])

  // A place picked from the list or the map: fly there, then pick its building when tiles settle.
  useEffect(() => {
    const m = map.current
    if (!m || !sv.poiGo) return
    pendingPoi.current = { poi: sv.poi, until: Date.now() + 12000 }
    m.flyTo({ center: [sv.poi.lon, sv.poi.lat], zoom: 18.6, speed: 1.6 })
    const t = setTimeout(() => refreshPlaces.current(), 12500) // give up and ask for an outline
    return () => clearTimeout(t)
  }, [sv.poiGo]) // eslint-disable-line react-hooks/exhaustive-deps

  // 2D ↔ 3D: extruded city, the chosen building in amber and the suggested modules on its roof.
  useEffect(() => {
    const m = map.current
    toggle.current?.update(sv.map3d)
    if (!m?.getLayer('ov-3d')) return
    const vis = sv.map3d ? 'visible' : 'none'
    for (const id of ['ov-3d', 'sel-3d', 'mods-3d']) m.setLayoutProperty(id, 'visibility', vis)
    for (const id of ['ov-fill', 'sel-fill', 'mods']) m.setLayoutProperty(id, 'visibility', sv.map3d ? 'none' : 'visible')
    m.easeTo({ pitch: sv.map3d ? 60 : 0, bearing: sv.map3d ? -25 : 0, duration: 900 })
  }, [sv.map3d])

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
