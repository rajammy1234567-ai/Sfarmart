import { Platform } from 'react-native';
import { colors } from './colors';

/**
 * Unified Card & Surface Theme Tokens
 *
 * Provides crisp white cards on neutral slate background (#f8fafc),
 * subtle borders (#e2e8f0), readable dark text, and accessible brand green/orange accents.
 */

export const glassTheme = {
  // Clean Crisp Card Surfaces
  surfaceLight: '#ffffff',
  surfaceLightTranslucent: 'rgba(255, 255, 255, 0.95)',
  surfaceCard: '#ffffff',
  surfaceDark: '#0f172a',
  surfaceDarkElevated: '#1e293b',

  // Subtle Borders
  borderLight: '#e2e8f0',
  borderSubtle: '#f1f5f9',
  borderDark: '#334155',
  borderAmber: 'rgba(234, 88, 12, 0.25)',
  borderGreen: 'rgba(22, 163, 74, 0.25)',
  borderBlue: 'rgba(2, 132, 199, 0.25)',

  // Clean Sheens (subtle white gradient)
  sheenLight: ['rgba(255, 255, 255, 0.6)', 'rgba(255, 255, 255, 0.0)'],
  sheenDark: ['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.0)'],
  sheenAmber: ['rgba(254, 243, 199, 0.4)', 'rgba(254, 243, 199, 0.0)'],
  sheenGreen: ['rgba(220, 252, 231, 0.4)', 'rgba(220, 252, 231, 0.0)'],
  sheenBlue: ['rgba(224, 242, 254, 0.4)', 'rgba(224, 242, 254, 0.0)'],

  // Subtle Tints
  tintAmber: 'rgba(234, 88, 12, 0.08)',
  tintGreen: 'rgba(22, 163, 74, 0.08)',
  tintBlue: 'rgba(2, 132, 199, 0.08)',
  tintRed: 'rgba(239, 68, 68, 0.08)',
  tintSlate: 'rgba(15, 23, 42, 0.04)',

  // Clean, Subtle Shadows
  shadow: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  shadowGlowAmber: {
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3
  },
  shadowGlowGreen: {
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3
  },
  shadowGlowBlue: {
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3
  },

  // Corner Radii
  radii: {
    sm: 10,
    md: 14,
    lg: 16,
    xl: 20,
    pill: 24,
    full: 9999
  },

  blurIntensity: 20
};
