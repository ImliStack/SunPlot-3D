// Click-to-install tools: which candidate modules a click (or drag) on one module affects.
// Modelled on how Aurora, HelioScope and OpenSolar let designers edit an auto layout.

export const TOOLS = [
  { key: 'module', label: 'Module', icon: 'panel', shortcut: 'M', hint: 'one module' },
  { key: 'row', label: 'Row', icon: 'rowsel', shortcut: 'R', hint: 'the whole row' },
  { key: 'column', label: 'Column', icon: 'colsel', shortcut: 'C', hint: 'the whole column' },
  { key: 'array', label: 'Array', icon: 'heat', shortcut: 'A', hint: 'the whole array' },
  { key: 'paint', label: 'Paint', icon: 'brush', shortcut: 'P', hint: 'drag across modules' },
]

/** Per-array index lists, built once per candidate layout. */
export function indexArrays(candidates) {
  const byArray = candidates.arrays.map(() => [])
  candidates.panels.forEach((p, i) => byArray[p.arr]?.push(i))
  return byArray
}

/** Candidate indices affected by `tool` when acting on module `i`. */
export function targetsFor(candidates, byArray, i, tool) {
  const p = candidates.panels[i]
  if (!p) return []
  if (tool === 'module' || tool === 'paint') return [i]
  const same = byArray[p.arr] ?? []
  if (tool === 'array') return same
  if (tool === 'row') return same.filter((j) => candidates.panels[j].row === p.row)
  // Column: same position along the row axis (within half a module), every row and stack slot.
  const tol = candidates.module.du / 2
  return same.filter((j) => Math.abs(candidates.panels[j].col - p.col) < tol)
}

/** A short description of what a click would do, for the hint line. */
export function describe(candidates, targets, tool, installing) {
  if (!targets.length) return ''
  const p = candidates.panels[targets[0]]
  const a = candidates.arrays[p.arr]
  const what = { module: 'module', paint: 'module', row: 'row', column: 'column', array: 'all of' }[tool]
  const n = targets.length
  const verb = installing ? 'install' : 'remove'
  if (tool === 'array') return `Click to ${verb} all ${n} modules of ${a.name}`
  if (n === 1) return `Click to ${verb} this ${what} · ${a.name}`
  return `Click to ${verb} this ${what} · ${n} modules · ${a.name}`
}
