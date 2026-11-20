# Validation report

Date: 20 Nov 2026 · branch `upgrade/engineering-engine` · engine in `src/engine/`

Everything below is reproduced by `npm test` (218 tests: 214 run, 4 skipped while PVWatts fixtures for four sites are not yet downloaded) and the scripts in `validation/`. No figure here was adjusted by hand.

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
| Weather consistency | GHI = DNI·cos z + DHI | all 9 files close after the ERA5 beam fix (section 2a) | < 5 % of daytime hours outside ±8 % |
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

| Site | Weather | pvlib kWh | SunPlot kWh | Annual Δ | Worst month Δ | POA Δ | Max hourly POA Δ (W/m²) | Max Tcell Δ (°C) |
|---|---|---|---|---|---|---|---|---|
| Ahmedabad | PVGIS-ERA5 (beam closed) | 16584.5 | 16584.5 | 0.000 % | 0.000 % | 0.000 % | 0.001 | 0.000 |
| Ajmer | PVGIS-ERA5 (beam closed) | 17484.7 | 17484.7 | 0.000 % | 0.000 % | 0.000 % | 0.001 | 0.000 |
| Bengaluru | PVGIS-ERA5 (beam closed) | 15850.6 | 15850.6 | 0.000 % | 0.000 % | 0.000 % | 0.000 | 0.000 |
| Dubai | PVGIS-SARAH3 | 18307.0 | 18307.0 | 0.000 % | 0.000 % | 0.000 % | 0.001 | 0.000 |
| London | PVGIS-SARAH3 | 10588.4 | 10588.4 | 0.000 % | 0.000 % | 0.000 % | 0.001 | 0.000 |
| Mumbai | PVGIS-ERA5 (beam closed) | 15960.6 | 15960.6 | 0.000 % | 0.000 % | 0.000 % | 0.001 | 0.000 |
| Quito | PVGIS-ERA5 (beam closed) | 13930.7 | 13930.7 | 0.000 % | 0.000 % | 0.000 % | 0.000 | 0.000 |
| Sydney | PVGIS-ERA5 (beam closed) | 16063.8 | 16063.8 | 0.000 % | 0.000 % | 0.000 % | 0.001 | 0.000 |
| Tromsø | PVGIS-ERA5 (beam closed) | 7511.1 | 7511.1 | 0.000 % | 0.000 % | 0.000 % | 0.001 | 0.000 |

Arrays face the equator at a tilt of |latitude| (capped at 40°; flat at Quito).

These sites cover both hemispheres, the equator (a flat array at Quito), high latitude with midnight sun and polar night (Tromsø), desert, monsoon and maritime climates.

Tests: `tests/simulate.test.js` (72).

### 2a. ERA5 beam fix (found during validation)

PVGIS-ERA5 files are stamped mid-hour (`irradiance_time_offset` 0.5), but their beam (DNI) only closes with GHI and DHI if the sun is placed at the top of the hour. The median closure error is 5–6 %: offsets of −0.5, 0, 0.5 and 1 h give medians of 6.0, 0.0, 6.3 and 12.1 % at Ajmer. Used as delivered, each hour's beam is paired with a sun position half an hour away. That overstates morning beam and understates afternoon beam, and annual output came out about 2 % high. PVGIS-SARAH3 files (Dubai, London) close to 0.1 % and are unaffected.

The fix is `closeComponents()` in `src/engine/weather.js`. It keeps GHI and DHI, which are the primary quantities, and derives DNI = (GHI − DHI) / cos z at the stated time. It only applies when a file's median closure error exceeds 1 %, and below 5° sun the beam is never increased. NASA POWER hourly goes through the same check. `validation/reference.py` applies the identical rule, so section 2 stays like for like. Effect on annual AC: ERA5 sites −1.9 to −2.4 %, SARAH sites 0.0 %.


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

| Site | SunPlot (PVGIS TMY) | PVWatts V8 (NSRDB TMY) | PVGIS PVcalc (its own loss model) | vs PVWatts | vs PVcalc |
|---|---|---|---|---|---|
| Ahmedabad | 16584 | 16345 | 15839 | +1.5 % | +4.7 % |
| Ajmer | 17485 | 17105 | 16597 | +2.2 % | +5.3 % |
| Bengaluru | 15851 | 15991 | 15250 | −0.9 % | +3.9 % |
| Dubai | 18307 | 17949 | 17242 | +2.0 % | +6.2 % |
| London | 10588 | 9450 | 10283 | +12.0 % | +3.0 % |
| Mumbai | 15961 | 16470 | 15282 | −3.1 % | +4.4 % |
| Quito | 13931 | 16007 | 13261 | −13.0 % | +5.0 % |
| Sydney | 16064 | 15799 | 15694 | +1.7 % | +2.4 % |
| Tromsø | 7511 | 6756 | 7316 | +11.2 % | +2.7 % |

These differences are mostly weather data: PVGIS-ERA5 and SARAH against NSRDB, plus different station distances. Section 3 isolates the model part, which is at most about 3 %.

- **Quito** is the outlier (−13 % against PVWatts). PVGIS-ERA5 is known to under-estimate irradiance in the cloudy Andes.
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
