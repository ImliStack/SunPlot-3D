// Client-ready PDF proposal: A4, vector charts drawn with jsPDF, two 3D captures.
// Loaded on demand (dynamic import) so the app bundle does not carry jsPDF.

import { jsPDF } from 'jspdf'
import { SITES, CLIMATES, panelOf } from './presets.js'
import { MONTHS } from './solar.js'
import { sldSvg } from './electrical.js'

const W = 210
const H = 297
const M = 16 // page margin
const CW = W - 2 * M // content width

let NAVY = [30, 58, 95] // the brand colour when the installer sets one
const SUN = [217, 144, 15]
const INK = [28, 31, 36]
const MUTED = [115, 119, 129]
const LINE = [228, 222, 209]
const SOFT = [246, 243, 236]
const GREEN = [63, 154, 92]
const RED = [229, 72, 77]

const LETTERS = 'ABCDEFGH'

// Helvetica (WinAnsi) has no ₹, CO₂ subscript, ≈ or true minus — spell them out.
const CURRENCY = { '₹': 'INR ', '€': 'EUR ', '£': 'GBP ', 'A$': 'AUD ', 'AED ': 'AED ', '$': 'USD ' }
const clean = (s) => String(s)
  .replace(/₂/g, '2').replace(/≈/g, '~').replace(/−/g, '-').replace(/[″]/g, '"').replace(/—/g, '-')
  .replace(/×/g, 'x').replace(/→/g, '>').replace(/≥/g, '>=').replace(/≤/g, '<=')

const num = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }) : '-')
const energy = (kwh) => (kwh >= 1e6 ? `${num(kwh / 1e6, 2)} GWh` : kwh >= 1e4 ? `${num(kwh / 1e3, 1)} MWh` : `${num(kwh)} kWh`)
const power = (kw) => (kw >= 1000 ? `${num(kw / 1000, 2)} MWp` : `${num(kw, 1)} kWp`)
const bearing = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8]

const hexRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null
}

/** SVG markup to a PNG data URL at `scale` × its own size. */
function svgPng(svg, scale = 2) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width * scale
      c.height = img.height * scale
      const g = c.getContext('2d')
      g.fillStyle = '#fff'
      g.fillRect(0, 0, c.width, c.height)
      g.drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/** Crop a data URL to an aspect ratio (centre), so photos fill their frames. */
