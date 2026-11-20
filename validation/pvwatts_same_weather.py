"""
Model-only comparison with PVWatts V8: download PVWatts' hourly output (which includes the NSRDB
TMY beam, diffuse, temperature and wind it used), so tests/pvwatts.test.js can run SunPlot's engine
on exactly the same weather. Any remaining difference is then model, not data.

    validation/.venv/bin/python validation/pvwatts_same_weather.py
"""
import json, os, pathlib, time, warnings
import requests
warnings.filterwarnings('ignore')
HERE = pathlib.Path(__file__).parent
FIX = HERE / 'fixtures'
KEY = os.environ.get('NREL_API_KEY', 'DEMO_KEY')
SITES = [x for x in ['ajmer', 'mumbai', 'london', 'dubai', 'sydney', 'tromso'] if not (FIX / f'pvwatts_{x}.json').exists() or json.loads((FIX / f'pvwatts_{x}.json').read_text()).get('tz') is None]

for s in SITES:
    ref = json.loads((FIX / f'sim_{s}.json').read_text())
    url = (f"https://developer.nlr.gov/api/pvwatts/v8.json?api_key={KEY}&lat={ref['lat']}&lon={ref['lon']}"
           f"&system_capacity=10&azimuth={ref['azimuth']}&tilt={ref['tilt']}&array_type=0&module_type=0"
           f"&losses=9.8504&dc_ac_ratio=1.2&inv_eff=96&albedo=0.2&timeframe=hourly")
    for attempt in range(12):
        d = requests.get(url, timeout=180).json()
        if 'outputs' in d: break
        print(s, 'retrying:', d.get('errors') or d.get('error')); time.sleep(120)
    if 'outputs' not in d:
        continue
    o, st = d['outputs'], d['station_info']
    keep = {k: o[k] for k in ['ac', 'dc', 'poa', 'dn', 'df', 'tamb', 'wspd', 'tcell'] if k in o}
    out = {'site': s, 'lat': ref['lat'], 'lon': ref['lon'], 'tilt': ref['tilt'], 'azimuth': ref['azimuth'],
           'tz': st.get('tz'), 'elevation': st.get('elev'), 'station_lat': st.get('lat'), 'station_lon': st.get('lon'),
           'weather': st.get('weather_data_source'), 'version': d.get('version'),
           'ac_annual': o['ac_annual'], 'solrad_annual': o['solrad_annual'], 'hourly': keep}
    (FIX / f'pvwatts_{s}.json').write_text(json.dumps(out))
    print(f"{s:8s} tz {out['tz']}  {out['weather']}  AC {o['ac_annual']:.0f} kWh  POA {sum(keep['poa'])/1000:.0f} kWh/m²  keys {list(keep)}")
    time.sleep(60)
