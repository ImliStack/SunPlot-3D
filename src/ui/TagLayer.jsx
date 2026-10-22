import { useMemo } from 'react'
import { useSolar } from '../store.js'
import { useLayout } from '../hooks.js'
import { arrayTags, dimTags } from '../scene/Overlays.jsx'

/** DOM labels over the canvas; <TagProjector> inside the scene moves them every frame. */
export default function TagLayer() {
  const params = useSolar((s) => s.params)
  const layers = useSolar((s) => s.layers)
  const layout = useLayout()
  const tags = useMemo(() => [
    ...(layers.labels ? arrayTags(layout, params) : []),
    ...(layers.dims ? dimTags(layout) : []),
  ], [layout, params, layers])
  return (
    <div className="tag-layer" aria-hidden="true">
      {tags.map((t) => (
        <div key={t.id} id={`tag-${t.id}`} className="tag-anchor" style={{ opacity: 0 }}>
          {t.kind === 'array' ? (
            <div className="array-tag">
              <b>{t.letter}</b>
              <span><strong>{t.name}</strong><small>{t.detail}</small></span>
            </div>
          ) : (
            <div className="dim-tag">{t.label}</div>
          )}
        </div>
      ))}
    </div>
  )
}
