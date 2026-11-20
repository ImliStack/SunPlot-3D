# SunPlot 3D: product audit

Audit date: 19 Nov 2026, of commit `476812e` (live at https://sunplot-3d.imlistack.workers.dev).
Screenshots of the app as audited are in [`docs/before/`](before/) (30 views).

Severity: **S1** gives a wrong number a customer might rely on · **S2** a correctness gap with a
documented workaround, or a missing professional feature · **S3** UX or code quality.

## 1. Stack and structure

- React 19 + Vite 5, three.js 0.186 via React Three Fiber 9 and drei, zustand state, jsPDF, MapLibre 4
  with PMTiles (Overture buildings and places). There is no TypeScript and no tests.
- Deployed as **static assets** on Cloudflare Workers (`wrangler.jsonc`, no Worker code). Every external
  call (NASA POWER, Overpass, Photon, Esri tiles, Overture PMTiles) goes straight from the browser.
- Calculation code lives in plain modules (`solar.js`, `shading.js` in a Web Worker, `layout.js`,
  `electrical.js`, `finance.js`, `load.js`). The UI reads them through hooks, so the engine is already
  mostly separate from rendering, which is good for the upgrade.

## 2. Findings

### Solar position and irradiance (`src/solar.js`)

| # | Finding | Sev. | Fix |
|---|---|---|---|
| 1 | Sun position uses Cooper's declination formula and **local solar time** only: no equation of time, longitude, time zone, refraction or elevation. Errors reach ~1° in declination and up to ±16 min in time; the "10:30" on the sun bar is solar time, not clock time. | S1 | NREL SPA (Reda & Andreas 2004) in JS, validated against the NREL reference case, with clock time, time zone and solar time shown separately. |
| 2 | The measured-climate model works on **monthly means**: monthly GHI split by a Collares-Pereira/Rabl Kt fit, beam scaled by a clear-sky ratio, isotropic sky (Liu–Jordan). There's no hourly coupling of irradiance, temperature and inverter. | S1 | Hourly simulation on a typical meteorological year (PVGIS TMY, with NASA POWER hourly as fallback): Perez transposition, AOI losses, SAPM cell temperature, PVWatts DC and inverter with clipping. |
| 3 | The fallback "climate class" model is ASHRAE clear-sky × an **arbitrary climate factor** (0.5–0.86) × PR 0.8. | S1 | Keep it only as an explicitly labelled rough estimate while data loads; never use it in reports. |
| 4 | Cell temperature = daytime air + 25 °C × min(1.2, GHI/6). The heuristic has no wind or mounting term. | S1 | SAPM thermal model per mounting type (open rack, close roof mount, insulated back). |
| 5 | A fixed `SYSTEM_PR 0.86` stands in for inverter, wiring and mismatch, so there's no clipping and no inverter efficiency curve. | S1 | PVWatts inverter model (nominal 96 %) with clipping at AC rating, plus an itemised loss table (wiring, mismatch, connections, LID, nameplate, availability). |
| 6 | No angle-of-incidence (reflection) loss. | S2 | Physical (Fresnel + absorption) IAM, as in PVWatts. |
| 7 | Albedo is fixed at 0.2. | S2 | Use the weather file's albedo where present, otherwise a user input. |
| 8 | P90 comes from 10 annual totals (monthly data), which is fine as an inter-annual spread, but it's mixed with the monthly model. | S2 | Keep the NASA 10-year spread as the uncertainty band around the hourly TMY result, and label it so. |

### Shading (`src/shading.js`)

| # | Finding | Sev. | Fix |
|---|---|---|---|
| 9 | Ray-casting from **module centres** only, at half-hour steps on one mid-month day, beam only. It's a reasonable proxy but has no partial-module or bypass-diode modelling. | S2 | Keep it as the fast mode. Add sub-module sampling (3 bypass-diode sections per module) so shading of a cell string removes that section, documented as an electrical approximation. |
| 10 | The acceleration structure is a uniform 2-D grid, which is fine to ~3,000 modules. | S3 | Keep, and measure the timing. A BVH (three-mesh-bvh) is only needed for imported meshes. |
| 11 | Diffuse shading is ignored (the sky view factor is not reduced by obstacles). | S2 | Sky-view factor per module from a hemisphere ray fan, applied to diffuse irradiance. |

### Layout and geometry (`src/layout.js`)

| # | Finding | Sev. | Fix |
|---|---|---|---|
| 12 | Parametric site types plus terrace polygons from the survey, with a local metric frame (`survey/geo.js`, equirectangular about the bbox centre). Accurate to well under 0.1 % at roof scale. | OK | Document it. |
| 13 | Studio buildings can't be drawn freely, and obstacles can't be added or moved in 3D. | S2 | Editable roof polygon and obstacle tools in the 2-D plan view (Phase 2). |
| 14 | One layout per design; there's no comparison of alternatives (max kWp vs max kWh vs east-west). | S2 | Layout alternatives generator plus a comparison table. |
| 15 | Overlap and containment aren't asserted anywhere. | S2 | Geometry tests: no overlaps, every module inside the usable polygon. |

### Electrical (`src/electrical.js`)

| # | Finding | Sev. | Fix |
|---|---|---|---|
| 16 | Inverters are generic classes. Module datasheet values are typical but **not tied to a named product**. | S2 | Equipment library with manufacturer, model and datasheet source per entry; generic entries labelled "generic". |
| 17 | Inverter AC rating isn't used in the energy simulation (no clipping). | S1 | Feed the chosen inverter's AC rating into the hourly model. |

### Finance (`src/finance.js`, `src/survey/sizing.js`, `src/presets.js`)

| # | Finding | Sev. | Fix |
|---|---|---|---|
| 18 | Subsidy figures (PM Surya Ghar ₹30k/₹18k, RWA ₹18k/kW) are **hardcoded** in code. | S1 | An incentives table with value, scope, source URL and "as of" date, editable by the user. |
| 19 | Place presets carry installed cost, tariff and grid CO₂ factor with no source or date. | S2 | Label them as editable assumptions with source and date; show them in the report's assumptions. |
| 20 | Self-consumption is computed hourly against a synthetic load profile, but solar uses a clear-sky shape scaled monthly. | S2 | Use the hourly TMY simulation output directly. |
| 21 | No discounted payback, no scenarios (conservative / base / optimistic), no sensitivity. | S2 | Add them. |
| 22 | IRR uses bisection on [−99 %, 100 %] and returns null with no sign change. Fine, but undocumented. | S3 | Tests and registry entry. |

### UX

| # | Finding | Sev. | Fix |
|---|---|---|---|
| 23 | Metric labels have no "how is this calculated" explanation. | S2 | A calculation registry, with an ⓘ tooltip on each metric showing its formula and units. |
| 24 | The right panel has five tabs and grows long; there's no bottom analytics panel for charts. | S3 | A collapsible bottom analytics dock (hourly curve, monthly, losses, cash flow, heat-map). |
| 25 | The workflow isn't shown (location → site → equipment → layout → shading → simulation → finance → report). | S3 | A workflow stepper in the header with completion state. |
| 26 | Only one autosave target (share link); no undo outside click-to-install. | S3 | Params history (undo/redo) and an autosave draft in localStorage. |
| 27 | No demo projects. | S3 | Five labelled demo projects (India home, Rajasthan warehouse, textile factory, UK rooftop, ground farm). |

### Engineering hygiene

| # | Finding | Sev. | Fix |
|---|---|---|---|
| 28 | **No automated tests.** | S1 | Vitest unit tests for the engine, plus reference fixtures generated with pvlib (`validation/`). |
| 29 | No docs on methodology or limits. | S2 | `CALCULATION_METHODOLOGY.md`, `VALIDATION_REPORT.md`, `KNOWN_LIMITATIONS.md`, `ARCHITECTURE.md`. |
| 30 | All external APIs are called from the browser with no rate limiting; PVGIS has no CORS. | S2 | A small Worker route `/api/pvgis` with edge caching (no keys needed), and a Vite dev proxy for local work. |

## 3. Priorities

1. Engine accuracy (1–8, 17, 20), validated against pvlib on identical inputs and benchmarked against PVWatts V8 and PVGIS.
2. Registry, tooltips, configurable incentives (18, 19, 23), scenarios (21).
3. Shading upgrades (9, 11), layout alternatives and geometry tests (14, 15).
4. UX: analytics dock, workflow stepper, demo projects, undo/autosave (24–27).
5. Equipment library with sourced datasheets (16).
