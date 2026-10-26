// Record a ~55 s 16:9 social video (X / LinkedIn) of the real app with burned-in captions, since
// feeds autoplay muted. The tour plays twice in one page: the first pass warms the map tiles and the
// NASA weather cache, and only the second pass is kept. Output: docs/social/sunplot-x.mp4
// Needs Google Chrome (headed, for WebGL), ffmpeg, and internet (satellite, buildings, NASA POWER).
//   node scripts/social-video.mjs
import fs from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const out = 'outputs/social'
const size = { width: 1280, height: 720 }
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
fs.mkdirSync('docs/social', { recursive: true })

const port = 5196
const base = `http://127.0.0.1:${port}`
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] })
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 30000)
  vite.stdout.on('data', (d) => { if (/Local|ready in/.test(String(d))) { clearTimeout(t); resolve() } })
})

// Headed so WebGL runs on the GPU; the window matches the video so frames have no grey band.
const browser = await chromium.launch({
  headless: false,
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: [`--window-size=${size.width},${size.height + 87}`, '--hide-scrollbars'],
})
const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: out, size } })
const page = await context.newPage()
const t0 = Date.now()
const wait = (ms) => page.waitForTimeout(ms)
const js = (fn, arg) => page.evaluate(fn, arg)

const caption = (text, sub = '') => js(([text, sub]) => {
  let el = document.getElementById('social-caption')
  if (!el) {
    el = document.createElement('div')
    el.id = 'social-caption'
    document.body.append(el)
    const b = document.createElement('div')
    b.id = 'social-brand'
    b.innerHTML = '<span>Imli</span>Stack · imlistack.com'
    document.body.append(b)
    const s = document.createElement('style')
    s.textContent = '#social-caption{position:fixed;z-index:999;left:50%;bottom:104px;transform:translateX(-50%);padding:12px 22px;border-radius:14px;background:rgba(18,20,26,.86);color:#fff;font:650 26px/1.25 Inter,system-ui;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.35);transition:opacity .35s;max-width:860px}#social-caption small{display:block;font-weight:500;font-size:17px;color:#f2c45a;margin-top:4px}#social-caption.hide{opacity:0}#social-brand{position:fixed;z-index:999;left:50%;transform:translateX(-50%);top:82px;padding:7px 12px;border-radius:10px;background:rgba(18,20,26,.86);color:#fff;font:650 15px/1 Inter,system-ui}#social-brand span{color:#f2b33d}'
    document.head.append(s)
  }
  el.classList.toggle('hide', !text)
  if (text) el.innerHTML = text + (sub ? `<small>${sub}</small>` : '')
}, [text, sub])

const st = (code) => js(new Function(`const s = window.__solar.getState(); ${code}`))
/** Slide the sun through the day over `ms`. */
const sweepSun = (from, to, ms) => js(([from, to, ms]) => new Promise((resolve) => {
  const s = window.__solar.getState()
  const start = performance.now()
  const step = (now) => {
    const f = Math.min(1, (now - start) / ms)
    s.set('hour', from + (to - from) * f)
    if (f < 1) requestAnimationFrame(step)
    else resolve()
  }
  requestAnimationFrame(step)
}), [from, to, ms])
/** Turn the camera slowly while a scene plays. */
const orbit = (deg, ms) => js(([deg, ms]) => new Promise((resolve) => {
  const c = window.__controls?.()
  if (!c) return resolve()
  const start = performance.now()
  let last = start
  const step = (now) => {
    c.rotate(((now - last) / ms) * deg * Math.PI / 180, 0, true)
    last = now
    if (now - start < ms) requestAnimationFrame(step)
    else resolve()
  }
  requestAnimationFrame(step)
}), [deg, ms])

