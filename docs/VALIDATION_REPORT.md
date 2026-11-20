# Validation report

Date: 20 Nov 2026 · branch `upgrade/engineering-engine` · engine in `src/engine/`

Everything below is reproduced by `npm test` (204 tests: 200 run, 4 skipped while PVWatts fixtures for four sites are not yet downloaded) and the scripts in `validation/`. No figure here was adjusted by hand.

## Summary

| Check | Reference | Result | Tolerance in tests |
|---|---|---|---|
| Sun position (SPA) | NREL SPA report example (Reda & Andreas 2008, Table A4.1) | zenith and azimuth within 1e-4° | 1e-4° |
| Sun position, 9 sites × 8760 h | pvlib 0.11.2 `spa_python` | max difference < 0.001° | 0.001° |
| Sunrise, transit | pvlib | within seconds | 60 s |
| Sunset | NREL report A.2 interpolated value | 1.5 min apart (see note) | elevation check |
| Hourly chain, 9 sites | pvlib 0.11.2, same PVGIS TMY, same models | annual AC 0.000 %, worst month 0.000 %, POA ≤ 0.002 W/m², Tcell ≤ 0.001 °C | 0.1 % / 0.5 % / 1 W/m² / 0.05 °C |
| Model only | NREL PVWatts V8 (8.5.0), PVWatts' own NSRDB weather | POA +0.7 to +1.4 %, AC +1.8 to +3.1 % | 1.5 % / 3.5 % |
| Whole pipeline | PVWatts V8 and PVGIS PVcalc, each with its own data | see benchmark table | reported, not asserted |
| Energy bookkeeping | internal | hourly = daily = monthly = annual; loss waterfall closes to < 0.1 % | exact |

## 1. Solar position

`src/engine/spa.js` implements the NREL Solar Position Algorithm. Its periodic-term tables are generated from pvlib (`src/engine/spaTables.js`). ΔT uses the Espenak–Meeus polynomials, and refraction uses the pressure from `alt2pres` at the site elevation.

- **NREL example** (17 Oct 2003 12:30:30 −7 h, 39.742476 N, 105.1786 W, 1830.14 m): zenith 50.11162°, azimuth 194.34024°. Matches the report to within 1e-4°.
- **pvlib**: for 9 sites over a full year, the largest difference is below 0.001°.
- **Sunset note**: the report's sunset (A.2) comes from interpolating over three days. SunPlot computes the instantaneous moment the sun's upper limb crosses −0.8333°, as pvlib does. The two differ by 1.5 min. At SunPlot's sunset the test checks that the refracted elevation is −0.8333° ± 0.01°.

Tests: `tests/spa.test.js` (22).

## 2. Hourly simulation against pvlib (implementation check)

`validation/reference.py` runs pvlib 0.11.2 on the same PVGIS TMY file with the same model choices:

- Spencer extraterrestrial irradiance and Kasten–Young air mass
- Perez 1990 transposition with the allsitescomposite1990 coefficients
- Physical IAM on beam light
- SAPM cell temperature (open rack, glass/polymer)
- PVWatts DC with γ = −0.35 %/°C
- 9.61 % system losses
- PVWatts inverter (η 0.96, 8.33 kW AC on 10 kWp DC)

Because the inputs and models are identical, any difference is an implementation error.

| Site | Lat, lon | Tilt / azimuth | pvlib kWh | SunPlot kWh | Annual Δ | Worst month Δ | POA Δ | Max hourly POA Δ (W/m²) | Max Tcell Δ (°C) |
|---|---|---|---|---|---|---|---|---|---|
| Ahmedabad | 23.03, 72.58 | 23° / 180° | 16921.2 | 16921.2 | 0.000 % | 0.000 % | 0.000 % | 0.002 | 0.000 |
| Ajmer | 26.45, 74.64 | 26° / 180° | 17872.5 | 17872.5 | 0.000 % | 0.000 % | 0.000 % | 0.002 | 0.000 |
| Bengaluru | 12.97, 77.59 | 13° / 180° | 16148.6 | 16148.6 | 0.000 % | 0.000 % | 0.000 % | 0.001 | 0.000 |
| Dubai | 25.20, 55.27 | 25° / 180° | 18307.0 | 18307.0 | 0.000 % | 0.000 % | 0.000 % | 0.001 | 0.000 |
| London | 51.51, −0.13 | 40° / 180° | 10588.4 | 10588.4 | 0.000 % | 0.000 % | 0.000 % | 0.001 | 0.000 |
| Mumbai | 19.08, 72.88 | 19° / 180° | 16309.0 | 16309.0 | 0.000 % | 0.000 % | 0.000 % | 0.002 | 0.000 |
| Quito | −0.18, −78.47 | 0° / 0° | 14278.1 | 14278.1 | 0.000 % | 0.000 % | 0.000 % | 0.001 | 0.000 |
| Sydney | −33.87, 151.21 | 34° / 0° | 16369.9 | 16369.8 | 0.000 % | 0.000 % | 0.000 % | 0.002 | 0.000 |
| Tromsø | 69.65, 18.96 | 40° / 180° | 7535.5 | 7535.5 | 0.000 % | 0.000 % | 0.000 % | 0.001 | 0.000 |

