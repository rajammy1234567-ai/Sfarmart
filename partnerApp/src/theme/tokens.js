import { Platform } from 'react-native';

export const colors = {
  // S-farmart Brand Green (derived from official logo)
  primary: '#16a34a',
  primaryDark: '#15803d',
  primaryLight: '#dcfce7',
  primaryPale: 'rgba(22, 163, 74, 0.12)',

  // S-farmart Brand Orange (secondary highlight from logo)
  secondary: '#ea580c',
  secondaryDark: '#c2410c',
  secondaryLight: '#ffedd5',
  secondaryPale: 'rgba(234, 88, 12, 0.12)',

  // Warm Amber / Accent
  accent: '#f59e0b',
  accentLight: '#fef3c7',

  // Surfaces & Backgrounds
  background: '#f8fafc',
  card: '#ffffff',
  surfaceSubtle: '#f1f5f9',

  // Typography
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',

  // Borders
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  borderDark: '#cbd5e1',

  // Semantic Status
  error: '#ef4444',
  errorLight: '#fee2e2',
  errorDark: '#b91c1c',
  success: '#16a34a',
  successLight: '#dcfce7',
  successDark: '#15803d',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  warningDark: '#b45309',
  info: '#0284c7',
  infoLight: '#e0f2fe',
  infoDark: '#0369a1'
};

export const tokens = {
  colors,
  typography: {
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
      web: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }),
    sizes: {
      xs: 11,
      sm: 12,
      md: 14,
      base: 16,
      lg: 18,
      xl: 20,
      xxl: 24
    },
    weights: {
      regular: '400',
      medium: '500',
      semiBold: '600',
      bold: '700',
      heavy: '800'
    }
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32
  },
  radii: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 24,
    full: 9999
  },
  shadows: {
    card: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2
    },
    dock: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 6
    }
  },
  touchTarget: {
    minHeight: 44,
    minWidth: 44
  }
};

