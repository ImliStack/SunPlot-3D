// Design history (undo / redo of inputs) and autosave of the current design in this browser.
// Click-to-install keeps its own module-level undo; this one covers every input in `params`.

import { useEffect } from 'react'
import { useSolar } from './store.js'
import { DEFAULTS } from './presets.js'

const SKIP = new Set(['day', 'hour', 'weather', 'surroundings', 'closeTrees']) // view-only changes
const LIMIT = 80
const AUTOSAVE = 'sunplot-autosave:v1'

let applying = false
const past = []
const future = []
const listeners = new Set()
const emit = () => listeners.forEach((f) => f())

const differs = (a, b) => Object.keys({ ...a, ...b }).some((k) => !SKIP.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]))

export const historyState = () => ({ canUndo: past.length > 0, canRedo: future.length > 0 })
export function onHistory(f) {
  listeners.add(f)
  return () => listeners.delete(f)
}

export function undoParams() {
  const prev = past.pop()
  if (!prev) return
  applying = true
  future.push(useSolar.getState().params)
  useSolar.setState({ params: prev })
  applying = false
  emit()
}

export function redoParams() {
  const next = future.pop()
  if (!next) return
  applying = true
  past.push(useSolar.getState().params)
  useSolar.setState({ params: next })
  applying = false
  emit()
}

/** Record input changes (grouping a slider drag into one step) and autosave the design. */
export function useParamsHistory() {
  useEffect(() => {
    let base = useSolar.getState().params
    let timer
    let save
    const unsub = useSolar.subscribe((s, prev) => {
      if (s.params === prev.params) return
      clearTimeout(save)
      save = setTimeout(() => {
        try { localStorage.setItem(AUTOSAVE, JSON.stringify({ at: Date.now(), params: useSolar.getState().params })) } catch {}
      }, 800)
      if (applying) { base = s.params; return }
      clearTimeout(timer)
      timer = setTimeout(() => {
        const now = useSolar.getState().params
        if (differs(base, now)) {
          past.push(base)
          if (past.length > LIMIT) past.shift()
          future.length = 0
          base = now
          emit()
        }
      }, 450)
    })
    return () => { unsub(); clearTimeout(timer); clearTimeout(save) }
  }, [])
}

/** The last autosaved design, if any (used when the app opens without a share link). */
export function lastAutosave() {
  try {
    const v = JSON.parse(localStorage.getItem(AUTOSAVE) ?? 'null')
    return v?.params ? { ...v, params: { ...DEFAULTS, ...v.params } } : null
  } catch {
    return null
  }
}
