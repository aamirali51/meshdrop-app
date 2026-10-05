import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/inter/900.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'

// Guard against injected VM/extension scripts (e.g. VM56 reportAllChanges/startTime
// banner) that pollute the console but run outside the React tree. Ignore only
// that known noise — real app errors still surface via ErrorBoundary.
if (typeof window !== 'undefined') {
  window.addEventListener(
    'error',
    (e) => {
      const msg = e?.message || ''
      const file = (e as { filename?: string })?.filename || ''
      if (msg.includes('reportAllChanges') || msg.includes('startTime') || file.startsWith('VM')) {
        e.preventDefault()
      }
    },
    true
  )
  window.addEventListener('unhandledrejection', (e) => {
    const reason = (e as { reason?: unknown })?.reason
    const msg = typeof reason === 'string' ? reason : (reason as { message?: string })?.message || ''
    if (msg.includes('reportAllChanges') || msg.includes('startTime')) {
      e.preventDefault()
    }
  })
}

if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

const rootEl = document.getElementById('root')

ReactDOM.createRoot(rootEl!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
