# Implementation summary: engineering engine upgrade

Branch `upgrade/engineering-engine` (not merged into `main`, not deployed).

## What changed

| Area | Before | After |
|---|---|---|
| Sun position | simplified solar-time formula | NREL SPA (pvlib-identical), site clock with IANA zones and DST |
| Weather | NASA POWER monthly means × clear-sky shape | hourly PVGIS 5.3 TMY via Worker proxy, NASA POWER hourly fallback, cache, quality checks |
| Energy model | monthly estimate, fixed PR | hourly: Perez → physical IAM → shading → soiling/snow → SAPM temperature → PVWatts DC → losses → inverter with clipping |
| Validation | none | 0.000 % vs pvlib at 9 sites; PVWatts V8 same-weather +1.8 to +3.1 %; benchmark table vs PVWatts and PVGIS |
| Losses | one PR number | full waterfall that closes to AC, shown per kWh |
| Finance | 25-yr simple payback | lifetime, degradation, O&M rise, inverter replacement, discounted payback, ROI, IRR/NPV/LCOE, P90/P10 scenarios, ±10 % tornado, sourced incentives |
| Equipment | 5 generic modules | + 13 named CEC modules, 20 CEC inverters, custom module (size, power, Voc, Isc, γ) |
| Explanations | none | metric registry: formula, units and source behind every ⓘ |
| Workflow | free-form panels | 8-step workflow stepper with live status, undo/redo (Ctrl/⌘ Z), autosave and restore |
| Analytics | monthly bars | bottom dock: selected day, year heat map, daily, generation vs use, temperature |
| Layout | one layout per input set | layout options (tilts, east-west, roof faces, orientation, table size) simulated and applied in one click |
| 3D interaction | left-click install tools | right-click menu: module info and add/remove module, row or array; views, layers, sun, image, undo |
| Structures | fixed rack height | structure height for flat and terrace racks |
| Exports | clear-sky-shaped hourly CSV | the simulation itself as 8760 h CSV (UTC + local), project JSON export/import |
| Demos | none | 5 labelled demo projects (home, warehouse, textile mill, London office, utility farm) |

## Tests

204 tests (200 run, 4 skipped pending PVWatts fixtures):

| Suite | Tests |
|---|---|
| SPA | 22 |
| simulation vs pvlib | 63 |
| finance | 31 |
| geometry | geometry and layout tests |
| electrical | electrical tests |
| alternatives / exports | 5 |
| PVWatts | 2 run + 4 pending |

## Documents

- `PRODUCT_AUDIT.md`
- `COMPETITOR_ANALYSIS.md`
- `CALCULATION_METHODOLOGY.md`
- `VALIDATION_REPORT.md`
- `ARCHITECTURE.md` (also covers the API and environment)
- `KNOWN_LIMITATIONS.md`
- this file

Before-screenshots are in `docs/before/`.

## Not done yet

- Sub-module shading with a bypass-diode model, a sky-view factor and a terrain horizon
- Hourly battery dispatch
- A single-diode (CEC) engineering mode
- The PDF report has not been extended with the methodology, assumptions and scenarios sections
- White-label configuration
- PVWatts same-weather fixtures for 4 sites (rate limit)
- After-screenshots for the README
