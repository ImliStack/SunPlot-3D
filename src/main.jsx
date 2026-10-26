import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { useSolar } from './store.js'
import './styles.css'

// Set the theme before the first paint so a dark-theme visit never flashes light.
document.documentElement.dataset.theme = useSolar.getState().theme

// Dev-only handle for scripted screenshots and checks.
if (import.meta.env.DEV) {
  window.__solar = useSolar
  import('./scene/capture.js').then(({ getControls }) => { window.__controls = getControls })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
