import { useEffect } from 'react'
import { useSolar, SITE_SIZES } from './store.js'
import { DEFAULTS, PANELS, SITES, CLIMATES } from './presets.js'

// The URL hash carries every input that differs from the defaults, so a design can be shared:
//   #site=flat&length=30&width=18&lat=19.1

const ENUMS = { site: SITES, panel: PANELS, climate: CLIMATES }

function hashOf(params) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === DEFAULTS[k]) continue
    q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' ? String(Math.round(v * 100) / 100) : v)
  }
  const s = q.toString()
  return s ? `#${s}` : ''
}

function paramsOf(hash) {
  const q = new URLSearchParams(hash.replace(/^#/, ''))
  const out = {}
  for (const [k, raw] of q) {
    if (!(k in DEFAULTS)) continue
    const d = DEFAULTS[k]
    if (typeof d === 'boolean') out[k] = raw === '1'
    else if (typeof d === 'number') {
      const n = Number(raw)
      if (Number.isFinite(n)) out[k] = n
    } else if (ENUMS[k]) {
      if (ENUMS[k][raw]) out[k] = raw
    } else out[k] = raw
  }
  return out
}

/** A link names only what differs; start from that site type's own sizes, then apply it. */
const withSite = (p) => ({ ...(SITE_SIZES[p.site] ?? {}), ...p })

export function useHashLink() {
  useEffect(() => {
    if (location.hash) useSolar.getState().patch(withSite(paramsOf(location.hash)))
    let timer
    const unsubscribe = useSolar.subscribe((s, prev) => {
      if (s.params === prev.params) return
      // Sliders fire fast; write the address bar once they settle.
      clearTimeout(timer)
      timer = setTimeout(() => {
        const hash = hashOf(useSolar.getState().params)
        if (hash !== location.hash) history.replaceState(null, '', hash || location.pathname + location.search)
      }, 250)
    })
    const onHash = () => useSolar.getState().patch({ ...DEFAULTS, ...withSite(paramsOf(location.hash)) })
    window.addEventListener('hashchange', onHash)
    return () => {
      unsubscribe()
      clearTimeout(timer)
      window.removeEventListener('hashchange', onHash)
    }
  }, [])
}
