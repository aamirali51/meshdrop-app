// MeshDrop Design Tokens — single source of truth.
// Generates CSS variables for both themes + drives Tailwind's theme extension
// via tailwind.config.ts. Nothing in app/pages may hard-code colors that
// belong here; add to this file instead.

export const colors = {
  // Purple accent scale — brand/accent, centric on Electric Indigo #6366F1.
  // Scale keys mirror Tailwind numeric steps for predictable use.
  accent: {
    50: '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#6366F1', // brand — Electric Indigo
    600: '#4F46E5',
    700: '#4338CA',
    800: '#3730A3',
    900: '#312E81',
    950: '#1E1B4B',
  },
  cyan: {
    50: '#ECFEFF',
    400: '#22D3EE',
    500: '#06B6D4', // brand — Cyber Cyan (dark)
    600: '#0891B2', // brand-ish in light mode
  },
  // Neutral ramp — raw r/g/b triplets consumed as rgb(var(--…)).
  // See applyThemeVars() below for the actual CSS variable values.
  neutral: {
    50: '248 250 252', // slate-50
    100: '241 245 249', // slate-100
    200: '226 232 240', // slate-200 (light border/input)
    600: '71 85 105',
    700: '51 65 85',
    800: '30 41 59', // dark border/input/surface-2
    900: '17 24 39', // dark card
    950: '11 15 23', // dark base
  },
  success: '#34D399',
  warning: '#F59E0B',
  danger: '#F87171',
} as const

export const spacing = {
  // 4px scale — index is the multiplier (spacing[1] = 4px). Tailwind already
  // uses this; these are the semantic aliases the primitives lean on.
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
  12: '48px',
  16: '64px',
  24: '96px',
} as const

export const radii = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  full: '9999px',
} as const

export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.08)',
  md: '0 4px 16px -4px rgba(0,0,0,0.18)',
  lg: '0 12px 40px -12px rgba(0,0,0,0.30)',
  glowIndigo: '0 0 24px -4px rgba(99,102,241,0.45)',
  glowCyan: '0 0 24px -4px rgba(6,182,212,0.45)',
} as const

export const font = {
  sizes: {
    xs: '0.75rem', // 12px
    sm: '0.8125rem', // 13px — dense UI
    base: '0.875rem', // 14px — app body
    lg: '1rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 800,
  },
  lineHeights: {
    tight: 1.1,
    snug: 1.25,
    normal: 1.5,
  },
} as const

export const motionTokens = {
  durations: {
    instant: '80ms',
    fast: '150ms',
    base: '200ms',
    slow: '300ms',
    slower: '450ms',
  },
  easings: {
    out: 'cubic-bezier(0.16,1,0.3,1)', // spring-ish out
    inOut: 'cubic-bezier(0.4,0,0.2,1)',
    spring: 'cubic-bezier(0.34,1.56,0.64,1)',
  },
} as const

// --- CSS variable generation ---

type ThemeVars = Record<string, string>

// Light theme variable map. Keys become --<key>: <value>.
// Values that are "r g b" triplets pair with Tailwind's rgb(var(--…)/alpha) pattern.
const lightVars: ThemeVars = {
  background: '248 250 252',
  foreground: '15 23 42',
  card: '255 255 255',
  'card-foreground': '15 23 42',
  popover: '255 255 255',
  'popover-foreground': '15 23 42',
  primary: '99 102 241',
  'primary-foreground': '255 255 255',
  secondary: '226 232 240',
  'secondary-foreground': '15 23 42',
  muted: '226 232 240',
  'muted-foreground': '100 116 139',
  accent: '226 232 240',
  'accent-foreground': '15 23 42',
  destructive: '220 38 38',
  'destructive-foreground': '255 255 255',
  border: '226 232 240',
  input: '226 232 240',
  ring: '99 102 241',
  radius: radii.md,
  hairline: '15 23 42',
  'meshdrop-cyan': '8 145 178',
  'glass-bg': 'rgba(255,255,255,0.72)',
  'glass-border': 'rgba(15,23,42,0.12)',
  'chart-1': '99 102 241',
  'chart-2': '6 182 212',
  'chart-3': '71 85 105',
  'chart-4': '148 163 184',
  'chart-5': '52 211 153',
  sidebar: '241 245 249',
  'sidebar-foreground': '15 23 42',
  'sidebar-muted': '226 232 240',
  'sidebar-border': '226 232 240',
  'status-online': '8 145 178',
  'status-away': '180 83 9',
  'status-busy': '220 38 38',
  'status-offline': '100 116 139',
  success: '52 211 153',
  warning: '245 158 11',
  danger: '248 113 113',
  // New token-layer variables (consumed by primitives via Tailwind or var()).
  'radius-sm': radii.sm,
  'radius-lg': radii.lg,
  'radius-xl': radii.xl,
  'shadow-sm': shadows.sm,
  'shadow-md': shadows.md,
  'shadow-lg': shadows.lg,
  'font-size-sm': font.sizes.sm,
  'font-size-base': font.sizes.base,
}

const darkVars: ThemeVars = {
  background: '11 15 23',
  foreground: '248 250 252',
  card: '17 24 39',
  'card-foreground': '248 250 252',
  popover: '17 24 39',
  'popover-foreground': '248 250 252',
  primary: '99 102 241',
  'primary-foreground': '248 250 252',
  secondary: '30 41 59',
  'secondary-foreground': '248 250 252',
  muted: '30 41 59',
  'muted-foreground': '148 163 184',
  accent: '30 41 59',
  'accent-foreground': '248 250 252',
  destructive: '248 113 113',
  'destructive-foreground': '255 255 255',
  border: '30 41 59',
  input: '30 41 59',
  ring: '99 102 241',
  radius: radii.md,
  hairline: '255 255 255',
  'meshdrop-cyan': '6 182 212',
  'glass-bg': 'rgba(17,24,39,0.65)',
  'glass-border': 'rgba(255,255,255,0.08)',
  'chart-1': '99 102 241',
  'chart-2': '6 182 212',
  'chart-3': '30 41 59',
  'chart-4': '148 163 184',
  'chart-5': '52 211 153',
  sidebar: '11 15 23',
  'sidebar-foreground': '248 250 252',
  'sidebar-muted': '30 41 59',
  'sidebar-border': '30 41 59',
  'status-online': '6 182 212',
  'status-away': '245 158 11',
  'status-busy': '248 113 113',
  'status-offline': '71 85 105',
  success: '52 211 153',
  warning: '245 158 11',
  danger: '248 113 113',
  'radius-sm': radii.sm,
  'radius-lg': radii.lg,
  'radius-xl': radii.xl,
  'shadow-sm': shadows.sm,
  'shadow-md': shadows.md,
  'shadow-lg': shadows.lg,
  'font-size-sm': font.sizes.sm,
  'font-size-base': font.sizes.base,
}

export const themeVars = { light: lightVars, dark: darkVars } as const

/** Build a CSS block. Call from index.css generation or runtime if needed. */
export function cssVarsBlock(theme: 'light' | 'dark'): string {
  const vars = theme === 'dark' ? darkVars : lightVars
  const lines = Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`)
  return lines.join('\n')
}

/** Injects the CSS variables for `theme` onto `el` (default: document.documentElement). */
export function applyThemeVars(theme: 'light' | 'dark', el: HTMLElement | null = null): void {
  const target = el ?? document.documentElement
  const vars = theme === 'dark' ? darkVars : lightVars
  for (const [k, v] of Object.entries(vars)) target.style.setProperty(`--${k}`, v)
}