async function tour() {
  await caption('')
  await st("s.setMode('studio'); s.setInstallMode('auto'); s.setSite('gable'); s.patch({ day: 172, hour: 7, weather: 'clear' }); s.setTab('system')")
  await wait(2500)
  await caption('SunPlot 3D: plan a solar system in your browser', 'Free · no login · open source')
  await sweepSun(7, 17, 4200)
  await caption('From a 3 kW home…', 'to a 1.8 MWp airport, carports and factories')
  await st("s.setSite('airport'); s.patch({ hour: 10.5 })"); await wait(2600)
  await st("s.setSite('industrial'); s.patch({ hour: 10 })"); await wait(2600)
  await caption('Ray-cast shading of every module, all year', 'Real trees, rows, tanks and neighbours')
  await st("s.setSite('terrace'); s.patch({ closeTrees: true, day: 355, hour: 9.5 }); s.toggleLayer('shade')"); await wait(3400)
  await st("s.toggleLayer('shade'); s.patch({ closeTrees: false })")
  await caption('10 years of NASA weather', 'Rain, dust, snow and heat losses, P50 / P90')
  await st("s.setSite('flat'); s.patch({ day: 196, hour: 11, weather: 'rain' })"); await wait(2600)
  await st("s.patch({ weather: 'auto', day: 172 }); s.setTab('climate')"); await wait(2200)

  // Site survey: a hospital in Jaipur, picked from satellite and opened in 3D.
  await caption('Survey any roof in India from satellite', 'No site visit: Overture building outlines + PM Surya Ghar subsidy')
  await st("s.setTab('system'); s.setMode('survey'); s.patchSurvey({ center: [75.8073, 26.8540], view: [75.8073, 26.8540], address: 'Malviya Nagar, Jaipur', state: 'Rajasthan', poiCats: ['hospital', 'school', 'mall', 'fuel', 'bank', 'supermarket'], map3d: false })")
  await wait(4500)
  await js(() => window.__surveyMap?.jumpTo({ center: [75.8073, 26.854], zoom: 15.5 }))
  await page.waitForFunction(() => (window.__solar.getState().survey.poiList ?? []).length > 5, null, { timeout: 30000 }).catch(() => {})
  await caption('Schools, hospitals, malls, petrol pumps…', 'Pick a public building and size its roof')
  await wait(2200)
  await st("const p = s.survey.poiList.find((x) => x.name === 'Integral Hospital') ?? s.survey.poiList.find((x) => x.cat === 'hospital'); if (p) s.selectPlace(p)")
  await page.waitForFunction(() => !!window.__solar.getState().survey.ring, null, { timeout: 20000 }).catch(() => {})
  await wait(3500)
  await st("s.patchSurvey({ map3d: true })"); await wait(3200)
  await caption('Opened in 3D, with its own facade', 'Modules already placed where the sun is best')
  await js(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Open this design'))?.click())
  await wait(3600)

  await caption('Strings, wiring diagram, cables and BOM', 'Checked against the site’s record cold and heat')
  await st("s.setTab('electrical')"); await wait(3200)
  await caption('Payback, IRR, loans and RESCO tariffs', 'Homes, businesses (after tax) and zero-capex PPAs')
  await st("s.patch({ buyer: 'resco' }); s.setTab('money')"); await wait(3200)
  await st("s.patch({ buyer: 'home' })")
  await caption('Branded PDF, CAD, 3D model and a customer link', 'Everything a solar installer sends to close the deal')
  await js(() => document.querySelector('[aria-label="Export files"]')?.click())
  await wait(2800)
  await page.keyboard.press('Escape')
  await js(() => document.querySelector('[aria-label="Export files"]')?.click())
  await st("s.setTab('system'); s.cameraCommand('home')")
  await caption('Try it free 👇', 'sunplot-3d.imlistack.workers.dev')
  await orbit(70, 3000)
  await caption('Built by ImliStack', 'imlistack.com · open source on GitHub')
  await wait(2600)
}

let keepFrom = 0
try {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('solar-theme', 'light')
      localStorage.setItem('solar-panels', JSON.stringify({ left: true, right: true }))
    } catch {}
  })
  await page.goto(`${base}/`)
  await page.waitForFunction(() => !!window.__solar, null, { timeout: 30000 })
  await wait(3000)
  await tour() // warm-up pass: tiles, buildings, places, climate
  await page.reload()
  await page.waitForFunction(() => !!window.__solar, null, { timeout: 30000 })
  await wait(3000)
  keepFrom = (Date.now() - t0) / 1000
  await tour()
} finally {
  const video = page.video()
  await context.close()
  await browser.close()
  vite.kill()
  const webm = await video.path()
  // H.264 High, yuv420p, 30 fps, faststart: X's and LinkedIn's recommended upload format.
  const file = 'docs/social/sunplot-x.mp4'
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(keepFrom + 0.3), '-i', webm, '-r', '30', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', '-an', file])
  const d = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim()
  console.log(JSON.stringify({ file, seconds: Number(d), mb: +(fs.statSync(file).size / 1e6).toFixed(1) }))
}
