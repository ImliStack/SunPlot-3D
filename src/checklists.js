// What happens after "yes" in India: the steps and the paperwork, by who pays. Kept short and
// general; DISCOM and state rules differ, so the proposal says to confirm locally.

export function checklists(p) {
  if (p.cur !== '₹') return []
  const lists = []
  if (p.buyer === 'home') {
    lists.push({
      title: p.society ? 'PM Surya Ghar for a housing society (RWA / GHS)' : 'PM Surya Ghar subsidy steps',
      items: [
        'Register on pmsuryaghar.gov.in with the electricity consumer number and mobile number',
        'Apply for rooftop solar; the DISCOM checks feasibility and approves',
        'Pick a DISCOM-registered vendor; modules must be DCR (Indian cells, ALMM List-II)',
        'After installation, upload plant details and apply for the net meter',
        'DISCOM inspects, fits the net meter and issues the commissioning report',
        'Submit bank details and a cancelled cheque; the subsidy reaches the bank account (typically within 30 days)',
        ...(p.society ? ['The society connection must serve common facilities only (lifts, pumps, lights, EV charging)'] : []),
      ],
    })
  }
  if (p.buyer === 'business') {
    lists.push({
      title: 'Business rooftop steps',
      items: [
        'Apply to the DISCOM for net metering (up to 500 kW or the sanctioned load) or net billing / gross metering above it',
        'Electrical-inspector (CEIG) approval where the state requires it for the plant size or HT supply',
        'Structural stability certificate for the roof (purlin check on metal sheds)',
        'With a DG set: fit a DG-PV synchronisation controller so solar never back-feeds the generator',
        'Keep the GST invoice and commissioning date: they set the year-1 depreciation claim',
      ],
    })
  }
  if (p.buyer === 'resco') {
    lists.push({
      title: 'RESCO / PPA steps',
      items: [
        'Agree the PPA: tariff, term, minimum offtake, and buy-out value if ended early',
        'Roof lease or licence to the developer for the PPA term',
        'Developer files the DISCOM connectivity / metering applications and the inspector approvals',
        'Monthly billing on the solar meter reading; developer handles O&M and insurance',
      ],
    })
  }
  if (p.loanShare > 0 || p.buyer === 'home') {
    lists.push({
      title: 'Documents for a solar loan',
      items: [
        'PAN card and Aadhaar card (front and back)',
        'Latest electricity bill and one year of bank statements',
        'Applicant photo, phone number and email',
        'This proposal with the bill of materials and commercials',
        'Salaried: three months of salary slips. Self-employed: two years of ITR and business proof (GST / Udyam)',
      ],
    })
  }
  return lists
}
