// Electrical design for the concept: inverter choice, string sizing against the site's temperature
// extremes, DC/AC cable sizing by voltage drop, protection ratings, battery backup and a bill of
// materials. Generic string-inverter classes stand in for brands (Growatt, Sungrow, Solis, Huawei,
// Fronius… all publish near-identical windows); check the chosen datasheet before ordering.

/** Generic grid-tie string inverters: AC kW, max DC volts, MPPT window, MPPT count, max input A per MPPT. */
export const INVERTERS = {
  r2: { label: '2 kW · 1-phase', ac: 2, phase: 1, vmax: 500, mpptMin: 60, mpptMax: 450, mppts: 1, imax: 16 },
  r3: { label: '3 kW · 1-phase', ac: 3, phase: 1, vmax: 600, mpptMin: 80, mpptMax: 550, mppts: 1, imax: 16 },
  r5: { label: '5 kW · 1-phase', ac: 5, phase: 1, vmax: 600, mpptMin: 80, mpptMax: 550, mppts: 2, imax: 16 },
  r6: { label: '6 kW · 1-phase', ac: 6, phase: 1, vmax: 600, mpptMin: 80, mpptMax: 550, mppts: 2, imax: 16 },
  t10: { label: '10 kW · 3-phase', ac: 10, phase: 3, vmax: 1100, mpptMin: 160, mpptMax: 1000, mppts: 2, imax: 20 },
  t15: { label: '15 kW · 3-phase', ac: 15, phase: 3, vmax: 1100, mpptMin: 160, mpptMax: 1000, mppts: 2, imax: 32 },
  t20: { label: '20 kW · 3-phase', ac: 20, phase: 3, vmax: 1100, mpptMin: 160, mpptMax: 1000, mppts: 2, imax: 32 },
  t30: { label: '30 kW · 3-phase', ac: 30, phase: 3, vmax: 1100, mpptMin: 180, mpptMax: 1000, mppts: 3, imax: 32 },
  t50: { label: '50 kW · 3-phase', ac: 50, phase: 3, vmax: 1100, mpptMin: 180, mpptMax: 1000, mppts: 5, imax: 32 },
  t110: { label: '110 kW · 3-phase', ac: 110, phase: 3, vmax: 1100, mpptMin: 200, mpptMax: 1000, mppts: 10, imax: 32 },
  t250: { label: '250 kW · 3-phase', ac: 250, phase: 3, vmax: 1500, mpptMin: 500, mpptMax: 1500, mppts: 12, imax: 30 },
}

const RHO = 0.0193 // Ω·mm²/m, copper at ~50 °C
const CELL_RISE = 30 // °C cells run above the air on a hot sunny afternoon (open rack)
const DC_SIZES = [[4, 44], [6, 57], [10, 79], [16, 107], [25, 142], [35, 176], [50, 212], [70, 270], [95, 330]] // PV cable mm², A
const AC_SIZES = [[2.5, 24], [4, 32], [6, 41], [10, 57], [16, 76], [25, 101], [35, 125], [50, 151], [70, 192], [95, 232], [120, 269], [150, 300], [185, 341], [240, 400], [300, 458]]
const BREAKERS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630, 800]
const FUSES = [10, 12, 15, 20, 25, 30, 32]
const next = (list, v) => list.find((x) => x >= v) ?? list[list.length - 1]

/** Smallest cable that carries `amps` and keeps the drop at or under `limit` (fraction). */
function cable(table, amps, dropOf, limit) {
  // Heavy feeders run as parallel cables (up to 4), each carrying its share of the current.
  for (let runs = 1; runs <= 4; runs++) {
    for (const [mm2, rating] of table) {
      if (rating * runs >= amps && dropOf(mm2 * runs) <= limit) return { mm2, runs, drop: dropOf(mm2 * runs), rating, label: `${runs > 1 ? `${runs} × ` : ''}${mm2} mm²` }
    }
  }
  const [mm2, rating] = table[table.length - 1]
  return { mm2, runs: 4, drop: dropOf(mm2 * 4), rating, over: true, label: `4 × ${mm2} mm²` }
}

