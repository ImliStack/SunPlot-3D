# Known limitations

SunPlot produces concept and pre-feasibility designs. It is not a bankable energy yield assessment or a stamped engineering design. Here is what it does not do, or does only approximately.

## Energy

- **Shading.** Obstruction shading is ray-cast per module centre for beam light, as a monthly fraction per array. Not modelled:
  - partial shading within a module and bypass-diode behaviour (electrical mismatch from a shaded cell string)
  - per-module sky-view loss of diffuse light
  - terrain and far horizon (PVGIS can supply a horizon profile, but it is not applied yet)

  Expect real losses to exceed the figure shown wherever shade falls on part of a string.
- **Layout options** are compared without obstruction shading. Rows are spaced for winter-solstice noon. Applying an option re-runs the ray cast.
- **Bifacial gain** is not modelled. Bifacial modules are simulated as monofacial, which is conservative.
- **Spectral and low-light effects** are not modelled beyond PVWatts DC, which is linear in irradiance with a temperature coefficient.
- **No single-diode module model yet.** The CEC/De Soto parameters are stored in the equipment library, but the simulation uses PVWatts DC.
- **Soiling** uses a Kimber-style accumulation and rain-reset model with generic rates. Dust storms, bird droppings and local industry are not represented.
- **P90** reflects only the year-to-year spread in GHI, from ten NASA POWER years. It leaves out model and data uncertainty, which add a few percent.
- **Against PVWatts V8** on identical weather, SunPlot is +1.8 to +3.1 % (2 sites so far; 4 pending). See `VALIDATION_REPORT.md`.

## Weather

- **PVGIS TMY** takes about 55 s the first time, through the `/api/pvgis` proxy. NASA POWER hourly (a single recent year, not a TMY) is shown in the meantime and labelled.
- **PVGIS-ERA5** under-estimates irradiance in cloudy mountain regions, for example Quito (−11 % against NSRDB).
- **Coordinates** are rounded to 0.01° for caching.

## Electrical

- String sizing uses record low and high air temperatures from NASA POWER, or a latitude guess before that data loads.
- Inverters in the CEC library are US/UL variants: one MPPT is assumed and the IEC ratings may differ. Automatic sizing uses generic IEC-class inverters.
- Not modelled: cable sizing beyond voltage drop, protection coordination, earthing design, and the utility's interconnection rules.
- **Custom modules.** Vmp and Imp come from typical ratios (0.835 Voc, 0.945 Isc) unless the datasheet values are entered. Weight is estimated.

## Structure

- There is no structural or wind/seismic check. Structure height, the elevated terrace and ballast are geometric only.
- Roof load is shown from module weight; the racking weight is estimated.

## Finance and policy

- Incentives (PM Surya Ghar, accelerated depreciation) are dated and sourced in `src/data/incentives.js`. Schemes change, so check them before quoting.
- Tariffs, escalation, O&M, and the inverter replacement year and cost are user inputs, with illustrative defaults.
- Net-metering and net-billing rules vary by state and DISCOM. Here they are simplified to annual banking, or billing at an export rate.
- Tax is a flat effective rate. Business depreciation is 40 % WDV in year one, without half-year rules.

## Product

- Projects, autosave and history live in this browser's localStorage. There are no accounts, sync or backup.
- Street side and building outlines come from public Overpass servers, which are sometimes busy. If the lookup fails, set the street side by hand.
- Survey obstacles use typical sizes: solar water heater 2.0 × 1.3 × 1.6 m, AC outdoor unit 0.9 × 0.4 × 0.75 m.
- The 3D view needs WebGL 2. On low-end phones, ambient occlusion is turned off.
- Demo projects use illustrative, dated assumptions. They are not real customers.

## Not production-ready yet

Before calling the engine production-ready:

1. Run the four remaining PVWatts same-weather sites.
2. Add a sub-module shading and bypass-diode model, or clearly cap the use of the shading figure.
3. Run an independent check against a measured system's production data.
