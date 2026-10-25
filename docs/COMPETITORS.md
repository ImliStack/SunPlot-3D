# SunPlot 3D vs the market

Research date: 23 Oct 2026. Sources: arka360.com (product, pricing, solutions pages), all 143 articles in the
Arka360 help centre (help.arka360.com), two Arka360 LinkedIn posts on the PowerRoof Alpha project, OpenSolar's
features page, Aurora Solar's site, and vendor or third-party pages for HelioScope, PV\*SOL premium 2026 and
SolarEdge Designer. Feature claims come from vendor documentation. Nobody here was benchmarked for accuracy.

## 1. Who we are up against

| Product | Price (Oct 2026) | Where it is strong | What it means for SunPlot |
|---|---|---|---|
| **ARKA 360** (Bengaluru + Texas) | Lite ₹56k/yr (360 projects, ≤25 kW), Basic ₹80k/yr, Premium ₹1.1 L/yr + GST; US $1,699–9,999/yr | Indian installers; 3D model + shade report + proposal in ~20 min; CRM; SLD; stringing; expert design and permit services | Closest competitor for Indian rooftop sales. Customers buy it for the **3D link, shadow analysis and branded proposal** (their testimonials say so). |
| **OpenSolar** | Free core, paid add-ons, imagery and services | Free design + proposal + CRM, auto design ("Ada"), BOM and hardware shop, e-sign and payments, "Built for India" push, Hindi UI | Free kills "cheaper than Arka" as a pitch. Our edge has to be no login, measured climate and the remote survey. |
| **Aurora Solar** | Enterprise (US/EU) | Physics-validated production, Aurora AI roof models, drone maps, financing, contracts, plan sets | Sets the bar for accuracy and automation. Not focused on India. |
| **HelioScope** (Aurora) | From ~$159/licence/month | Commercial and utility layouts, component library, string sizing, PVsyst-aligned yield | Commercial engineering benchmark. |
| **PV\*SOL premium 2026** | Desktop licence | Deep 3D shading, batteries, heat pumps, load profiles per consumer, circuit diagram with meters, Meteonorm 9 | Engineering depth. Not a sales tool. |
| **SolarEdge Designer** | Free (SolarEdge kit only) | Satellite 3D model, auto-stringing to SolarEdge rules, BOM, homeowner proposal | Free but locked to one brand. |

## 2. How Arka360 works (the flow customers learn)

1. **Lead** (CRM): name, email, site address, residential or commercial. Kanban pipeline, tasks, email and
   calendar sync, dashboards (KPI, bar, donut, map and trend widgets).
2. **Lead summary**: activity timeline, site info, **consumption** (monthly bill, spreadsheet interval data,
   Green Button, Utility API; current vs future profile with EV/AC), files, site assessment form, contracts.
3. **Design** (PV, PV + battery, or battery only), several designs per lead, one marked primary.
4. **Design Studio**: Google imagery (or uploaded image when the building is missing). Draw roofs with polygon
   (P), cylinder (C), tree (T), walkways, parapets, turbo vents, skylights, dome or curved sheds, repeat and
   mirror tools, a dimension tool, and AI roof detection (beta). Fill face, add table or add sub-array; east-west
   racking, trackers, mount height, auto row spacing by solar time, 14 named Indian mounting structures.
   Solar access per module (three colours), sun-path animation, string or micro inverters, **manual stringing
   with voltage-window compliance alerts**, **SLD**, **wire-size calculator**, losses editor, weather file
   upload.
5. **Battery tab**: ToU peak offset, self-consumption, partial home backup (essential loads) or full backup.
6. **Pricing & financing**: price per W, adders and discounts, incentives, cash, loans (bullet, mortgage,
   interest-only), lease, PPA; US financier integrations (Sunlight, GoodLeap).
7. **Proposal**: document or web proposal with a clickable 3D model, shading by month and hour, irradiance,
   company and team pages, savings graph with payback and **IRR**, pricing breakdown, **environmental impact**
   (CO₂, trees), FAQs; three themes, brand colours, page toggles, version history, e-sign via DocuSign.
8. **Exports**: report PDF, **CAD layout (.dxf)**, **generation CSV**, SketchUp (STL) and PVsyst (.3ds) scenes,
   **video of the 3D design**.
9. **Services**: preliminary proposals, full construction drawings, permit packages (US AHJ).

**LinkedIn, PowerRoof Alpha:** Arka now designs roof-integrated solar tiles facet by facet, with permit-ready
output and a planned build sequence. They claim **+17.3 % DC capacity and +13 % annual energy** compared with
a rack-mounted system on the same roof.

