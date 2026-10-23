#!/bin/bash
# Refresh every README screenshot (docs/screenshots/*.jpg) from the running dev server.
# Needs: `npm run dev` on :5181 and the gstack `browse` CLI in headed mode (WebGL needs a real GPU).
# Usage: scripts/readme-shots.sh
set -u
cd "$(dirname "$0")/.."
OUT=docs/screenshots
BROWSE="${BROWSE:-$HOME/.claude/skills/gstack/browse/dist/browse}"
b() { "$BROWSE" --headed "$@"; }
n=0

# shot <name> <hash> <seconds to settle> [js…]
shot() {
  local name=$1 url=$2 wait=$3; shift 3
  n=$((n+1))
  b goto "http://localhost:5181/?s=$n$url" >/dev/null
  sleep 3
  for j in "$@"; do b js "$j" >/dev/null; done
  sleep "$wait"
  b screenshot --viewport "$OUT/$name.png" >/dev/null
  sips -s format jpeg -s formatOptions 82 "$OUT/$name.png" --out "$OUT/$name.jpg" >/dev/null && rm "$OUT/$name.png"
  echo "ok $name"
}
prefs() { b js "localStorage.setItem('solar-theme','$1'); localStorage.setItem('solar-panels', JSON.stringify({left:${2:-true},right:${3:-true}})); 'ok'" >/dev/null; }

# Survey: Jaipur, pick the building nearest the centre, mark stair room + tank, 420 units.
survey() {
  local name=$1 extra=${2:-}
  n=$((n+1))
  b goto "http://localhost:5181/?s=$n" >/dev/null; sleep 4
  b js "window.__solar.getState().setMode('survey'); 'ok'" >/dev/null; sleep 3
  b js "window.__solar.getState().patchSurvey({ center: [75.8115, 26.8535], pin: [75.8115, 26.8535], address: 'Malviya Nagar, Jaipur', state: 'Rajasthan' }); 'ok'" >/dev/null
  for i in $(seq 1 20); do sleep 2; c=$(b js "window.__surveyMap.queryRenderedFeatures({ layers: ['ov-fill'] }).length" 2>/dev/null | tail -1); [ "${c:-0}" -gt 5 ] 2>/dev/null && break; done
  if [ "$extra" != "search" ]; then
    b js "const m = window.__surveyMap; const c = m.getCenter(); const t = m.queryRenderedFeatures({ layers: ['ov-fill'] }).map(f => { const r = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]; const x = r.reduce((s,p)=>s+p[0],0)/r.length, y = r.reduce((s,p)=>s+p[1],0)/r.length; return { x, y, d: Math.hypot(x - c.lng, y - c.lat) } }).sort((a,b)=>a.d-b.d)[0]; m.fire('click', { point: m.project([t.x, t.y]), lngLat: { lng: t.x, lat: t.y }, originalEvent: {} }); 'ok'" >/dev/null; sleep 2
    b js "const s = window.__solar.getState().survey; const r = s.ring; const x = r.reduce((a,p)=>a+p[0],0)/r.length, y = r.reduce((a,p)=>a+p[1],0)/r.length; window.__solar.getState().patchSurvey({ mumty: [x*0.55 + r[0][0]*0.45, y*0.55 + r[0][1]*0.45], tank: [x*0.7 + r[1][0]*0.3, y*0.7 + r[1][1]*0.3], units: 420, sanctioned: 5 }); 'ok'" >/dev/null
    sleep 14
  else
    b click "input[aria-label='Search address']" >/dev/null; b type "malviya nagar jai" >/dev/null; sleep 3
  fi
  if [ "$extra" = "studio" ]; then
    b js "[...document.querySelectorAll('button')].find(x => x.textContent.includes('Open this design'))?.click(); 'ok'" >/dev/null; sleep 10
  fi
  b screenshot --viewport "$OUT/$name.png" >/dev/null
  sips -s format jpeg -s formatOptions 82 "$OUT/$name.png" --out "$OUT/$name.jpg" >/dev/null && rm "$OUT/$name.png"
  echo "ok $name"
}

