// Saved projects in this browser: a customer with several designs (one marked primary), each a
// full snapshot of the inputs plus the click-to-install selection and its headline numbers.
// localStorage only: nothing leaves the device.

const KEY = 'sunplot-projects'

export function loadProjects() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function saveProjects(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    return true
  } catch {
    return false // storage full or blocked
  }
}

const uid = () => Math.random().toString(36).slice(2, 10)

/** A design snapshot from the live state. */
export function snapshot(name, { params, install, numbers }) {
  return {
    id: uid(),
    name,
    saved: Date.now(),
    params: JSON.parse(JSON.stringify(params)),
    install: { mode: install.mode, sel: install.mode === 'manual' ? { ...install.sel } : {} },
    numbers,
  }
}

export function newProject(name, customer, design) {
  return { id: uid(), name, customer, created: Date.now(), primary: design.id, designs: [design] }
}
