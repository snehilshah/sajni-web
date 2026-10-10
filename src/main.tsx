import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { MotionConfig } from 'framer-motion'
import 'virtual:theme-presets.css'
import './index.css'
import App from './App.tsx'
import { queryClient } from './queries/queryClient'
import { InvalidateBridge } from './queries/InvalidateBridge'
import log from './lib/logger'
import { API_BASE } from './auth/client'
import { installChunkReload } from './lib/chunkReload'
import { installErrorNet } from './lib/errorNet'

log.info({ api: API_BASE, env: import.meta.env.MODE }, 'sajni init')

installChunkReload()
installErrorNet()

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
