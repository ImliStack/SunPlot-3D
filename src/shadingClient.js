import { useEffect } from 'react'
import { useSolar } from './store.js'
import { useLayout, shadingKey } from './hooks.js'
import { buildScene } from './shading.js'
import { siteRadius, treesFor } from './context.js'

let worker = null
let nextId = 0

/** Re-run the shading study in a worker whenever the design, trees or latitude change. */
export function useShadingStudy() {
  const params = useSolar((s) => s.params)
  const install = useSolar((s) => s.install)
  const layout = useLayout()
  const key = shadingKey(params, install)
  useEffect(() => {
    const { shading, setShading } = useSolar.getState()
    if (shading.key === key && shading.status === 'ready') return
    const id = ++nextId
    const timer = setTimeout(() => {
      worker ??= new Worker(new URL('./shading.worker.js', import.meta.url), { type: 'module' })
      const trees = treesFor(siteRadius(layout), { far: params.surroundings, close: params.closeTrees })
      const scene = buildScene(layout, { trees, azimuth: params.azimuth })
      setShading({ status: 'running', key, progress: 0 })
      worker.onmessage = (e) => {
        if (e.data.id !== nextId) return // a newer study has started
        if (e.data.result) setShading({ status: 'ready', key, ...e.data.result })
        else useSolar.setState((s) => ({ shading: { ...s.shading, progress: e.data.progress } }))
      }
      worker.postMessage({ id, scene, lat: params.lat })
    }, 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, layout])
}
