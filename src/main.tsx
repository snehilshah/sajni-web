import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import log from './lib/logger'

log.info({ api: import.meta.env.VITE_API_URL || '/api', env: import.meta.env.MODE }, 'sajni init')

// Register the minimal service worker so Android Chrome installs Sajni as a
// WebAPK — required for the manifest's `share_target` (share a UPI SMS → Sajni)
// to appear in the system share sheet. Production only; it does no caching.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => log.warn({ e }, 'sw register failed'))
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
