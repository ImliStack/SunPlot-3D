# SunPlot 3D — R&D + Plan

Goal: a browser 3D planner that shows how solar modules sit on a **house, a flat-roof
building or open ground**, driven by input values (size, pitch, direction, location), and
reports how many modules fit, system size, yearly energy and payback. Same stack as
Body Atlas 3D (React 19 + React Three Fiber + drei + zustand + Vite 5, Node 18).

## 1. How the pros do it (reference products)

| Product | What it does | What we borrow |
|---|---|---|
| Aurora Solar / OpenSolar / PVsyst | Trace the roof from imagery/LiDAR, auto-fill modules with setbacks, shading via ray-tracing, 8760-hour yield | Auto-fill inside setbacks; per-plane arrays; yield per plane |
| Google Project Sunroof / Solar API | Roof segments (pitch, azimuth, area) from aerial 3D → panel count + kWh | Treat each roof plane as `{tilt, azimuth, area}` |
| NREL PVWatts | kWp + tilt + azimuth + location → monthly kWh, 14 % default losses | Monthly output; performance-ratio style losses |
| pvlib (Python) | Reference solar-position and transposition models | Same formulas, simplified, in JS |

Takeaway: every tool reduces a roof to **planes** and a ground site to **rows**. Panels are
packed per plane, then each plane's tilt/azimuth drives the energy model.

## 2. Domain facts used (checked 2026-10)

### Modules
| Class | Size (mm) | Power | Weight |
|---|---|---|---|
| Residential 108 half-cell TOPCon | 1722 × 1134 × 30 | 430 W, ~22 % | ~21 kg |
| Commercial 144 half-cell | 2278 × 1134 | 550 W | ~28 kg |
| Utility bifacial 132 half-cell | 2382 × 1134 | 620 W | ~33 kg |

Module gap (clamp): 20 mm. Flush-mount stand-off: ~100–150 mm.

### Roof setbacks (US IFC/IRC R324 — local codes vary)
- **Ridge:** 18″ (0.45 m) when the array covers ≤ 33 % of the roof plan area, 36″ above that.
- **Pathways:** 36″ (0.9 m) from eave to ridge on each array plane; 18″ either side of hips/valleys.
- **Commercial flat roofs:** 4 ft (1.2 m) perimeter pathway is typical.

### Row spacing (flat roof racks and ground mounts)
Design to the **lowest noon sun of the year** (winter solstice):

```
sun altitude α = 90° − |latitude| − 23.44°
table rise     h = L · sin(tilt)          (L = slope length of the table)
shadow         s = h / tan(α)
row pitch      P = L · cos(tilt) + s      (front edge to front edge)
```
Example: 1.7 m module, 30° tilt, 20° sun → P ≈ 3.8 m. We also keep a ≥ 0.6 m aisle.

### Best fixed tilt
Annual optimum ≈ `0.76 · |lat| + 3.1°` (rule of thumb from PVGIS-style fits). Face the
equator: azimuth 180° in the north, 0° in the south.

## 3. Model used in the app (`src/solar.js`)

1. **Sun position** — declination (Cooper), hour angle from *solar time*, altitude and azimuth.
   Solar time avoids needing longitude/time zone.
2. **Clear-sky irradiance** — ASHRAE model (Masters): `DNI = A·e^(−B/sin α)`, `DHI = C·DNI`,
   with seasonal A, B, C.
3. **Plane-of-array** — beam·cos θ + isotropic sky diffuse + ground-reflected (albedo 0.2),
   integrated every 15 min over the year, cached per (lat, tilt, azimuth).
4. **Energy** — `kWh = POA(kWh/m²) × kWp × PR(0.80) × climate factor` where the climate factor
   (0.5 cloudy … 0.86 desert) turns clear-sky into a typical year.

Sanity check: New Delhi, 26° south roof → ≈ 1,580 kWh/kWp·yr (PVWatts gives ~1,500–1,650).

## 4. 3D build

| Piece | How |
|---|---|
| Buildings | Procedural: boxes + custom gable/shed polygons, windows per floor, parapets, stair housing |
| Modules | One `InstancedMesh`, box with 6 materials (canvas-painted cell texture on top, frame on sides) |
| Racking | Instanced posts and rails, sized from the row geometry |
| Sun | Directional light with shadow map; sky colour by altitude; dashed sun-path arc with hour ticks |
| Context | Seeded trees + road (toggle), compass ring with N/E/S/W sprites |
| Camera | `CameraControls`, presets fit the site's bounding sphere |

Everything is code — no model files to download.

