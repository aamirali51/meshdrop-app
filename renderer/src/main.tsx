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