/** The inverter class and count for `kwp`: fewest units at a DC:AC ratio between 0.8 and 1.3. */
export function pickInverters(kwp, key = 'auto', count = 0) {
  if (key !== 'auto' && INVERTERS[key]) {
    const inv = INVERTERS[key]
    return { key, inv, n: count || Math.max(1, Math.round(kwp / 1.15 / inv.ac)) }
  }
  const order = Object.entries(INVERTERS)
  const homes = kwp <= 7.2 ? order.filter(([, v]) => v.phase === 1) : order.filter(([, v]) => v.phase === 3)
  const fits = homes
    .map(([k, inv]) => {
      const n = Math.max(1, Math.round(kwp / 1.15 / inv.ac))
      return { key: k, inv, n, ratio: kwp / (n * inv.ac) }
    })
    .filter((c) => c.ratio >= 0.8 && c.ratio <= 1.3)
    .sort((a, b) => a.n - b.n || Math.abs(a.ratio - 1.15) - Math.abs(b.ratio - 1.15))
  const pick = fits[0] ?? { key: homes[0][0], inv: homes[0][1], n: 1 }
  return { key: pick.key, inv: pick.inv, n: count || pick.n }
}

/**
 * Full concept design. `layout` from computeLayout, `module` a PANELS entry, `temps` = { low, high }
 * air extremes in °C, `p` the planner params (runs, battery), `heightM` building height for runs.
 */
