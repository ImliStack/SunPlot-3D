// Irradiance on a tilted plane. Each function mirrors the pvlib 0.11 function named in its comment,
// so results can be checked one-to-one (tests/irradiance.test.js). Irradiance is in W/m²
// (instantaneous); irradiation (energy, kWh/m²) only appears after summing hours.

const D2R = Math.PI / 180
const cosd = (x) => Math.cos(x * D2R)
const sind = (x) => Math.sin(x * D2R)

/** Extraterrestrial normal irradiance, Spencer (1971) — pvlib.irradiance.get_extra_radiation. */
export function extraRadiation(dayOfYear, solarConstant = 1366.1) {
  const B = (2 * Math.PI / 365) * (dayOfYear - 1)
  return solarConstant * (1.00011 + 0.034221 * Math.cos(B) + 0.00128 * Math.sin(B) + 0.000719 * Math.cos(2 * B) + 0.000077 * Math.sin(2 * B))
}

/** Relative optical air mass, Kasten & Young (1989); NaN below the horizon — pvlib.atmosphere.get_relative_airmass. */
export function airmassRelative(zenith) {
  if (zenith > 90) return NaN
  return 1 / (cosd(zenith) + 0.50572 * (6.07995 + (90 - zenith)) ** -1.6364)
}

/** Station pressure (Pa) from elevation — pvlib.atmosphere.alt2pres. */
export const alt2pres = (m) => 100 * ((44331.514 - m) / 11880.516) ** (1 / 0.1902632)

/** Cosine of the angle of incidence on a plane — pvlib.irradiance.aoi_projection. */
export function aoiProjection(tilt, azimuth, zenith, sunAzimuth) {
  const p = cosd(tilt) * cosd(zenith) + sind(tilt) * sind(zenith) * cosd(sunAzimuth - azimuth)
  return Math.max(-1, Math.min(1, p))
}

/** Angle of incidence in degrees — pvlib.irradiance.aoi. */
export const aoi = (tilt, azimuth, zenith, sunAzimuth) => Math.acos(aoiProjection(tilt, azimuth, zenith, sunAzimuth)) / D2R

// Perez et al. (1990) "allsitescomposite1990" coefficients, from pvlib.irradiance._get_perez_coefficients.
const F1C = [[-0.008, 0.588, -0.062], [0.13, 0.683, -0.151], [0.33, 0.487, -0.221], [0.568, 0.187, -0.295], [0.873, -0.392, -0.362], [1.132, -1.237, -0.412], [1.06, -1.6, -0.359], [0.678, -0.327, -0.25]]
const F2C = [[-0.06, 0.072, -0.022], [-0.019, 0.066, -0.029], [0.055, -0.064, -0.026], [0.109, -0.152, -0.014], [0.226, -0.462, 0.001], [0.288, -0.823, 0.056], [0.264, -1.127, 0.131], [0.156, -1.377, 0.251]]
const EPS_BINS = [1.065, 1.23, 1.5, 1.95, 2.8, 4.5, 6.2]

/**
 * Perez anisotropic sky diffuse on a tilted plane, W/m² — pvlib.irradiance.perez.
 * Returns the sky diffuse total and its parts (isotropic, circumsolar, horizon).
 */
export function perez(tilt, azimuth, dhi, dni, dniExtra, zenith, sunAzimuth, airmass) {
  if (!(dhi > 0) || Number.isNaN(airmass)) return { sky: 0, isotropic: 0, circumsolar: 0, horizon: 0 }
  const kappa = 1.041
  const z = zenith * D2R
  const delta = (dhi * airmass) / dniExtra
  const eps = ((dhi + dni) / dhi + kappa * z ** 3) / (1 + kappa * z ** 3)
  if (!(eps >= 1)) return { sky: 0, isotropic: 0, circumsolar: 0, horizon: 0 }
  let bin = 0
  while (bin < EPS_BINS.length && eps >= EPS_BINS[bin]) bin++
  const f1 = Math.max(0, F1C[bin][0] + F1C[bin][1] * delta + F1C[bin][2] * z)
  const f2 = F2C[bin][0] + F2C[bin][1] * delta + F2C[bin][2] * z
  const A = Math.max(0, aoiProjection(tilt, azimuth, zenith, sunAzimuth))
  const B = Math.max(cosd(zenith), cosd(85))
  const t1 = 0.5 * (1 - f1) * (1 + cosd(tilt))
  const t2 = (f1 * A) / B
  const t3 = f2 * sind(tilt)
  const sky = Math.max(dhi * (t1 + t2 + t3), 0)
  if (sky === 0) return { sky: 0, isotropic: 0, circumsolar: 0, horizon: 0 }
  return { sky, isotropic: dhi * t1, circumsolar: dhi * t2, horizon: dhi * t3 }
}

/** Hay & Davies (1980) sky diffuse — pvlib.irradiance.haydavies. */
export function hayDavies(tilt, azimuth, dhi, dni, dniExtra, zenith, sunAzimuth) {
  const cosZ = cosd(zenith)
  const A = Math.max(aoiProjection(tilt, azimuth, zenith, sunAzimuth), 0)
  const Rb = A / Math.max(cosZ, 0.01745)
  const Ai = dni / dniExtra
  return Math.max(dhi * (Ai * Rb + (1 - Ai) * 0.5 * (1 + cosd(tilt))), 0)
}

/** Isotropic sky diffuse (Liu & Jordan) — pvlib.irradiance.isotropic. */
export const isotropic = (tilt, dhi) => dhi * (1 + cosd(tilt)) * 0.5

/** Ground-reflected irradiance — pvlib.irradiance.get_ground_diffuse. */
export const groundDiffuse = (tilt, ghi, albedo) => ghi * albedo * (1 - cosd(tilt)) * 0.5

/**
 * Plane-of-array irradiance components, W/m² — pvlib.irradiance.get_total_irradiance
 * (model 'perez' | 'haydavies' | 'isotropic').
 */
export function poa({ tilt, azimuth, zenith, sunAzimuth, dni, ghi, dhi, dniExtra, airmass, albedo, model = 'perez' }) {
  const direct = Math.max(dni * aoiProjection(tilt, azimuth, zenith, sunAzimuth), 0)
  let sky
  if (model === 'perez') sky = perez(tilt, azimuth, dhi, dni, dniExtra, zenith, sunAzimuth, airmass).sky
  else if (model === 'haydavies') sky = hayDavies(tilt, azimuth, dhi, dni, dniExtra, zenith, sunAzimuth)
  else sky = isotropic(tilt, dhi)
  const ground = groundDiffuse(tilt, ghi, albedo)
  return { global: direct + sky + ground, direct, sky, ground, diffuse: sky + ground }
}
