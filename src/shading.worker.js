import { computeShading } from './shading.js'

// Runs the ray caster off the main thread; progress is reported every few hundred modules.
self.onmessage = (e) => {
  const { id, scene, lat } = e.data
  const result = computeShading(scene, lat, (progress) => self.postMessage({ id, progress }))
  self.postMessage({ id, result }, [result.perModule.buffer])
}
