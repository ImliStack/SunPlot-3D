// Reference data the planner starts from. Every number here is an editable default, not a rule.

// Module sizes from current datasheets (mm → m). Short side `w`, long side `h`. Electrical values at STC:
// open-circuit / max-power voltage and current, temperature coefficients in %/°C (Voc, Pmax).
export const PANELS = {
  res430: { label: '430 W residential', note: '108 half-cell TOPCon · 1722 × 1134 mm', w: 1.134, h: 1.722, watt: 430, kg: 21, voc: 38.9, vmp: 32.4, isc: 14.0, imp: 13.28, bVoc: -0.25, gPmax: -0.30 },
  com550: { label: '550 W commercial', note: '144 half-cell mono · 2278 × 1134 mm', w: 1.134, h: 2.278, watt: 550, kg: 28, voc: 49.9, vmp: 41.9, isc: 13.95, imp: 13.13, bVoc: -0.27, gPmax: -0.35 },
  dcr545: { label: '545 W DCR mono PERC', note: 'Made-in-India cells (ALMM List-II) · 2279 × 1134 mm · subsidy-eligible', w: 1.134, h: 2.279, watt: 545, kg: 27.5, dcr: true, voc: 49.6, vmp: 41.8, isc: 13.9, imp: 13.04, bVoc: -0.27, gPmax: -0.35 },
  dcr580: { label: '580 W DCR TOPCon', note: 'Made-in-India cells (ALMM List-II) · 2278 × 1134 mm · subsidy-eligible', w: 1.134, h: 2.278, watt: 580, kg: 28, dcr: true, voc: 51.9, vmp: 43.4, isc: 14.2, imp: 13.37, bVoc: -0.25, gPmax: -0.30 },
  utl620: { label: '620 W utility bifacial', note: '132 half-cell TOPCon · 2382 × 1134 mm', w: 1.134, h: 2.382, watt: 620, kg: 33, voc: 47.9, vmp: 40.1, isc: 16.4, imp: 15.47, bVoc: -0.25, gPmax: -0.29 },
}

// Roof-integrated solar tile (BIPV): replaces the roofing on pitched roofs, laid long side along the
// eave and edge to edge. Generic glass-on-glass tile; real products range ~60–110 W.
export const TILE = { label: '72 W solar roof tile', note: 'Roof-integrated glass tile · 1140 × 420 mm · replaces roofing', w: 0.42, h: 1.14, watt: 72, kg: 6.5, voc: 9.9, vmp: 8.2, isc: 9.6, imp: 8.78, bVoc: -0.27, gPmax: -0.36, tile: true }

const TILE_SITES = ['gable', 'hip', 'lshape', 'shed']
/** Solar tiles are on for this design (pitched houses only). */
export const usesTiles = (p) => !!p.tiles && TILE_SITES.includes(p.site)
/** The module actually laid: the chosen one, or the solar tile. */
export const panelOf = (p) => (usesTiles(p) ? TILE : PANELS[p.panel])
/** Tiles always run long side along the eave. */
export const portraitOf = (p) => (usesTiles(p) ? false : p.portrait)

export const SITES = {
  terrace: { group: 'Homes', label: 'Terrace (site survey)', short: 'Terrace', hint: 'Flat terrace of any shape — from the site survey map or a default outline' },
  gable: { group: 'Homes', label: 'House · gable roof', short: 'Gable', hint: 'Two roof planes meeting at a ridge' },
  hip: { group: 'Homes', label: 'House · hip roof', short: 'Hip', hint: 'Four planes: two trapezoids and two triangular ends' },
  lshape: { group: 'Homes', label: 'L-shaped house', short: 'L-shape', hint: 'Main wing plus a side wing, with valleys between' },
  shed: { group: 'Homes', label: 'House · mono-pitch', short: 'Mono-pitch', hint: 'One sloped roof plane' },
  flat: { group: 'Commercial', label: 'Flat-roof building', short: 'Flat roof', hint: 'Tilted racks in rows on a flat roof' },
  airport: { group: 'Commercial', label: 'Airport terminal', short: 'Airport', hint: 'Terminal roof racks plus solar parking canopies' },
  carport: { group: 'Structures', label: 'Parking canopy', short: 'Carport', hint: 'Solar carports over parking bays (malls, offices, airports)' },
  busstop: { group: 'Structures', label: 'Bus shelter', short: 'Bus stop', hint: 'Solar roof on bus shelters and transit stations' },
  ground: { group: 'Land', label: 'Open ground', short: 'Ground', hint: 'Ground-mounted tables in rows (utility / campus)' },
}

