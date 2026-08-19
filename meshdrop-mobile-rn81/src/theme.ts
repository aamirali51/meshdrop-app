// MeshDrop Mobile — Pristine Light Design System Tokens
// Inspired by Desktop Elite Slate & Tailored for Mobile Ergonomics
export const theme = {
  // Pristine Light Surfaces
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

  // Crisp Hairlines & Subtle Borders
  border: 'rgba(15, 23, 42, 0.08)',
  borderLight: 'rgba(15, 23, 42, 0.05)',
  borderFocus: 'rgba(79, 70, 229, 0.40)',
  cardBorder: 'rgba(15, 23, 42, 0.07)',
  cardBorderHover: 'rgba(79, 70, 229, 0.25)',
  hairline: 'rgba(15, 23, 42, 0.06)',

  // Signature Electric Indigo / Violet (Brand Accent)
  primary: '#4F46E5',         // Indigo 600 (High-contrast on light)
  primaryHover: '#4338CA',
  primaryGlow: 'rgba(79, 70, 229, 0.18)',
  primarySoft: '#EEF2FF',     // Indigo 50

  // Cyber Cyan Accent
  accent: '#0891B2',          // Cyan 600 (Deep, readable on light)
  accentHover: '#0E7490',
  accentGlow: 'rgba(8, 145, 178, 0.16)',
  accentSoft: '#ECFEFF',      // Cyan 50

  // Ultraviolet Accent
  purple: '#9333EA',          // Purple 600
  purpleGlow: 'rgba(147, 51, 234, 0.16)',
  purpleSoft: '#FAF5FF',      // Purple 50

  // Deep Slate & Charcoal Typography
  text: '#0F172A',            // Slate 900
  textSecondary: '#475569',   // Slate 600
  muted: '#64748B',           // Slate 500
  subtle: '#94A3B8',          // Slate 400

  // Status & Telemetry Indicators (Readable on Light)
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

  // Soft Mobile Shadow Tokens
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

  // Geometry & Radii
  radiusXs: 6,
  radiusSm: 10,
  radius: 16,
  radiusLg: 20,
  radiusXl: 26,
  radiusFull: 9999,
}

export const fonts = {
  mono: 'monospace',
  sans: 'System',
}
