import { Platform } from 'react-native';

/**
 * Liquid Glass + Water Theme Design Tokens
 * 
 * Strict Rule: Keeps existing Merchant Crimson & Amber (#ea580c, #dc2626),
 * Dark Slate (#0f172a / #1e293b), Status Greens (#16a34a, #10b981) and Blues (#2563eb, #3b82f6).
 * Adds translucent glass/water tints on top.
 */

export const glassTheme = {
  // Translucent surfaces
  surfaceLight: 'rgba(255, 255, 255, 0.72)',
  surfaceLightTranslucent: 'rgba(255, 255, 255, 0.30)',
  surfaceCard: 'rgba(255, 255, 255, 0.82)',
  surfaceDark: 'rgba(15, 23, 42, 0.65)',
  surfaceDarkElevated: 'rgba(30, 41, 59, 0.75)',

  // 1px Translucent Borders
  borderLight: 'rgba(255, 255, 255, 0.65)',
  borderSubtle: 'rgba(255, 255, 255, 0.40)',
  borderDark: 'rgba(255, 255, 255, 0.18)',
  borderAmber: 'rgba(234, 88, 12, 0.40)',
  borderGreen: 'rgba(22, 163, 74, 0.40)',
  borderBlue: 'rgba(37, 99, 235, 0.40)',

  // Liquid Water Sheen Highlights (for expo-linear-gradient)
  sheenLight: ['rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.05)'],
  sheenDark: ['rgba(255, 255, 255, 0.22)', 'rgba(255, 255, 255, 0.02)'],
  sheenAmber: ['rgba(234, 88, 12, 0.25)', 'rgba(217, 119, 6, 0.05)'],
  sheenGreen: ['rgba(22, 163, 74, 0.25)', 'rgba(16, 185, 129, 0.05)'],
  sheenBlue: ['rgba(37, 99, 235, 0.25)', 'rgba(59, 130, 246, 0.05)'],

  // Glass Pills & Tints
  tintAmber: 'rgba(234, 88, 12, 0.12)',
  tintGreen: 'rgba(22, 163, 74, 0.12)',
  tintBlue: 'rgba(37, 99, 235, 0.12)',
  tintRed: 'rgba(220, 38, 38, 0.12)',
  tintSlate: 'rgba(15, 23, 42, 0.08)',

  // Soft Glass Shadows
  shadow: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3
  },
  shadowGlowAmber: {
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6
  },
  shadowGlowGreen: {
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6
  },
  shadowGlowBlue: {
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6
  },

  // Corner Radii
  radii: {
    sm: 12,
    md: 18,
    lg: 22,
    xl: 26,
    full: 9999
  },

  // Blur Intensity
  blurIntensity: 45
};
