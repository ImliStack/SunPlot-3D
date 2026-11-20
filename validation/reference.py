"""
Independent reference for SunPlot's hourly engine, built only from pvlib 0.11 functions.

For each test site it downloads (once) the PVGIS v5.3 TMY, runs
  spa_python -> get_total_irradiance(perez) -> iam.physical -> sapm cell temperature
  -> pvwatts_dc -> pvwatts_losses -> inverter.pvwatts
for a fixed reference system, and writes validation/fixtures/sim_<site>.json with the annual,
monthly and a sample of hourly results. tests/simulate.test.js runs SunPlot's JS engine on the
same weather file and compares.

    validation/.venv/bin/python validation/reference.py
"""
import json, pathlib, time, warnings
import numpy as np, pandas as pd, requests
import pvlib
from pvlib import irradiance, iam, temperature, pvsystem, inverter, atmosphere

warnings.filterwarnings('ignore')
HERE = pathlib.Path(__file__).parent
DATA = HERE / 'data'; DATA.mkdir(exist_ok=True)
FIX = HERE / 'fixtures'; FIX.mkdir(exist_ok=True)

SITES = {
    'ajmer':     (26.45, 74.64),
    'ahmedabad': (23.03, 72.58),
    'mumbai':    (19.08, 72.88),
    'bengaluru': (12.97, 77.59),
    'london':    (51.51, -0.13),
    'dubai':     (25.20, 55.27),
    'sydney':    (-33.87, 151.21),
    'quito':     (-0.18, -78.47),   # near the equator, high altitude
    'tromso':    (69.65, 18.96),    # high latitude: polar night and midnight sun
}

# Reference system (also used by the JS test): 10 kWp, DC:AC 1.2, PVWatts default losses without
# soiling/shading/snow, open rack glass/polymer, gamma -0.35 %/°C, albedo 0.2.
PDC0 = 10000.0
AC = PDC0 / 1.2
ETA = 0.96
GAMMA = -0.0035
ALBEDO = 0.2
LOSSES = dict(soiling=0, shading=0, snow=0, mismatch=2, wiring=2, connections=0.5, lid=1.5,
              nameplate_rating=1, age=0, availability=3)


def tmy(site, lat, lon):
    f = DATA / f'pvgis_tmy_{site}.json'
    if not f.exists():
        url = f'https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat={lat:.3f}&lon={lon:.3f}&outputformat=json'
        r = requests.get(url, timeout=120); r.raise_for_status()
        f.write_text(r.text); time.sleep(1)
    return json.loads(f.read_text())


def run(site, lat, lon):
    d = tmy(site, lat, lon)
    rows = d['outputs']['tmy_hourly']
    off = d['inputs']['location'].get('irradiance_time_offset', 0) or 0
    elev = d['inputs']['location']['elevation']
    # Same mapping as src/engine/weather.js: every month onto the non-leap year 2023, UTC.
    t = pd.to_datetime(['2023' + r['time(UTC)'][4:] for r in rows], format='%Y%m%d:%H%M', utc=True)
    df = pd.DataFrame({'ghi': [r['G(h)'] for r in rows], 'dni': [r['Gb(n)'] for r in rows],
                       'dhi': [r['Gd(h)'] for r in rows], 'temp': [r['T2m'] for r in rows],
                       'wind': [r['WS10m'] for r in rows]}, index=t).sort_index()
    tsun = df.index + pd.Timedelta(hours=off)
    pressure = atmosphere.alt2pres(elev)
    sp = pvlib.solarposition.spa_python(tsun, lat, lon, altitude=elev, pressure=pressure, temperature=12)
    zen = sp['apparent_zenith'].values; az = sp['azimuth'].values
    tilt = round(min(abs(lat), 40)); azim = 180 if lat >= 0 else 0
    dni_extra = irradiance.get_extra_radiation(tsun).values
    am = atmosphere.get_relative_airmass(zen)
    tot = irradiance.get_total_irradiance(tilt, azim, zen, az, df.dni.values, df.ghi.values, df.dhi.values,
                                          dni_extra=dni_extra, airmass=am, albedo=ALBEDO, model='perez')
    aoi = irradiance.aoi(tilt, azim, zen, az)
    eff = tot['poa_direct'] * iam.physical(aoi) + tot['poa_diffuse']
    p = temperature.TEMPERATURE_MODEL_PARAMETERS['sapm']['open_rack_glass_polymer']
    tcell = temperature.sapm_cell(tot['poa_global'], df.temp.values, df.wind.values, **p)
    pdc = np.maximum(pvsystem.pvwatts_dc(eff, tcell, PDC0, GAMMA), 0)
    # SunPlot skips hours with no GHI and no DNI; pvlib would still add ground-reflected light there
    # only if GHI > 0, so this mask is identical in effect.
    pdc = np.where((df.ghi.values > 0) | (df.dni.values > 0), pdc, 0)
    loss = pvsystem.pvwatts_losses(**LOSSES) / 100
    pdc_net = pdc * (1 - loss)
    pac = inverter.pvwatts(pdc_net, AC / ETA, eta_inv_nom=ETA)
    pac = pd.Series(np.nan_to_num(pac), index=tsun)
    monthly = pac.groupby(pac.index.month).sum() / 1000
    sample = list(range(0, len(pac), 7))
    out = {
        'site': site, 'lat': lat, 'lon': lon, 'elevation': elev, 'tilt': tilt, 'azimuth': azim,
        'pdc0': PDC0, 'ac': AC, 'eta': ETA, 'gamma': GAMMA, 'albedo': ALBEDO, 'losses_pct': float(loss * 100),
        'weather': {'dataset': f"{d['inputs']['meteo_data']['radiation_db']} {d['inputs']['meteo_data']['year_min']}-{d['inputs']['meteo_data']['year_max']}",
                    'offset_h': off, 'annual_ghi_kwh_m2': float(df.ghi.sum() / 1000)},
        'annual_kwh': float(pac.sum() / 1000),
        'monthly_kwh': [float(monthly.get(m, 0)) for m in range(1, 13)],
        'poa_kwh_m2': float(np.nansum(tot['poa_global']) / 1000),
        'sample_index': sample,
        'sample_ac_w': [float(pac.iloc[i]) for i in sample],
        'sample_poa': [float(np.nan_to_num(tot['poa_global'][i])) for i in sample],
        'sample_tcell': [float(np.nan_to_num(tcell[i])) for i in sample],
        'pvlib': pvlib.__version__,
    }
    (FIX / f'sim_{site}.json').write_text(json.dumps(out))
    return out


if __name__ == '__main__':
    for s, (la, lo) in SITES.items():
        o = run(s, la, lo)
        print(f"{s:10s} {o['weather']['dataset']:28s} GHI {o['weather']['annual_ghi_kwh_m2']:7.1f}  POA {o['poa_kwh_m2']:7.1f}  AC {o['annual_kwh']:8.1f} kWh  ({o['annual_kwh']/10:6.1f} kWh/kWp)")