# Places: Jaipur hospitals/schools/malls…, pick Integral Hospital; 2D list, 3D map, then the studio.
places() {
  local name=$1 extra=${2:-}
  n=$((n+1))
  b goto "http://localhost:5181/?s=$n" >/dev/null; sleep 4
  b js "window.__solar.getState().setMode('survey'); 'ok'" >/dev/null; sleep 3
  b js "window.__solar.getState().patchSurvey({ center: [75.8073, 26.8540], view: [75.8073, 26.8540], address: 'Malviya Nagar, Jaipur', state: 'Rajasthan', poiCats: ['hospital', 'mall', 'fuel', 'supermarket', 'school', 'bank'] }); 'ok'" >/dev/null; sleep 4
  b js "window.__surveyMap.jumpTo({ center: [75.8073, 26.8540], zoom: 15.5 }); 'ok'" >/dev/null
  for i in $(seq 1 15); do sleep 2; c=$(b js "window.__solar.getState().survey.poiList.length" 2>/dev/null | tail -1); [ "${c:-0}" -gt 5 ] 2>/dev/null && break; done
  if [ "$extra" != "list" ]; then
    b js "const s = window.__solar.getState(); s.selectPlace(s.survey.poiList.find(x => x.name === 'Integral Hospital') ?? s.survey.poiList.find(x => x.cat === 'hospital')); 'ok'" >/dev/null; sleep 12
  fi
  [ "$extra" = "3d" ] || [ "$extra" = "studio" ] && { b js "window.__solar.getState().patchSurvey({ map3d: true }); 'ok'" >/dev/null; sleep 6; }
  if [ "$extra" = "studio" ]; then
    b js "[...document.querySelectorAll('button')].find(x => x.textContent.includes('Open this design'))?.click(); 'ok'" >/dev/null; sleep 10
  fi
  b screenshot --viewport "$OUT/$name.png" >/dev/null
  sips -s format jpeg -s formatOptions 82 "$OUT/$name.png" --out "$OUT/$name.jpg" >/dev/null && rm "$OUT/$name.png"
  echo "ok $name"
}

b viewport 1440x900 >/dev/null
prefs light
shot overview-light "#day=172&hour=10" 9
shot airport "#site=airport&day=80&hour=10.5" 16
shot carport "#site=carport&day=80&hour=11" 9
shot busstop "#site=busstop&day=80&hour=9.5" 8
shot lshape "#site=lshape&day=172&hour=10" 9
shot shade-map "#closeTrees=1&day=355&hour=9.5" 10 "window.__solar.getState().toggleLayer('shade'); 'x'"
shot click-to-install "#site=flat&day=172&hour=10" 7 \
  "window.__solar.getState().setInstallMode('manual'); 'x'" \
  "const k = window.__installKeys; window.__solar.getState().applyKeys(k.filter(x => ['0','2'].includes(x.split('|')[1])), true); window.__solar.getState().setTool('row'); 'x'"
shot climate-tab "#day=172&hour=10" 7 "window.__solar.getState().setTab('climate'); 'x'"
shot snow "#lat=59.9&lon=10.75&placeName=Oslo&place=&day=20&hour=12&climate=cloudy" 12
shot rain "#place=mumbai&placeName=Mumbai&lat=19.1&lon=72.88&climate=monsoon&day=196&hour=11&site=flat" 11
survey survey-search search
survey survey
survey survey-studio studio
places survey-places list
places survey-3d 3d
places studio-hospital studio
prefs dark
shot overview-dark "#day=172&hour=10" 9
prefs light false false
sleep 1
shot focus-mode "#site=carport&day=80&hour=11" 10
prefs light
b viewport 390x844 >/dev/null
shot mobile "#day=172&hour=10" 8
b viewport 1440x900 >/dev/null