## 5. Round 2 — large-scale sites, measured climate, real installations

### Canopies, shelters, airports (checked 2026-10)
| Topic | Figure used | Source type |
|---|---|---|
| Carport clear height | 2.7–3 m cars; up to ~4.9 m for fire trucks | vendor specs, US patent 11063553 |
| Carport tilt | 0–15° (default 5°) | vendor specs |
| Post spacing | ~8.5 m (every 3 bays) T / Y frames | SolarMounts |
| Bay / aisle | 2.5 × 5 m bays, 7 m aisle | municipal parking codes |
| Bus shelters | Deer Park (AU): 2 shelters > 65 m, 65 kW | McConnell Dowell case study |
| Airports | Cochin (CIAL) ~50 MW incl. ~5 MW carport | Wikipedia / pv-magazine |

### Measured climate
- **NASA POWER** monthly API (no key, CORS): `ALLSKY_SFC_SW_DWN`, `CLRSKY_SFC_SW_DWN`, `T2M`, `T2M_MAX`,
  `WS10M`, `PRECTOTCORR`, `ALLSKY_KT` for the last 10 complete years; cached in `localStorage`.
- Transposition: Kt = H / H₀ → diffuse share (Collares-Pereira & Rabl monthly fit) → beam × Rb (clear-sky
  geometric ratio) + isotropic diffuse + albedo 0.2. 14 % system loss, −0.35 %/°C above 25 °C cell.
- Checked against PVGIS-class results: Delhi 1,440 · Jodhpur 1,636 · Kochi 1,460 · London 1,091 kWh/kWp.
- P90 from the spread of the ten annual totals (1-year P90 = mean − 1.28 σ).

### Installations
- Live: Overpass `power=plant` + `plant:source=solar` in a bounding box (mirrors in turn, 12 s each).
  Public servers are often at capacity — the UI offers Retry and keeps the curated list.
- Curated landmarks with reported capacities; coordinates approximate.

### UI/UX decisions
- Results split into **System / Climate / Nearby** tabs so engineers aren't scrolling one long column.
- Overlays an installer reads at a glance: amber usable-area outlines, red keep-outs, lettered array
  tags that match the table, dimensions, HUD compass.