export function electricalDesign({ layout, module: m, temps, p, heightM = 6 }) {
  const count = layout.count
  if (!count) return null
  const kwp = layout.kwp
  const { key, inv, n } = pickInverters(kwp, p.inverter, p.invCount)

  // String voltages at the extremes.
  const vocCold = m.voc * (1 + (m.bVoc / 100) * (temps.low - 25))
  const vmpCold = m.vmp * (1 + (m.bVoc / 100) * (temps.low - 25))
  const vmpHot = m.vmp * (1 + (m.gPmax / 100) * (temps.high + CELL_RISE - 25))
  const maxLen = Math.max(1, Math.floor(Math.min(inv.vmax / vocCold, inv.mpptMax / vmpCold)))
  const minLen = Math.max(1, Math.ceil(inv.mpptMin / vmpHot))

  // Inverters share the modules (counts differ by at most one). Each takes the fewest strings
  // that keep every string inside the voltage window; strings are `Lmin` or `Lmax` long, and
  // strings of one length share an MPPT.
  const perInvMax = Math.ceil(count / n)
  const perInvMin = Math.floor(count / n)
  const stringsPerInv = Math.max(1, Math.ceil(perInvMax / maxLen))
  const Lmax = Math.ceil(perInvMax / stringsPerInv)
  const Lmin = Math.floor(perInvMin / stringsPerInv)
  const fits = Lmin >= minLen && Lmax <= maxLen
  const L = Lmax
  const perMppt = Math.ceil(stringsPerInv / inv.mppts)
  const used = fits ? count : 0
  const loose = count - used

  // Currents and checks.
  const iStringMax = m.isc * 1.25 // irradiance enhancement, IEC 62548
  const iMppt = perMppt * m.imp
  const orientations = new Set(layout.arrays.filter((a) => a.count).map((a) => `${Math.round(a.tilt)}|${Math.round(a.azimuth)}`)).size
  const dcac = kwp / (n * inv.ac)
  const checks = [
    { label: 'String Voc at record cold', value: `${(vocCold * L).toFixed(0)} V`, limit: `≤ ${inv.vmax} V`, ok: vocCold * L <= inv.vmax },
    { label: 'String Vmp on a hot afternoon', value: `${(vmpHot * Lmin).toFixed(0)} V`, limit: `≥ ${inv.mpptMin} V MPPT min`, ok: vmpHot * Lmin >= inv.mpptMin },
    { label: 'String Vmp in the cold', value: `${(vmpCold * L).toFixed(0)} V`, limit: `≤ ${inv.mpptMax} V MPPT max`, ok: vmpCold * L <= inv.mpptMax },
    { label: 'Current per MPPT', value: `${iMppt.toFixed(1)} A`, limit: `≤ ${inv.imax} A`, ok: iMppt <= inv.imax },
    { label: 'DC : AC ratio', value: dcac.toFixed(2), limit: '0.8 – 1.3', ok: dcac >= 0.8 && dcac <= 1.3 },
    { label: 'Orientations vs MPPT inputs', value: `${orientations}`, limit: `≤ ${inv.mppts * n}`, ok: orientations <= inv.mppts * n },
  ]
  if (loose) checks.push({ label: 'Modules left off strings', value: `${loose}`, limit: 'too few for one string: change inverter', ok: false, warn: true })
  if (Lmax !== Lmin && inv.mppts * n < 2) checks.push({ label: 'Mixed string lengths on one MPPT', value: `${Lmin} and ${Lmax}`, limit: 'needs 2+ MPPT inputs', ok: false })

  // Cable runs: roof to the inverter at ground level, then to the meter.
  const span = Math.sqrt(layout.moduleArea || 1)
  const dcRun = p.dcRun || Math.round(heightM + span / 2 + 5)
  const acRun = p.acRun || Math.round(10 + kwp / 20)
  const vString = vmpHot * Lmin
  const dc = cable(DC_SIZES, iStringMax, (a) => (2 * dcRun * m.imp * RHO) / a / vString, 0.015)
  const iAc = inv.phase === 1 ? (inv.ac * 1000) / 230 : (inv.ac * 1000) / (Math.sqrt(3) * 415 * 0.99)
  const acDrop = (a) => (inv.phase === 1 ? (2 * acRun * iAc * RHO) / a / 230 : (Math.sqrt(3) * acRun * iAc * RHO) / a / 415)
  const ac = cable(AC_SIZES, iAc * 1.25, acDrop, 0.015)
  const totalAcA = iAc * n
  const mainAc = n > 1 ? cable(AC_SIZES, totalAcA * 1.25, (a) => (inv.phase === 1 ? (2 * 10 * totalAcA * RHO) / a / 230 : (Math.sqrt(3) * 10 * totalAcA * RHO) / a / 415), 0.01) : null

  if (mainAc?.over) checks.push({ label: 'AC main feeder', value: `${Math.round(totalAcA)} A`, limit: 'beyond 4 cables: busduct, or an MV transformer', ok: false })
  if (ac.over) checks.push({ label: 'AC cable per inverter', value: `${Math.round(iAc)} A`, limit: 'beyond 4 cables: shorten the run', ok: false })
  const protection = {
    stringFuse: stringsPerInv / inv.mppts > 2 ? next(FUSES, m.isc * 1.56) : null, // only with 3+ strings in parallel
    dcIsolator: { v: Math.ceil((vocCold * L) / 100) * 100, a: next(BREAKERS, iMppt * 1.25) },
    dcSpd: `Type II, ${inv.vmax >= 1100 ? '1000–1100' : '600'} V DC`,
    acBreaker: next(BREAKERS, iAc * 1.25),
    mainBreaker: n > 1 ? next(BREAKERS, totalAcA * 1.25) : null,
    acSpd: `Type II, ${inv.phase === 1 ? '275 V, 2-pole' : '385 V, 4-pole'}`,
    earthing: 3, // pits: DC, AC and the lightning arrester (MNRE practice)
  }

  const battery = batteryDesign(p)
  // Diesel generator on site: the controller keeps the DG at least ~30 % loaded (0.8 pf), so solar
  // may only cover the load above that, and never feeds back into the DG.
  const dg = p.dgKva > 0 ? { kva: p.dgKva, minKw: 0.3 * p.dgKva * 0.8 } : null

  const strings = stringsPerInv * n
  const bom = [
    { item: `PV module, ${m.watt} W${m.dcr ? ' DCR' : ''}`, qty: count, unit: 'nos' },
    { item: `String inverter, ${inv.label}${battery ? ' (hybrid)' : ''}`, qty: n, unit: 'nos' },
    mounting(p, layout, kwp),
    { item: `DC cable, ${dc.mm2} mm² PV (red + black)`, qty: Math.ceil(strings * dcRun * 2 * 1.1), unit: 'm' },
    { item: `AC cable, ${ac.mm2} mm² Cu, ${inv.phase === 1 ? '2' : '4'}-core${ac.runs > 1 ? `, ${ac.runs} runs in parallel` : ''}`, qty: Math.ceil(acRun * n * ac.runs * 1.1), unit: 'm' },
    ...(mainAc ? [{ item: `AC main cable, ${mainAc.mm2} mm² Cu, 4-core${mainAc.runs > 1 ? `, ${mainAc.runs} runs in parallel` : ''}`, qty: 11 * mainAc.runs, unit: 'm' }] : []),
    { item: 'MC4 connector pairs', qty: strings * 2 + 4, unit: 'pairs' },
    { item: `DCDB: isolator ${protection.dcIsolator.v} V / ${protection.dcIsolator.a} A, SPD${protection.stringFuse ? `, ${protection.stringFuse} A string fuses` : ''}`, qty: n, unit: 'nos' },
    { item: `ACDB: ${protection.acBreaker} A MCB${protection.mainBreaker ? `, ${protection.mainBreaker} A main` : ''}, SPD`, qty: 1, unit: 'nos' },
    { item: 'Earthing kit (pit, electrode, strip)', qty: protection.earthing, unit: 'sets' },
    { item: 'Lightning arrester (ESE / conventional)', qty: 1, unit: 'nos' },
    { item: 'Bidirectional net meter', qty: 1, unit: 'nos' },
    { item: 'Monitoring (Wi-Fi / 4G dongle)', qty: n, unit: 'nos' },
    ...(battery ? [{ item: `LFP battery, ${battery.nominal.toFixed(1)} kWh`, qty: 1, unit: 'set' }] : []),
    ...(dg ? [{ item: `DG-PV synchronisation controller (CTs on the DG incomer, RS485 to inverters), ${dg.kva} kVA DG`, qty: 1, unit: 'set' }] : []),
    ...(p.zeroExport ? [{ item: 'Zero-export controller + CTs at the main incomer', qty: 1, unit: 'set' }] : []),
  ]

  return {
    inverter: { key, ...inv, n }, dcac, L, Lmin, lengths: Lmin === Lmax ? `${Lmax}` : `${Lmin}–${Lmax}`, minLen, maxLen, stringsPerInv, perMppt, strings, used, loose,
    vocCold, vmpHot, vmpCold, temps, checks, ok: checks.every((c) => c.ok),
    runs: { dc: dcRun, ac: acRun }, dc, ac, mainAc, iAc, protection, battery, dg, zeroExport: !!p.zeroExport, bom,
  }
}

