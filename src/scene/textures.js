import * as THREE from 'three'

// Every surface texture is painted on a canvas at start-up — no image files to download.

function canvas(w, h, paint) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

let cache = null

function noise(g, w, h, n, [r, gg, b], alpha) {
  let seed = n
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < n; i++) {
    const l = 0.8 + rnd() * 0.4
    g.fillStyle = `rgba(${r * l}, ${gg * l}, ${b * l}, ${alpha})`
    g.fillRect(rnd() * w, rnd() * h, 2, 2)
  }
}

/** Lazily build the shared textures (needs `document`). */
export function textures() {
  if (cache) return cache
  cache = {
    // Module face: 6 × 12 half-cut cells, busbars and a thin silver frame — portrait, long side on v.
    module: canvas(240, 480, (g, w, h) => {
      g.fillStyle = '#2a2f37'
      g.fillRect(0, 0, w, h)
      const pad = 4
      g.fillStyle = '#0d1a2e'
      g.fillRect(pad, pad, w - 2 * pad, h - 2 * pad)
      const cols = 6
      const rows = 12
      const cw = (w - 2 * pad) / cols
      const ch = (h - 2 * pad) / rows
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = pad + c * cw + 1.2
          const y = pad + r * ch + 1.2
          const grad = g.createLinearGradient(x, y, x + cw, y + ch)
          grad.addColorStop(0, '#1d3a63')
          grad.addColorStop(1, '#13284a')
          g.fillStyle = grad
          g.fillRect(x, y, cw - 2.4, ch - 2.4)
          g.fillStyle = 'rgba(190, 205, 230, .32)'
          for (let b = 1; b <= 3; b++) g.fillRect(x + ((cw - 2.4) * b) / 4 - 0.5, y, 1, ch - 2.4)
        }
      }
      // The split line of half-cut modules.
      g.fillStyle = 'rgba(200, 210, 225, .35)'
      g.fillRect(pad, h / 2 - 1, w - 2 * pad, 2)
    }),
    plaster: canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#ece4d6'
      g.fillRect(0, 0, w, h)
      noise(g, w, h, 5200, [222, 212, 196], 0.25)
    }),
    asphalt: canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#4a4d52'
      g.fillRect(0, 0, w, h)
      noise(g, w, h, 6000, [70, 72, 76], 0.6)
      noise(g, w, h, 900, [110, 112, 116], 0.5)
    }),
    concrete: canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#b9b7b1'
      g.fillRect(0, 0, w, h)
      noise(g, w, h, 4000, [170, 168, 160], 0.35)
      g.fillStyle = 'rgba(0,0,0,.12)'
      g.fillRect(0, 0, w, 2)
      g.fillRect(0, 0, 2, h)
    }),
    brick: canvas(128, 128, (g, w, h) => {
      g.fillStyle = '#8c8279'
      g.fillRect(0, 0, w, h)
      for (let r = 0; r < 8; r++) {
        for (let c = -1; c < 4; c++) {
          const x = c * 32 + (r % 2) * 16
          const k = 0.85 + ((r * 7 + c * 13) % 9) / 40
          g.fillStyle = `rgb(${150 * k}, ${70 * k}, ${52 * k})`
          g.fillRect(x + 1, r * 16 + 1, 30, 14)
        }
      }
    }),
    // Terminal curtain wall: blue-grey glass between aluminium mullions and floor slabs.
    curtain: canvas(256, 256, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#5f7f99')
      grad.addColorStop(1, '#2f4a61')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      g.fillStyle = 'rgba(255,255,255,.08)'
      for (let i = 0; i < 6; i++) g.fillRect(i * 48 + 10, 0, 18, h)
      g.fillStyle = '#c9cfd4'
      for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h)
      g.fillRect(0, 0, w, 6)
      g.fillRect(0, h / 2, w, 3)
    }),
    backsheet: canvas(8, 8, (g) => {
      g.fillStyle = '#e8e8e4'
      g.fillRect(0, 0, 8, 8)
    }),
    shingles: canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#6b4a3a'
      g.fillRect(0, 0, w, h)
      const rows = 8
      for (let r = 0; r < rows; r++) {
        const y = (r * h) / rows
        const off = r % 2 ? 16 : 0
        for (let x = -off; x < w; x += 32) {
          const shade = 0.85 + ((x * 7 + r * 13) % 17) / 60
          g.fillStyle = `rgb(${110 * shade}, ${76 * shade}, ${60 * shade})`
          g.fillRect(x + 1, y + 1, 30, h / rows - 3)
        }
        g.fillStyle = 'rgba(0,0,0,.25)'
        g.fillRect(0, y + h / rows - 2, w, 2)
      }
    }),
    membrane: canvas(128, 128, (g, w, h) => {
      g.fillStyle = '#d9d6cf'
      g.fillRect(0, 0, w, h)
      g.fillStyle = 'rgba(0,0,0,.05)'
      for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h)
    }),
    grass: canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#7b9160'
      g.fillRect(0, 0, w, h)
      let seed = 7
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      for (let i = 0; i < 2600; i++) {
        const l = 0.8 + rnd() * 0.35
        g.fillStyle = `rgba(${90 * l}, ${120 * l}, ${62 * l}, .55)`
        g.fillRect(rnd() * w, rnd() * h, 2, 2)
      }
    }),
    gravel: canvas(128, 128, (g, w, h) => {
      g.fillStyle = '#b7ad9c'
      g.fillRect(0, 0, w, h)
      let seed = 3
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      for (let i = 0; i < 1200; i++) {
        const l = 0.75 + rnd() * 0.4
        g.fillStyle = `rgba(${170 * l}, ${160 * l}, ${145 * l}, .8)`
        g.fillRect(rnd() * w, rnd() * h, 2, 2)
      }
    }),
  }
  for (const k of ['shingles', 'membrane', 'grass', 'gravel', 'plaster', 'asphalt', 'concrete', 'brick', 'curtain']) {
    cache[k].wrapS = cache[k].wrapT = THREE.RepeatWrapping
  }
  return cache
}

/** A round label sprite texture, e.g. the compass letters. */
export function labelTexture(text, { color = '#1f2937', bg = 'rgba(255,255,255,.85)' } = {}) {
  return canvas(128, 128, (g) => {
    g.fillStyle = bg
    g.beginPath()
    g.arc(64, 64, 56, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = color
    g.font = '600 64px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 64, 68)
  })
}
