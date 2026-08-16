import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
    './index.html',
    './renderer/src/**/*.{ts,tsx}',
    './renderer/index.html'
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        // MeshDrop design tokens — "OLED Dark Tech Slate" (mirror of the MeshDrop
        // Mobile theme in meshdrop-mobile/src/theme/tokens.ts). Use these named
        // tokens directly (bg-meshdrop-base, border-meshdrop-hairline,
        // bg-meshdrop-cyan, ...) for the flagship command-center surfaces.
        meshdrop: {
          base: '#0B0F17', // Deep Slate Base
          surface: '#111827', // Panels / cards
          'surface-2': '#1E293B', // Elevated panels
          primary: '#6366F1', // Electric Indigo
          // Theme-aware: darker cyan in light mode for text contrast, brand
          // cyan in dark mode (see --meshdrop-cyan in index.css).
          cyan: 'rgb(var(--meshdrop-cyan) / <alpha-value>)',
          text: '#F8FAFC', // Primary text
          muted: '#94A3B8', // Muted subtext
          hairline: 'rgba(255, 255, 255, 0.08)', // border-white/10
          success: '#34D399',
          danger: '#F87171',
          offline: '#475569'
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        // Theme-aware hairline: dark strokes in light mode, white in dark mode.
        // Replaces hardcoded border-white/N that vanished on light surfaces.
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)'
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)'
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)'
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)'
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)'
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)'
        },
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)'
        },
        sidebar: {
          DEFAULT: 'rgb(var(--sidebar) / <alpha-value>)',
          foreground: 'rgb(var(--sidebar-foreground) / <alpha-value>)',
          muted: 'rgb(var(--sidebar-muted) / <alpha-value>)',
          border: 'rgb(var(--sidebar-border) / <alpha-value>)'
        },
        status: {
          online: 'rgb(var(--status-online) / <alpha-value>)',
          away: 'rgb(var(--status-away) / <alpha-value>)',
          busy: 'rgb(var(--status-busy) / <alpha-value>)',
          offline: 'rgb(var(--status-offline) / <alpha-value>)'
        },
        chart: {
          1: 'rgb(var(--chart-1) / <alpha-value>)',
          2: 'rgb(var(--chart-2) / <alpha-value>)',
          3: 'rgb(var(--chart-3) / <alpha-value>)',
          4: 'rgb(var(--chart-4) / <alpha-value>)',
          5: 'rgb(var(--chart-5) / <alpha-value>)'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)'
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'system-ui',
          'sans-serif'
        ],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace']
      },
      spacing: {
        sidebar: '260px'
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        'slide-in': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' }
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-up': 'fade-up 0.3s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
        'slide-in': 'slide-in 0.2s ease-out',
        'slide-up': 'slide-up 0.2s ease-out'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}

export default config
