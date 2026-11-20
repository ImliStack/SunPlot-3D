"""
Build src/data/equipment.js from the NREL SAM component libraries (CEC module and inverter lists),
so every listed specification is a sourced value, not a typed-in one.

    curl -L -o validation/data/CEC_Modules.csv   "https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Modules.csv"
    curl -L -o validation/data/CEC_Inverters.csv "https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Inverters.csv"
    validation/.venv/bin/python validation/build_equipment.py
"""
import json, pathlib, re
import pandas as pd

HERE = pathlib.Path(__file__).parent
D = HERE / 'data'
OUT = HERE.parent / 'src' / 'data' / 'equipment.js'

mods = pd.read_csv(D / 'CEC_Modules.csv', skiprows=[1, 2], low_memory=False)
invs = pd.read_csv(D / 'CEC_Inverters.csv', skiprows=[1, 2], low_memory=False)
for c in ['STC', 'Length', 'Width', 'V_oc_ref', 'V_mp_ref', 'I_sc_ref', 'I_mp_ref', 'beta_oc', 'gamma_pmp', 'N_s', 'Bifacial', 'A_c']:
    mods[c] = pd.to_numeric(mods[c], errors='coerce')
for c in ['Paco', 'Pdco', 'Vdcmax', 'Idcmax', 'Mppt_low', 'Mppt_high', 'Vac', 'Pso', 'Pnt']:
    invs[c] = pd.to_numeric(invs[c], errors='coerce')
version = str(mods['Version'].dropna().iloc[-1])

# One or two current modules per maker (exact CEC listing names).
MODULES = [
    'WAAREE ENERGIES LIMITED BiN-21-630',
    'Mundra Solar PV Limited (Adani) AB-G12R-132-620',
    'Tata Power Renewables TP615VG12R16NB',
    'PREMIER ENERGIES PHOTOVOLTAIC PRIVATE Ltd PE-560HGB',
    'Vikram Solar PARADEA VSMDH7255005',
    'GOLDI SUN PRIVATE LIMITED GS12R-T132-GF-620',
    'Rayzon Solar Limited RS620132TGC',
    'Saatvik Green Energy Limited SGE620-132TGG',
    'EMMVEE Photovoltaic Power Private Limited E575HCBT144-T',
    'Jinko Solar Co Ltd JKM620N-66HL4M-BDV',
    'LONGi Green Energy Technology Co Ltd LR5-78HBD-600M',
    'Trina Solar CoLtd TSM-620NE19RC',
    'JA Solar JAM66D45-620/LB',
]


def pick_modules():
    out = []
    for name in MODULES:
        r = mods[mods.Name == name]
        if r.empty:
            print('missing module', name); continue
        r = r.iloc[-1]
        derived = False
        L, W = r.Length, r.Width
        if not (L > 0 and W > 0):
            # Recent listings give only the area. Modern large-format modules are 1,134 mm wide;
            # derive the length from the listed area and flag it.
            if r.A_c > 0 and 1.6 <= r.A_c / 1.134 <= 2.5:
                L, W, derived = round(float(r.A_c) / 1.134, 3), 1.134, True
            else:
                print('no dimensions', name); continue
        out.append({
            'dimsDerived': derived,
            'id': re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:60],
            'maker': r.Manufacturer, 'model': name.replace(r.Manufacturer, '').strip(),
            'tech': r.Technology, 'bifacial': bool(r.Bifacial == 1),
            'watt': round(float(r.STC), 1), 'h': round(max(L, W), 4), 'w': round(min(L, W), 4),
            'cells': int(r.N_s) if r.N_s == r.N_s else None,
            'voc': float(r.V_oc_ref), 'vmp': float(r.V_mp_ref), 'isc': float(r.I_sc_ref), 'imp': float(r.I_mp_ref),
            'bVoc': round(float(r.beta_oc) / float(r.V_oc_ref) * 100, 4),  # %/°C
            'gPmax': round(float(r.gamma_pmp), 4),  # %/°C
            'efficiency': round(float(r.STC) / float(r.A_c) / 10, 2) if r.A_c > 0 else None,
            'listed': str(r.Date),
        })
    return out


