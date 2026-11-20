# Competitor analysis

Research dates: 23–25 Oct 2026 (ARKA 360, OpenSolar, Aurora, HelioScope, PV\*SOL, SolarEdge Designer, Solar Ladder;
see [COMPETITORS.md](COMPETITORS.md) and [GAPS-AND-PLAN.md](GAPS-AND-PLAN.md)) and 20 Nov 2026 (PVsyst, PVcase,
RatedPower, Scanifly, Pylon, SolarTechy). Sources are vendor sites, help centres, public webinars and third-party
reviews; competitor-written comparisons are flagged. Nothing was benchmarked hands-on: these are documented
capabilities, not measured accuracy.

**SolarTechy** (solartechy.com) is an online solar equipment shop (a Shopify store), not design software, so it's
left out of the matrix.

## 1. Feature matrix

● full · ◐ partial or basic · ○ none or not documented. "SunPlot" means this branch after the upgrade.

| Capability | Aurora | OpenSolar | HelioScope | PVsyst | ARKA 360 | PVcase | PV\*SOL | RatedPower | Scanifly | SolarEdge Des. | Pylon | **SunPlot** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Segment | Resi/C&I sales | Resi sales | C&I | Engineering, all | Resi/C&I India | C&I + utility (CAD) | Engineering, resi/C&I | Utility | Resi/C&I survey | Resi/C&I (SE kit) | Resi sales (AU) | Resi/C&I/campus, India-first |
| Price | Enterprise | Free core | ~$159/mo | Desktop licence | ₹56k–1.1L/yr | Subscription | Desktop licence | Enterprise | Subscription | Free | ~$4/project | **Free, open source** |
| 3-D site model | ● (AI, LiDAR, drone) | ● | ◐ 2.5-D | ● 3-D scene | ● | ● CAD | ● | ● terrain | ● drone photogrammetry | ● | ● | ● parametric + satellite outline |
| Satellite / imagery | ● paid | ● marketplace | ● | ○ | ● Google | ◐ CAD import | ◐ | ● | ● drone | ● | ● | ● Esri + Overture outlines |
| Auto layout | ● AI | ● "Ada" | ● | ◐ | ● | ● | ● | ● | ● | ● | ● | ● with alternatives |
| Hourly simulation | ● | ● | ● | ● (sub-hourly) | ● | via Yield/PVsyst | ● | ● | ● | ● | ● | ● 8,760 h TMY |
| Transposition / temp. model | Perez, SAPM-type | — | Perez, SAPM | Perez/Hay, Faiman | — | — | Perez/Hay | — | — | — | — | **Perez, SAPM thermal (validated vs pvlib)** |
| Ray-cast shading | ● | ● | ● | ● 3-D | ● | ● sub-module | ● 3-D | ● 3-D ray-traced | ● viewshed | ● | ● | ● per module + sky view |
| Electrical (bypass / mismatch) | ◐ | ◐ | ● | ● | ◐ | ● | ● | ● | ○ | ● optimiser | ○ | ◐ section approximation |
| Strings, SLD, BOM | ● | ● | ● | ◐ | ● | ● | ● | ● | ● plan sets | ● | ◐ | ● |
| Battery / load profiles | ● | ● | ○ | ● | ● | ○ | ● | ● BESS | ○ | ◐ | ● | ◐ backup sizing + hourly load match |
| Financial model | ● US-centric | ● | ◐ | ◐ | ● | ◐ CAPEX | ● | ● LCOE/CAPEX | ◐ | ● | ● | ● India/UK/intl, RESCO, AD, scenarios |
| Proposal / report | ● | ● | ● | ● engineering report | ● | ● | ● | ● | ● | ● | ● | ● branded PDF + methodology |
| CRM / e-sign / payments | ● | ● | ○ | ○ | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ (Phase B) |
| Public methodology & validation | ◐ papers | ○ | ◐ (vs PVsyst) | ● docs | ○ | ○ | ● docs | ◐ (vs PVsyst) | ◐ | ◐ DNV | ○ | **● open code + validation report** |

## 2. UI/UX notes

