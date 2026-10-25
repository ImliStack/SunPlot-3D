# What to build next: Arka360 depth, Solar Ladder workflow, and three building segments

Research date: 25 Oct 2026. It builds on [COMPETITORS.md](COMPETITORS.md). Two Indian tools set the bar from opposite
sides:

- **ARKA 360** goes deep on design and simulation. It is an engineering-grade studio.
- **Solar Ladder** (Mumbai, 600+ installers, 70,000+ projects, 85,000+ proposals) handles the business: customers,
  quotes, projects, money and loans. Its design is light.

SunPlot already covers most of Arka's sales-design surface: 3D, shading, electrical, finance, PDF, exports and the
remote survey. It has **none** of Solar Ladder's business layer.

---

## 1. ARKA 360: the design and simulation depth we still lack

| Arka feature | SunPlot today | Gap |
|---|---|---|
| Draw any roof: polygon (P) with typed dimensions, cylinder (C), tree (T), walkways, parapets, dome or curved sheds, repeat and mirror | Nine parametric site types, plus a terrace outline from the survey (draw or pick) | **Free-form roof modelling in the studio**: draw polygons with heights, add obstacles anywhere, multi-level roofs |
| Custom image upload when the building isn't on Google | Esri imagery + Overture outlines | Upload a drone or phone photo as the base map |
| Solar access per module (3 colours) | Shade heat-map per module | Same idea; show it as % in a tooltip and in the PDF |
| Manual stringing (draw strings), micro-inverters, optimisers | Automatic equal strings, string inverters only | Manual string editing, micro-inverter mode |
| Losses editor, weather-file upload | Fixed 14 % system losses, NASA POWER only | Editable loss table; PVGIS / TMY hourly option |
| Trackers (single and dual axis) | Fixed tilt | Single-axis tracker for ground mounts |
| 14 named Indian mounting structures (TPSSL MMS, Unirac RM…) | Generic racks, elevated terrace | A structure library (RCC elevated, ballast, metal-sheet rail, short rail, ground MMS) with kg/kWp and cost |
| Several designs per lead, mark one primary, duplicate | One design per URL | **Designs list per project** |
| ToU battery dispatch, partial or full backup | Backup kWh sizing | ToU / self-consumption dispatch |
| Web proposal with a clickable 3D model | PDF + share link to the app | A **read-only customer view** of the share link (no editing panels) |
| AI roof detection (beta) | Overture outlines already work in one click | We're ahead here |

## 2. Solar Ladder: the business layer

What it does, from its site, app guide and third-party reviews:

| Module | What it does |
|---|---|
| **CRM** | Leads from IndiaMart, Google Forms and Zoho; pipeline through to DISCOM stages; replaces Excel and paper |
| **Proposals** | Branded quote "in under 2 minutes", in INR, with BOM and commercials, shared on the spot |
| **Design** | Simple 3D in ~2 minutes with a 360° preview, mostly for selling |
| **Tasks** | Reminders, Google Calendar sync, daily follow-up emails |
| **Project management** | Solar-specific stages and templates (survey → design → approval → install → net meter → commissioning) with reports |
| **Books** | Inventory, costing, expenses, invoicing, and "true profit" per project |
| **O&M** | Cleaning and maintenance schedules and tickets after commissioning |
| **Site survey forms** | Plug-and-play field forms on a mobile app |
| **Customer dashboard** | Homeowners follow their project's progress |
| **Procurement** | Buy panels, inverters and BOS through Solar Ladder (35+ MW procured) |
| **Finance** | Collateral-free rooftop loans (residential, commercial, housing society, working capital), EMI calculator, document checklist, 24–48 h approval |
| **Mobile app** | Field-first and offline-tolerant |

Reviewers say its **engineering is light**: basic shading, no electrical design, partial BOQ. That's exactly where
SunPlot is strong. The opportunity is **Arka's depth + Solar Ladder's workflow, free at the core**.

## 3. Building segments

### 3a. Residential rooftop (homes, apartments, housing societies)

What the job needs in India: PM Surya Ghar (≤3 kW CFA, ₹78k cap), DCR/ALMM modules, an empanelled vendor, the
national portal, DISCOM feasibility, net metering, an elevated RCC structure, and EMI.

| Need | SunPlot today | Change |
|---|---|---|
| RCC terrace with stair room and tank | ✔ survey + studio | — |
| **Mangalore / clay tile and sloped roofs** (Kerala, Goa, Karnataka) | Gable/hip houses with generic roofing | Tile-roof texture and hook mounts; show the roofing type in the BOM |
| **Housing society / RWA** (group net metering for common loads, ₹18k/kW CFA up to 500 kW) | Not modelled | "Housing society" mode: common-area load, per-kW society subsidy, several blocks |
| 12 monthly bills (or 1–3 scaled) | Single monthly figure | Bill table with seasonal profile and AC load in summer |
| Subsidy paperwork checklist | Note in the PDF | Portal checklist page: documents, DCR certificate, net-meter steps |
| EMI with the actual lender documents | EMI calculator | Loan document checklist (as Solar Ladder lists it) in the proposal |