These sites cover both hemispheres, the equator (a flat array at Quito), high latitude with midnight sun and polar night (Tromsø), desert, monsoon and maritime climates.

Tests: `tests/simulate.test.js` (63).

## 3. PVWatts V8 on its own weather (model check)

`validation/pvwatts_same_weather.py` downloads PVWatts V8 hourly output. That output includes the NSRDB TMY beam, diffuse, temperature and wind PVWatts used. `tests/pvwatts.test.js` then runs SunPlot on exactly that weather: 10 kWp, DC/AC 1.2, η 96 %, 9.85 % losses, open rack, γ −0.37 %/°C, no soiling. What remains is model difference.

| Site | POA SunPlot / PVWatts (kWh/m²) | Δ | AC SunPlot / PVWatts (kWh) | Δ | Hourly POA RMSE | Mean ΔTcell (POA > 200) |
|---|---|---|---|---|---|---|
| Ajmer | 2283 / 2252 | +1.38 % | 17633 / 17105 | +3.09 % | 8.6 W/m² | +0.19 °C |
| Mumbai | 2144 / 2128 | +0.71 % | 16761 / 16470 | +1.77 % | 5.9 W/m² | +2.43 °C |

Notes:

- **Time zone of the PVWatts file.** PVWatts returned no time zone for these NSRDB Meteosat files. Whole-hour UTC+5 timestamps fit the hourly POA far better than UTC+5:30: RMSE 6–9 W/m² against 34–38 W/m². The test therefore uses UTC+5, with the reason recorded in the test.
- **POA.** The remaining +0.7 to +1.4 % comes from implementation details of the Perez transposition and the horizon brightening. With Hay–Davies, SunPlot's POA lands within 0.3 % of PVWatts.
- **AC.** The AC gap is bigger than the POA gap. That fits PVWatts applying its own reflection and temperature models, and its cell temperature model (the Fuentes heat-balance model, not SAPM) runs warmer in humid, low-wind Mumbai.
- **Interpretation.** SunPlot is about 2–3 % above PVWatts here. That is inside the usual ±5 % spread between established tools. It is reported, not tuned away.
- **Coverage.** London, Dubai, Sydney and Tromsø are skipped until their fixtures download, because the PVWatts DEMO_KEY is rate-limited. To run them: `NREL_API_KEY=… validation/.venv/bin/python validation/pvwatts_same_weather.py`.

## 4. Whole-pipeline benchmarks (each tool on its own data)

10 kWp, DC/AC 1.2, equator-facing, tilt ≈ |latitude|. Annual AC kWh. `validation/benchmarks.py` → `validation/fixtures/benchmarks.json`.

| Site | SunPlot (PVGIS TMY) | PVWatts V8 (NSRDB TMY) | PVGIS PVcalc (its own loss model) |
|---|---|---|---|
| Ahmedabad | 16921 | 16345 | 15839 |
| Ajmer | 17873 | 17105 | 16597 |
| Bengaluru | 16149 | 15991 | 15250 |
| Dubai | 18307 | 17949 | 17242 |
| London | 10588 | 9450 | 10283 |
| Mumbai | 16309 | 16470 | 15282 |
| Quito | 14278 | 16007 | 13261 |
| Sydney | 16370 | 15799 | 15694 |
| Tromsø | 7535 | 6756 | 7316 |

These differences are mostly weather data: PVGIS-ERA5 and SARAH against NSRDB, plus different station distances. Section 3 isolates the model part, which is at most about 3 %.

- **Quito** is the outlier (−11 % against PVWatts). PVGIS-ERA5 is known to under-estimate irradiance in the cloudy Andes.
- **London** is +12 % against PVWatts. NSRDB coverage of Europe is thinner, and PVGIS-SARAH is the stronger dataset there.

## 5. Energy bookkeeping and edge cases

- Hourly AC sums to daily, then monthly, then annual (to 0.01 kWh). Exported CSV rows sum to the annual figure (`tests/alternatives.test.js`).
- Loss waterfall: POA reference minus each loss equals AC (to 0.1 %).
- Edge cases tested:
  - polar night and midnight sun (Tromsø)
  - a flat array on the equator (Quito)
  - the southern hemisphere (Sydney, azimuth 0°)
  - half-hour time zones (IST, Kolkata)
  - DST zones (London)
  - leap years (NASA POWER)
- Weather quality checks: missing hours, negative irradiance, GHI above extraterrestrial, and the GHI = DNI·cosZ + DHI closure.
- Finance (`tests/finance.test.js`, 31 tests): simple and discounted payback, IRR and NPV against hand calculations, degradation, inverter replacement, ToD, net metering versus billing, the RESCO RoE solve, and the scenario and sensitivity ordering.
- Geometry (`tests/geometry.test.js`): no overlapping modules on any site type, terrace containment, custom module size and structure height.

## Status

The engine reproduces pvlib exactly and agrees with PVWatts V8 within about 3 % on identical weather. Whole-pipeline differences against other tools are explained by the weather datasets. The tool is **not** declared production-ready: see `KNOWN_LIMITATIONS.md`, in particular the remaining shading simplifications (no string mismatch or horizon) and the four missing PVWatts sites.