- **Aurora**: a large canvas with a left tool rail and a right properties panel, plus separate Design / Sales modes. It's the
  model for SunPlot's layout (workspace + collapsible rails + bottom analytics), without copying its look.
- **PVsyst**: dense dialogs, but every loss is traceable in the loss diagram, which is the model for SunPlot's loss waterfall
  and calculation registry.
- **HelioScope**: simple "field segment" drawing on imagery and fast iteration for C&I. SunPlot borrows the
  setback/keep-out visualisation and side-by-side layout comparison.
- **ARKA 360**: Indian workflows (PM Surya Ghar, DCR, RCC/sheet roofs, ₹ pricing). It's the reference for SunPlot's India
  defaults and report sections.
- **OpenSolar**: an end-to-end customer flow (design → proposal → sign → pay). SunPlot covers design → proposal →
  customer link; payments and CRM are out of scope for a free static app.
- **RatedPower / PVcase**: utility-scale CAD round-trips and CAPEX/LCOE templates. SunPlot's ground-mount mode stays
  indicative, not a utility engineering tool.
- **Scanifly**: drone photogrammetry plus a hemispherical viewshed (the SunEye method). SunPlot's sky-view factor per
  module is the same idea, from geometry.
- **Pylon**: per-project pricing and quick proposals for Australian installers.

## 3. Science comparison

- The **simulation chain** of the professional tools: solar position, then decomposition and transposition (Perez or
  Hay–Davies), then AOI/IAM, then cell temperature (SAPM, Faiman or PVsyst's U-values), then a DC model (PVWatts or
  single-diode), then inverter efficiency and clipping, then losses. SunPlot now implements this chain hour by hour, and
  each step is checked against pvlib on identical inputs ([VALIDATION_REPORT.md](VALIDATION_REPORT.md)).
- **Single-diode (CEC/De Soto)** mode and sub-hourly clipping correction are in PVsyst, PV\*SOL and PVcase Yield but not
  in SunPlot, which uses PVWatts DC. This is documented in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
- **Electrical shading**: PVsyst and PVcase model sub-module and bypass-diode effects. SunPlot approximates it with three
  bypass sections per module.

## 4. Gaps that remain (after this upgrade)

1. Single-diode engineering mode with a CEC module database, and inverter efficiency curves (CEC). Partial: the PVWatts
   inverter curve is implemented.
2. LiDAR / DSM-based roof reconstruction (Aurora, Google Solar API). The Google Solar API is paid and keyed, so it's
   documented as an optional integration rather than a default.
3. Bifacial and tracker yield (PVsyst, RatedPower).
4. CRM, e-sign and payments (OpenSolar, ARKA 360, Pylon, Solar Ladder).
5. Drone photogrammetry (Scanifly).

## 5. Where SunPlot differentiates

- **Free and open, with published methods and validation**: no other tool here publishes code and test cases.
- **India-first and campus-aware**: public-building search, PM Surya Ghar and housing-society subsidy, RESCO tariffs,
  DG sync and metal-shed modelling in one free tool.
- **Measured climate variability**: a TMY hourly simulation plus a ten-year NASA spread for P90.

## Sources

- https://www.sandia.gov/app/uploads/sites/243/dlm_uploads/2024/05/UpdatesPVsyst_SplitAnimations.pdf
- https://energy.sandia.gov/wp-content/gallery/uploads/Mermoud_PVSyst_Thu-840-am.pdf
- https://pvcase.com/roof-mount, https://pvcase.com/blog/pvcase-releases-pvcase-roof-mount-a-tool-for-modeling-commercial-and-industrial-rooftop-solar-systems-with-precision
- https://ratedpower.com/pvdesign, https://cordis.europa.eu/project/id/874144/reporting
- https://scanifly.com/, https://scanifly.com/blog/what-is-photogrammetry-solar-design/
- https://www.capterra.com.au/software/217697/pylon, https://sourceforge.net/software/product/Pylon-Solar
- https://solartechy.com/ (fetched 20 Nov 2026: online store)
- Earlier sources in COMPETITORS.md and GAPS-AND-PLAN.md
