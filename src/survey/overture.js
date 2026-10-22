// Overture Maps buildings (includes Google Open Buildings for India), streamed as PMTiles straight
// from Overture's public bucket — free, no key. The latest release is read from the STAC catalog.

const STAC = 'https://stac.overturemaps.org/catalog.json'
const TILES = (release) => `https://overturemaps-extras-us-west-2.s3.amazonaws.com/tiles/${release}/buildings.pmtiles`
const FALLBACK = '2026-10-21.0'

let pending = null

/** PMTiles URL of the newest Overture buildings release. */
export function buildingsUrl() {
  pending ??= fetch(STAC)
    .then((r) => r.json())
    .then((cat) => {
      const releases = (cat.links ?? [])
        .map((l) => l.href?.match(/(\d{4}-\d{2}-\d{2}\.\d+)\/catalog\.json$/)?.[1])
        .filter(Boolean)
        .sort()
      return TILES(releases.at(-1) ?? FALLBACK)
    })
    .catch(() => TILES(FALLBACK))
  return pending
}

export const OVERTURE_LAYER = 'building'
export const OVERTURE_ATTRIBUTION = 'Buildings © Overture Maps Foundation (ODbL / CC BY 4.0)'

/** First outer ring of a Polygon / MultiPolygon GeoJSON geometry. */
export function outerRing(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates[0]
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates[0]?.[0]
  return null
}
