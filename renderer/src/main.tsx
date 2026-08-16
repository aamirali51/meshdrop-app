import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Bundled fonts (offline, CSP-safe). The previous build declared Inter /
// JetBrains Mono in the Tailwind config but never shipped them.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/inter/900.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'

const rootEl = document.getElementById('root')

ReactDOM.createRoot(rootEl!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
