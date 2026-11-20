# Calculation methodology

How every number in SunPlot 3D is produced. The short form of each metric (formula, units, inputs,
assumptions, source, test) lives in [`src/engine/registry.js`](../src/engine/registry.js) and is shown
in the app through the ⓘ button beside each figure. Validation results are in
[VALIDATION_REPORT.md](VALIDATION_REPORT.md), limits in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

Units: irradiance W/m² (instantaneous), irradiation kWh/m² (energy, after summing hours), power W/kW,
energy kWh/MWh, angles in degrees, azimuth clockwise from true north, temperature °C.

## 1. Time and solar position

- **Algorithm.** NREL Solar Position Algorithm (Reda & Andreas 2004, NREL/TP-560-34302), ported line for
  line in [`src/engine/spa.js`](../src/engine/spa.js). The periodic-term tables are generated from pvlib's
  `spa.py`. ΔT uses the Espenak–Meeus polynomials. Atmospheric refraction uses station pressure from
  elevation (`alt2pres`) and 12 °C, as pvlib does.
- **Outputs.** True and apparent zenith and elevation, azimuth, declination, right ascension, hour angle,
  equation of time, Earth–Sun distance. Sunrise, solar noon and sunset (`sunTimes`) are the instants the
  full SPA puts the sun's centre at −0.8333°. Shadow direction and length for a vertical object are in `shadow()`.
- **Clock time.** The sun bar shows local clock time. [`engine/clock.js`](../src/engine/clock.js) converts
  it to UTC: the IANA zone with DST when known (place search, presets), Asia/Kolkata for Indian coordinates,
  and otherwise a whole-hour offset from longitude, labelled "approximate". The 3-D light, sun path, play
  clock, shading worker and simulation all call the SPA on the same UTC instant.

## 2. Weather

| Source | What | Time convention | Use |
|---|---|---|---|
| PVGIS v5.3 TMY (EC JRC) | Hourly GHI, DNI, DHI, T2m, WS10m. PVGIS-SARAH3 satellite where covered (Europe, Africa, parts of Asia), ERA5 reanalysis elsewhere (most of India) | UTC; `irradiance_time_offset` (0.5 h) gives the sun-position instant | Preferred basis for the annual estimate |
| NASA POWER hourly (CERES SYN1deg + MERRA-2) | Last complete calendar year, same variables + albedo | UTC, hourly means: sun position at hh:30 | Shown first while the TMY computes; fallback if PVGIS is down |
| NASA POWER monthly, 10 years | GHI, temperature extremes, rain, snow | monthly | Inter-annual spread (P90), soiling and snow rules, string temperature limits |

- TMY months come from different years; they're mapped onto the non-leap reference year 2023 for sun
  position. NASA historical years keep 29 February.
- **Quality checks** ([`weather.js`](../src/engine/weather.js) `qualityChecks`): missing values, negative
  irradiance, GHI above 1.2 × extraterrestrial, and closure GHI ≈ DNI·cos z + DHI (±8 % + 25 W/m²) on hours
  with the sun above 10°. Failures are shown in the app, not hidden.
- **Caching.** The browser caches each weather file per location and provider, and the Worker caches PVGIS
  responses at the edge for 30 days. Invented values are never used: if both providers fail, the app says so
  and shows a labelled monthly estimate instead of the simulation.

## 3. Irradiance on the array

[`src/engine/irradiance.js`](../src/engine/irradiance.js), each function mirroring pvlib 0.11:

1. Extraterrestrial normal irradiance, Spencer (1971), solar constant 1366.1 W/m².
2. Relative air mass, Kasten & Young (1989), using the apparent zenith.
3. Beam on the plane: DNI × max(0, cos θ).
4. Sky diffuse: **Perez et al. (1990)**, "allsitescomposite1990" coefficients (default). Hay–Davies and
   isotropic are also available.
5. Ground-reflected: GHI × albedo × (1 − cos β)/2. Albedo comes from NASA POWER where available, otherwise 0.2.
6. Plane-of-array irradiance = beam + sky diffuse + ground.

## 4. Optics, shading, soiling, snow

- **Angle-of-incidence loss.** The physical Fresnel + absorption model (De Soto 2006; n = 1.526,
  K = 4 m⁻¹, L = 2 mm, as in PVWatts), applied to beam irradiance. Diffuse is not modified, matching
  pvlib's PVWatts model chain.