# Inverters: a spread of sizes from makers common in India and the UK (single CEC listings).
INVERTER_PATTERNS = [
    ('Sungrow', [3000, 5000, 8000, 10000, 15000, 25000, 50000, 110000, 250000]),
    ('Growatt', [3000, 5000, 6000, 10000, 15000, 30000, 50000]),
    ('Ginlong', [5000, 10000, 25000, 50000, 100000]),
    ('Huawei', [10000, 20000, 50000, 100000]),
    ('Fronius', [5000, 10000, 20000]),
    ('SMA', [5000, 10000, 25000]),
]


def pick_inverters():
    out = []
    for maker, sizes in INVERTER_PATTERNS:
        cand = invs[invs.Name.str.contains(maker, case=False, na=False) & (invs.Vac.isin([208, 220, 230, 240, 400, 415, 480, 600, 800]))]
        for size in sizes:
            near = cand[(cand.Paco >= 0.9 * size) & (cand.Paco <= 1.1 * size)]
            if near.empty:
                continue
            r = near.sort_values('Paco').iloc[len(near) // 2]
            out.append({
                'id': re.sub(r'[^a-z0-9]+', '-', r.Name.lower()).strip('-')[:60],
                'name': r.Name, 'maker': maker if maker != 'Ginlong' else 'Solis (Ginlong)',
                'ac': round(float(r.Paco) / 1000, 3), 'pdc': round(float(r.Pdco) / 1000, 3), 'vac': int(r.Vac),
                'vmax': float(r.Vdcmax), 'mpptMin': float(r.Mppt_low), 'mpptMax': float(r.Mppt_high), 'idcMax': float(r.Idcmax),
                'efficiencyMax': round(float(r.Paco) / float(r.Pdco) * 100, 2) if r.Pdco else None,
                'listed': str(r.CEC_Date), 'market': 'US (UL / CEC) variant',
            })
    # De-duplicate by name.
    seen, uniq = set(), []
    for x in out:
        if x['name'] not in seen:
            seen.add(x['name']); uniq.append(x)
    return uniq


if __name__ == '__main__':
    M, I = pick_modules(), pick_inverters()
    head = (f"// Generated by validation/build_equipment.py from the NREL SAM component libraries\n"
            f"// (CEC module list, library version {version}; CEC inverter list). Do not edit by hand.\n"
            f"// CEC listing confirms the electrical ratings; it does NOT certify DCR / ALMM List-II status,\n"
            f"// which depends on where the cells were made — check the ALMM list for subsidy projects.\n\n")
    src = head + f"export const LIBRARY_SOURCE = {json.dumps({'modules': f'CEC module list via NREL SAM library {version}', 'inverters': 'CEC inverter list via NREL SAM library (develop branch)', 'url': 'https://github.com/NREL/SAM/tree/develop/deploy/libraries'})}\n\n"
    src += f"export const LIBRARY_MODULES = {json.dumps(M, indent=1)}\n\nexport const LIBRARY_INVERTERS = {json.dumps(I, indent=1)}\n"
    OUT.write_text(src)
    print(len(M), 'modules,', len(I), 'inverters ->', OUT)
    for m in M: print(f"  {m['maker'][:28]:28s} {m['model'][:24]:24s} {m['watt']:6.1f} W {m['h']}×{m['w']} m  Voc {m['voc']}  β {m['bVoc']} %/K  γ {m['gPmax']} %/K")
    for i in I: print(f"  {i['name'][:58]:58s} {i['ac']:7.2f} kW  {i['vmax']:.0f} V  MPPT {i['mpptMin']:.0f}-{i['mpptMax']:.0f}")
