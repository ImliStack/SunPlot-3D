// Grabbing finished frames from the 3D view for reports, outside React.

let waiting = []
let rig = null
let renderer = null

/** The camera controls, e.g. to pause orbiting during a paint stroke. */
export const getControls = () => rig?.controls ?? null

/** gl, scene and camera of the 3D view, for exports. */
export const getRenderer = () => renderer

/** Called by <Rig>: the camera controls plus its preset-view function. */
export function registerRig(api) {
  rig = api
}

/** Called by the scene: what a direct render needs when frames are paused (background tab). */
export function registerRenderer(api) {
  renderer = api
}

/** Called by <Snapshot> after the composer has drawn a frame. */
export function flushCaptures(canvas) {
  if (!waiting.length) return
  const url = canvas.toDataURL('image/jpeg', 0.9)
  waiting.forEach((resolve) => resolve(url))
  waiting = []
}

/** Draw the scene right now (no post effects) and read it back. */
function renderNow() {
  rig?.controls.update(0)
  renderer.gl.render(renderer.scene, renderer.camera)
  return renderer.gl.domElement.toDataURL('image/jpeg', 0.9)
}

/** Wait n frames. A hidden tab gets neither frames nor timely timers, so it doesn't wait at all. */
export const nextFrames = async (n = 2) => {
  if (document.hidden) return
  for (let i = 0; i < n; i++) {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 50)
      requestAnimationFrame(() => {
        clearTimeout(t)
        resolve()
      })
    })
  }
}

/**
 * The current view as a JPEG data URL. Normally taken from the next composed frame; if no frame
 * comes within 400 ms, the scene is rendered directly (without post effects) and read back.
 */
export function captureView() {
  if (document.hidden && renderer) return Promise.resolve(renderNow())
  return new Promise((resolve) => {
    waiting.push(resolve)
    setTimeout(() => {
      if (!waiting.includes(resolve) || !renderer) return
      waiting = waiting.filter((r) => r !== resolve)
      resolve(renderNow())
    }, 400)
  })
}

/** A preset view (e.g. 'top', 'home'), captured, then the camera put back where it was. */
export async function captureFrom(type) {
  if (!rig) return captureView()
  rig.controls.saveState()
  rig.go(type, false)
  rig.controls.update(0)
  await nextFrames(4)
  const url = await captureView()
  rig.controls.reset(false)
  rig.controls.update(0)
  await nextFrames(2)
  return url
}