- **Shading.** A Web Worker ray-casts from every module centre towards the sun at half-hour steps on each
  mid-month day (SPA sun). Blockers are other modules, roof planes, parapets, obstacles (stair rooms,
  tanks, HVAC, vents), neighbouring buildings and trees, and samples are weighted by clear-sky beam. The
  result is a monthly beam-loss fraction per array, which the hourly engine applies to beam irradiance.
  This is a geometric (irradiance) loss; electrical mismatch from partial shading is not modelled (see limitations).
- **Soiling** (Kimber-style). Dust builds up at a dryness-dependent rate (0.30, 0.20 or 0.12 %/day for
  < 300, < 800 or ≥ 800 mm of rain a year). Each 10 mm of monthly rain or the cleaning interval resets it,
  and the monthly loss is the average over the cycle, averaged over ten NASA years. Until rain data loads,
  the PVWatts default of 2 % is used and labelled.
- **Snow.** Each ~8 mm (water equivalent) of snowfall buries the modules for 0.5 + 3·(1 − tilt/60) days,
  halved when daily highs exceed 5 °C. This is an empirical rule that matters only for snowy sites.

## 5. Temperature and power

- **Cell temperature.** Sandia Array Performance Model thermal model (King et al. 2004):
  T_module = E·exp(a + b·WS) + T_air, then T_cell = T_module + (E/1000)·ΔT. Mount classes:
  - Open rack, glass/polymer (racks, ground, carports, elevated terraces): a = −3.56, b = −0.075, ΔT = 3.
  - Close roof mount, glass/glass (flush pitched roofs, metal sheds): a = −2.98, b = −0.0471, ΔT = 1.
  - Insulated back (solar tiles): a = −2.81, b = −0.0455, ΔT = 0.

  The model distinguishes module (back-surface) from cell temperature, and E is the POA before optical losses.
- **DC power.** The PVWatts model: P_dc = P_STC × (E_eff/1000) × [1 + γ(T_cell − 25)], with γ from the
  module datasheet (e.g. −0.30 %/°C TOPCon, −0.35 %/°C PERC).
- **System losses.** Combined as 1 − Π(1 − Lᵢ) with PVWatts V8 defaults: mismatch 2, wiring 2,
  connections 0.5, LID 1.5, nameplate 1, availability 3 %, which gives 9.85 %. Shading, soiling and snow are
  modelled separately instead of PVWatts' flat 3 % / 2 % / 0 %.
- **Inverter.** PVWatts part-load curve (Dobos 2014): η = (η_nom/η_ref)(−0.0162ζ − 0.0059/ζ + 0.9858),
  η_nom = 0.96, η_ref = 0.9637. The AC limit is the chosen inverters' rated AC power, and anything above it
  is clipped and reported.
- **Aggregation.** Each hour's AC power × 1 h gives the hour's energy. Daily, monthly and annual totals are
  sums of the same hourly values; tests assert they reconcile.

## 6. Derived metrics

| Metric | Definition | Boundary |
|---|---|---|
| Specific yield | E_AC,annual ÷ P_DC,STC | AC at the inverter output |
| Reference yield Y_r | Σ H_POA (unshaded) ÷ 1 kW/m² | Plane of array, before shading |
| Performance ratio | Y_f ÷ Y_r (IEC 61724-1) | Shading counts as a loss |
| Capacity factor | E_AC ÷ (P_DC × hours in the weather year) | DC nameplate, stated in the label |
| P90 (1-yr) | P50 × (1 − 1.2816·σ/μ) of ten annual GHI totals | Weather variability only |
| Loss waterfall | POA reference → shading → IAM → soiling → snow → temperature → system → inverter → clipping → AC | Closes to the AC total (tested) |
| Self-consumption | Σ min(PV_h, load_h) ÷ Σ PV_h | Hourly, local clock time |
| Self-sufficiency | Σ min(PV_h, load_h) ÷ Σ load_h | Hourly |

Hourly AC is shifted from UTC to local standard time before matching the load (linear interpolation for
half-hour zones such as IST). Load comes from twelve monthly bills (or an average shaped by season) spread
over days and hours by a typical pattern: home, office, factory 1-shift or 24×7, campus or hospital. These
patterns are typical shapes, not metered data.

## 7. Money

[`src/finance.js`](../src/finance.js), year by year over the project lifetime (default 25):

- **Energy:** E_t = E_1 × (1 − d)^(t−1), with default d = 0.4 %/yr. First-year LID is already inside the
  simulation losses, so it isn't applied twice.
- **Value of a kWh:**
  - *Net metering:* own use up to the annual consumption at the tariff, and the surplus at the export rate.
  - *Net billing:* only the hour-by-hour self-consumed share counts at the tariff.
  - *Gross metering:* everything is sold at the export rate.
  - *Zero export:* the surplus is curtailed and earns nothing.
  - *ToD tariffs:* the tariff is reduced by the solar-hour rebate on the share of generation inside the
    09:00–17:00 window.
