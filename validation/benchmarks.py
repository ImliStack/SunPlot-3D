"""
External benchmarks: the same 10 kWp reference system run through PVWatts V8 (NREL/NLR API, NSRDB
TMY weather) and PVGIS v5.3 PVcalc (its own long-term series). These tools use different weather
and slightly different models, so differences reflect both; see VALIDATION_REPORT.md.

    validation/.venv/bin/python validation/benchmarks.py
Writes validation/fixtures/benchmarks.json. Uses the public DEMO_KEY (rate-limited) unless
NREL_API_KEY is set in the environment.
"""
import json, os, pathlib, time, warnings
import requests
warnings.filterwarnings('ignore')
HERE = pathlib.Path(__file__).parent
FIX = HERE / 'fixtures'
KEY = os.environ.get('NREL_API_KEY', 'DEMO_KEY')
LOSS_NO_INV = 9.8504  # % (mismatch 2, wiring 2, connections 0.5, LID 1.5, nameplate 1, availability 3)
LOSS_WITH_INV = 100 * (1 - (1 - LOSS_NO_INV / 100) * (1 - 0.04))  # PVGIS's single loss term includes the inverter


def pvwatts(lat, lon, tilt, az):
    url = (f'https://developer.nlr.gov/api/pvwatts/v8.json?api_key={KEY}&lat={lat}&lon={lon}&system_capacity=10'
           f'&azimuth={az}&tilt={tilt}&array_type=0&module_type=0&losses={LOSS_NO_INV:.4f}&dc_ac_ratio=1.2'
           f'&inv_eff=96&albedo=0.2&timeframe=monthly')
    d = requests.get(url, timeout=120).json()
    if d.get('errors'):
        return {'error': d['errors']}
    o = d['outputs']
    return {'ac_annual': o['ac_annual'], 'ac_monthly': o['ac_monthly'], 'poa_kwh_m2': sum(o['poa_monthly']),
            'solrad_annual': o['solrad_annual'], 'weather': d['station_info'].get('weather_data_source'),
            'version': d.get('version'), 'distance_m': d['station_info'].get('distance')}


def pvgis(lat, lon, tilt, az):
    # PVGIS aspect: 0 = south, −90 = east, 90 = west.
    aspect = az - 180
    url = (f'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat={lat}&lon={lon}&peakpower=10&loss={LOSS_WITH_INV:.3f}'
           f'&angle={tilt}&aspect={aspect}&mountingplace=free&pvtechchoice=crystSi&outputformat=json')
    d = requests.get(url, timeout=120).json()
    t = d['outputs']['totals']['fixed']
    return {'ac_annual': t['E_y'], 'ac_monthly': [m['E_m'] for m in d['outputs']['monthly']['fixed']],
            'poa_kwh_m2': t['H(i)_y'], 'weather': d['inputs']['meteo_data']['radiation_db'],
            'years': f"{d['inputs']['meteo_data']['year_min']}-{d['inputs']['meteo_data']['year_max']}"}


if __name__ == '__main__':
    out = {}
    for f in sorted(FIX.glob('sim_*.json')):
        ref = json.loads(f.read_text())
        s = ref['site']
        row = {'sunplot_pvgis_tmy': {'ac_annual': ref['annual_kwh'], 'poa_kwh_m2': ref['poa_kwh_m2'], 'weather': ref['weather']['dataset']}}
        try:
            row['pvwatts_v8'] = pvwatts(ref['lat'], ref['lon'], ref['tilt'], ref['azimuth'])
        except Exception as e:
            row['pvwatts_v8'] = {'error': str(e)}
        time.sleep(2)
        try:
            row['pvgis_pvcalc'] = pvgis(ref['lat'], ref['lon'], ref['tilt'], ref['azimuth'])
        except Exception as e:
            row['pvgis_pvcalc'] = {'error': str(e)}
        out[s] = row
        pw = row['pvwatts_v8'].get('ac_annual'); pg = row['pvgis_pvcalc'].get('ac_annual')
        print(f"{s:10s} SunPlot {ref['annual_kwh']:8.0f}  PVWatts {pw or float('nan'):8.0f} ({row['pvwatts_v8'].get('weather')})  PVGIS {pg or float('nan'):8.0f}")
        time.sleep(2)
    (FIX / 'benchmarks.json').write_text(json.dumps(out, indent=1))