/**
 * Mounting line of the BOM by roof type. Steel per kWp is indicative: elevated RCC structures
 * ~60–80 kg, ground MMS ~45, rail kits on pitched or sheet roofs ~12–20 (aluminium rails + hooks).
 */
function mounting(p, layout, kwp) {
  const pitched = ['gable', 'hip', 'lshape', 'shed'].includes(p.site)
  if (p.site === 'industrial') return { item: 'Short aluminium rails + mid/end clamps on sheet ribs (no roof penetration)', qty: Math.ceil(layout.count * 2), unit: 'rails' }
  if (pitched && p.tiles) return { item: 'Solar tile battens, flashings and ridge / eave trims', qty: Math.round(layout.moduleArea), unit: 'm²' }
  if (pitched && p.roofing === 'clay') return { item: 'Tile hooks + aluminium rails (Mangalore tiles lifted and replaced)', qty: Math.ceil(layout.count * 2.5), unit: 'hooks' }
  if (pitched && p.roofing === 'metal') return { item: 'Short rails clamped to sheet ribs', qty: Math.ceil(layout.count * 2), unit: 'rails' }
  if (pitched) return { item: 'Roof hooks / L-feet + aluminium rails, flashed', qty: Math.ceil(layout.count * 2.5), unit: 'hooks' }
  if (p.site === 'terrace' && p.elevated) return { item: 'Elevated GI structure (hot-dip galvanised), anchored to RCC', qty: Math.round(kwp * 70), unit: 'kg' }
  if (p.site === 'ground') return { item: 'Ground-mount MMS (hot-dip galvanised) + piles', qty: Math.round(kwp * 45), unit: 'kg' }
  if (['carport', 'busstop'].includes(p.site) || p.site === 'airport') return { item: 'Canopy steel (columns, beams, purlins)', qty: Math.round(kwp * 110), unit: 'kg' }
  return { item: p.eastWest ? 'East-west ballasted aluminium racking' : 'Tilted GI racks on RCC (anchored or ballasted)', qty: Math.round(kwp * (p.eastWest ? 25 : 45)), unit: 'kg' }
}

/** Backup battery: essential kW × hours, LFP at 90 % depth of discharge and 95 % round-trip. */
export function batteryDesign(p) {
  if (!(p.battLoad > 0) || !(p.battHours > 0)) return null
  const usable = p.battLoad * p.battHours
  const nominal = usable / (0.9 * 0.95)
  const price = p.battPrice || p.cost * 350 // ≈ ₹17,500/kWh at ₹50/Wp
  return { usable, nominal, cost: nominal * price, price }
}

