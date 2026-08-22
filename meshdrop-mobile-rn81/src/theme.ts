import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { Appearance, type ColorSchemeName } from 'react-native'
import RNFS from 'react-native-fs'

export interface ThemeTokens {
  isDark: boolean
  // Surfaces
  bg: string
  bgDeep: string
  bgCard: string
  bgCardHover: string
  bgElevated: string
  bgInput: string
  bgInputFocus: string
  bgGlass: string
  bgGlassHeavy: string
  bgGlassLight: string

  // Hairlines & Borders
  border: string
  borderLight: string
  borderFocus: string
  cardBorder: string
  cardBorderHover: string
  hairline: string

  // Signature Electric Indigo / Violet
  primary: string
  primaryHover: string
  primaryGlow: string
  primarySoft: string

  // Cyber Cyan Accent
  accent: string
  accentHover: string
  accentGlow: string
  accentSoft: string

  // Ultraviolet Accent
  purple: string
  purpleGlow: string
  purpleSoft: string

  // Typography
  text: string
  textSecondary: string
  muted: string
  subtle: string

  // Status & Telemetry
  success: string
  successGlow: string
  successBg: string
  successBorder: string

  warning: string
  warn: string
  warningGlow: string
  warningBg: string
  warningBorder: string

  danger: string
  dangerGlow: string
  dangerBg: string
  dangerSoft: string
  dangerBorder: string

  // Navigation & Shell Components
  dockBg: string
  headerBg: string
  statusBarStyle: 'dark-content' | 'light-content'
  statusBarBg: string
  modalBackdrop: string
  qrFg: string
  qrBg: string

  // Shadows
  shadowSm: {
    shadowColor: string
    shadowOffset: { width: number; height: number }
    shadowOpacity: number
    shadowRadius: number
    elevation: number
  }
  shadowMd: {
    shadowColor: string
    shadowOffset: { width: number; height: number }
    shadowOpacity: number
    shadowRadius: number
    elevation: number
  }
  shadowLg: {
    shadowColor: string
    shadowOffset: { width: number; height: number }
    shadowOpacity: number
    shadowRadius: number
    elevation: number
  }

  // Geometry & Radii
  radiusXs: number
  radiusSm: number
  radius: number
  radiusLg: number
  radiusXl: number
  radiusFull: number
}

// ─── Pristine Light Design System Tokens ─────────────────────────────────────
export const lightTheme: ThemeTokens = {
  isDark: false,
  bg: '#F8FAFC',          // Clean slate canvas
  bgDeep: '#F1F5F9',      // Elevated background
  bgCard: '#FFFFFF',      // Pure white card plate
  bgCardHover: '#F8FAFC',
  bgElevated: '#F1F5F9',  // Secondary container
  bgInput: '#F8FAFC',
  bgInputFocus: '#EEF2FF',
  bgGlass: 'rgba(255, 255, 255, 0.88)',
  bgGlassHeavy: 'rgba(255, 255, 255, 0.96)',
  bgGlassLight: 'rgba(255, 255, 255, 0.72)',

  border: 'rgba(15, 23, 42, 0.08)',
  borderLight: 'rgba(15, 23, 42, 0.05)',
  borderFocus: 'rgba(79, 70, 229, 0.40)',
  cardBorder: 'rgba(15, 23, 42, 0.07)',
  cardBorderHover: 'rgba(79, 70, 229, 0.25)',
  hairline: 'rgba(15, 23, 42, 0.06)',

  primary: '#4F46E5',         // Indigo 600
  primaryHover: '#4338CA',
  primaryGlow: 'rgba(79, 70, 229, 0.18)',
  primarySoft: '#EEF2FF',     // Indigo 50

  accent: '#0891B2',          // Cyan 600
  accentHover: '#0E7490',
  accentGlow: 'rgba(8, 145, 178, 0.16)',
  accentSoft: '#ECFEFF',      // Cyan 50

  purple: '#9333EA',          // Purple 600
  purpleGlow: 'rgba(147, 51, 234, 0.16)',
  purpleSoft: '#FAF5FF',      // Purple 50

  text: '#0F172A',            // Slate 900
  textSecondary: '#475569',   // Slate 600
  muted: '#64748B',           // Slate 500
  subtle: '#94A3B8',          // Slate 400

  success: '#059669',         // Emerald 600
  successGlow: 'rgba(5, 150, 105, 0.18)',
  successBg: '#ECFDF5',       // Emerald 50
  successBorder: 'rgba(5, 150, 105, 0.25)',

  warning: '#D97706',         // Amber 600
  warn: '#D97706',
  warningGlow: 'rgba(217, 119, 6, 0.16)',
  warningBg: '#FFFBEB',       // Amber 50
  warningBorder: 'rgba(217, 119, 6, 0.25)',

  danger: '#E11D48',          // Rose 600
  dangerGlow: 'rgba(225, 29, 72, 0.16)',
  dangerBg: '#FFF1F2',        // Rose 50
  dangerSoft: '#FFF1F2',      // Rose 50
  dangerBorder: 'rgba(225, 29, 72, 0.25)',

  dockBg: 'rgba(255, 255, 255, 0.94)',
  headerBg: '#FFFFFF',
  statusBarStyle: 'dark-content',
  statusBarBg: '#FFFFFF',
  modalBackdrop: 'rgba(15, 23, 42, 0.50)',
  qrFg: '#0F172A',
  qrBg: '#FFFFFF',

  shadowSm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  shadowMd: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  shadowLg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },

  radiusXs: 6,
  radiusSm: 10,
  radius: 16,
  radiusLg: 20,
  radiusXl: 26,
  radiusFull: 9999,
}

