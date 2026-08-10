import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App.tsx'
import { queryClient } from './queries/queryClient'
import { InvalidateBridge } from './queries/InvalidateBridge'
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
    <QueryClientProvider client={queryClient}>
      <InvalidateBridge />
      <BrowserRouter>
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
)

// The HTML-first loader paints before this bundle is available. Give React
// one committed paint underneath it, then fade the bootstrap layer away. The
// React loader uses the same animation phase if auth or a route is still busy.
const boot = document.getElementById('sajni-boot')
if (boot) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      boot.classList.add('startup-loader--leaving')
      boot.addEventListener('transitionend', () => boot.remove(), { once: true })
      window.setTimeout(() => boot.remove(), 220)
    })
  })
}