/** Single-line diagram as SVG markup (also rasterised into the PDF). Three rows so it reads in a side panel. */
export function sldSvg(e, { dark = false } = {}) {
  const ink = dark ? '#e8e6e1' : '#1c1f24'
  const mute = dark ? '#a3a09a' : '#6b6a66'
  const acc = '#d9902a'
  const W = 360
  const H = 318
  const box = (x, y, w, h, title, sub, fill = 'none') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${ink}" stroke-width="1.3"/>` +
    `<text x="${x + w / 2}" y="${y + (sub ? h / 2 - 3 : h / 2 + 4)}" text-anchor="middle" font-size="12" font-weight="600" fill="${ink}">${title}</text>` +
    (sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" font-size="10" fill="${mute}">${sub}</text>` : '')
  const line = (x1, y1, x2, y2, c = ink, dash = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
  const arrow = (x, y, dir) => `<path d="M${x} ${y} l${dir * -6} -4 v8z" fill="${ink}"/>`
  const text = (x, y, t, anchor = 'start', size = 10) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${mute}">${t}</text>`
  const inv = e.inverter
  const parts = []
  // Row 1: PV strings → DCDB.
  const shown = Math.min(3, e.strings)
  for (let i = 0; i < shown; i++) {
    const y = 14 + i * 26
    parts.push(`<rect x="12" y="${y}" width="104" height="20" rx="3" fill="${acc}22" stroke="${acc}" stroke-width="1.2"/>`)
    for (let k = 0; k < 5; k++) parts.push(`<rect x="${17 + k * 19.5}" y="${y + 4}" width="16" height="12" fill="${acc}" opacity="0.8"/>`)
    parts.push(line(116, y + 10, 140, y + 10), line(140, y + 10, 140, 50))
  }
  parts.push(line(140, 50, 226, 50), arrow(226, 50, 1))
  parts.push(text(12, 14 + shown * 26 + 8, `${e.strings} string${e.strings > 1 ? 's' : ''} × ${e.lengths} modules · ${e.dc.mm2} mm²`))
  parts.push(text(12, 14 + shown * 26 + 21, `Voc ${Math.round(e.vocCold * e.L)} V at ${e.temps.low} °C`))
  parts.push(box(228, 22, 120, 56, 'DCDB', `isolator ${e.protection.dcIsolator.a} A · SPD`))
  // Row 2: inverter (and battery).
  parts.push(line(288, 78, 288, 116), `<path d="M288 118 l-4 -7 h8z" fill="${ink}"/>`)
  parts.push(box(228, 118, 120, 62, `Inverter${inv.n > 1 ? ` ×${inv.n}` : ''}`, `${inv.ac} kW · ${inv.phase}-phase`, `${acc}1f`))
  if (e.battery) {
    parts.push(line(132, 149, 228, 149, ink, '4 3'))
    parts.push(box(12, 124, 120, 50, 'LFP battery', `${e.battery.nominal.toFixed(1)} kWh`))
  } else {
    parts.push(text(12, 146, `DC : AC ${e.dcac.toFixed(2)}`), text(12, 160, `${inv.mppts} MPPT × ${inv.imax} A`))
  }
  // Row 3: ACDB → net meter → grid (right to left).
  parts.push(line(288, 180, 288, 216), `<path d="M288 218 l-4 -7 h8z" fill="${ink}"/>`)
  parts.push(text(296, 202, `${e.ac.label} AC`))
  parts.push(box(248, 218, 100, 52, 'ACDB', `${e.protection.acBreaker} A · SPD`))
  parts.push(line(248, 244, 222, 244), `<path d="M220 244 l7 -4 v8z" fill="${ink}"/>`)
  parts.push(box(128, 218, 92, 52, 'Net meter', 'bidirectional'))
  parts.push(line(128, 244, 102, 244), `<path d="M100 244 l7 -4 v8z" fill="${ink}"/>`)
  parts.push(box(12, 218, 88, 52, 'Grid', inv.phase === 1 ? '230 V' : '415 V'))
  if (e.dg) {
    parts.push(line(298, 270, 298, 282, ink, '4 3'), text(292, 284, `DG ${e.dg.kva} kVA + DG-PV sync`, 'end'))
  }
  if (e.zeroExport) parts.push(text(132, 284, 'zero-export limiter'))
  // Earth bar.
  parts.push(line(12, 296, 348, 296, mute, '2 3'))
  parts.push(text(12, 312, `⏚ ${e.protection.earthing} earth pits (DC, AC, LA) + lightning arrester`))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}" font-family="Inter, system-ui, sans-serif">${parts.join('')}</svg>`
}

/** Bill of materials as CSV text. */
export const bomCsv = (bom) => ['Item,Quantity,Unit', ...bom.map((b) => `"${b.item.replace(/"/g, '""')}",${b.qty},${b.unit}`)].join('\n')