- **Costs:** installation (cost per W × W, plus any battery); O&M as a percentage of cost rising 5 %/yr; one
  inverter replacement (default 10 % of cost in year 12); subsidy deducted from the investment.
- **Loan:** EMI = P·r/(1 − (1 + r)^−n), split month by month into interest and principal.
- **Business:** after tax at the company rate. Savings raise taxable profit, interest is deductible, and
  depreciation is 40 % of the written-down value a year (data in `src/data/incentives.js`).
- **Outputs:**
  - Simple and discounted payback, interpolated within the crossing year.
  - NPV = Σ CF_t/(1 + r)^t − investment.
  - IRR by bisection, null if the cash flow never changes sign.
  - LCOE = (investment + PV(O&M + inverter)) ÷ PV(energy).
  - ROI = (Σ net inflows − investment) ÷ investment.
- **Scenarios:**
  - Conservative: P90 energy, cost +10 %, tariff rise −1 point.
  - Optimistic: P10 energy, cost −5 %, tariff rise +1 point.
  - Sensitivity: NPV for ±10 % on energy, cost, tariff, discount rate and O&M.
- **RESCO / PPA:** the flat tariff at which the developer's equity cash flows (energy × tariff − O&M − debt
  service) have zero NPV at the target RoE. KERC 2026–29 norms are the defaults (14 % RoE, 70:30 debt,
  10.8 %, 13 years).
- **Incentives:** stored as data with the rule, source, scheme date and check date, shown next to their use.

## 8. Electrical concept design

[`src/electrical.js`](../src/electrical.js):

- **Inverter:** the class and count with the fewest units at DC:AC 0.8–1.3 (nearest 1.15). These are generic
  classes, flagged as such.
- **Strings:** string Voc at the ten-year record low air temperature (cell = air at dawn) must stay under the
  inverter's maximum DC voltage and MPPT maximum. Vmp at record high air + 30 °C cell rise must stay above
  the MPPT minimum. Current per MPPT is checked against the input limit. Two string lengths (L and L+1) wire
  every module.
- **Cables:** sized by ampacity (≥ 125 % of current) and voltage drop ≤ 1.5 % per side, with copper at
  50 °C (ρ = 0.0193 Ω·mm²/m). Parallel runs are used for heavy feeders, and anything beyond four runs is flagged.
- **Protection:** gPV fuses at 1.56 × Isc where 3+ strings are paralleled, a DC isolator, SPDs, MCB/MCCB at
  125 %, three earth pits plus a lightning arrester (MNRE practice), and DG-PV synchronisation (DG ≥ 30 % loaded).

## 9. Geometry

- Survey outlines are converted from longitude/latitude to a local metric frame (equirectangular about the
  outline's centre; error well under 0.1 % at roof scale) before any geometry. Lat/lon is never treated as Cartesian.
- The layout packs modules row by row on each roof plane or rack row, skipping any slot that touches a
  setback, keep-out, skylight or walkway. Tests check there are no overlaps on every site type and that
  terrace modules stay inside the outline.
- Row pitch keeps the next row unshaded at winter-solstice noon (geometric 90° − |φ| − 23.44°).

## References

- Reda I., Andreas A. (2004) Solar position algorithm for solar radiation applications. *Solar Energy* 76, 577–589; NREL/TP-560-34302.
- Perez R. et al. (1990) Modeling daylight availability and irradiance components from direct and global irradiance. *Solar Energy* 44(5), 271–289.
- Hay J.E., Davies J.A. (1980) Calculations of the solar radiation incident on an inclined surface.
- King D.L., Boyson W.E., Kratochvil J.A. (2004) Photovoltaic Array Performance Model, SAND2004-3535.
- De Soto W., Klein S.A., Beckman W.A. (2006) Improvement and validation of a model for photovoltaic array performance. *Solar Energy* 80, 78–88.
- Dobos A.P. (2014) PVWatts Version 5 Manual, NREL/TP-6A20-62641.
- Holmgren W.F., Hansen C.W., Mikofski M.A. (2018) pvlib python. *JOSS* 3(29), 884 (version 0.11.2 used).
- Huld T., Müller R., Gambardella A. (2012) A new solar radiation database (PVGIS). *Solar Energy* 86, 1803–1815.
- IEC 61724-1:2021 Photovoltaic system performance monitoring. IEC 62548:2023 PV arrays design requirements.
