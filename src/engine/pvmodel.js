// Module optics, temperature and power — each mirrors the pvlib 0.11 function in its comment.

const D2R = Math.PI / 180

/**
 * Incidence-angle modifier, physical model (Fresnel reflection + glass absorption; De Soto 2006,
 * PVWatts v5 defaults n = 1.526, K = 4 m⁻¹, L = 2 mm) — pvlib.iam.physical without AR coating.
 */
export function iamPhysical(aoiDeg, n = 1.526, K = 4, L = 0.002) {
  let cos1 = Math.max(0, Math.cos(aoiDeg * D2R))
  const sin1 = Math.sqrt(1 - cos1 ** 2)
  const sin2 = sin1 / n
  const cos2 = Math.sqrt(1 - sin2 ** 2)
  const rs = ((cos1 - n * cos2) / (cos1 + n * cos2)) ** 2
  const rp = ((cos2 - n * cos1) / (cos2 + n * cos1)) ** 2
  const r0 = ((1 - n) / (1 + n)) ** 2
  const abs = Math.exp((-K * L) / cos2)
  const ts = (1 - rs) * abs
  const tp = (1 - rp) * abs
  const t0 = (1 - r0) * Math.exp(-K * L)
  const v = (ts + tp) / 2 / t0
  return Number.isFinite(v) ? Math.max(0, v) : 0
}

/** SAPM thermal parameters (King et al. 2004) — pvlib.temperature.TEMPERATURE_MODEL_PARAMETERS['sapm']. */
export const SAPM_MOUNTS = {
  open_rack_glass_polymer: { a: -3.56, b: -0.075, deltaT: 3, label: 'Open rack, glass/polymer (ground, tilted racks)' },
  open_rack_glass_glass: { a: -3.47, b: -0.0594, deltaT: 3, label: 'Open rack, glass/glass' },
  close_mount_glass_glass: { a: -2.98, b: -0.0471, deltaT: 1, label: 'Close roof mount, glass/glass' },
  insulated_back_glass_polymer: { a: -2.81, b: -0.0455, deltaT: 0, label: 'Insulated back (building-integrated)' },
}

/**
 * SAPM back-of-module and cell temperature, °C — pvlib.temperature.sapm_module / sapm_cell.
 * `poaGlobal` W/m² (before optical losses), wind m/s at 10 m.
 */
export function sapmTemperature(poaGlobal, tAir, wind, mount) {
  const { a, b, deltaT } = SAPM_MOUNTS[mount] ?? SAPM_MOUNTS.open_rack_glass_polymer
  const module = poaGlobal * Math.exp(a + b * wind) + tAir
  return { module, cell: module + (poaGlobal / 1000) * deltaT }
}

/** PVWatts DC power, W — pvlib.pvsystem.pvwatts_dc. `gamma` per °C (e.g. −0.0035). */
export const pvwattsDc = (gEff, tCell, pdc0, gamma, tRef = 25) => gEff * 0.001 * pdc0 * (1 + gamma * (tCell - tRef))

/**
 * PVWatts inverter (Dobos 2014), W — pvlib.inverter.pvwatts. `pdc0` is the inverter's DC input
 * limit, so the AC limit is `etaNom · pdc0`. Returns the AC power and whether it was clipped.
 */
export function pvwattsInverter(pdc, pdc0, etaNom = 0.96, etaRef = 0.9637) {
  if (!(pdc > 0)) return { ac: 0, clipped: 0, unclipped: 0 }
  const pac0 = etaNom * pdc0
  const zeta = pdc / pdc0
  const eta = (etaNom / etaRef) * (-0.0162 * zeta - 0.0059 / zeta + 0.9858)
  const unclipped = Math.max(0, eta * pdc)
  const ac = Math.min(pac0, unclipped)
  return { ac, clipped: unclipped - ac, unclipped }
}

/**
 * PVWatts system losses (%), combined multiplicatively — pvlib.pvsystem.pvwatts_losses.
 * SunPlot computes shading, soiling and snow physically, so those default to 0 here.
 */
export const DEFAULT_LOSSES = { mismatch: 2, wiring: 2, connections: 0.5, lid: 1.5, nameplate: 1, age: 0, availability: 3 }

export function combinedLoss(losses) {
  let perf = 1
  for (const v of Object.values(losses)) perf *= 1 - (Number(v) || 0) / 100
  return 1 - perf // fraction
}