// ─── Desktop-Replicated OLED Dark Tech Slate Tokens ─────────────────────────
export const darkTheme: ThemeTokens = {
  isDark: true,
  bg: '#0B0F17',          // Deep Slate Canvas
  bgDeep: '#070A10',      // Ultra deep slate
  bgCard: '#111827',      // Deep charcoal plate
  bgCardHover: '#161F30',
  bgElevated: '#1E293B',  // Slate 800 secondary container
  bgInput: '#111827',
  bgInputFocus: '#1E2238',
  bgGlass: 'rgba(17, 24, 39, 0.75)',
  bgGlassHeavy: 'rgba(17, 24, 39, 0.92)',
  bgGlassLight: 'rgba(17, 24, 39, 0.65)',

  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.05)',
  borderFocus: 'rgba(99, 102, 241, 0.50)',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  cardBorderHover: 'rgba(99, 102, 241, 0.35)',
  hairline: 'rgba(255, 255, 255, 0.08)',

  primary: '#6366F1',         // Electric Indigo (Desktop flagship)
  primaryHover: '#4F46E5',
  primaryGlow: 'rgba(99, 102, 241, 0.30)',
  primarySoft: 'rgba(99, 102, 241, 0.16)',

  accent: '#06B6D4',          // Cyber Cyan 500 (Brand dark accent)
  accentHover: '#0891B2',
  accentGlow: 'rgba(6, 182, 212, 0.25)',
  accentSoft: 'rgba(6, 182, 212, 0.15)',

  purple: '#A855F7',          // Purple 500
  purpleGlow: 'rgba(168, 85, 247, 0.25)',
  purpleSoft: 'rgba(168, 85, 247, 0.15)',

  text: '#F8FAFC',            // Slate 50
  textSecondary: '#94A3B8',   // Slate 400
  muted: '#64748B',           // Slate 500
  subtle: '#475569',          // Slate 600

  success: '#34D399',         // Emerald 400
  successGlow: 'rgba(52, 211, 153, 0.25)',
  successBg: 'rgba(16, 185, 129, 0.15)',
  successBorder: 'rgba(52, 211, 153, 0.30)',

  warning: '#F59E0B',         // Amber 500
  warn: '#F59E0B',
  warningGlow: 'rgba(245, 158, 11, 0.25)',
  warningBg: 'rgba(245, 158, 11, 0.15)',
  warningBorder: 'rgba(245, 158, 11, 0.30)',

  danger: '#F87171',          // Rose 400
  dangerGlow: 'rgba(248, 113, 113, 0.25)',
  dangerBg: 'rgba(239, 68, 68, 0.15)',
  dangerSoft: 'rgba(239, 68, 68, 0.15)',
  dangerBorder: 'rgba(248, 113, 113, 0.30)',

  dockBg: 'rgba(17, 24, 39, 0.94)',
  headerBg: '#111827',
  statusBarStyle: 'light-content',
  statusBarBg: '#111827',
  modalBackdrop: 'rgba(0, 0, 0, 0.72)',
  qrFg: '#0F172A',
  qrBg: '#FFFFFF',

  shadowSm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  shadowMd: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  shadowLg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },

  radiusXs: 6,
  radiusSm: 10,
  radius: 16,
  radiusLg: 20,
  radiusXl: 26,
  radiusFull: 9999,
}

export type ThemeMode = 'dark' | 'light' | 'system'

export interface ThemeContextValue {
  theme: ThemeTokens
  themeMode: ThemeMode
  isDark: boolean
  setThemeMode: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const THEME_FILE_PATH = `${RNFS.DocumentDirectoryPath}/.meshdrop_theme`

const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  themeMode: 'dark',
  isDark: true,
  setThemeMode: () => {},
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark')
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme())

  // Load persisted theme preference on mount
  useEffect(() => {
    let active = true
    RNFS.readFile(THEME_FILE_PATH, 'utf8')
      .then((saved) => {
        if (!active) return
        const val = saved.trim() as ThemeMode
        if (val === 'light' || val === 'dark' || val === 'system') {
          setThemeModeState(val)
        }
      })
      .catch(() => {})

    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme)
    })

    return () => {
      active = false
      sub.remove()
    }
  }, [])

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode)
    RNFS.writeFile(THEME_FILE_PATH, mode, 'utf8').catch(() => {})
  }, [])

  const isDark = useMemo(() => {
    if (themeMode === 'system') {
      return systemScheme !== 'light'
    }
    return themeMode === 'dark'
  }, [themeMode, systemScheme])

  const toggleTheme = useCallback(() => {
    setThemeMode(isDark ? 'light' : 'dark')
  }, [isDark, setThemeMode])

  const currentTheme = useMemo(() => {
    return isDark ? darkTheme : lightTheme
  }, [isDark])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: currentTheme,
      themeMode,
      isDark,
      setThemeMode,
      toggleTheme,
    }),
    [currentTheme, themeMode, isDark, setThemeMode, toggleTheme]
  )

  return React.createElement(ThemeContext.Provider, { value }, children)
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

// Fallback constant theme export for compatibility
export const theme = darkTheme

export const fonts = {
  mono: 'monospace',
  sans: 'System',
}

