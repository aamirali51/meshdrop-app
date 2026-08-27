import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Production CSP: no ws:, no http://localhost:*, no unsafe-inline scripts.
// Dev keeps the permissive meta tag from index.html (Vite HMR / Fast Refresh).
function strictCspPlugin(): Plugin {
  return {
    name: 'strict-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
        "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self' data: blob:; media-src 'self' http://127.0.0.1:* http://localhost:* data: blob:; connect-src 'self' http://127.0.0.1:* http://localhost:*; worker-src 'self' blob:; child-src 'self' blob:; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none';\" />"
      )
    }
  }
}

export default defineConfig({
  plugins: [react(), strictCspPlugin()],
  root: 'renderer',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    commonjsOptions: {
      include: [/src[\\/]shared/, /node_modules/]
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'renderer/src'),
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  optimizeDeps: {
    include: ['@shared/protocol']
  }
})
