# Architecture

SunPlot is a single-page React app. All design, simulation and finance run in the browser. A small Cloudflare Worker proxies the one data source that has no CORS (PVGIS) and serves the static build.

```
Browser
 ├─ UI (React 19)            src/ui/*, src/App.jsx, src/survey/*
 ├─ State (zustand)          src/store.js   params · install · hourly · shading · survey · layers
 ├─ History / autosave       src/history.js (undo/redo of params, localStorage autosave)
 ├─ 3D view (R3F / three)    src/scene/*    instanced modules, racking, buildings, sun, weather
 ├─ Layout                   src/layout.js  site → arrays, module positions, keep-outs, notes
 ├─ Shading                  src/shading.worker.js  ray cast per module (Web Worker)
 ├─ Engine                   src/engine/*
 │    spa.js         NREL SPA sun position          clock.js   site clock, IANA zones, DST
 │    irradiance.js  Perez / Hay–Davies / isotropic  pvmodel.js IAM, SAPM, PVWatts DC & inverter
 │    weather.js     PVGIS TMY / NASA POWER loaders, cache, quality checks
 │    simulate.js    hourly chain, loss waterfall, sun-series cache
 │    registry.js    every metric: formula, units, source (shown in ⓘ popovers)
 ├─ Electrical               src/electrical.js  strings, inverters, cables, BOM
 ├─ Finance                  src/finance.js     cash flows, IRR/NPV/LCOE, scenarios, sensitivity, RESCO
 ├─ Options                  src/alternatives.js layout variants through the hourly engine
 └─ Exports                  src/exports.js, src/report.js  PDF, CSV, JSON, DXF, glTF, video

Cloudflare Worker (worker/index.js)
 ├─ /api/pvgis/{tmy|PVcalc|printhorizon}  validated proxy to re.jrc.ec.europa.eu, 30-day edge cache
 └─ everything else → static assets (dist/)
```

## Data flow

1. `params` (one flat object) describes the design. It is encoded in the URL hash (`src/links.js`) for sharing.
2. `useCandidates` / `useLayout` → `computeLayout(params)`, memoised on a design key that skips view-only keys.
3. `useHourlyWeatherFetch` loads PVGIS and NASA in parallel when the site moves. NASA arrives first; the PVGIS TMY replaces it when ready. Both are cached in localStorage per provider and location.
4. `useShadingStudy` sends the scene to the worker, which returns per-array monthly beam loss.
5. `useYield` → `simulate()`. Sun positions are cached per weather file and site, so re-simulating a design change takes about 4 ms (55 ms the first time).
6. `useEngineering` → electrical design, load matching (hourly generation shifted to local time), finance, scenarios and sensitivity.

## Performance

- Module meshes are instanced: one draw call per array material.
- The ray cast runs in a Web Worker.
- The sun series is cached, so layout options (8–12 variants) simulate in about 80 ms.
- Heavy exporters (PDF, glTF, video) are dynamic imports.

## External services

| Service | Used for | Key | CORS |
|---|---|---|---|
| PVGIS 5.3 (EU JRC) | TMY hourly weather, horizon | none | no → `/api/pvgis` proxy |
| NASA POWER | hourly year, 10-year monthly climate, albedo | none | yes, direct |
| OpenStreetMap / Overpass, Overture | building outlines, places | none | yes |
| Map tiles (MapLibre style) | survey map | none | yes |
| NREL PVWatts V8 | **validation scripts only** | `NREL_API_KEY` (env, never in frontend) | n/a |

No API keys are shipped in the frontend. There is no paid infrastructure: the Cloudflare Workers free tier is enough.

## Environment and deploy

- `npm run dev`: Vite on :5173. Its `/api/pvgis` proxy strips browser headers, because the PVGIS WAF rejects them.
- `npm test`: Vitest (tests/).
- `npm run build`, then `npx wrangler deploy`: needs Node 22. `wrangler.jsonc` sets `main: worker/index.js` with an `ASSETS` binding and `run_worker_first: ["/api/*"]`.
- Validation (Python): `python3 -m venv validation/.venv && validation/.venv/bin/pip install -r validation/requirements.txt`, then:
  - `npm run validate:reference` (pvlib fixtures)
  - `validation/.venv/bin/python validation/benchmarks.py`
  - `NREL_API_KEY=… validation/.venv/bin/python validation/pvwatts_same_weather.py`

Environment variables (validation only): `NREL_API_KEY`, optional; the DEMO_KEY is rate-limited.