## 3. Where SunPlot already wins

- **No login, no licence.** Arka Lite alone costs ₹56,000 a year, and SunPlot runs in the browser for free.
- **Remote site survey for India.** Esri satellite imagery, Overture building outlines and heights picked with
  one click (Arka's AI roof detection is still beta), stair room and tank, bill → size, **PM Surya Ghar subsidy
  built in**, roof zones ranked by shade, and now schools, hospitals, malls and petrol pumps.
- **Measured climate.** Ten years of NASA POWER with P50/P90 and soiling, snow and temperature losses.
  Competitors mostly use a single typical year.
- **Ray-cast shading** of every module against trees, rows, neighbours, tanks and parapets.
- **Weather in 3D**, nine ready site types (airport, carport, bus stop, ground), click-to-install by module,
  row or column, and real installations nearby.

## 4. Gaps, ranked

| # | Gap | Who has it | Priority | Status |
|---|---|---|---|---|
| 1 | **Electrical design**: inverter choice, auto-stringing with Voc(cold) / Vmp(hot) / MPPT current checks, DC and AC cable sizing by voltage drop, protection ratings, SLD, BOM | Arka, HelioScope, SolarEdge, OpenSolar, PV\*SOL | High | **Done** (this release) |
| 2 | **Finance**: 25-year cash flow with tariff escalation, degradation, O&M and inverter replacement; loan EMI; IRR, NPV and LCOE; environmental impact (CO₂, trees) | Arka, Aurora, OpenSolar | High | **Done** |
| 3 | **Battery sizing**: backup hours for essential loads, usable kWh, cost | Arka, Aurora, PV\*SOL | High | **Done** |
| 4 | **Exports**: CAD layout (.dxf), generation CSV, 3D model (.glb for SketchUp, Blender and PVsyst), **video of the 3D design** | Arka (paid add-ons) | High | **Done** |
| 5 | **Branded proposal**: company name, phone, colour; electrical, finance and environment pages | Arka, OpenSolar, Aurora | High | **Done** |
| 6 | **Bill input by month** (12 bills, or 1–3 bills scaled) and future load (EV, AC) | Arka | Medium | Partly: monthly use and export rate in the Money tab, carried over from the survey bill; 12-month bills and EV/AC load still to come |
| 7 | **East-west racking** on flat roofs | Arka, HelioScope | Medium | **Done** |
| 8 | **Solar roof tiles (BIPV)**, facet by facet | Arka (PowerRoof) | Medium | **Done**: a tile mode on pitched roofs, compared against rail-mounted modules on the same roof |
| 9 | Projects list: several designs per customer, duplicate, compare | Arka, all | Medium | Not yet: share links only. A saved-projects list is next |
| 10 | CRM, pipeline, tasks, dashboards, e-sign, payments | Arka, OpenSolar, Aurora | Low for now | Needs a backend; still on the roadmap |
| 11 | Trackers (single/dual axis), custom image upload when the building is missing | Arka, HelioScope | Low | Roadmap |
| 12 | Hindi / regional-language UI | OpenSolar (HI) | Low | Roadmap |
| 13 | DISCOM net-metering application pack (India's equivalent of a US permit set) | Arka (US AHJ only) | Medium | Roadmap: a clear opening, since nobody does it for Indian DISCOMs |

## 5. Positioning

Arka sells "a 3D link, a shadow report and a proposal in 20 minutes" for ₹56k–1.1 L a year. With gaps 1–8
closed, SunPlot gives an Indian installer the same deliverables (3D link, shade study, electrical design, SLD,
finance and a branded PDF) **for free and without a site visit**. It also adds measured climate and
public-building search, which no one else offers. The remaining moat for paid tools is workflow: CRM, e-sign,
payments and services. That needs a backend and is the next phase.

## Sources

- https://arka360.com, https://arka360.com/pricing-in, https://arka360.com/solar-design, https://arka360.com/solar-crm
- https://help.arka360.com/en/ (all collections; 143 articles read)
- https://www.linkedin.com/feed/update/urn:li:activity:7506506467198300160/
- https://www.linkedin.com/feed/update/urn:li:activity:7506135293146681344/
- https://www.opensolar.com/, https://aurorasolar.com/
- https://valentin-software.com/en/product-news-blog-en/pvsol-premium-2026-available-now/
- https://www.solarpowerworldonline.com/2020/01/solaredge-expands-features-on-free-commercial-solar-design-tool/
- https://www.heavengreenenergy.com/blog/helioscope-review, https://www.surgepv.com/compare/surgepv-vs-helioscope (competitor-written; read with care)
