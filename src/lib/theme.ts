import { Platform } from 'react-native';

export const colors = {
  primary: '#2563eb',
  primarySoft: '#dbeafe',
  success: '#047857', // emerald-700: ≥4.5:1 on white for text
  successBright: '#10b981',
  successSoft: '#d1fae5',
  error: '#dc2626', // red-600: ≥4.5:1 on white for text
  errorBright: '#ef4444',
  errorSoft: '#fee2e2',
  warning: '#b45309',
  warningBright: '#f59e0b',
  warningSoft: '#fef3c7',
  background: '#f2f4f7',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  border: '#e5e7eb',
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

/** Categorical palette for charts (sector slices etc.). */
export const chartPalette = [
  '#2563eb',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#64748b',
];

export const radius = { sm: 10, md: 16, lg: 20, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const shadow = Platform.select({
  ios: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 2 },
  default: { boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)' },
});

export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textSecondary },
  caption: { fontSize: 12, color: colors.textMuted },
  value: { fontSize: 22, fontWeight: '700' as const, color: colors.text, fontVariant: ['tabular-nums' as const] },
};