### 3b. Industrial buildings (factories, warehouses, sheds)

What makes them different: **metal sheet roofs** (trapezoidal or standing seam, 5–10° slope, often several
bays or sawtooth), **skylight strips** (translucent sheets that must not be covered), **turbo ventilators**,
walkways and lifelines, a light structure (~10–15 kg/m² allowed; purlin check by a structural engineer),
**east-west sheds** (Thermax put 5.76 MW on two sheds), **HT connection, DG sets** (needs zero-export / DG
sync controllers), **ToD tariffs and demand charges**, **accelerated depreciation (40 %)** and **captive / open
access / RESCO** deals.

| Need | SunPlot today | Change |
|---|---|---|
| **Industrial shed site type**: multi-bay gable or sawtooth metal roof, ridge vents, skylight strips, turbo vents, walkways | Not present (flat roof and airport only) | **New site type "Industrial shed"** (bays, span, bay length, eave height, slope, skylight %, vents); flush rail-less mounting on the sheets, both faces used |
| Roof load check | Dead load kg/m² shown | Flag over 15 kg/m² for sheet roofs; note purlin check |
| Walkways between blocks every N rows | Edge setback only | Walkway every *n* modules (cleaning access) |
| DG sync / zero export | — | Electrical: zero-export controller and DG-PV sync line in the SLD and BOM for sites with DG |
| ToD tariff, demand charge, open access | Flat tariff | C&I finance: ToD split by solar hours, demand charge, wheeling/banking for OA |
| Accelerated depreciation, GST | — | Tax view: 40 % AD in year 1, corporate tax rate, GST on supply |
| RESCO / PPA tariff | Lease/PPA not modelled | PPA calculator: developer IRR target → tariff per kWh vs grid |
| Inspection approval | — | CEIG / electrical-inspector flag above the state threshold |

### 3c. Colleges and campuses (schools, universities, hospitals, offices)

What makes them different: **many buildings** (academic blocks, hostels, library, labs), mixed roofs (RCC
flat, metal sheds over workshops), **parking that suits carports**, several meters (often HT plus LT), daytime
load in term and low load in vacations, **RESCO / PPA** as the usual model for government institutions
(zero capex), state nodal agencies, plus a desire for an **education display** (live generation board).

| Need | SunPlot today | Change |
|---|---|---|
| Pick **several buildings** on the survey map and add them up | One building at a time | **Campus mode**: multi-select buildings (and car parks), per-building table, campus total |
| Mixed site types in one design | One site type per design | Campus project = several designs summed (needs the projects list) |
| Term vs vacation load | Flat monthly use | Academic-calendar profile: low in May–June and December |
| RESCO for govt colleges | Shown as a note only | PPA tariff calculator (as in 3b) and a "zero capex" proposal page |
| Carports in campus parking | Carport site type exists | Add carports to a campus from the survey map |
| Public display / sustainability report | CO₂ / trees in the PDF | Campus sustainability page; later a live dashboard |

The survey already finds schools, colleges and hospitals (Overture places), so campus mode builds straight on it.

## 4. Suggested plan

Effort: S = days, M = 1–2 weeks, L = multi-week. "Frontend" = it fits the current free, no-login app.

### Phase A, frontend only (keeps SunPlot free, no backend). **Shipped 25 Oct 2026**, all eight items

| # | Change | Segment | Effort |
|---|---|---|---|
| A1 | **Industrial shed site type** (multi-bay metal roof, skylights, turbo vents, walkways, flush mount, load flag) | Industrial | M |
| A2 | **C&I finance**: ToD tariff and demand charge, accelerated depreciation, **RESCO/PPA tariff calculator**, zero-capex page | Industrial, campus | M |
| A3 | **Campus mode** in the survey: multi-select buildings and car parks, per-building results, campus PDF | Campus | M |
| A4 | **12-month bill table** + seasonal (AC) and academic-calendar profiles | All | S |
| A5 | Residential extras: Mangalore-tile roof, housing-society mode and subsidy, portal and loan document checklists | Residential | S–M |
| A6 | DG sync / zero-export in the electrical design | Industrial | S |
| A7 | **Customer view** of the share link (read-only 3D + numbers, no panels): a web proposal like Arka's 3D link | All | S |
| A8 | **Saved projects in the browser** (IndexedDB): several designs per customer, duplicate, primary | All | M |

### Phase B, needs a backend (accounts and shared data; e.g. Cloudflare D1 + Workers, which fits current hosting)