// Parking geometry (IRC / typical municipal codes): 2.5 m × 5 m bays, 6–7 m two-way aisles.
export const BAY = { w: 2.5, d: 5, aisle: 7 }

// Climate factor scales clear-sky irradiance down to a typical year (clouds, haze, monsoon).
export const CLIMATES = {
  arid: { label: 'Arid / desert', k: 0.86 },
  sunny: { label: 'Sunny', k: 0.76 },
  monsoon: { label: 'Monsoon / humid', k: 0.66 },
  temperate: { label: 'Temperate', k: 0.6 },
  cloudy: { label: 'Cloudy', k: 0.5 },
}

// Quick locations. Prices are rough installed costs and retail tariffs, there to be edited.
export const PLACES = [
  { key: 'delhi', label: 'New Delhi', lat: 28.6, lon: 77.2, climate: 'sunny', cur: '₹', cost: 50, tariff: 8, co2: 0.71 },
  { key: 'jaipur', label: 'Jaipur', lat: 26.9, lon: 75.8, climate: 'arid', cur: '₹', cost: 48, tariff: 7.5, co2: 0.71 },
  { key: 'mumbai', label: 'Mumbai', lat: 19.1, lon: 72.88, climate: 'monsoon', cur: '₹', cost: 52, tariff: 10, co2: 0.71 },
  { key: 'bengaluru', label: 'Bengaluru', lat: 13.0, lon: 77.59, climate: 'monsoon', cur: '₹', cost: 50, tariff: 8.5, co2: 0.71 },
  { key: 'dubai', label: 'Dubai', lat: 25.2, lon: 55.27, climate: 'arid', cur: 'AED ', cost: 3.2, tariff: 0.38, co2: 0.42 },
  { key: 'phoenix', label: 'Phoenix', lat: 33.4, lon: -112.07, climate: 'arid', cur: '$', cost: 2.8, tariff: 0.15, co2: 0.37 },
  { key: 'berlin', label: 'Berlin', lat: 52.5, lon: 13.4, climate: 'temperate', cur: '€', cost: 1.5, tariff: 0.36, co2: 0.38 },
  { key: 'london', label: 'London', lat: 51.5, lon: -0.13, climate: 'cloudy', cur: '£', cost: 1.7, tariff: 0.25, co2: 0.2 },
  { key: 'kochi', label: 'Kochi', lat: 10.15, lon: 76.4, climate: 'monsoon', cur: '₹', cost: 50, tariff: 8, co2: 0.71 },
  { key: 'chennai', label: 'Chennai', lat: 13.08, lon: 80.27, climate: 'sunny', cur: '₹', cost: 48, tariff: 8, co2: 0.71 },
  { key: 'sydney', label: 'Sydney', lat: -33.9, lon: 151.21, climate: 'sunny', cur: 'A$', cost: 1.1, tariff: 0.32, co2: 0.66 },
]

/** Rule-of-thumb best fixed tilt for annual yield (≈ 0.76·|lat| + 3.1°). */
export const bestTilt = (lat) => Math.round(Math.min(45, 0.76 * Math.abs(lat) + 3.1))

/** Facing the equator: south in the northern hemisphere, north in the southern. */
export const equatorAzimuth = (lat) => (lat >= 0 ? 180 : 0)

