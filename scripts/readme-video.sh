#!/bin/bash
# Record the README demo (docs/demo.mp4 + docs/demo.gif) by capturing frames from the running
# dev server with the gstack `browse` CLI (headed, for WebGL) and encoding them with ffmpeg.
set -u
cd "$(dirname "$0")/.."
BROWSE="${BROWSE:-$HOME/.claude/skills/gstack/browse/dist/browse}"
b() { "$BROWSE" --headed "$@"; }
F=.frames && rm -rf .frames && mkdir -p .frames  # browse may only write inside the project
i=0
t0=$(date +%s)
# cap <seconds>: grab frames as fast as the browser allows
cap() {
  local end=$(( $(date +%s) + $1 ))
  while [ "$(date +%s)" -lt "$end" ]; do
    i=$((i+1)); b screenshot --viewport "$(printf '%s/f%05d.jpg' "$F" "$i")" >/dev/null
  done
}
js() { b js "$1" >/dev/null; }

b viewport 1280x800 >/dev/null
b goto "http://localhost:5181/?rec=$RANDOM#day=355&hour=7.6" >/dev/null
js "localStorage.setItem('solar-theme','light'); localStorage.setItem('solar-panels', JSON.stringify({left:true,right:true})); 'ok'"
b goto "http://localhost:5181/?rec=$RANDOM#day=355&hour=7.6" >/dev/null
sleep 8
start=$(date +%s)
js "window.__solar.getState().togglePlay(); 'ok'"; cap 5
js "window.__solar.getState().playing && window.__solar.getState().togglePlay(); window.__solar.getState().set('hour', 11); window.__solar.getState().setSite('airport'); 'ok'"; cap 4
js "window.__solar.getState().setSite('carport'); 'ok'"; cap 3
js "window.__solar.getState().setSite('flat'); 'ok'"; cap 2
js "window.__solar.getState().setInstallMode('manual'); window.__solar.getState().setTool('row'); 'ok'"; cap 1
for r in 0 1 2 3; do
  js "const k = window.__installKeys; window.__solar.getState().applyKeys(k.filter(x => x.split('|')[1] === '$r'), true); 'ok'"; cap 1
done
js "window.__solar.getState().set('weather', 'snow'); 'ok'"; cap 3
js "window.__solar.getState().set('weather', 'auto'); window.__solar.getState().setInstallMode('auto'); window.__solar.getState().setMode('survey'); window.__solar.getState().patchSurvey({ center: [75.8115, 26.8535], pin: [75.8115, 26.8535], address: 'Malviya Nagar, Jaipur', state: 'Rajasthan' }); 'ok'"
cap 4
for k in $(seq 1 15); do c=$(b js "window.__surveyMap.queryRenderedFeatures({ layers: ['ov-fill'] }).length" 2>/dev/null | tail -1); [ "${c:-0}" -gt 5 ] 2>/dev/null && break; cap 1; done
js "const m = window.__surveyMap; const c = m.getCenter(); const t = m.queryRenderedFeatures({ layers: ['ov-fill'] }).map(f => { const r = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]; const x = r.reduce((s,p)=>s+p[0],0)/r.length, y = r.reduce((s,p)=>s+p[1],0)/r.length; return { x, y, d: Math.hypot(x - c.lng, y - c.lat) } }).sort((a,b)=>a.d-b.d)[0]; m.fire('click', { point: m.project([t.x, t.y]), lngLat: { lng: t.x, lat: t.y }, originalEvent: {} }); 'ok'"
cap 1
js "const s = window.__solar.getState().survey; const r = s.ring; const x = r.reduce((a,p)=>a+p[0],0)/r.length, y = r.reduce((a,p)=>a+p[1],0)/r.length; window.__solar.getState().patchSurvey({ mumty: [x*0.55 + r[0][0]*0.45, y*0.55 + r[0][1]*0.45], tank: [x*0.7 + r[1][0]*0.3, y*0.7 + r[1][1]*0.3], units: 420, sanctioned: 5 }); 'ok'"
cap 6
js "[...document.querySelectorAll('button')].find(x => x.textContent.includes('Open this design'))?.click(); 'ok'"
cap 5
secs=$(( $(date +%s) - start ))
fps=$(python3 -c "print(max(4, round($i / $secs, 2)))")
echo "frames $i over ${secs}s → ${fps} fps"
ffmpeg -y -loglevel error -framerate "$fps" -i "$F/f%05d.jpg" -vf "scale=1280:-2,fps=24" -c:v libx264 -pix_fmt yuv420p -crf 26 -movflags +faststart docs/demo.mp4
ffmpeg -y -loglevel error -framerate "$fps" -i "$F/f%05d.jpg" -vf "fps=8,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" docs/demo.gif
ls -la docs/demo.mp4 docs/demo.gif
rm -rf "$F"
