// Famous / large buildings to survey — schools, hospitals, banks, supermarkets (DMart, Big Bazaar…),
// malls, petrol pumps, colleges, hotels — from Overture Maps places (free PMTiles, same bucket as the
// buildings). Each place carries `taxonomy` = {"primary": …, "hierarchy": […]} as a JSON string, so
// categories are matched as substrings in MapLibre filter expressions.

export const PLACES_LAYER = 'place'
export const placesUrl = (buildingsUrl) => buildingsUrl.replace('/buildings.pmtiles', '/places.pmtiles')

const has = (text) => ['in', text, ['get', 'taxonomy']]
const named = (text) => ['in', text, ['downcase', ['coalesce', ['get', '@name'], '']]]

/**
 * Category → label, map colour, icon, the MapLibre filter that picks its places and a typical
 * monthly use in kWh (indicative mid-size Indian site; the user can enter the real bill).
 */
export const POI_CATS = [
  { key: 'school', units: 2500, label: 'Schools', color: '#f2b33d', icon: 'home', style: 'school',
    filter: ['all', has('"school"'), ['!', has('vocational')], ['!', has('driving')], ['!', has('specialty')]] },
  { key: 'college', units: 12000, label: 'Colleges', color: '#e8a33a', icon: 'home', style: 'school', filter: has('college_university') },
  { key: 'hospital', units: 15000, label: 'Hospitals', color: '#e5484d', icon: 'info', style: 'hospital', filter: has('"primary":"hospital"') },
  { key: 'bank', units: 1500, label: 'Banks', color: '#3e7bd6', icon: 'coin', style: 'office',
    filter: ['any', has('"primary":"bank_or_credit_union"'), has('"primary":"bank"')] },
  { key: 'supermarket', units: 25000, label: 'Supermarkets', color: '#3f9a5c', icon: 'flat', style: 'retail',
    filter: ['any', has('supermarket'), has('hypermarket'), has('department_store'),
      named('dmart'), named('d-mart'), named('big bazaar'), named('reliance smart'), named('reliance fresh'), named('spencer'), named('vishal mega')] },
  { key: 'mall', units: 120000, label: 'Malls', color: '#8a5cc7', icon: 'airport', style: 'retail',
    filter: ['any', has('shopping_mall'), has('shopping_center')] },
  { key: 'fuel', units: 2500, label: 'Petrol pumps', color: '#1c1f24', icon: 'carport', style: 'fuel',
    filter: ['any', has('gas_station'), has('fuel_station'), named('petrol pump')] },
  { key: 'hotel', units: 10000, label: 'Hotels', color: '#c2410c', icon: 'home', style: 'office', filter: has('"primary":"hotel"') },
]

export const CAT_BY_KEY = Object.fromEntries(POI_CATS.map((c) => [c.key, c]))

/** Combined filter for the enabled categories (none enabled → match nothing). */
export function poiFilter(keys) {
  const parts = POI_CATS.filter((c) => keys.includes(c.key)).map((c) => c.filter)
  return parts.length ? ['any', ...parts] : ['==', ['get', 'id'], '__none__']
}

/** Category key of a place feature's properties (first match wins). */
export function categoryOf(props) {
  const tx = String(props.taxonomy ?? '')
  const name = String(props['@name'] ?? '').toLowerCase()
  const t = (s) => tx.includes(s)
  if (t('gas_station') || t('fuel_station') || name.includes('petrol pump')) return 'fuel'
  if (t('shopping_mall') || t('shopping_center')) return 'mall'
  if (t('supermarket') || t('hypermarket') || t('department_store') || /d-?mart|big bazaar|reliance (smart|fresh)|spencer|vishal mega/.test(name)) return 'supermarket'
  if (t('"primary":"hospital"')) return 'hospital'
  if (t('college_university')) return 'college'
  if (t('"school"')) return 'school'
  if (t('bank_or_credit_union') || t('"primary":"bank"')) return 'bank'
  if (t('"primary":"hotel"')) return 'hotel'
  return null
}

/** Brand name when Overture has one (e.g. "Hindustan Petroleum"). */
export function brandOf(props) {
  try {
    return JSON.parse(props.brand ?? '{}')?.names?.primary ?? ''
  } catch {
    return ''
  }
}
