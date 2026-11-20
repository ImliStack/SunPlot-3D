// Demonstration projects. Each is a labelled set of inputs, not a real customer: costs, tariffs and
// consumption are illustrative assumptions (dated), chosen to show a typical case of each kind.

export const DEMOS = [
  {
    id: 'in-home',
    name: 'Residential rooftop, Jaipur (India)',
    assumptions: 'RCC terrace on an elevated structure, 3 kW-class DCR system sized to a ₹3,000/month bill, PM Surya Ghar subsidy; installed ₹60/W, tariff ₹7.5/kWh (Oct 2026 market notes).',
    params: {
      site: 'terrace', place: 'jaipur', placeName: 'Jaipur (demo home)', lat: 26.9, lon: 75.8, tz: 'Asia/Kolkata', cur: '₹', climate: 'arid', co2: 0.71,
      floors: 2, edge: 0.6, rackTilt: 20, panel: 'dcr580', portrait: true, stack: 1, elevated: true, target: 3.5,
      cost: 60, tariff: 7.5, useKwh: 400, buyer: 'home', subsidy: 78000, metering: 'net', profile: 'home',
    },
  },
  {
    id: 'in-warehouse',
    name: 'Commercial warehouse, Ajmer (Rajasthan)',
    assumptions: 'Two-span PEB shed, both slopes, open daytime operation; business after tax with 40 % depreciation; ₹42/W, ₹9/kWh with a 20 % ToD solar-hour rebate, net billing above 500 kW.',
    params: {
      site: 'industrial', placeName: 'Ajmer (demo warehouse)', lat: 26.45, lon: 74.64, tz: 'Asia/Kolkata', cur: '₹', climate: 'arid', co2: 0.71,
      length: 80, spans: 2, span: 24, eave: 9, shedSlope: 6, skylights: 4, walkEvery: 10, edge: 0.6, ridge: 0.6, panel: 'dcr580', bothFaces: true, vents: 8,
      cost: 42, tariff: 9, buyer: 'business', taxRate: 25.17, metering: 'billing', exportRate: 3.5, todDisc: 20, useKwh: 45000, profile: 'office',
    },
  },
  {
    id: 'in-textile',
    name: 'Textile factory, Surat (Gujarat)',
    assumptions: 'Three-span shed, 24 × 7 spinning load, 500 kVA DG set with DG-PV sync, zero export; ₹40/W, ₹8.5/kWh.',
    params: {
      site: 'industrial', placeName: 'Surat (demo textile mill)', lat: 21.17, lon: 72.83, tz: 'Asia/Kolkata', cur: '₹', climate: 'sunny', co2: 0.71,
      length: 120, spans: 3, span: 22, eave: 10, shedSlope: 6, skylights: 6, walkEvery: 12, edge: 0.6, ridge: 0.6, panel: 'dcr580', bothFaces: true, vents: 12,
      cost: 40, tariff: 8.5, buyer: 'business', taxRate: 25.17, metering: 'net', zeroExport: true, dgKva: 500, useKwh: 180000, profile: 'factory3',
    },
  },
  {
    id: 'uk-commercial',
    name: 'Commercial rooftop, London (UK)',
    assumptions: 'Flat roof with tilted racks, office load; £1.10/W installed, 25 p/kWh import, 15 p/kWh SEG export, 5 % discount rate (illustrative 2026 figures).',
    params: {
      site: 'flat', place: 'london', placeName: 'London (demo office)', lat: 51.5, lon: -0.13, tz: 'Europe/London', cur: '£', climate: 'cloudy', co2: 0.2,
      length: 40, width: 24, floors: 4, edge: 1.2, rackTilt: 25, panel: 'com550', stack: 1, vents: 3,
      cost: 1.1, tariff: 0.25, exportRate: 0.15, escalation: 2, discount: 5, buyer: 'business', taxRate: 25, metering: 'billing', useKwh: 15000, profile: 'office',
    },
  },
  {
    id: 'ground-farm',
    name: 'Ground-mounted solar farm, Bhadla (Rajasthan)',
    assumptions: 'Fixed-tilt tables on open land, bifacial-class 620 W modules modelled monofacially; ₹28/W EPC, sold at ₹2.6/kWh (recent utility auction range), gross metering.',
    params: {
      site: 'ground', placeName: 'Bhadla (demo farm)', lat: 27.53, lon: 71.92, tz: 'Asia/Kolkata', cur: '₹', climate: 'arid', co2: 0.71,
      length: 200, width: 120, edge: 5, panel: 'utl620', stack: 2, groundTilt: 24, clearance: 0.8,
      cost: 28, tariff: 2.6, exportRate: 2.6, escalation: 0, metering: 'gross', buyer: 'business', taxRate: 25.17, useKwh: 0,
    },
  },
]