| # | Change | Matches |
|---|---|---|
| B1 | Accounts and organisations; projects synced across devices and team members | Both |
| B2 | **CRM pipeline**: lead → survey → proposal → won → DISCOM application → install → net meter → commissioned; IndiaMart / Google Forms / WhatsApp lead capture | Solar Ladder |
| B3 | Quote versions, accept online, payment milestones, GST invoices | Solar Ladder, Arka |
| B4 | Tasks and reminders with calendar sync | Solar Ladder |
| B5 | Books: per-project costing from the BOM, actuals, margin | Solar Ladder |
| B6 | O&M: cleaning schedule, tickets, generation vs expected (inverter APIs later) | Solar Ladder |
| B7 | Customer portal: project stage tracker, documents, generation | Solar Ladder |

### Phase C, field and partners
- PWA / offline survey on Android, photo upload as the base map (C1)
- Loan partners (NBFC) and an equipment price feed (C2)
- Hindi and regional languages (C3)

## 5. Recommendation

Start with **A1 → A2 → A3**. Industrial sheds and campuses are where installers make the most money, and no
free tool models metal-shed roofs, RESCO tariffs or multi-building campuses well. Each one also uses what SunPlot
already has (Overture places, survey, electrical, finance). Then A7 + A8 make proposals shareable and projects
persistent, without a backend. Phase B turns SunPlot into a Solar-Ladder-class business tool, and it is the step
that needs hosting costs and accounts.

## Sources

- https://www.solarladder.com/ and its /design, /feature/crm, /feature/proposals, /feature/project-management, /feature/tasks, /feature/books and /loans pages
- https://solarladder.com/blog/post/best-solar-app-for-installers-in-india (vendor)
- https://apps.list.solar/tools/solar-ladder/, https://heavendesigns.in/blog/solar-ladder-review/, https://www.crmleaf.app/blog/top-10-solar-crm-software-for-solar-installation-companies-in-2026 (third-party; some are competitors)
- help.arka360.com (143 articles, see COMPETITORS.md)
- https://www.thermaxglobal.com/thermax_case_study_2_artwork_low-resolution/ (5.76 MW on east-west industrial sheds)
- https://mercomindia.com/pidilite-industries-leverages-rooftop-solar-to-save-on-power-bills (clamps on metal sheets, ballast on RCC)
- https://www.studiomatrx.org/guides/industrial-shed-roof-guide-india (purlin and load design is structural-engineer work)
- https://www.pv-magazine-india.com/2024/02/26/jindal-steel-power-commissions-3-25-mwp-building-integrated-solar-roof-in-india

## Phase A: what shipped and the numbers behind it

| Item | Implementation | Reference figures used |
|---|---|---|
| A1 Industrial shed | `industrial` site type: n spans × span, eave, slope, skylight strips (1.06 m sheets + 0.3 m clearance), 0.6 m walkways every N modules, turbo vents on ridges, flush short rails on both slopes, dead-load check | PEB slope 1:10–1:20; solar collateral load ~12–15 kg/m² (installer estimates); Thermax 5.76 MW on east-west sheds |
| A2 C&I finance | Business view after tax (savings taxed, 40 % WDV depreciation shield), ToD solar-hour rebate, RESCO tariff solved for developer RoE | 40 % WDV (IT Act Appendix I); company tax 25.17 %; ToD rules 2023 (solar hours ≥ 10–20 % cheaper for C&I > 10 kW from Apr 2024); KERC 2026–29 RoE 14 %, 70:30 debt, 10.8 %, 13 yr; SECI 2026 RESCO bids ₹2.94–3.97/kWh |
| A3 Campus mode | Multi-select blocks on the survey map, per-block layout and totals, PDF table | — |
| A4 Bills & load | 12 monthly bills or an average shaped by season; 6 load patterns matched hour by hour (8760 h) against solar; net metering (annual banking), net billing, gross metering, zero export | Net metering up to 500 kW or sanctioned load (2021 rules), state rules vary |
| A5 Residential | Mangalore clay / metal / shingle roofs with matching mounting in the BOM; housing-society CFA; subsidy, business, RESCO and loan checklists | RWA/GHS CFA ₹18,000/kW (₹19,800 special states) on min(plant, 3 kW × houses, 500 kW) |
| A6 DG / zero export | DG-PV controller (DG kept ≥ 30 % loaded), zero-export limiter, both in SLD and BOM | ~30 % minimum DG loading (vendor guidance) |
| A7 Customer link | `?view=client&co=…` read-only page with company, call/email and headline numbers | — |
| A8 Projects | Browser-saved projects, several designs, primary, duplicate, compare | — |

Electrical sizing was tightened at the same time: strings of two lengths (e.g. 17–18) so no module is left
unwired, and heavy AC feeders run as parallel cables, with a flag when even four cables can't carry the current.