export const DEFAULTS = {
  site: 'gable',
  // Building / plot
  length: 12, // m, along the ridge
  width: 9, // m
  floors: 2,
  pitch: 26, // ° roof slope
  azimuth: 180, // ° compass direction the main roof plane (or array) faces
  wingLength: 6, // m, L-shape wing beyond the main wing
  wingWidth: 6, // m
  // Roof obstacles
  chimney: true,
  chimneyX: -0.35, // position along the ridge, −1…1 of the half-length
  vents: 2, // plumbing vents on houses, HVAC units on flat roofs
  // Canopies (carport, bus shelter, airport parking)
  bays: 12, // parking bays per canopy, per side
  canopyRows: 2,
  doubleRow: true, // Y-frame over two facing bay rows
  canopyClear: 3, // m to the low edge
  canopyTilt: 5, // °
  shelters: 2,
  // Panels
  panel: 'res430',
  portrait: true,
  stack: 2, // panels per table, up the slope (racked arrays)
  rackTilt: 15, // ° tilt on flat roof racks
  groundTilt: bestTilt(28.6),
  clearance: 0.8, // m above ground at the low edge
  edge: 0.45, // m setback from roof edges
  ridge: 0.45, // m setback from the ridge / high edge
  target: 0, // kWp cap, 0 = fill the space
  cleanDays: 30, // module washing interval, 0 = rain only
  bothFaces: false, // pitched roofs: also use planes facing away from the sun
  // Place
  place: 'delhi',
  placeName: 'New Delhi',
  lat: 28.6,
  lon: 77.2,
  climate: 'sunny',
  cur: '₹',
  cost: 50, // per Wp installed
  tariff: 8, // per kWh
  co2: 0.71, // kg CO₂ per kWh of grid power avoided
  // View
  day: 172, // day of year for the sun
  hour: 10.5, // solar time
  surroundings: true,
  weather: 'auto', // auto (this month from data) | clear | rain | snow
  closeTrees: false, // mature trees right next to the site (shade study)
  elevated: true, // terrace: raised structure so the terrace stays usable
  terrace: null, // terrace: { outline, mumty, tank, neighbours, front, address } in site metres
  eastWest: false, // flat roofs: back-to-back east-west racks instead of rows facing the equator
  tiles: false, // pitched roofs: roof-integrated solar tiles instead of rail-mounted modules
  // Electrical
  inverter: 'auto', // inverter model key, or auto
  invCount: 0, // inverters, 0 = auto
  dcRun: 0, // m from array to inverter, 0 = estimate
  acRun: 0, // m from inverter to the meter / LT panel, 0 = estimate
  // Money
  subsidy: 0, // incentive deducted from the cost
  escalation: 3, // % a year the grid tariff rises
  discount: 8, // % a year, for NPV and LCOE
  omPct: 0.8, // % of the cost a year for cleaning, O&M and insurance
  useKwh: 0, // kWh a month the site uses, 0 = all solar valued at the tariff
  exportRate: 0, // paid per kWh exported beyond own use, 0 = 40 % of the tariff
  loanShare: 0, // % of the net cost financed
  loanRate: 9.5, // % a year
  loanYears: 7,
  // Battery (backup)
  battLoad: 0, // kW of essential load to back up, 0 = no battery
  battHours: 4, // hours of backup
  battPrice: 0, // per kWh installed, 0 = estimate from the module price
}

const HOUSES = ['gable', 'hip', 'lshape', 'shed']

// Inputs that only exist for some site types.
export const SHOWS = {
  floors: [...HOUSES, 'flat', 'airport', 'terrace'],
  elevated: ['terrace'],
  pitch: HOUSES,
  bothFaces: ['gable', 'hip', 'lshape'],
  ridge: HOUSES,
  edge: [...HOUSES, 'flat', 'ground', 'airport', 'terrace'],
  rackTilt: ['flat', 'airport', 'terrace'],
  eastWest: ['flat', 'airport', 'terrace'],
  tiles: HOUSES,
  groundTilt: ['ground'],
  clearance: ['ground'],
  stack: ['flat', 'ground', 'airport', 'terrace'],
  chimney: HOUSES,
  chimneyX: HOUSES,
  vents: [...HOUSES, 'flat', 'airport'],
  wingLength: ['lshape'],
  wingWidth: ['lshape'],
  bays: ['carport', 'airport'],
  canopyRows: ['carport', 'airport'],
  doubleRow: ['carport', 'airport'],
  canopyClear: ['carport', 'busstop', 'airport'],
  canopyTilt: ['carport', 'busstop', 'airport'],
  shelters: ['busstop'],
  length: [...HOUSES, 'flat', 'ground', 'busstop', 'airport'],
  width: [...HOUSES, 'flat', 'ground', 'busstop', 'airport'],
}