function crop(url, aspect) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let w = img.width
      let h = img.height
      if (w / h > aspect) w = h * aspect
      else h = w / aspect
      const c = document.createElement('canvas')
      c.width = Math.round(w)
      c.height = Math.round(h)
      c.getContext('2d').drawImage(img, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, w, h)
      resolve(c.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export async function buildProposal(d) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const brand = d.brand ?? {}
  NAVY = hexRgb(brand.color) ?? [30, 58, 95]
  const cur = CURRENCY[d.params.cur] ?? d.params.cur
  const money = (n) => {
    const a = Math.abs(n)
    const v = d.params.cur === '₹' ? (a >= 1e7 ? `${num(a / 1e7, 2)} Cr` : a >= 1e5 ? `${num(a / 1e5, 2)} L` : num(a)) : a >= 1e6 ? `${num(a / 1e6, 2)} M` : num(a)
    return `${n < 0 ? '-' : ''}${cur}${v}`
  }
  const E = d.eng?.e
  const F = d.eng?.f
  const p = d.params
  const m = panelOf(d.params)

  const font = (size, style = 'normal', color = INK) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
  }
  const text = (s, x, y, opts) => doc.text(clean(s), x, y, opts)
  const fill = (c) => doc.setFillColor(...c)
  const stroke = (c, w = 0.2) => {
    doc.setDrawColor(...c)
    doc.setLineWidth(w)
  }
  const h2 = (s, y) => {
    font(8, 'bold', MUTED)
    text(s.toUpperCase(), M, y, { charSpace: 0.6 })
    return y + 5
  }
  const heading = (title, sub) => {
    fill(NAVY)
    doc.rect(0, 0, W, 24, 'F')
    fill(SUN)
    doc.rect(0, 24, W, 1.2, 'F')
    font(17, 'bold', [255, 255, 255])
    text(title, M, 15)
    font(9, 'normal', [210, 220, 235])
    text(sub, W - M, 15, { align: 'right' })
    return 36
  }
  /** Row of KPI tiles. */
  const tiles = (items, y, h = 18) => {
    const gap = 3
    const w = (CW - gap * (items.length - 1)) / items.length
    items.forEach(([value, label], i) => {
      const x = M + i * (w + gap)
      fill(SOFT)
      doc.roundedRect(x, y, w, h, 2, 2, 'F')
      font(h > 16 ? 13 : 11, 'bold', INK)
      text(value, x + 4, y + h / 2 + 0.5)
      font(7, 'normal', MUTED)
      text(label, x + 4, y + h - 3.5)
    })
    return y + h + 6
  }
  /** Monthly bars with axis labels; optional min–max whiskers and reference dots. */
  const bars = (values, { x = M, y, w = CW, h = 42, color = SUN, lo, hi, dots, unit = '', digits = 0 }) => {
    const max = Math.max(...values, ...(hi ?? []), ...(dots ?? []), 1e-9)
    const step = w / 12
    stroke(LINE)
    doc.line(x, y + h, x + w, y + h)
    values.forEach((v, i) => {
      const bh = (v / max) * h
      const bx = x + i * step + step * 0.18
      fill(color)
      doc.rect(bx, y + h - bh, step * 0.64, bh, 'F')
      if (hi) {
        stroke(INK, 0.3)
        const cx = x + i * step + step / 2
        doc.line(cx, y + h - (hi[i] / max) * h, cx, y + h - (lo[i] / max) * h)
      }
      if (dots) {
        fill(NAVY)
        doc.circle(x + i * step + step / 2, y + h - (dots[i] / max) * h, 0.7, 'F')
      }
      font(6.5, 'normal', MUTED)
      text(MONTHS[i], x + i * step + step / 2, y + h + 4, { align: 'center' })
    })
    font(6.5, 'normal', MUTED)
    text(`max ${num(max, digits)} ${unit}`, x + w, y - 1.5, { align: 'right' })
    return y + h + 9
  }
  const table = (cols, rows, y, widths) => {
    let x = M
    font(7, 'bold', MUTED)
    cols.forEach((c, i) => {
      text(c, x, y)
      x += widths[i]
    })
    y += 2
    stroke(LINE)
    doc.line(M, y, M + CW, y)
    y += 4.5
    font(8.5, 'normal', INK)
    rows.forEach((r) => {
      let cx = M
      r.forEach((c, i) => {
        text(c, cx, y)
        cx += widths[i]
      })
      y += 2
      doc.line(M, y, M + CW, y)
      y += 4.5
    })
    return y + 2
  }
  /** Start a continuation page when `need` mm will not fit below `y`. */
  const room = (y, need, title, sub) => {
    if (y + need <= H - 18) return y
    doc.addPage()
    return heading(title, sub)
  }
  const para = (s, y, size = 8.5, color = INK, width = CW) => {
    font(size, 'normal', color)
    const lines = doc.splitTextToSize(clean(s), width)
    doc.text(lines, M, y)
    return y + lines.length * size * 0.42 + 2
  }

  const L = d.layout
  const Y = d.yield
  const measured = Y.source === 'measured'
  const cuf = L.kwp ? Y.annual / (L.kwp * 8760) : 0
  const place = d.params.placeName || `${num(d.params.lat, 2)}, ${num(d.params.lon, 2)}`
  const dateStr = d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  // ─── Page 1: cover ───
  fill(NAVY)
  doc.rect(0, 0, W, 64, 'F')
  fill(SUN)
  doc.rect(0, 64, W, 1.5, 'F')
  font(10, 'bold', [242, 179, 61])
  text(brand.company ? `${brand.company.toUpperCase()} · SOLAR PV PROPOSAL` : 'SOLAR PV PROPOSAL', M, 20, { charSpace: 0.8 })
  font(24, 'bold', [255, 255, 255])
  text(`${power(L.kwp)} ${SITES[d.params.site].label.toLowerCase()}`, M, 33)
  font(11, 'normal', [210, 220, 235])
  text(`${place} · ${dateStr}`, M, 42)
  if (d.client) text(`Prepared for ${d.client}${d.preparer ? ` by ${d.preparer}` : ''}`, M, 50)
  else if (d.preparer) text(`Prepared by ${d.preparer}`, M, 50)

  let y = 72
  if (d.images.hero) {
    const img = await crop(d.images.hero, 16 / 9)
    if (img) doc.addImage(img, 'JPEG', M, y, CW, CW * 9 / 16)
    y += CW * 9 / 16 + 6
  }
  y = tiles([
    [num(L.count), 'modules'],
    [power(L.kwp), 'DC capacity'],
    [energy(Y.annual), measured ? 'per year (P50)' : 'per year'],
    [`${num(Y.specific)} kWh/kWp`, 'specific yield'],
  ], y)
  y = tiles([
    [money(F.net), F.subsidy ? 'cost after subsidy' : 'installed cost'],
    [money(F.rows[0].savings), 'saved in year 1'],
    [F.payback != null ? `${num(F.payback, 1)} yr` : '> 25 yr', 'payback'],
    [F.irr != null ? `${num(F.irr * 100, 1)} %` : '-', 'IRR over 25 years'],
  ], y)
  y = para(
    `${num(L.count)} x ${m.watt} W modules (${num(L.moduleArea)} m²) are laid out over ${L.arrays.filter((a) => a.count).length} array${L.arrays.filter((a) => a.count).length === 1 ? '' : 's'}, ` +
    `facing ${num(d.params.azimuth)}° ${bearing(d.params.azimuth)}. ` +
    (measured
      ? `Energy is modelled from ten years of measured NASA POWER weather for this location (${Y.years[0].year}-${Y.years[Y.years.length - 1].year}), and the system is expected to deliver ${energy(Y.annual)} in a typical year and at least ${energy(Y.p90)} in nine years out of ten (P90).`
      : `Energy is modelled with a clear-sky model and a ${CLIMATES[d.params.climate].label.toLowerCase()} climate factor.`) +
    (Y.shaded ? ` A shading study of every module across the year puts shading losses at ${num(Y.shadingLoss * 100, 1)} %.` : ''),
    y, 9,
  )

  // ─── Site survey (terrace surveyed from the map) ───
  const S = d.survey
  if (S) {
    doc.addPage()
    y = heading('Site survey', S.address || place)
    y = tiles([
      [`${num(S.units)} kWh`, 'used per month'],
      [`${num(S.kw, 1)} kWp`, 'suggested system'],
      [`${num(S.modules)}`, `modules (${m.watt} W)`],
      [`${num(S.cover * 100)} %`, 'of use covered'],
    ], y)
    y = h2('Where on the roof', y)
    y = para(S.advice, y, 9.5)
    y = table(['Part of terrace', 'Modules fit', 'Direct sun lost to shade'],
      S.zones.map((z) => [z.name, num(z.count), `${num(z.shade * 100, 1)} %`]), y + 2, [60, 40, 60])
    y = h2('Roof', y + 2)
    y = para(`Roof area ${num(S.roofM2)} m² (${num(S.roofM2 * 10.764)} sq ft); it can take up to ${num(S.roofKw, 1)} kWp on an elevated structure with ${num(d.params.edge, 2)} m kept clear at the edges.` +
      (S.limit === 'roof' ? ' The roof, not the bill, limits the size.' : S.limit === 'sanctioned' ? ' The sanctioned load limits the size; the DISCOM can raise it.' : ''), y)
    y = h2('Cost after subsidy', y + 2)
    y = tiles([
      [money(S.cost), 'installed'],
      [`-${money(S.subsidy)}`, 'PM Surya Ghar subsidy'],
      [money(S.cost - S.subsidy), 'your cost'],
      [S.payback ? `${num(S.payback, 1)} yr` : '-', 'payback'],
    ], y, 15)
    y = para(`Subsidy per MNRE PM Surya Ghar: Rs 30,000/kW up to 2 kW, Rs 18,000 for the 3rd kW, max Rs 78,000 (higher in special-category states). It needs DCR modules with Indian-made cells on ALMM List-II and a DISCOM-registered vendor${S.state ? ` in ${S.state}` : ''} — see pmsuryaghar.gov.in.`, y, 8, MUTED)
    para('Surveyed remotely from satellite imagery and Overture / OpenStreetMap building outlines. Confirm roof strength, shade and wiring on site before installation.', y + 2, 8, MUTED)
  }

  // ─── Page 2: system design ───
  doc.addPage()
  y = heading('System design', place)
  const imgW = 92
  if (d.images.plan) {
    const img = await crop(d.images.plan, 1)
    if (img) doc.addImage(img, 'JPEG', M, y, imgW, imgW)
    font(6.5, 'normal', MUTED)
    text('Plan view - amber: usable area after setbacks, red: keep-out around obstacles', M, y + imgW + 4)
  }
  const sx = M + imgW + 6
  const specs = [
    ['Site', SITES[d.params.site].label],
    ['Module', `${m.label}`],
    ['', m.note],
    ['Orientation', m.tile ? 'Tiles, long side along the eave' : d.params.portrait ? 'Portrait' : 'Landscape'],
    ['DC capacity', power(L.kwp)],
    ['Inverter', E ? `${E.inverter.n} x ${E.inverter.label} (DC:AC ${num(E.dcac, 2)})` : '-'],
    ...(p.tiles && m.tile ? [['Mounting', 'Roof-integrated solar tiles (replace the roofing)']] : []),
    ...(L.rowInfo?.eastWest ? [['Racking', 'East-west tents at 10 deg']] : []),
    ['Module area', `${num(L.moduleArea)} m² (${num(L.coverage * 100)} % of surface)`],
    ['Weight', `${num((L.count * m.kg) / 1000, 2)} t${L.load ? ` · ${num(L.load, 1)} kg/m² dead load` : ''}`],
    ...(L.rowInfo ? [['Row pitch', `${num(L.rowInfo.pitch, 2)} m (winter-noon sun ${num(L.rowInfo.sun, 1)}°)`]] : []),
    ['Setbacks', ['ground', 'carport', 'busstop'].includes(d.params.site) ? `${num(d.params.edge, 2)} m` : `edge ${num(d.params.edge, 2)} m · ridge ${num(d.params.ridge, 2)} m`],
    ['Obstacles', L.obstacles.length ? L.obstacles.map((o) => o.kind).reduce((a, k) => ({ ...a, [k]: (a[k] ?? 0) + 1 }), {}) : 'none'],
  ]
  let sy = y + 3
  specs.forEach(([k, v]) => {
    const value = typeof v === 'object' ? Object.entries(v).map(([n, c]) => `${c} ${n === 'hvac' ? 'HVAC unit' : n}${c > 1 ? 's' : ''}`).join(', ') : v
    font(7, 'bold', MUTED)
    text(k, sx, sy)
    font(8.5, 'normal', INK)
    const lines = doc.splitTextToSize(clean(value), W - M - sx - 22)
    doc.text(lines, sx + 22, sy)
    sy += Math.max(1, lines.length) * 3.8 + 1.6
  })
  y = Math.max(y + imgW + 10, sy + 4)
  y = h2('Arrays', y)
  y = table(['', 'Plane', 'Tilt', 'Faces', 'Modules', 'kWp', 'Shade', 'kWh / yr'],
    L.arrays.map((a, i) => a.count ? [
      LETTERS[i], a.name, `${num(a.tilt)}°`, `${num(a.azimuth)}° ${bearing(a.azimuth)}`, num(a.count),
      num((a.count * m.watt) / 1000, 1), Y.shade ? `${num((Y.shade[i].reduce((p, q) => p + q, 0) / 12) * 100, 1)} %` : '-',
      num(Y.perArray[i]),
    ] : null).filter(Boolean), y, [7, 50, 16, 24, 18, 16, 16, 30])
  if (L.notes.length) {
    y = h2('Design notes', y + 2)
    L.notes.forEach((n) => { y = para(`- ${n}`, y, 8, INK) })
  }

  // ─── Page 3: energy ───
  doc.addPage()
  y = heading('Energy yield', measured ? `NASA POWER ${Y.years[0].year}-${Y.years[Y.years.length - 1].year}` : 'Clear-sky model')
  y = h2('Energy by month (kWh)', y)
  y = bars(Y.months, { y: y + 2, unit: 'kWh' })
  y = tiles([
    [`${num(Y.specific)}`, 'kWh/kWp per year'],
    [`${num(cuf * 100, 1)} %`, 'capacity utilisation (CUF)'],
    [`${num((Y.pr ?? 0) * 100, 1)} %`, 'performance ratio'],
    [Y.shaded ? `${num(Y.shadingLoss * 100, 1)} %` : '-', 'shading loss'],
  ], y, 15)
  if (measured && Y.losses) {
    y = h2('Where the sunlight goes (per year)', y + 2)
    const max = Y.poaKwh || 1
    const rows = [['Sunlight on modules', Y.poaKwh, 0, SUN, energy(Y.poaKwh)]]
    let left = Y.poaKwh
    for (const l of Y.losses) {
      rows.push([l.label, l.kwh, left - l.kwh, { shade: RED, soil: [176, 136, 80], snow: [143, 179, 224], temp: [224, 123, 57], system: MUTED }[l.key], `-${num((l.kwh / max) * 100, 1)} %`])
      left -= l.kwh
    }
    rows.push(['Delivered (AC)', Y.annual, 0, GREEN, energy(Y.annual)])
    rows.forEach(([label, v, from, color, tag], i) => {
      font(8.5, i === 0 || i === rows.length - 1 ? 'bold' : 'normal', INK)
      text(label, M, y + 3)
      fill(SOFT)
      doc.rect(M + 52, y, CW - 52 - 24, 4, 'F')
      fill(color)
      doc.rect(M + 52 + (from / max) * (CW - 76), y, Math.max(0.4, (v / max) * (CW - 76)), 4, 'F')
      font(8, 'normal', INK)
      text(tag, M + CW, y + 3, { align: 'right' })
      y += 6.5
    })
    y += 4
  }
  if (measured) {
    y = h2('Energy year by year, with P90', y + 2)
    const vals = Y.years.map((r) => r.kwh)
    const mx = Math.max(...vals)
    const mn = Math.min(...vals)
    const floor = Math.max(0, mn - (mx - mn) * 1.5)
    const bh = 36
    const step = CW / vals.length
    vals.forEach((v, i) => {
      const hgt = ((v - floor) / (mx - floor)) * bh
      fill(NAVY)
      doc.rect(M + i * step + step * 0.2, y + bh - hgt, step * 0.6, hgt, 'F')
      font(6.5, 'normal', MUTED)
      text(String(Y.years[i].year), M + i * step + step / 2, y + bh + 4, { align: 'center' })
    })
    const py = y + bh - ((Y.p90 - floor) / (mx - floor)) * bh
    stroke(RED, 0.4)
    doc.setLineDashPattern([1.2, 1], 0)
    doc.line(M, py, M + CW, py)
    doc.setLineDashPattern([], 0)
    font(7, 'bold', RED)
    const label = `P90 ${energy(Y.p90)}`
    fill([255, 255, 255])
    doc.rect(M + CW - doc.getTextWidth(label) - 3, py - 5, doc.getTextWidth(label) + 3, 4, 'F')
    text(label, M + CW, py - 1.8, { align: 'right' })
    y += bh + 10
  }

  // ─── Page 4: site climate ───
  const C = d.climate
  if (C) {
    doc.addPage()
    y = heading('Site climate', `${place} · ${C.years[0]}-${C.years[C.years.length - 1]}`)
    const s = C.summary
    y = tiles([
      [`${num(s.annualGhi)}`, 'kWh/m² per year (GHI)'],
      [`${num(s.peakSunHours, 2)} h`, 'peak sun hours / day'],
      [`${num(s.tAvg, 1)} °C`, 'mean air temperature'],
      [`${num(s.rain)} mm`, 'rain per year'],
    ], y, 15)
    y = h2('Solar irradiation, kWh/m² per day - bar: mean, line: 10-yr range, dot: clear sky', y)
    y = bars(s.monthly.map((x) => x.ghi), { y: y + 2, lo: s.monthly.map((x) => x.ghiMin), hi: s.monthly.map((x) => x.ghiMax), dots: s.monthly.map((x) => x.clr), unit: 'kWh/m²/day', digits: 2, h: 38 })
    y = h2('Temperature - red: daily max, navy: mean (°C)', y)
    {
      const tmax = s.monthly.map((x) => x.tmax)
      const tm = s.monthly.map((x) => x.t)
      const lo = Math.min(...tm) - 3
      const hi = Math.max(...tmax) + 3
      const hh = 30
      const step = CW / 12
      const pt = (v, i) => [M + i * step + step / 2, y + hh - ((v - lo) / (hi - lo)) * hh]
      stroke(LINE)
      doc.line(M, y + hh, M + CW, y + hh)
      for (const [series, color] of [[tm, NAVY], [tmax, RED]]) {
        stroke(color, 0.6)
        for (let i = 1; i < 12; i++) doc.line(...pt(series[i - 1], i - 1), ...pt(series[i], i))
        series.forEach((v, i) => {
          fill(color)
          doc.circle(...pt(v, i), 0.6, 'F')
        })
      }
      MONTHS.forEach((mo, i) => {
        font(6.5, 'normal', MUTED)
        text(mo, M + i * step + step / 2, y + hh + 4, { align: 'center' })
      })
      font(6.5, 'normal', MUTED)
      text(`${num(lo)}–${num(hi)} °C`, M + CW, y - 1.5, { align: 'right' })
      y += hh + 10
    }
    y = h2('Rain (bars) and snowfall water-equivalent (dots), mm per month', y)
    y = bars(s.monthly.map((x) => x.rain * 30), { y: y + 2, dots: s.monthly.map((x) => (x.snow ?? 0) * 30), color: [143, 179, 224], unit: 'mm', h: 30 })
    if (measured && Y.losses) {
      const soil = Y.losses.find((l) => l.key === 'soil').kwh / Y.poaKwh
      const snow = Y.losses.find((l) => l.key === 'snow').kwh / Y.poaKwh
      const clean_ = d.params.cleanDays ? `with cleaning every ${d.params.cleanDays} days` : 'with rain as the only cleaning'
      const snowTxt = snow >= 0.0005 ? ` Snow cover costs about ${num(snow * 100, 1)} %.` : ' Snow does not settle here.'
      y = para(`Dust costs about ${num(soil * 100, 1)} % a year ${clean_}.${snowTxt} Heat costs ${num((Y.tempLossPct ?? 0) * 100, 1)} % through cell temperature.`, y, 8.5)
    }
  }

  // ─── Electrical design ───
  if (E) {
    doc.addPage()
    y = heading('Electrical design', `${E.inverter.n} x ${E.inverter.label}`)
    y = tiles([
      [`${E.strings} x ${E.L}`, 'strings x modules'],
      [`${num(E.vocCold * E.L)} V`, `string Voc at ${E.temps.low} °C`],
      [num(E.dcac, 2), 'DC : AC ratio'],
      [E.ok ? 'Pass' : 'Check', 'string limits'],
    ], y, 15)
    const sld = await svgPng(sldSvg(E), 2)
    if (sld) {
      const w = 112
      const h = (w * 318) / 360
      doc.addImage(sld, 'PNG', M, y, w, h)
      // Checks beside the diagram.
      let cy = y + 3
      const cx = M + w + 6
      font(7, 'bold', MUTED)
      text('CHECKS', cx, cy)
      cy += 5
      E.checks.forEach((c) => {
        fill(c.ok ? GREEN : RED)
        doc.circle(cx + 1, cy - 1, 0.9, 'F')
        font(7.5, 'normal', INK)
        const lines = doc.splitTextToSize(clean(c.label), W - M - cx - 4)
        doc.text(lines, cx + 4, cy)
        cy += lines.length * 3.2
        font(7.5, 'bold', c.ok ? INK : RED)
        text(`${c.value}  (${c.limit})`, cx + 4, cy)
        cy += 5
      })
      y += Math.max(h, cy - y) + 4
    }
    y = h2('Cables and protection', y)
    y = table(['Item', 'Size / rating', 'Note'], [
      ['DC string cable', `${E.dc.mm2} mm² PV`, `${num(E.runs.dc)} m run, ${num(E.dc.drop * 100, 2)} % drop`],
      ['AC cable', `${E.ac.mm2} mm² Cu`, `${num(E.runs.ac)} m run, ${num(E.ac.drop * 100, 2)} % drop, ${num(E.iAc, 1)} A`],
      ['DC isolator', `${E.protection.dcIsolator.v} V / ${E.protection.dcIsolator.a} A`, `SPD ${E.protection.dcSpd}`],
      ['AC breaker', `${E.protection.acBreaker} A${E.protection.mainBreaker ? ` (+ ${E.protection.mainBreaker} A main)` : ''}`, `SPD ${E.protection.acSpd}`],
      ...(E.protection.stringFuse ? [['String fuses', `${E.protection.stringFuse} A gPV`, '3+ strings in parallel']] : []),
      ['Earthing', `${E.protection.earthing} pits + LA`, 'DC, AC and lightning arrester'],
      ...(E.battery ? [['Battery', `${num(E.battery.nominal, 1)} kWh LFP`, `${num(p.battLoad, 1)} kW for ${num(p.battHours, 1)} h backup`]] : []),
    ], y, [40, 50, 88])
    y = room(y, E.bom.length * 6.5 + 14, 'Bill of materials', `${power(L.kwp)} · ${place}`)
    y = h2('Bill of materials', y)
    y = table(['Item', 'Qty'], E.bom.map((b) => [b.item, `${num(b.qty)} ${b.unit}`]), y, [150, 28])
    y = room(y, 12, 'Electrical design', 'continued')
    para('Concept design to IEC 62548 / MNRE practice: string limits from the module datasheet and the site\'s 10-year temperature extremes, cables by ampacity and voltage drop. A licensed electrical engineer must approve the final design.', y, 7.5, MUTED)
  }

  // ─── Page 5: financials ───
  doc.addPage()
  y = heading('Financials', `${cur.trim()} · ${num(p.cost, 2)} per Wp · ${num(p.tariff, 2)} per kWh, +${num(p.escalation, 1)} %/yr`)
  y = tiles([
    [money(F.gross), 'system cost'],
    [F.subsidy ? `-${money(F.subsidy)}` : money(0), 'subsidy / incentive'],
    [money(F.net), 'net cost'],
    [F.payback != null ? `${num(F.payback, 1)} yr` : '> 25 yr', 'payback'],
  ], y)
  y = tiles([
    [F.irr != null ? `${num(F.irr * 100, 1)} %` : '-', 'IRR (25 yr)'],
    [money(F.npv), `NPV at ${num(p.discount, 1)} %`],
    [`${cur}${num(F.lcoe, 2)}`, 'LCOE per kWh'],
    [money(F.gain25), '25-year net gain'],
  ], y, 15)
  if (F.loan > 0) {
    y = tiles([
      [money(F.down), 'down payment'],
      [money(F.loan), `loan at ${num(p.loanRate, 2)} %`],
      [`${money(F.emi)}/mo`, `EMI for ${p.loanYears} yr`],
      [money(F.rows[0].savings / 12), 'saved per month, yr 1'],
    ], y, 15)
  }
  y = h2('Cumulative cash position over 25 years', y)
  {
    const flows = [-F.down, ...F.rows.map((r) => r.cumulative)]
    const hh = 46
    const mn = Math.min(0, ...flows)
    const mx = Math.max(0, ...flows)
    const zy = y + hh - ((0 - mn) / (mx - mn)) * hh
    const step = CW / flows.length
    stroke(LINE)
    doc.line(M, zy, M + CW, zy)
    flows.forEach((v, k) => {
      const top = y + hh - ((Math.max(v, 0) - mn) / (mx - mn)) * hh
      const bot = y + hh - ((Math.min(v, 0) - mn) / (mx - mn)) * hh
      fill(v < 0 ? RED : GREEN)
      doc.rect(M + k * step + step * 0.15, top, step * 0.7, Math.max(0.3, bot - top), 'F')
      if (k % 5 === 0) {
        font(6.5, 'normal', MUTED)
        text(`yr ${k}`, M + k * step + step / 2, y + hh + 4, { align: 'center' })
      }
    })
    y += hh + 9
  }
  y = table(['Year', 'Energy', 'Tariff', 'Savings', 'O&M', ...(F.loan > 0 ? ['Loan'] : []), 'Cumulative'],
    F.rows.filter((r) => [1, 2, 3, 5, 10, 12, 15, 20, 25].includes(r.year)).map((r) => [
      String(r.year), energy(r.kwh), num(r.tariff, 2), money(r.savings), money(r.om), ...(F.loan > 0 ? [money(r.loan)] : []), money(r.cumulative),
    ]), y, F.loan > 0 ? [14, 26, 18, 28, 24, 26, 42] : [16, 30, 22, 34, 30, 46])
  y = h2('For the planet', y)
  y = tiles([
    [`${num(F.env.co2Year, 1)} t`, 'CO2 avoided per year'],
    [`${num(F.env.co2Life)} t`, 'CO2 avoided, 25 yr'],
    [num(F.env.trees), "trees' worth of CO2 a year"],
    [`${num(F.env.coal, 1)} t`, 'coal not burnt a year'],
  ], y, 15)

  y = room(y, 70, 'Assumptions & sources', place)
  y = h2('Assumptions & sources', y + 2)
  const assumptions = [
    `Modules: ${m.label}, ${m.note}. ${E ? `Inverters: ${E.inverter.n} x ${E.inverter.label}, DC:AC ${num(E.dcac, 2)}.` : ''} Output -1 % in year 2 then -0.4 %/yr.`,
    `Money: tariff ${num(p.tariff, 2)} rising ${num(p.escalation, 1)} %/yr${p.useKwh ? `; ${num(p.useKwh)} kWh/month used on site, surplus at ${num(p.exportRate || p.tariff * 0.4, 2)}/kWh` : '; all solar energy valued at the tariff (net metering)'}; O&M ${num(p.omPct, 1)} % of cost a year rising 5 %/yr; inverter replacement (~10 % of cost) in year 12; discount rate ${num(p.discount, 1)} %.`,
    measured
      ? 'Weather: NASA POWER monthly means (CERES / MERRA-2) for the last ten complete years. Horizontal irradiation split into beam and diffuse (Collares-Pereira & Rabl) and transposed per plane (isotropic sky, albedo 0.2). Temperature loss -0.35 %/°C above 25 °C cell; 14 % system losses.'
      : `Weather: ASHRAE clear-sky model x ${CLIMATES[d.params.climate].label.toLowerCase()} factor ${CLIMATES[d.params.climate].k}; performance ratio ${Y.pr}.`,
    'Soiling: dust build-up by rainfall class, cleared by rain events and the cleaning interval. Snow: covered days from snowfall, tilt and temperature.',
    Y.shaded ? 'Shading: every module centre ray-cast to the sun every half hour on a mid-month day, against trees, rows, roof planes and obstacles; beam light only.' : 'Shading: not yet computed when this report was made.',
    `Rows and setbacks: rows spaced for no shade at winter-solstice noon; roof setbacks per IFC/IRC (18" ridge, 36" pathways) unless changed.`,
    'Data: NASA POWER (power.larc.nasa.gov); OpenStreetMap contributors (ODbL); Open-Meteo geocoding.',
  ]
  assumptions.forEach((a) => { y = para(`- ${a}`, y, 7.8, INK) })
  y = para('This is a concept proposal, not an engineering design. Structural capacity, electrical design, local codes, permits, grid connection and final pricing must be confirmed by a site survey and a qualified installer.', y + 2, 7.8, MUTED)

  // Footer on every page.
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    stroke(LINE)
    doc.line(M, H - 12, W - M, H - 12)
    font(7, 'normal', MUTED)
    text(brand.company ? `${brand.company}${brand.phone ? ` · ${brand.phone}` : ''}${brand.email ? ` · ${brand.email}` : ''} · ${power(L.kwp)} · ${dateStr}` : `SunPlot 3D · ${place} · ${power(L.kwp)} · ${dateStr}`, M, H - 7)
    text(`${i} / ${pages}`, W - M, H - 7, { align: 'right' })
  }

  const slug = place.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (d.save !== false) doc.save(`solar-proposal-${slug || 'site'}-${d.date.toISOString().slice(0, 10)}.pdf`)
  return doc
}