- Side panels fold away (edge handles, `[` `]`, focus `\`) to give the 3D view the full width.

## 6. Round 3 — shading, weather losses, interactive install
- **Shading:** `src/shading.js` builds casters (module quads, L-shape roof quads, obstacle / parapet /
  terminal / bus boxes, tree crowns as spheres) into a plan grid; each module centre fires rays at
  12 mid-month days × half-hourly sun positions, weighted by clear-sky DNI × cos(incidence). Result:
  monthly beam-shading fraction per array (applied to the beam part only) and an annual fraction per module.
  Runs in `shading.worker.js`; 3,250 modules ≈ 0.5–1.2 s.
- **Soiling:** Kimber-style — dust 0.12–0.30 %/day by annual rainfall; a rain event ≈ 10 mm of monthly rain;
  cleaning interval input; monthly loss = rate × interval ÷ 2 (≤ 25 %). Delhi 1.4–2.5 %, Jaipur 1.7–3.9 %.
- **Snow:** NASA `PRECSNOLAND` / `SNODP`; one event per ~8 mm water-equivalent, residence 0.5 + 3·(1 − tilt/60)
  days, halved above 5 °C highs. Oslo 26° tilt: 3.6–6 %/yr, January ≈ 50 %; Berlin 0.4 %.
- **Click to install:** candidates come from the full layout (every plane in manual mode); the built design is
  `selectArrays(full, on)`, so energy, shading, tags and totals follow the selection.

## 7. Round 4 — click-to-install research and design

How pro tools let designers edit a layout (checked 2026-10):

| Tool | Placement interaction |
|---|---|
| Aurora (Sales mode) | Auto max-fit first; tap toggles one module; tap-and-drag "snake selects" — the first module's state decides on/off; double-tap toggles an array |
| Aurora (Design mode) | Click to place one module, drag to place many; modules snap to row/column spacing |
| HelioScope | Auto layout by default; manual tools add a row (click start, click end), right-click removes a module; multi-step undo |
| OpenSolar | Panel groups with modules-per-row; click-drag over panels forms a sub-array |

Built from that: Auto layout stays the default; **Click to install** shows every candidate slot as a
ghost. Tools: Module, Row, Column, Array, Paint (drag; first module decides add/remove, camera orbit
paused during the stroke). Undo/redo history, Fill all / Clear, live counter, hover hint of what the
next click does. Each module has a stable key `array|row|position|stack`; racking rows without any
installed module are hidden.

Sources: help.aurorasolar.com (Sales Mode module placement, Design Mode panel placement),
help-center.helioscope.com (Manually Moving Modules), support.opensolar.com (Optimizing Individual Panels and Arrays).

## 8. Proposal — remote site survey for Indian homes (researched 2026-10, not built yet)

Goal: replace the installer's first home visit. From an address and an electricity bill, show where
on the roof panels go, how many, which modules, which vendors, and what it costs after subsidy.

### How the business works today (India, residential)
- **Sizing from the bill.** DISCOM guidance (JBVNL): 0–150 units/month → 1–2 kW, 150–300 → 2–3 kW,
  300+ → above 3 kW. Rule of thumb ~120 units per kW per month in North India; SunPlot can replace
  that with the site's own NASA-based kWh/kWp.
- **Subsidy (PM Surya Ghar Muft Bijli Yojana):** ₹30,000/kW for the first 2 kW + ₹18,000 for the 3rd kW,
  max ₹78,000 (₹33,000 / ₹19,800 in special-category states). No subsidy on batteries.
- **Modules:** subsidy needs DCR modules on **ALMM List-II — cells too, from 1 June 2026** (≈ +₹3,000/kW).
  Typical class: 545–625 Wp N-type TOPCon. Named makers in market notes: Waaree, Adani Solar,
  Tata Power Solar, Vikram Solar, Premier Energies, RenewSys. Branded DCR ≈ ₹24–30/W; non-DCR
  ₹13–18/W (blog figures, disagree — verify with distributor quotes).
- **Vendors:** DISCOM-empanelled installers listed on pmsuryaghar.gov.in with their rates; a vendor
  rating programme (min. 50 installs) scores reliability and feedback. **No public API** — a vendor
  directory would need a curated dataset or a partnership.

### Remote roof analysis — what exists
- **Google Solar API** now covers **~300 million Indian rooftops** (Sept 2026) — building insights:
  roof segments with pitch, azimuth, area, sunshine quantiles, panel configurations; already used by
  Solar Ladder and OpenSolar in India for no-visit proposals. Billed per request (Building Insights =
  Essentials SKU, Data Layers = Enterprise SKU), 600 QPM each.
- **Google Photorealistic 3D Tiles** — real 3D city mesh to show the actual house; India rate
  $3.30 / 1,000 root-tile requests, 7,000 free.
- Indian homes are mostly **flat RCC terraces** with a stair head-room (mumty) and water tank: the
  survey must place an **elevated structure** on the terrace and keep it out of the mumty / tank
  shadow — SunPlot's flat-roof keep-outs and ray-cast shading already do this.

### Recommendation: same app, new "Site survey" flow; separate backend later
Build it **inside SunPlot** — it reuses the layout engine, shading, NASA climate, yield and PDF:
1. Address search → Google 3D tiles + Solar API building insights for that roof.
2. Roof segments ranked: front / back / left / right / centre of terrace by kWh/kWp and shade —
   "the south-facing front slope gives 1,420 kWh/kWp, the back slope 980".
3. Bill input (units/month or upload) → kW needed → module count → DCR module options.
4. Subsidy + payback (PM Surya Ghar), then "Open in studio" with the real roof size.
5. Proposal PDF gains a site-survey page.

A **separate backend project** only when the business side starts: customer leads and bills (personal
data → consent, storage, DPDP Act), vendor directory and quotes, accounts. Keep the planner static.

Needs from you before building: a Google Maps Platform key with Solar API + Map Tiles enabled and
billing on (key restricted to your domain).

Sources: solarquarter.com (MNRE PM Surya Ghar guidelines, Sept 2026); businesstoday.in (₹78,000 cap);
jbvnl.co.in (CFA structure); news.metal.com (DCR premium); solarsquare.in (ALMM List-II rule);
quickestimate.co (module prices — blog); yourstory.com and blog.google (Solar API in India, Sept 2026);
developers.google.com (Solar API billing, Map Tiles pricing India); tsecl.in, mahadiscom.in
(vendor empanelment); solarquarter.com (vendor rating programme).

## 9. Not done yet (ideas)
- Dormers, T/U-shaped plans, user-drawn obstacles.
- Real shading loss: ray-cast module centres against trees/rows per hour.
- Fetch TMY irradiance (PVGIS / NREL API) instead of a climate factor.
- String / inverter sizing, wind & snow zones, bill of materials export (CSV/PDF).
- Map/satellite base layer to trace a real roof.
